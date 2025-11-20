# Research Flow - Local Setup Validation

## ✅ Setup Completed Successfully

### Database Setup
- ✅ Database `research_flow_dev` created
- ✅ User `research_flow_user` created with password `research_flow_password`
- ✅ All 12 tables created via Alembic migrations
- ✅ 4 analysis types seeded
- ✅ 1 admin user created (admin@rf.ru / 1234)

### Backend Setup
- ✅ Python virtual environment created (`.venv`)
- ✅ All dependencies installed from `requirements.txt`
- ✅ Configuration file created (`backend/app/config_local.py`)
- ✅ Database connection verified
- ✅ All migrations applied successfully

### Frontend Setup
- ✅ Node modules installed
- ✅ Dependencies from `package.json` installed

### Project Name Updates
- ✅ All references updated from "Max Signal Bot" to "Research Flow"
- ✅ API title updated
- ✅ Lock file paths updated
- ✅ Bot welcome messages updated
- ✅ Frontend landing page updated

## 🚀 Starting the Application

### Start Backend
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Or use the convenience script:
```bash
./scripts/start_all.sh
```

### Start Frontend
```bash
cd frontend
npm run dev
```

Or use the convenience script (starts both):
```bash
./scripts/start_all.sh
```

### Access Points
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Health Check: http://localhost:8000/health

## 🔐 Default Credentials

**Admin User:**
- Email: `admin@rf.ru`
- Password: `1234`

## 📋 Database Connection Details

- Host: `localhost`
- Port: `3306`
- Database: `research_flow_dev`
- Username: `research_flow_user`
- Password: `research_flow_password`

## ⚙️ Configuration

The `backend/app/config_local.py` file contains:
- Database connection string (configured)
- OpenRouter API key (needs to be set for LLM features)
- Telegram bot token (needs to be set for Telegram features)
- Session secret (set to dev value, change in production)

## ✅ Validation Checklist

- [x] Database created and accessible
- [x] All migrations applied
- [x] Admin user created
- [x] Backend dependencies installed
- [x] Frontend dependencies installed
- [x] Database connection works
- [x] Project name updated throughout codebase
- [ ] Backend server starts successfully
- [ ] Frontend server starts successfully
- [ ] Login works with admin credentials
- [ ] API endpoints respond correctly
- [ ] Database queries work correctly

## 🔍 Testing

### Test Database Connection
```bash
cd backend
source .venv/bin/activate
python -c "from app.core.database import SessionLocal; db = SessionLocal(); print('✅ Database connection OK'); db.close()"
```

### Test Admin User Creation
```bash
cd backend
source .venv/bin/activate
python scripts/create_admin_user.py --email admin@rf.ru --password 1234
```

### Test API Health Endpoint
```bash
curl http://localhost:8000/health
```

## 📝 Notes

- The database is separate from any other projects (e.g., infrazen_dev)
- All configuration is in `backend/app/config_local.py` (gitignored)
- For production deployment, see `docs/PRODUCTION_DEPLOYMENT.md`
