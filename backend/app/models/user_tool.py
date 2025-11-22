"""
User Tool model for configurable data sources.
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, JSON, Enum as SQLEnum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum


class ToolType(str, enum.Enum):
    """Tool type enumeration."""
    DATABASE = "database"
    API = "api"
    RAG = "rag"


class UserTool(Base):
    """
    User-owned tools for data sources.
    
    Tools belong to users and are available in all organizations where the user is owner.
    Access can be controlled per-organization via organization_tool_access table.
    """
    __tablename__ = "user_tools"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), nullable=True, index=True)  # "Home" org where tool was created (reference only)
    tool_type = Column(SQLEnum(ToolType, values_callable=lambda x: [e.value for e in x]), nullable=False, index=True)
    display_name = Column(String(255), nullable=False)  # User-friendly display name
    config = Column(JSON, nullable=False)  # Type-specific configuration (credentials, connection details)
    is_active = Column(Boolean, default=True, nullable=False)  # Tool enabled/disabled globally
    is_shared = Column(Boolean, default=True, nullable=False)  # If true, available in all orgs where user is owner
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    organization = relationship("Organization", foreign_keys=[organization_id])
    organization_access = relationship("OrganizationToolAccess", back_populates="tool", cascade="all, delete-orphan")


