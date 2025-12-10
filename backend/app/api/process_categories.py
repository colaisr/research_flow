"""
API endpoints for process categories (folders).
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.core.database import get_db
from app.models.process_category import ProcessCategory
from app.models.analysis_type import AnalysisType
from app.core.auth import get_current_user_dependency, get_current_organization_dependency
from app.models.user import User
from app.models.organization import Organization

router = APIRouter()
logger = logging.getLogger(__name__)


class ProcessCategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    name: str
    organization_id: int
    user_id: Optional[int]
    display_order: int
    created_at: datetime
    updated_at: datetime


class ProcessCategoryCreate(BaseModel):
    name: str
    display_order: Optional[int] = 0


class ProcessCategoryUpdate(BaseModel):
    name: Optional[str] = None
    display_order: Optional[int] = None


@router.get("", response_model=List[ProcessCategoryResponse])
async def list_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """List all categories for the current organization."""
    try:
        categories = db.query(ProcessCategory).filter(
            ProcessCategory.organization_id == current_organization.id
        ).order_by(ProcessCategory.display_order.asc(), ProcessCategory.created_at.asc()).all()
        
        return categories
    except Exception as e:
        # If table doesn't exist (migration not run), return empty list
        logger.warning(f"Failed to fetch categories (migration may not be run): {e}")
        return []


@router.post("", response_model=ProcessCategoryResponse, status_code=201)
async def create_category(
    request: ProcessCategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Create a new process category."""
    # Check if name is provided
    if not request.name or not request.name.strip():
        raise HTTPException(status_code=400, detail="Category name is required")
    
    # Create category
    category = ProcessCategory(
        name=request.name.strip(),
        organization_id=current_organization.id,
        user_id=current_user.id,  # User-specific category
        display_order=request.display_order or 0
    )
    
    db.add(category)
    db.commit()
    db.refresh(category)
    
    logger.info(f"Created process category {category.id} '{category.name}' for organization {current_organization.id}")
    
    return category


@router.put("/{category_id}", response_model=ProcessCategoryResponse)
async def update_category(
    category_id: int,
    request: ProcessCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Update a process category."""
    category = db.query(ProcessCategory).filter(
        ProcessCategory.id == category_id,
        ProcessCategory.organization_id == current_organization.id
    ).first()
    
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Check permissions - user can only update their own categories
    if category.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only update your own categories")
    
    # Update fields
    if request.name is not None:
        if not request.name.strip():
            raise HTTPException(status_code=400, detail="Category name cannot be empty")
        category.name = request.name.strip()
    
    if request.display_order is not None:
        category.display_order = request.display_order
    
    db.commit()
    db.refresh(category)
    
    logger.info(f"Updated process category {category.id} to '{category.name}'")
    
    return category


@router.delete("/{category_id}")
async def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Delete a process category. Processes in this category will have category_id set to NULL."""
    category = db.query(ProcessCategory).filter(
        ProcessCategory.id == category_id,
        ProcessCategory.organization_id == current_organization.id
    ).first()
    
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Check permissions - user can only delete their own categories
    # If user_id is NULL, it's a shared category and shouldn't be deletable by individual users
    if category.user_id is not None and category.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own categories")
    
    # Remove category from all processes in this category
    processes_updated = db.query(AnalysisType).filter(
        AnalysisType.category_id == category_id
    ).update({AnalysisType.category_id: None})
    
    # Delete category
    db.delete(category)
    db.commit()
    
    logger.info(f"Deleted process category {category_id}, moved {processes_updated} processes to uncategorized")
    
    return {"success": True, "message": "Category deleted", "processes_moved": processes_updated}
