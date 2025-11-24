"""
Schedule model for automated analysis runs.
"""
from sqlalchemy import Column, Integer, String, JSON, DateTime, Boolean, ForeignKey, func
from sqlalchemy.orm import relationship
from app.core.database import Base


class Schedule(Base):
    """Represents a scheduled analysis run."""
    
    __tablename__ = "schedules"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey('organizations.id'), nullable=False, index=True)
    analysis_type_id = Column(Integer, ForeignKey('analysis_types.id'), nullable=False, index=True)
    
    # Schedule configuration
    # schedule_type: 'daily', 'weekly', 'interval', 'cron'
    schedule_type = Column(String(20), nullable=False)
    # schedule_config: JSON with type-specific configuration
    # For 'daily': { "time": "08:00" }
    # For 'weekly': { "day_of_week": 0, "time": "11:00" } (0=Monday, 6=Sunday)
    # For 'interval': { "interval_minutes": 60 }
    # For 'cron': { "cron_expression": "0 8 * * *" }
    schedule_config = Column(JSON, nullable=False)
    
    # Status
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    
    # Execution tracking
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    next_run_at = Column(DateTime(timezone=True), nullable=True, index=True)
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    organization = relationship("Organization", foreign_keys=[organization_id])
    analysis_type = relationship("AnalysisType", foreign_keys=[analysis_type_id])

