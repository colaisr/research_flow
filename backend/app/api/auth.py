"""
Authentication endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Response, Cookie
from fastapi.security import HTTPBearer
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
import bcrypt
from app.core.database import get_db
from app.models.user import User
from app.models.platform_settings import PlatformSettings
from app.core.auth import create_session, delete_session, get_current_user_dependency, get_current_admin_user_dependency
from app.services.organization import get_user_personal_organization
from app.services.organization import create_personal_organization
from app.services.feature import FEATURES, set_user_feature
from app.services.email import send_verification_email
from datetime import datetime, timedelta
import secrets
from app.core.config import EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS

router = APIRouter()
security = HTTPBearer()

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    """Hash password using bcrypt."""
    password_bytes = password.encode('utf-8')
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    """Verify password against hash."""
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None


class VerifyEmailRequest(BaseModel):
    token: str


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str | None
    is_admin: bool  # Deprecated, use role instead
    role: str
    created_at: datetime
    is_impersonated: bool = False
    impersonated_by: Optional[int] = None
    impersonated_by_email: Optional[str] = None
    
    class Config:
        from_attributes = True


@router.post("/login", response_model=dict)
async def login(
    request: LoginRequest,
    response: Response,
    db: Session = Depends(get_db)
):
    """Login with email and password."""
    # Find user
    user = db.query(User).filter(User.email == request.email).first()
    
    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    
    # Check if email is verified
    if not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email address not verified. Please check your email and click the verification link."
        )
    
    # Create session
    # Get user's personal organization for default context
    # If it doesn't exist (for existing users), create it
    personal_org = get_user_personal_organization(db, user.id)
    if not personal_org:
        # Create personal organization for existing user
        try:
            personal_org = create_personal_organization(db, user.id, user.full_name, user.email)
        except Exception as e:
            # Log error but don't fail login
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to create personal organization for user {user.id}: {e}")
            personal_org = None
    
    organization_id = personal_org.id if personal_org else None
    
    session_token = create_session(user.id, user.email, user.is_admin, user.role, organization_id)
    
    # Set cookie
    response.set_cookie(
        key="researchflow_session",
        value=session_token,
        httponly=True,
        secure=False,  # Set to True in production with HTTPS
        samesite="lax",
        max_age=86400,  # 24 hours
        path="/",  # Ensure cookie is available for all paths
    )
    
    return {
        "success": True,
        "user": UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            is_admin=user.is_admin,
            role=user.role,
            created_at=user.created_at
        )
    }


@router.post("/logout", response_model=dict)
async def logout(
    response: Response,
    researchflow_session: Optional[str] = Cookie(None)
):
    """Logout and clear session."""
    if researchflow_session:
        delete_session(researchflow_session)
    
    response.delete_cookie(
        key="researchflow_session",
        httponly=True,
        samesite="lax"
    )
    
    return {"success": True, "message": "Logged out"}


@router.get("/me", response_model=UserResponse)
async def get_me(
    researchflow_session: Optional[str] = Cookie(None),
    current_user: User = Depends(get_current_user_dependency),
    db: Session = Depends(get_db)
):
    """Get current user info."""
    from app.core.auth import verify_session
    
    is_impersonated = False
    impersonated_by = None
    impersonated_by_email = None
    
    # Check if impersonating
    if researchflow_session:
        session_data = verify_session(researchflow_session)
        if session_data and session_data.get('is_impersonated') and session_data.get('impersonated_by'):
            is_impersonated = True
            impersonated_by = session_data.get('impersonated_by')
            admin_user = db.query(User).filter(User.id == impersonated_by).first()
            if admin_user:
                impersonated_by_email = admin_user.email
    
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        is_admin=current_user.is_admin,
        role=current_user.role,
        created_at=current_user.created_at,
        is_impersonated=is_impersonated,
        impersonated_by=impersonated_by,
        impersonated_by_email=impersonated_by_email
    )


@router.post("/register", response_model=UserResponse)
async def register(
    request: RegisterRequest,
    response: Response,
    db: Session = Depends(get_db)
):
    """Register a new user (public endpoint, can be disabled by admin)."""
    # Check if public registration is enabled
    registration_setting = db.query(PlatformSettings).filter(
        PlatformSettings.key == 'allow_public_registration'
    ).first()
    
    if registration_setting:
        allow_registration = registration_setting.value.lower() == 'true'
    else:
        # Default to True if setting doesn't exist
        allow_registration = True
    
    if not allow_registration:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public registration is currently disabled. Please contact an administrator."
        )
    
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists"
        )
    
    # Generate 3-digit verification code
    import random
    verification_code = f"{random.randint(100, 999)}"  # 3-digit code: 100-999
    code_expires = datetime.utcnow() + timedelta(hours=EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS)
    
    # Create new user with default role 'user' (platform-level)
    # User starts as unverified (email_verified=False)
    hashed_password = hash_password(request.password)
    new_user = User(
        email=request.email,
        hashed_password=hashed_password,
        full_name=request.full_name,
        is_active=True,
        is_admin=False,  # Deprecated, use role instead
        role='user',  # Default platform role (regular user)
        email_verified=False,
        email_verification_token=verification_code,
        email_verification_token_expires=code_expires
    )
    
    db.add(new_user)
    db.flush()  # Flush to get the user ID
    
    # Auto-create personal organization
    try:
        create_personal_organization(db, new_user.id, new_user.full_name, new_user.email)
    except Exception as e:
        # If org creation fails, rollback user creation
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create personal organization: {str(e)}"
        )
    
    # Enable all features for new user (until payment is implemented)
    try:
        for feature_name in FEATURES.keys():
            set_user_feature(db, new_user.id, feature_name, True)
    except Exception as e:
        # Log error but don't fail registration
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Failed to enable features for user {new_user.id}: {e}")
    
    db.commit()
    db.refresh(new_user)
    
    # Send verification email (don't fail registration if email fails)
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        email_sent = send_verification_email(
            email=new_user.email,
            token=verification_code,
            user_name=new_user.full_name
        )
        if not email_sent:
            logger.warning(f"Failed to send verification email to {new_user.email}, but user was created")
    except Exception as e:
        logger.error(f"Error sending verification email to {new_user.email}: {str(e)}", exc_info=True)
    
    # Don't auto-login after registration - user must verify email first
    # Return success response indicating email verification is required
    return UserResponse(
        id=new_user.id,
        email=new_user.email,
        full_name=new_user.full_name,
        is_admin=new_user.is_admin,
        role=new_user.role,
        created_at=new_user.created_at
    )


@router.post("/verify-email", response_model=dict)
async def verify_email(
    request: VerifyEmailRequest,
    response: Response,
    db: Session = Depends(get_db)
):
    """Verify user's email address using 3-digit verification code."""
    return await _verify_email_token(request.token, response, db)


async def _verify_email_token(
    token: str,
    response: Response,
    db: Session
) -> dict:
    """Internal function to verify email token."""
    # Find user by verification token
    user = db.query(User).filter(
        User.email_verification_token == token
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification token"
        )
    
    # Check if token has expired
    if user.email_verification_token_expires and user.email_verification_token_expires < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification token has expired. Please request a new verification email."
        )
    
    # Check if already verified
    if user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address is already verified"
        )
    
    # Verify email
    user.email_verified = True
    user.email_verification_token = None
    user.email_verification_token_expires = None
    
    db.commit()
    db.refresh(user)
    
    # Auto-login after verification
    # Get the personal organization
    personal_org = get_user_personal_organization(db, user.id)
    organization_id = personal_org.id if personal_org else None
    
    session_token = create_session(user.id, user.email, user.is_admin, user.role, organization_id)
    response.set_cookie(
        key="researchflow_session",
        value=session_token,
        httponly=True,
        secure=False,  # Set to True in production with HTTPS
        samesite="lax",
        max_age=86400,  # 24 hours
        path="/",
    )
    
    return {
        "success": True,
        "message": "Email verified successfully",
        "user": UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            is_admin=user.is_admin,
            role=user.role,
            created_at=user.created_at
        )
    }


class ResendVerificationRequest(BaseModel):
    email: EmailStr


@router.post("/resend-verification", response_model=dict)
async def resend_verification_email(
    request: ResendVerificationRequest,
    db: Session = Depends(get_db)
):
    """Resend verification email to user."""
    # Find user by email
    user = db.query(User).filter(User.email == request.email).first()
    
    if not user:
        # Don't reveal if user exists or not (security best practice)
        return {
            "success": True,
            "message": "If the email address exists and is not verified, a verification email has been sent."
        }
    
    # Check if already verified
    if user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address is already verified"
        )
    
    # Generate new 3-digit verification code
    import random
    verification_code = f"{random.randint(100, 999)}"  # 3-digit code: 100-999
    code_expires = datetime.utcnow() + timedelta(hours=EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS)
    
    user.email_verification_token = verification_code
    user.email_verification_token_expires = code_expires
    
    db.commit()
    db.refresh(user)
    
    # Send verification email
    import logging
    logger = logging.getLogger(__name__)
    try:
        email_sent = send_verification_email(
            email=user.email,
            token=verification_code,
            user_name=user.full_name
        )
        if not email_sent:
            logger.warning(f"Failed to send verification email to {user.email}")
    except Exception as e:
        logger.error(f"Error sending verification email to {user.email}: {str(e)}")
    
    return {
        "success": True,
        "message": "If the email address exists and is not verified, a verification email has been sent."
    }
