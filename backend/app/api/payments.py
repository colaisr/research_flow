"""
Payment API endpoints for T-Bank integration.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Request as FastAPIRequest, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from decimal import Decimal
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.auth import get_current_user_dependency, get_current_organization_dependency
from app.models.user import User
from app.models.organization import Organization
from app.services.payment.tbank_service import TBankPaymentService
from app.services.balance import add_tokens
from sqlalchemy import text

logger = logging.getLogger(__name__)

router = APIRouter()


class InitiatePaymentRequest(BaseModel):
    package_id: int
    success_url: Optional[str] = None
    fail_url: Optional[str] = None


class InitiatePaymentResponse(BaseModel):
    success: bool
    payment_id: str
    payment_url: str
    purchase_id: int
    message: str


@router.post("/initiate", response_model=InitiatePaymentResponse)
async def initiate_payment(
    request: InitiatePaymentRequest,
    http_request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency),
):
    """
    Initiate payment for token package purchase.
    
    Creates a payment order in T-Bank and returns payment URL.
    """
    # Verify package exists and is active
    package_result = db.execute(
        text("""
            SELECT id, name, display_name, token_amount, price_rub, is_active
            FROM token_packages
            WHERE id = :package_id
        """),
        {"package_id": request.package_id}
    )
    package = package_result.fetchone()
    
    if not package:
        raise HTTPException(status_code=404, detail="Token package not found")
    
    if not package.is_active:
        raise HTTPException(status_code=400, detail="Token package is not active")
    
    # Create purchase record with pending status
    purchase_result = db.execute(
        text("""
            INSERT INTO token_purchases
            (user_id, organization_id, package_id, token_amount, price_rub, 
             payment_status, purchased_at)
            VALUES
            (:user_id, :org_id, :package_id, :token_amount, :price_rub,
             'pending', CURRENT_TIMESTAMP)
        """),
        {
            "user_id": current_user.id,
            "org_id": current_organization.id,
            "package_id": request.package_id,
            "token_amount": package.token_amount,
            "price_rub": package.price_rub,
        }
    )
    purchase_id = purchase_result.lastrowid
    db.commit()
    
    # Generate unique order ID (T-Bank requires max 20 chars, but we use format: pkg_{id}_{timestamp})
    # Using shorter format: pkg{id}{timestamp} (max 20 chars: pkg + 6 digits + 10 timestamp = 19 chars)
    timestamp = int(datetime.now(timezone.utc).timestamp())
    order_id = f"pkg{purchase_id}{timestamp}"[:20]  # Ensure max 20 chars
    
    # Prepare payment URLs
    # Use URLs from request if provided, otherwise detect from HTTP headers
    host = http_request.headers.get('host', 'localhost:3000')
    origin = http_request.headers.get('origin', f'http://{host}')
    
    if request.success_url:
        success_url = request.success_url
    elif 'localhost' in host or '127.0.0.1' in host:
        success_url = f"http://{host}/billing?payment=success"
    else:
        success_url = "https://researchflow.ru/billing?payment=success"
    
    if request.fail_url:
        fail_url = request.fail_url
    elif 'localhost' in host or '127.0.0.1' in host:
        fail_url = f"http://{host}/billing?payment=failed"
    else:
        fail_url = "https://researchflow.ru/billing?payment=failed"
    
    # Webhook URL - T-Bank needs a publicly accessible URL
    # Always use production URL for webhooks (T-Bank needs HTTPS)
    notification_url = "https://researchflow.ru/api/payments/webhook"
    
    # Initiate payment with T-Bank
    try:
        logger.info(f"Initiating payment for package {request.package_id}, order_id: {order_id}, amount: {package.price_rub}")
        tbank_service = TBankPaymentService(db=db)
        payment_result = await tbank_service.initiate_payment(
            order_id=order_id,
            amount=Decimal(str(package.price_rub)),
            description=f"Покупка пакета токенов: {package.display_name}",
            customer_email=current_user.email,
            success_url=success_url,
            fail_url=fail_url,
            notification_url=notification_url,
        )
        logger.info(f"Payment initiated successfully: payment_id={payment_result.get('payment_id')}")
        
        # Update purchase record with payment details
        db.execute(
            text("""
                UPDATE token_purchases
                SET payment_id = :payment_id,
                    payment_url = :payment_url,
                    payment_status = 'processing'
                WHERE id = :purchase_id
            """),
            {
                "purchase_id": purchase_id,
                "payment_id": payment_result['payment_id'],
                "payment_url": payment_result['payment_url'],
            }
        )
        db.commit()
        
        return InitiatePaymentResponse(
            success=True,
            payment_id=payment_result['payment_id'],
            payment_url=payment_result['payment_url'],
            purchase_id=purchase_id,
            message="Payment initiated successfully",
        )
    
    except Exception as e:
        # Log the full error for debugging
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"Payment initiation failed: {str(e)}\n{error_trace}")
        
        # Update purchase record with error
        db.execute(
            text("""
                UPDATE token_purchases
                SET payment_status = 'failed',
                    payment_error = :error
                WHERE id = :purchase_id
            """),
            {
                "purchase_id": purchase_id,
                "error": str(e)[:500],  # Limit error message length
            }
        )
        db.commit()
        
        raise HTTPException(
            status_code=500,
            detail=f"Failed to initiate payment: {str(e)}"
        )


@router.post("/webhook")
async def payment_webhook(
    request: FastAPIRequest,
    db: Session = Depends(get_db),
    # Note: No authentication required - T-Bank will call this endpoint
):
    """
    Handle T-Bank payment webhook notifications.
    
    This endpoint receives payment status updates from T-Bank.
    """
    try:
        webhook_data = await request.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid webhook data: {str(e)}")
    
    # Verify webhook signature
    tbank_service = TBankPaymentService(db=db)
    if not tbank_service.verify_webhook(webhook_data):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    
    # Parse webhook data
    order_id = webhook_data.get('OrderId')
    payment_id = webhook_data.get('PaymentId')
    status = tbank_service.parse_webhook_status(webhook_data)
    
    if not payment_id:
        raise HTTPException(status_code=400, detail="PaymentId missing in webhook")
    
    # Find purchase by payment_id (more reliable than parsing order_id)
    purchase_result = db.execute(
        text("""
            SELECT id, user_id, organization_id, package_id, token_amount, payment_status
            FROM token_purchases
            WHERE payment_id = :payment_id
        """),
        {"payment_id": payment_id}
    )
    purchase = purchase_result.fetchone()
    
    if not purchase:
        # Fallback: try to extract purchase_id from order_id if format allows
        purchase_id = None
        if order_id and order_id.startswith('pkg'):
            try:
                # Try old format first: pkg_{id}_{user}_{timestamp}
                if '_' in order_id:
                    purchase_id = int(order_id.split('_')[1])
                else:
                    # New format: pkg{id}{timestamp} - try to extract by querying
                    # Since we can't reliably parse, log and use payment_id lookup
                    logger.warning(f"Could not extract purchase_id from order_id: {order_id}, using payment_id: {payment_id}")
            except (ValueError, IndexError):
                pass
        
        if not purchase_id:
            raise HTTPException(status_code=404, detail=f"Purchase not found for payment_id: {payment_id}")
        
        # Try lookup by purchase_id
        purchase_result = db.execute(
            text("""
                SELECT id, user_id, organization_id, package_id, token_amount, payment_status
                FROM token_purchases
                WHERE id = :purchase_id
            """),
            {"purchase_id": purchase_id}
        )
        purchase = purchase_result.fetchone()
        
        if not purchase:
            raise HTTPException(status_code=404, detail=f"Purchase {purchase_id} not found")
    
    # Update purchase status
    update_data = {
        "purchase_id": purchase_id,
        "payment_status": status,
        "payment_id": payment_id,
    }
    
    # If payment completed, add tokens to balance
    if status == 'completed' and purchase.payment_status != 'completed':
        # Add tokens to user balance
        reason = f"Purchased token package (payment_id: {payment_id})"
        add_tokens(
            db=db,
            user_id=purchase.user_id,
            organization_id=purchase.organization_id,
            amount=purchase.token_amount,
            reason=reason
        )
        
        # Set paid_at timestamp
        update_data["paid_at"] = datetime.now(timezone.utc)
    
    # Update purchase record
    if status == 'failed':
        # Get error message from webhook
        error_message = webhook_data.get('Message', '')
        tbank_status = webhook_data.get('Status', 'UNKNOWN')
        
        # Generate user-friendly error message
        if not error_message or error_message == 'OK':
            if tbank_status == 'REJECTED':
                error_message = 'Платеж отклонен банком. Проверьте данные карты или обратитесь в банк.'
            elif tbank_status in ['AUTH_FAIL', 'REVERSED']:
                error_message = 'Ошибка авторизации платежа. Проверьте данные карты.'
            else:
                error_message = f'Платеж не прошел. Статус: {tbank_status}'
        elif 'Платеж отклонен' not in error_message:
            # Add prefix if not already present
            if tbank_status == 'REJECTED':
                error_message = f'Платеж отклонен: {error_message}'
        
        logger.info(f"Payment failed webhook: purchase_id={purchase_id}, status={tbank_status}, error={error_message}")
        
        db.execute(
            text("""
                UPDATE token_purchases
                SET payment_status = :payment_status,
                    payment_id = :payment_id,
                    payment_error = :error
                WHERE id = :purchase_id
            """),
            {
                **update_data,
                "error": error_message,
            }
        )
    else:
        if 'paid_at' in update_data:
            db.execute(
                text("""
                    UPDATE token_purchases
                    SET payment_status = :payment_status,
                        payment_id = :payment_id,
                        paid_at = :paid_at
                    WHERE id = :purchase_id
                """),
                update_data
            )
        else:
            db.execute(
                text("""
                    UPDATE token_purchases
                    SET payment_status = :payment_status,
                        payment_id = :payment_id
                    WHERE id = :purchase_id
                """),
                update_data
            )
    
    db.commit()
    
    return {"success": True, "message": "Webhook processed"}


@router.get("/status/{purchase_id}")
async def get_payment_status(
    purchase_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency),
):
    """
    Get payment status for a purchase.
    """
    # Get purchase record
    purchase_result = db.execute(
        text("""
            SELECT id, payment_status, payment_id, payment_url, paid_at, payment_error
            FROM token_purchases
            WHERE id = :purchase_id
              AND user_id = :user_id
              AND organization_id = :org_id
        """),
        {
            "purchase_id": purchase_id,
            "user_id": current_user.id,
            "org_id": current_organization.id,
        }
    )
    purchase = purchase_result.fetchone()
    
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    
    # If payment is processing and we have payment_id, check status with T-Bank
    if purchase.payment_status in ['pending', 'processing'] and purchase.payment_id:
        try:
            tbank_service = TBankPaymentService(db=db)
            tbank_status = await tbank_service.get_payment_status(purchase.payment_id)
            
            # Update local status if it changed
            new_status = tbank_service.parse_webhook_status({'Status': tbank_status['status']})
            if new_status != purchase.payment_status:
                # Prepare update data
                update_data = {
                    "purchase_id": purchase_id,
                    "status": new_status,
                }
                
                # If failed, try to get error message
                if new_status == 'failed':
                    error_message = tbank_status.get('Message', '')
                    if not error_message or error_message == 'OK':
                        # Generate user-friendly message based on T-Bank status
                        tbank_status_code = tbank_status.get('status', 'UNKNOWN')
                        if tbank_status_code == 'REJECTED':
                            error_message = 'Платеж отклонен банком. Проверьте данные карты или обратитесь в банк.'
                        elif tbank_status_code in ['AUTH_FAIL', 'REVERSED']:
                            error_message = 'Ошибка авторизации платежа. Проверьте данные карты.'
                        else:
                            error_message = f'Платеж не прошел. Статус: {tbank_status_code}'
                    
                    update_data["error"] = error_message
                    
                    db.execute(
                        text("""
                            UPDATE token_purchases
                            SET payment_status = :status,
                                payment_error = :error
                            WHERE id = :purchase_id
                        """),
                        update_data
                    )
                else:
                    db.execute(
                        text("""
                            UPDATE token_purchases
                            SET payment_status = :status
                            WHERE id = :purchase_id
                        """),
                        update_data
                    )
                
                db.commit()
                
                # Update purchase tuple for response
                if new_status == 'failed':
                    purchase = (purchase[0], new_status, purchase[2], purchase[3], purchase[4], update_data.get("error"))
                else:
                    purchase = (purchase[0], new_status, purchase[2], purchase[3], purchase[4], purchase[5])
        except Exception as e:
            logger.error(f"Error checking payment status: {e}")
            # If status check fails, return current status
            pass
    
    return {
        "purchase_id": purchase[0],
        "payment_status": purchase[1],
        "payment_id": purchase[2],
        "payment_url": purchase[3],
        "paid_at": purchase[4].isoformat() if purchase[4] else None,
        "payment_error": purchase[5],
    }
