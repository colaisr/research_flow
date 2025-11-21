"""
Organization service for managing organizations and members.
"""
from sqlalchemy.orm import Session
from app.models.organization import Organization, OrganizationMember
from app.models.user import User
import re


def create_personal_organization(db: Session, user_id: int, user_name: str = None, user_email: str = None) -> Organization:
    """
    Create a personal organization for a user.
    
    Args:
        db: Database session
        user_id: ID of the user
        user_name: User's full name (optional)
        user_email: User's email (optional)
    
    Returns:
        Created Organization object
    """
    # Generate organization name
    if user_name:
        org_name = f"{user_name} Personal"
    elif user_email:
        # Use email prefix before @
        email_prefix = user_email.split('@')[0]
        org_name = f"{email_prefix} Personal"
    else:
        org_name = f"Personal Organization"
    
    # Generate slug from name
    slug = re.sub(r'[^a-z0-9]+', '-', org_name.lower()).strip('-')
    
    # Ensure slug is unique
    base_slug = slug
    counter = 1
    while db.query(Organization).filter(Organization.slug == slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1
    
    # Create organization
    organization = Organization(
        name=org_name,
        slug=slug,
        owner_id=user_id,
        is_personal=True
    )
    db.add(organization)
    db.flush()  # Flush to get the ID
    
    # Create organization member entry
    member = OrganizationMember(
        organization_id=organization.id,
        user_id=user_id,
        role='org_admin',
        invited_by=None  # Self-created
    )
    db.add(member)
    db.commit()
    db.refresh(organization)
    
    return organization


def get_user_organizations(db: Session, user_id: int) -> list[Organization]:
    """
    Get all organizations a user belongs to.
    
    Args:
        db: Database session
        user_id: ID of the user
    
    Returns:
        List of Organization objects
    """
    return db.query(Organization).join(OrganizationMember).filter(
        OrganizationMember.user_id == user_id
    ).all()


def get_user_personal_organization(db: Session, user_id: int) -> Organization | None:
    """
    Get user's personal organization.
    
    Args:
        db: Database session
        user_id: ID of the user
    
    Returns:
        Organization object or None
    """
    return db.query(Organization).join(OrganizationMember).filter(
        OrganizationMember.user_id == user_id,
        Organization.is_personal == True
    ).first()

