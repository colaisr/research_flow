"""
Analysis type model - stores configuration for different analysis pipelines.
"""
from sqlalchemy import Column, Integer, String, Text, JSON, DateTime, Boolean, ForeignKey, func
from sqlalchemy.orm import relationship
from app.core.database import Base


class AnalysisType(Base):
    """Represents a configurable analysis pipeline type."""
    
    __tablename__ = "analysis_types"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)  # e.g., "daystart", "intraday_smc"
    display_name = Column(String(200), nullable=False)  # e.g., "Daystart Analysis"
    description = Column(Text, nullable=True)
    version = Column(String(20), default="1.0.0")  # e.g., "1.2.0"
    
    # Pipeline configuration stored as JSON
    # Structure:
    # {
    #   "steps": [
    #     {
    #       "step_name": "wyckoff",
    #       "order": 1,
    #       "step_type": "llm_analysis",
    #       "model": "openai/gpt-4o-mini",
    #       "system_prompt": "...",
    #       "user_prompt_template": "...",
    #       "temperature": 0.7,
    #       "max_tokens": 2000,
    #       "data_sources": ["market_data"],
    #       "num_candles": 20,
    #       "publish_to_telegram": false,
    #       "include_context": {
    #         "steps": ["wyckoff", "smc"],
    #         "placement": "before",
    #         "format": "summary",
    #         "auto_detected": ["wyckoff", "smc"]
    #       }
    #     },
    #     ...
    #   ],
    #   "default_instrument": "BTC/USDT",
    #   "default_timeframe": "H1",
    #   "estimated_cost": 0.18,
    #   "estimated_duration_seconds": 120
    # }
    config = Column(JSON, nullable=False)
    
    # Pipeline Editor fields
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True)  # NULL = system pipeline, set = user-created
    is_system = Column(Boolean, nullable=False, default=True)  # True = system pipeline, False = user-created
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    is_active = Column(Integer, default=1)  # 1 = active, 0 = inactive
    
    # Relationships
    runs = relationship("AnalysisRun", back_populates="analysis_type")
    user = relationship("User", foreign_keys=[user_id])

