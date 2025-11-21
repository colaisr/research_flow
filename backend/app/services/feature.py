"""
Feature enablement service.
"""
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.models.user import User
from app.models.user_feature import UserFeature
from app.models.organization_feature import OrganizationFeature

# Available features
FEATURES = {
    'local_llm': 'Local LLM',
    'openrouter': 'OpenRouter',
    'rag': 'RAG Knowledge Bases',
    'api_tools': 'API Tools',
    'database_tools': 'Database Tools',
    'scheduling': 'Scheduling',
    'webhooks': 'Webhooks',
}

def get_user_features(db: Session, user_id: int) -> dict[str, bool | None]:
    """
    Get all features for a user (user-level features only).
    Returns dict mapping feature_name -> enabled (bool) or None if not set.
    Checks expiration dates.
    None means user hasn't explicitly set this feature (will inherit from org).
    """
    features = db.query(UserFeature).filter(
        UserFeature.user_id == user_id
    ).all()
    
    result = {}
    now = datetime.now(timezone.utc)
    
    for feature in features:
        # Check if feature has expired
        if feature.expires_at and feature.expires_at < now:
            result[feature.feature_name] = False
        else:
            result[feature.feature_name] = feature.enabled
    
    # Don't set defaults - None means "not set, inherit from org"
    return result


def get_organization_features(db: Session, organization_id: int) -> dict[str, bool]:
    """
    Get all features for an organization (organization-level features only).
    Returns dict mapping feature_name -> enabled (bool).
    Checks expiration dates.
    
    Default: Features are enabled by default if not explicitly set.
    This means organizations get all features unless explicitly disabled.
    """
    features = db.query(OrganizationFeature).filter(
        OrganizationFeature.organization_id == organization_id
    ).all()
    
    result = {}
    now = datetime.now(timezone.utc)
    
    for feature in features:
        # Check if feature has expired
        if feature.expires_at and feature.expires_at < now:
            result[feature.feature_name] = False
        else:
            result[feature.feature_name] = feature.enabled
    
    # Default: all features enabled if not explicitly set
    # This allows organizations to have all features by default
    # Admin can disable specific features if needed
    for feature_name in FEATURES.keys():
        if feature_name not in result:
            result[feature_name] = True
    
    return result


def get_effective_features(db: Session, user_id: int, organization_id: int) -> dict[str, bool]:
    """
    Get effective features for a user in a specific organization context.
    
    Logic:
    - Organization features = primary source (what's available in the workspace)
    - User features = restrictions/overrides (if user explicitly disabled, can't use even if org has it)
    - If user hasn't set a feature → inherit from organization
    
    Example:
    - Organization has: rag=True, api_tools=True, scheduling=True
    - User has: rag=None (not set), api_tools=False (disabled), scheduling=None (not set)
    - Effective: rag=True (from org), api_tools=False (user restriction), scheduling=True (from org)
    
    This means: If Jerry doesn't have features set and is invited to Tom's workspace,
    Jerry gets access to all features that Tom's workspace has.
    """
    user_features = get_user_features(db, user_id)  # Returns dict[str, bool | None]
    org_features = get_organization_features(db, organization_id)
    
    effective = {}
    for feature_name in FEATURES.keys():
        user_setting = user_features.get(feature_name)  # None, True, or False
        org_enabled = org_features.get(feature_name, True)
        
        if user_setting is None:
            # User hasn't set this feature → inherit from organization
            effective[feature_name] = org_enabled
        else:
            # User has explicitly set this feature → use intersection (user can restrict)
            effective[feature_name] = user_setting and org_enabled
    
    return effective


def has_feature(db: Session, user_id: int, organization_id: int, feature_name: str) -> bool:
    """
    Check if user has a specific feature enabled in the current organization context.
    Returns True only if BOTH user and organization have the feature enabled.
    """
    if feature_name not in FEATURES:
        return False
    
    effective_features = get_effective_features(db, user_id, organization_id)
    return effective_features.get(feature_name, False)


def set_user_feature(
    db: Session,
    user_id: int,
    feature_name: str,
    enabled: bool,
    expires_at: datetime | None = None
) -> UserFeature:
    """
    Set a feature for a user.
    Creates or updates the feature record.
    """
    if feature_name not in FEATURES:
        raise ValueError(f"Unknown feature: {feature_name}")
    
    feature = db.query(UserFeature).filter(
        UserFeature.user_id == user_id,
        UserFeature.feature_name == feature_name
    ).first()
    
    if feature:
        feature.enabled = enabled
        feature.expires_at = expires_at
    else:
        feature = UserFeature(
            user_id=user_id,
            feature_name=feature_name,
            enabled=enabled,
            expires_at=expires_at
        )
        db.add(feature)
    
    db.commit()
    db.refresh(feature)
    return feature


def set_organization_feature(
    db: Session,
    organization_id: int,
    feature_name: str,
    enabled: bool,
    expires_at: datetime | None = None
) -> OrganizationFeature:
    """
    Set a feature for an organization.
    Creates or updates the organization feature record.
    """
    if feature_name not in FEATURES:
        raise ValueError(f"Unknown feature: {feature_name}")
    
    feature = db.query(OrganizationFeature).filter(
        OrganizationFeature.organization_id == organization_id,
        OrganizationFeature.feature_name == feature_name
    ).first()
    
    if feature:
        feature.enabled = enabled
        feature.expires_at = expires_at
    else:
        feature = OrganizationFeature(
            organization_id=organization_id,
            feature_name=feature_name,
            enabled=enabled,
            expires_at=expires_at
        )
        db.add(feature)
    
    db.commit()
    db.refresh(feature)
    return feature

