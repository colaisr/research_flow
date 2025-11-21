"""
Organization management API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Cookie, Response
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime, timedelta, timezone
import secrets
from app.core.database import get_db
from app.models.user import User
from app.models.organization import Organization, OrganizationMember
from app.models.organization_invitation import OrganizationInvitation
from app.core.auth import get_current_user_dependency, verify_session, create_session
from app.services.organization import get_user_organizations, get_user_personal_organization, create_personal_organization
from app.services.feature import sync_organization_features_from_owner, FEATURES, set_user_feature
from app.api.auth import hash_password
import re

router = APIRouter()


class CreateOrganizationRequest(BaseModel):
    name: str


class InviteUserRequest(BaseModel):
    email: EmailStr
    role: str  # 'org_admin' or 'org_user'


class AddUserRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    role: str  # 'org_admin' or 'org_user'


class UpdateMemberRoleRequest(BaseModel):
    role: str  # 'org_admin' or 'org_user'


class AcceptInvitationRequest(BaseModel):
    token: Optional[str] = None
    invitation_id: Optional[int] = None


class TransferOwnershipRequest(BaseModel):
    new_owner_user_id: int


class OrganizationResponse(BaseModel):
    id: int
    name: str
    slug: Optional[str]
    is_personal: bool
    role: Optional[str]  # User's role in this organization
    owner_id: Optional[int]  # Organization owner user ID
    member_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class OrganizationMemberResponse(BaseModel):
    id: int
    user_id: int
    email: str
    full_name: Optional[str]
    role: str
    joined_at: datetime

    class Config:
        from_attributes = True


class OrganizationInvitationResponse(BaseModel):
    id: int
    organization_id: int
    organization_name: str
    email: str
    role: str
    invited_by: int
    expires_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


def check_org_admin(db: Session, user: User, organization_id: int) -> OrganizationMember:
    """Check if user is org_admin of the organization or the owner."""
    # Get organization to check ownership
    organization = db.query(Organization).filter(Organization.id == organization_id).first()
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )
    
    # Owner can always manage
    if organization.owner_id == user.id:
        # Ensure owner is a member (should always be true, but check anyway)
        member = db.query(OrganizationMember).filter(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.user_id == user.id
        ).first()
        if not member:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Organization owner is not a member. This should not happen."
            )
        return member
    
    # Check if user is a member
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == organization_id,
        OrganizationMember.user_id == user.id
    ).first()
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this organization"
        )
    
    # Check if user is org_admin or platform admin
    if member.role != 'org_admin' and not user.is_platform_admin():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only organization admins can perform this action"
        )
    
    return member


@router.get("/organizations", response_model=List[OrganizationResponse])
async def list_organizations(
    current_user: User = Depends(get_current_user_dependency),
    db: Session = Depends(get_db)
):
    """Get all organizations the current user belongs to."""
    organizations = get_user_organizations(db, current_user.id)
    
    result = []
    for org in organizations:
        # Get user's role in this organization
        member = db.query(OrganizationMember).filter(
            OrganizationMember.organization_id == org.id,
            OrganizationMember.user_id == current_user.id
        ).first()
        
        # Get member count
        member_count = db.query(OrganizationMember).filter(
            OrganizationMember.organization_id == org.id
        ).count()
        
        result.append(OrganizationResponse(
            id=org.id,
            name=org.name,
            slug=org.slug,
            is_personal=org.is_personal,
            role=member.role if member else None,
            owner_id=org.owner_id,
            member_count=member_count,
            created_at=org.created_at
        ))
    
    return result


@router.post("/organizations", response_model=OrganizationResponse)
async def create_organization(
    request: CreateOrganizationRequest,
    current_user: User = Depends(get_current_user_dependency),
    db: Session = Depends(get_db)
):
    """Create a new organization (non-personal)."""
    # Generate slug from name
    slug = re.sub(r'[^a-z0-9]+', '-', request.name.lower()).strip('-')
    
    # Ensure slug is unique
    base_slug = slug
    counter = 1
    while db.query(Organization).filter(Organization.slug == slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1
    
    # Create organization
    organization = Organization(
        name=request.name,
        slug=slug,
        owner_id=current_user.id,
        is_personal=False
    )
    db.add(organization)
    db.flush()
    
    # Add creator as org_admin
    member = OrganizationMember(
        organization_id=organization.id,
        user_id=current_user.id,
        role='org_admin',
        invited_by=None
    )
    db.add(member)
    db.commit()
    db.refresh(organization)
    
    # Sync organization features from owner
    sync_organization_features_from_owner(db, organization.id, current_user.id)
    
    return OrganizationResponse(
        id=organization.id,
        name=organization.name,
        slug=organization.slug,
        is_personal=organization.is_personal,
        role='org_admin',
        owner_id=organization.owner_id,
        member_count=1,
        created_at=organization.created_at
    )


@router.post("/organizations/{organization_id}/invite", response_model=OrganizationInvitationResponse)
async def invite_user(
    organization_id: int,
    request: InviteUserRequest,
    current_user: User = Depends(get_current_user_dependency),
    db: Session = Depends(get_db)
):
    """Invite a user to an organization."""
    # Check permissions
    check_org_admin(db, current_user, organization_id)
    
    # Validate role
    if request.role not in ('org_admin', 'org_user'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role must be 'org_admin' or 'org_user'"
        )
    
    # Check if organization exists
    organization = db.query(Organization).filter(Organization.id == organization_id).first()
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )
    
    # Check if user is already a member
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        existing_member = db.query(OrganizationMember).filter(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.user_id == existing_user.id
        ).first()
        if existing_member:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is already a member of this organization"
            )
    
    # Check if there's already a pending invitation for THIS organization
    existing_invitation = db.query(OrganizationInvitation).filter(
        OrganizationInvitation.organization_id == organization_id,
        OrganizationInvitation.email == request.email,
        OrganizationInvitation.accepted_at.is_(None)
    ).first()
    
    if existing_invitation and existing_invitation.expires_at > datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An invitation is already pending for this email in this organization"
        )
    
    # Check if user is already invited by another organization (informational, but allow it)
    # Users can have multiple pending invitations from different organizations
    other_invitations = db.query(OrganizationInvitation).filter(
        OrganizationInvitation.email == request.email,
        OrganizationInvitation.organization_id != organization_id,
        OrganizationInvitation.accepted_at.is_(None),
        OrganizationInvitation.expires_at > datetime.now(timezone.utc)
    ).all()
    
    # Note: We allow multiple invitations from different organizations
    # The user can accept any of them when they log in
    
    # Generate invitation token
    token = secrets.token_urlsafe(32)
    
    # Create invitation (expires in 7 days)
    invitation = OrganizationInvitation(
        organization_id=organization_id,
        email=request.email,
        token=token,
        role=request.role,
        invited_by=current_user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7)
    )
    db.add(invitation)
    db.commit()
    db.refresh(invitation)
    
    return OrganizationInvitationResponse(
        id=invitation.id,
        organization_id=invitation.organization_id,
        organization_name=organization.name,
        email=invitation.email,
        role=invitation.role,
        invited_by=invitation.invited_by,
        expires_at=invitation.expires_at,
        created_at=invitation.created_at
    )


@router.post("/organizations/{organization_id}/add-user", response_model=OrganizationMemberResponse)
async def add_user(
    organization_id: int,
    request: AddUserRequest,
    current_user: User = Depends(get_current_user_dependency),
    db: Session = Depends(get_db)
):
    """
    Add a user directly to an organization by creating their account.
    TEMPORARY: This will be removed when email invitations are properly implemented.
    """
    # Check permissions
    check_org_admin(db, current_user, organization_id)
    
    # Validate role
    if request.role not in ('org_admin', 'org_user'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role must be 'org_admin' or 'org_user'"
        )
    
    # Check if organization exists
    organization = db.query(Organization).filter(Organization.id == organization_id).first()
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )
    
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        # If user exists, check if they're already a member
        existing_member = db.query(OrganizationMember).filter(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.user_id == existing_user.id
        ).first()
        if existing_member:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is already a member of this organization"
            )
        
        # Check if there's a pending invitation for this organization
        existing_invitation = db.query(OrganizationInvitation).filter(
            OrganizationInvitation.organization_id == organization_id,
            OrganizationInvitation.email == request.email,
            OrganizationInvitation.accepted_at.is_(None)
        ).first()
        
        if existing_invitation and existing_invitation.expires_at > datetime.now(timezone.utc):
            # Delete the pending invitation since we're adding them directly
            db.delete(existing_invitation)
        
        # Add existing user to organization
        new_member = OrganizationMember(
            organization_id=organization_id,
            user_id=existing_user.id,
            role=request.role,
            joined_at=datetime.now(timezone.utc)
        )
        db.add(new_member)
        db.commit()
        db.refresh(new_member)
        
        return OrganizationMemberResponse(
            id=new_member.id,
            user_id=new_member.user_id,
            email=existing_user.email,
            full_name=existing_user.full_name,
            role=new_member.role,
            joined_at=new_member.joined_at
        )
    
    # Create new user
    hashed_password = hash_password(request.password)
    new_user = User(
        email=request.email,
        hashed_password=hashed_password,
        full_name=request.full_name,
        is_active=True,
        role='user'  # Default platform role (regular user). Organization role is set separately in organization_members
    )
    db.add(new_user)
    db.flush()  # Flush to get user ID
    
    # Create personal organization for the new user
    try:
        create_personal_organization(db, new_user.id, new_user.full_name, new_user.email)
    except Exception as e:
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
        # Log error but don't fail user creation
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Failed to enable features for user {new_user.id}: {e}")
    
    # Add user to the organization
    new_member = OrganizationMember(
        organization_id=organization_id,
        user_id=new_user.id,
        role=request.role,
        joined_at=datetime.now(timezone.utc)
    )
    db.add(new_member)
    db.commit()
    db.refresh(new_member)
    db.refresh(new_user)
    
    return OrganizationMemberResponse(
        id=new_member.id,
        user_id=new_member.user_id,
        email=new_user.email,
        full_name=new_user.full_name,
        role=new_member.role,
        joined_at=new_member.joined_at
    )


@router.get("/organizations/invitations/pending", response_model=List[OrganizationInvitationResponse])
async def list_pending_invitations(
    current_user: User = Depends(get_current_user_dependency),
    db: Session = Depends(get_db)
):
    """List pending invitations for the current user."""
    invitations = db.query(OrganizationInvitation).filter(
        OrganizationInvitation.email == current_user.email,
        OrganizationInvitation.accepted_at.is_(None),
        OrganizationInvitation.expires_at > datetime.now(timezone.utc)
    ).all()
    
    result = []
    for inv in invitations:
        org = db.query(Organization).filter(Organization.id == inv.organization_id).first()
        result.append(OrganizationInvitationResponse(
            id=inv.id,
            organization_id=inv.organization_id,
            organization_name=org.name if org else 'Unknown',
            email=inv.email,
            role=inv.role,
            invited_by=inv.invited_by,
            expires_at=inv.expires_at,
            created_at=inv.created_at
        ))
    
    return result


@router.post("/organizations/invitations/accept", response_model=OrganizationResponse)
async def accept_invitation(
    request: AcceptInvitationRequest,
    current_user: User = Depends(get_current_user_dependency),
    db: Session = Depends(get_db)
):
    """Accept an organization invitation by token or invitation ID."""
    # Find invitation
    if request.invitation_id:
        invitation = db.query(OrganizationInvitation).filter(
            OrganizationInvitation.id == request.invitation_id
        ).first()
    elif request.token:
        invitation = db.query(OrganizationInvitation).filter(
            OrganizationInvitation.token == request.token
        ).first()
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either token or invitation_id must be provided"
        )
    
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found"
        )
    
    # Check if already accepted
    if invitation.accepted_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation has already been accepted"
        )
    
    # Check if expired
    if invitation.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation has expired"
        )
    
    # Check if email matches
    if invitation.email != current_user.email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This invitation is for a different email address"
        )
    
    # Check if already a member
    existing_member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == invitation.organization_id,
        OrganizationMember.user_id == current_user.id
    ).first()
    
    if existing_member:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are already a member of this organization"
        )
    
    # Add user as member
    member = OrganizationMember(
        organization_id=invitation.organization_id,
        user_id=current_user.id,
        role=invitation.role,
        invited_by=invitation.invited_by
    )
    db.add(member)
    
    # Mark invitation as accepted
    invitation.accepted_at = datetime.now(timezone.utc)
    
    db.commit()
    db.refresh(member)
    
    # Get organization
    organization = db.query(Organization).filter(
        Organization.id == invitation.organization_id
    ).first()
    
    return OrganizationResponse(
        id=organization.id,
        name=organization.name,
        slug=organization.slug,
        is_personal=organization.is_personal,
        role=member.role,
        owner_id=organization.owner_id,
        member_count=db.query(OrganizationMember).filter(
            OrganizationMember.organization_id == organization.id
        ).count(),
        created_at=organization.created_at
    )


@router.get("/organizations/{organization_id}", response_model=OrganizationResponse)
async def get_organization(
    organization_id: int,
    current_user: User = Depends(get_current_user_dependency),
    db: Session = Depends(get_db)
):
    """Get organization details by ID."""
    organization = db.query(Organization).filter(Organization.id == organization_id).first()
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )
    
    # Check if user is a member
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == organization_id,
        OrganizationMember.user_id == current_user.id
    ).first()
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this organization"
        )
    
    # Get member count
    member_count = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == organization_id
    ).count()
    
    return OrganizationResponse(
        id=organization.id,
        name=organization.name,
        slug=organization.slug,
        is_personal=organization.is_personal,
        role=member.role,
        owner_id=organization.owner_id,
        member_count=member_count,
        created_at=organization.created_at
    )


@router.get("/organizations/{organization_id}/members", response_model=List[OrganizationMemberResponse])
async def list_members(
    organization_id: int,
    current_user: User = Depends(get_current_user_dependency),
    db: Session = Depends(get_db)
):
    """List all members of an organization."""
    # Check if user is a member
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == organization_id,
        OrganizationMember.user_id == current_user.id
    ).first()
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this organization"
        )
    
    # Get all members
    members = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == organization_id
    ).all()
    
    result = []
    for mem in members:
        user = db.query(User).filter(User.id == mem.user_id).first()
        result.append(OrganizationMemberResponse(
            id=mem.id,
            user_id=mem.user_id,
            email=user.email,
            full_name=user.full_name,
            role=mem.role,
            joined_at=mem.joined_at
        ))
    
    return result


@router.delete("/organizations/{organization_id}/members/{member_id}")
async def remove_member(
    organization_id: int,
    member_id: int,
    current_user: User = Depends(get_current_user_dependency),
    db: Session = Depends(get_db)
):
    """Remove a member from an organization."""
    # Check permissions
    check_org_admin(db, current_user, organization_id)
    
    # Get organization
    organization = db.query(Organization).filter(Organization.id == organization_id).first()
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )
    
    # Get member to remove
    member = db.query(OrganizationMember).filter(
        OrganizationMember.id == member_id,
        OrganizationMember.organization_id == organization_id
    ).first()
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found"
        )
    
    # Cannot remove yourself
    if member.user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot remove yourself from the organization"
        )
    
    # Cannot remove organization owner
    if organization.owner_id and member.user_id == organization.owner_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot remove organization owner. Transfer ownership first."
        )
    
    db.delete(member)
    db.commit()
    
    return {"message": "Member removed successfully"}


@router.put("/organizations/{organization_id}/members/{member_id}/role")
async def update_member_role(
    organization_id: int,
    member_id: int,
    request: UpdateMemberRoleRequest,
    current_user: User = Depends(get_current_user_dependency),
    db: Session = Depends(get_db)
):
    """Update a member's role in an organization."""
    # Check permissions
    check_org_admin(db, current_user, organization_id)
    
    # Validate role
    if request.role not in ('org_admin', 'org_user'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role must be 'org_admin' or 'org_user'"
        )
    
    # Get organization
    organization = db.query(Organization).filter(Organization.id == organization_id).first()
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )
    
    # Get member
    member = db.query(OrganizationMember).filter(
        OrganizationMember.id == member_id,
        OrganizationMember.organization_id == organization_id
    ).first()
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found"
        )
    
    # Cannot change organization owner's role
    if organization.owner_id and member.user_id == organization.owner_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot change organization owner's role"
        )
    
    member.role = request.role
    db.commit()
    db.refresh(member)
    
    return {"message": "Member role updated successfully"}


@router.delete("/organizations/{organization_id}/leave")
async def leave_organization(
    organization_id: int,
    current_user: User = Depends(get_current_user_dependency),
    db: Session = Depends(get_db)
):
    """Leave an organization (cannot leave personal org)."""
    # Get organization
    organization = db.query(Organization).filter(Organization.id == organization_id).first()
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )
    
    # Cannot leave personal organization
    if organization.is_personal:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot leave your personal organization"
        )
    
    # Get member
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == organization_id,
        OrganizationMember.user_id == current_user.id
    ).first()
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You are not a member of this organization"
        )
    
    db.delete(member)
    db.commit()
    
    return {"message": "Left organization successfully"}


@router.post("/organizations/{organization_id}/transfer-ownership", response_model=dict)
async def transfer_ownership(
    organization_id: int,
    request: TransferOwnershipRequest,
    current_user: User = Depends(get_current_user_dependency),
    db: Session = Depends(get_db)
):
    """Transfer organization ownership to another member."""
    # Get organization
    organization = db.query(Organization).filter(Organization.id == organization_id).first()
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )
    
    # Only current owner can transfer ownership
    if not organization.owner_id or organization.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the organization owner can transfer ownership"
        )
    
    # Cannot transfer ownership of personal organization
    if organization.is_personal:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot transfer ownership of personal organization. Personal organizations must always belong to their creator."
        )
    
    # Cannot transfer to yourself
    if request.new_owner_user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot transfer ownership to yourself"
        )
    
    # Check if new owner is a member
    new_owner_member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == organization_id,
        OrganizationMember.user_id == request.new_owner_user_id
    ).first()
    
    if not new_owner_member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="New owner must be a member of the organization"
        )
    
    # Ensure new owner is org_admin (promote if needed)
    if new_owner_member.role != 'org_admin':
        new_owner_member.role = 'org_admin'
    
    # Transfer ownership
    organization.owner_id = request.new_owner_user_id
    db.commit()
    db.refresh(organization)
    
    return {
        "success": True,
        "message": f"Ownership transferred successfully",
        "new_owner_id": request.new_owner_user_id
    }


class SwitchOrganizationRequest(BaseModel):
    organization_id: int


@router.post("/organizations/switch", response_model=OrganizationResponse)
async def switch_organization(
    request: SwitchOrganizationRequest,
    response: Response,
    researchflow_session: Optional[str] = Cookie(None),
    current_user: User = Depends(get_current_user_dependency),
    db: Session = Depends(get_db)
):
    """Switch current organization context."""
    # Verify user is a member of the organization
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == request.organization_id,
        OrganizationMember.user_id == current_user.id
    ).first()
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this organization"
        )
    
    # Get organization
    organization = db.query(Organization).filter(Organization.id == request.organization_id).first()
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )
    
    # Update session with new organization_id
    if researchflow_session:
        session_data = verify_session(researchflow_session)
        if session_data:
            # Create new session with updated organization_id
            new_session_token = create_session(
                user_id=current_user.id,
                email=current_user.email,
                is_admin=current_user.is_admin,
                role=current_user.role,
                organization_id=request.organization_id
            )
            
            # Update cookie
            response.set_cookie(
                key="researchflow_session",
                value=new_session_token,
                httponly=True,
                secure=False,
                samesite="lax",
                max_age=86400,  # 24 hours
                path="/",
            )
    
    # Get member count
    member_count = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == organization.id
    ).count()
    
    return OrganizationResponse(
        id=organization.id,
        name=organization.name,
        slug=organization.slug,
        is_personal=organization.is_personal,
        role=member.role,
        owner_id=organization.owner_id,
        member_count=member_count,
        created_at=organization.created_at
    )

