import React, { useState, useEffect } from 'react';
import { Settings, Save, AlertCircle, CheckCircle, XCircle, Loader2, LogOut, Zap, Brain, ImageIcon, Video } from 'lucide-react';

interface SettingsPageProps {
  onLogout?: () => void;
}

const API = window.location.origin;

interface FalModelOption {
  id: string;
  label: string;
}

// Simple in-memory cache so model lists are not re-fetched on every Settings remount.
// This avoids repeated /api/fal/models calls when navigating around the app.
const MODEL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let cachedTextModels: FalModelOption[] | null = null;
let cachedTextModelsTs = 0;

let cachedImageModels: FalModelOption[] | null = null;
let cachedImageModelsTs = 0;

let cachedVideoModels: FalModelOption[] | null = null;
let cachedVideoModelsTs = 0;

interface DiagnosticStep {
  label: string;
  status: 'success' | 'error';
  details?: string;
}

export default function SettingsPage({ onLogout }: SettingsPageProps) {
  const [falKey, setFalKey] = useState('');
  const provider = 'fal';
  const [textModel, setTextModel] = useState('google/gemini-2.5-flash');
  const [imageModel, setImageModel] = useState('fal-ai/flux/dev');
  const [videoModel, setVideoModel] = useState('fal-ai/kling-video/v2.6/text-to-video/standard');
  const [falTextModels, setFalTextModels] = useState<FalModelOption[]>([]);
  const [falImageModels, setFalImageModels] = useState<FalModelOption[]>([]);
  const [falVideoModels, setFalVideoModels] = useState<FalModelOption[]>([]);
  const [textModelsLoading, setTextModelsLoading] = useState(false);
  const [imageModelsLoading, setImageModelsLoading] = useState(false);
  const [videoModelsLoading, setVideoModelsLoading] = useState(false);
  const [textModelsError, setTextModelsError] = useState('');
  const [imageModelsError, setImageModelsError] = useState('');
  const [videoModelsError, setVideoModelsError] = useState('');
  const [hasBackendFalKey, setHasBackendFalKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [diagnosticSteps, setDiagnosticSteps] = useState<DiagnosticStep[]>([]);

  const refreshModelLists = async (canUseFalApi: boolean) => {
    // Invalidate caches when explicitly refreshing (after Save/Test actions)
    cachedTextModels = null;
    cachedImageModels = null;
    cachedVideoModels = null;
    cachedTextModelsTs = cachedImageModelsTs = cachedVideoModelsTs = 0;
    await Promise.all([loadTextModels(), loadImageModels(canUseFalApi), loadVideoModels(canUseFalApi)]);
  };

  useEffect(() => {
    // Ensure old provider/key state never forces non-fal mode.
    localStorage.removeItem('GEMINI_API_KEY');
    localStorage.setItem('AI_PROVIDER', 'fal');
    const storedFal = localStorage.getItem('FAL_API_KEY');
    if (storedFal) setFalKey(storedFal);

    const loadInitialSettings = async () => {
      try {
        const settingsResp = await fetchWithTimeout(`${API}/api/settings`, { method: 'GET' }, 8000);
        if (!settingsResp.ok) return;
        const data = await settingsResp.json();
        setTextModel(data.text_model || 'google/gemini-2.5-flash');
        setImageModel(data.image_model || 'fal-ai/flux/dev');
        setVideoModel(data.video_model || 'fal-ai/kling-video/v2.6/text-to-video/standard');
        localStorage.setItem('AI_PROVIDER', 'fal');
        localStorage.setItem('AI_TEXT_MODEL', data.text_model || 'google/gemini-2.5-flash');
        localStorage.setItem('AI_IMAGE_MODEL', data.image_model || 'fal-ai/flux/dev');
        localStorage.setItem('AI_VIDEO_MODEL', data.video_model || 'fal-ai/kling-video/v2.6/text-to-video/standard');
        if (data.has_fal_key) {
          setHasBackendFalKey(true);
          localStorage.setItem('HAS_FAL_KEY', '1');
        } else {
          setHasBackendFalKey(false);
          localStorage.removeItem('HAS_FAL_KEY');
        }
        if (data.fal_key_error) setErrorMessage(data.fal_key_error);
        const key = (storedFal || '').trim();
        const localKeyValid = key ? validateFalKeyClient(key) === null : false;
        const canUseFalApi = Boolean(localKeyValid || data.has_fal_key);
        // Load model lists without invalidating cache (so returning to Settings does not refetch)
        void Promise.all([loadTextModels(), loadImageModels(canUseFalApi), loadVideoModels(canUseFalApi)]);
      } catch {
        setErrorMessage('تعذر تحميل إعدادات الخادم (endpoint: settings).');
        const key = (storedFal || '').trim();
        const localKeyValid = key ? validateFalKeyClient(key) === null : false;
        void Promise.all([loadTextModels(), loadImageModels(localKeyValid), loadVideoModels(localKeyValid)]);
      }
    };

    loadInitialSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setErrorMessage('');

    if (falKey.trim()) {
      const keyValidationError = validateFalKeyClient(falKey);
      if (keyValidationError) {
        setSaving(false);
        setTestStatus('error');
        setErrorMessage(keyValidationError);
        return;
      }
      localStorage.setItem('FAL_API_KEY', falKey.trim());
    } else {
      localStorage.removeItem('FAL_API_KEY');
    }

    try {
      const saveResp = await fetch(`${API}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fal_api_key: falKey.trim() || null,
          provider,
          text_model: textModel,
          image_model: imageModel,
          video_model: videoModel,
        }),
      });
      if (!saveResp.ok) {
        const saveErr = await saveResp.json().catch(() => ({}));
        throw new Error(saveErr.detail || `تعذر حفظ الإعدادات (endpoint: settings, HTTP ${saveResp.status}).`);
      }

      try {
        const settingsResp = await fetch(`${API}/api/settings`);
        const settingsData = await settingsResp.json();
        if (settingsData.has_fal_key) {
          setHasBackendFalKey(true);
          localStorage.setItem('HAS_FAL_KEY', '1');
        } else {
          setHasBackendFalKey(false);
          localStorage.removeItem('HAS_FAL_KEY');
        }
      } catch {
        if (falKey.trim()) {
          setHasBackendFalKey(true);
          localStorage.setItem('HAS_FAL_KEY', '1');
        } else {
          setHasBackendFalKey(false);
          localStorage.removeItem('HAS_FAL_KEY');
        }
      }
    } catch (e) {
      console.error('Failed to save settings:', e);
    }

    // Save provider settings to localStorage for frontend services
    localStorage.setItem('AI_PROVIDER', provider);
    localStorage.setItem('AI_TEXT_MODEL', textModel);
    localStorage.setItem('AI_IMAGE_MODEL', imageModel);
    localStorage.setItem('AI_VIDEO_MODEL', videoModel);

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    setTestStatus('idle');
    const key = (falKey || localStorage.getItem('FAL_API_KEY') || '').trim();
    const localKeyValid = key ? validateFalKeyClient(key) === null : false;
    const canUseFalApi = Boolean(localKeyValid || hasBackendFalKey);
    void refreshModelLists(canUseFalApi);
  };

  const [successMessage, setSuccessMessage] = useState('');

  const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs = 12000) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      window.clearTimeout(timer);
    }
  };

  const addDiagnosticStep = (step: DiagnosticStep) => {
    setDiagnosticSteps((prev) => [...prev, step]);
  };

  const validateFalKeyClient = (rawKey: string): string | null => {
    const key = (rawKey || '').trim();
    if (!key) return 'أدخل مفتاح fal.ai أولاً.';
    if (/\s/.test(key)) return 'مفتاح fal.ai يحتوي مسافات غير صالحة.';
    for (const ch of key) {
      if (ch.charCodeAt(0) > 127) return 'مفتاح fal.ai يجب أن يحتوي أحرف إنجليزية فقط (ASCII).';
    }
    return null;
  };

  const loadTextModels = async () => {
    setTextModelsLoading(true);
    setTextModelsError('');
    try {
      // Use cache if still fresh
      if (cachedTextModels && Date.now() - cachedTextModelsTs < MODEL_CACHE_TTL) {
        setFalTextModels(cachedTextModels);
        if (cachedTextModels.length > 0) {
          setTextModel((prev) => (cachedTextModels.some((m: FalModelOption) => m.id === prev) ? prev : cachedTextModels[0].id));
        }
        setTextModelsLoading(false);
        return;
      }

      const resp = await fetchWithTimeout(`${API}/api/fal/models?type=text`, { method: 'GET' }, 12000);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setTextModelsError(data.detail || `تعذر تحميل موديلات النصوص (endpoint: models-text, HTTP ${resp.status}).`);
        setFalTextModels([]);
        return;
      }
      const models = Array.isArray(data.models) ? (data.models as FalModelOption[]) : [];
      cachedTextModels = models;
      cachedTextModelsTs = Date.now();
      setFalTextModels(models);
      if (models.length > 0) {
        setTextModel((prev) => (models.some((m) => m.id === prev) ? prev : models[0].id));
      }
      if (data.error) setTextModelsError(String(data.error));
    } catch {
      setTextModelsError('تعذر تحميل موديلات النصوص (endpoint: models-text).');
      setFalTextModels([]);
    } finally {
      setTextModelsLoading(false);
    }
  };

  const loadImageModels = async (canUseFalApi: boolean) => {
    setImageModelsLoading(true);
    setImageModelsError('');
    if (!canUseFalApi) {
      setFalImageModels([]);
      setImageModelsError('موديلات الصور تتطلب مفتاح fal.ai صالح.');
      setImageModelsLoading(false);
      return;
    }
    try {
      // Use cache if still fresh
      if (cachedImageModels && Date.now() - cachedImageModelsTs < MODEL_CACHE_TTL) {
        setFalImageModels(cachedImageModels);
        if (cachedImageModels.length > 0) {
          setImageModel((prev) => (cachedImageModels.some((m) => m.id === prev) ? prev : cachedImageModels[0].id));
        }
        setImageModelsLoading(false);
        return;
      }

      const resp = await fetchWithTimeout(`${API}/api/fal/models?type=image`, { method: 'GET' }, 15000);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setImageModelsError(data.detail || `تعذر تحميل موديلات الصور (endpoint: models-image, HTTP ${resp.status}).`);
        setFalImageModels([]);
        return;
      }
      const models = Array.isArray(data.models) ? (data.models as FalModelOption[]) : [];
      cachedImageModels = models;
      cachedImageModelsTs = Date.now();
      setFalImageModels(models);
      if (models.length > 0) {
        setImageModel((prev) => (models.some((m) => m.id === prev) ? prev : models[0].id));
      }
      if (data.error) setImageModelsError(String(data.error));
    } catch {
      setImageModelsError('تعذر تحميل موديلات الصور (endpoint: models-image).');
      setFalImageModels([]);
    } finally {
      setImageModelsLoading(false);
    }
  };

  const loadVideoModels = async (canUseFalApi: boolean) => {
    setVideoModelsLoading(true);
    setVideoModelsError('');
    if (!canUseFalApi) {
      setFalVideoModels([]);
      setVideoModelsError('موديلات الفيديو تتطلب مفتاح fal.ai صالح.');
      setVideoModelsLoading(false);
      return;
    }
    try {
      // Use cache if still fresh
      if (cachedVideoModels && Date.now() - cachedVideoModelsTs < MODEL_CACHE_TTL) {
        setFalVideoModels(cachedVideoModels);
        if (cachedVideoModels.length > 0) {
          setVideoModel((prev) => (cachedVideoModels.some((m) => m.id === prev) ? prev : cachedVideoModels[0].id));
        }
        setVideoModelsLoading(false);
        return;
      }

      const resp = await fetchWithTimeout(`${API}/api/fal/models?type=video`, { method: 'GET' }, 15000);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setVideoModelsError(data.detail || `تعذر تحميل موديلات الفيديو (endpoint: models-video, HTTP ${resp.status}).`);
        setFalVideoModels([]);
        return;
      }
      const models = Array.isArray(data.models) ? (data.models as FalModelOption[]) : [];
      cachedVideoModels = models;
      cachedVideoModelsTs = Date.now();
      setFalVideoModels(models);
      if (models.length > 0) {
        setVideoModel((prev) => (models.some((m) => m.id === prev) ? prev : models[0].id));
      }
      if (data.error) setVideoModelsError(String(data.error));
    } catch {
      setVideoModelsError('تعذر تحميل موديلات الفيديو (endpoint: models-video).');
      setFalVideoModels([]);
    } finally {
      setVideoModelsLoading(false);
    }
  };

  const handleTest = async () => {
    setTestStatus('testing');
    setErrorMessage('');
    setSuccessMessage('');
    setDiagnosticSteps([]);

    const activeFalKey = falKey.trim() || localStorage.getItem('FAL_API_KEY') || '';
    if (!activeFalKey && !hasBackendFalKey) {
      setTestStatus('error');
      setErrorMessage('أدخل مفتاح fal.ai أولاً ثم أعد الفحص.');
      addDiagnosticStep({ label: 'التحقق من المفتاح', status: 'error', details: 'لا يوجد مفتاح fal.ai في الحقل أو في الإعدادات المحفوظة.' });
      return;
    }
    if (activeFalKey) {
      const keyValidationError = validateFalKeyClient(activeFalKey);
      if (keyValidationError) {
        setTestStatus('error');
        setErrorMessage(keyValidationError);
        addDiagnosticStep({ label: 'التحقق من المفتاح', status: 'error', details: keyValidationError });
        return;
      }
    }

    if (activeFalKey) {
      localStorage.setItem('FAL_API_KEY', activeFalKey);
      try {
        const persistResp = await fetchWithTimeout(
          `${API}/api/settings`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fal_api_key: activeFalKey, provider: 'fal', text_model: textModel, image_model: imageModel, video_model: videoModel }),
          },
          10000
        );
        if (persistResp.ok) {
          addDiagnosticStep({ label: 'حفظ المفتاح في الباكند', status: 'success', details: 'تم حفظ مفتاح fal.ai في الإعدادات.' });
        } else {
          const err = await persistResp.json().catch(() => ({}));
          addDiagnosticStep({ label: 'حفظ المفتاح في الباكند', status: 'error', details: err.detail || `HTTP ${persistResp.status}` });
        }
      } catch (e: any) {
        addDiagnosticStep({
          label: 'حفظ المفتاح في الباكند',
          status: 'error',
          details: e?.name === 'AbortError' ? 'انتهت مهلة حفظ الإعدادات (Timeout).' : 'فشل الوصول إلى الباكند أثناء حفظ المفتاح.',
        });
      }
    }

    try {
      const healthResp = await fetchWithTimeout(`${API}/api/health`, { method: 'GET' }, 8000);
      if (!healthResp.ok) {
        throw new Error(`الباكند يعمل لكن /api/health رجّع HTTP ${healthResp.status}`);
      }
      addDiagnosticStep({ label: 'فحص الباكند المحلي', status: 'success', details: 'الخادم المحلي متاح.' });

      const settingsResp = await fetchWithTimeout(`${API}/api/settings`, { method: 'GET' }, 10000);
      if (!settingsResp.ok) {
        throw new Error(`تعذّر قراءة /api/settings (HTTP ${settingsResp.status})`);
      }
      const settingsData = await settingsResp.json().catch(() => ({}));
      const hasServerKey = Boolean(settingsData?.has_fal_key);
      if (hasServerKey || activeFalKey) {
        addDiagnosticStep({ label: 'فحص الإعدادات', status: 'success', details: hasServerKey ? 'المفتاح محفوظ في الباكند.' : 'المفتاح موجود محلياً وسيستخدم في الطلبات.' });
      } else {
        addDiagnosticStep({ label: 'فحص الإعدادات', status: 'error', details: 'لم يتم العثور على مفتاح fal.ai في الإعدادات.' });
      }

      try {
        const keyDebugResp = await fetchWithTimeout(`${API}/api/fal/debug-key`, { method: 'GET' }, 8000);
        const keyDebug = await keyDebugResp.json().catch(() => ({}));
        if (keyDebugResp.ok && keyDebug?.is_valid) {
          addDiagnosticStep({ label: 'تشخيص مفتاح fal', status: 'success', details: `المصدر: ${keyDebug.source || 'unknown'} / الطول: ${keyDebug.length ?? 0}` });
        } else {
          addDiagnosticStep({ label: 'تشخيص مفتاح fal', status: 'error', details: 'المفتاح غير صالح في الخادم. تحقق من الحفظ وإعادة اللصق.' });
        }
      } catch {
        addDiagnosticStep({ label: 'تشخيص مفتاح fal', status: 'error', details: 'تعذر قراءة endpoint: /api/fal/debug-key' });
      }

      const resp = await fetchWithTimeout(`${API}/api/fal/test-connection`, { method: 'POST' }, 15000);
      const data = await resp.json();
      if (resp.ok) {
        addDiagnosticStep({ label: 'اختبار اتصال fal.ai', status: 'success', details: data.message || 'fal.ai reachable' });
        setTestStatus('success');
        setSuccessMessage(data.message || 'المفتاح يعمل بشكل صحيح.');
        setHasBackendFalKey(true);
        localStorage.setItem('HAS_FAL_KEY', '1');
        void refreshModelLists(true);
        try {
          const modelResp = await fetchWithTimeout(`${API}/api/fal/models?type=image`, { method: 'GET' }, 12000);
          if (modelResp.ok) {
            addDiagnosticStep({ label: 'تحميل نماذج fal', status: 'success', details: 'تم الوصول لقائمة النماذج بنجاح.' });
          } else {
            addDiagnosticStep({ label: 'تحميل نماذج fal', status: 'error', details: `تعذّر تحميل النماذج (HTTP ${modelResp.status}).` });
          }
        } catch {
          addDiagnosticStep({ label: 'تحميل نماذج fal', status: 'error', details: 'فشل تحميل قائمة النماذج من fal.' });
        }
      } else {
        let detail = data.detail || `خطأ ${resp.status}`;
        if (resp.status === 401 || resp.status === 403) {
          detail = 'مفتاح fal.ai غير صالح أو منتهي.';
        } else if (resp.status >= 500 && `${detail}`.includes('FAL_KEY not configured')) {
          detail = 'المفتاح غير محفوظ في الباكند. اضغط حفظ التغييرات ثم أعد الفحص.';
        }
        addDiagnosticStep({ label: 'اختبار اتصال fal.ai', status: 'error', details: detail });
        throw new Error(detail);
      }
    } catch (error: any) {
      setTestStatus('error');
      if (error?.name === 'AbortError') {
        setErrorMessage('انتهت مهلة الاتصال. تحقق من أن الباكند يعمل وأن الشبكة مستقرة.');
      } else if (`${error?.message || ''}`.includes('Failed to fetch')) {
        setErrorMessage('تعذر الوصول إلى الباكند المحلي. تأكد أن السيرفر يعمل على المنفذ 8001.');
        addDiagnosticStep({ label: 'فحص الباكند المحلي', status: 'error', details: 'لا يمكن الاتصال بـ API المحلي (Connection refused أو CORS/network).' });
      } else {
        setErrorMessage(error.message || 'فشل الاتصال بـ fal.ai');
      }
    }
  };

  const textModels = falTextModels;
  const imageModels = falImageModels;
  const videoModels = falVideoModels;
  const optionValue = (m: { id?: string; value?: string; label: string }) => ('id' in m ? m.id : (m as { value: string }).value) || '';
  const optionLabel = (m: { label: string }) => m.label;

  return (
    <form
      className="p-4 max-w-6xl mx-auto space-y-5 pb-24 lg:pb-8"
      data-testid="settings-page"
      onSubmit={(e) => e.preventDefault()}
    >
      <header className="flex items-center gap-3 pt-2">
        <div className="w-10 h-10 bg-primary rounded-xl text-primary-foreground shadow-md shadow-primary/20 flex items-center justify-center">
          <Settings className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">الإعدادات</h1>
          <p className="text-muted-foreground text-xs">مفاتيح API والمزودين والنماذج</p>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {/* Provider Toggle - fal فقط كمزود رئيسي */}
      <div className="bg-card p-5 rounded-2xl border border-border/60 space-y-4">
        <h2 className="text-sm font-bold text-card-foreground flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          المزود الرئيسي
        </h2>
      <div className="grid grid-cols-1 gap-2">
        <div
          data-testid="provider-fal"
          className="py-3 px-4 rounded-xl border-2 text-sm font-bold transition-all border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
        >
          fal.ai (مزود واحد)
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        fal.ai مزود واحد للنصوص والصور والفيديو. أدخل المفتاح ثم احفظ لتحميل قوائم النماذج.
      </p>
      </div>

      {/* API Keys */}
      <div className="bg-card p-5 rounded-2xl border border-border/60 space-y-4">
        <h2 className="text-sm font-bold text-card-foreground">مفاتيح API</h2>

        {/* fal.ai Key */}
        <div>
          <label className="block text-xs font-bold text-card-foreground mb-1.5">
            مفتاح fal.ai API
          </label>
          <input
            data-testid="fal-api-key-input"
            type="password"
            value={falKey}
            onChange={(e) => setFalKey(e.target.value)}
            placeholder="fal.ai API Key..."
            className="w-full p-3 border border-border rounded-xl focus:ring-2 focus:ring-ring/30 focus:border-primary outline-none font-mono text-sm bg-secondary/50"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            <span className="text-amber-600 font-medium">مطلوب - </span>
            <a href="https://fal.ai/dashboard/keys" target="_blank" rel="noreferrer" className="text-primary hover:underline">
              احصل على مفتاحك من fal.ai
            </a>
          </p>
        </div>

      </div>

      {/* Model Selection */}
      <div className="bg-card p-5 rounded-2xl border border-border/60 space-y-4 xl:col-span-2">
        <h2 className="text-sm font-bold text-card-foreground flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-500" />
          اختيار النماذج
        </h2>

        {/* Text Model */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
            <Brain className="w-3 h-3" /> نموذج النصوص (السيناريو والأفكار)
          </label>
          <select
            data-testid="text-model-select"
            value={textModel}
            onChange={(e) => setTextModel(e.target.value)}
            className="w-full p-2.5 border border-border rounded-xl bg-secondary/50 text-sm focus:ring-2 focus:ring-ring/30 outline-none"
          >
            {textModels.length === 0 && <option value={textModel}>{textModelsLoading ? 'جاري التحميل...' : 'لا توجد موديلات متاحة'}</option>}
            {textModels.map(m => (
              <option key={optionValue(m as any)} value={optionValue(m as any)}>{optionLabel(m as any)}</option>
            ))}
          </select>
          {textModelsError && <p className="text-[11px] text-red-500 mt-1">{textModelsError}</p>}
        </div>

        {/* Image Model */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
            <ImageIcon className="w-3 h-3" /> نموذج الصور (المشاهد والشخصيات)
          </label>
          <select
            data-testid="image-model-select"
            value={imageModel}
            onChange={(e) => setImageModel(e.target.value)}
            className="w-full p-2.5 border border-border rounded-xl bg-secondary/50 text-sm focus:ring-2 focus:ring-ring/30 outline-none"
          >
            {imageModels.length === 0 && <option value={imageModel}>{imageModelsLoading ? 'جاري التحميل...' : 'لا توجد موديلات متاحة'}</option>}
            {imageModels.map(m => (
              <option key={optionValue(m as any)} value={optionValue(m as any)}>{optionLabel(m as any)}</option>
            ))}
          </select>
          {imageModelsError && <p className="text-[11px] text-red-500 mt-1">{imageModelsError}</p>}
        </div>

        {/* Video Model */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
            <Video className="w-3 h-3" /> نموذج الفيديو
          </label>
          <select
            data-testid="video-model-select"
            value={videoModel}
            onChange={(e) => setVideoModel(e.target.value)}
            className="w-full p-2.5 border border-border rounded-xl bg-secondary/50 text-sm focus:ring-2 focus:ring-ring/30 outline-none"
          >
            {videoModels.length === 0 && <option value={videoModel}>{videoModelsLoading ? 'جاري التحميل...' : 'لا توجد موديلات متاحة'}</option>}
            {videoModels.map(m => (
              <option key={optionValue(m as any)} value={optionValue(m as any)}>{optionLabel(m as any)}</option>
            ))}
          </select>
          {videoModelsError && <p className="text-[11px] text-red-500 mt-1">{videoModelsError}</p>}
        </div>
      </div>
      </div>

      {/* Save & Test */}
      <div className="flex gap-2.5">
        <button
          type="button"
          data-testid="test-connection-btn"
          onClick={handleTest}
          disabled={testStatus === 'testing' || (!falKey && !hasBackendFalKey)}
          className="flex-1 py-3 bg-secondary text-secondary-foreground rounded-xl font-bold text-sm hover:bg-muted transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {testStatus === 'testing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          <span>فحص الاتصال</span>
        </button>
        <button
          type="button"
          data-testid="save-settings-btn"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:brightness-110 transition-all flex items-center justify-center gap-2 shadow-md shadow-primary/20"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>حفظ التغييرات</span>
        </button>
      </div>

      {saved && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-3 rounded-xl text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          <span className="font-medium">تم الحفظ بنجاح!</span>
        </div>
      )}

      {testStatus === 'success' && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-3 rounded-xl text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          <div>
            <p className="font-bold text-sm">الاتصال ناجح!</p>
            <p className="text-xs opacity-80">{successMessage}</p>
          </div>
        </div>
      )}

      {testStatus === 'error' && (
        <div className="bg-red-50 border border-red-100 text-red-700 p-3 rounded-xl text-sm flex items-start gap-2">
          <XCircle className="w-4 h-4 mt-0.5" />
          <div>
            <p className="font-bold text-sm">فشل الاتصال</p>
            <p className="text-xs opacity-90">{errorMessage}</p>
          </div>
        </div>
      )}

      {diagnosticSteps.length > 0 && (
        <div className="bg-card border border-border/60 p-3 rounded-xl space-y-2">
          <p className="text-xs font-bold text-foreground">نتيجة التشخيص</p>
          {diagnosticSteps.map((step, idx) => (
            <div key={`${step.label}-${idx}`} className="text-xs flex items-start gap-2">
              {step.status === 'success' ? (
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600 mt-0.5" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-red-600 mt-0.5" />
              )}
              <div>
                <p className={step.status === 'success' ? 'text-emerald-700 font-medium' : 'text-red-700 font-medium'}>{step.label}</p>
                {step.details && <p className="text-muted-foreground">{step.details}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Box */}
      <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h3 className="font-bold text-amber-900 text-xs">ملاحظة</h3>
          <p className="text-[10px] text-amber-800 leading-relaxed">
            عند اختيار fal.ai كمزود واحد، كل عمليات التوليد (نصوص، صور، فيديو) ستتم عبر fal.ai. قوائم النماذج تُحدّث من fal تلقائياً.
          </p>
        </div>
      </div>

      {/* Logout */}
      {onLogout && (
        <button
          type="button"
          onClick={onLogout}
          data-testid="logout-button"
          className="w-full py-3.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          <span>تسجيل الخروج</span>
        </button>
      )}
    </form>
  );
}
