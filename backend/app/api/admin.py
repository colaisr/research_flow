"""
Admin settings API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Dict, List
from datetime import datetime
from app.core.database import get_db
from app.models.user import User
from app.models.platform_settings import PlatformSettings
from app.core.auth import get_current_admin_user_dependency
from app.services.feature import FEATURES, get_user_features, get_organization_features, get_effective_features, set_user_feature, set_organization_feature

router = APIRouter()


class PlatformConfigRequest(BaseModel):
    allow_public_registration: Optional[bool] = None
    default_user_role: Optional[str] = None  # 'admin' or 'org_admin'


class SystemLimitsRequest(BaseModel):
    max_pipelines_per_user: Optional[int] = None
    max_runs_per_day: Optional[int] = None
    max_runs_per_month: Optional[int] = None
    max_tokens_per_user: Optional[int] = None


class GlobalApiKeysRequest(BaseModel):
    openrouter_fallback_key: Optional[str] = None


class PlatformSettingsResponse(BaseModel):
    platform_config: Dict
    system_limits: Dict
    global_api_keys: Dict


def get_setting_value(db: Session, key: str, default=None):
    """Get platform setting value."""
    setting = db.query(PlatformSettings).filter(PlatformSettings.key == key).first()
    if setting:
        try:
            # Try to parse as JSON (boolean, number, etc.)
            import json
            return json.loads(setting.value)
        except:
            # Return as string if not JSON
            return setting.value
    return default


def set_setting_value(db: Session, key: str, value):
    """Set platform setting value."""
    import json
    setting = db.query(PlatformSettings).filter(PlatformSettings.key == key).first()
    
    if isinstance(value, bool):
        value_str = 'true' if value else 'false'
    elif isinstance(value, (int, float)):
        value_str = str(value)
    else:
        value_str = value
    
    if setting:
        setting.value = value_str
    else:
        setting = PlatformSettings(key=key, value=value_str)
        db.add(setting)
    
    db.commit()
    return setting


@router.get("/settings", response_model=PlatformSettingsResponse)
async def get_admin_settings(
    current_user: User = Depends(get_current_admin_user_dependency),
    db: Session = Depends(get_db)
):
    """Get platform settings (admin only)."""
    platform_config = {
        "allow_public_registration": get_setting_value(db, "allow_public_registration", True),
        "default_user_role": get_setting_value(db, "default_user_role", "org_admin"),
    }
    
    system_limits = {
        "max_pipelines_per_user": get_setting_value(db, "max_pipelines_per_user", None),
        "max_runs_per_day": get_setting_value(db, "max_runs_per_day", None),
        "max_runs_per_month": get_setting_value(db, "max_runs_per_month", None),
        "max_tokens_per_user": get_setting_value(db, "max_tokens_per_user", None),
    }
    
    # Get global API keys (from AppSettings)
    from app.models.settings import AppSettings
    openrouter_key = db.query(AppSettings).filter(AppSettings.key == "openrouter_api_key").first()
    
    global_api_keys = {
        "openrouter_fallback_key": openrouter_key.value if openrouter_key else None,
        "openrouter_fallback_key_masked": mask_secret(openrouter_key.value) if openrouter_key and openrouter_key.value else None,
    }
    
    return PlatformSettingsResponse(
        platform_config=platform_config,
        system_limits=system_limits,
        global_api_keys=global_api_keys
    )


@router.put("/settings/platform-config", response_model=dict)
async def update_platform_config(
    request: PlatformConfigRequest,
    current_user: User = Depends(get_current_admin_user_dependency),
    db: Session = Depends(get_db)
):
    """Update platform configuration (admin only)."""
    if request.allow_public_registration is not None:
        set_setting_value(db, "allow_public_registration", request.allow_public_registration)
    
    if request.default_user_role is not None:
        if request.default_user_role not in ('admin', 'org_admin'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="default_user_role must be 'admin' or 'org_admin'"
            )
        set_setting_value(db, "default_user_role", request.default_user_role)
    
    return {
        "success": True,
        "message": "Platform configuration updated"
    }


@router.put("/settings/system-limits", response_model=dict)
async def update_system_limits(
    request: SystemLimitsRequest,
    current_user: User = Depends(get_current_admin_user_dependency),
    db: Session = Depends(get_db)
):
    """Update system limits (admin only)."""
    if request.max_pipelines_per_user is not None:
        set_setting_value(db, "max_pipelines_per_user", request.max_pipelines_per_user)
    
    if request.max_runs_per_day is not None:
        set_setting_value(db, "max_runs_per_day", request.max_runs_per_day)
    
    if request.max_runs_per_month is not None:
        set_setting_value(db, "max_runs_per_month", request.max_runs_per_month)
    
    if request.max_tokens_per_user is not None:
        set_setting_value(db, "max_tokens_per_user", request.max_tokens_per_user)
    
    return {
        "success": True,
        "message": "System limits updated"
    }


@router.put("/settings/global-api-keys", response_model=dict)
async def update_global_api_keys(
    request: GlobalApiKeysRequest,
    current_user: User = Depends(get_current_admin_user_dependency),
    db: Session = Depends(get_db)
):
    """Update global API keys (admin only)."""
    from app.models.settings import AppSettings
    
    if request.openrouter_fallback_key is not None:
        setting = db.query(AppSettings).filter(AppSettings.key == "openrouter_api_key").first()
        if not setting:
            setting = AppSettings(
                key="openrouter_api_key",
                is_secret=True,
                description="Global OpenRouter API key (fallback if user doesn't have one)"
            )
            db.add(setting)
        setting.value = request.openrouter_fallback_key
        db.commit()
    
    return {
        "success": True,
        "message": "Global API keys updated"
    }


def mask_secret(value: str, visible_chars: int = 4) -> str:
    """Mask a secret value, showing only last few characters."""
    if not value or len(value) <= visible_chars:
        return "*" * len(value) if value else ""
    return "*" * (len(value) - visible_chars) + value[-visible_chars:]


# Feature Management Endpoints

class SetUserFeatureRequest(BaseModel):
    enabled: bool
    expires_at: Optional[datetime] = None


class SetOrganizationFeatureRequest(BaseModel):
    enabled: bool
    expires_at: Optional[datetime] = None


class UserFeatureResponse(BaseModel):
    feature_name: str
    enabled: bool
    expires_at: Optional[datetime]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


@router.get("/features", response_model=Dict[str, str])
async def list_features(
    current_user: User = Depends(get_current_admin_user_dependency)
):
    """List all available features."""
    return FEATURES


@router.get("/users/{user_id}/features", response_model=Dict[str, bool])
async def get_user_features_endpoint(
    user_id: int,
    current_user: User = Depends(get_current_admin_user_dependency),
    db: Session = Depends(get_db)
):
    """Get all features for a user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return get_user_features(db, user_id)


@router.put("/users/{user_id}/features/{feature_name}", response_model=UserFeatureResponse)
async def set_user_feature_endpoint(
    user_id: int,
    feature_name: str,
    request: SetUserFeatureRequest,
    current_user: User = Depends(get_current_admin_user_dependency),
    db: Session = Depends(get_db)
):
    """Set a feature for a user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if feature_name not in FEATURES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown feature: {feature_name}"
        )
    
    feature = set_user_feature(db, user_id, feature_name, request.enabled, request.expires_at)
    
    return UserFeatureResponse(
        feature_name=feature.feature_name,
        enabled=feature.enabled,
        expires_at=feature.expires_at,
        created_at=feature.created_at,
        updated_at=feature.updated_at
    )


@router.get("/organizations/{organization_id}/features", response_model=Dict[str, bool])
async def get_organization_features_endpoint(
    organization_id: int,
    current_user: User = Depends(get_current_admin_user_dependency),
    db: Session = Depends(get_db)
):
    """Get all features for an organization."""
    from app.models.organization import Organization
    
    organization = db.query(Organization).filter(Organization.id == organization_id).first()
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )
    
    return get_organization_features(db, organization_id)


@router.put("/organizations/{organization_id}/features/{feature_name}", response_model=dict)
async def set_organization_feature_endpoint(
    organization_id: int,
    feature_name: str,
    request: SetOrganizationFeatureRequest,
    current_user: User = Depends(get_current_admin_user_dependency),
    db: Session = Depends(get_db)
):
    """Set a feature for an organization (affects all members when they work in this org context)."""
    from app.models.organization import Organization
    
    organization = db.query(Organization).filter(Organization.id == organization_id).first()
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )
    
    if feature_name not in FEATURES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown feature: {feature_name}"
        )
    
    feature = set_organization_feature(db, organization_id, feature_name, request.enabled, request.expires_at)
    
    return {
        "success": True,
        "message": f"Feature '{feature_name}' set for organization '{organization.name}'",
        "feature": {
            "feature_name": feature.feature_name,
            "enabled": feature.enabled,
            "expires_at": feature.expires_at.isoformat() if feature.expires_at else None
        }
    }

