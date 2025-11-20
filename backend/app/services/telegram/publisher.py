"""
Telegram bot service for publishing analysis results.
"""
from typing import Optional
from sqlalchemy.orm import Session
import logging

logger = logging.getLogger(__name__)

# Lazy import - only import if token is configured
_telegram_bot = None
_telegram_bot_token = None


def get_telegram_credentials(db: Optional[Session] = None) -> tuple[Optional[str], Optional[str]]:
    """Get Telegram bot token from Settings (AppSettings table).
    
    Args:
        db: Database session (required)
    
    Returns:
        Tuple of (bot_token, None) - channel_id removed, kept for backward compatibility
    """
    if not db:
        logger.error("Database session required to read Telegram credentials from Settings")
        return None, None
    
    try:
        from app.models.settings import AppSettings
        bot_token_setting = db.query(AppSettings).filter(
            AppSettings.key == "telegram_bot_token"
        ).first()
        
        bot_token = bot_token_setting.value if bot_token_setting and bot_token_setting.value else None
        
        return bot_token, None  # channel_id no longer needed
    except Exception as e:
        logger.error(f"Failed to read Telegram credentials from Settings: {e}")
        return None, None


def get_telegram_bot(bot_token: Optional[str] = None):
    """Get or create Telegram bot instance.
    
    Args:
        bot_token: Optional bot token. If not provided, will use cached token.
    """
    global _telegram_bot, _telegram_bot_token
    
    if bot_token:
        _telegram_bot_token = bot_token
    
    if not _telegram_bot_token:
        logger.warning("Telegram bot token not configured")
        return None
    
    if _telegram_bot is None or _telegram_bot_token != bot_token:
        try:
            from telegram import Bot
            _telegram_bot = Bot(token=_telegram_bot_token)
        except ImportError:
            logger.error("python-telegram-bot not installed. Run: pip install python-telegram-bot")
            return None
    
    return _telegram_bot


def split_message(text: str, max_length: int = 4096) -> list[str]:
    """Split message into chunks that fit Telegram's limit.
    
    Args:
        text: Message text to split
        max_length: Maximum length per chunk (default 4096 for Telegram)
    
    Returns:
        List of message chunks
    """
    if len(text) <= max_length:
        return [text]
    
    chunks = []
    current_chunk = ""
    
    # Try to split by paragraphs first
    paragraphs = text.split('\n\n')
    
    for para in paragraphs:
        # If adding this paragraph would exceed limit, save current chunk and start new
        if len(current_chunk) + len(para) + 2 > max_length:
            if current_chunk:
                chunks.append(current_chunk.strip())
            current_chunk = para
        else:
            if current_chunk:
                current_chunk += '\n\n' + para
            else:
                current_chunk = para
    
    # Add remaining chunk
    if current_chunk:
        chunks.append(current_chunk.strip())
    
    # If still too long, split by lines
    final_chunks = []
    for chunk in chunks:
        if len(chunk) <= max_length:
            final_chunks.append(chunk)
        else:
            # Split by lines
            lines = chunk.split('\n')
            temp_chunk = ""
            for line in lines:
                if len(temp_chunk) + len(line) + 1 > max_length:
                    if temp_chunk:
                        final_chunks.append(temp_chunk.strip())
                    temp_chunk = line
                else:
                    if temp_chunk:
                        temp_chunk += '\n' + line
                    else:
                        temp_chunk = line
            if temp_chunk:
                final_chunks.append(temp_chunk.strip())
    
    return final_chunks


async def publish_to_telegram(message_text: str, db: Optional[Session] = None) -> dict:
    """Publish message to all users who started the bot.
    
    Args:
        message_text: Text to publish
        db: Database session to read credentials and users from Settings
    
    Returns:
        Dict with 'success', 'message_ids', 'users_notified', 'error'
    """
    # Get bot token from Settings
    bot_token, _ = get_telegram_credentials(db)
    
    if not bot_token:
        return {
            'success': False,
            'error': 'Telegram bot token not configured. Please set it in Settings → Telegram Configuration'
        }
    
    if not db:
        return {
            'success': False,
            'error': 'Database session required'
        }
    
    # Get all active users who started the bot
    from app.models.telegram_user import TelegramUser
    users = db.query(TelegramUser).filter(TelegramUser.is_active == True).all()
    
    if not users:
        return {
            'success': False,
            'error': 'No users have started the bot yet. Users need to send /start to the bot first.'
        }
    
    bot = get_telegram_bot(bot_token)
    if not bot:
        return {
            'success': False,
            'error': 'Failed to initialize Telegram bot'
        }
    
    try:
        # Split message if needed
        chunks = split_message(message_text)
        all_message_ids = []
        successful_users = []
        failed_users = []
        
        for user in users:
            try:
                user_message_ids = []
                logger.info(f"Attempting to send to user: chat_id={user.chat_id}, username={user.username}")
                for i, chunk in enumerate(chunks):
                    # Add part indicator if multiple chunks
                    if len(chunks) > 1:
                        chunk = f"📊 Часть {i + 1}/{len(chunks)}\n\n{chunk}"
                    
                    # Send message to user
                    message = await bot.send_message(
                        chat_id=int(user.chat_id),  # chat_id is stored as string, convert to int
                        text=chunk,
                        parse_mode=None
                    )
                    user_message_ids.append(message.message_id)
                    all_message_ids.append(message.message_id)
                    logger.debug(f"Sent chunk {i+1}/{len(chunks)} to user {user.chat_id}, message_id={message.message_id}")
                
                successful_users.append(user.chat_id)
                logger.info(f"Successfully sent message to user: chat_id={user.chat_id}, username={user.username}, chunks={len(chunks)}")
                
            except Exception as e:
                error_msg = str(e)
                error_type = type(e).__name__
                logger.error(f"Failed to send to user {user.chat_id} (username={user.username}): {error_type}: {error_msg}", exc_info=True)
                failed_users.append({'chat_id': user.chat_id, 'username': user.username, 'error': error_msg, 'error_type': error_type})
                # Continue with other users even if one fails
        
        if successful_users:
            return {
                'success': True,
                'message_ids': all_message_ids,
                'chunks_sent': len(chunks),
                'users_notified': len(successful_users),
                'users_failed': len(failed_users),
                'failed_users': failed_users if failed_users else None
            }
        else:
            return {
                'success': False,
                'error': f'Failed to send to all {len(users)} users. Check logs for details.',
                'failed_users': failed_users
            }
            
    except Exception as e:
        error_msg = str(e)
        logger.error(f"telegram_publish_failed: {error_msg}", exc_info=True)
        
        # Provide more helpful error messages for common issues
        if "Unauthorized" in error_msg or "401" in error_msg:
            return {
                'success': False,
                'error': 'Telegram bot token is invalid or expired. Please check Settings → Telegram Configuration'
            }
        else:
            return {
                'success': False,
                'error': f'Failed to publish to Telegram: {error_msg}'
            }

