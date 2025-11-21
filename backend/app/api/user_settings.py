"""
User settings API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional
from app.core.database import get_db
from app.models.user import User
from app.core.auth import get_current_user_dependency, get_current_organization_dependency
from app.services.feature import get_effective_features
from app.services.organization import get_user_organizations
from passlib.context import CryptContext
import bcrypt

router = APIRouter()

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    """Hash password using bcrypt."""
    password_bytes = password.encode('utf-8')
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode('utf-8')


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UpdatePreferencesRequest(BaseModel):
    theme: Optional[str] = None  # 'light', 'dark', 'system'
    language: Optional[str] = None  # 'ru', 'en'
    timezone: Optional[str] = None
    notifications_enabled: Optional[bool] = None


class UpdateApiKeysRequest(BaseModel):
    openrouter_api_key: Optional[str] = None


class UserSettingsResponse(BaseModel):
    profile: dict
    preferences: dict
    api_keys: dict
    organizations: list[dict]
    
    class Config:
        from_attributes = True


def verify_password(password: str, hashed: str) -> bool:
    """Verify password against hash."""
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


@router.get("/features", response_model=dict)
async def get_effective_features_endpoint(
    current_user: User = Depends(get_current_user_dependency),
    current_organization = Depends(get_current_organization_dependency),
    db: Session = Depends(get_db)
):
    """Get effective features for current user in current organization context."""
    effective_features = get_effective_features(db, current_user.id, current_organization.id)
    return effective_features


@router.get("", response_model=UserSettingsResponse)
async def get_user_settings(
    current_user: User = Depends(get_current_user_dependency),
    db: Session = Depends(get_db)
):
    """Get current user's settings."""
    # Get user's organizations
    organizations = get_user_organizations(db, current_user.id)
    orgs_data = []
    for org in organizations:
        # Get user's role in this organization
        from app.models.organization import OrganizationMember
        member = db.query(OrganizationMember).filter(
            OrganizationMember.organization_id == org.id,
            OrganizationMember.user_id == current_user.id
        ).first()
        
        orgs_data.append({
            "id": org.id,
            "name": org.name,
            "slug": org.slug,
            "is_personal": org.is_personal,
            "role": member.role if member else None
        })
    
    # Get preferences (stored as JSON in user model or separate table)
    # For MVP, we'll use simple defaults
    preferences = {
        "theme": "system",
        "language": "ru",
        "timezone": "UTC",
        "notifications_enabled": True
    }
    
    # Get API keys (for MVP, we'll use AppSettings with user_id filter)
    # For now, return empty
    api_keys = {
        "openrouter_api_key": None
    }
    
    return UserSettingsResponse(
        profile={
            "id": current_user.id,
            "email": current_user.email,
            "full_name": current_user.full_name,
            "role": current_user.role,
            "is_active": current_user.is_active,
            "created_at": current_user.created_at.isoformat() if current_user.created_at else None
        },
        preferences=preferences,
        api_keys=api_keys,
        organizations=orgs_data
    )


@router.put("/profile", response_model=dict)
async def update_profile(
    request: UpdateProfileRequest,
    current_user: User = Depends(get_current_user_dependency),
    db: Session = Depends(get_db)
):
    """Update user profile."""
    updated = False
    
    if request.full_name is not None:
        current_user.full_name = request.full_name
        updated = True
    
    if request.email is not None and request.email != current_user.email:
        # Check if email is already taken
        existing_user = db.query(User).filter(
            User.email == request.email,
            User.id != current_user.id
        ).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already in use"
            )
        current_user.email = request.email
        updated = True
    
    if updated:
        db.commit()
        db.refresh(current_user)
    
    return {
        "success": True,
        "message": "Profile updated",
        "user": {
            "id": current_user.id,
            "email": current_user.email,
            "full_name": current_user.full_name
        }
    }


@router.put("/password", response_model=dict)
async def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_user_dependency),
    db: Session = Depends(get_db)
):
    """Change user password."""
    # Verify current password
    if not verify_password(request.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    
    # Validate new password
    if len(request.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters long"
        )
    
    # Update password
    current_user.hashed_password = hash_password(request.new_password)
    db.commit()
    
    return {
        "success": True,
        "message": "Password changed successfully"
    }


@router.put("/preferences", response_model=dict)
async def update_preferences(
    request: UpdatePreferencesRequest,
    current_user: User = Depends(get_current_user_dependency),
    db: Session = Depends(get_db)
):
    """Update user preferences."""
    # For MVP, we'll store preferences in a simple way
    # In the future, this could be a separate user_preferences table
    # For now, we'll just return success
    # TODO: Implement preferences storage
    
    return {
        "success": True,
        "message": "Preferences updated",
        "preferences": {
            "theme": request.theme,
            "language": request.language,
            "timezone": request.timezone,
            "notifications_enabled": request.notifications_enabled
        }
    }


@router.put("/api-keys", response_model=dict)
async def update_api_keys(
    request: UpdateApiKeysRequest,
    current_user: User = Depends(get_current_user_dependency),
    db: Session = Depends(get_db)
):
    """Update user API keys."""
    # For MVP, store in AppSettings with user_id context
    # For now, we'll use a simple approach: store in AppSettings with key like "user_{user_id}_openrouter_api_key"
    from app.models.settings import AppSettings
    
    if request.openrouter_api_key is not None:
        setting_key = f"user_{current_user.id}_openrouter_api_key"
        setting = db.query(AppSettings).filter(AppSettings.key == setting_key).first()
        if not setting:
            setting = AppSettings(
                key=setting_key,
                is_secret=True,
                description=f"OpenRouter API key for user {current_user.email}"
            )
            db.add(setting)
        setting.value = request.openrouter_api_key
        db.commit()
    
    return {
        "success": True,
        "message": "API keys updated"
    }

