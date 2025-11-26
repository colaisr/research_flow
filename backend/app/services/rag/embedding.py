"""
Embedding generation service for RAG.
Uses OpenRouter API (OpenAI-compatible) for generating embeddings.
"""
from typing import List, Optional
from openai import OpenAI
from sqlalchemy.orm import Session
import logging

from app.core.config import (
    OPENROUTER_BASE_URL,
    DEFAULT_EMBEDDING_MODEL,
    OPENROUTER_API_KEY,
)
from app.services.llm.client import get_openrouter_api_key

logger = logging.getLogger(__name__)


class EmbeddingService:
    """Service for generating embeddings via OpenRouter."""
    
    def __init__(self, api_key: Optional[str] = None, db: Optional[Session] = None):
        """Initialize embedding service.
        
        Args:
            api_key: Optional API key. If not provided, will read from Settings (AppSettings table)
            db: Database session (required if api_key not provided)
        """
        # Get API key: use provided, or fetch from Settings
        if not api_key:
            api_key = get_openrouter_api_key(db)
        
        if not api_key:
            # Fallback to config (for development)
            api_key = OPENROUTER_API_KEY
        
        if not api_key:
            raise ValueError(
                "OpenRouter API key not configured. "
                "Please set it in Settings → OpenRouter Configuration"
            )
        
        self.api_key = api_key
        
        # Create OpenAI client without proxies to avoid version compatibility issues
        import httpx
        http_client = httpx.Client(
            timeout=60.0,
            follow_redirects=True,
        )
        
        self.client = OpenAI(
            api_key=api_key,
            base_url=OPENROUTER_BASE_URL,
            http_client=http_client,
        )
        self.default_model = DEFAULT_EMBEDDING_MODEL
    
    def generate_embedding(
        self,
        text: str,
        model: Optional[str] = None,
    ) -> List[float]:
        """Generate embedding for a single text.
        
        Args:
            text: Text to embed
            model: Embedding model (defaults to DEFAULT_EMBEDDING_MODEL)
            
        Returns:
            Embedding vector as list of floats
        """
        model = model or self.default_model
        
        try:
            response = self.client.embeddings.create(
                model=model,
                input=text,
            )
            
            embedding = response.data[0].embedding
            logger.debug(f"Generated embedding for text (length={len(text)}, model={model})")
            return embedding
        
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Failed to generate embedding: {error_msg}")
            
            # Check if it's an authentication error
            if "401" in error_msg or "unauthorized" in error_msg.lower() or "invalid" in error_msg.lower():
                raise ValueError(
                    f"OpenRouter API key is invalid or expired. "
                    f"Please update it in Settings → OpenRouter Configuration. Error: {error_msg}"
                )
            
            raise ValueError(f"Failed to generate embedding: {error_msg}")
    
    def generate_embeddings_batch(
        self,
        texts: List[str],
        model: Optional[str] = None,
        batch_size: int = 100,
    ) -> List[List[float]]:
        """Generate embeddings for multiple texts (batched).
        
        Args:
            texts: List of texts to embed
            model: Embedding model (defaults to DEFAULT_EMBEDDING_MODEL)
            batch_size: Number of texts to process per batch
            
        Returns:
            List of embedding vectors
        """
        model = model or self.default_model
        embeddings = []
        
        # Process in batches
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            
            try:
                response = self.client.embeddings.create(
                    model=model,
                    input=batch,
                )
                
                batch_embeddings = [item.embedding for item in response.data]
                embeddings.extend(batch_embeddings)
                
                logger.debug(f"Generated {len(batch_embeddings)} embeddings (batch {i//batch_size + 1})")
            
            except Exception as e:
                error_msg = str(e)
                logger.error(f"Failed to generate embeddings batch: {error_msg}")
                
                # Check if it's an authentication error
                if "401" in error_msg or "unauthorized" in error_msg.lower() or "invalid" in error_msg.lower():
                    raise ValueError(
                        f"OpenRouter API key is invalid or expired. "
                        f"Please update it in Settings → OpenRouter Configuration. Error: {error_msg}"
                    )
                
                raise ValueError(f"Failed to generate embeddings batch: {error_msg}")
        
        logger.info(f"Generated {len(embeddings)} embeddings total")
        return embeddings

