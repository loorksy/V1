# تشغيل المشروع محلياً + جاهزية VPS

## المتطلبات

- **Node.js** (مثلاً 18+)
- **Python** (3.8+)
- **MongoDB** يعمل على الجهاز (مثلاً `mongodb://localhost:27017`) أو سحابي (اختياري لكن موصى به)
- **ffmpeg** مطلوب لميزة دمج الفيديوهات

## 1. تشغيل الباكند (Backend)

الباكند يعمل على المنفذ **8001** ويحتاج MongoDB.

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
# source venv/bin/activate

pip install -r requirements.txt
```

عند اعتماد **fal.ai كمزود واحد** تحتاج فقط مفتاح fal. إنشاء ملف `.env` داخل مجلد `backend` (أو في جذر المشروع):

```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=storyweaver
FAL_KEY=مفتاح_fal_ai_من_https://fal.ai/dashboard/keys
```

لا تحتاج `KIE_API_KEY` ولا مفتاح Gemini، التطبيق يعمل بمزود fal.ai فقط.

تشغيل السيرفر:

```bash
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

يجب أن ترى السيرفر يعمل على: `http://localhost:8001`

## 2. تشغيل الواجهة (Frontend)

من **جذر المشروع** (وليس من داخل `backend`):

```bash
npm install
npm run dev
```

الواجهة ستكون على: **http://localhost:3000**

طلبات `/api/*` تُحوّل تلقائياً من Vite إلى `http://localhost:8001`.

## 3. الإعدادات من الواجهة (مزود واحد: fal.ai)

1. افتح **http://localhost:3000**
2. اذهب إلى **الإعدادات**
3. اختر **fal.ai (مزود واحد)** وأضف **مفتاح fal.ai فقط** (من [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys)).
4. اختر النماذج للنص والصور والفيديو من القوائم (تُحدّث من fal تلقائياً) ثم احفظ.

بهذا يعمل كل شيء (نص، صور، فيديو) بمفتاح واحد دون الحاجة لمفتاح kie.ai أو Gemini.

## ملاحظات

- إذا لم يكن MongoDB يعمل محلياً، غيّر `MONGO_URL` في `.env` إلى عنوان قاعدة بياناتك (مثلاً MongoDB Atlas).
- مفتاح fal.ai يمكن إضافته من الإعدادات في الواجهة ويُحفظ في قاعدة البيانات، أو وضعه في `.env` كـ `FAL_KEY` في الباكند.
- خيارات **Google Gemini** و **kie.ai** تبقى متاحة فقط إذا أردت استخدامها لاحقاً؛ لا تحتاج مفاتيحها عند اعتماد fal كمزود واحد.

---

## تشغيل إنتاجي على VPS (systemd-native)

### 1) إعداد المتغيرات

داخل `backend/.env`:

```env
FAL_KEY=your_fal_key
MONGO_URL=your_mongo_url
DB_NAME=storyweaver
MEDIA_ROOT=/var/lib/videosai/media
```

> `MEDIA_ROOT` مهم جدًا حتى تبقى الصور/الفيديوهات محفوظة بعد إعادة التشغيل أو النشر.

### 2) أوامر تشغيل إنتاجية (بدون reload)

**Backend:**

```bash
cd backend
source venv/bin/activate
uvicorn server:app --host 127.0.0.1 --port 8001
```

**Frontend:**

```bash
cd ..
npm run build
npm run start -- --host 127.0.0.1 --port 3000
```

### 3) ملفات النشر الجاهزة

- `deploy/systemd/videosai-backend.service`
- `deploy/systemd/videosai-frontend.service`
- `deploy/nginx/videosai.conf`
- `deploy/VPS_DEPLOY.md` (دليل كامل خطوة بخطوة)
