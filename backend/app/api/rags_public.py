"""
Public RAG access endpoints (no authentication required, uses token).
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from pathlib import Path
import logging

from app.core.database import get_db
from app.models.rag_knowledge_base import RAGKnowledgeBase
from app.models.rag_document import RAGDocument, EmbeddingStatus
from app.services.rag import VectorDB, EmbeddingService, RAGStorage, DocumentProcessor
from app.core.config import RAG_MIN_SIMILARITY_SCORE
from app.api.rags import DocumentResponse, QueryRAGResponse, _process_document_embeddings
from fastapi.responses import FileResponse

router = APIRouter()
logger = logging.getLogger(__name__)


def get_rag_by_token(db: Session, token: str) -> RAGKnowledgeBase:
    """Get RAG by public access token."""
    rag = db.query(RAGKnowledgeBase).filter(
        RAGKnowledgeBase.public_access_token == token,
        RAGKnowledgeBase.public_access_enabled == True
    ).first()
    
    if not rag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="RAG not found or public access is disabled"
        )
    
    return rag


@router.get("/rags/public/{token}", response_model=dict)
async def get_public_rag(
    token: str,
    db: Session = Depends(get_db)
):
    """Get RAG details by public token (no auth required)."""
    rag = get_rag_by_token(db, token)
    
    return {
        "id": rag.id,
        "name": rag.name,
        "description": rag.description,
        "document_count": rag.document_count,
        "public_access_mode": rag.public_access_mode,
        "created_at": rag.created_at,
        "updated_at": rag.updated_at,
    }


@router.get("/rags/public/{token}/documents", response_model=List[DocumentResponse])
async def list_public_documents(
    token: str,
    db: Session = Depends(get_db)
):
    """List documents in public RAG (no auth required)."""
    rag = get_rag_by_token(db, token)
    
    documents = db.query(RAGDocument).filter(
        RAGDocument.rag_id == rag.id
    ).order_by(RAGDocument.created_at.desc()).all()
    
    return [
        DocumentResponse(
            id=doc.id,
            rag_id=doc.rag_id,
            title=doc.title,
            content=doc.content,
            file_path=doc.file_path,
            document_metadata=doc.document_metadata,
            embedding_status=doc.embedding_status,
            created_at=doc.created_at,
            updated_at=doc.updated_at
        )
        for doc in documents
    ]


@router.post("/rags/public/{token}/documents", response_model=DocumentResponse)
async def upload_public_document(
    token: str,
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """Upload document to public RAG (no auth required, but requires folder_only or full_editor mode)."""
    logger.info(f"Public upload request for token: {token}, filename: {file.filename}")
    try:
        rag = get_rag_by_token(db, token)
    except Exception as e:
        logger.error(f"Failed to get RAG by token {token}: {e}")
        raise
    
    # Check if mode allows uploads
    if rag.public_access_mode not in ['folder_only', 'full_editor']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Document upload is not allowed for this RAG"
        )
    
    # Same logic as regular upload endpoint
    doc_title = title or file.filename or "Untitled"
    filename = file.filename or "file"
    file_ext = Path(filename).suffix.lower()
    
    # Check file type BEFORE creating document record
    supported_extensions = [".pdf", ".docx", ".doc", ".txt", ".html", ".htm"]
    
    if file_ext not in supported_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: {file_ext}. Supported types: {', '.join(supported_extensions)}"
        )

    processor = DocumentProcessor()

    doc = RAGDocument(
        rag_id=rag.id,
        title=doc_title,
        content="",
        embedding_status=EmbeddingStatus.PENDING.value
    )
    db.add(doc)
    db.flush()
    
    storage = RAGStorage()
    file_path = storage.get_document_file_path(rag.id, doc.id, filename)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    
    logger.info(f"Public upload: Saving file to {file_path}, RAG ID: {rag.id}, Doc ID: {doc.id}")
    try:
        with open(file_path, "wb") as f:
            content = await file.read()
            logger.info(f"Public upload: Received {len(content)} bytes")
            f.write(content)
        
        try:
            text, metadata = processor.extract_text_from_file(file_path)
            doc.content = text
            doc.file_path = storage.get_relative_path(file_path)
            doc.document_metadata = {
                **(metadata or {}),
                "original_filename": filename,
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
                "uploaded_via": "public_link",
            }
            doc.embedding_status = EmbeddingStatus.PROCESSING.value
            
            db.commit()
            db.refresh(doc)
            
            try:
                _process_document_embeddings(db, rag.id, doc.id)
            except Exception as e:
                logger.error(f"Failed to process embeddings for document {doc.id}: {e}")
                doc.embedding_status = EmbeddingStatus.FAILED.value
                db.commit()
            
        except Exception as e:
            logger.error(f"Failed to extract text from file: {e}")
            if file_path.exists():
                try:
                    file_path.unlink()
                except:
                    pass
            db.delete(doc)
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to process document: {str(e)}"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to save uploaded file: {e}")
        db.delete(doc)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save uploaded file: {str(e)}"
        )
    
    rag.document_count = db.query(RAGDocument).filter(
        RAGDocument.rag_id == rag.id,
        RAGDocument.embedding_status == EmbeddingStatus.COMPLETED.value
    ).count()
    rag.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return DocumentResponse(
        id=doc.id,
        rag_id=doc.rag_id,
        title=doc.title,
        content=doc.content,
        file_path=doc.file_path,
        document_metadata=doc.document_metadata,
        embedding_status=doc.embedding_status,
        created_at=doc.created_at,
        updated_at=doc.updated_at
    )


@router.delete("/rags/public/{token}/documents/{doc_id}")
async def delete_public_document(
    token: str,
    doc_id: int,
    db: Session = Depends(get_db)
):
    """Delete document from public RAG (no auth required, but requires folder_only or full_editor mode)."""
    rag = get_rag_by_token(db, token)
    
    if rag.public_access_mode not in ['folder_only', 'full_editor']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Document deletion is not allowed for this RAG"
        )
    
    doc = db.query(RAGDocument).filter(
        RAGDocument.id == doc_id,
        RAGDocument.rag_id == rag.id
    ).first()
    
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    # Delete file if exists
    if doc.file_path:
        storage = RAGStorage()
        file_path = storage.get_absolute_path(doc.file_path)
        if file_path.exists():
            try:
                file_path.unlink()
            except Exception as e:
                logger.warning(f"Failed to delete file {file_path}: {e}")
    
    # Delete embeddings from vector DB
    try:
        vector_db = VectorDB()
        vector_db.delete_document(rag.id, doc_id)
    except Exception as e:
        logger.warning(f"Failed to delete embeddings for document {doc_id}: {e}")
    
    db.delete(doc)
    
    # Update document count
    rag.document_count = db.query(RAGDocument).filter(
        RAGDocument.rag_id == rag.id,
        RAGDocument.embedding_status == EmbeddingStatus.COMPLETED.value
    ).count()
    rag.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return {"success": True}


@router.get("/rags/public/{token}/download/{doc_id}")
async def download_public_document(
    token: str,
    doc_id: int,
    db: Session = Depends(get_db)
):
    """Download document from public RAG (no auth required)."""
    rag = get_rag_by_token(db, token)
    
    doc = db.query(RAGDocument).filter(
        RAGDocument.id == doc_id,
        RAGDocument.rag_id == rag.id
    ).first()
    
    if not doc or not doc.file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    storage = RAGStorage()
    file_path = storage.get_absolute_path(doc.file_path)
    
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    from fastapi.responses import FileResponse
    return FileResponse(
        path=str(file_path),
        filename=doc.document_metadata.get('original_filename', 'file') if doc.document_metadata else 'file',
        media_type='application/octet-stream'
    )


@router.post("/rags/public/{token}/query", response_model=QueryRAGResponse)
async def query_public_rag(
    token: str,
    request: dict,
    db: Session = Depends(get_db)
):
    """Query public RAG (no auth required, but requires full_editor mode)."""
    rag = get_rag_by_token(db, token)
    
    if rag.public_access_mode != 'full_editor':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Query is only available in full_editor mode"
        )
    
    query_text = request.get('query', '').strip()
    if not query_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query text is required"
        )
    
    top_k = request.get('top_k', 5)
    min_score = request.get('min_score')
    
    # Generate query embedding
    embedding_service = EmbeddingService(db=db)
    try:
        query_embedding = embedding_service.generate_embedding(query_text)
    except Exception as e:
        logger.error(f"Failed to generate embedding for query: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate query embedding: {str(e)}"
        )
    
    # Search vector DB
    vector_db = VectorDB()
    try:
        results = vector_db.search(rag.id, query_embedding, top_k=top_k)
    except Exception as e:
        logger.error(f"Failed to search vector DB for RAG {rag.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to search knowledge base: {str(e)}"
        )
    
    # Format results and apply minimum score threshold
    if min_score is None:
        min_score = rag.min_similarity_score
    if min_score is None:
        min_score = RAG_MIN_SIMILARITY_SCORE
    
    formatted_results = []
    for result in results:
        distance = result.get('distance')
        
        if min_score is not None and distance is not None:
            if distance > min_score:
                continue
        
        formatted_results.append({
            "document": result.get('document', ''),
            "metadata": result.get('metadata', {}),
            "distance": distance,
            "id": result.get('id'),
        })
    
    return QueryRAGResponse(
        query=query_text,
        results=formatted_results,
        top_k=top_k
    )

