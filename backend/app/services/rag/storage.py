"""
Storage service for RAG documents and vectors.
Provides abstraction layer for file storage (filesystem MVP, MinIO future).
"""
from pathlib import Path
from typing import Optional
import logging

from app.core.config import STORAGE_BASE_PATH

logger = logging.getLogger(__name__)


class RAGStorage:
    """Storage service for RAG files and vectors."""
    
    def __init__(self, base_path: Optional[Path] = None):
        """Initialize storage service.
        
        Args:
            base_path: Base storage path (defaults to STORAGE_BASE_PATH from config)
        """
        if base_path is None:
            base_path = Path(STORAGE_BASE_PATH)
        
        # Resolve to absolute path
        self.base_path = base_path.resolve()
        self.base_path.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"RAG Storage initialized at {self.base_path}")
    
    def get_rag_vectors_path(self, rag_id: int) -> Path:
        """Get path for RAG vector storage (ChromaDB collection).
        
        Args:
            rag_id: RAG knowledge base ID
            
        Returns:
            Path to vector storage directory
        """
        path = self.base_path / "rag_vectors" / f"rag_{rag_id}"
        path.mkdir(parents=True, exist_ok=True)
        return path
    
    def get_rag_documents_path(self, rag_id: int) -> Path:
        """Get path for RAG document storage.
        
        Args:
            rag_id: RAG knowledge base ID
            
        Returns:
            Path to documents directory
        """
        path = self.base_path / "rag_documents" / f"rag_{rag_id}"
        path.mkdir(parents=True, exist_ok=True)
        return path
    
    def get_document_file_path(self, rag_id: int, document_id: int, filename: str) -> Path:
        """Get full path for a document file.
        
        Args:
            rag_id: RAG knowledge base ID
            document_id: Document ID
            filename: Original filename
            
        Returns:
            Full path to document file
        """
        documents_path = self.get_rag_documents_path(rag_id)
        # Sanitize filename to avoid path traversal issues
        safe_filename = Path(filename).name  # Get just the filename, no path
        file_path = documents_path / f"doc_{document_id}_{safe_filename}"
        return file_path
    
    def get_relative_path(self, absolute_path: Path) -> str:
        """Convert absolute path to relative path (for database storage).
        
        Args:
            absolute_path: Absolute file path
            
        Returns:
            Relative path string (e.g., "rag_documents/rag_1/doc_1.pdf")
        """
        try:
            return str(absolute_path.relative_to(self.base_path))
        except ValueError:
            # Path is not relative to base_path, return as-is
            logger.warning(f"Path {absolute_path} is not relative to base_path {self.base_path}")
            return str(absolute_path)
    
    def get_absolute_path(self, relative_path: str) -> Path:
        """Convert relative path to absolute path.
        
        Args:
            relative_path: Relative path string
            
        Returns:
            Absolute Path object
        """
        return self.base_path / relative_path
    
    def ensure_directory_exists(self, path: Path) -> None:
        """Ensure a directory exists (create if needed).
        
        Args:
            path: Directory path
        """
        path.mkdir(parents=True, exist_ok=True)
    
    def delete_file(self, file_path: Path) -> bool:
        """Delete a file.
        
        Args:
            file_path: Path to file to delete
            
        Returns:
            True if deleted, False if not found
        """
        try:
            if file_path.exists():
                file_path.unlink()
                logger.info(f"Deleted file: {file_path}")
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to delete file {file_path}: {e}")
            return False
    
    def delete_directory(self, dir_path: Path, recursive: bool = True) -> bool:
        """Delete a directory.
        
        Args:
            dir_path: Path to directory to delete
            recursive: If True, delete recursively
            
        Returns:
            True if deleted, False if not found
        """
        try:
            if dir_path.exists() and dir_path.is_dir():
                if recursive:
                    import shutil
                    shutil.rmtree(dir_path)
                else:
                    dir_path.rmdir()
                logger.info(f"Deleted directory: {dir_path}")
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to delete directory {dir_path}: {e}")
            return False

