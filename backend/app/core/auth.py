"""
Authentication utilities and dependencies.
"""
from fastapi import Depends, HTTPException, status, Cookie
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.models.user import User
from app.core.config import SESSION_SECRET
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

# Simple session storage (in-memory for MVP, can move to Redis/DB later)
_sessions: dict[str, dict] = {}

# Export _sessions for impersonation
__all__ = ['create_session', 'verify_session', 'delete_session', 'get_current_user_dependency', 'get_current_user_optional', 'get_current_admin_user_dependency', 'get_current_admin_user_optional', 'get_current_organization_dependency', 'require_feature', '_sessions']


def create_session(user_id: int, email: str, is_admin: bool, role: str = 'user', organization_id: Optional[int] = None) -> str:
    """Create a session token."""
    session_data = {
        'user_id': user_id,
        'email': email,
        'is_admin': is_admin,  # Keep for backward compatibility
        'role': role,
        'organization_id': organization_id,  # Current organization context
        'created_at': datetime.now(timezone.utc).isoformat(),
    }
    
    # Create signed session token
    session_json = json.dumps(session_data, sort_keys=True)
    signature = hmac.new(
        SESSION_SECRET.encode() if SESSION_SECRET else b'default-secret-change-in-prod',
        session_json.encode(),
        hashlib.sha256
    ).hexdigest()
    
    session_token = f"{session_json}.{signature}"
    _sessions[session_token] = session_data
    
    return session_token


def verify_session(session_token: str) -> Optional[dict]:
    """Verify and get session data."""
    if not session_token:
        return None
    
    # Check in-memory cache first
    if session_token in _sessions:
        return _sessions[session_token]
    
    # Verify signature
    try:
        parts = session_token.rsplit('.', 1)
        if len(parts) != 2:
            return None
        
        session_json, signature = parts
        expected_signature = hmac.new(
            SESSION_SECRET.encode() if SESSION_SECRET else b'default-secret-change-in-prod',
            session_json.encode(),
            hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(signature, expected_signature):
            return None
        
        session_data = json.loads(session_json)
        
        # Check expiration (24 hours)
        created_at = datetime.fromisoformat(session_data['created_at'])
        if datetime.now(timezone.utc) - created_at.replace(tzinfo=timezone.utc) > timedelta(hours=24):
            return None
        
        # Ensure organization_id exists in session data (for backward compatibility)
        if 'organization_id' not in session_data:
            session_data['organization_id'] = None
        
        # Cache it
        _sessions[session_token] = session_data
        return session_data
    except Exception:
        return None


def delete_session(session_token: str):
    """Delete a session."""
    if session_token in _sessions:
        del _sessions[session_token]


def get_current_user_dependency(
    researchflow_session: Optional[str] = Cookie(None),
    db: Session = Depends(get_db)
) -> User:
    """Dependency to get current authenticated user."""
    if not researchflow_session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    
    session_data = verify_session(researchflow_session)
    if not session_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session"
        )
    
    user = db.query(User).filter(User.id == session_data['user_id']).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )
    
    # Attach impersonation info to user object if present
    if session_data.get('is_impersonated') and session_data.get('impersonated_by'):
        user._impersonated_by = session_data.get('impersonated_by')
        user._is_impersonated = True
    
    return user


def get_current_admin_user_dependency(
    current_user: User = Depends(get_current_user_dependency)
) -> User:
    """Dependency to get current platform admin user."""
    if not current_user.is_platform_admin():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


def get_current_user_optional(
    researchflow_session: Optional[str] = Cookie(None),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """Optional dependency to get current user (returns None if not authenticated)."""
    try:
        return get_current_user_dependency(researchflow_session=researchflow_session, db=db)
    except HTTPException:
        return None


def get_current_admin_user_optional(
    researchflow_session: Optional[str] = Cookie(None),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """Optional dependency to get current admin user (returns None if not admin or not authenticated)."""
    try:
        current_user = get_current_user_dependency(researchflow_session=researchflow_session, db=db)
        if current_user.is_platform_admin():
            return current_user
        return None
    except HTTPException:
        return None


def require_feature(feature_name: str):
    """
    Dependency factory to require a specific feature.
    Usage: Depends(require_feature('rag'))
    Checks BOTH user features AND organization features (intersection).
    """
    def feature_checker(
        current_user: User = Depends(get_current_user_dependency),
        current_organization = Depends(get_current_organization_dependency),
        db: Session = Depends(get_db)
    ) -> User:
        from app.services.feature import has_feature
        
        if not has_feature(db, current_user.id, current_organization.id, feature_name):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Feature '{feature_name}' is not enabled for your account in this organization. Please contact an administrator."
            )
        return current_user
    
    return feature_checker


def get_current_organization_dependency(
    researchflow_session: Optional[str] = Cookie(None),
    current_user: User = Depends(get_current_user_dependency),
    db: Session = Depends(get_db)
):
    """Dependency to get current organization context."""
    from app.models.organization import Organization, OrganizationMember
    from app.services.organization import get_user_personal_organization
    
    # Get organization_id from session
    session_data = verify_session(researchflow_session) if researchflow_session else None
    organization_id = None
    
    if session_data and 'organization_id' in session_data:
        organization_id = session_data.get('organization_id')
    
    # If no organization_id in session, default to personal org
    if not organization_id:
        personal_org = get_user_personal_organization(db, current_user.id)
        if not personal_org:
            # Create personal organization if it doesn't exist (for existing users)
            from app.services.organization import create_personal_organization
            try:
                personal_org = create_personal_organization(db, current_user.id, current_user.full_name, current_user.email)
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to create personal organization for user {current_user.id}: {e}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Personal organization not found and could not be created"
                )
        organization_id = personal_org.id
    
    # Get organization
    organization = db.query(Organization).filter(Organization.id == organization_id).first()
    if not organization:
        # Fallback to personal org
        personal_org = get_user_personal_organization(db, current_user.id)
        if not personal_org:
            # Create personal organization if it doesn't exist
            from app.services.organization import create_personal_organization
            try:
                personal_org = create_personal_organization(db, current_user.id, current_user.full_name, current_user.email)
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to create personal organization for user {current_user.id}: {e}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Personal organization not found and could not be created"
                )
        organization = personal_org
        organization_id = organization.id
    
    # Verify user is a member of this organization
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == organization.id,
        OrganizationMember.user_id == current_user.id
    ).first()
    
    if not member:
        # Fallback to personal org and ensure membership
        personal_org = get_user_personal_organization(db, current_user.id)
        if not personal_org:
            # Create personal organization if it doesn't exist
            from app.services.organization import create_personal_organization
            try:
                personal_org = create_personal_organization(db, current_user.id, current_user.full_name, current_user.email)
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to create personal organization for user {current_user.id}: {e}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Personal organization not found and could not be created"
                )
        organization = personal_org
    
    return organization


def get_current_org_admin_dependency(
    current_user: User = Depends(get_current_user_dependency),
    current_organization = Depends(get_current_organization_dependency),
    db: Session = Depends(get_db)
) -> User:
    """Dependency to get current org admin user (platform admin or org admin in current organization)."""
    if not current_user.is_org_admin(db, current_organization.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization admin access required"
        )
    return current_user

