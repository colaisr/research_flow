"""
Admin settings API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Response, Cookie, Request, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from pydantic import BaseModel
from typing import Optional, Dict, List
from datetime import datetime, timedelta, timezone
from app.core.database import get_db
from app.models.user import User
from app.models.platform_settings import PlatformSettings
from app.core.auth import get_current_admin_user_dependency, create_session, verify_session, delete_session
from app.services.feature import FEATURES, get_user_features, get_organization_features, get_effective_features, set_user_feature, set_organization_feature
from app.services.organization import get_user_organizations
from app.models.organization import Organization
from app.models.audit_log import AuditLog

router = APIRouter()


class PlatformConfigRequest(BaseModel):
    allow_public_registration: Optional[bool] = None
    default_user_role: Optional[str] = None  # 'admin' or 'user' (platform-level only)


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
        "default_user_role": get_setting_value(db, "default_user_role", "user"),
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
        if request.default_user_role not in ('admin', 'user'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="default_user_role must be 'admin' or 'user'"
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

@router.get("/organizations", response_model=List[Dict])
async def list_all_organizations(
    current_user: User = Depends(get_current_admin_user_dependency),
    db: Session = Depends(get_db)
):
    """List all organizations (admin only)."""
    organizations = db.query(Organization).order_by(Organization.name).all()
    return [
        {
            "id": org.id,
            "name": org.name,
            "slug": org.slug,
            "is_personal": org.is_personal,
            "owner_id": org.owner_id,
            "created_at": org.created_at.isoformat() if org.created_at else None
        }
        for org in organizations
    ]


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
    """
    DEPRECATED: Organization features are now derived from owner's features.
    This endpoint sets the feature on the organization owner instead.
    Use /users/{owner_id}/features/{feature_name} instead.
    """
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


# User Management Endpoints

class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None  # 'admin' or 'user' (platform-level only)
    is_active: Optional[bool] = None


class UserListItemResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str]
    role: str
    is_active: bool
    personal_org_id: Optional[int]
    personal_org_name: Optional[str]
    other_orgs_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class UserStatisticsResponse(BaseModel):
    tokens_used_total: int
    tokens_used_this_month: int
    pipelines_created_total: int
    pipelines_active: int
    runs_executed_total: int
    runs_executed_this_month: int
    runs_succeeded: int
    runs_failed: int
    tools_created_total: int  # Placeholder for Phase 1
    tools_active: int  # Placeholder for Phase 1
    rags_created_total: int  # Placeholder for Phase 2
    rags_documents_total: int  # Placeholder for Phase 2
    organizations_count: int


class UserDetailsResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str]
    role: str
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]
    personal_organization: Optional[Dict]
    organizations: List[Dict]
    statistics: UserStatisticsResponse


@router.get("/users", response_model=List[UserListItemResponse])
async def list_users(
    role: Optional[str] = None,
    organization_id: Optional[int] = None,
    status: Optional[str] = None,  # 'active', 'inactive'
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    current_user: User = Depends(get_current_admin_user_dependency),
    db: Session = Depends(get_db)
):
    """List all users with filters (admin only)."""
    query = db.query(User)
    
    # Filters
    if role:
        query = query.filter(User.role == role)
    
    if status == 'active':
        query = query.filter(User.is_active == True)
    elif status == 'inactive':
        query = query.filter(User.is_active == False)
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                User.email.ilike(search_term),
                User.full_name.ilike(search_term)
            )
        )
    
    # Organization filter
    if organization_id:
        from app.models.organization import OrganizationMember
        user_ids = db.query(OrganizationMember.user_id).filter(
            OrganizationMember.organization_id == organization_id
        ).subquery()
        query = query.filter(User.id.in_(user_ids))
    
    # Get users
    users = query.order_by(User.created_at.desc()).offset(offset).limit(limit).all()
    
    result = []
    for user in users:
        # Get personal organization
        from app.models.organization import Organization
        personal_org = db.query(Organization).filter(
            Organization.owner_id == user.id,
            Organization.is_personal == True
        ).first()
        
        # Get other organizations count
        from app.models.organization import OrganizationMember
        other_orgs_count = db.query(OrganizationMember).filter(
            OrganizationMember.user_id == user.id
        ).count()
        if personal_org:
            other_orgs_count -= 1  # Exclude personal org
        
        result.append(UserListItemResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            is_active=user.is_active,
            personal_org_id=personal_org.id if personal_org else None,
            personal_org_name=personal_org.name if personal_org else None,
            other_orgs_count=max(0, other_orgs_count),
            created_at=user.created_at
        ))
    
    return result


@router.get("/users/{user_id}", response_model=UserDetailsResponse)
async def get_user_details(
    user_id: int,
    current_user: User = Depends(get_current_admin_user_dependency),
    db: Session = Depends(get_db)
):
    """Get user details with statistics (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Get user's organizations
    organizations = get_user_organizations(db, user_id)
    org_ids = [org.id for org in organizations]
    
    # Get personal organization
    from app.models.organization import Organization
    personal_org = db.query(Organization).filter(
        Organization.owner_id == user_id,
        Organization.is_personal == True
    ).first()
    
    # Get organization memberships
    from app.models.organization import OrganizationMember
    memberships = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == user_id
    ).all()
    
    orgs_data = []
    for membership in memberships:
        org = db.query(Organization).filter(Organization.id == membership.organization_id).first()
        if org:
            orgs_data.append({
                "id": org.id,
                "name": org.name,
                "slug": org.slug,
                "is_personal": org.is_personal,
                "role": membership.role,
                "joined_at": membership.joined_at.isoformat() if membership.joined_at else None
            })
    
    # Calculate statistics
    from app.models.analysis_run import AnalysisRun
    from app.models.analysis_type import AnalysisType
    from app.models.analysis_step import AnalysisStep
    
    # Tokens used (from analysis_steps)
    now = datetime.now(timezone.utc)
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    tokens_total = db.query(func.sum(AnalysisStep.tokens_used)).join(
        AnalysisRun, AnalysisStep.run_id == AnalysisRun.id
    ).filter(
        AnalysisRun.organization_id.in_(org_ids)
    ).scalar() or 0
    
    tokens_this_month = db.query(func.sum(AnalysisStep.tokens_used)).join(
        AnalysisRun, AnalysisStep.run_id == AnalysisRun.id
    ).filter(
        and_(
            AnalysisRun.organization_id.in_(org_ids),
            AnalysisRun.created_at >= start_of_month
        )
    ).scalar() or 0
    
    # Pipelines created
    pipelines_total = db.query(func.count(AnalysisType.id)).filter(
        AnalysisType.organization_id.in_(org_ids)
    ).scalar() or 0
    
    pipelines_active = db.query(func.count(AnalysisType.id)).filter(
        and_(
            AnalysisType.organization_id.in_(org_ids),
            AnalysisType.is_active == 1
        )
    ).scalar() or 0
    
    # Runs executed
    runs_total = db.query(func.count(AnalysisRun.id)).filter(
        AnalysisRun.organization_id.in_(org_ids)
    ).scalar() or 0
    
    runs_this_month = db.query(func.count(AnalysisRun.id)).filter(
        and_(
            AnalysisRun.organization_id.in_(org_ids),
            AnalysisRun.created_at >= start_of_month
        )
    ).scalar() or 0
    
    from app.models.analysis_run import RunStatus
    runs_succeeded = db.query(func.count(AnalysisRun.id)).filter(
        and_(
            AnalysisRun.organization_id.in_(org_ids),
            AnalysisRun.status == RunStatus.SUCCEEDED.value
        )
    ).scalar() or 0
    
    runs_failed = db.query(func.count(AnalysisRun.id)).filter(
        and_(
            AnalysisRun.organization_id.in_(org_ids),
            AnalysisRun.status.in_([RunStatus.FAILED.value, RunStatus.MODEL_FAILURE.value])
        )
    ).scalar() or 0
    
    # Tools and RAGs (placeholders for Phase 1/2)
    tools_created_total = 0
    tools_active = 0
    rags_created_total = 0
    rags_documents_total = 0
    
    statistics = UserStatisticsResponse(
        tokens_used_total=int(tokens_total),
        tokens_used_this_month=int(tokens_this_month),
        pipelines_created_total=int(pipelines_total),
        pipelines_active=int(pipelines_active),
        runs_executed_total=int(runs_total),
        runs_executed_this_month=int(runs_this_month),
        runs_succeeded=int(runs_succeeded),
        runs_failed=int(runs_failed),
        tools_created_total=tools_created_total,
        tools_active=tools_active,
        rags_created_total=rags_created_total,
        rags_documents_total=rags_documents_total,
        organizations_count=len(organizations)
    )
    
    return UserDetailsResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
        personal_organization={
            "id": personal_org.id,
            "name": personal_org.name,
            "slug": personal_org.slug,
            "is_personal": personal_org.is_personal
        } if personal_org else None,
        organizations=orgs_data,
        statistics=statistics
    )


class ActivityLogItem(BaseModel):
    type: str  # 'run' or 'pipeline'
    id: int
    name: str
    status: Optional[str] = None  # For runs: 'succeeded', 'failed', etc.
    created_at: datetime
    organization_name: Optional[str] = None


@router.get("/users/{user_id}/activity", response_model=List[ActivityLogItem])
async def get_user_activity(
    user_id: int,
    limit: int = 50,
    current_user: User = Depends(get_current_admin_user_dependency),
    db: Session = Depends(get_db)
):
    """Get user activity log (recent runs and pipeline creations)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Get user's organizations
    organizations = get_user_organizations(db, user_id)
    org_ids = [org.id for org in organizations]
    org_names = {org.id: org.name for org in organizations}
    
    activity = []
    
    # Get recent runs
    from app.models.analysis_run import AnalysisRun
    from app.models.analysis_type import AnalysisType
    from app.models.instrument import Instrument
    
    recent_runs = db.query(AnalysisRun).filter(
        AnalysisRun.organization_id.in_(org_ids)
    ).order_by(AnalysisRun.created_at.desc()).limit(limit).all()
    
    for run in recent_runs:
        analysis_name = run.analysis_type.display_name if run.analysis_type else "Unknown"
        instrument_symbol = run.instrument.symbol if run.instrument else "Unknown"
        activity.append(ActivityLogItem(
            type='run',
            id=run.id,
            name=f"{analysis_name} - {instrument_symbol} ({run.timeframe})",
            status=run.status.value,
            created_at=run.created_at,
            organization_name=org_names.get(run.organization_id)
        ))
    
    # Get recent pipeline creations
    recent_pipelines = db.query(AnalysisType).filter(
        AnalysisType.organization_id.in_(org_ids)
    ).order_by(AnalysisType.created_at.desc()).limit(limit).all()
    
    for pipeline in recent_pipelines:
        activity.append(ActivityLogItem(
            type='pipeline',
            id=pipeline.id,
            name=pipeline.display_name or pipeline.name,
            status=None,
            created_at=pipeline.created_at,
            organization_name=org_names.get(pipeline.organization_id)
        ))
    
    # Sort by created_at descending and limit
    activity.sort(key=lambda x: x.created_at, reverse=True)
    return activity[:limit]


@router.put("/users/{user_id}", response_model=dict)
async def update_user(
    user_id: int,
    request: UpdateUserRequest,
    current_user: User = Depends(get_current_admin_user_dependency),
    db: Session = Depends(get_db)
):
    """Update user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Cannot modify yourself (prevent lockout)
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify your own account"
        )
    
    # Cannot change role of other admins
    if user.role == 'admin' and request.role and request.role != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot change role of platform admin"
        )
    
    if request.full_name is not None:
        user.full_name = request.full_name
    
    if request.email is not None and request.email != user.email:
        # Check if email is already taken
        existing_user = db.query(User).filter(
            User.email == request.email,
            User.id != user_id
        ).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already in use"
            )
        user.email = request.email
    
    if request.role is not None:
        if request.role not in ('admin', 'user'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Role must be 'admin' (platform admin) or 'user' (regular user). Organization-specific roles are managed per-organization."
            )
        user.role = request.role
    
    if request.is_active is not None:
        user.is_active = request.is_active
    
    db.commit()
    db.refresh(user)
    
    return {
        "success": True,
        "message": "User updated successfully",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "is_active": user.is_active
        }
    }


# Impersonation Endpoints

@router.post("/users/{user_id}/impersonate", response_model=dict)
async def impersonate_user(
    user_id: int,
    request: Request,
    response: Response,
    researchflow_session: Optional[str] = Cookie(None),
    current_user: User = Depends(get_current_admin_user_dependency),
    db: Session = Depends(get_db)
):
    """Impersonate a user (admin only)."""
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Cannot impersonate other admins
    if target_user.role == 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot impersonate platform admin"
        )
    
    # Get current session to preserve admin identity
    session_data = verify_session(researchflow_session) if researchflow_session else None
    if not session_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session"
        )
    
    # Get target user's personal organization for context
    from app.models.organization import Organization
    personal_org = db.query(Organization).filter(
        Organization.owner_id == target_user.id,
        Organization.is_personal == True
    ).first()
    
    if not personal_org:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Target user's personal organization not found"
        )
    
    # Create impersonated session
    impersonated_session_data = {
        'user_id': target_user.id,
        'email': target_user.email,
        'is_admin': False,  # Impersonated user is not admin
        'role': target_user.role,
        'organization_id': personal_org.id,
        'impersonated_by': current_user.id,  # Original admin
        'is_impersonated': True,
        'created_at': datetime.now(timezone.utc).isoformat(),
    }
    
    # Create session token (reuse create_session logic but with custom data)
    from app.core.config import SESSION_SECRET
    import hashlib
    import hmac
    import json
    
    session_json = json.dumps(impersonated_session_data, sort_keys=True)
    signature = hmac.new(
        SESSION_SECRET.encode() if SESSION_SECRET else b'default-secret-change-in-prod',
        session_json.encode(),
        hashlib.sha256
    ).hexdigest()
    
    session_token = f"{session_json}.{signature}"
    
    # Store in session cache
    import app.core.auth as auth_module
    auth_module._sessions[session_token] = impersonated_session_data
    
    # Log impersonation start
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get('user-agent', '')[:500] if request.headers else None
    
    audit_log = AuditLog(
        action_type='impersonation_start',
        admin_user_id=current_user.id,
        target_user_id=target_user.id,
        details={
            'target_user_email': target_user.email,
            'target_user_name': target_user.full_name,
            'organization_id': personal_org.id,
            'organization_name': personal_org.name
        },
        ip_address=ip_address,
        user_agent=user_agent
    )
    db.add(audit_log)
    db.commit()
    
    # Set new cookie
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
        "message": f"Impersonating user {target_user.email}",
        "impersonated_user": {
            "id": target_user.id,
            "email": target_user.email,
            "full_name": target_user.full_name
        },
        "admin_user": {
            "id": current_user.id,
            "email": current_user.email,
            "full_name": current_user.full_name
        }
    }


@router.post("/exit-impersonation", response_model=dict)
async def exit_impersonation(
    request: Request,
    response: Response,
    researchflow_session: Optional[str] = Cookie(None),
    db: Session = Depends(get_db)
):
    """Exit impersonation and restore original admin session."""
    session_data = verify_session(researchflow_session) if researchflow_session else None
    if not session_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session"
        )
    
    # Check if currently impersonating
    if not session_data.get('is_impersonated') or not session_data.get('impersonated_by'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Not currently impersonating"
        )
    
    # Get original admin user
    admin_user_id = session_data.get('impersonated_by')
    admin_user = db.query(User).filter(User.id == admin_user_id).first()
    if not admin_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Original admin user not found"
        )
    
    # Get target user (impersonated user)
    target_user_id = session_data.get('user_id')
    target_user = db.query(User).filter(User.id == target_user_id).first() if target_user_id else None
    
    # Get admin's personal organization
    from app.models.organization import Organization
    admin_personal_org = db.query(Organization).filter(
        Organization.owner_id == admin_user.id,
        Organization.is_personal == True
    ).first()
    
    # Log impersonation end
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get('user-agent', '')[:500] if request.headers else None
    
    audit_log = AuditLog(
        action_type='impersonation_end',
        admin_user_id=admin_user.id,
        target_user_id=target_user.id if target_user else None,
        details={
            'target_user_email': target_user.email if target_user else None,
            'target_user_name': target_user.full_name if target_user else None
        },
        ip_address=ip_address,
        user_agent=user_agent
    )
    db.add(audit_log)
    db.commit()
    
    # Create new admin session
    admin_session_token = create_session(
        admin_user.id,
        admin_user.email,
        admin_user.is_platform_admin(),
        admin_user.role,
        admin_personal_org.id if admin_personal_org else None
    )
    
    # Set new cookie
    response.set_cookie(
        key="researchflow_session",
        value=admin_session_token,
        httponly=True,
        secure=False,  # Set to True in production with HTTPS
        samesite="lax",
        max_age=86400,  # 24 hours
        path="/",
    )
    
    # Delete impersonated session
    if researchflow_session:
        delete_session(researchflow_session)
    
    return {
        "success": True,
        "message": "Exited impersonation",
        "admin_user": {
            "id": admin_user.id,
            "email": admin_user.email,
            "full_name": admin_user.full_name
        }
    }

