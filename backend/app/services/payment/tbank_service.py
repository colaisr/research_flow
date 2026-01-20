"""
T-Bank payment gateway service.

Handles payment initiation, status checking, and webhook processing for T-Bank payments.
"""
import hashlib
import hmac
import json
from typing import Optional, Dict, Any
from decimal import Decimal
import httpx
from sqlalchemy.orm import Session
from app.models.settings import AppSettings

# T-Bank API endpoints
TBANK_API_BASE_URL = "https://securepay.tinkoff.ru/v2"
TBANK_API_TEST_URL = "https://rest-api-test.tinkoff.ru/v2"


class TBankPaymentService:
    """Service for handling T-Bank payments."""
    
    def __init__(self, db: Optional[Session] = None):
        """
        Initialize T-Bank payment service.
        
        Args:
            db: Database session (optional, will fetch credentials from AppSettings)
        """
        self.db = db
        self._terminal_key = None
        self._password = None
        self._is_test = None
    
    def _get_setting(self, key: str, default: Optional[str] = None) -> Optional[str]:
        """Get setting from AppSettings table."""
        if not self.db:
            return default
        
        setting = self.db.query(AppSettings).filter(AppSettings.key == key).first()
        if setting:
            return setting.value
        return default
    
    @property
    def terminal_key(self) -> Optional[str]:
        """Get T-Bank terminal key."""
        if self._terminal_key is None:
            self._terminal_key = self._get_setting('tbank_terminal_key')
        return self._terminal_key
    
    @property
    def password(self) -> Optional[str]:
        """Get T-Bank password."""
        if self._password is None:
            self._password = self._get_setting('tbank_password')
        return self._password
    
    @property
    def is_test(self) -> bool:
        """Check if test mode is enabled."""
        if self._is_test is None:
            test_mode = self._get_setting('tbank_test_mode', 'true')
            self._is_test = test_mode.lower() == 'true'
        return self._is_test
    
    @property
    def base_url(self) -> str:
        """
        Get T-Bank API base URL.
        
        According to T-Bank documentation:
        - DEMO terminal keys (ending with DEMO) should use PRODUCTION endpoint
        - Regular test terminals use TEST endpoint
        - Production terminals use PRODUCTION endpoint
        """
        # Check if terminal key ends with DEMO
        if self.terminal_key and self.terminal_key.endswith('DEMO'):
            # DEMO keys use production endpoint
            return TBANK_API_BASE_URL
        elif self.is_test:
            # Regular test mode uses test endpoint
            return TBANK_API_TEST_URL
        else:
            # Production mode
            return TBANK_API_BASE_URL
    
    def _generate_token(self, data: Dict[str, Any]) -> str:
        """
        Generate token for T-Bank API request.
        
        T-Bank token generation algorithm:
        1. Add Password to the data dictionary
        2. Sort all key-value pairs (including Password, excluding Token) by key alphabetically
        3. Concatenate only the VALUES in sorted order (nested objects as JSON)
        4. Compute SHA-256 hash (lowercase hex)
        """
        if not self.password:
            raise ValueError("T-Bank password not configured")
        
        # Create a copy of data and add Password (exclude Token)
        token_data = {k: v for k, v in data.items() if k != 'Token'}
        token_data['Password'] = self.password
        
        # Sort by key alphabetically
        sorted_data = sorted(token_data.items())
        
        # Concatenate only the VALUES (not keys) in sorted order
        # For nested objects (like Receipt), serialize as JSON
        values_list = []
        for k, v in sorted_data:
            if isinstance(v, (dict, list)):
                # Serialize nested objects as JSON (compact, no spaces)
                values_list.append(json.dumps(v, ensure_ascii=False, separators=(',', ':')))
            else:
                values_list.append(str(v))
        
        values_str = ''.join(values_list)
        
        # Compute SHA-256 hash (lowercase hex)
        token = hashlib.sha256(values_str.encode('utf-8')).hexdigest()
        
        return token
    
    def _verify_token(self, data: Dict[str, Any], received_token: str) -> bool:
        """
        Verify token from T-Bank webhook.
        
        Uses the same algorithm as _generate_token:
        1. Add Password to the data dictionary
        2. Sort all key-value pairs (including Password, excluding Token) by key alphabetically
        3. Concatenate only the VALUES in sorted order
        4. Compute SHA-256 hash
        """
        if not self.password:
            return False
        
        # Create a copy of data and add Password (exclude Token)
        token_data = {k: v for k, v in data.items() if k != 'Token'}
        token_data['Password'] = self.password
        
        # Sort by key alphabetically
        sorted_data = sorted(token_data.items())
        
        # Concatenate only the VALUES (not keys) in sorted order
        values_str = ''.join(str(v) for k, v in sorted_data)
        
        # Compute SHA-256 hash (lowercase hex)
        expected_token = hashlib.sha256(values_str.encode('utf-8')).hexdigest()
        
        return hmac.compare_digest(expected_token, received_token)
    
    async def initiate_payment(
        self,
        order_id: str,
        amount: Decimal,
        description: str,
        customer_email: Optional[str] = None,
        success_url: Optional[str] = None,
        fail_url: Optional[str] = None,
        notification_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Initiate payment with T-Bank.
        
        Args:
            order_id: Unique order identifier
            amount: Payment amount in kopecks (rubles * 100)
            description: Payment description
            customer_email: Customer email (optional)
            success_url: URL to redirect after successful payment
            fail_url: URL to redirect after failed payment
            notification_url: Webhook URL for payment notifications
        
        Returns:
            Dict with payment details including PaymentURL
        """
        if not self.terminal_key:
            raise ValueError("T-Bank terminal key not configured")
        
        # Convert amount to kopecks (T-Bank expects amount in kopecks)
        amount_kopecks = int(amount * 100)
        
        request_data = {
            'TerminalKey': self.terminal_key,
            'Amount': amount_kopecks,
            'OrderId': order_id,
            'Description': description,
        }
        
        # Add URLs only if provided (T-Bank may reject empty strings)
        if success_url:
            request_data['SuccessURL'] = success_url
        if fail_url:
            request_data['FailURL'] = fail_url
        if notification_url:
            request_data['NotificationURL'] = notification_url
        
        if customer_email:
            request_data['CustomerKey'] = customer_email
        
        # Add Receipt field (required if terminal has online cash register enabled)
        # T-Bank expects capitalized field names: Email, Taxation, Items, Name, Price, etc.
        # Error 204 suggests Receipt format issue - FFD 1.2 requires PaymentMethod and PaymentObject
        receipt = {
            'FfdVersion': '1.2',  # Fiscal document format version (required for some terminals)
            'Taxation': 'osn',  # General taxation system (общая система налогообложения)
            'Items': [
                {
                    'Name': description[:128],  # Max 128 chars
                    'Price': amount_kopecks,
                    'Quantity': 1.0,  # Can be float
                    'Amount': amount_kopecks,
                    'Tax': 'vat20',  # VAT 20%
                    'PaymentMethod': 'full_payment',  # Required for FFD 1.2
                    'PaymentObject': 'service',  # Required for FFD 1.2
                }
            ]
        }
        
        # Add email only if provided (T-Bank requires at least one contact: email OR phone)
        if customer_email:
            receipt['Email'] = customer_email
        
        request_data['Receipt'] = receipt
        
        # Generate token (must include Receipt in token calculation)
        request_data['Token'] = self._generate_token(request_data)
        
        # Make API request
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base_url}/Init",
                json=request_data,
                headers={'Content-Type': 'application/json'}
            )
            
            # Get response text for debugging
            response_text = response.text
            try:
                result = response.json()
            except:
                result = {'Success': False, 'Message': response_text[:200]}
            
            # Log request/response for debugging (mask sensitive data)
            import logging
            logger = logging.getLogger(__name__)
            log_data = {k: v for k, v in request_data.items() if k != 'Token'}
            logger.info(f"T-Bank Init request (masked): {log_data}")
            logger.info(f"T-Bank Init response: {response.status_code} - {result}")
            
            # Log full response for debugging
            if not result.get('Success', False):
                logger.error(f"T-Bank Init failed - Full response: {response_text}")
                logger.error(f"T-Bank Init failed - Error details: {result}")
            
            if response.status_code != 200:
                error_message = result.get('Message', response_text[:200])
                error_code = result.get('ErrorCode', f'HTTP_{response.status_code}')
                raise Exception(f"T-Bank API error ({response.status_code}): {error_code} - {error_message}")
            
            if result.get('Success', False):
                return {
                    'success': True,
                    'payment_id': result.get('PaymentId'),
                    'payment_url': result.get('PaymentURL'),
                    'status': result.get('Status'),
                }
            else:
                error_message = result.get('Message', 'Unknown error')
                error_code = result.get('ErrorCode', 'UNKNOWN')
                raise Exception(f"T-Bank payment initiation failed: {error_code} - {error_message}")
    
    async def get_payment_status(self, payment_id: str) -> Dict[str, Any]:
        """
        Get payment status from T-Bank.
        
        Args:
            payment_id: T-Bank payment ID
        
        Returns:
            Dict with payment status information
        """
        if not self.terminal_key:
            raise ValueError("T-Bank terminal key not configured")
        
        request_data = {
            'TerminalKey': self.terminal_key,
            'PaymentId': payment_id,
        }
        
        # Generate token
        request_data['Token'] = self._generate_token(request_data)
        
        # Make API request
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base_url}/GetState",
                json=request_data,
                headers={'Content-Type': 'application/json'}
            )
            
            response_text = response.text
            try:
                result = response.json()
            except:
                result = {'Success': False, 'Message': response_text[:200]}
            
            # Log for debugging
            import logging
            logger = logging.getLogger(__name__)
            logger.debug(f"T-Bank GetState request: {request_data}")
            logger.debug(f"T-Bank GetState response: {response.status_code} - {result}")
            
            if response.status_code != 200:
                error_message = result.get('Message', response_text[:200])
                error_code = result.get('ErrorCode', f'HTTP_{response.status_code}')
                return {
                    'success': False,
                    'order_id': None,
                    'status': 'UNKNOWN',
                    'amount': None,
                    'Message': error_message,
                    'ErrorCode': error_code,
                }
        
        # Return status regardless of Success flag (payment might be rejected/failed)
        # T-Bank returns Success=False for rejected payments, but we still get the status
        status = result.get('Status', 'UNKNOWN')
        error_message = result.get('Message', '')
        
        # Generate user-friendly error message based on status
        if status == 'REJECTED':
            if not error_message or error_message == 'OK':
                error_message = 'Платеж отклонен банком. Проверьте данные карты или обратитесь в банк.'
            elif 'Платеж отклонен' not in error_message:
                error_message = f'Платеж отклонен: {error_message}'
        elif status in ['AUTH_FAIL', 'REVERSED']:
            if not error_message or error_message == 'OK':
                error_message = 'Ошибка авторизации платежа. Проверьте данные карты.'
            else:
                error_message = f'Ошибка авторизации: {error_message}'
        
        return {
            'success': result.get('Success', False),
            'order_id': result.get('OrderId'),
            'status': status,
            'amount': result.get('Amount'),
            'Message': error_message,
            'ErrorCode': result.get('ErrorCode'),
        }
    
    def verify_webhook(self, webhook_data: Dict[str, Any]) -> bool:
        """
        Verify webhook signature from T-Bank.
        
        Args:
            webhook_data: Webhook payload from T-Bank
        
        Returns:
            True if webhook is valid, False otherwise
        """
        received_token = webhook_data.get('Token')
        if not received_token:
            return False
        
        return self._verify_token(webhook_data, received_token)
    
    def parse_webhook_status(self, webhook_data: Dict[str, Any]) -> str:
        """
        Parse payment status from webhook data.
        
        T-Bank statuses:
        - NEW: Payment created but not paid
        - FORM_SHOWED: Payment form shown to customer
        - DEADLINE_EXPIRED: Payment deadline expired
        - CANCELED: Payment canceled
        - PREAUTHORIZING: Pre-authorization in progress
        - AUTHORIZING: Authorization in progress
        - AUTHORIZED: Authorized (for 2-step payments)
        - AUTH_FAIL: Authorization failed
        - REJECTED: Payment rejected
        - 3DS_CHECKING: 3DS verification in progress
        - 3DS_CHECKED: 3DS verification completed
        - REVERSING: Reversal in progress
        - REVERSED: Reversed
        - CONFIRMING: Confirmation in progress
        - CONFIRMED: Confirmed (payment completed)
        - REFUNDING: Refund in progress
        - REFUNDED: Refunded
        - PARTIAL_REFUNDED: Partially refunded
        
        Returns:
            Our internal status: pending, processing, completed, failed, cancelled
        """
        tbank_status = webhook_data.get('Status', '').upper()
        
        # Map T-Bank statuses to our internal statuses
        status_mapping = {
            'NEW': 'pending',
            'FORM_SHOWED': 'processing',
            'PREAUTHORIZING': 'processing',
            'AUTHORIZING': 'processing',
            '3DS_CHECKING': 'processing',
            '3DS_CHECKED': 'processing',
            'CONFIRMING': 'processing',
            'CONFIRMED': 'completed',
            'AUTHORIZED': 'completed',  # For 2-step payments
            'CANCELED': 'cancelled',
            'DEADLINE_EXPIRED': 'cancelled',
            'AUTH_FAIL': 'failed',
            'REJECTED': 'failed',
            'REVERSED': 'failed',
            'REFUNDED': 'failed',
            'PARTIAL_REFUNDED': 'failed',
        }
        
        return status_mapping.get(tbank_status, 'pending')
