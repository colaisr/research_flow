"""
Database connection and session management.
"""
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import MYSQL_DSN

if not MYSQL_DSN:
    raise ValueError("MYSQL_DSN not configured. Create app/config_local.py from config_local.example.py")

engine = create_engine(
    MYSQL_DSN,
    pool_pre_ping=True,  # Verify connections before using
    pool_recycle=3600,  # Recycle connections after 1 hour
    pool_size=10,  # Number of connections to maintain
    max_overflow=20,  # Maximum overflow connections
    pool_timeout=60,  # Timeout for getting connection from pool (increased for slower prod)
    echo=False,  # Set to True for SQL debugging
    connect_args={
        "connect_timeout": 30,  # Connection timeout in seconds (increased)
        "read_timeout": 300,  # Read timeout in seconds (5 minutes - increased significantly)
        "write_timeout": 300,  # Write timeout in seconds (5 minutes - increased significantly)
    } if "pymysql" in MYSQL_DSN else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency for FastAPI to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        try:
            db.close()
        except Exception as e:
            # If connection is already lost, just log and continue
            # This prevents errors when MySQL connection is lost during query execution
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Error closing database session (connection may be lost): {str(e)}")
            try:
                db.rollback()
            except Exception:
                pass  # Ignore rollback errors if connection is already lost

