"""
Telegram bot webhook/polling handler for processing bot commands.
Handles /start command to register users.
"""
import asyncio
import logging
from typing import Optional
from sqlalchemy.orm import Session
from telegram import Update, Bot
from telegram.ext import Application, CommandHandler, ContextTypes
from app.core.database import SessionLocal
from app.models.telegram_user import TelegramUser
from app.services.telegram.publisher import get_telegram_credentials

logger = logging.getLogger(__name__)

_bot_application: Optional[Application] = None


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /start command - register user."""
    if not update.message or not update.effective_user:
        return
    
    user = update.effective_user
    chat_id = str(update.effective_chat.id)
    
    db = SessionLocal()
    try:
        # Check if user already exists
        existing = db.query(TelegramUser).filter(TelegramUser.chat_id == chat_id).first()
        
        if existing:
            if not existing.is_active:
                existing.is_active = True
                db.commit()
                await update.message.reply_text(
                    "✅ Welcome back! You've been reactivated. You'll receive analysis updates."
                )
            else:
                await update.message.reply_text(
                    "✅ You're already registered! You'll receive analysis updates."
                )
        else:
            # Create new user
            telegram_user = TelegramUser(
                chat_id=chat_id,
                username=user.username,
                first_name=user.first_name,
                last_name=user.last_name,
                is_active=True
            )
            db.add(telegram_user)
            db.commit()
            db.refresh(telegram_user)
            
            await update.message.reply_text(
                "✅ Welcome to Max SigNal bot!\n\n"
                "You've been registered and will receive trading analysis updates.\n\n"
                "Use /help to see available commands."
            )
            logger.info(f"Registered new Telegram user: chat_id={chat_id}, username={user.username}")
    except Exception as e:
        db.rollback()
        logger.error(f"Error registering Telegram user: {e}")
        await update.message.reply_text(
            "❌ Sorry, there was an error registering you. Please try again later."
        )
    finally:
        db.close()


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /help command."""
    if not update.message:
        return
    
    help_text = """
📊 Max SigNal bot Commands:

/start - Register to receive analysis updates
/help - Show this help message
/status - Check your registration status

You'll automatically receive trading analysis updates when new analyses are published.
    """
    await update.message.reply_text(help_text)


async def status_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /status command - check user registration."""
    if not update.message or not update.effective_chat:
        return
    
    chat_id = str(update.effective_chat.id)
    db = SessionLocal()
    try:
        user = db.query(TelegramUser).filter(TelegramUser.chat_id == chat_id).first()
        if user and user.is_active:
            await update.message.reply_text(
                f"✅ You're registered and active!\n\n"
                f"Username: {user.username or 'N/A'}\n"
                f"Registered: {user.started_at.strftime('%Y-%m-%d %H:%M')}"
            )
        else:
            await update.message.reply_text(
                "❌ You're not registered. Send /start to register."
            )
    except Exception as e:
        logger.error(f"Error checking user status: {e}")
        await update.message.reply_text("❌ Error checking status.")
    finally:
        db.close()


def get_bot_application(db: Optional[Session] = None) -> Optional[Application]:
    """Get or create Telegram bot application for handling commands."""
    global _bot_application
    
    if _bot_application:
        return _bot_application
    
    # Get bot token
    if db:
        bot_token, _ = get_telegram_credentials(db)
    else:
        db_temp = SessionLocal()
        try:
            bot_token, _ = get_telegram_credentials(db_temp)
        finally:
            db_temp.close()
    
    if not bot_token:
        logger.warning("Telegram bot token not configured, bot handler disabled")
        return None
    
    try:
        # Create application
        application = Application.builder().token(bot_token).build()
        
        # Add command handlers
        application.add_handler(CommandHandler("start", start_command))
        application.add_handler(CommandHandler("help", help_command))
        application.add_handler(CommandHandler("status", status_command))
        
        _bot_application = application
        return application
    except Exception as e:
        logger.error(f"Failed to create Telegram bot application: {e}")
        return None


async def start_bot_polling(db: Optional[Session] = None):
    """Start polling for Telegram bot updates."""
    application = get_bot_application(db)
    if not application:
        logger.warning("Cannot start bot polling - application not initialized")
        return
    
    try:
        logger.info("Starting Telegram bot polling...")
        await application.initialize()
        await application.start()
        await application.updater.start_polling(
            allowed_updates=["message", "callback_query"],
            drop_pending_updates=True  # Ignore old updates on restart
        )
        logger.info("Telegram bot polling started successfully")
    except Exception as e:
        logger.error(f"Error starting bot polling: {e}", exc_info=True)


async def stop_bot_polling():
    """Stop polling for Telegram bot updates."""
    global _bot_application
    if _bot_application:
        try:
            await _bot_application.updater.stop()
            await _bot_application.stop()
            await _bot_application.shutdown()
            logger.info("Telegram bot polling stopped")
        except Exception as e:
            logger.error(f"Error stopping bot polling: {e}")
        finally:
            _bot_application = None

