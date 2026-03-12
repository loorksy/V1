// AI Provider - Routes calls to Gemini, kie.ai, or fal.ai based on user settings

const API = window.location.origin;
const FAL_KEY_AVAILABLE_FLAG = 'HAS_FAL_KEY';

export type Provider = 'gemini' | 'kie' | 'fal';

const DEFAULT_GEMINI_TEXT_MODEL = 'gemini-2.5-flash';
const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-3-pro-image-preview';
const DEFAULT_KIE_VIDEO_MODEL = 'veo3_fast';
const DEFAULT_FAL_TEXT_MODEL = 'google/gemini-2.5-flash';
const DEFAULT_FAL_IMAGE_MODEL = 'fal-ai/flux/dev';
const DEFAULT_FAL_VIDEO_MODEL = 'fal-ai/kling-video/v2.6/text-to-video/standard';

export function getProviderSettings() {
  const rawTextModel = localStorage.getItem('AI_TEXT_MODEL') || '';
  const rawImageModel = localStorage.getItem('AI_IMAGE_MODEL') || '';
  const rawVideoModel = localStorage.getItem('AI_VIDEO_MODEL') || '';
  // Force fal-only provider mode.
  return {
    provider: 'fal' as Provider,
    textModel: rawTextModel.includes('/') ? rawTextModel : DEFAULT_FAL_TEXT_MODEL,
    imageModel: rawImageModel.startsWith('fal-ai/') ? rawImageModel : DEFAULT_FAL_IMAGE_MODEL,
    videoModel: rawVideoModel.startsWith('fal-ai/') ? rawVideoModel : DEFAULT_FAL_VIDEO_MODEL,
  };
}

function hasFalKeyConfigured(): boolean {
  const localFalKey = (localStorage.getItem('FAL_API_KEY') || '').trim();
  if (localFalKey) return true;
  return localStorage.getItem(FAL_KEY_AVAILABLE_FLAG) === '1';
}

export class MissingApiKeyError extends Error {
  provider: Provider;
  constructor(provider: Provider) {
    const msg = provider === 'kie'
      ? 'مفتاح kie.ai API غير مضاف. اذهب للإعدادات لإضافته.'
      : provider === 'fal'
        ? 'مفتاح fal.ai API غير مضاف. اذهب للإعدادات لإضافته.'
        : 'مفتاح Gemini API غير مضاف. اذهب للإعدادات لإضافته.';
    super(msg);
    this.name = 'MissingApiKeyError';
    this.provider = provider;
  }
}

/** Check if the required API key is set. Throws MissingApiKeyError if not. */
export function requireApiKey(): void {
  if (!hasFalKeyConfigured()) throw new MissingApiKeyError('fal');
}

/** Check if kie.ai key exists (for video/motion when provider is kie) */
export function requireKieKey(): void {
  if (!hasFalKeyConfigured()) throw new MissingApiKeyError('fal');
}

export function isKieProvider(): boolean {
  return false;
}

export function isFalProvider(): boolean {
  return true;
}

// kie.ai text generation via backend
export async function kieGenerateText(prompt: string, systemPrompt = ''): Promise<string> {
  const { textModel } = getProviderSettings();
  const resp = await fetch(`${API}/api/kie/generate-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, system_prompt: systemPrompt, model: textModel }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || `[fal/generate-text] خطأ ${resp.status}`);
  }
  const data = await resp.json();
  return data.text || '';
}

// kie.ai JSON text generation (parse JSON from response)
export async function kieGenerateJSON<T>(prompt: string, systemPrompt = ''): Promise<T> {
  const fullSystem = `${systemPrompt}\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no code blocks, no explanations.`;
  const text = await kieGenerateText(prompt, fullSystem);
  
  // Try to extract JSON from the response
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
  
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to find JSON in the text
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error('فشل تحليل الرد كـ JSON');
  }
}

// kie.ai image generation via backend (synchronous - waits for result)
export async function kieGenerateImage(
  prompt: string,
  size = '1:1',
  imageUrls: string[] = [],
): Promise<string> {
  const { imageModel } = getProviderSettings();
  const resp = await fetch(`${API}/api/kie/generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, model: imageModel, size, image_urls: imageUrls }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || `خطأ توليد الصورة: ${resp.status}`);
  }
  const data = await resp.json();
  return data.imageUrl || '';
}

// fal.ai text generation via backend
export async function falGenerateText(prompt: string, systemPrompt = ''): Promise<string> {
  const { textModel } = getProviderSettings();
  const resp = await fetch(`${API}/api/fal/generate-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, system_prompt: systemPrompt, model: textModel }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || `[fal/generate-text-with-image] خطأ ${resp.status}`);
  }
  const data = await resp.json();
  return data.text || '';
}

// fal.ai JSON text generation
export async function falGenerateJSON<T>(prompt: string, systemPrompt = ''): Promise<T> {
  const fullSystem = `${systemPrompt}\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no code blocks, no explanations.`;
  const text = await falGenerateText(prompt, fullSystem);
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error('فشل تحليل الرد كـ JSON');
  }
}

// fal.ai text from image + prompt (vision) via backend
export async function falGenerateTextWithImage(imageBase64: string, prompt: string): Promise<string> {
  const { textModel } = getProviderSettings();
  const resp = await fetch(`${API}/api/fal/generate-text-with-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, image_base64: imageBase64, model: textModel }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || `خطأ ${resp.status}`);
  }
  const data = await resp.json();
  return data.text || '';
}

// fal.ai image generation via backend
export async function falGenerateImage(
  prompt: string,
  size = '1:1',
  imageUrls: string[] = [],
  options?: { negativePrompt?: string; seed?: number },
): Promise<string> {
  const { imageModel } = getProviderSettings();
  let lastError = '';
  for (let attempt = 1; attempt <= 5; attempt++) {
    const resp = await fetch(`${API}/api/fal/generate-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        model: imageModel,
        size,
        image_urls: imageUrls,
        negative_prompt: options?.negativePrompt || 'text, letters, words, typography, logo, watermark, subtitles, captions, signature, symbols, random characters',
        seed: options?.seed,
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      return data.imageUrl || '';
    }

    const err = await resp.json().catch(() => ({}));
    lastError = err.detail || `[fal/generate-image] خطأ توليد الصورة: ${resp.status}`;
    const retryable = resp.status >= 500 || resp.status === 429;
    if (!retryable || attempt === 5) break;
    const delay = Math.min(900 * Math.pow(2, attempt - 1), 8000) + Math.floor(Math.random() * 300);
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error(lastError || 'فشل توليد الصورة عبر fal.');
}
