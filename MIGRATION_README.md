# Migration Package

This is a clean copy of the project ready for migration to a new repository.

## Next Steps

1. **Initialize new Git repository:**
   ```bash
   git init
   git branch -M main
   git remote add origin <your-new-repo-url>
   git add .
   git commit -m "Initial commit: Migrated from original project"
   git push -u origin main
   ```

2. **On new server:**
   - Clone the new repository
   - Follow the migration guide: `docs/MIGRATION_PLAN.md`
   - Or use the checklist: `docs/MIGRATION_CHECKLIST.md`

## Important Notes

- `config_local.py` is NOT included (must be created on server)
- Virtual environments are NOT included (will be created on server)
- Node modules are NOT included (will be installed on server)
- Database will be fresh (migrations will create schema)

## Files to Configure on New Server

- `backend/app/config_local.py` - Copy from `config_local.example.py` and edit
- Database credentials
- API keys (OpenRouter, Telegram)
- SESSION_SECRET (generate new one)

See `docs/MIGRATION_PLAN.md` for complete instructions.
