"""
Platform settings model.
"""
from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from app.core.database import Base
import json


class PlatformSettings(Base):
    __tablename__ = "platform_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(255), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=False)  # JSON stored as text
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def get_value(self):
        """Get parsed JSON value."""
        try:
            return json.loads(self.value)
        except (json.JSONDecodeError, TypeError):
            # If not JSON, return as string
            return self.value
    
    def set_value(self, value):
        """Set value (will be JSON-encoded if not string)."""
        if isinstance(value, str):
            self.value = value
        else:
            self.value = json.dumps(value)

