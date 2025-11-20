"""
Settings API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Dict
from app.core.database import get_db
from app.models.settings import AvailableModel, AvailableDataSource, AppSettings
from app.core.auth import get_current_admin_user_dependency
from app.models.user import User

router = APIRouter()


# Response models
class ModelResponse(BaseModel):
    id: int
    name: str
    display_name: str
    provider: str
    description: Optional[str]
    max_tokens: Optional[int]
    cost_per_1k_tokens: Optional[str]
    is_enabled: bool
    has_failures: bool
    
    class Config:
        from_attributes = True


class DataSourceResponse(BaseModel):
    id: int
    name: str
    display_name: str
    description: Optional[str]
    supports_crypto: bool
    supports_stocks: bool
    supports_forex: bool
    is_enabled: bool
    
    class Config:
        from_attributes = True


class UpdateModelRequest(BaseModel):
    is_enabled: bool


class UpdateDataSourceRequest(BaseModel):
    is_enabled: bool


class UpdateTelegramRequest(BaseModel):
    bot_token: Optional[str] = None


class UpdateOpenRouterRequest(BaseModel):
    api_key: Optional[str] = None


class UpdateTinkoffRequest(BaseModel):
    api_token: Optional[str] = None


# Models endpoints
@router.get("/models", response_model=List[ModelResponse])
async def list_models(
    enabled_only: bool = False,
    db: Session = Depends(get_db)
):
    """List all available models."""
    query = db.query(AvailableModel)
    if enabled_only:
        query = query.filter(AvailableModel.is_enabled == True)
    models = query.order_by(AvailableModel.provider, AvailableModel.display_name).all()
    return models


@router.put("/models/{model_id}", response_model=ModelResponse)
async def update_model(
    model_id: int,
    request: UpdateModelRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user_dependency)
):
    """Enable/disable a model (admin only)."""
    model = db.query(AvailableModel).filter(AvailableModel.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    
    model.is_enabled = request.is_enabled
    db.commit()
    db.refresh(model)
    return model


@router.post("/models/sync", response_model=Dict)
async def sync_models_from_openrouter(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user_dependency)
):
    """Sync available models from OpenRouter API (admin only).
    
    Fetches the latest list of models from OpenRouter and adds any new ones
    to the database. Existing models are not updated to preserve custom settings.
    """
    try:
        from app.services.llm.client import fetch_available_models_from_openrouter
        
        # Fetch models from OpenRouter
        openrouter_models = fetch_available_models_from_openrouter(db=db)
        
        added_count = 0
        skipped_count = 0
        
        # Add new models to database
        for model_data in openrouter_models:
            # Check if model already exists
            existing = db.query(AvailableModel).filter(
                AvailableModel.name == model_data["name"]
            ).first()
            
            if existing:
                skipped_count += 1
                continue
            
            # Create new model (disabled by default, admin can enable manually)
            new_model = AvailableModel(
                name=model_data["name"],
                display_name=model_data["display_name"],
                provider=model_data["provider"],
                description=model_data.get("description"),
                max_tokens=model_data.get("max_tokens"),
                cost_per_1k_tokens=model_data.get("cost_per_1k_tokens"),
                is_enabled=False,  # Disabled by default, admin can enable
            )
            db.add(new_model)
            added_count += 1
        
        db.commit()
        
        return {
            "success": True,
            "message": f"Synced models from OpenRouter: {added_count} added, {skipped_count} already existed",
            "added": added_count,
            "skipped": skipped_count,
            "total_fetched": len(openrouter_models),
        }
        
    except ValueError as e:
        # API key or configuration error
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to sync models: {str(e)}")


# Data sources endpoints
@router.get("/data-sources", response_model=List[DataSourceResponse])
async def list_data_sources(
    enabled_only: bool = False,
    db: Session = Depends(get_db)
):
    """List all available data sources."""
    query = db.query(AvailableDataSource)
    if enabled_only:
        query = query.filter(AvailableDataSource.is_enabled == True)
    sources = query.order_by(AvailableDataSource.display_name).all()
    return sources


@router.put("/data-sources/{source_id}", response_model=DataSourceResponse)
async def update_data_source(
    source_id: int,
    request: UpdateDataSourceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user_dependency)
):
    """Enable/disable a data source (admin only)."""
    source = db.query(AvailableDataSource).filter(AvailableDataSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Data source not found")
    
    source.is_enabled = request.is_enabled
    db.commit()
    db.refresh(source)
    return source


# Credentials endpoints
@router.get("/telegram")
async def get_telegram_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user_dependency)
):
    """Get Telegram settings (admin only)."""
    bot_token = db.query(AppSettings).filter(AppSettings.key == "telegram_bot_token").first()
    
    # Get count of active users
    from app.models.telegram_user import TelegramUser
    user_count = db.query(TelegramUser).filter(TelegramUser.is_active == True).count()
    
    return {
        "bot_token": bot_token.value if bot_token else None,
        "bot_token_masked": mask_secret(bot_token.value) if bot_token and bot_token.value else None,
        "active_users_count": user_count,
    }


@router.put("/telegram")
async def update_telegram_settings(
    request: UpdateTelegramRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user_dependency)
):
    """Update Telegram settings (admin only)."""
    if request.bot_token is not None:
        setting = db.query(AppSettings).filter(AppSettings.key == "telegram_bot_token").first()
        if not setting:
            setting = AppSettings(key="telegram_bot_token", is_secret=True, description="Telegram bot token from @BotFather")
            db.add(setting)
        setting.value = request.bot_token
        db.commit()
    
    return {"success": True, "message": "Telegram settings updated"}


@router.get("/openrouter")
async def get_openrouter_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user_dependency)
):
    """Get OpenRouter settings (admin only)."""
    api_key = db.query(AppSettings).filter(AppSettings.key == "openrouter_api_key").first()
    
    return {
        "api_key": api_key.value if api_key else None,
        "api_key_masked": mask_secret(api_key.value) if api_key and api_key.value else None,
    }


@router.put("/openrouter")
async def update_openrouter_settings(
    request: UpdateOpenRouterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user_dependency)
):
    """Update OpenRouter settings (admin only)."""
    if request.api_key is not None:
        setting = db.query(AppSettings).filter(AppSettings.key == "openrouter_api_key").first()
        if not setting:
            setting = AppSettings(key="openrouter_api_key", is_secret=True, description="OpenRouter API key")
            db.add(setting)
        setting.value = request.api_key
        db.commit()
    
    return {"success": True, "message": "OpenRouter settings updated"}


@router.get("/tinkoff")
async def get_tinkoff_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user_dependency)
):
    """Get Tinkoff Invest API settings (admin only)."""
    api_token = db.query(AppSettings).filter(AppSettings.key == "tinkoff_api_token").first()
    
    return {
        "api_token": api_token.value if api_token else None,
        "api_token_masked": mask_secret(api_token.value) if api_token and api_token.value else None,
    }


@router.put("/tinkoff")
async def update_tinkoff_settings(
    request: UpdateTinkoffRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user_dependency)
):
    """Update Tinkoff Invest API settings (admin only)."""
    if request.api_token is not None:
        setting = db.query(AppSettings).filter(AppSettings.key == "tinkoff_api_token").first()
        if not setting:
            setting = AppSettings(key="tinkoff_api_token", is_secret=True, description="Tinkoff Invest API token for MOEX instruments")
            db.add(setting)
        setting.value = request.api_token
        db.commit()
    
    return {"success": True, "message": "Tinkoff settings updated"}


def mask_secret(value: str, visible_chars: int = 4) -> str:
    """Mask a secret value, showing only last few characters."""
    if not value or len(value) <= visible_chars:
        return "*" * len(value) if value else ""
    return "*" * (len(value) - visible_chars) + value[-visible_chars:]

