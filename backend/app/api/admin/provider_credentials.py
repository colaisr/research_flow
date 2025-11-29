"""
Admin provider credentials management API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from app.core.database import get_db
from app.core.auth import get_current_admin_user_dependency
from app.models.user import User

router = APIRouter()


# Request/Response Models
class ProviderCredentialResponse(BaseModel):
    id: int
    provider: str
    display_name: str
    api_key_encrypted: Optional[str] = None  # Masked for security
    base_url: str
    is_active: bool
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class UpdateProviderCredentialRequest(BaseModel):
    api_key_encrypted: Optional[str] = None
    base_url: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("", response_model=List[ProviderCredentialResponse])
async def list_provider_credentials(
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user_dependency),
):
    """List all provider credentials (admin only)."""
    from sqlalchemy import text
    
    result = db.execute(
        text("""
            SELECT id, provider, display_name, api_key_encrypted, base_url, is_active, created_at, updated_at
            FROM provider_credentials
            ORDER BY CASE WHEN provider = 'openrouter' THEN 0 ELSE 1 END, provider
        """)
    )
    
    credentials = []
    for row in result:
        # Mask API key for security (show only last 4 characters if present)
        api_key_display = None
        if row.api_key_encrypted:
            if len(row.api_key_encrypted) > 4:
                api_key_display = "*" * (len(row.api_key_encrypted) - 4) + row.api_key_encrypted[-4:]
            else:
                api_key_display = "*" * len(row.api_key_encrypted)
        
        credentials.append(ProviderCredentialResponse(
            id=row.id,
            provider=row.provider,
            display_name=row.display_name,
            api_key_encrypted=api_key_display,
            base_url=row.base_url,
            is_active=bool(row.is_active),
            created_at=row.created_at.isoformat() if row.created_at else None,
            updated_at=row.updated_at.isoformat() if row.updated_at else None,
        ))
    
    return credentials


@router.get("/{provider}", response_model=ProviderCredentialResponse)
async def get_provider_credential(
    provider: str,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user_dependency),
):
    """Get provider credential by provider name (admin only)."""
    from sqlalchemy import text
    
    result = db.execute(
        text("""
            SELECT id, provider, display_name, api_key_encrypted, base_url, is_active, created_at, updated_at
            FROM provider_credentials
            WHERE provider = :provider
        """),
        {"provider": provider}
    )
    
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Provider '{provider}' not found")
    
    # Mask API key for security
    api_key_display = None
    if row.api_key_encrypted:
        if len(row.api_key_encrypted) > 4:
            api_key_display = "*" * (len(row.api_key_encrypted) - 4) + row.api_key_encrypted[-4:]
        else:
            api_key_display = "*" * len(row.api_key_encrypted)
    
    return ProviderCredentialResponse(
        id=row.id,
        provider=row.provider,
        display_name=row.display_name,
        api_key_encrypted=api_key_display,
        base_url=row.base_url,
        is_active=bool(row.is_active),
        created_at=row.created_at.isoformat() if row.created_at else None,
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
    )


@router.get("/{provider}/api-key", response_model=dict)
async def get_provider_api_key(
    provider: str,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user_dependency),
):
    """Get actual (unmasked) API key for a provider (admin only)."""
    from sqlalchemy import text
    
    result = db.execute(
        text("""
            SELECT api_key_encrypted
            FROM provider_credentials
            WHERE provider = :provider
        """),
        {"provider": provider}
    )
    
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Provider '{provider}' not found")
    
    return {
        "provider": provider,
        "api_key": row.api_key_encrypted if row.api_key_encrypted else None
    }


@router.put("/{provider}", response_model=ProviderCredentialResponse)
async def update_provider_credential(
    provider: str,
    request: UpdateProviderCredentialRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user_dependency),
):
    """Update provider credential (admin only)."""
    from sqlalchemy import text
    
    # Check if provider exists
    check_result = db.execute(
        text("SELECT id FROM provider_credentials WHERE provider = :provider"),
        {"provider": provider}
    )
    existing = check_result.fetchone()
    
    if not existing:
        raise HTTPException(status_code=404, detail=f"Provider '{provider}' not found")
    
    # Build update query
    updates = []
    params = {"provider": provider}
    
    if request.api_key_encrypted is not None:
        updates.append("api_key_encrypted = :api_key")
        params["api_key"] = request.api_key_encrypted
    
    if request.base_url is not None:
        updates.append("base_url = :base_url")
        params["base_url"] = request.base_url
    
    if request.is_active is not None:
        updates.append("is_active = :is_active")
        params["is_active"] = 1 if request.is_active else 0
    
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    updates.append("updated_at = CURRENT_TIMESTAMP")
    
    # Update
    db.execute(
        text(f"""
            UPDATE provider_credentials
            SET {', '.join(updates)}
            WHERE provider = :provider
        """),
        params
    )
    db.commit()
    
    # Also update AppSettings if OpenRouter (for backward compatibility)
    if provider == "openrouter" and request.api_key_encrypted is not None:
        from app.models.settings import AppSettings
        setting = db.query(AppSettings).filter(AppSettings.key == "openrouter_api_key").first()
        if setting:
            setting.value = request.api_key_encrypted
        else:
            setting = AppSettings(
                key="openrouter_api_key",
                value=request.api_key_encrypted,
                is_secret=True,
                description="OpenRouter API key"
            )
            db.add(setting)
        db.commit()
    
    # Get updated credential
    result = db.execute(
        text("""
            SELECT id, provider, display_name, api_key_encrypted, base_url, is_active, created_at, updated_at
            FROM provider_credentials
            WHERE provider = :provider
        """),
        {"provider": provider}
    )
    
    row = result.fetchone()
    
    # Mask API key for security
    api_key_display = None
    if row.api_key_encrypted:
        if len(row.api_key_encrypted) > 4:
            api_key_display = "*" * (len(row.api_key_encrypted) - 4) + row.api_key_encrypted[-4:]
        else:
            api_key_display = "*" * len(row.api_key_encrypted)
    
    return ProviderCredentialResponse(
        id=row.id,
        provider=row.provider,
        display_name=row.display_name,
        api_key_encrypted=api_key_display,
        base_url=row.base_url,
        is_active=bool(row.is_active),
        created_at=row.created_at.isoformat() if row.created_at else None,
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
    )

