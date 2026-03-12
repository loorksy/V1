from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from datetime import datetime, timezone
import httpx
import os
import uuid
import base64
import json
import asyncio
import fal_client

# Load .env: prefer /app/.env (Docker), then backend/.env, then project root .env
_env_path = "/app/.env" if os.path.isfile("/app/.env") else os.path.join(os.path.dirname(__file__), ".env")
if not os.path.isfile(_env_path):
    _env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
load_dotenv(_env_path)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

KIE_API_KEY_ENV = os.environ.get("KIE_API_KEY", "")
KIE_BASE_URL = "https://api.kie.ai/api/v1"
FAL_KEY_ENV = os.environ.get("FAL_KEY", "")
FAL_API_BASE = "https://api.fal.ai"
FAL_RUN_BASE = "https://fal.run"
APP_URL = os.environ.get("APP_URL", "")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "storyweaver")
RUNTIME_FAL_KEY = ""
MONGO_SERVER_SELECTION_TIMEOUT_MS = int(os.environ.get("MONGO_SERVER_SELECTION_TIMEOUT_MS", "5000"))
MONGO_CONNECT_TIMEOUT_MS = int(os.environ.get("MONGO_CONNECT_TIMEOUT_MS", "5000"))
MONGO_SOCKET_TIMEOUT_MS = int(os.environ.get("MONGO_SOCKET_TIMEOUT_MS", "5000"))
MONGO_AVAILABLE = True
DEFAULT_TEXT_MODEL = "google/gemini-2.5-flash"
DEFAULT_IMAGE_MODEL = "fal-ai/flux/dev"
DEFAULT_VIDEO_MODEL = "fal-ai/kling-video/v2.6/text-to-video/standard"
SETTINGS_CACHE: Dict[str, Any] = {
    "provider": "fal",
    "text_model": DEFAULT_TEXT_MODEL,
    "image_model": DEFAULT_IMAGE_MODEL,
    "video_model": DEFAULT_VIDEO_MODEL,
    "kie_api_key": KIE_API_KEY_ENV,
    "fal_api_key": FAL_KEY_ENV,
}


def get_kie_api_key() -> str:
    """Read kie.ai key from fast cache, fallback to env."""
    cached = (SETTINGS_CACHE.get("kie_api_key") or "").strip()
    return cached or KIE_API_KEY_ENV


def get_fal_api_key() -> str:
    """Read fal.ai key from fast cache/runtime, fallback to env."""
    global RUNTIME_FAL_KEY
    cached = (SETTINGS_CACHE.get("fal_api_key") or "").strip()
    if cached:
        return cached
    if RUNTIME_FAL_KEY:
        return RUNTIME_FAL_KEY
    return FAL_KEY_ENV or ""


def validate_fal_api_key(api_key: str) -> str:
    """Validate and normalize fal API key to prevent invalid HTTP headers."""
    key = (api_key or "").strip()
    if not key:
        return ""
    if any(ch.isspace() for ch in key):
        raise HTTPException(status_code=400, detail="fal_api_key يحتوي مسافات غير صالحة")
    try:
        key.encode("ascii")
    except UnicodeEncodeError:
        raise HTTPException(status_code=400, detail="fal_api_key يجب أن يحتوي أحرف إنجليزية فقط (ASCII)")
    return key

# MongoDB
class _NoopCursor:
    def sort(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def __iter__(self):
        return iter([])


class _NoopCollection:
    def find_one(self, *args, **kwargs):
        return None

    def find(self, *args, **kwargs):
        return _NoopCursor()

    def update_one(self, *args, **kwargs):
        return None

    def delete_one(self, *args, **kwargs):
        return None


class _NoopDB:
    def __getattr__(self, name):
        return _NoopCollection()


try:
    client = MongoClient(
        MONGO_URL,
        serverSelectionTimeoutMS=MONGO_SERVER_SELECTION_TIMEOUT_MS,
        connectTimeoutMS=MONGO_CONNECT_TIMEOUT_MS,
        socketTimeoutMS=MONGO_SOCKET_TIMEOUT_MS,
        retryWrites=True,
    )
    db = client[DB_NAME]
except Exception:
    # Keep API bootable even when Mongo SRV/DNS is down.
    MONGO_AVAILABLE = False
    client = None
    db = _NoopDB()

# Persistent media directory (VPS-friendly). Keep outside release directory via MEDIA_ROOT env when deploying.
MEDIA_ROOT = os.environ.get("MEDIA_ROOT", os.path.join(os.path.dirname(__file__), "uploads"))
MEDIA_PUBLIC_BASE = "/api/uploads"
os.makedirs(MEDIA_ROOT, exist_ok=True)
app.mount(MEDIA_PUBLIC_BASE, StaticFiles(directory=MEDIA_ROOT), name="uploads")
MEDIA_INDEX_FILE = os.path.join(MEDIA_ROOT, "media_index.json")


# ============ HELPERS ============

def _safe_ext(ext: str, fallback: str = "bin") -> str:
    val = (ext or fallback).strip().lower().replace(".", "")
    return val or fallback


def _guess_ext_from_url(url: str, fallback: str) -> str:
    path = (url or "").split("?", 1)[0].split("#", 1)[0]
    if "." in path:
        return _safe_ext(path.rsplit(".", 1)[-1], fallback)
    return fallback


def _media_url_to_local_path(url: str) -> Optional[str]:
    if not url or not url.startswith(f"{MEDIA_PUBLIC_BASE}/"):
        return None
    rel = url[len(MEDIA_PUBLIC_BASE) + 1 :]
    local = os.path.abspath(os.path.join(MEDIA_ROOT, rel))
    media_root_abs = os.path.abspath(MEDIA_ROOT)
    if not local.startswith(media_root_abs):
        return None
    return local


def _save_bytes_file(file_bytes: bytes, ext: str = "jpg", subdir: str = "") -> str:
    final_ext = _safe_ext(ext, "bin")
    final_subdir = (subdir or "").strip().strip("/\\")
    target_dir = os.path.join(MEDIA_ROOT, final_subdir) if final_subdir else MEDIA_ROOT
    os.makedirs(target_dir, exist_ok=True)
    fname = f"{uuid.uuid4().hex}.{final_ext}"
    fpath = os.path.join(target_dir, fname)
    with open(fpath, "wb") as f:
        f.write(file_bytes)
    rel = f"{final_subdir}/{fname}" if final_subdir else fname
    return f"{MEDIA_PUBLIC_BASE}/{rel.replace(os.sep, '/')}"


def _read_media_index() -> List[Dict[str, Any]]:
    try:
        if not os.path.isfile(MEDIA_INDEX_FILE):
            return []
        with open(MEDIA_INDEX_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
    except Exception:
        pass
    return []


def _write_media_index(items: List[Dict[str, Any]]) -> None:
    try:
        with open(MEDIA_INDEX_FILE, "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def _upsert_media_index(doc: Dict[str, Any]) -> None:
    items = _read_media_index()
    replaced = False
    for i, it in enumerate(items):
        if it.get("id") == doc.get("id"):
            items[i] = doc
            replaced = True
            break
    if not replaced:
        items.append(doc)
    _write_media_index(items)


def _remove_media_index(media_id: str) -> None:
    items = _read_media_index()
    items = [x for x in items if x.get("id") != media_id]
    _write_media_index(items)


def save_base64_file(data: str, ext: str = "jpg", subdir: str = "") -> str:
    if "," in data:
        data = data.split(",", 1)[1]
    file_bytes = base64.b64decode(data)
    return _save_bytes_file(file_bytes, ext=ext, subdir=subdir)


async def save_remote_media_to_local(url: str, media_type: str) -> str:
    ext = _guess_ext_from_url(url, "mp4" if media_type == "video" else "jpg")
    subdir = "videos" if media_type == "video" else "images"
    async with httpx.AsyncClient(timeout=45) as client:
        resp = await client.get(url)
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"تعذر تنزيل الوسائط من الرابط: HTTP {resp.status_code}")
        return _save_bytes_file(resp.content, ext=ext, subdir=subdir)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


async def fetch_settings_from_db(timeout_sec: float = 1.0) -> Optional[Dict[str, Any]]:
    """Fetch settings without blocking event loop for long when Mongo is slow."""
    if not MONGO_AVAILABLE:
        return None
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(db.settings.find_one, {"key": "app_settings"}, {"_id": 0}),
            timeout=timeout_sec,
        )
    except Exception:
        return None


def apply_settings_to_cache(settings: Dict[str, Any]) -> None:
    if not settings:
        return
    for key in ("provider", "text_model", "image_model", "video_model", "kie_api_key", "fal_api_key"):
        if key in settings and settings.get(key) is not None:
            SETTINGS_CACHE[key] = settings.get(key)


def normalize_aspect_ratio(value: str, default_value: str = "16:9") -> str:
    """Normalize aspect ratio to fal-accepted literal format: 16:9 or 9:16."""
    raw = (value or "").strip().replace("/", ":")
    if raw in ("16:9", "9:16"):
        return raw
    return default_value


async def upload_bytes_to_fal_storage(file_bytes: bytes, filename: str, content_type: str, api_key: str) -> str:
    """Upload bytes to fal storage and return CDN URL.
    Uses official fal_client to avoid deprecated/invalid REST upload hosts.
    """
    def _upload_sync() -> str:
        client = fal_client.SyncClient(key=api_key)
        return client.upload(file_bytes, content_type, file_name=filename)

    try:
        url = await asyncio.to_thread(_upload_sync)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"تعذر رفع الملف إلى fal storage: {e}")

    if not url:
        raise HTTPException(status_code=500, detail="لم يتم إرجاع رابط من fal storage")
    return url


# ============ HEALTH ============

@app.get("/api/health")
def health():
    return {"status": "ok"}


# ============ MEDIA UPLOAD ============

class MediaUploadRequest(BaseModel):
    data: str  # base64 data URL, raw base64, local /api/uploads URL, or remote URL
    type: str = "image"
    source: str = ""
    id: Optional[str] = None
    title: str = ""
    description: str = ""
    aspectRatio: str = "16:9"


@app.post("/api/media/upload")
async def upload_media(req: MediaUploadRequest):
    raw = (req.data or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="data is required")
    media_type = "video" if req.type == "video" else "image"
    ext = "mp4" if media_type == "video" else "jpg"

    if raw.startswith(f"{MEDIA_PUBLIC_BASE}/"):
        local = _media_url_to_local_path(raw)
        if not local or not os.path.isfile(local):
            raise HTTPException(status_code=400, detail="الرابط المحلي غير موجود على الخادم")
        url = raw
    elif raw.startswith("http://") or raw.startswith("https://"):
        url = await save_remote_media_to_local(raw, media_type=media_type)
    else:
        subdir = "videos" if media_type == "video" else "images"
        url = save_base64_file(raw, ext, subdir=subdir)

    doc = {
        "id": req.id or uuid.uuid4().hex,
        "url": url,
        "type": media_type,
        "source": req.source,
        "title": req.title,
        "description": req.description,
        "aspectRatio": req.aspectRatio,
        "createdAt": now_iso(),
    }
    _upsert_media_index(doc)
    try:
        db.media.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
    except Exception:
        # Disk index acts as durable fallback when DB is unavailable.
        pass
    return {"id": doc["id"], "url": url}


@app.get("/api/media/list")
async def list_media(type: Optional[str] = None, source: Optional[str] = None):
    query = {}
    if type:
        query["type"] = type
    if source:
        query["source"] = source
    try:
        items = list(db.media.find(query, {"_id": 0}).sort("createdAt", -1).limit(100))
        return items
    except PyMongoError:
        # Degrade gracefully when MongoDB is temporarily unreachable.
        items = _read_media_index()
        if type:
            items = [x for x in items if x.get("type") == type]
        if source:
            items = [x for x in items if x.get("source") == source]
        items.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
        return items[:100]


# ============ CHARACTERS ============

class CharacterSaveRequest(BaseModel):
    id: Optional[str] = None
    name: str
    description: str
    visualTraits: str = ""
    images: Dict[str, str] = {}  # key -> base64


@app.post("/api/characters/save")
async def save_character(req: CharacterSaveRequest):
    if not MONGO_AVAILABLE:
        raise HTTPException(status_code=503, detail="قاعدة البيانات غير متاحة. تأكد من تشغيل MongoDB وحفظ الشخصيات.")
    char_id = req.id or uuid.uuid4().hex

    # Upload images and convert base64 to URLs (store under images/ subdir)
    image_urls = {}
    for key, val in req.images.items():
        if val and len(val) > 200:
            if val.startswith("http"):
                image_urls[key] = val
            else:
                image_urls[key] = save_base64_file(val, ext="jpg", subdir="images")

    doc = {
        "id": char_id,
        "name": req.name,
        "description": req.description,
        "visualTraits": req.visualTraits,
        "images": image_urls,
        "createdAt": now_iso(),
    }

    db.characters.update_one({"id": char_id}, {"$set": doc}, upsert=True)
    return doc


@app.get("/api/characters/list")
async def list_characters():
    try:
        chars = list(db.characters.find({}, {"_id": 0}).sort("createdAt", -1))
        return chars
    except PyMongoError:
        # Keep frontend usable during Atlas/network outages.
        return []


@app.delete("/api/characters/{char_id}")
async def delete_character(char_id: str):
    db.characters.delete_one({"id": char_id})
    return {"ok": True}


@app.get("/api/characters/{char_id}")
async def get_character(char_id: str):
    try:
        char = db.characters.find_one({"id": char_id}, {"_id": 0})
    except PyMongoError:
        raise HTTPException(status_code=503, detail="قاعدة البيانات غير متاحة حالياً")
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")
    return char


# ============ STORYBOARDS ============

class SceneSave(BaseModel):
    description: str
    characterIds: List[str] = []
    dialogue: str = ""
    frameImage: str = ""  # base64 or url
    videoUrl: str = ""


class StoryboardSaveRequest(BaseModel):
    id: Optional[str] = None
    title: str = ""
    script: str = ""
    style: str = ""
    aspectRatio: str = "16:9"
    scenes: List[SceneSave] = []
    videoTasks: Optional[List[Dict[str, Any]]] = None


@app.post("/api/storyboards/save")
async def save_storyboard(req: StoryboardSaveRequest):
    sb_id = req.id or uuid.uuid4().hex

    saved_scenes = []
    for scene in req.scenes:
        frame_url = ""
        if scene.frameImage and len(scene.frameImage) > 200:
            if scene.frameImage.startswith("http"):
                frame_url = scene.frameImage
            else:
                frame_url = save_base64_file(scene.frameImage)

        saved_scenes.append({
            "description": scene.description,
            "characterIds": scene.characterIds,
            "dialogue": scene.dialogue,
            "frameImage": frame_url,
            "videoUrl": scene.videoUrl,
        })

    doc = {
        "id": sb_id,
        "title": req.title,
        "script": req.script,
        "style": req.style,
        "aspectRatio": req.aspectRatio,
        "scenes": saved_scenes,
        "createdAt": now_iso(),
    }
    if req.videoTasks is not None:
        doc["videoTasks"] = req.videoTasks

    db.storyboards.update_one({"id": sb_id}, {"$set": doc}, upsert=True)
    return doc


@app.get("/api/storyboards/list")
async def list_storyboards():
    try:
        items = list(db.storyboards.find({}, {"_id": 0}).sort("createdAt", -1))
        return items
    except PyMongoError:
        # Return empty list instead of HTTP 500 when Mongo is down.
        return []


@app.get("/api/storyboards/{sb_id}")
async def get_storyboard(sb_id: str):
    try:
        sb = db.storyboards.find_one({"id": sb_id}, {"_id": 0})
    except PyMongoError:
        raise HTTPException(status_code=503, detail="قاعدة البيانات غير متاحة حالياً")
    if not sb:
        raise HTTPException(status_code=404, detail="Storyboard not found")
    return sb


@app.delete("/api/storyboards/{sb_id}")
async def delete_storyboard(sb_id: str):
    db.storyboards.delete_one({"id": sb_id})
    return {"ok": True}


@app.delete("/api/media/{media_id}")
async def delete_media(media_id: str):
    try:
        existing = db.media.find_one({"id": media_id}, {"_id": 0})
    except Exception:
        existing = None
    if not existing:
        for item in _read_media_index():
            if item.get("id") == media_id:
                existing = item
                break

    if existing and existing.get("url"):
        local_path = _media_url_to_local_path(existing.get("url", ""))
        if local_path and os.path.isfile(local_path):
            try:
                os.remove(local_path)
            except Exception:
                pass

    _remove_media_index(media_id)
    try:
        db.media.delete_one({"id": media_id})
    except Exception:
        pass
    return {"ok": True}



# ============ KIE.AI VIDEO ============

class GenerateVideoRequest(BaseModel):
    prompt: str
    image_url: Optional[str] = None
    model: str = "veo3_fast"
    aspect_ratio: str = "16:9"
    generation_mode: str = "TEXT_2_VIDEO"


@app.post("/api/kie/generate-video")
async def generate_video(req: GenerateVideoRequest):
    api_key = get_kie_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="KIE_API_KEY not configured")

    payload = {
        "prompt": req.prompt,
        "model": req.model,
        "aspect_ratio": req.aspect_ratio,
    }
    if req.image_url:
        image_url = req.image_url
        if "preview.emergentagent.com" in image_url or "localhost" in image_url:
            async with httpx.AsyncClient(timeout=30) as dl:
                img_resp = await dl.get(image_url)
                if img_resp.status_code == 200:
                    fname = f"{uuid.uuid4().hex}.jpg"
                    image_url = await upload_image_to_kie(img_resp.content, fname)
        payload["imageUrls"] = [image_url]
        payload["generation_mode"] = req.generation_mode

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{KIE_BASE_URL}/veo/generate", json=payload, headers=headers)
        result = resp.json()
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=result.get("message", str(result)))
        return result


@app.get("/api/kie/task-status/{task_id}")
async def task_status(task_id: str):
    api_key = get_kie_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="KIE_API_KEY not configured")

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{KIE_BASE_URL}/veo/record-info?taskId={task_id}", headers=headers)
        result = resp.json()
        
        # Normalize response for frontend
        data = result.get("data") or {}
        success_flag = data.get("successFlag", 0)
        
        status = "processing"
        video_url = ""
        if success_flag == 1:
            status = "completed"
            # resultUrls is inside data.response.resultUrls (as a list)
            response_obj = data.get("response") or {}
            urls = response_obj.get("resultUrls") or []
            video_url = urls[0] if urls else ""
        elif success_flag in (2, 3):
            status = "failed"
        
        return {
            "status": status,
            "videoUrl": video_url,
            "successFlag": success_flag,
            "raw": result,
        }


class BatchTaskRequest(BaseModel):
    task_ids: List[str]
    storyboard_id: Optional[str] = None


@app.post("/api/kie/batch-task-status")
async def batch_task_status(req: BatchTaskRequest):
    """Check status of multiple tasks at once. Auto-update storyboard if provided."""
    api_key = get_kie_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="KIE_API_KEY not configured")

    results = {}
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=30) as client:
        for tid in req.task_ids:
            try:
                resp = await client.get(f"{KIE_BASE_URL}/veo/record-info?taskId={tid}", headers=headers)
                result = resp.json()
                data = result.get("data") or {}
                sf = data.get("successFlag", 0)
                video_url = ""
                if sf == 1:
                    response_obj = data.get("response") or {}
                    urls = response_obj.get("resultUrls") or []
                    video_url = urls[0] if urls else ""
                results[tid] = {
                    "status": "completed" if sf == 1 else "failed" if sf in (2, 3) else "processing",
                    "videoUrl": video_url,
                }
            except Exception:
                results[tid] = {"status": "processing", "videoUrl": ""}

    # Auto-update storyboard scenes with completed video URLs
    if req.storyboard_id:
        sb = db.storyboards.find_one({"id": req.storyboard_id}, {"_id": 0})
        if sb and sb.get("videoTasks"):
            updated = False
            scenes = sb.get("scenes", [])
            for task in sb["videoTasks"]:
                tid = task.get("taskId")
                idx = task.get("sceneIndex", -1)
                if tid in results and results[tid]["status"] == "completed" and results[tid]["videoUrl"]:
                    if 0 <= idx < len(scenes) and not scenes[idx].get("videoUrl"):
                        scenes[idx]["videoUrl"] = results[tid]["videoUrl"]
                        updated = True
            if updated:
                db.storyboards.update_one({"id": req.storyboard_id}, {"$set": {"scenes": scenes}})

    return results



class ImageToVideoRequest(BaseModel):
    prompt: str
    image_base64: str
    model: str = "veo3_fast"
    aspect_ratio: str = "16:9"


async def upload_image_to_kie(image_bytes: bytes, filename: str) -> str:
    """Upload image to kie.ai's File Upload API and return the CDN URL."""
    api_key = get_kie_api_key()
    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=60) as c:
        resp = await c.post(
            "https://kieai.redpandaai.co/api/file-stream-upload",
            headers=headers,
            files={"file": (filename, image_bytes, "image/jpeg")},
            data={"uploadPath": "storyweaver/images", "fileName": filename},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=f"kie.ai upload failed: {resp.text}")
        result = resp.json()
        url = result.get("data", {}).get("downloadUrl", "")
        if not url:
            raise HTTPException(status_code=500, detail=f"kie.ai upload returned no URL: {result}")
        return url


@app.post("/api/kie/image-to-video")
async def image_to_video(req: ImageToVideoRequest):
    api_key = get_kie_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="KIE_API_KEY not configured")

    # Decode base64 image
    img_data = req.image_base64
    if "," in img_data:
        img_data = img_data.split(",")[1]
    image_bytes = base64.b64decode(img_data)
    filename = f"{uuid.uuid4().hex}.jpg"

    # Save locally for reference
    local_path = os.path.join(MEDIA_ROOT, "images", filename)
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    with open(local_path, "wb") as f:
        f.write(image_bytes)
    local_url = f"{MEDIA_PUBLIC_BASE}/images/{filename}"

    # Upload to kie.ai CDN so their service can access the image
    kie_image_url = await upload_image_to_kie(image_bytes, filename)

    payload = {
        "prompt": req.prompt,
        "model": req.model,
        "aspect_ratio": req.aspect_ratio,
        "imageUrls": [kie_image_url],
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=30) as c:
        resp = await c.post(f"{KIE_BASE_URL}/veo/generate", json=payload, headers=headers)
        result = resp.json()
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=result.get("message", str(result)))
        return {"taskId": (result.get("data") or {}).get("taskId", result.get("taskId")), "imageUrl": local_url}



class UploadImageRequest(BaseModel):
    image_base64: str


@app.post("/api/kie/upload-image")
async def kie_upload_image(req: UploadImageRequest):
    api_key = get_kie_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="KIE_API_KEY not configured")

    img_data = req.image_base64
    if "," in img_data:
        img_data = img_data.split(",")[1]
    image_bytes = base64.b64decode(img_data)
    filename = f"{uuid.uuid4().hex}.jpg"

    kie_url = await upload_image_to_kie(image_bytes, filename)
    return {"url": kie_url}


class MergeVideosRequest(BaseModel):
    video_urls: List[str]


@app.post("/api/merge-videos")
async def merge_videos(req: MergeVideosRequest):
    """Download all video clips and merge them into one final video using ffmpeg."""
    import subprocess
    import tempfile

    if not req.video_urls:
        raise HTTPException(status_code=400, detail="No video URLs provided")

    tmpdir = tempfile.mkdtemp()
    downloaded = []

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            for i, url in enumerate(req.video_urls):
                if not url:
                    continue
                # Download video
                resp = await client.get(url)
                if resp.status_code != 200:
                    continue
                path = os.path.join(tmpdir, f"clip_{i:03d}.mp4")
                with open(path, "wb") as f:
                    f.write(resp.content)
                downloaded.append(path)

        if len(downloaded) < 1:
            raise HTTPException(status_code=400, detail="No videos could be downloaded")

        # Create ffmpeg concat file
        concat_path = os.path.join(tmpdir, "list.txt")
        with open(concat_path, "w") as f:
            for p in downloaded:
                f.write(f"file '{p}'\n")

        # Merge with ffmpeg
        output_name = f"{uuid.uuid4().hex}_final.mp4"
        output_path = os.path.join(MEDIA_ROOT, "videos", output_name)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        result = subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_path,
             "-c", "copy", "-movflags", "+faststart", output_path],
            capture_output=True, text=True, timeout=300
        )

        if result.returncode != 0:
            # Try with re-encoding if concat copy fails
            result = subprocess.run(
                ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_path,
                 "-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart", output_path],
                capture_output=True, text=True, timeout=300
            )

        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"ffmpeg error: {result.stderr[:500]}")

        return {"url": f"{MEDIA_PUBLIC_BASE}/videos/{output_name}", "clips_count": len(downloaded)}

    finally:
        # Cleanup temp files
        import shutil
        shutil.rmtree(tmpdir, ignore_errors=True)



# ============ SETTINGS ============

class SettingsSaveRequest(BaseModel):
    kie_api_key: Optional[str] = None
    fal_api_key: Optional[str] = None
    provider: str = "fal"  # single provider
    text_model: str = "google/gemini-2.5-flash"
    image_model: str = "fal-ai/flux/dev"
    video_model: str = "fal-ai/kling-video/v2.6/text-to-video/standard"


@app.get("/api/settings")
async def get_settings():
    global RUNTIME_FAL_KEY
    settings = await fetch_settings_from_db(timeout_sec=0.9)
    if settings:
        apply_settings_to_cache(settings)

    fal_key_error = ""
    effective_fal_key = ""
    try:
        effective_fal_key = validate_fal_api_key(get_fal_api_key())
    except HTTPException as e:
        fal_key_error = str(e.detail)
        effective_fal_key = ""

    return {
        "provider": "fal",
        "text_model": SETTINGS_CACHE.get("text_model", DEFAULT_TEXT_MODEL),
        "image_model": SETTINGS_CACHE.get("image_model", DEFAULT_IMAGE_MODEL),
        "video_model": SETTINGS_CACHE.get("video_model", DEFAULT_VIDEO_MODEL),
        "has_kie_key": bool(SETTINGS_CACHE.get("kie_api_key") or KIE_API_KEY_ENV),
        "has_fal_key": bool(effective_fal_key),
        "fal_key_error": fal_key_error,
        "source": "db" if settings else "cache",
    }


@app.post("/api/settings")
async def save_settings(req: SettingsSaveRequest):
    global RUNTIME_FAL_KEY
    update = {
        "key": "app_settings",
        "provider": "fal",
        "text_model": req.text_model,
        "image_model": req.image_model,
        "video_model": req.video_model,
    }
    if req.kie_api_key is not None:
        update["kie_api_key"] = req.kie_api_key
    if req.fal_api_key is not None:
        normalized_key = validate_fal_api_key(req.fal_api_key)
        update["fal_api_key"] = normalized_key
        # Keep a live in-memory fallback key in case MongoDB is unreachable.
        RUNTIME_FAL_KEY = normalized_key
    apply_settings_to_cache(update)
    if not MONGO_AVAILABLE:
        return {"ok": False, "warning": "Database unavailable. Settings persisted in runtime/localStorage only."}
    try:
        await asyncio.wait_for(
            asyncio.to_thread(lambda: db.settings.update_one({"key": "app_settings"}, {"$set": update}, upsert=True)),
            timeout=1.2,
        )
        return {"ok": True}
    except Exception:
        # Keep frontend flow working even if DB is temporarily unavailable.
        return {"ok": False, "warning": "Database unavailable. Settings persisted in cache/localStorage only."}


# ============ KIE.AI TEXT GENERATION ============

class KieTextRequest(BaseModel):
    prompt: str
    system_prompt: str = ""
    model: str = "gemini-2.5-flash"
    response_format: Optional[str] = None  # "json" or None


@app.post("/api/kie/generate-text")
async def kie_generate_text(req: KieTextRequest):
    api_key = get_kie_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="KIE_API_KEY not configured")

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    messages = []
    if req.system_prompt:
        messages.append({"role": "system", "content": req.system_prompt})
    messages.append({"role": "user", "content": req.prompt})

    payload = {"messages": messages, "stream": False}

    # Use OpenAI-compatible chat completions endpoint
    chat_url = f"https://api.kie.ai/{req.model}/v1/chat/completions"

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(chat_url, json=payload, headers=headers)
        if resp.status_code != 200:
            result = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            raise HTTPException(status_code=resp.status_code, detail=result.get("error", {}).get("message", f"خطأ {resp.status_code}"))

        result = resp.json()
        choices = result.get("choices", [])
        if choices:
            content = choices[0].get("message", {}).get("content", "")
            return {"text": content}
        raise HTTPException(status_code=500, detail="لم يتم إرجاع نص")


# ============ KIE.AI IMAGE GENERATION ============

class KieImageRequest(BaseModel):
    prompt: str
    model: str = "gpt-image-1"
    size: str = "1:1"
    image_urls: List[str] = []


@app.post("/api/kie/generate-image")
async def kie_generate_image(req: KieImageRequest):
    api_key = get_kie_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="KIE_API_KEY not configured")

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    # Route to correct endpoint based on model
    if req.model in ("gpt-image-1", "4o-image"):
        endpoint = f"{KIE_BASE_URL}/gpt4o-image/generate"
        payload = {"prompt": req.prompt, "size": req.size}
        if req.image_urls:
            payload["filesUrl"] = req.image_urls
        status_endpoint = f"{KIE_BASE_URL}/gpt4o-image/record-info"
    elif "nano-banana" in req.model:
        endpoint = f"{KIE_BASE_URL}/jobs/createTask"
        payload = {
            "model": req.model,
            "input": {
                "prompt": req.prompt,
                "aspect_ratio": req.size if ":" in req.size else "1:1",
                "resolution": "2K",
                "output_format": "jpg",
                "google_search": False,
            },
        }
        if req.image_urls:
            payload["input"]["image_urls"] = req.image_urls
        status_endpoint = f"{KIE_BASE_URL}/jobs/recordInfo"
    elif "flux-kontext" in req.model:
        endpoint = f"{KIE_BASE_URL}/jobs/createTask"
        payload = {
            "model": req.model,
            "input": {
                "prompt": req.prompt,
                "aspect_ratio": req.size if ":" in req.size else "1:1",
            },
        }
        if req.image_urls:
            payload["input"]["image_urls"] = req.image_urls
        status_endpoint = f"{KIE_BASE_URL}/jobs/recordInfo"
    else:
        # Generic jobs endpoint
        endpoint = f"{KIE_BASE_URL}/jobs/createTask"
        payload = {"model": req.model, "input": {"prompt": req.prompt}}
        status_endpoint = f"{KIE_BASE_URL}/jobs/recordInfo"

    async with httpx.AsyncClient(timeout=180) as client:
        resp = await client.post(endpoint, json=payload, headers=headers)
        result = resp.json()
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=result.get("msg", str(result)))

        task_id = result.get("data", {}).get("taskId", "")
        if not task_id:
            raise HTTPException(status_code=500, detail=f"No taskId: {result}")

        # Poll for completion
        for _ in range(90):
            await asyncio.sleep(3)
            sr = await client.get(f"{status_endpoint}?taskId={task_id}", headers=headers)
            sd = sr.json()
            data = sd.get("data", {})
            success = data.get("successFlag", 0)

            if success == 1:
                response_obj = data.get("response", {})
                # Image URLs vary by model
                urls = response_obj.get("resultUrls", [])
                if not urls:
                    urls = response_obj.get("imageUrls", [])
                if not urls:
                    urls = response_obj.get("images", [])
                if not urls and isinstance(response_obj, list):
                    urls = response_obj
                image_url = urls[0] if urls else ""
                return {"imageUrl": image_url, "taskId": task_id, "allUrls": urls}
            elif success in (2, 3):
                error_msg = data.get("response", {}).get("error", "Image generation failed")
                raise HTTPException(status_code=500, detail=str(error_msg))

        raise HTTPException(status_code=504, detail="Image generation timed out")


@app.get("/api/kie/image-status/{task_id}")
async def kie_image_status(task_id: str):
    api_key = get_kie_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="KIE_API_KEY not configured")

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=30) as client:
        # Try gpt4o endpoint first
        resp = await client.get(f"{KIE_BASE_URL}/gpt4o-image/record-info?taskId={task_id}", headers=headers)
        result = resp.json()
        data = result.get("data", {})
        success = data.get("successFlag", 0)

        if success == 0:
            # Try jobs endpoint
            resp = await client.get(f"{KIE_BASE_URL}/jobs/recordInfo?taskId={task_id}", headers=headers)
            result = resp.json()
            data = result.get("data", {})
            success = data.get("successFlag", 0)

        status = "processing"
        image_url = ""
        if success == 1:
            status = "completed"
            response_obj = data.get("response", {})
            urls = response_obj.get("resultUrls", []) or response_obj.get("imageUrls", []) or response_obj.get("images", [])
            image_url = urls[0] if urls else ""
        elif success in (2, 3):
            status = "failed"

        return {"status": status, "imageUrl": image_url, "raw": result}


# ============ KIE.AI TEST CONNECTION ============

@app.post("/api/kie/test-connection")
async def kie_test_connection():
    """Quick test to verify kie.ai API key is valid."""
    api_key = get_kie_api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="مفتاح kie.ai غير مضاف")

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    # Check user credits to verify key
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get("https://api.kie.ai/api/v1/chat/credit", headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                credits = data.get("data", "غير معروف")
                return {"ok": True, "message": f"المفتاح يعمل. الرصيد: {credits} credits"}
            elif resp.status_code in (401, 403):
                raise HTTPException(status_code=401, detail="مفتاح kie.ai غير صالح")
            else:
                result = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                raise HTTPException(status_code=resp.status_code, detail=result.get("msg", f"خطأ {resp.status_code}"))
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="انتهت مهلة الاتصال بـ kie.ai")


# ============ KIE.AI KLING MOTION CONTROL ============

class KlingMotionRequest(BaseModel):
    prompt: str
    image_url: str
    video_url: str
    mode: str = "720p"  # "720p" (standard) or "1080p" (pro)
    character_orientation: str = "video"
    aspect_ratio: str = "9:16"
    negative_prompt: str = ""


@app.post("/api/kie/kling-motion")
async def kie_kling_motion(req: KlingMotionRequest):
    """Create Kling 2.6 motion control task via kie.ai."""
    api_key = get_kie_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="مفتاح kie.ai غير مضاف")

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    # Upload local images/videos to kie.ai CDN if needed
    image_url = req.image_url
    video_url = req.video_url

    if "preview.emergentagent.com" in image_url or "localhost" in image_url:
        async with httpx.AsyncClient(timeout=30) as dl:
            img_resp = await dl.get(image_url)
            if img_resp.status_code == 200:
                fname = f"{uuid.uuid4().hex}.png"
                image_url = await upload_image_to_kie(img_resp.content, fname)

    payload = {
        "model": "kling-2.6/motion-control",
        "input": {
            "prompt": req.prompt,
            "input_urls": [image_url],
            "video_urls": [video_url],
            "mode": req.mode,
            "character_orientation": req.character_orientation,
        },
    }

    if req.negative_prompt:
        payload["input"]["negative_prompt"] = req.negative_prompt

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{KIE_BASE_URL}/jobs/createTask", json=payload, headers=headers)
        result = resp.json()
        if resp.status_code != 200 or result.get("code") != 200:
            msg = result.get("msg", str(result))
            raise HTTPException(status_code=resp.status_code, detail=msg)
        task_id = result.get("data", {}).get("taskId", "")
        return {"taskId": task_id}


@app.get("/api/kie/kling-status/{task_id}")
async def kie_kling_status(task_id: str):
    """Check Kling motion control task status."""
    api_key = get_kie_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="مفتاح kie.ai غير مضاف")

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{KIE_BASE_URL}/jobs/recordInfo?taskId={task_id}", headers=headers)
        result = resp.json()
        data = result.get("data") or {}
        success = data.get("successFlag", 0)

        status = "processing"
        video_url = ""
        if success == 1:
            status = "completed"
            response_obj = data.get("response", {})
            urls = response_obj.get("resultUrls", []) or response_obj.get("videoUrls", []) or response_obj.get("works", [])
            if urls:
                first = urls[0]
                video_url = first.get("url", first) if isinstance(first, dict) else first
        elif success in (2, 3):
            status = "failed"
            error_msg = data.get("response", {}).get("error", "فشل التوليد")
            return {"status": status, "videoUrl": "", "error": str(error_msg)}

        return {"status": status, "videoUrl": video_url}


@app.post("/api/kie/upload-file")
async def kie_upload_file(file: UploadFile = File(...)):
    """Upload a file (image/video) to kie.ai CDN and return the URL."""
    api_key = get_kie_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="مفتاح kie.ai غير مضاف")

    content = await file.read()
    filename = file.filename or f"{uuid.uuid4().hex}"

    # Determine upload path based on content type
    content_type = file.content_type or "application/octet-stream"
    upload_path = "storyweaver/videos" if "video" in content_type else "storyweaver/images"

    headers = {"Authorization": f"Bearer {api_key}"}

    async with httpx.AsyncClient(timeout=120) as client:
        files_data = {"file": (filename, content, content_type)}
        resp = await client.post(
            "https://kieai.redpandaai.co/api/file-stream-upload",
            headers=headers,
            files=files_data,
            data={"uploadPath": upload_path, "fileName": filename},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=f"kie.ai upload failed: {resp.text}")
        result = resp.json()
        url = result.get("data", {}).get("downloadUrl", "")
        if not url:
            raise HTTPException(status_code=500, detail=f"لم يتم إرجاع رابط الملف: {result}")
        return {"url": url}


# ============ FAL.AI ============

def _fal_headers() -> dict:
    api_key = validate_fal_api_key(get_fal_api_key())
    if not api_key:
        raise HTTPException(status_code=500, detail="FAL_KEY not configured")
    return {"Authorization": f"Key {api_key}", "Content-Type": "application/json"}


# OpenRouter model list for text (fal openrouter); fal /v1/models may not list these
FAL_OPENROUTER_TEXT_MODELS = [
    {"id": "google/gemini-2.5-flash", "label": "Gemini 2.5 Flash"},
    {"id": "google/gemini-2.5-flash-lite", "label": "Gemini 2.5 Flash Lite"},
    {"id": "google/gemini-2.5-pro", "label": "Gemini 2.5 Pro"},
    {"id": "anthropic/claude-3.5-sonnet", "label": "Claude 3.5 Sonnet"},
    {"id": "anthropic/claude-3-haiku", "label": "Claude 3 Haiku"},
    {"id": "openai/gpt-4o-mini", "label": "GPT-4o Mini"},
    {"id": "openai/gpt-4o", "label": "GPT-4o"},
]


@app.get("/api/fal/models")
async def fal_models(type: str = "image"):
    """Return list of available fal models for type=text|image|video (synced with fal.ai)."""
    if type == "text":
        return {"models": FAL_OPENROUTER_TEXT_MODELS, "source": "static-text"}
    
    try:
        api_key = validate_fal_api_key(get_fal_api_key())
    except HTTPException as e:
        # Keep settings UI usable even when an invalid key is present in env/runtime/DB.
        return {"models": [], "error": str(e.detail), "source": "validation-error"}
    if not api_key:
        return {"models": [], "source": "missing-key"}

    headers = {"Authorization": f"Key {api_key}"}

    # image or video: use fal Platform API
    categories = []
    if type == "image":
        categories = ["text-to-image", "image-to-image"]
    elif type == "video":
        categories = ["text-to-video", "image-to-video", "video-to-video"]

    all_models = []
    async with httpx.AsyncClient(timeout=30) as client:
        for cat in categories:
            try:
                resp = await client.get(
                    f"{FAL_API_BASE}/v1/models",
                    params={"category": cat, "status": "active", "limit": 100},
                    headers=headers,
                )
            except httpx.HTTPError:
                continue
            if resp.status_code != 200:
                continue
            data = resp.json()
            for m in data.get("models", []):
                meta = m.get("metadata") or {}
                label = meta.get("display_name") or m.get("endpoint_id", "")
                all_models.append({"id": m.get("endpoint_id", ""), "label": label})
    # Dedupe by id
    seen = set()
    out = []
    for x in all_models:
        if x["id"] and x["id"] not in seen:
            seen.add(x["id"])
            out.append(x)
    return {"models": out, "source": "fal-platform-api"}


@app.get("/api/fal/debug-key")
async def fal_debug_key():
    """Return safe diagnostics about fal key validity without exposing the key."""
    raw = get_fal_api_key()
    normalized = (raw or "").strip()
    has_key = bool(normalized)
    has_whitespace = any(ch.isspace() for ch in normalized)
    is_ascii = True
    try:
        normalized.encode("ascii")
    except UnicodeEncodeError:
        is_ascii = False
    is_valid = has_key and is_ascii and not has_whitespace
    source = "runtime" if RUNTIME_FAL_KEY else "cache/env"
    return {
        "has_key": has_key,
        "is_ascii": is_ascii,
        "has_whitespace": has_whitespace,
        "is_valid": is_valid,
        "source": source,
        "length": len(normalized),
        "preview": (f"{normalized[:4]}...{normalized[-4:]}" if len(normalized) >= 10 else ""),
    }


class FalTextRequest(BaseModel):
    prompt: str
    system_prompt: str = ""
    model: str = "google/gemini-2.5-flash"


@app.post("/api/fal/generate-text")
async def fal_generate_text(req: FalTextRequest):
    """Generate text via fal openrouter."""
    headers = _fal_headers()
    model = req.model if "/" in (req.model or "") else "google/gemini-2.5-flash"
    payload = {
        "model": model,
        "prompt": req.prompt,
        "system_prompt": req.system_prompt or "",
    }
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{FAL_RUN_BASE}/openrouter/router",
            json=payload,
            headers=headers,
        )
    if resp.status_code != 200:
        err = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
        raise HTTPException(status_code=resp.status_code, detail=err.get("detail", resp.text))
    data = resp.json()
    text = data.get("output") or data.get("text") or ""
    return {"text": text}


class FalTextWithImageRequest(BaseModel):
    prompt: str
    image_base64: str
    model: str = "google/gemini-2.5-flash"


@app.post("/api/fal/generate-text-with-image")
async def fal_generate_text_with_image(req: FalTextWithImageRequest):
    """Generate text from image + prompt (vision) via fal openrouter. Uses OpenRouter messages format with image."""
    headers = _fal_headers()
    model = req.model if "/" in (req.model or "") else "google/gemini-2.5-flash"
    raw = req.image_base64
    if "," in raw:
        raw = raw.split(",", 1)[1]
    data_url = f"data:image/jpeg;base64,{raw}"
    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": req.prompt},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
    }
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{FAL_RUN_BASE}/openrouter/router",
            json=payload,
            headers=headers,
        )
    if resp.status_code != 200:
        err = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
        raise HTTPException(status_code=resp.status_code, detail=err.get("detail", resp.text))
    data = resp.json()
    text = data.get("output") or data.get("text") or (data.get("choices", [{}])[0].get("message", {}).get("content") if data.get("choices") else "") or ""
    return {"text": text}


class FalImageRequest(BaseModel):
    prompt: str
    model: str = "fal-ai/flux/dev"
    size: str = "1:1"
    image_urls: List[str] = []
    negative_prompt: str = ""
    seed: Optional[int] = None


@app.post("/api/fal/generate-image")
async def fal_generate_image(req: FalImageRequest):
    """Generate image via fal (sync run)."""
    headers = _fal_headers()
    model = req.model if (req.model or "").startswith("fal-ai/") else "fal-ai/flux/dev"
    # Base payload: prompt is always required for text-to-image models
    payload: dict = {"prompt": req.prompt}

    # Optional reference images: many fal models accept either `image_url` or `image_urls`.
    # We pass the first URL as `image_url` and the full list as `image_urls` for models that support conditioning.
    if req.image_urls:
        # Single primary reference image
        payload["image_url"] = req.image_urls[0]
        # Full list for models that accept multiple images
        payload["image_urls"] = req.image_urls

    # Map logical aspect ratio into fal image_size where supported.
    # FLUX.1 dev and similar models expect values like: landscape_4_3, landscape_16_9, portrait_3_4, portrait_9_16, square
    size_map = {
        "1:1": "square",
        "square": "square",
        "16:9": "landscape_16_9",
        "9:16": "portrait_9_16",
        "4:3": "landscape_4_3",
        "3:4": "portrait_3_4",
    }
    requested = (req.size or "").strip()
    image_size = size_map.get(requested, None)
    if image_size:
        payload["image_size"] = image_size
    if req.negative_prompt:
        payload["negative_prompt"] = req.negative_prompt
    if req.seed is not None:
        payload["seed"] = req.seed

    # fal may temporarily return 429/5xx under load. Retry with exponential backoff.
    resp = None
    max_attempts = 5
    async with httpx.AsyncClient(timeout=220) as client:
        for attempt in range(1, max_attempts + 1):
            resp = await client.post(
                f"{FAL_RUN_BASE}/{model}",
                json=payload,
                headers=headers,
            )
            if resp.status_code == 200:
                break
            if resp.status_code not in (429, 500, 502, 503, 504) or attempt == max_attempts:
                break
            await asyncio.sleep(min(1.2 * (2 ** (attempt - 1)), 10))
    if resp is None:
        raise HTTPException(status_code=500, detail="No response from fal")
    if resp.status_code != 200:
        err = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
        raise HTTPException(status_code=resp.status_code, detail=err.get("detail", resp.text))
    data = resp.json()
    image_url = data.get("image", {}).get("url") if isinstance(data.get("image"), dict) else data.get("image_url") or (data.get("images", [{}])[0].get("url") if data.get("images") else None)
    if not image_url and isinstance(data.get("images"), list) and data["images"]:
        image_url = data["images"][0].get("url") if isinstance(data["images"][0], dict) else str(data["images"][0])
    if not image_url:
        raise HTTPException(status_code=500, detail="No image URL in fal response")
    return {"imageUrl": image_url}


class FalUploadImageRequest(BaseModel):
    image_base64: str


@app.post("/api/fal/upload-image")
async def fal_upload_image(req: FalUploadImageRequest):
    """Upload base64 image to fal storage and return URL."""
    api_key = get_fal_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="مفتاح fal.ai غير مضاف")
    raw = req.image_base64
    if "," in raw:
        raw = raw.split(",", 1)[1]
    try:
        img_bytes = base64.b64decode(raw)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64: {e}")
    fname = f"{uuid.uuid4().hex}.jpg"
    url = await upload_bytes_to_fal_storage(img_bytes, fname, "image/jpeg", api_key)
    return {"url": url}


class FalGenerateVideoRequest(BaseModel):
    prompt: str
    image_url: Optional[str] = None
    model: str = "fal-ai/kling-video/v2.6/text-to-video/standard"
    aspect_ratio: str = "16:9"
    generation_mode: str = "TEXT_2_VIDEO"


@app.post("/api/fal/generate-video")
async def fal_generate_video(req: FalGenerateVideoRequest):
    """Start video generation (queue) and return taskId."""
    headers = _fal_headers()
    model = req.model if (req.model or "").startswith("fal-ai/") else "fal-ai/kling-video/v2.6/text-to-video/standard"
    payload = {"prompt": req.prompt, "aspect_ratio": req.aspect_ratio if req.aspect_ratio in ("16:9", "9:16") else "16:9"}
    if req.image_url:
        payload["image_url"] = req.image_url
        if "image_urls" not in payload:
            payload["image_urls"] = [req.image_url]
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"https://queue.fal.run/{model}",
            json=payload,
            headers=headers,
        )
    if resp.status_code not in (200, 201):
        err = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
        raise HTTPException(status_code=resp.status_code, detail=err.get("detail", resp.text))
    data = resp.json()
    request_id = data.get("request_id") or data.get("taskId") or data.get("id")
    if not request_id:
        # Sync response might have video URL directly
        vurl = data.get("video", {}).get("url") if isinstance(data.get("video"), dict) else data.get("video_url")
        if vurl:
            return {"taskId": "sync", "videoUrl": vurl}
        raise HTTPException(status_code=500, detail="No request_id from fal")
    return {"taskId": request_id, "data": data.get("data")}


class FalImageToVideoRequest(BaseModel):
    prompt: str
    image_base64: str
    model: str = "fal-ai/kling-video/v2.6/image-to-video/standard"
    aspect_ratio: str = "16:9"


@app.post("/api/fal/image-to-video")
async def fal_image_to_video(req: FalImageToVideoRequest):
    """Image-to-video: upload image then start video job."""
    api_key = get_fal_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="مفتاح fal.ai غير مضاف")
    raw = req.image_base64
    if "," in raw:
        raw = raw.split(",", 1)[1]
    try:
        img_bytes = base64.b64decode(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64")
    fname = f"{uuid.uuid4().hex}.jpg"
    local_image_url = _save_bytes_file(img_bytes, ext="jpg", subdir="images")
    image_url = await upload_bytes_to_fal_storage(img_bytes, fname, "image/jpeg", api_key)

    run_headers = _fal_headers()
    model = req.model if (req.model or "").startswith("fal-ai/") else "fal-ai/kling-video/v2.6/image-to-video/standard"
    payload = {"prompt": req.prompt, "image_url": image_url, "aspect_ratio": req.aspect_ratio if req.aspect_ratio in ("16:9", "9:16") else "16:9"}
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"https://queue.fal.run/{model}",
            json=payload,
            headers=run_headers,
        )
    if resp.status_code not in (200, 201):
        err = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
        raise HTTPException(status_code=resp.status_code, detail=err.get("detail", resp.text))
    data = resp.json()
    request_id = data.get("request_id") or data.get("taskId") or data.get("id")
    if not request_id:
        vurl = data.get("video", {}).get("url") if isinstance(data.get("video"), dict) else data.get("video_url")
        if vurl:
            return {"taskId": "sync", "videoUrl": vurl, "imageUrl": local_image_url}
        raise HTTPException(status_code=500, detail="No request_id from fal")
    return {"taskId": request_id, "imageUrl": local_image_url}


@app.get("/api/fal/task-status/{task_id}")
async def fal_task_status(task_id: str):
    """Poll fal queue status; task_id is request_id. For sync taskId 'sync' return completed."""
    if task_id == "sync":
        return {"status": "completed", "videoUrl": ""}
    api_key = get_fal_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="مفتاح fal.ai غير مضاف")
    # Fal queue status: GET https://queue.fal.run/{endpoint}/requests/{request_id}
    # We don't have endpoint_id here; fal uses same request_id for status. Try common path.
    headers = {"Authorization": f"Key {api_key}"}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"https://queue.fal.run/requests/{task_id}",
            headers=headers,
        )
    if resp.status_code != 200:
        return {"status": "processing", "videoUrl": ""}
    data = resp.json()
    status = data.get("status", "processing")
    if status == "COMPLETED":
        logs = data.get("logs", [])
        video_url = ""
        for log in reversed(logs):
            if isinstance(log, dict) and log.get("message", "").startswith("http"):
                video_url = log.get("message", "").strip()
                break
        response = data.get("response") or data.get("result") or data.get("output") or {}
        if isinstance(response, dict):
            vid = response.get("video")
            if isinstance(vid, dict) and vid.get("url"):
                video_url = vid.get("url") or video_url
            elif response.get("video_url"):
                video_url = response.get("video_url") or video_url
            if not video_url and response.get("output"):
                out = response.get("output")
                if isinstance(out, dict):
                    video_url = out.get("video", {}).get("url") if isinstance(out.get("video"), dict) else out.get("video_url", video_url)
                elif isinstance(out, str) and out.startswith("http"):
                    video_url = out
        elif isinstance(response, list) and response:
            video_url = response[0].get("url", video_url) if isinstance(response[0], dict) else video_url
        return {"status": "completed", "videoUrl": video_url}
    if status == "FAILED":
        return {"status": "failed", "videoUrl": "", "error": data.get("error", "فشل التوليد")}
    return {"status": "processing", "videoUrl": ""}


class FalBatchTaskRequest(BaseModel):
    task_ids: List[str]
    storyboard_id: Optional[str] = None


@app.post("/api/fal/batch-task-status")
async def fal_batch_task_status(req: FalBatchTaskRequest):
    """Batch poll fal task status."""
    results = {}
    for tid in req.task_ids:
        if tid == "sync":
            results[tid] = {"status": "completed", "videoUrl": ""}
            continue
        try:
            api_key = get_fal_api_key()
            if not api_key:
                results[tid] = {"status": "processing", "videoUrl": ""}
                continue
            headers = {"Authorization": f"Key {api_key}"}
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(f"https://queue.fal.run/requests/{tid}", headers=headers)
            if r.status_code != 200:
                results[tid] = {"status": "processing", "videoUrl": ""}
                continue
            d = r.json()
            st = d.get("status", "processing")
            if st == "COMPLETED":
                resp = d.get("response") or d.get("result") or d.get("output") or {}
                vurl = ""
                if isinstance(resp, dict):
                    vid = resp.get("video")
                    vurl = vid.get("url", "") if isinstance(vid, dict) else resp.get("video_url", "")
                    if not vurl and resp.get("output"):
                        out = resp.get("output")
                        vurl = (out.get("video") or {}).get("url") if isinstance(out, dict) else (out if isinstance(out, str) and out.startswith("http") else "")
                results[tid] = {"status": "completed", "videoUrl": vurl or ""}
            elif st == "FAILED":
                results[tid] = {"status": "failed", "videoUrl": ""}
            else:
                results[tid] = {"status": "processing", "videoUrl": ""}
        except Exception:
            results[tid] = {"status": "processing", "videoUrl": ""}

    if req.storyboard_id:
        sb = db.storyboards.find_one({"id": req.storyboard_id}, {"_id": 0})
        if sb and sb.get("videoTasks"):
            updated = False
            scenes = list(sb.get("scenes", []))
            for task in sb["videoTasks"]:
                tid = task.get("taskId")
                idx = task.get("sceneIndex", -1)
                if tid in results and results[tid]["status"] == "completed" and results[tid].get("videoUrl") and 0 <= idx < len(scenes) and not scenes[idx].get("videoUrl"):
                    scenes[idx]["videoUrl"] = results[tid]["videoUrl"]
                    updated = True
            if updated:
                db.storyboards.update_one({"id": req.storyboard_id}, {"$set": {"scenes": scenes}})
    return results


class FalKlingMotionRequest(BaseModel):
    prompt: str
    image_url: str
    video_url: str
    mode: str = "720p"
    character_orientation: str = "video"
    aspect_ratio: str = "9:16"
    negative_prompt: str = ""


@app.post("/api/fal/kling-motion")
async def fal_kling_motion(req: FalKlingMotionRequest):
    """Kling motion control via fal. Correct path: v2.6/standard/motion-control (not motion-control/standard)."""
    headers = _fal_headers()
    endpoint = "fal-ai/kling-video/v2.6/standard/motion-control"
    if req.mode == "1080p":
        endpoint = "fal-ai/kling-video/v2.6/pro/motion-control"
    payload = {
        "prompt": req.prompt,
        "image_url": req.image_url,
        "video_url": req.video_url,
        "character_orientation": req.character_orientation,
        "aspect_ratio": req.aspect_ratio if req.aspect_ratio in ("16:9", "9:16") else "9:16",
    }
    if req.negative_prompt:
        payload["negative_prompt"] = req.negative_prompt
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"https://queue.fal.run/{endpoint}",
            json=payload,
            headers=headers,
        )
    if resp.status_code not in (200, 201):
        err = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
        raise HTTPException(status_code=resp.status_code, detail=err.get("detail", resp.text))
    data = resp.json()
    request_id = data.get("request_id") or data.get("taskId") or data.get("id")
    if not request_id:
        vurl = data.get("video", {}).get("url") if isinstance(data.get("video"), dict) else data.get("video_url")
        if vurl:
            return {"taskId": "sync", "videoUrl": vurl}
        raise HTTPException(status_code=500, detail="No request_id from fal")
    return {"taskId": request_id}


@app.get("/api/fal/kling-status/{task_id}")
async def fal_kling_status(task_id: str):
    """Kling motion task status (same as fal task-status)."""
    if task_id == "sync":
        return {"status": "completed", "videoUrl": ""}
    return await fal_task_status(task_id)


@app.post("/api/fal/upload-file")
async def fal_upload_file(file: UploadFile = File(...)):
    """Upload file to fal storage and return URL."""
    api_key = get_fal_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="مفتاح fal.ai غير مضاف")
    content = await file.read()
    fname = file.filename or str(uuid.uuid4())
    ct = file.content_type or "application/octet-stream"
    url = await upload_bytes_to_fal_storage(content, fname, ct, api_key)
    return {"url": url}


@app.post("/api/fal/test-connection")
async def fal_test_connection():
    """Test fal.ai API key."""
    headers = _fal_headers()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{FAL_RUN_BASE}/openrouter/router",
            json={"model": "google/gemini-2.5-flash-lite", "prompt": "Hi"},
            headers=headers,
        )
    if resp.status_code == 200:
        return {"ok": True, "message": "المفتاح يعمل بشكل صحيح."}
    if resp.status_code in (401, 403):
        raise HTTPException(status_code=401, detail="مفتاح fal.ai غير صالح")
    err = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
    raise HTTPException(status_code=resp.status_code, detail=err.get("detail", "انتهت مهلة الاتصال بـ fal.ai"))
