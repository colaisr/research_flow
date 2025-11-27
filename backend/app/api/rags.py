"""
RAG (Knowledge Base) management API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from pathlib import Path
import logging
import secrets
import urllib.parse

from app.core.database import get_db
from app.models.user import User
from app.models.organization import Organization
from app.models.rag_knowledge_base import RAGKnowledgeBase
from app.models.rag_document import RAGDocument, EmbeddingStatus
from app.models.rag_access import RAGAccess, RAGRole
from app.models.user_tool import UserTool, ToolType
from app.core.auth import get_current_user_dependency, get_current_organization_dependency
from app.services.rag import VectorDB, EmbeddingService, RAGStorage, DocumentProcessor
from app.core.config import DEFAULT_EMBEDDING_MODEL, VECTOR_DB_BACKEND, RAG_MIN_SIMILARITY_SCORE, RAG_DEFAULT_MIN_SIMILARITY_SCORE
from app.services.tools.encryption import encrypt_tool_config, decrypt_tool_config

router = APIRouter()
logger = logging.getLogger(__name__)


# Request/Response Models
class CreateRAGRequest(BaseModel):
    name: str
    description: Optional[str] = None


class UpdateRAGRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    min_similarity_score: Optional[float] = None  # Minimum similarity score threshold. None = no filtering.


class RAGResponse(BaseModel):
    id: int
    organization_id: int
    name: str
    description: Optional[str]
    min_similarity_score: Optional[float] = None
    vector_db_type: str
    embedding_model: str
    document_count: int
    public_access_token: Optional[str] = None
    public_access_mode: Optional[str] = None
    public_access_enabled: bool = False
    created_at: datetime
    updated_at: Optional[datetime]
    user_role: Optional[str] = None  # User's role for this RAG

    class Config:
        from_attributes = True


class DocumentResponse(BaseModel):
    id: int
    rag_id: int
    title: str
    content: str
    file_path: Optional[str]
    document_metadata: Optional[Dict[str, Any]]
    embedding_status: str
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class ShareRAGRequest(BaseModel):
    user_id: int
    role: str  # 'editor', 'file_manager', 'viewer'


class QueryRAGRequest(BaseModel):
    query: str
    top_k: int = 5
    min_score: Optional[float] = None  # Minimum similarity score (distance threshold). If None, uses default from config.


class QueryRAGResponse(BaseModel):
    results: List[Dict[str, Any]]
    query: str
    top_k: int


class BulkDeleteDocumentsRequest(BaseModel):
    document_ids: List[int]


# Helper Functions
def get_rag_with_access(
    db: Session,
    rag_id: int,
    user: User,
    organization: Organization,
    required_role: Optional[str] = None
) -> tuple[RAGKnowledgeBase, Optional[str]]:
    """Get RAG and check user access.
    
    All organization members automatically have Editor access to all RAGs in the organization.
    Owner is determined by RAGAccess entry (creator gets Owner role on creation).
    
    Args:
        db: Database session
        rag_id: RAG ID
        user: Current user
        organization: Current organization
        required_role: Required role (None = any access)
        
    Returns:
        Tuple of (RAG, user_role)
        
    Raises:
        HTTPException: If RAG not found or access denied
    """
    # Get RAG
    rag = db.query(RAGKnowledgeBase).filter(
        RAGKnowledgeBase.id == rag_id,
        RAGKnowledgeBase.organization_id == organization.id
    ).first()
    
    if not rag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="RAG not found"
        )
    
    # Check if user is member of organization
    from app.models.organization import OrganizationMember
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == organization.id,
        OrganizationMember.user_id == user.id
    ).first()
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this organization"
        )
    
    # Get user's explicit role (if set via sharing)
    access = db.query(RAGAccess).filter(
        RAGAccess.rag_id == rag_id,
        RAGAccess.user_id == user.id
    ).first()
    
    # Determine user role:
    # - If explicit access entry exists, use that role (Owner, Editor, etc.)
    # - Otherwise, all org members get Editor access by default
    if access:
        user_role = access.role
    else:
        # Default: All organization members have Editor access
        user_role = 'editor'
    
    # Check if user has required role
    if required_role:
        role_hierarchy = {
            'owner': 4,
            'editor': 3,
            'file_manager': 2,
            'viewer': 1,
        }
        
        if role_hierarchy.get(user_role, 0) < role_hierarchy.get(required_role, 0):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {required_role}, your role: {user_role}"
            )
    
    return rag, user_role


def get_user_rags(
    db: Session,
    user: User,
    organization: Organization
) -> List[RAGKnowledgeBase]:
    """Get all RAGs user has access to in the organization.
    
    All organization members automatically have access to all RAGs in the organization.
    """
    # Check if user is member of organization
    from app.models.organization import OrganizationMember
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == organization.id,
        OrganizationMember.user_id == user.id
    ).first()
    
    if not member:
        # User is not a member of this organization
        return []
    
    # Get all RAGs in organization (all members have access)
    rags = db.query(RAGKnowledgeBase).filter(
        RAGKnowledgeBase.organization_id == organization.id
    ).all()
    
    return rags


# RAG CRUD Endpoints
@router.get("/rags", response_model=List[RAGResponse])
async def list_rags(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """List RAGs from current organization.
    
    All organization members automatically have access to all RAGs in the organization.
    """
    rags = get_user_rags(db, current_user, current_organization)
    
    # Add user role to each RAG
    result = []
    for rag in rags:
        # Check explicit access entry (for Owner role)
        access = db.query(RAGAccess).filter(
            RAGAccess.rag_id == rag.id,
            RAGAccess.user_id == current_user.id
        ).first()
        
        # Determine role: explicit access entry or default 'editor' for org members
        user_role = access.role if access else 'editor'
        
        rag_dict = {
            **{c.name: getattr(rag, c.name) for c in rag.__table__.columns},
            'user_role': user_role
        }
        result.append(RAGResponse(**rag_dict))
    
    return result


@router.post("/rags", response_model=RAGResponse)
async def create_rag(
    request: CreateRAGRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Create RAG (creates empty RAG + RAG tool, 1:1 relationship)."""
    # Create RAG knowledge base
    rag = RAGKnowledgeBase(
        organization_id=current_organization.id,
        name=request.name,
        description=request.description,
        vector_db_type=VECTOR_DB_BACKEND,
        embedding_model=DEFAULT_EMBEDDING_MODEL,
        document_count=0,
        min_similarity_score=RAG_DEFAULT_MIN_SIMILARITY_SCORE  # Set default threshold for new RAGs
    )
    
    db.add(rag)
    db.flush()  # Get RAG ID
    
    # Create ChromaDB collection
    try:
        vector_db = VectorDB()
        vector_db.create_collection(rag.id)
    except Exception as e:
        logger.error(f"Failed to create ChromaDB collection for RAG {rag.id}: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create vector database collection: {str(e)}"
        )
    
    # Auto-assign creator as Owner
    access = RAGAccess(
        rag_id=rag.id,
        user_id=current_user.id,
        role=RAGRole.OWNER.value
    )
    db.add(access)
    
    # Create RAG tool (1:1 relationship)
    tool_config = {
        "rag_id": rag.id,
        "name": request.name,
        "description": request.description or "",
    }
    
    tool = UserTool(
        user_id=current_user.id,
        organization_id=current_organization.id,
        tool_type=ToolType.RAG.value,
        display_name=request.name,
        config=encrypt_tool_config(tool_config),
        is_active=True,
        is_shared=True  # RAGs are shared by default
    )
    db.add(tool)
    
    db.commit()
    db.refresh(rag)
    
    # Add user role to response
    rag_dict = {
        **{c.name: getattr(rag, c.name) for c in rag.__table__.columns},
        'user_role': RAGRole.OWNER.value
    }
    
    return RAGResponse(**rag_dict)


@router.get("/rags/{rag_id}", response_model=RAGResponse)
async def get_rag(
    rag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Get RAG details.
    
    All organization members automatically have Editor access.
    """
    rag, user_role = get_rag_with_access(db, rag_id, current_user, current_organization)
    
    rag_dict = {
        **{c.name: getattr(rag, c.name) for c in rag.__table__.columns},
        'user_role': user_role
    }
    
    return RAGResponse(**rag_dict)


@router.put("/rags/{rag_id}", response_model=RAGResponse)
async def update_rag(
    rag_id: int,
    request: UpdateRAGRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Update RAG (Owner only). Also updates associated tool."""
    rag, user_role = get_rag_with_access(db, rag_id, current_user, current_organization, required_role='owner')
    
    # Update fields
    if request.name is not None:
        rag.name = request.name
    if request.description is not None:
        rag.description = request.description
    if request.min_similarity_score is not None:
        rag.min_similarity_score = request.min_similarity_score
    
    rag.updated_at = datetime.now(timezone.utc)
    
    # Update associated tool (display_name and config)
    tools = db.query(UserTool).filter(
        UserTool.tool_type == ToolType.RAG.value,
        UserTool.organization_id == current_organization.id
    ).all()
    
    for tool in tools:
        try:
            config = decrypt_tool_config(tool.config)
            if config.get('rag_id') == rag_id:
                # Update tool display_name if name changed
                if request.name is not None:
                    tool.display_name = request.name
                # Update tool config if name or description changed
                if request.name is not None:
                    config['name'] = request.name
                if request.description is not None:
                    config['description'] = request.description or ""
                tool.config = encrypt_tool_config(config)
                tool.updated_at = datetime.now(timezone.utc)
                break
        except Exception as e:
            logger.warning(f"Failed to update tool for RAG {rag_id}: {e}")
    
    db.commit()
    db.refresh(rag)
    
    rag_dict = {
        **{c.name: getattr(rag, c.name) for c in rag.__table__.columns},
        'user_role': user_role
    }
    
    return RAGResponse(**rag_dict)


@router.delete("/rags/{rag_id}")
async def delete_rag(
    rag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Delete RAG (Owner only). Deletes all files, embeddings, ChromaDB collection."""
    rag, user_role = get_rag_with_access(db, rag_id, current_user, current_organization, required_role='owner')
    
    # Delete all documents and files
    documents = db.query(RAGDocument).filter(RAGDocument.rag_id == rag_id).all()
    storage = RAGStorage()
    
    for doc in documents:
        if doc.file_path:
            file_path = storage.get_absolute_path(doc.file_path)
            storage.delete_file(file_path)
    
    # Delete ChromaDB collection
    try:
        vector_db = VectorDB()
        vector_db.delete_collection(rag_id)
    except Exception as e:
        logger.warning(f"Failed to delete ChromaDB collection for RAG {rag_id}: {e}")
    
    # Delete documents
    db.query(RAGDocument).filter(RAGDocument.rag_id == rag_id).delete()
    
    # Delete access entries
    db.query(RAGAccess).filter(RAGAccess.rag_id == rag_id).delete()
    
    # Delete associated tool
    tools = db.query(UserTool).filter(
        UserTool.tool_type == ToolType.RAG.value,
        UserTool.config.like(f'%"rag_id": {rag_id}%')  # Simple check - could be improved
    ).all()
    for tool in tools:
        # Check if config actually contains this rag_id
        from app.services.tools.encryption import decrypt_tool_config
        try:
            config = decrypt_tool_config(tool.config)
            if config.get('rag_id') == rag_id:
                db.delete(tool)
        except:
            pass
    
    # Delete RAG
    db.delete(rag)
    db.commit()
    
    return {"success": True, "message": "RAG deleted"}


# Sharing & Access Control Endpoints
@router.post("/rags/{rag_id}/share")
async def share_rag(
    rag_id: int,
    request: ShareRAGRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Share RAG (assign roles) (Owner only)."""
    rag, user_role = get_rag_with_access(db, rag_id, current_user, current_organization, required_role='owner')
    
    # Validate role
    valid_roles = ['editor', 'file_manager', 'viewer']
    if request.role not in valid_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role. Must be one of: {', '.join(valid_roles)}"
        )
    
    # Check if user exists and is in same organization
    target_user = db.query(User).filter(User.id == request.user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check if user is member of organization
    from app.models.organization import OrganizationMember
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == current_organization.id,
        OrganizationMember.user_id == request.user_id
    ).first()
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not a member of this organization"
        )
    
    # Get or create access entry
    access = db.query(RAGAccess).filter(
        RAGAccess.rag_id == rag_id,
        RAGAccess.user_id == request.user_id
    ).first()
    
    if access:
        access.role = request.role
        access.updated_at = datetime.now(timezone.utc)
    else:
        access = RAGAccess(
            rag_id=rag_id,
            user_id=request.user_id,
            role=request.role
        )
        db.add(access)
    
    db.commit()
    db.refresh(access)
    
    return {
        "success": True,
        "rag_id": rag_id,
        "user_id": request.user_id,
        "role": request.role
    }


@router.get("/rags/{rag_id}/access")
async def list_rag_access(
    rag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """List users with access (Owner only)."""
    rag, user_role = get_rag_with_access(db, rag_id, current_user, current_organization, required_role='owner')
    
    access_list = db.query(RAGAccess).filter(RAGAccess.rag_id == rag_id).all()
    
    result = []
    for access in access_list:
        user = db.query(User).filter(User.id == access.user_id).first()
        result.append({
            "user_id": access.user_id,
            "user_email": user.email if user else None,
            "user_name": user.full_name if user else None,
            "role": access.role,
            "created_at": access.created_at
        })
    
    return result


@router.delete("/rags/{rag_id}/access/{user_id}")
async def remove_rag_access(
    rag_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Remove user access (Owner only)."""
    rag, user_role = get_rag_with_access(db, rag_id, current_user, current_organization, required_role='owner')
    
    # Don't allow removing owner
    access = db.query(RAGAccess).filter(
        RAGAccess.rag_id == rag_id,
        RAGAccess.user_id == user_id
    ).first()
    
    if not access:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Access entry not found"
        )
    
    if access.role == RAGRole.OWNER.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove owner access"
        )
    
    db.delete(access)
    db.commit()
    
    return {"success": True, "message": "Access removed"}


# Document Management Endpoints
@router.post("/rags/{rag_id}/documents", response_model=DocumentResponse)
async def upload_document(
    rag_id: int,
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Upload document (Owner/Editor/File Manager)."""
    rag, user_role = get_rag_with_access(
        db, rag_id, current_user, current_organization,
        required_role='file_manager'  # file_manager, editor, owner all have access
    )
    
    # Check file type BEFORE creating document record
    filename = file.filename or "file"
    file_ext = Path(filename).suffix.lower()
    supported_extensions = [".pdf", ".docx", ".doc", ".txt", ".html", ".htm", ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff"]
    
    if file_ext not in supported_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: {file_ext}. Supported types: {', '.join(supported_extensions)}"
        )
    
    # Use filename as title if not provided
    doc_title = title or filename or "Untitled"
    
    # Save file
    storage = RAGStorage()
    document_path = storage.get_rag_documents_path(rag_id)
    
    # Create document record first to get ID
    doc = RAGDocument(
        rag_id=rag_id,
        title=doc_title,
        content="",  # Will be filled after extraction
        embedding_status=EmbeddingStatus.PENDING.value
    )
    db.add(doc)
    db.flush()
    
    # Save file
    file_path = storage.get_document_file_path(rag_id, doc.id, filename)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    
    try:
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        # Extract text (PDFs always use AI OCR via OpenRouter)
        processor = DocumentProcessor()
        try:
            text, metadata = processor.extract_text_from_file(file_path)
            doc.content = text
            doc.file_path = storage.get_relative_path(file_path)
            doc.document_metadata = {
                **(metadata or {}),
                "original_filename": filename,
                "uploaded_by": current_user.id,
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
            }
            doc.embedding_status = EmbeddingStatus.PROCESSING.value
            
            db.commit()
            db.refresh(doc)
            
            # TODO: Process embeddings asynchronously (background task)
            # For now, we'll process synchronously (MVP)
            try:
                _process_document_embeddings(db, rag_id, doc.id)
            except Exception as e:
                logger.error(f"Failed to process embeddings for document {doc.id}: {e}")
                doc.embedding_status = EmbeddingStatus.FAILED.value
                db.commit()
            
        except Exception as e:
            logger.error(f"Failed to extract text from file: {e}")
            # Clean up file
            if file_path.exists():
                try:
                    file_path.unlink()
                except:
                    pass
            # Delete document record (only if it's persisted)
            try:
                db.delete(doc)
                db.commit()
            except Exception as delete_error:
                # Document might not be persisted, rollback instead
                logger.warning(f"Could not delete document record: {delete_error}")
                db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to process document: {str(e)}"
            )
    except HTTPException:
        # Re-raise HTTP exceptions (like unsupported file type)
        raise
    except Exception as e:
        # Clean up on any other error
        if file_path.exists():
            try:
                file_path.unlink()
            except:
                pass
        # Delete document record (only if it's persisted)
        try:
            db.delete(doc)
            db.commit()
        except Exception as delete_error:
            # Document might not be persisted, rollback instead
            logger.warning(f"Could not delete document record: {delete_error}")
            db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save file: {str(e)}"
        )
    
    # Update document count
    rag.document_count = db.query(RAGDocument).filter(
        RAGDocument.rag_id == rag_id,
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


@router.post("/rags/{rag_id}/documents/url")
async def import_url(
    rag_id: int,
    url: str = Form(...),
    title: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Import document from URL (Owner/Editor/File Manager)."""
    rag, user_role = get_rag_with_access(
        db, rag_id, current_user, current_organization,
        required_role='file_manager'
    )
    
    # Extract text from URL
    processor = DocumentProcessor()
    try:
        text, metadata = processor.extract_text_from_url(url)
        doc_title = title or metadata.get('url', 'Imported from URL')
        
        # Create document (no file_path for URL imports)
        doc = RAGDocument(
            rag_id=rag_id,
            title=doc_title,
            content=text,
            file_path=None,  # No file stored for URL imports
            document_metadata={
                **(metadata or {}),
                "imported_by": current_user.id,
                "imported_at": datetime.now(timezone.utc).isoformat(),
            },
            embedding_status=EmbeddingStatus.PROCESSING.value
        )
        
        db.add(doc)
        db.commit()
        db.refresh(doc)
        
        # Process embeddings
        try:
            _process_document_embeddings(db, rag_id, doc.id)
        except Exception as e:
            logger.error(f"Failed to process embeddings for document {doc.id}: {e}")
            doc.embedding_status = EmbeddingStatus.FAILED.value
            db.commit()
        
        # Update document count
        rag.document_count = db.query(RAGDocument).filter(
            RAGDocument.rag_id == rag_id,
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
        
    except Exception as e:
        logger.error(f"Failed to import URL: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to import URL: {str(e)}"
        )


@router.get("/rags/{rag_id}/documents", response_model=List[DocumentResponse])
async def list_documents(
    rag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """List documents (all roles)."""
    rag, user_role = get_rag_with_access(db, rag_id, current_user, current_organization)
    
    documents = db.query(RAGDocument).filter(RAGDocument.rag_id == rag_id).all()
    
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


@router.get("/rags/{rag_id}/documents/{doc_id}", response_model=DocumentResponse)
async def get_document(
    rag_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Get document details (all roles)."""
    rag, user_role = get_rag_with_access(db, rag_id, current_user, current_organization)
    
    doc = db.query(RAGDocument).filter(
        RAGDocument.id == doc_id,
        RAGDocument.rag_id == rag_id
    ).first()
    
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
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


@router.put("/rags/{rag_id}/documents/{doc_id}", response_model=DocumentResponse)
async def update_document(
    rag_id: int,
    doc_id: int,
    content: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Update document (edit extracted text) (Owner/Editor)."""
    rag, user_role = get_rag_with_access(db, rag_id, current_user, current_organization, required_role='editor')
    
    doc = db.query(RAGDocument).filter(
        RAGDocument.id == doc_id,
        RAGDocument.rag_id == rag_id
    ).first()
    
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
        # Update content
        doc.content = content
    doc.updated_at = datetime.now(timezone.utc)
    
    # Re-process embeddings if content changed
    if doc.embedding_status == EmbeddingStatus.COMPLETED.value:
        logger.info(f"Document {doc_id} has completed embeddings, starting re-processing with update_existing=True")
        doc.embedding_status = EmbeddingStatus.PROCESSING.value
        db.commit()
        
        try:
            _process_document_embeddings(db, rag_id, doc_id, update_existing=True)
            logger.info(f"Successfully re-processed embeddings for document {doc_id}")
        except Exception as e:
            logger.error(f"Failed to re-process embeddings for document {doc_id}: {e}")
            doc.embedding_status = EmbeddingStatus.FAILED.value
            db.commit()
    else:
        logger.info(f"Document {doc_id} embedding_status is {doc.embedding_status}, skipping re-processing")
    
    db.commit()
    db.refresh(doc)
    
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


@router.delete("/rags/{rag_id}/documents/{doc_id}")
async def delete_document(
    rag_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Delete document (Owner/Editor/File Manager)."""
    rag, user_role = get_rag_with_access(db, rag_id, current_user, current_organization, required_role='file_manager')
    
    doc = db.query(RAGDocument).filter(
        RAGDocument.id == doc_id,
        RAGDocument.rag_id == rag_id
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
        storage.delete_file(file_path)
    
    # Delete embeddings from vector DB
    try:
        vector_db = VectorDB()
        vector_db.delete_document(rag_id, doc_id)
    except Exception as e:
        logger.warning(f"Failed to delete embeddings for document {doc_id} from RAG {rag_id}: {e}")
        # Continue with document deletion even if vector DB deletion fails
    
    # Delete document
    db.delete(doc)
    
    # Update document count
    rag.document_count = db.query(RAGDocument).filter(
        RAGDocument.rag_id == rag_id,
        RAGDocument.embedding_status == EmbeddingStatus.COMPLETED.value
    ).count()
    rag.updated_at = datetime.now(timezone.utc)
    
    db.commit()
    
    return {"success": True, "message": "Document deleted"}


@router.post("/rags/{rag_id}/documents/bulk")
async def bulk_upload_documents(
    rag_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Bulk upload documents (Owner/Editor/File Manager)."""
    rag, user_role = get_rag_with_access(db, rag_id, current_user, current_organization, required_role='file_manager')
    
    results = []
    errors = []
    
    for file in files:
        try:
            # Use upload_document logic (simplified)
            doc_title = file.filename or "Untitled"
            storage = RAGStorage()
            
            doc = RAGDocument(
                rag_id=rag_id,
                title=doc_title,
                content="",
                embedding_status=EmbeddingStatus.PENDING.value
            )
            db.add(doc)
            db.flush()
            
            file_path = storage.get_document_file_path(rag_id, doc.id, file.filename or "file")
            file_path.parent.mkdir(parents=True, exist_ok=True)
            
            content = await file.read()
            with open(file_path, "wb") as f:
                f.write(content)
            
            processor = DocumentProcessor()
            text, metadata = processor.extract_text_from_file(file_path)
            doc.content = text
            doc.file_path = storage.get_relative_path(file_path)
            doc.document_metadata = {
                **(metadata or {}),
                "original_filename": file.filename,
                "uploaded_by": current_user.id,
            }
            doc.embedding_status = EmbeddingStatus.PROCESSING.value
            
            db.commit()
            db.refresh(doc)
            
            # Process embeddings
            try:
                _process_document_embeddings(db, rag_id, doc.id)
            except Exception as e:
                logger.error(f"Failed to process embeddings for document {doc.id}: {e}")
                doc.embedding_status = EmbeddingStatus.FAILED.value
                db.commit()
            
            results.append({"id": doc.id, "title": doc.title, "status": "success"})
            
        except Exception as e:
            errors.append({"filename": file.filename, "error": str(e)})
    
    # Update document count
    rag.document_count = db.query(RAGDocument).filter(
        RAGDocument.rag_id == rag_id,
        RAGDocument.embedding_status == EmbeddingStatus.COMPLETED.value
    ).count()
    rag.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return {
        "success": True,
        "uploaded": len(results),
        "errors": len(errors),
        "results": results,
        "errors": errors
    }


@router.delete("/rags/{rag_id}/documents/bulk")
async def bulk_delete_documents(
    rag_id: int,
    request: BulkDeleteDocumentsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Bulk delete documents (Owner/Editor/File Manager)."""
    rag, user_role = get_rag_with_access(db, rag_id, current_user, current_organization, required_role='file_manager')
    
    documents = db.query(RAGDocument).filter(
        RAGDocument.id.in_(request.document_ids),
        RAGDocument.rag_id == rag_id
    ).all()
    
    storage = RAGStorage()
    vector_db = VectorDB()
    deleted_count = 0
    
    for doc in documents:
        # Delete file if exists
        if doc.file_path:
            file_path = storage.get_absolute_path(doc.file_path)
            storage.delete_file(file_path)
        
        # Delete embeddings from vector DB
        try:
            vector_db.delete_document(rag_id, doc.id)
        except Exception as e:
            logger.warning(f"Failed to delete embeddings for document {doc.id} from RAG {rag_id}: {e}")
            # Continue with document deletion even if vector DB deletion fails
        
        db.delete(doc)
        deleted_count += 1
    
    # Update document count
    rag.document_count = db.query(RAGDocument).filter(
        RAGDocument.rag_id == rag_id,
        RAGDocument.embedding_status == EmbeddingStatus.COMPLETED.value
    ).count()
    rag.updated_at = datetime.now(timezone.utc)
    
    db.commit()
    
    return {"success": True, "deleted": deleted_count}


@router.get("/rags/{rag_id}/download/{doc_id}")
async def download_document(
    rag_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Download original file (all roles)."""
    from fastapi.responses import FileResponse
    
    rag, user_role = get_rag_with_access(db, rag_id, current_user, current_organization)
    
    doc = db.query(RAGDocument).filter(
        RAGDocument.id == doc_id,
        RAGDocument.rag_id == rag_id
    ).first()
    
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    if not doc.file_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document has no file (URL import)"
        )
    
    storage = RAGStorage()
    file_path = storage.get_absolute_path(doc.file_path)
    
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    return FileResponse(
        path=str(file_path),
        filename=doc.title,
        media_type='application/octet-stream'
    )


@router.post("/rags/{rag_id}/documents/{doc_id}/reprocess")
async def reprocess_document(
    rag_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Re-extract/re-embed document (Owner/Editor)."""
    rag, user_role = get_rag_with_access(db, rag_id, current_user, current_organization, required_role='editor')
    
    doc = db.query(RAGDocument).filter(
        RAGDocument.id == doc_id,
        RAGDocument.rag_id == rag_id
    ).first()
    
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    # Re-extract text if file exists
    if doc.file_path:
        storage = RAGStorage()
        file_path = storage.get_absolute_path(doc.file_path)
        
        if file_path.exists():
            processor = DocumentProcessor()
            try:
                text, metadata = processor.extract_text_from_file(file_path)
                doc.content = text
                doc.document_metadata = {
                    **(doc.document_metadata or {}),
                    **(metadata or {}),
                    "reprocessed_at": datetime.now(timezone.utc).isoformat(),
                    "reprocessed_by": current_user.id,
                }
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Failed to re-extract text: {str(e)}"
                )
    
    # Re-process embeddings
    doc.embedding_status = EmbeddingStatus.PROCESSING.value
    db.commit()
    
    try:
        _process_document_embeddings(db, rag_id, doc_id, update_existing=True)
        return {"success": True, "message": "Document reprocessed"}
    except Exception as e:
        logger.error(f"Failed to reprocess document {doc_id}: {e}")
        doc.embedding_status = EmbeddingStatus.FAILED.value
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reprocess document: {str(e)}"
        )


# RAG Query Endpoint
@router.post("/rags/{rag_id}/query", response_model=QueryRAGResponse)
async def query_rag(
    rag_id: int,
    request: QueryRAGRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Query RAG with semantic search (Owner/Editor/Viewer)."""
    rag, user_role = get_rag_with_access(db, rag_id, current_user, current_organization, required_role='viewer')
    
    # Generate query embedding
    embedding_service = EmbeddingService(db=db)
    try:
        query_embedding = embedding_service.generate_embedding(request.query)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate query embedding: {str(e)}"
        )
    
    # Search vector DB
    vector_db = VectorDB()
    try:
        results = vector_db.search(rag_id, query_embedding, top_k=request.top_k)
    except Exception as e:
        logger.error(f"Failed to search vector DB for RAG {rag_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to search knowledge base: {str(e)}"
        )
    
    # Format results and apply minimum score threshold
    # ChromaDB uses L2 distance (lower = more similar)
    # Typical good matches: distance < 1.0
    # Moderate matches: distance 1.0-1.5
    # Poor matches: distance > 1.5
    # Priority: request.min_score > RAG.min_similarity_score > global config
    min_score = request.min_score
    if min_score is None:
        min_score = rag.min_similarity_score
    if min_score is None:
        min_score = RAG_MIN_SIMILARITY_SCORE
    
    formatted_results = []
    for result in results:
        distance = result.get('distance')
        
        # Filter by minimum score if specified
        # For distance metrics: lower is better, so we check if distance <= threshold
        # If min_score is None, include all results
        if min_score is not None and distance is not None:
            if distance > min_score:
                continue  # Skip results below threshold
        
        formatted_results.append({
            "document": result.get('document', ''),
            "metadata": result.get('metadata', {}),
            "distance": distance,
            "id": result.get('id'),
        })
    
    # Note: Token/cost counts to Owner's account (handled by embedding service)
    # The Owner is the one who pays for all queries
    
    return QueryRAGResponse(
        query=request.query,
        top_k=request.top_k,
        results=formatted_results
    )


# Helper function for processing embeddings
def _process_document_embeddings(
    db: Session,
    rag_id: int,
    doc_id: int,
    update_existing: bool = False
):
    """Process document embeddings (chunk, embed, store).
    
    Args:
        db: Database session
        rag_id: RAG ID
        doc_id: Document ID
        update_existing: If True, remove old embeddings before adding new ones
    """
    # Get document
    doc = db.query(RAGDocument).filter(RAGDocument.id == doc_id).first()
    if not doc:
        raise ValueError(f"Document {doc_id} not found")
    
    # Get RAG
    rag = db.query(RAGKnowledgeBase).filter(RAGKnowledgeBase.id == rag_id).first()
    if not rag:
        raise ValueError(f"RAG {rag_id} not found")
    
    # Chunk text
    processor = DocumentProcessor()
    chunks = processor.chunk_text(doc.content, metadata={
        "document_id": doc_id,
        "rag_id": rag_id,
        "title": doc.title,
    })
    
    if not chunks:
        logger.warning(f"No chunks generated for document {doc_id}")
        doc.embedding_status = EmbeddingStatus.COMPLETED.value
        db.commit()
        return
    
    # Generate embeddings
    embedding_service = EmbeddingService(db=db)
    texts = [chunk['text'] for chunk in chunks]
    
    try:
        embeddings = embedding_service.generate_embeddings_batch(texts)
    except Exception as e:
        logger.error(f"Failed to generate embeddings for document {doc_id}: {e}")
        raise
    
    # Prepare data for vector DB
    documents = [chunk['text'] for chunk in chunks]
    metadatas = [chunk['metadata'] for chunk in chunks]
    ids = [f"doc_{doc_id}_chunk_{chunk['chunk_index']}" for chunk in chunks]
    
    # Store in vector DB
    vector_db = VectorDB()
    
    if update_existing:
        # Remove old chunks for this document
        try:
            vector_db.delete_document(rag_id, doc_id)
            logger.info(f"Deleted old embeddings for document {doc_id} before re-embedding")
        except Exception as e:
            logger.warning(f"Failed to remove old embeddings for document {doc_id}: {e}")
            # Continue anyway - new embeddings will be added
    
    try:
        vector_db.add_documents(rag_id, embeddings, documents, metadatas, ids)
        doc.embedding_status = EmbeddingStatus.COMPLETED.value
        db.commit()
        logger.info(f"Successfully processed {len(chunks)} chunks for document {doc_id}")
    except Exception as e:
        logger.error(f"Failed to store embeddings in vector DB: {e}")
        doc.embedding_status = EmbeddingStatus.FAILED.value
        db.commit()
        raise


class UpdatePublicAccessRequest(BaseModel):
    enabled: bool
    mode: Optional[str] = None  # "full_editor" or "folder_only"


@router.put("/rags/{rag_id}/public-access")
async def update_public_access(
    rag_id: int,
    request: UpdatePublicAccessRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Enable/disable public access for RAG (Owner only)."""
    rag, user_role = get_rag_with_access(db, rag_id, current_user, current_organization, required_role='owner')
    
    if request.enabled:
        # Generate token if not exists
        if not rag.public_access_token:
            # Generate secure random token (64 characters)
            rag.public_access_token = secrets.token_urlsafe(48)  # 48 bytes = 64 chars in base64url
        
        # Set mode (required when enabling)
        if request.mode not in ['full_editor', 'folder_only']:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="mode must be 'full_editor' or 'folder_only'"
            )
        rag.public_access_mode = request.mode
        rag.public_access_enabled = True
    else:
        # Disable public access (keep token for potential re-enable)
        rag.public_access_enabled = False
    
    rag.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(rag)
    
    return {
        "public_access_enabled": rag.public_access_enabled,
        "public_access_token": rag.public_access_token if rag.public_access_enabled else None,
        "public_access_mode": rag.public_access_mode if rag.public_access_enabled else None,
    }

