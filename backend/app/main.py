"""
FastAPI application entry point.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import health, runs, auth, instruments, analyses, settings
from app.core.config import get_settings
from app.core.database import SessionLocal
from app.services.telegram.bot_handler import start_bot_polling, stop_bot_polling

app_settings = get_settings()

app = FastAPI(
    title="Research Flow API",
    description="Market analysis and trading signal generation API",
    version="0.1.2",  # Deployment test v2
)

# CORS middleware (adjust origins for production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",      # Frontend dev server (localhost)
        "http://127.0.0.1:3000",      # Frontend dev server (127.0.0.1)
        "http://45.144.177.203:3000",  # Production frontend
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, tags=["health"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(instruments.router, prefix="/api/instruments", tags=["instruments"])
app.include_router(analyses.router, prefix="/api/analyses", tags=["analyses"])
app.include_router(runs.router, prefix="/api/runs", tags=["runs"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])


def _acquire_polling_lock() -> tuple[bool, object]:
    """
    Acquire exclusive lock for bot polling using PID file.
    Returns (success, lock_file) tuple.
    Lock file is kept open to maintain the lock.
    """
    import os
    import fcntl
    import logging
    logger = logging.getLogger(__name__)
    
    lock_file_path = "/tmp/research-flow-polling.lock"
    pid_file_path = "/tmp/research-flow-polling.pid"
    current_pid = os.getpid()
    
    try:
        # Open lock file
        lock_file = open(lock_file_path, 'w')
        
        # Try to acquire exclusive non-blocking lock
        try:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            # Lock is held by another process
            lock_file.close()
            
            # Check if the PID in the file is still alive
            try:
                with open(pid_file_path, 'r') as f:
                    old_pid = int(f.read().strip())
                
                # Check if process is still running
                try:
                    os.kill(old_pid, 0)  # Signal 0 just checks if process exists
                    # Process is alive, lock is valid
                    logger.info(f"Bot polling lock held by process {old_pid}, skipping")
                    return False, None
                except ProcessLookupError:
                    # Process is dead, we can take over
                    logger.warning(f"Lock file exists but process {old_pid} is dead, taking over")
                    # Remove stale PID file
                    try:
                        os.remove(pid_file_path)
                    except:
                        pass
                    # Try to acquire lock again
                    lock_file = open(lock_file_path, 'w')
                    try:
                        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    except BlockingIOError:
                        # Another process got it first
                        lock_file.close()
                        return False, None
            except (FileNotFoundError, ValueError):
                # No PID file or invalid PID, try to acquire lock
                pass
        
        # We got the lock! Write our PID
        try:
            with open(pid_file_path, 'w') as f:
                f.write(str(current_pid))
        except Exception as e:
            logger.warning(f"Failed to write PID file: {e}")
        
        logger.info(f"Acquired bot polling lock (PID: {current_pid})")
        return True, lock_file
        
    except ImportError:
        # fcntl not available (Windows)
        logger.warning("fcntl not available (Windows), bot polling may conflict with multiple workers")
        return True, None  # Allow polling but warn about potential conflicts
    except Exception as e:
        logger.error(f"Error acquiring polling lock: {e}")
        return False, None


def _release_polling_lock(lock_file):
    """Release the polling lock."""
    import os
    import fcntl
    import logging
    logger = logging.getLogger(__name__)
    
    pid_file_path = "/tmp/research-flow-polling.pid"
    
    try:
        if lock_file:
            try:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
                lock_file.close()
            except:
                pass
        
        # Remove PID file
        try:
            os.remove(pid_file_path)
        except:
            pass
        
        logger.info("Released bot polling lock")
    except Exception as e:
        logger.warning(f"Error releasing polling lock: {e}")


@app.on_event("startup")
async def startup_event():
    """Initialize services on startup."""
    # Start Telegram bot polling to handle /start commands
    # Only start polling in one process to avoid conflicts
    # With uvicorn workers, each worker runs startup, so we use a PID-based lock
    import os
    import logging
    import atexit
    logger = logging.getLogger(__name__)
    
    # Try to acquire lock
    lock_acquired, lock_file = _acquire_polling_lock()
    
    if not lock_acquired:
        logger.info("Bot polling already active in another process, skipping")
        return
    
    # Store lock file globally so it stays open
    import app.main as main_module
    main_module._polling_lock_file = lock_file
    
    # Register cleanup on exit
    def release_lock():
        _release_polling_lock(main_module._polling_lock_file)
        if hasattr(main_module, '_polling_lock_file'):
            main_module._polling_lock_file = None
    atexit.register(release_lock)
    
    # Start polling
    db = SessionLocal()
    try:
        await start_bot_polling(db)
        logger.info("Telegram bot polling started successfully")
    except Exception as e:
        logger.warning(f"Could not start Telegram bot polling: {e}")
        # Release lock if polling failed
        _release_polling_lock(lock_file)
        main_module._polling_lock_file = None
    finally:
        db.close()


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    await stop_bot_polling()
    
    # Release lock file if we have it
    try:
        import app.main as main_module
        if hasattr(main_module, '_polling_lock_file'):
            _release_polling_lock(main_module._polling_lock_file)
            main_module._polling_lock_file = None
    except:
        pass

