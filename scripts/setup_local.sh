#!/usr/bin/env bash
# Local development setup script for Research Flow
# This script helps set up the MySQL database, Python venv, and run migrations

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"

echo "🚀 Research Flow - Local Setup"
echo "================================"
echo ""

# Step 1: MySQL Database Setup
echo "📊 Step 1: MySQL Database Setup"
echo "-------------------------------"
echo ""
echo "You need to run the MySQL setup script manually:"
echo "  1. Edit scripts/mysql_local_setup.sql and set a password"
echo "  2. Run: mysql -u root -p < scripts/mysql_local_setup.sql"
echo ""
read -p "Have you already created the database? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Please create the database first, then run this script again."
    exit 1
fi

# Step 2: Create config_local.py
echo ""
echo "⚙️  Step 2: Backend Configuration"
echo "----------------------------------"
if [ ! -f "$BACKEND_DIR/app/config_local.py" ]; then
    echo "Creating config_local.py from example..."
    cp "$BACKEND_DIR/app/config_local.example.py" "$BACKEND_DIR/app/config_local.py"
    echo "✅ Created config_local.py"
    echo ""
    echo "⚠️  IMPORTANT: Edit backend/app/config_local.py and set:"
    echo "   - MYSQL_DSN password (replace CHANGE_ME_STRONG_PASSWORD)"
    echo "   - OPENROUTER_API_KEY (optional for now)"
    echo "   - TELEGRAM_BOT_TOKEN (optional for now)"
    echo "   - SESSION_SECRET (generate a random string)"
    echo ""
    read -p "Press Enter after you've edited config_local.py..."
else
    echo "✅ config_local.py already exists"
fi

# Step 3: Python Virtual Environment
echo ""
echo "🐍 Step 3: Python Virtual Environment"
echo "--------------------------------------"
if [ ! -d "$BACKEND_DIR/.venv" ]; then
    echo "Creating Python virtual environment..."
    cd "$BACKEND_DIR"
    python3.11 -m venv .venv
    echo "✅ Virtual environment created"
else
    echo "✅ Virtual environment already exists"
fi

# Step 4: Install Dependencies
echo ""
echo "📦 Step 4: Install Dependencies"
echo "--------------------------------"
cd "$BACKEND_DIR"
source .venv/bin/activate
echo "Upgrading pip..."
pip install --upgrade pip --quiet
echo "Installing requirements..."
pip install -r requirements.txt --quiet
echo "✅ Dependencies installed"

# Step 5: Run Alembic Migrations
echo ""
echo "🗄️  Step 5: Database Migrations"
echo "---------------------------------"
echo "Creating initial migration..."
if [ ! -f "$BACKEND_DIR/alembic/versions/001_initial.py" ]; then
    alembic revision --autogenerate -m "Initial migration" || {
        echo "⚠️  Migration creation failed. Check your config_local.py MySQL connection."
        exit 1
    }
    echo "✅ Migration created"
else
    echo "✅ Migration already exists"
fi

echo "Applying migrations..."
alembic upgrade head || {
    echo "⚠️  Migration failed. Check your MySQL connection in config_local.py"
    exit 1
}
echo "✅ Migrations applied successfully"

# Step 6: Summary
echo ""
echo "✅ Setup Complete!"
echo "=================="
echo ""
echo "Next steps:"
echo "  1. Start backend: cd backend && source .venv/bin/activate && uvicorn app.main:app --reload"
echo "  2. Start frontend: cd frontend && npm install && npm run dev"
echo "  3. Visit http://localhost:3000"
echo ""

