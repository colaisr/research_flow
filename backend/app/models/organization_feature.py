"""
Organization Feature model for feature enablement system.
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class OrganizationFeature(Base):
    __tablename__ = "organization_features"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    feature_name = Column(String(50), nullable=False, index=True)
    enabled = Column(Boolean, default=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    organization = relationship("Organization", back_populates="features")

    __table_args__ = (
        UniqueConstraint('organization_id', 'feature_name', name='uq_organization_features_org_feature'),
    )

