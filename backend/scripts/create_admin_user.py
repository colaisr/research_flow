"""
Script to create the first admin user.
Run this after migrations to create the initial admin account.
"""
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.database import SessionLocal
from app.models.user import User
import bcrypt


def create_admin_user(email: str, password: str, full_name: str = "Admin User"):
    """Create the first admin user."""
    db = SessionLocal()
    try:
        # Check if admin already exists
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            print(f"User with email {email} already exists!")
            return
        
        # Create admin user
        # Hash password with bcrypt
        password_bytes = password.encode('utf-8')
        hashed_password = bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode('utf-8')
        
        admin = User(
            email=email,
            hashed_password=hashed_password,
            full_name=full_name,
            is_active=True,
            is_admin=True
        )
        
        db.add(admin)
        db.commit()
        print(f"✅ Admin user created successfully!")
        print(f"   Email: {email}")
        print(f"   Password: {password}")
        print(f"   Admin: Yes")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error creating admin user: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description='Create admin user')
    parser.add_argument('--email', default='admin@maxsignal.com', help='Admin email')
    parser.add_argument('--password', default='admin123', help='Admin password')
    parser.add_argument('--name', default='Admin User', help='Admin full name')
    
    args = parser.parse_args()
    create_admin_user(args.email, args.password, args.name)

