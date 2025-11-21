"""
User model for authentication.
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)  # Deprecated, use role instead
    role = Column(String(50), nullable=False, default='user')  # 'admin' (platform admin) or 'user' (regular user)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    features = relationship("UserFeature", back_populates="user", cascade="all, delete-orphan")
    
    def is_platform_admin(self) -> bool:
        """Check if user is platform admin."""
        return self.role == 'admin'
    
    def is_org_admin(self, db, organization_id: int) -> bool:
        """
        Check if user is organization admin in the given organization (or platform admin).
        Requires database session to check organization_members.role.
        """
        # Platform admins are always org admins
        if self.is_platform_admin():
            return True
        
        # Check organization membership
        from app.models.organization import OrganizationMember
        member = db.query(OrganizationMember).filter(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.user_id == self.id
        ).first()
        
        return member and member.role == 'org_admin'
    
    def is_org_user(self, db, organization_id: int) -> bool:
        """
        Check if user is organization user (not admin) in the given organization.
        Requires database session to check organization_members.role.
        """
        # Platform admins are never org_users
        if self.is_platform_admin():
            return False
        
        # Check organization membership
        from app.models.organization import OrganizationMember
        member = db.query(OrganizationMember).filter(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.user_id == self.id
        ).first()
        
        return member and member.role == 'org_user'

