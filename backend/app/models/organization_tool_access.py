"""
Organization Tool Access model for controlling tool availability per organization.
"""
from sqlalchemy import Column, Integer, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class OrganizationToolAccess(Base):
    """
    Controls which tools are enabled/disabled for specific organizations.
    
    By default, all user's tools are enabled in all orgs where user is owner.
    This table allows disabling specific tools per organization.
    """
    __tablename__ = "organization_tool_access"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), nullable=False, index=True)
    tool_id = Column(Integer, ForeignKey('user_tools.id'), nullable=False, index=True)
    is_enabled = Column(Boolean, default=True, nullable=False)  # Tool enabled for this organization
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    organization = relationship("Organization", foreign_keys=[organization_id])
    tool = relationship("UserTool", back_populates="organization_access")

    __table_args__ = (
        UniqueConstraint('organization_id', 'tool_id', name='uq_organization_tool_access_org_tool'),
    )


