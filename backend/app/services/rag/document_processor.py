"""
Document processing service for RAG.
Handles text extraction from various file types and chunking.
"""
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
import logging
import re

logger = logging.getLogger(__name__)


class DocumentProcessor:
    """Service for processing documents (text extraction, chunking)."""
    
    def __init__(self, chunk_size_tokens: int = 800, chunk_overlap_tokens: int = 150):
        """Initialize document processor.
        
        Args:
            chunk_size_tokens: Target chunk size in tokens (default: 800)
            chunk_overlap_tokens: Overlap between chunks in tokens (default: 150)
        """
        self.chunk_size_tokens = chunk_size_tokens
        self.chunk_overlap_tokens = chunk_overlap_tokens
    
    def extract_text_from_file(self, file_path: Path) -> Tuple[str, Dict[str, Any]]:
        """Extract text from a file based on its extension.
        
        Args:
            file_path: Path to the file
            
        Returns:
            Tuple of (extracted_text, metadata_dict)
        """
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        file_ext = file_path.suffix.lower()
        metadata = {
            "filename": file_path.name,
            "file_size": file_path.stat().st_size,
            "file_type": file_ext,
        }
        
        try:
            if file_ext == ".pdf":
                text = self._extract_text_from_pdf(file_path)
            elif file_ext in [".docx", ".doc"]:
                text = self._extract_text_from_docx(file_path)
            elif file_ext == ".txt":
                text = self._extract_text_from_txt(file_path)
            elif file_ext in [".html", ".htm"]:
                text = self._extract_text_from_html(file_path)
            else:
                raise ValueError(f"Unsupported file type: {file_ext}")
            
            metadata["text_length"] = len(text)
            metadata["extraction_success"] = True
            
            return text, metadata
        
        except Exception as e:
            logger.error(f"Failed to extract text from {file_path}: {e}")
            metadata["extraction_success"] = False
            metadata["error"] = str(e)
            raise
    
    def extract_text_from_url(self, url: str) -> Tuple[str, Dict[str, Any]]:
        """Extract text from a URL (HTML content).
        
        Args:
            url: URL to fetch
            
        Returns:
            Tuple of (extracted_text, metadata_dict)
        """
        import httpx
        from bs4 import BeautifulSoup
        
        metadata = {
            "url": url,
            "source_type": "url",
        }
        
        try:
            # Fetch URL content
            with httpx.Client(timeout=30.0) as client:
                response = client.get(url, follow_redirects=True)
                response.raise_for_status()
                
                # Parse HTML
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # Remove script and style elements
                for script in soup(["script", "style", "nav", "footer", "header"]):
                    script.decompose()
                
                # Extract text
                text = soup.get_text(separator='\n', strip=True)
                
                # Clean up multiple newlines
                text = re.sub(r'\n\s*\n', '\n\n', text)
                
                metadata["text_length"] = len(text)
                metadata["extraction_success"] = True
                metadata["status_code"] = response.status_code
                
                return text, metadata
        
        except Exception as e:
            logger.error(f"Failed to extract text from URL {url}: {e}")
            metadata["extraction_success"] = False
            metadata["error"] = str(e)
            raise
    
    def _extract_text_from_pdf(self, file_path: Path) -> str:
        """Extract text from PDF file."""
        import pdfplumber
        
        text_parts = []
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
        
        return "\n\n".join(text_parts)
    
    def _extract_text_from_docx(self, file_path: Path) -> str:
        """Extract text from DOCX file."""
        from docx import Document
        
        doc = Document(file_path)
        text_parts = []
        
        for paragraph in doc.paragraphs:
            if paragraph.text.strip():
                text_parts.append(paragraph.text)
        
        # Also extract text from tables
        for table in doc.tables:
            for row in table.rows:
                row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                if row_text:
                    text_parts.append(row_text)
        
        return "\n\n".join(text_parts)
    
    def _extract_text_from_txt(self, file_path: Path) -> str:
        """Extract text from plain text file."""
        # Try different encodings
        encodings = ['utf-8', 'utf-8-sig', 'latin-1', 'cp1252']
        
        for encoding in encodings:
            try:
                with open(file_path, 'r', encoding=encoding) as f:
                    return f.read()
            except UnicodeDecodeError:
                continue
        
        # If all encodings fail, try with errors='replace'
        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
            return f.read()
    
    def _extract_text_from_html(self, file_path: Path) -> str:
        """Extract text from HTML file."""
        from bs4 import BeautifulSoup
        
        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
            soup = BeautifulSoup(f.read(), 'html.parser')
        
        # Remove script and style elements
        for script in soup(["script", "style", "nav", "footer", "header"]):
            script.decompose()
        
        # Extract text
        text = soup.get_text(separator='\n', strip=True)
        
        # Clean up multiple newlines
        text = re.sub(r'\n\s*\n', '\n\n', text)
        
        return text
    
    def chunk_text(self, text: str, metadata: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Chunk text into overlapping segments for embedding.
        
        Args:
            text: Text to chunk
            metadata: Optional metadata to attach to each chunk
            
        Returns:
            List of chunk dicts with keys: 'text', 'metadata', 'chunk_index'
        """
        if not text.strip():
            return []
        
        # Estimate tokens (rough approximation: 1 token ≈ 4 characters)
        # This is a simple heuristic; for production, consider using tiktoken
        chunk_size_chars = self.chunk_size_tokens * 4
        chunk_overlap_chars = self.chunk_overlap_tokens * 4
        
        chunks = []
        start = 0
        chunk_index = 0
        
        while start < len(text):
            # Calculate end position
            end = start + chunk_size_chars
            
            # Extract chunk
            chunk_text = text[start:end]
            
            # Try to break at sentence/paragraph boundary if possible
            if end < len(text):
                # Look for paragraph break (double newline) within overlap region
                overlap_region = text[max(start, end - chunk_overlap_chars):end]
                para_break = overlap_region.rfind('\n\n')
                
                if para_break != -1:
                    # Adjust end to paragraph boundary
                    end = max(start, end - chunk_overlap_chars) + para_break + 2
                    chunk_text = text[start:end]
                else:
                    # Look for sentence boundary (period + space/newline)
                    sentence_break = overlap_region.rfind('. ')
                    if sentence_break == -1:
                        sentence_break = overlap_region.rfind('.\n')
                    
                    if sentence_break != -1:
                        end = max(start, end - chunk_overlap_chars) + sentence_break + 2
                        chunk_text = text[start:end]
            
            # Create chunk metadata
            chunk_metadata = {
                "chunk_index": chunk_index,
                "chunk_start": start,
                "chunk_end": min(end, len(text)),
                **(metadata or {}),
            }
            
            chunks.append({
                "text": chunk_text.strip(),
                "metadata": chunk_metadata,
                "chunk_index": chunk_index,
            })
            
            # Move start position (with overlap)
            if end >= len(text):
                break
            
            start = end - chunk_overlap_chars
            chunk_index += 1
        
        logger.info(f"Chunked text into {len(chunks)} chunks (target size: {self.chunk_size_tokens} tokens, overlap: {self.chunk_overlap_tokens} tokens)")
        return chunks
    
    def get_text_preview(self, text: str, max_length: int = 10000) -> str:
        """Get a preview of text (truncated for display).
        
        Args:
            text: Full text
            max_length: Maximum length for preview
            
        Returns:
            Truncated text with ellipsis if needed
        """
        if len(text) <= max_length:
            return text
        
        # Try to truncate at sentence boundary
        truncated = text[:max_length]
        last_period = truncated.rfind('.')
        last_newline = truncated.rfind('\n')
        
        # Use the later boundary
        boundary = max(last_period, last_newline)
        
        if boundary > max_length * 0.8:  # Only use boundary if it's not too early
            return text[:boundary + 1] + "\n\n..."
        else:
            return text[:max_length] + "..."

