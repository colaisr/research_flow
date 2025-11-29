"""
Embedding generation service for RAG.
Uses OpenRouter API (OpenAI-compatible) for generating embeddings.
"""
from typing import List, Optional, Dict, Any
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
        user_id: Optional[int] = None,
        organization_id: Optional[int] = None,
        db: Optional[Session] = None,
        source_name: Optional[str] = None,
    ) -> List[float]:
        """Generate embedding for a single text.
        
        Args:
            text: Text to embed
            model: Embedding model (defaults to DEFAULT_EMBEDDING_MODEL)
            user_id: Optional user ID for token consumption tracking
            organization_id: Optional organization ID for token consumption tracking
            db: Optional database session for token consumption tracking
            
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
            
            # Extract token usage from response
            total_tokens = 0
            if hasattr(response, 'usage') and response.usage:
                total_tokens = getattr(response.usage, 'total_tokens', 0)
                if total_tokens == 0:
                    total_tokens = getattr(response.usage, 'prompt_tokens', 0)
            # If no usage info, estimate from text length (1 token ≈ 4 chars)
            if total_tokens == 0:
                total_tokens = max(1, len(text) // 4)
                logger.info(f"Estimated tokens from text length: {total_tokens} (text length: {len(text)})")
            logger.info(f"Generated embedding for text (length={len(text)}, model={model}), tokens: {total_tokens}")
            
            # Track token consumption if user_id and organization_id are provided
            if user_id and organization_id and db and total_tokens > 0:
                try:
                    from app.services.balance import charge_tokens
                    from app.services.consumption import record_consumption
                    
                    # Determine provider (extract from model name or default to 'openrouter')
                    provider = "openrouter"  # Embeddings are always via OpenRouter
                    
                    # Charge tokens
                    charge_result = charge_tokens(
                        db=db,
                        user_id=user_id,
                        organization_id=organization_id,
                        amount=total_tokens,
                        source_type="subscription"  # Default to subscription, will fall back to balance if needed
                    )
                    
                    if not charge_result.success:
                        logger.warning(f"Failed to charge tokens for embedding: {charge_result.message}")
                        # Continue anyway - embedding was generated successfully
                    
                    # Determine source type from charge result
                    source_type = "subscription" if charge_result.source == "subscription" else "balance"
                    
                    # Record consumption
                    record_consumption(
                        db=db,
                        user_id=user_id,
                        organization_id=organization_id,
                        model_name=model,
                        provider=provider,
                        input_tokens=total_tokens,
                        output_tokens=0,  # Embeddings don't have output tokens
                        run_id=None,
                        step_id=None,
                        rag_query_id=None,
                        source_type=source_type,
                        source_name=source_name
                    )
                    
                    logger.info(f"Recorded token consumption for embedding: {total_tokens} tokens, source: {source_type}")
                    
                except Exception as e:
                    logger.error(f"Failed to track token consumption for embedding: {e}")
                    # Don't fail the embedding generation if consumption tracking fails
            
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
        user_id: Optional[int] = None,
        organization_id: Optional[int] = None,
        db: Optional[Session] = None,
        source_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate embeddings for multiple texts (batched).
        
        Args:
            texts: List of texts to embed
            model: Embedding model (defaults to DEFAULT_EMBEDDING_MODEL)
            batch_size: Number of texts to process per batch
            user_id: Optional user ID for token consumption tracking
            organization_id: Optional organization ID for token consumption tracking
            db: Optional database session for token consumption tracking
            
        Returns:
            Dict with keys:
            - 'embeddings': List of embedding vectors
            - 'total_tokens': Total tokens used (sum across all batches)
            - 'input_tokens': Total input tokens (same as total_tokens for embeddings)
            - 'output_tokens': Always 0 for embeddings
        """
        model = model or self.default_model
        embeddings = []
        total_tokens = 0
        total_input_tokens = 0
        
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
                
                # Extract token usage from response
                # OpenAI embeddings API returns usage info, but OpenRouter might structure it differently
                batch_tokens = 0
                if hasattr(response, 'usage') and response.usage:
                    batch_tokens = getattr(response.usage, 'total_tokens', 0)
                    if batch_tokens == 0:
                        # Try prompt_tokens as fallback
                        batch_tokens = getattr(response.usage, 'prompt_tokens', 0)
                elif hasattr(response, 'usage'):
                    # Usage exists but might be None or empty
                    logger.debug(f"Response has 'usage' attribute but it's empty: {response.usage}")
                
                # If still no tokens, try to estimate from input text length
                # Rough estimate: 1 token ≈ 4 characters for embeddings
                if batch_tokens == 0:
                    total_chars = sum(len(text) for text in batch)
                    batch_tokens = max(1, total_chars // 4)  # Rough estimate, minimum 1 token
                    logger.info(f"Estimated tokens from text length: {batch_tokens} (for {len(batch)} texts, {total_chars} chars)")
                
                total_tokens += batch_tokens
                total_input_tokens += batch_tokens  # Embeddings only use input tokens
                logger.info(f"Generated {len(batch_embeddings)} embeddings (batch {i//batch_size + 1}), tokens: {batch_tokens}")
            
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
        
        logger.info(f"Generated {len(embeddings)} embeddings total, tokens used: {total_tokens}")
        
        # Track token consumption if user_id and organization_id are provided
        if user_id and organization_id and db and total_tokens > 0:
            try:
                from app.services.balance import charge_tokens
                from app.services.consumption import record_consumption
                
                # Determine provider (extract from model name or default to 'openrouter')
                provider = "openrouter"  # Embeddings are always via OpenRouter
                
                # Charge tokens
                charge_result = charge_tokens(
                    db=db,
                    user_id=user_id,
                    organization_id=organization_id,
                    amount=total_tokens,
                    source_type="subscription"  # Default to subscription, will fall back to balance if needed
                )
                
                if not charge_result.success:
                    logger.warning(f"Failed to charge tokens for embedding: {charge_result.message}")
                    # Continue anyway - embeddings were generated successfully
                
                # Determine source type from charge result
                source_type = "subscription" if charge_result.source == "subscription" else "balance"
                
                # Record consumption
                record_consumption(
                    db=db,
                    user_id=user_id,
                    organization_id=organization_id,
                    model_name=model,
                    provider=provider,
                    input_tokens=total_input_tokens,
                    output_tokens=0,  # Embeddings don't have output tokens
                    run_id=None,
                    step_id=None,
                    rag_query_id=None,  # Could be set to doc_id if we track it
                    source_type=source_type,
                    source_name=source_name
                )
                
                logger.info(f"Recorded token consumption for embedding: {total_tokens} tokens, source: {source_type}")
                
            except Exception as e:
                logger.error(f"Failed to track token consumption for embedding: {e}")
                # Don't fail the embedding generation if consumption tracking fails
        
        return {
            "embeddings": embeddings,
            "total_tokens": total_tokens,
            "input_tokens": total_input_tokens,
            "output_tokens": 0,
        }

