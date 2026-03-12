# Videos AI - Project Overview

## 1) What this project does

Videos AI is a full-stack app for generating:

- Storyboards (script + scenes + scene images + scene videos)
- Product ad videos
- Short videos with optional character reference
- Motion control videos (Kling)
- Thumbnails and design assets

The system is configured in **fal-only mode** for provider routing.

---

## 2) High-level architecture

### Frontend (`React + Vite`)

- Main app and routing in `src/App.tsx`
- Tool pages in `src/pages/*`
- Unified data access in `src/lib/db.ts`
- AI orchestration in:
  - `src/lib/aiProvider.ts` (provider-level API calls)
  - `src/lib/aiService.ts` (feature workflows)
  - `src/lib/fal.ts` (video task helpers and polling)

### Backend (`FastAPI + Uvicorn`)

- Entry: `backend/server.py`
- Handles settings, model discovery, generation endpoints, uploads, and health checks
- MongoDB is used when available, with graceful degradation behavior when unavailable

---

## 3) fal-only behavior

- Frontend provider is locked to `fal`
- Key validation is enforced both client-side and server-side
- All core generation routes are wired to fal endpoints
- Settings UI and model selection target fal endpoints only

---

## 4) Media lifecycle and persistence

### Durable storage

- Media root is controlled by backend env var:
  - `MEDIA_ROOT=/var/lib/videosai/media` (recommended on VPS)
- Static serving path stays stable:
  - `/api/uploads/*`

### Upload contract (`/api/media/upload`)

Accepted `data` formats:

- Data URL / raw base64
- Local server URL under `/api/uploads/...`
- Remote `http(s)` URL (downloaded and persisted locally)

### File organization

- Images -> `MEDIA_ROOT/images`
- Videos -> `MEDIA_ROOT/videos`

### Gallery persistence behavior

- Backend writes media records to DB when available
- Also writes a durable disk index (`media_index.json`) under `MEDIA_ROOT`
- If DB is unavailable, gallery listing falls back to the disk index
- Deleting a media item removes both:
  - metadata index entry
  - local file (when it belongs to `/api/uploads/...`)

This design keeps local disk persistence now and stays compatible with future S3 adapter migration.

---

## 5) Settings + model loading strategy

- Settings page loads server settings once on mount
- Model lists are loaded once on initial settings load
- Model reload is explicitly triggered after:
  - Save settings
  - Successful Test Connection
- Per-endpoint diagnostics are surfaced in the UI for:
  - `settings`
  - `models-text`
  - `models-image`
  - `models-video`
  - `test-connection`

---

## 6) Deployment (native VPS)

Deployment assets:

- `deploy/systemd/videosai-backend.service`
- `deploy/systemd/videosai-frontend.service`
- `deploy/nginx/videosai.conf`
- `deploy/VPS_DEPLOY.md`

Runtime stack:

- `Nginx` reverse proxy
- `Uvicorn` backend service (systemd)
- `Vite build + vite preview` frontend service (systemd)

Production notes:

- Do not run backend with `--reload` in production
- Install `ffmpeg` for merge/video processing features
- Keep `MEDIA_ROOT` outside release directory

---

## 7) Environment variables

Backend (`backend/.env`):

- `FAL_KEY` (required for fal generation)
- `MONGO_URL` (recommended)
- `DB_NAME` (default: `storyweaver`)
- `MEDIA_ROOT` (required for persistent VPS media)

Sample file:

- `backend/.env.example`

---

## 8) Operational checklist

1. `systemctl status videosai-backend videosai-frontend`
2. `curl http://127.0.0.1:8001/api/health`
3. Open settings page and run connection test
4. Generate sample media
5. Verify gallery entries
6. Restart services
7. Re-open gallery and ensure files still resolve under `/api/uploads/*`

---

## 9) Troubleshooting quick guide

- **`/api/fal/models` empty for image/video**  
  Validate fal key format (ASCII, no spaces), then Save and Test in settings.

- **Connection refused from frontend**  
  Ensure backend service is running on `127.0.0.1:8001` and Nginx proxy is reloaded.

- **Media missing after restart**  
  Confirm `MEDIA_ROOT` points to persistent path and service user has read/write permissions.

- **Slow/failed generation from fal**  
  Check backend logs and fal dashboard; retry logic is implemented for transient 429/5xx errors.

---

## 10) Safe cleanup report

Removed clearly unnecessary root artifact files:

- `app`
- `frontend`
- `typescript`
- `src/lib/kie.ts`
- `src/lib/kling.ts`

These were either artifact files or unused library modules with no active import/runtime path.
