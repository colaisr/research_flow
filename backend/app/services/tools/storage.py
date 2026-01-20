"""
Storage service for tool-related files (e.g., Excel database files).
"""
from pathlib import Path
from typing import Optional
import logging
import uuid

from app.core.config import STORAGE_BASE_PATH

logger = logging.getLogger(__name__)


class ToolFileStorage:
    """Storage service for tool files."""

    def __init__(self, base_path: Optional[Path] = None):
        if base_path is None:
            base_path = Path(STORAGE_BASE_PATH)
        self.base_path = base_path.resolve()
        self.base_path.mkdir(parents=True, exist_ok=True)
        logger.info(f"Tool file storage initialized at {self.base_path}")

    def get_excel_tools_path(self, user_id: int) -> Path:
        path = self.base_path / "tool_files" / f"user_{user_id}" / "excel"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def save_excel_file(self, user_id: int, filename: str, file_bytes: bytes) -> str:
        safe_filename = Path(filename).name
        unique_id = uuid.uuid4().hex
        dest_dir = self.get_excel_tools_path(user_id)
        dest_path = dest_dir / f"excel_{unique_id}_{safe_filename}"
        dest_path.write_bytes(file_bytes)
        return self.get_relative_path(dest_path)

    def get_relative_path(self, absolute_path: Path) -> str:
        try:
            return str(absolute_path.relative_to(self.base_path))
        except ValueError:
            logger.warning(f"Path {absolute_path} is not relative to base_path {self.base_path}")
            return str(absolute_path)

    def get_absolute_path(self, relative_path: str) -> Path:
        return self.base_path / relative_path

    def delete_file(self, relative_path: str) -> bool:
        try:
            file_path = self.get_absolute_path(relative_path)
            if file_path.exists():
                file_path.unlink()
                logger.info(f"Deleted tool file: {file_path}")
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to delete tool file {relative_path}: {e}")
            return False
