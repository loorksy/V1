// Unified AI Service - Routes to Gemini, kie.ai, or fal.ai based on provider settings
import { isKieProvider, isFalProvider, kieGenerateText, kieGenerateJSON, kieGenerateImage, falGenerateText, falGenerateJSON, falGenerateImage, falGenerateTextWithImage, requireApiKey } from './aiProvider';
import { GeminiService } from './gemini';

const API = window.location.origin;
const uploadRefCache = new Map<string, string>();

// Helper: Convert a URL to base64 data URL
async function urlToBase64(url: string): Promise<string> {
  const resp = await fetch(url);
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Helper: Upload base64 image to kie.ai CDN for reference
async function uploadBase64ToKie(base64: string): Promise<string> {
  const resp = await fetch(`${API}/api/kie/upload-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_base64: base64 }),
  });
  if (!resp.ok) throw new Error('فشل رفع الصورة');
  const data = await resp.json();
  return data.url;
}

// Helper: Upload base64 image to fal.ai for reference
async function uploadBase64ToFal(base64: string): Promise<string> {
  const resp = await fetch(`${API}/api/fal/upload-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_base64: base64 }),
  });
  if (!resp.ok) throw new Error('فشل رفع الصورة');
  const data = await resp.json();
  return data.url;
}

async function uploadRefWithCache(base64: string, uploadRef: (b64: string) => Promise<string>): Promise<string | null> {
  if (!base64 || base64.length < 100) return null;
  const key = base64.slice(0, 240);
  const cached = uploadRefCache.get(key);
  if (cached) return cached;
  try {
    const url = await uploadRef(base64);
    if (url) uploadRefCache.set(key, url);
    return url || null;
  } catch {
    return null;
  }
}

export const AIService = {
  // ==================== TEXT GENERATION ====================

  async generateScriptAndScenes(
    idea: string,
    characters: { name: string; description: string; visualTraits?: string }[]
  ): Promise<{ script: string; scenes: { description: string; characters: string[]; dialogue: string }[] }> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.generateScriptAndScenes(idea, characters);
    }

    const charContext = characters.map(c =>
      `- ${c.name}: ${c.description}${c.visualTraits ? `. المظهر: ${c.visualTraits}` : ''}`
    ).join('\n');

    const langMatch = idea.match(/لغة الحوار: (.+?)\./);
    const dialogueLang = langMatch ? langMatch[1] : 'العربية';
    const sceneCountMatch = idea.match(/عدد المشاهد: (\d+)/);
    const sceneCount = sceneCountMatch ? sceneCountMatch[1] : '5';

    const prompt = `أنت مخرج أفلام أطفال محترف. أنشئ سيناريو كامل بناءً على: "${idea}".

عدد المشاهد بالضبط: ${sceneCount} مشهد.

الشخصيات:
${charContext}

قواعد:
- ثبات الشخصية: نفس الملابس والمظهر في كل مشهد
- ألوان زاهية مناسبة للأطفال
- كل مشهد 8 ثوانٍ، متصل بالذي قبله
- لغة الحوار: ${dialogueLang}
- حوار كامل لكل مشهد مع اسم الشخصية

أخرج JSON فقط:
{"script": "القصة الكاملة بالعربية", "scenes": [{"description": "وصف بصري بالإنجليزية مع اسم الشخصية وملابسها", "characters": ["اسم الشخصية"], "dialogue": "الحوار بـ${dialogueLang}"}]}`;

    const result = isFalProvider()
      ? await falGenerateJSON<{ script: string; scenes: any[] }>(prompt)
      : await kieGenerateJSON<{ script: string; scenes: any[] }>(prompt);
    return {
      script: result.script || '',
      scenes: Array.isArray(result.scenes) ? result.scenes : [],
    };
  },

  async generateStoryIdea(charNames: string[], genre: string, hint?: string): Promise<string> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.generateStoryIdea(charNames, genre, hint);
    }

    const prompt = `أنت كاتب سيناريو محترف. اكتب فكرة قصة قصيرة (3-4 جمل) من نوع "${genre}" تتضمن الشخصيات: ${charNames.join(' و ')}.
${hint ? `ملاحظة: ${hint}` : ''}
اكتب الفكرة بالعربية فقط. لا تكتب أي شيء آخر.`;

    return isFalProvider() ? falGenerateText(prompt) : kieGenerateText(prompt);
  },

  async generateStoryMetadata(story: any): Promise<{ videoTitle: string; videoDescription: string; hashtags: string }> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.generateStoryMetadata(story);
    }

    const sceneSummary = (story.scenes || []).map((s: any, i: number) =>
      `مشهد ${i + 1}: ${s.description || ''}. الحوار: ${s.dialogue || 'بدون'}`
    ).join('\n');

    const prompt = `حلل هذه القصة وأنشئ بيانات الفيديو:
القصة: ${story.script || story.title || ''}
المشاهد:
${sceneSummary}

أنشئ JSON:
{"videoTitle": "عنوان جذاب أقل من 70 حرف", "videoDescription": "وصف مفصل 3-5 أسطر", "hashtags": "15-20 هاشتاق مفصول بمسافات"}`;

    return isFalProvider() ? falGenerateJSON(prompt) : kieGenerateJSON(prompt);
  },

  // ==================== IMAGE GENERATION ====================

  async generateStoryboardFrame(params: {
    sceneDescription: string;
    characterImages: string[];
    firstSceneImage?: string;
    previousSceneImage?: string;
    sceneIndex: number;
    totalScenes: number;
    style: string;
    aspectRatio: '16:9' | '9:16' | '1:1';
    characterDNA: string;
  }): Promise<string> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.generateStoryboardFrame(params);
    }

    const uploadRef = isFalProvider() ? uploadBase64ToFal : uploadBase64ToKie;
    const refsToUpload = [
      ...params.characterImages.slice(0, 4),
      params.firstSceneImage || '',
      params.previousSceneImage || '',
    ].filter(Boolean);
    const uploadedRefs = await Promise.all(refsToUpload.map((img) => uploadRefWithCache(img, uploadRef)));
    const refUrls = uploadedRefs.filter(Boolean) as string[];

    const sizeMap: Record<string, string> = { '16:9': '16:9', '9:16': '9:16', '1:1': '1:1' };
    const size = sizeMap[params.aspectRatio] || '16:9';

    let prompt = `You are generating scene ${params.sceneIndex + 1} of ${params.totalScenes} for one continuous film.
STYLE: ${params.style}
CHARACTER BIBLE (must stay identical across all scenes):
${params.characterDNA}

SCENE BRIEF:
${params.sceneDescription}

HARD CONSISTENCY RULES:
- Keep character identity locked: same face shape, eyes, hair, clothing design, colors, accessories, body proportions.
- Do not redesign or restyle characters.
- Preserve cinematic continuity with previous shots.
- Match lighting mood and color grading with prior scene unless scene brief explicitly changes it.
- Keep composition clean and production-ready.
- Never include any text, letters, words, subtitles, captions, numbers, symbols, signatures, logos, UI, or watermark in the image.
- If any signboard appears in the scene, it must be blank (no letters).
- Avoid extra random characters, text overlays, logos, or artifacts.`;

    if (params.sceneIndex === 0) {
      prompt += ' This is the ESTABLISHING SHOT. Set the canonical look for all next scenes.';
    } else {
      prompt += ' Continue directly from the previous scene while preserving character continuity.';
    }

    const imageUrl = isFalProvider()
      ? await falGenerateImage(prompt, size, refUrls, {
          negativePrompt: 'text, letters, words, subtitles, captions, logo, watermark, signature, typographic artifacts',
          seed: 12031 + params.sceneIndex,
        })
      : await kieGenerateImage(prompt, size, refUrls);
    if (imageUrl.startsWith('http')) {
      return urlToBase64(imageUrl);
    }
    return imageUrl;
  },

  async generateCharacterAngle(description: string, angle: string): Promise<string> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.generateCharacterAngle(description, angle as any);
    }

    const prompt = `Generate a character image: ${description}. View Angle: ${angle}. Background: Neutral white. Style: Consistent character design sheet. High quality 8k.`;
    const imageUrl = isFalProvider() ? await falGenerateImage(prompt, '1:1') : await kieGenerateImage(prompt, '1:1');
    if (imageUrl.startsWith('http')) {
      return urlToBase64(imageUrl);
    }
    return imageUrl;
  },

  async analyzeCharacter(imageBase64: string): Promise<string> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.analyzeCharacter(imageBase64);
    }
    const prompt = `أنت خبير تحليل شخصيات رسوم متحركة. اكتب وصفاً مفصلا�� بالعربية لشخصية بناءً على تصميمها:
- ملامح الوجه (شكل العيون، لون الشعر، شكل الوجه)
- الملابس بالتفصيل (الألوان، الأسلوب)
- الإكسسوارات المميزة
- أسلوب الرسم (بيكسار، أنمي، واقعي)

اكتب وصفاً شاملاً يمكن استخدامه لإعادة رسم الشخصية.`;

    if (isFalProvider()) {
      return falGenerateTextWithImage(imageBase64, prompt);
    }
    return kieGenerateText(prompt);
  },

  async generateSurrealObject(params: any): Promise<{ surreal: string; normal?: string }> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.generateSurrealObject(params);
    }

    const genImage = isFalProvider() ? falGenerateImage : kieGenerateImage;
    const prompt = `Hyper-realistic anthropomorphic ${params.objectName} character. Face made entirely of ${params.objectName} material. Expression: ${params.emotion}. Body: ${params.body}. Limbs: ${params.limbs}. Hair: ${params.hair}. Camera: ${params.cameraAngle}. Lighting: ${params.lighting}. Environment: ${params.environment}. Style: ${params.style}, 8k, cinematic.`;
    const surreal = await genImage(prompt, '3:4');
    const surrealB64 = surreal.startsWith('http') ? await urlToBase64(surreal) : surreal;

    if (params.generateNormal) {
      const normalPrompt = `Hyper-realistic normal ${params.objectName}. No face, no human features. Camera: ${params.cameraAngle}. Lighting: ${params.lighting}. Environment: ${params.environment}. Style: ${params.style}, 8k.`;
      const normal = await genImage(normalPrompt, '3:4');
      const normalB64 = normal.startsWith('http') ? await urlToBase64(normal) : normal;
      return { surreal: surrealB64, normal: normalB64 };
    }
    return { surreal: surrealB64 };
  },

  async generateCreatureCharacter(params: any): Promise<string> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.generateCreatureCharacter(params);
    }

    const prompt = `Character design of a creature. Base: ${params.baseCreature}. ${params.hybridCreature ? `Hybrid with: ${params.hybridCreature}.` : ''} Body: ${params.bodyType}. Outfit: ${params.outfit}. Accessories: ${params.accessories}. Expression: ${params.expression}. Style: ${params.style}. Background: ${params.background}. 8k, masterpiece, 1:1 aspect ratio.`;
    const url = isFalProvider() ? await falGenerateImage(prompt, '1:1') : await kieGenerateImage(prompt, '1:1');
    return url.startsWith('http') ? await urlToBase64(url) : url;
  },

  async generateFunnyHuman(params: any): Promise<string> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.generateFunnyHuman(params);
    }

    const prompt = `Hilarious surreal image. Base: ${params.baseHuman}. Merged with: ${params.mergedWith}. Feature: ${params.crazyFeature}. Expression: ${params.expression}. Environment: ${params.environment}. Style: ${params.style}. 8k, convincing but absurd.`;
    const url = isFalProvider() ? await falGenerateImage(prompt, '3:4') : await kieGenerateImage(prompt, '3:4');
    return url.startsWith('http') ? await urlToBase64(url) : url;
  },

  async generateHumanCharacter(params: any): Promise<string> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.generateHumanCharacter(params);
    }

    const prompt = `Hyper-realistic human portrait. Gender: ${params.gender}. Age: ${params.age}. Ethnicity: ${params.ethnicity}. Hair: ${params.hair}. Eyes: ${params.eyeColor}. Body: ${params.bodyType}. Clothing: ${params.clothing}. Expression: ${params.expression}. Camera: ${params.cameraAngle}. Environment: ${params.environment}. Style: ${params.style}. 8k, cinematic.`;
    const url = isFalProvider() ? await falGenerateImage(prompt, '3:4') : await kieGenerateImage(prompt, '3:4');
    return url.startsWith('http') ? await urlToBase64(url) : url;
  },

  async generateCharacter(prompt: string): Promise<any> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.generateCharacter(prompt);
    }

    const genJSON = isFalProvider() ? falGenerateJSON : kieGenerateJSON;
    const genImage = isFalProvider() ? falGenerateImage : kieGenerateImage;
    const profileResult = await genJSON<{ name: string; description: string }>(
      `${prompt}\n\nOutput JSON: {"name": "اسم عربي إبداعي", "description": "وصف قصير بالعربية"}`
    );

    const imagePrompt = `${prompt}. Character design sheet, front view. Neutral background. 8k, masterpiece. 1:1 aspect ratio.`;
    const imageUrl = await genImage(imagePrompt, '1:1');
    const frontImage = imageUrl.startsWith('http') ? await urlToBase64(imageUrl) : imageUrl;

    return {
      name: profileResult.name || 'شخصية هجينة',
      description: profileResult.description || 'شخصية تم توليدها بالذكاء الاصطناعي',
      front: frontImage,
      side: frontImage,
      back: frontImage,
    };
  },

  async generateThumbnail(params: any): Promise<string> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.generateThumbnail(params);
    }

    let prompt = '';
    if (params.baseThumbnail) {
      prompt = `Enhance YouTube thumbnail. Style: ${params.style}. ${params.elements ? `Elements: ${params.elements}.` : ''} ${params.imageText ? `Text: "${params.imageText}".` : ''} Cinematic 8k, vibrant colors, high contrast.`;
    } else {
      prompt = `YouTube thumbnail. ${params.title ? `Title: "${params.title}".` : ''} Style: ${params.style}. Background: ${params.background}. Elements: ${params.elements}. ${params.facialExpression ? `Expression: ${params.facialExpression}.` : ''} ${params.emotion ? `Emotion: ${params.emotion}.` : ''} ${params.imageText ? `Prominent text: "${params.imageText}".` : ''} Eye-catching, high contrast, 8k, cinematic.`;
    }

    const uploadRef = isFalProvider() ? uploadBase64ToFal : uploadBase64ToKie;
    const refUrls: string[] = [];
    if (params.referenceImages?.length) {
      for (const img of params.referenceImages.slice(0, 2)) {
        try {
          const url = await uploadRef(img.dataUrl);
          refUrls.push(url);
        } catch { /* skip */ }
      }
    }

    const ratio = params.aspectRatio?.includes('9:16') ? '9:16' : params.aspectRatio?.includes('1:1') ? '1:1' : '16:9';
    const imageUrl = isFalProvider() ? await falGenerateImage(prompt, ratio, refUrls) : await kieGenerateImage(prompt, ratio, refUrls);
    return imageUrl.startsWith('http') ? await urlToBase64(imageUrl) : imageUrl;
  },

  async analyzeThumbnail(imageBase64: string): Promise<any> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.analyzeThumbnail(imageBase64);
    }

    const prompt = `حلل صورة يوتيوب مصغرة وأخرج JSON فقط بدون أي نص آخر:
{"critique": "نقد قصير بالعربية", "suggestedElements": "عناصر بصرية مقترحة", "suggestedText": "نص clickbait قصير", "suggestedStyle": "أسلوب مقترح"}`;

    if (isFalProvider()) {
      const text = await falGenerateTextWithImage(imageBase64, prompt);
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      try {
        return JSON.parse(cleaned);
      } catch {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        return { critique: '', suggestedElements: '', suggestedText: '', suggestedStyle: '' };
      }
    }
    return kieGenerateJSON<any>(prompt);
  },

  // ==================== IDEA GENERATORS ====================

  async generateRandomSurrealIdea(hint?: string): Promise<any> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.generateRandomSurrealIdea(hint);
    }

    const prompt = `Generate a surreal anthropomorphic character idea. ${hint ? `Based on: "${hint}"` : 'Random and unexpected.'}
Output JSON with English values: {"objectName": "", "emotion": "", "style": "", "body": "", "limbs": "", "hair": "", "cameraAngle": "Front-facing", "lighting": "", "environment": "Pure White"}`;

    return isFalProvider() ? falGenerateJSON(prompt) : kieGenerateJSON(prompt);
  },

  async generateRandomFunnyHumanIdea(): Promise<any> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.generateRandomFunnyHumanIdea();
    }

    const prompt = `Generate a hilarious human-hybrid character. Output JSON with Arabic values:
{"baseHuman": "", "mergedWith": "", "crazyFeature": "", "expression": "", "style": "", "environment": ""}`;
    return isFalProvider() ? falGenerateJSON(prompt) : kieGenerateJSON(prompt);
  },

  async generateRandomHumanIdea(): Promise<any> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.generateRandomHumanIdea();
    }

    const prompt = `Generate a unique human character. Output JSON with Arabic values:
{"gender": "", "age": "", "ethnicity": "", "hair": "", "eyeColor": "", "bodyType": "", "clothing": "", "expression": "", "style": "", "environment": "", "cameraAngle": ""}`;
    return isFalProvider() ? falGenerateJSON(prompt) : kieGenerateJSON(prompt);
  },

  async generateViralShortIdea(params: any): Promise<any> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.generateViralShortIdea(params);
    }

    const prompt = `Create a viral YouTube Shorts script in Arabic. Niche: ${params.niche}. Tone: ${params.tone}. Topic: ${params.topic || 'trending'}. ${params.characters ? `Characters: ${params.characters}` : ''}
Output JSON: {"title": "عنوان", "hook": "hook 3 ثوان", "visualConcept": "مفهوم بصري", "script": [{"time": "0:00-0:03", "visual": "", "audio": ""}], "cta": "دعوة للإجراء", "tags": ["tag1"]}`;

    return isFalProvider() ? falGenerateJSON(prompt) : kieGenerateJSON(prompt);
  },

  // ==================== PASSTHROUGH ====================

  async testConnection(): Promise<boolean> {
    if (isFalProvider()) {
      const resp = await fetch(`${API}/api/fal/test-connection`, { method: 'POST' });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok) return true;
      throw new Error(data.detail || `خطأ ${resp.status}`);
    }
    return GeminiService.testConnection();
  },

  async generateVoiceover(text: string, voiceName?: string): Promise<string> {
    if (isFalProvider()) {
      throw new Error('توليد الصوت (TTS) غير متاح عند استخدام fal. استخدم Google Gemini للإعدادات لتفعيل هذه الميزة.');
    }
    return GeminiService.generateVoiceover(text, voiceName || 'Zephyr');
  },

  async generateVideoClip(startFrame: string, endFrame: string, aspectRatio?: '16:9' | '9:16', cameraMotion?: string): Promise<string> {
    if (isFalProvider()) {
      throw new Error('توليد فيديو من إطارين غير متاح مع fal. استخدم توليد الفيديو من ستوري بورد (صورة → فيديو).');
    }
    return GeminiService.generateVideoClip(startFrame, endFrame, aspectRatio || '16:9', cameraMotion);
  },

  async generateCharacterSheet(params: any): Promise<any> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.generateCharacterSheet(params);
    }
    const prompt = `Character design sheet. Character: ${params.description || params.name}. Style: ${params.style || 'Pixar'}. Views: front, side, back, 3/4 angle. Neutral background. Professional character reference sheet. 8k.`;
    const url = isFalProvider() ? await falGenerateImage(prompt, '1:1') : await kieGenerateImage(prompt, '1:1');
    const b64 = url.startsWith('http') ? await urlToBase64(url) : url;
    return { front: b64, side: b64, back: b64, threeQuarter: b64 };
  },

  async regenerateCharacterView(params: any): Promise<string> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.regenerateCharacterView(params);
    }
    const prompt = `Character view: ${params.description}. Angle: ${params.view}. Style: ${params.style || 'Pixar'}. Neutral background. 8k.`;
    const url = isFalProvider() ? await falGenerateImage(prompt, '1:1') : await kieGenerateImage(prompt, '1:1');
    return url.startsWith('http') ? await urlToBase64(url) : url;
  },

  async improveAdCopy(topic: string, industry: string): Promise<{ largeText: string; smallText: string }> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.improveAdCopy(topic, industry);
    }
    const prompt = `أنت خبير تسويق. لدي إعلان عن: "${topic}" في مجال: "${industry}". اكتب JSON فقط: {"largeText": "عنوان رئيسي جذاب وقصير جداً", "smallText": "نص فرعي أو وصف مشوق وقصير"}`;
    const result = isFalProvider() ? await falGenerateJSON<{ largeText?: string; smallText?: string }>(prompt) : await kieGenerateJSON<{ largeText?: string; smallText?: string }>(prompt);
    return { largeText: result.largeText || '', smallText: result.smallText || '' };
  },

  async improveAdIdea(topic: string, industry: string): Promise<string> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      const result = await GeminiService.improveAdCopy(topic, industry);
      return `${result.largeText}\n${result.smallText}`.trim();
    }
    const prompt = `أنت مدير إبداعي (Creative Director) في وكالة إعلانات عالمية.
قام العميل بكتابة هذه الفكرة المبدئية لإعلان: "${topic}"
مجال عمل العميل: "${industry}"

مهمتك: أعد صياغة هذه الفكرة لتكون وصفاً بصرياً (Prompt) احترافياً جداً، مفصلاً، ومبتكراً، جاهزاً للإرسال إلى أداة توليد الصور.
أضف تفاصيل الإضاءة، الزاوية، العناصر البصرية، والجو العام.

اكتب الوصف المحسن فقط بدون مقدمات.`;
    return isFalProvider() ? falGenerateText(prompt) : kieGenerateText(prompt);
  },

  async analyzeProductImageForVideo(imageBase64: string): Promise<{
    productName: string;
    category: string;
    keyFeatures: string;
    visualStyle: string;
    lighting: string;
    environment: string;
    brandTone: string;
    suggestedIdea: string;
    offerText: string;
    ctaText: string;
  }> {
    requireApiKey();
    if (!isFalProvider()) {
      throw new Error('تحليل صورة المنتج مدعوم حالياً مع مزود fal.ai فقط.');
    }

    const prompt = `حلّل صورة المنتج التالية وأنشئ JSON فقط بدون أي نص إضافي.
أريد مخرجات مناسبة لإنشاء فيديو إعلاني قصير احترافي.
JSON schema:
{
  "productName": "",
  "category": "",
  "keyFeatures": "",
  "visualStyle": "",
  "lighting": "",
  "environment": "",
  "brandTone": "",
  "suggestedIdea": "",
  "offerText": "",
  "ctaText": ""
}`;
    const text = await falGenerateTextWithImage(imageBase64, prompt);
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error('فشل تحليل صورة المنتج.');
    }
  },

  async improveProductVideoIdea(params: {
    productName: string;
    category: string;
    keyFeatures: string;
    offerText?: string;
    ctaText?: string;
    brandTone?: string;
    visualStyle?: string;
  }): Promise<string> {
    requireApiKey();
    const prompt = `أنت خبير فيديوهات إعلانية قصيرة.
حسّن فكرة فيديو المنتج التالية لتصبح Prompt إنتاجي احترافي.
المنتج: ${params.productName}
الفئة: ${params.category}
المزايا: ${params.keyFeatures}
العرض: ${params.offerText || 'بدون'}
CTA: ${params.ctaText || 'تواصل الآن'}
نبرة العلامة: ${params.brandTone || 'احترافية'}
الأسلوب البصري: ${params.visualStyle || 'سينمائي'}

اكتب فكرة فيديو واحدة فقط، واضحة ومختصرة وقابلة للتنفيذ.`;
    return isFalProvider() ? falGenerateText(prompt) : kieGenerateText(prompt);
  },

  async generateAdCampaign(params: any): Promise<any> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.generateAdCampaign(params);
    }
    const prompt = `Create ad campaign images for: ${JSON.stringify(params)}. Professional advertising quality, eye-catching, modern design.`;
    const url = isFalProvider() ? await falGenerateImage(prompt, '1:1') : await kieGenerateImage(prompt, '1:1');
    const b64 = url.startsWith('http') ? await urlToBase64(url) : url;
    return [{ image: b64, headline: params.headline || 'Ad Campaign' }];
  },

  async generateAdPoster(params: any): Promise<any> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.generateAdPoster(params);
    }
    const prompt = `Professional advertising poster. ${params.headline || ''}. Product: ${params.product || ''}. Style: ${params.style || 'modern'}. Cinematic 8k.`;
    const url = isFalProvider() ? await falGenerateImage(prompt, '1:1') : await kieGenerateImage(prompt, '1:1');
    const b64 = url.startsWith('http') ? await urlToBase64(url) : url;
    return { image: b64 };
  },

  async generateProductShot(params: any): Promise<any> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.generateProductShot(params);
    }
    const prompt = `Professional product photography. Product: ${params.productDescription || ''}. Setting: ${params.setting || 'studio'}. Style: ${params.style || 'commercial'}. Lighting: professional studio. 8k.`;
    const url = isFalProvider() ? await falGenerateImage(prompt, '1:1') : await kieGenerateImage(prompt, '1:1');
    const b64 = url.startsWith('http') ? await urlToBase64(url) : url;
    return { image: b64 };
  },

  async generateBrandIdentity(description: string): Promise<any> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.generateBrandIdentity(description);
    }
    const prompt = `Create brand identity for: "${description}". Output JSON: {"name": "", "tagline": "", "colors": ["#hex1","#hex2","#hex3"], "typography": "", "style": ""}`;
    return isFalProvider() ? falGenerateJSON(prompt) : kieGenerateJSON(prompt);
  },

  async generateVideoIdeaFromCharacters(params: any): Promise<any> {
    requireApiKey();
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.generateVideoIdeaFromCharacters(params);
    }
    const prompt = `Create a video idea with these characters: ${JSON.stringify(params.characters)}. Genre: ${params.genre || 'comedy'}. Duration: short video.
Output JSON: {"title": "", "description": "", "scenes": [{"description": "", "duration": "5s"}]}`;
    return isFalProvider() ? falGenerateJSON(prompt) : kieGenerateJSON(prompt);
  },

  async generateCharacterAnimation(params: any): Promise<any> {
    if (!isKieProvider() && !isFalProvider()) {
      return GeminiService.generateCharacterAnimation(params);
    }
    if (isFalProvider()) {
      throw new Error('تحريك الشخصية (فيديو من صور مرجعية) متاح حالياً مع Gemini فقط. استخدم ستوري بورد مع fal لتوليد الفيديو من المشاهد.');
    }
    return params;
  },
};
