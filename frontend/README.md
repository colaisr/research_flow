# Research Flow — Frontend

Next.js frontend for analytical pipelines and research workflows.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set environment variable (optional, defaults to localhost:8000):**
   ```bash
   export NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
   ```
   Or create `.env.local`:
   ```
   NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
   ```

3. **Run development server:**
   ```bash
   npm run dev
   ```

4. **Verify:**
   - Visit `http://localhost:3000` — should show dashboard with backend health check

## Project Structure

```
frontend/
├── app/              # Next.js App Router pages
├── components/       # React components (to be added)
├── lib/              # Utilities (to be added)
└── public/           # Static assets
```

## Development

- **API calls:** Use `@tanstack/react-query` for data fetching (see `app/page.tsx` for example)
- **Styling:** TailwindCSS with dark mode support
- **TypeScript:** Full TypeScript support

## Deployment

See `docs/MASTER_PLAN.md` for deployment instructions (single VM, systemd).

