"""
Feature enablement service.

Simplified Model:
- Features are enabled per user only
- When user owns an org → org gets those features automatically
- When user works in an org → they get the org owner's features
- Organization features table is used as cache/denormalization (synced from owner)
"""
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.models.user import User
from app.models.user_feature import UserFeature
from app.models.organization_feature import OrganizationFeature
from app.models.organization import Organization

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

def get_user_features(db: Session, user_id: int) -> dict[str, bool]:
    """
    Get all features for a user.
    Returns dict mapping feature_name -> enabled (bool).
    Checks expiration dates.
    Default: True if not set (all features enabled by default until payment is implemented).
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
    
    # Default: True if not set (all features enabled by default until payment is implemented)
    for feature_name in FEATURES.keys():
        if feature_name not in result:
            result[feature_name] = True
    
    return result


def get_organization_features(db: Session, organization_id: int) -> dict[str, bool]:
    """
    Get features for an organization (derived from owner's features).
    Returns dict mapping feature_name -> enabled (bool).
    
    Logic: Organization features = owner's user features
    Uses organization_features table as cache/denormalization.
    If cache is stale, syncs from owner.
    """
    organization = db.query(Organization).filter(Organization.id == organization_id).first()
    if not organization:
        # Return all False if org doesn't exist
        return {feature_name: False for feature_name in FEATURES.keys()}
    
    # If no owner, return all False
    if not organization.owner_id:
        return {feature_name: False for feature_name in FEATURES.keys()}
    
    # Get owner's features (source of truth)
    owner_features = get_user_features(db, organization.owner_id)
    
    # Optionally sync to cache (organization_features table)
    # This is for performance - we can query org features directly without joining
    sync_organization_features_from_owner(db, organization_id, organization.owner_id)
    
    return owner_features


def sync_organization_features_from_owner(db: Session, organization_id: int, owner_id: int):
    """
    Sync organization features from owner's user features.
    This keeps organization_features table as a cache/denormalization.
    """
    owner_features = get_user_features(db, owner_id)
    
    for feature_name, enabled in owner_features.items():
        # Get or create org feature record
        org_feature = db.query(OrganizationFeature).filter(
            OrganizationFeature.organization_id == organization_id,
            OrganizationFeature.feature_name == feature_name
        ).first()
        
        if org_feature:
            org_feature.enabled = enabled
            # Keep expiration from user feature if exists
            user_feature = db.query(UserFeature).filter(
                UserFeature.user_id == owner_id,
                UserFeature.feature_name == feature_name
            ).first()
            if user_feature:
                org_feature.expires_at = user_feature.expires_at
        else:
            # Get user feature to copy expiration
            user_feature = db.query(UserFeature).filter(
                UserFeature.user_id == owner_id,
                UserFeature.feature_name == feature_name
            ).first()
            
            org_feature = OrganizationFeature(
                organization_id=organization_id,
                feature_name=feature_name,
                enabled=enabled,
                expires_at=user_feature.expires_at if user_feature else None
            )
            db.add(org_feature)
    
    db.commit()


def get_effective_features(db: Session, user_id: int, organization_id: int) -> dict[str, bool]:
    """
    Get effective features for a user in a specific organization context.
    
    Simplified Logic:
    - Organization features = org owner's user features (what's available in the workspace)
    - User gets org owner's features when working in that org
    
    Example:
    - Tom (org owner) has: rag=True, api_tools=True, scheduling=False
    - Organization "Acme Corp" (owned by Tom) has: rag=True, api_tools=True, scheduling=False
    - Jerry (member) working in Acme Corp gets: rag=True, api_tools=True, scheduling=False
    - Jerry working in his personal org gets: rag=False, api_tools=False, scheduling=False (his own features)
    
    This means: When Jerry is invited to Tom's workspace, Jerry gets access to all features
    that Tom (the org owner) has enabled.
    """
    org_features = get_organization_features(db, organization_id)
    return org_features


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
    Also syncs to all organizations owned by this user.
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
    
    # Sync to all organizations owned by this user
    user_orgs = db.query(Organization).filter(Organization.owner_id == user_id).all()
    for org in user_orgs:
        sync_organization_features_from_owner(db, org.id, user_id)
    
    return feature


def set_organization_feature(
    db: Session,
    organization_id: int,
    feature_name: str,
    enabled: bool,
    expires_at: datetime | None = None
) -> OrganizationFeature:
    """
    DEPRECATED: Organization features are now derived from owner's features.
    This function is kept for backward compatibility but should not be used.
    Instead, set features on the organization owner.
    
    If called, it will sync the feature to the organization owner's user features.
    """
    organization = db.query(Organization).filter(Organization.id == organization_id).first()
    if not organization or not organization.owner_id:
        raise ValueError(f"Organization {organization_id} has no owner")
    
    # Set on owner instead
    return set_user_feature(db, organization.owner_id, feature_name, enabled, expires_at)

