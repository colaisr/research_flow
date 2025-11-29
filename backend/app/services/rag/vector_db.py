"""
Vector database abstraction layer for RAG.
Supports multiple backends (ChromaDB, Qdrant) via abstraction.
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


class VectorDBBackend(ABC):
    """Abstract base class for vector database backends."""
    
    @abstractmethod
    def create_collection(self, rag_id: int, collection_path: Path) -> None:
        """Create a new collection for a RAG knowledge base.
        
        Args:
            rag_id: RAG knowledge base ID
            collection_path: Path where collection should be stored
        """
        pass
    
    @abstractmethod
    def add_documents(
        self,
        rag_id: int,
        embeddings: List[List[float]],
        documents: List[str],
        metadatas: List[Dict[str, Any]],
        ids: List[str],
    ) -> None:
        """Add documents with embeddings to the collection.
        
        Args:
            rag_id: RAG knowledge base ID
            embeddings: List of embedding vectors (each is a list of floats)
            documents: List of document text chunks
            metadatas: List of metadata dicts (one per document)
            ids: List of unique document chunk IDs
        """
        pass
    
    @abstractmethod
    def search(
        self,
        rag_id: int,
        query_embedding: List[float],
        top_k: int = 5,
        filter_metadata: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """Search for similar documents.
        
        Args:
            rag_id: RAG knowledge base ID
            query_embedding: Query embedding vector
            top_k: Number of results to return
            filter_metadata: Optional metadata filters
            
        Returns:
            List of dicts with keys: 'document', 'metadata', 'distance', 'id'
        """
        pass
    
    @abstractmethod
    def delete_collection(self, rag_id: int) -> None:
        """Delete a collection (used when RAG is deleted).
        
        Args:
            rag_id: RAG knowledge base ID
        """
        pass
    
    @abstractmethod
    def clear_collection(self, rag_id: int) -> None:
        """Clear all documents from a collection (keep collection).
        
        Args:
            rag_id: RAG knowledge base ID
        """
        pass
    
    @abstractmethod
    def get_collection_count(self, rag_id: int) -> int:
        """Get the number of documents in a collection.
        
        Args:
            rag_id: RAG knowledge base ID
            
        Returns:
            Number of documents/chunks in collection
        """
        pass
    
    @abstractmethod
    def delete_document(self, rag_id: int, document_id: int) -> None:
        """Delete all chunks for a specific document.
        
        Args:
            rag_id: RAG knowledge base ID
            document_id: Document ID (used to filter chunks by metadata['document_id'])
        """
        pass


class ChromaDBBackend(VectorDBBackend):
    """ChromaDB implementation of vector database backend."""
    
    def __init__(self, storage_path: Path):
        """Initialize ChromaDB backend.
        
        Args:
            storage_path: Base path for ChromaDB storage
        """
        import chromadb
        from chromadb.config import Settings
        
        self.storage_path = storage_path
        self.storage_path.mkdir(parents=True, exist_ok=True)
        
        # Initialize ChromaDB client (persistent, file-based)
        self.client = chromadb.PersistentClient(
            path=str(storage_path),
            settings=Settings(
                anonymized_telemetry=False,
                allow_reset=True,
            )
        )
        logger.info(f"ChromaDB initialized at {storage_path}")
    
    def _get_collection_name(self, rag_id: int) -> str:
        """Get collection name for a RAG."""
        return f"rag_{rag_id}"
    
    def _get_collection(self, rag_id: int):
        """Get or create collection for a RAG."""
        collection_name = self._get_collection_name(rag_id)
        try:
            return self.client.get_collection(name=collection_name)
        except Exception as e:
            # Collection doesn't exist, or has schema error - create it
            error_str = str(e).lower()
            if "topic" in error_str or "no such column" in error_str:
                # Schema error - delete and recreate
                logger.warning(f"Schema error accessing collection {collection_name}, recreating...")
                try:
                    self.client.delete_collection(name=collection_name)
                except Exception:
                    pass  # Collection might not exist
            return self.client.create_collection(name=collection_name)
    
    def create_collection(self, rag_id: int, collection_path: Path) -> None:
        """Create a new collection for a RAG knowledge base."""
        collection_name = self._get_collection_name(rag_id)
        try:
            # Try to get existing collection
            self.client.get_collection(name=collection_name)
            logger.info(f"Collection {collection_name} already exists")
        except Exception as e:
            # If collection doesn't exist or there's a schema error, try to create it
            try:
                # Create new collection
                self.client.create_collection(name=collection_name)
                logger.info(f"Created ChromaDB collection: {collection_name}")
            except Exception as create_error:
                # If creation fails due to schema issues, reset ChromaDB and retry
                error_str = str(create_error)
                if "topic" in error_str.lower() or "no such column" in error_str.lower():
                    logger.warning(f"ChromaDB schema error detected: {create_error}. Attempting to reset...")
                    try:
                        # Reset ChromaDB client (this will recreate the database with correct schema)
                        import chromadb
                        from chromadb.config import Settings
                        # Delete the database file
                        db_file = Path(self.storage_path) / "chroma.sqlite3"
                        if db_file.exists():
                            db_file.unlink()
                            logger.info("Deleted old ChromaDB database file")
                        
                        # Reinitialize client
                        self.client = chromadb.PersistentClient(
                            path=str(self.storage_path),
                            settings=Settings(
                                anonymized_telemetry=False,
                                allow_reset=True,
                            )
                        )
                        # Try creating collection again
                        self.client.create_collection(name=collection_name)
                        logger.info(f"Created ChromaDB collection {collection_name} after schema reset")
                    except Exception as reset_error:
                        logger.error(f"Failed to reset ChromaDB schema: {reset_error}")
                        raise
                else:
                    raise
    
    def add_documents(
        self,
        rag_id: int,
        embeddings: List[List[float]],
        documents: List[str],
        metadatas: List[Dict[str, Any]],
        ids: List[str],
    ) -> None:
        """Add documents with embeddings to the collection."""
        if not all([embeddings, documents, metadatas, ids]):
            raise ValueError("All parameters (embeddings, documents, metadatas, ids) must be provided")
        
        if not all(len(lst) == len(embeddings) for lst in [documents, metadatas, ids]):
            raise ValueError("All lists must have the same length")
        
        collection = self._get_collection(rag_id)
        collection.add(
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas,
            ids=ids,
        )
        logger.info(f"Added {len(documents)} documents to collection rag_{rag_id}")
    
    def search(
        self,
        rag_id: int,
        query_embedding: List[float],
        top_k: int = 5,
        filter_metadata: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """Search for similar documents."""
        collection = self._get_collection(rag_id)
        
        # ChromaDB uses where clause for filtering
        where = filter_metadata if filter_metadata else None
        
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=where,
        )
        
        # Transform ChromaDB results to standard format
        output = []
        if results['documents'] and len(results['documents'][0]) > 0:
            for i in range(len(results['documents'][0])):
                output.append({
                    'document': results['documents'][0][i],
                    'metadata': results['metadatas'][0][i] if results['metadatas'] else {},
                    'distance': results['distances'][0][i] if results['distances'] else None,
                    'id': results['ids'][0][i] if results['ids'] else None,
                })
        
        return output
    
    def delete_collection(self, rag_id: int) -> None:
        """Delete a collection."""
        collection_name = self._get_collection_name(rag_id)
        try:
            self.client.delete_collection(name=collection_name)
            logger.info(f"Deleted ChromaDB collection: {collection_name}")
        except Exception as e:
            logger.warning(f"Failed to delete collection {collection_name}: {e}")
    
    def clear_collection(self, rag_id: int) -> None:
        """Clear all documents from a collection."""
        collection = self._get_collection(rag_id)
        # Get all IDs and delete them
        try:
            all_data = collection.get()
            if all_data['ids']:
                collection.delete(ids=all_data['ids'])
                logger.info(f"Cleared {len(all_data['ids'])} documents from collection rag_{rag_id}")
        except Exception as e:
            logger.warning(f"Failed to clear collection rag_{rag_id}: {e}")
    
    def get_collection_count(self, rag_id: int) -> int:
        """Get the number of documents in a collection."""
        collection = self._get_collection(rag_id)
        try:
            count = collection.count()
            return count
        except Exception:
            return 0
    
    def delete_document(self, rag_id: int, document_id: int) -> None:
        """Delete all chunks for a specific document."""
        collection = self._get_collection(rag_id)
        try:
            # ChromaDB allows deleting by metadata filter
            # We filter by document_id in metadata
            collection.delete(
                where={"document_id": document_id}
            )
            logger.info(f"Deleted all chunks for document {document_id} from RAG {rag_id}")
        except Exception as e:
            logger.warning(f"Failed to delete chunks for document {document_id} from RAG {rag_id}: {e}")
            # Don't raise - allow deletion to continue even if vector DB deletion fails


class QdrantBackend(VectorDBBackend):
    """Qdrant implementation of vector database backend (future)."""
    
    def __init__(self, storage_path: Path):
        """Initialize Qdrant backend (not implemented yet)."""
        raise NotImplementedError("Qdrant backend not yet implemented")
    
    def create_collection(self, rag_id: int, collection_path: Path) -> None:
        raise NotImplementedError("Qdrant backend not yet implemented")
    
    def add_documents(
        self,
        rag_id: int,
        embeddings: List[List[float]],
        documents: List[str],
        metadatas: List[Dict[str, Any]],
        ids: List[str],
    ) -> None:
        raise NotImplementedError("Qdrant backend not yet implemented")
    
    def search(
        self,
        rag_id: int,
        query_embedding: List[float],
        top_k: int = 5,
        filter_metadata: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        raise NotImplementedError("Qdrant backend not yet implemented")
    
    def delete_collection(self, rag_id: int) -> None:
        raise NotImplementedError("Qdrant backend not yet implemented")
    
    def clear_collection(self, rag_id: int) -> None:
        raise NotImplementedError("Qdrant backend not yet implemented")
    
    def get_collection_count(self, rag_id: int) -> int:
        raise NotImplementedError("Qdrant backend not yet implemented")
    
    def delete_document(self, rag_id: int, document_id: int) -> None:
        """Delete all chunks for a specific document."""
        raise NotImplementedError("Qdrant backend not yet implemented")


class VectorDB:
    """Vector database abstraction layer."""
    
    def __init__(self, backend_type: Optional[str] = None, storage_path: Optional[Path] = None):
        """Initialize vector database with specified backend.
        
        Args:
            backend_type: Backend type ("chromadb" or "qdrant"). If None, uses VECTOR_DB_BACKEND from config.
            storage_path: Base path for vector DB storage (required for ChromaDB). If None, uses STORAGE_BASE_PATH from config.
        """
        if backend_type is None:
            from app.core.config import VECTOR_DB_BACKEND
            backend_type = VECTOR_DB_BACKEND
        
        if storage_path is None:
            from app.core.config import STORAGE_BASE_PATH
            base_path = Path(STORAGE_BASE_PATH)
            storage_path = base_path / "rag_vectors"
        
        if backend_type == "chromadb":
            self.backend = ChromaDBBackend(storage_path)
        elif backend_type == "qdrant":
            self.backend = QdrantBackend(storage_path)
        else:
            raise ValueError(f"Unknown backend type: {backend_type}")
        
        self.backend_type = backend_type
    
    def create_collection(self, rag_id: int) -> None:
        """Create a new collection for a RAG."""
        # For ChromaDB, collection_path is not needed (collections are named)
        # For future Qdrant, we might need the path
        collection_path = Path(self.backend.storage_path) / f"rag_{rag_id}" if hasattr(self.backend, 'storage_path') else Path()
        self.backend.create_collection(rag_id, collection_path)
    
    def add_documents(
        self,
        rag_id: int,
        embeddings: List[List[float]],
        documents: List[str],
        metadatas: List[Dict[str, Any]],
        ids: List[str],
    ) -> None:
        """Add documents with embeddings."""
        self.backend.add_documents(rag_id, embeddings, documents, metadatas, ids)
    
    def search(
        self,
        rag_id: int,
        query_embedding: List[float],
        top_k: int = 5,
        filter_metadata: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """Search for similar documents."""
        return self.backend.search(rag_id, query_embedding, top_k, filter_metadata)
    
    def delete_collection(self, rag_id: int) -> None:
        """Delete a collection."""
        self.backend.delete_collection(rag_id)
    
    def clear_collection(self, rag_id: int) -> None:
        """Clear all documents from a collection."""
        self.backend.clear_collection(rag_id)
    
    def get_collection_count(self, rag_id: int) -> int:
        """Get the number of documents in a collection."""
        return self.backend.get_collection_count(rag_id)
    
    def delete_document(self, rag_id: int, document_id: int) -> None:
        """Delete all chunks for a specific document."""
        self.backend.delete_document(rag_id, document_id)

