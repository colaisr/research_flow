"""
Process Category model - folders for organizing analysis processes.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.core.database import Base


class ProcessCategory(Base):
    """Represents a folder/category for organizing analysis processes."""
    
    __tablename__ = "process_categories"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)  # Category name (e.g., "Trading", "Research")
    organization_id = Column(Integer, ForeignKey('organizations.id'), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True)  # NULL = shared within org, set = user-specific
    display_order = Column(Integer, default=0)  # Order for displaying categories
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    organization = relationship("Organization", foreign_keys=[organization_id])
    user = relationship("User", foreign_keys=[user_id])
    processes = relationship("AnalysisType", back_populates="category")
