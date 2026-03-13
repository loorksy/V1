# مراجعة الأدوات – نوع التوليد واحترام الخيارات

## ملخص مسارات التوليد

| الأداة | نص → صورة | صورة → صورة | صورة → فيديو | نص → فيديو | صورة+فيديو → فيديو |
|--------|-----------|-------------|---------------|------------|----------------------|
| **Character Create** | ✅ | — | — | — | — |
| **Thumbnail** | ✅ | ✅ (تحسين) | — | — | — |
| **Short Video Studio** | — | — | ✅ | ✅ | — |
| **Product Video Studio** | — | — | ✅ | ✅ | — |
| **Motion Control (Kling)** | — | — | — | — | ✅ |
| **Story Studio** | ✅ | — | ✅ | — | — |
| **Ad Campaign Studio** | ✅ | — | — | — | — |
| **Viral Ideas Generator** | — | — | — | — | — |

---

## 1. Character Create (`/characters/new`)

- **ما يحدث:**
  - **نص → صورة:** وصف نصي + خيارات (أسلوب، تعبير، ملابس، ألوان، خلفية) → 4 زوايا (front, left, right, 3/4).
  - اختياري: **صورة → نص** (تحليل صورة لاستخراج وصف) ثم استخدام الوصف في التوليد.
- **الاستدعاء:** `AIService.generateCharacterAngle(description, angle)` → `falGenerateImage(prompt, '1:1')`.
- **الخيارات:** الموديل من الإعدادات (`getProviderSettings().imageModel`). النسبة ثابتة 1:1 (مناسب لورقة الشخصية).
- **الحالة:** يعمل؛ لا يمرر صور مرجعية (الوصف النصي فقط).

---

## 2. Thumbnail (`/thumbnails/new`)

- **ما يحدث:**
  - **من الصفر (نص → صورة):** عنوان، أسلوب، خلفية، عناصر، نص على الصورة، شخصيات مرجعية (اختياري) → صورة مصغرة.
  - **تحسين (صورة → صورة):** صورة أساس + نفس الخيارات → صورة محسّنة. الصورة الأساس تُرفع وتُمرر كأول `image_url` لـ fal.
  - **من القصة:** تحليل قصة → عنوان/وصف/هاشتاقات ثم توليد كـ «من الصفر» مع سياق القصة.
- **الاستدعاء:** `AIService.generateThumbnail(params)` → `falGenerateImage(prompt, ratio, refUrls)`. في التحسين يُضاف `baseThumbnail` إلى `refUrls` كأول عنصر.
- **الخيارات:** نسبة العرض من الحقل `aspectRatio` (16:9, 9:16, 1:1). موديل الصورة من الإعدادات.
- **تحليل الصورة:** `AIService.analyzeThumbnail(base64)` → `falGenerateTextWithImage` (صورة + نص → نص).
- **الحالة:** يعمل؛ التحسين يحترم الصورة الأساس بعد إصلاح تمريرها كمرجع.

---

## 3. Short Video Studio (`/short-video`)

- **ما يحدث:**
  - **نص → فيديو:** prompt فقط → `FalService.generateTextToVideo(prompt, videoModel, aspectRatio)`.
  - **صورة → فيديو:** صورة شخصية (من المكتبة أو مرفوعة) + prompt → `FalService.generateImageToVideo(imageBase64, prompt, videoModel, aspectRatio)`.
- **الخيارات:** `videoModel` و `aspectRatio` من واجهة الصفحة (قائمة الموديلات من `/api/fal/models?type=video`). الأسلوب، حركة الكاميرا، المدة مدمجة في الـ prompt.
- **الحالة:** يعمل؛ يحترم الموديل والنسبة المختارين.

---

## 4. Product Video Studio (`/product-video`)

- **ما يحدث:**
  - **نص → فيديو:** عند عدم رفع صورة منتج → `generateTextToVideo(prompt, videoModel, aspectRatio)`.
  - **صورة → فيديو:** عند رفع صورة → `generateImageToVideo(imageBase64, prompt, videoModel, aspectRatio)`.
- **الخيارات:** `videoModel` و `aspectRatio` من الصفحة؛ باقي الحقول (منتج، فئة، مزايا، إضاءة، بيئة، حركة كاميرا، مدة) تدخل في الـ prompt.
- **الحالة:** يعمل؛ يحترم الخيارات.

---

## 5. Motion Control – Kling (`/kling-motion`)

- **ما يحدث:** **صورة + فيديو مرجعي → فيديو:** صورة شخصية + فيديو حركة → نقل الحركة إلى الشخصية (Motion Control).
- **الاستدعاء:** `POST /api/fal/kling-motion` مع `image_url`, `video_url`, `prompt`, `mode` (720p/1080p), `character_orientation`, `aspect_ratio`.
- **الخيارات:** الوضع (Standard/Pro)، اتجاه الشخصية (فيديو/صورة)، نسبة العرض (9:16, 16:9) تُرسل للـ API.
- **الحالة:** يعمل؛ المسار المُستخدم: `fal-ai/kling-video/v2.6/standard/motion-control` و `.../pro/motion-control`.

---

## 6. Story Studio (`/story`)

- **نص → صورة (مشاهد):** لكل مشهد: وصف + صور شخصيات مرجعية + صورة المشهد السابق (للاتساق) → `AIService.generateStoryboardFrame(...)` → `falGenerateImage(prompt, size, refUrls)`. النسبة من `aspectRatio` المشروع (16:9 أو 9:16).
- **صورة → فيديو:** كل إطار مشهد → `FalService.generateImageToVideo(frameImage, prompt, model, ratio)`. الموديل من `getProviderSettings().videoModel`، النسبة من `studioStoryboard.aspectRatio`.
- **الخيارات:** أسلوب القصة، نسبة العرض، لغة الحوار، عدد المشاهد تُستخدم في السيناريو والإطارات؛ موديل الفيديو من الإعدادات، نسبة الفيديو من المشروع.
- **الحالة:** يعمل؛ التوليد تسلسلي مع تأخير وإعادة محاولة؛ الفيديو يُرسل دفعة واحدة ثم استعلام بالـ batch.

---

## 7. Ad Campaign Studio

- **نص → صورة:** `AIService.generateAdCampaign` / `generateAdPoster` → `falGenerateImage(prompt, '1:1')`.
- **الخيارات:** الموديل من الإعدادات؛ المحتوى من حقول الحملة.
- **الحالة:** يعمل.

---

## Backend – نقاط التكامل

- **`/api/fal/generate-image`:** نص + اختياري `image_urls` (مراجع أو صورة أساس للتحسين). يدعم `image_size` (مثل landscape_16_9, portrait_9_16, square)، `negative_prompt`, `seed`. الموديل من الطلب أو الافتراضي.
- **`/api/fal/generate-video`:** نص + اختياري `image_url`، `aspect_ratio`، `model`.
- **`/api/fal/image-to-video`:** `image_base64` + `prompt`، `model`، `aspect_ratio`.
- **`/api/fal/kling-motion`:** `image_url`, `video_url`, `prompt`, `mode`, `character_orientation`, `aspect_ratio`.

---

## خلاصة

- **نص → صورة:** Character Create، Thumbnail (من الصفر)، Story Studio (إطارات)، Ad Campaign.
- **صورة → صورة:** Thumbnail (تحسين) — بعد إصلاح تمرير `baseThumbnail` كأول صورة مرجعية.
- **صورة → فيديو:** Short Video Studio، Product Video Studio، Story Studio (مشاهد → فيديو).
- **نص → فيديو:** Short Video Studio، Product Video Studio.
- **صورة + فيديو → فيديو:** Motion Control (Kling).

جميع الأدوات التي تعتمد على موديل الصورة/الفيديو أو نسبة العرض تستخدم إما الإعدادات العامة أو الخيارات المختارة في الصفحة، ويتم تمريرها بشكل صحيح إلى الـ API.
