"""
Email sending service using SMTP.
"""
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
import logging
from app.core.config import (
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USE_TLS,
    SMTP_USE_SSL,
    SMTP_USERNAME,
    SMTP_PASSWORD,
    SMTP_FROM_EMAIL,
    SMTP_FROM_NAME,
    FRONTEND_BASE_URL,
)

logger = logging.getLogger(__name__)


def send_email(
    to_email: str,
    subject: str,
    html_body: str,
    text_body: Optional[str] = None
) -> bool:
    """
    Send an email via SMTP.
    
    Uses the EXACT same approach as the working test emails.
    
    Args:
        to_email: Recipient email address
        subject: Email subject
        html_body: HTML email body
        text_body: Plain text email body (optional)
    
    Returns:
        True if email sent successfully, False otherwise
    """
    if not SMTP_HOST or not SMTP_USERNAME or not SMTP_PASSWORD:
        logger.error("SMTP configuration is missing. Cannot send email.")
        return False
    
    try:
        # Create message
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
        msg['To'] = to_email
        
        if text_body:
            msg.attach(MIMEText(text_body, 'plain', 'utf-8'))
        
        msg.attach(MIMEText(html_body, 'html', 'utf-8'))
        
        # Connect to SMTP server
        server = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=10)
        server.login(SMTP_USERNAME, SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
        
        logger.info(f"Email sent successfully to {to_email}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {str(e)}", exc_info=True)
        return False


def send_verification_email(email: str, token: str, user_name: Optional[str] = None) -> bool:
    """
    Send email verification email to user with 3-digit code.
    
    Args:
        email: User's email address
        token: 3-digit verification code
        user_name: User's name (optional)
    
    Returns:
        True if email sent successfully, False otherwise
    """
    from datetime import datetime
    
    verification_code = token  # token is now a 3-digit code
    
    subject = "Добро пожаловать в Research Flow!"
    
    greeting = f"Здравствуйте{f', {user_name}' if user_name else ''}!" if user_name else "Здравствуйте!"
    
    text_body = f"""Добро пожаловать в Research Flow!

{greeting}

Спасибо за регистрацию в Research Flow. Для завершения регистрации, пожалуйста, подтвердите ваш email адрес, введя следующий код:

{verification_code}

Этот код действителен в течение 24 часов.

Если вы не регистрировались в Research Flow, просто проигнорируйте это письмо.

С уважением,
Команда Research Flow"""
    
    html_body = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb;">Добро пожаловать в Research Flow!</h2>
        <p>{greeting}</p>
        <p>Спасибо за регистрацию в Research Flow. Для завершения регистрации, пожалуйста, подтвердите ваш email адрес, введя следующий код:</p>
        <div style="text-align: center; margin: 30px 0;">
            <div style="display: inline-block; padding: 20px 40px; background-color: #f3f4f6; border: 2px solid #2563eb; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2563eb;">
                {verification_code}
            </div>
        </div>
        <p style="text-align: center;">Введите этот код на странице подтверждения email.</p>
        <p style="font-size: 12px; color: #666;">Этот код действителен в течение 24 часов.</p>
        <p>Если вы не регистрировались в Research Flow, просто проигнорируйте это письмо.</p>
        <p>С уважением,<br>Команда Research Flow</p>
    </div>
</body>
</html>"""
    
    return send_email(
        to_email=email,
        subject=subject,
        html_body=html_body,
        text_body=text_body
    )
