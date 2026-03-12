import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Loader2, Package, Download, Upload, Check, Wand2, Save, Trash2 } from 'lucide-react';
import { FalService } from '../lib/fal';
import { AIService } from '../lib/aiService';
import { db, MediaItem } from '../lib/db';
import { getProviderSettings, MissingApiKeyError, requireKieKey } from '../lib/aiProvider';
import { ApiKeyMissing } from '../components/ApiKeyMissing';

const API = window.location.origin;
const PRODUCT_IDENTITIES_KEY = 'PRODUCT_VIDEO_IDENTITIES_V1';

interface VideoModelOption {
  id: string;
  label: string;
}

interface ProductIdentity {
  id: string;
  name: string;
  productName: string;
  category: string;
  keyFeatures: string;
  offerText: string;
  ctaText: string;
  brandTone: string;
  visualStyle: string;
  lighting: string;
  environment: string;
  cameraMotion: string;
  videoIdea: string;
}

const FALLBACK_FAL_VIDEO_MODELS: VideoModelOption[] = [
  { id: 'fal-ai/kling-video/v2.6/text-to-video/standard', label: 'Kling 2.6 - نص إلى فيديو' },
  { id: 'fal-ai/kling-video/v2.6/image-to-video/standard', label: 'Kling 2.6 - صورة إلى فيديو' },
];

const STYLE_OPTIONS = ['إعلاني فاخر', 'نظيف وبسيط', 'سينمائي للمنتجات', 'سوشيال UGC', 'تقني حديث'];
const LIGHTING_OPTIONS = ['إضاءة استوديو ناعمة', 'ضوء ذهبي', 'تباين درامي', 'إضاءة بيضاء عالية', 'لمسات نيون'];
const ENV_OPTIONS = ['خلفية استوديو بيضاء', 'مساحة داخلية حديثة', 'بيئة منزلية لايف ستايل', 'أجواء فاخرة داكنة', 'شارع حضري خارجي'];
const CAMERA_OPTIONS = ['تقريب بطيء', 'دوران 360', 'إظهار علوي', 'حركة يدوية ديناميكية', 'لقطة بطولية ثابتة'];
const RATIO_OPTIONS = ['9:16', '16:9', '1:1'];
const BRAND_TONES = ['احترافي', 'ودود', 'جريء', 'فاخر', 'بسيط'];

function getDurationOptionsByModel(modelId: string): string[] {
  const id = modelId.toLowerCase();
  if (id.includes('/pro')) return ['5s', '8s', '10s'];
  if (id.includes('image-to-video')) return ['5s', '8s', '10s'];
  return ['5s', '8s', '10s', '15s'];
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadProductIdentities(): ProductIdentity[] {
  try {
    const raw = localStorage.getItem(PRODUCT_IDENTITIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveProductIdentities(identities: ProductIdentity[]) {
  localStorage.setItem(PRODUCT_IDENTITIES_KEY, JSON.stringify(identities));
}

export default function ProductVideoStudio() {
  const navigate = useNavigate();
  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState('');
  const [keyFeatures, setKeyFeatures] = useState('');
  const [videoIdea, setVideoIdea] = useState('');
  const [offerText, setOfferText] = useState('');
  const [ctaText, setCtaText] = useState('اطلب الآن');
  const [brandTone, setBrandTone] = useState('احترافي');
  const [visualStyle, setVisualStyle] = useState(STYLE_OPTIONS[0]);
  const [lighting, setLighting] = useState(LIGHTING_OPTIONS[0]);
  const [environment, setEnvironment] = useState(ENV_OPTIONS[0]);
  const [cameraMotion, setCameraMotion] = useState(CAMERA_OPTIONS[0]);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [duration, setDuration] = useState('8s');
  const [durationOptions, setDurationOptions] = useState<string[]>(getDurationOptionsByModel(getProviderSettings().videoModel));
  const [multiVariant, setMultiVariant] = useState(false);
  const [variantCount, setVariantCount] = useState(3);
  const [referenceImageFile, setReferenceImageFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [videoModels, setVideoModels] = useState<VideoModelOption[]>([]);
  const [videoModel, setVideoModel] = useState(getProviderSettings().videoModel);
  const [identityName, setIdentityName] = useState('');
  const [savedIdentities, setSavedIdentities] = useState<ProductIdentity[]>([]);
  const [selectedIdentityId, setSelectedIdentityId] = useState('');

  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [isImprovingIdea, setIsImprovingIdea] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [missingKeyError, setMissingKeyError] = useState<MissingApiKeyError | null>(null);

  useEffect(() => {
    setSavedIdentities(loadProductIdentities());
  }, []);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const resp = await fetch(`${API}/api/fal/models?type=video`);
        const data = await resp.json();
        const models = (data.models || []) as VideoModelOption[];
        const safeModels = models.length ? models : FALLBACK_FAL_VIDEO_MODELS;
        setVideoModels(safeModels);
        if (!safeModels.some((m) => m.id === videoModel)) setVideoModel(safeModels[0].id);
      } catch {
        setVideoModels(FALLBACK_FAL_VIDEO_MODELS);
        if (!FALLBACK_FAL_VIDEO_MODELS.some((m) => m.id === videoModel)) setVideoModel(FALLBACK_FAL_VIDEO_MODELS[0].id);
      }
    };
    loadModels();
  }, []);

  useEffect(() => {
    const options = getDurationOptionsByModel(videoModel);
    setDurationOptions(options);
    if (!options.includes(duration)) setDuration(options[0]);
  }, [videoModel, duration]);

  const applyIdentity = (identity: ProductIdentity) => {
    setProductName(identity.productName);
    setCategory(identity.category);
    setKeyFeatures(identity.keyFeatures);
    setOfferText(identity.offerText);
    setCtaText(identity.ctaText);
    setBrandTone(identity.brandTone);
    setVisualStyle(identity.visualStyle);
    setLighting(identity.lighting);
    setEnvironment(identity.environment);
    setCameraMotion(identity.cameraMotion);
    setVideoIdea(identity.videoIdea);
    setIdentityName(identity.name);
  };

  const saveCurrentIdentity = () => {
    const trimmed = identityName.trim() || productName.trim();
    if (!trimmed) {
      setError('أدخل اسم هوية المنتج أولاً للحفظ.');
      return;
    }
    const identity: ProductIdentity = {
      id: selectedIdentityId || `identity-${Date.now()}`,
      name: trimmed,
      productName,
      category,
      keyFeatures,
      offerText,
      ctaText,
      brandTone,
      visualStyle,
      lighting,
      environment,
      cameraMotion,
      videoIdea,
    };
    const next = [...savedIdentities.filter((x) => x.id !== identity.id), identity];
    setSavedIdentities(next);
    setSelectedIdentityId(identity.id);
    saveProductIdentities(next);
  };

  const deleteCurrentIdentity = () => {
    if (!selectedIdentityId) return;
    const next = savedIdentities.filter((x) => x.id !== selectedIdentityId);
    setSavedIdentities(next);
    saveProductIdentities(next);
    setSelectedIdentityId('');
  };

  const analyzeProductImage = async (file: File) => {
    setError('');
    setIsAnalyzingImage(true);
    try {
      const base64 = await fileToBase64(file);
      const result = await AIService.analyzeProductImageForVideo(base64);

      if (result.productName) setProductName(result.productName);
      if (result.category) setCategory(result.category);
      if (result.keyFeatures) setKeyFeatures(result.keyFeatures);
      if (result.offerText) setOfferText(result.offerText);
      if (result.ctaText) setCtaText(result.ctaText);
      if (result.suggestedIdea) setVideoIdea(result.suggestedIdea);

      if (result.brandTone && BRAND_TONES.includes(result.brandTone)) setBrandTone(result.brandTone);
      if (result.visualStyle && STYLE_OPTIONS.includes(result.visualStyle)) setVisualStyle(result.visualStyle);
      if (result.lighting && LIGHTING_OPTIONS.includes(result.lighting)) setLighting(result.lighting);
      if (result.environment && ENV_OPTIONS.includes(result.environment)) setEnvironment(result.environment);
      setStatus('تم تحليل صورة المنتج وملء الحقول تلقائيًا.');
    } catch (e: any) {
      setError(e.message || 'تعذر تحليل صورة المنتج.');
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  const improveIdea = async () => {
    if (!productName.trim() || !keyFeatures.trim()) {
      setError('أدخل اسم المنتج والمزايا أولاً لتحسين الفكرة.');
      return;
    }
    setError('');
    setIsImprovingIdea(true);
    try {
      const improved = await AIService.improveProductVideoIdea({
        productName,
        category,
        keyFeatures,
        offerText,
        ctaText,
        brandTone,
        visualStyle,
      });
      if (improved?.trim()) setVideoIdea(improved.trim());
    } catch (e: any) {
      setError(e.message || 'فشل تحسين فكرة الفيديو.');
    } finally {
      setIsImprovingIdea(false);
    }
  };

  const buildPrompt = (variantIndex: number) => {
    const variantLine = multiVariant ? `النسخة ${variantIndex + 1}: غيّر التكوين البصري مع الحفاظ على هوية العلامة.` : '';
    return `أنشئ فيديو إعلاني قصير احترافي للمنتج.
اسم المنتج: ${productName}
الفئة: ${category}
المزايا الأساسية: ${keyFeatures}
فكرة الفيديو: ${videoIdea || 'عرض المنتج بطريقة جذابة ومقنعة'}
العرض: ${offerText || 'لا يوجد عرض صريح'}
CTA: ${ctaText}
نبرة العلامة: ${brandTone}
الأسلوب البصري: ${visualStyle}
الإضاءة: ${lighting}
البيئة: ${environment}
حركة الكاميرا: ${cameraMotion}
المدة المستهدفة: ${duration}
الأبعاد: ${aspectRatio}
${variantLine}
قواعد: إخراج إعلاني نظيف، تفاصيل واقعية، بدون تشويش أو علامات مائية.`;
  };

  const canGenerate = productName.trim() && keyFeatures.trim();

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setError('');
    setMissingKeyError(null);
    setResults([]);
    setIsGenerating(true);
    setStatus('بدء توليد فيديو المنتج...');

    try {
      requireKieKey();
      const service = FalService;
      const targetCount = multiVariant ? variantCount : 1;
      const videos: string[] = [];
      const imageBase64 = referenceImageFile ? await fileToBase64(referenceImageFile) : '';

      for (let i = 0; i < targetCount; i++) {
        setStatus(`جاري إنشاء النسخة ${i + 1} من ${targetCount}...`);
        const prompt = buildPrompt(i);
        let taskId = '';

        if (imageBase64) {
          const task = await service.generateImageToVideo(imageBase64, prompt, videoModel, aspectRatio);
          taskId = task.taskId;
        } else {
          const task = await service.generateTextToVideo(prompt, videoModel, aspectRatio);
          taskId = task.taskId;
        }

        const startedAt = Date.now();
        const videoUrl = await service.pollTaskStatus(taskId, () => {
          const sec = Math.floor((Date.now() - startedAt) / 1000);
          setStatus(`النسخة ${i + 1}: جاري التوليد... ${sec}s`);
        });
        videos.push(videoUrl);
        setResults([...videos]);

        const mediaItem: MediaItem = {
          id: `product-video-${Date.now()}-${i}`,
          type: 'video',
          title: `${productName} - نسخة ${i + 1}`,
          description: prompt.slice(0, 300),
          data: videoUrl,
          source: 'product',
          aspectRatio,
          createdAt: Date.now(),
        };
        await db.saveMediaItem(mediaItem);
      }

      setStatus('تم إنشاء فيديو المنتج بنجاح.');
    } catch (e: any) {
      if (e instanceof MissingApiKeyError) setMissingKeyError(e);
      else setError(e.message || 'فشل إنشاء فيديو المنتج');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-4 max-w-lg mx-auto min-h-screen bg-background pb-32">
      {missingKeyError && <ApiKeyMissing error={missingKeyError} onDismiss={() => setMissingKeyError(null)} />}

      <div className="flex items-center mb-5 pt-2">
        <button onClick={() => navigate(-1)} className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
        <div className="mr-2">
          <h1 className="text-lg font-bold flex items-center gap-2 text-foreground">
            <Package className="w-5 h-5 text-violet-500" />
            استوديو فيديو المنتجات
          </h1>
          <p className="text-[11px] text-muted-foreground">تحليل المنتج + توليد فيديوهات إعلانية احترافية</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-card p-4 rounded-2xl border border-border/60 space-y-3">
          <h2 className="font-bold text-sm text-card-foreground">هويات المنتجات المحفوظة</h2>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={selectedIdentityId}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedIdentityId(value);
                const identity = savedIdentities.find((x) => x.id === value);
                if (identity) applyIdentity(identity);
              }}
              className="p-2.5 border border-border rounded-xl bg-secondary/50 text-xs"
            >
              <option value="">اختر هوية محفوظة</option>
              {savedIdentities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <input value={identityName} onChange={(e) => setIdentityName(e.target.value)} placeholder="اسم هوية المنتج للحفظ" className="p-2.5 border border-border rounded-xl bg-secondary/50 text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={saveCurrentIdentity} className="py-2.5 bg-violet-50 border border-violet-200 text-violet-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5">
              <Save className="w-4 h-4" />
              حفظ الهوية
            </button>
            <button onClick={deleteCurrentIdentity} disabled={!selectedIdentityId} className="py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50">
              <Trash2 className="w-4 h-4" />
              حذف الهوية
            </button>
          </div>
        </div>

        <div className="bg-card p-4 rounded-2xl border border-border/60 space-y-3">
          <h2 className="font-bold text-sm text-card-foreground">صورة المنتج المرجعية (اختياري)</h2>
          <label className="block">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setReferenceImageFile(file);
                setReferencePreview(await fileToBase64(file));
                await analyzeProductImage(file);
              }}
            />
            <span className="w-full py-3 border border-dashed border-border rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer hover:bg-secondary/40">
              <Upload className="w-4 h-4" />
              رفع صورة المنتج وتحليلها تلقائيًا
            </span>
          </label>
          {referencePreview && <img src={referencePreview} alt="مرجع المنتج" className="w-full max-h-56 object-contain rounded-xl border border-border/60 bg-secondary/20" />}
          {isAnalyzingImage && (
            <div className="bg-violet-50 border border-violet-200 p-2.5 rounded-xl text-xs text-violet-700 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              جارٍ تحليل صورة المنتج وملء الحقول...
            </div>
          )}
        </div>

        <div className="bg-card p-4 rounded-2xl border border-border/60 space-y-3">
          <input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="اسم المنتج" className="w-full p-3 border border-border rounded-xl bg-secondary/50 text-sm" />
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="الفئة / المجال" className="w-full p-3 border border-border rounded-xl bg-secondary/50 text-sm" />
          <textarea value={keyFeatures} onChange={(e) => setKeyFeatures(e.target.value)} rows={3} placeholder="المزايا الأساسية للمنتج" className="w-full p-3 border border-border rounded-xl bg-secondary/50 text-sm resize-none" />
          <textarea value={videoIdea} onChange={(e) => setVideoIdea(e.target.value)} rows={3} placeholder="فكرة الفيديو (تبقى للتعديل والتحسين)" className="w-full p-3 border border-border rounded-xl bg-secondary/50 text-sm resize-none" />
          <button onClick={improveIdea} disabled={isImprovingIdea || !productName.trim() || !keyFeatures.trim()} className="w-full py-2.5 bg-violet-50 border border-violet-200 text-violet-700 rounded-xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {isImprovingIdea ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            تحسين فكرة الفيديو بالذكاء الاصطناعي
          </button>
          <input value={offerText} onChange={(e) => setOfferText(e.target.value)} placeholder="العرض / الخصم (اختياري)" className="w-full p-3 border border-border rounded-xl bg-secondary/50 text-sm" />
          <input value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder="عبارة الدعوة للإجراء" className="w-full p-3 border border-border rounded-xl bg-secondary/50 text-sm" />
        </div>

        <div className="bg-card p-4 rounded-2xl border border-border/60 space-y-3">
          <h2 className="font-bold text-sm text-card-foreground">إعدادات الإخراج</h2>
          <div className="grid grid-cols-2 gap-2">
            <select value={visualStyle} onChange={(e) => setVisualStyle(e.target.value)} className="p-2.5 border border-border rounded-xl bg-secondary/50 text-xs">{STYLE_OPTIONS.map((x) => <option key={x}>{x}</option>)}</select>
            <select value={lighting} onChange={(e) => setLighting(e.target.value)} className="p-2.5 border border-border rounded-xl bg-secondary/50 text-xs">{LIGHTING_OPTIONS.map((x) => <option key={x}>{x}</option>)}</select>
            <select value={environment} onChange={(e) => setEnvironment(e.target.value)} className="p-2.5 border border-border rounded-xl bg-secondary/50 text-xs">{ENV_OPTIONS.map((x) => <option key={x}>{x}</option>)}</select>
            <select value={cameraMotion} onChange={(e) => setCameraMotion(e.target.value)} className="p-2.5 border border-border rounded-xl bg-secondary/50 text-xs">{CAMERA_OPTIONS.map((x) => <option key={x}>{x}</option>)}</select>
            <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="p-2.5 border border-border rounded-xl bg-secondary/50 text-xs">{RATIO_OPTIONS.map((x) => <option key={x}>{x}</option>)}</select>
            <select value={duration} onChange={(e) => setDuration(e.target.value)} className="p-2.5 border border-border rounded-xl bg-secondary/50 text-xs">{durationOptions.map((x) => <option key={x}>{x}</option>)}</select>
            <select value={brandTone} onChange={(e) => setBrandTone(e.target.value)} className="p-2.5 border border-border rounded-xl bg-secondary/50 text-xs">{BRAND_TONES.map((x) => <option key={x}>{x}</option>)}</select>
            <select value={videoModel} onChange={(e) => setVideoModel(e.target.value)} className="p-2.5 border border-border rounded-xl bg-secondary/50 text-xs">
              {videoModels.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
        </div>

        <div className="bg-card p-4 rounded-2xl border border-border/60 space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={multiVariant} onChange={(e) => setMultiVariant(e.target.checked)} />
            توليد عدة نسخ (حملة فيديو)
          </label>
          {multiVariant && (
            <input
              type="number"
              min={2}
              max={6}
              value={variantCount}
              onChange={(e) => setVariantCount(Math.max(2, Math.min(6, Number(e.target.value) || 2)))}
              className="w-24 p-2 border border-border rounded-lg bg-secondary/50 text-sm"
            />
          )}
        </div>

        {error && <div className="bg-red-50 border border-red-200 p-3 rounded-xl text-xs text-red-700">{error}</div>}
        {status && !isGenerating && !error && <div className="bg-violet-50 border border-violet-200 p-2.5 rounded-xl text-xs text-violet-700">{status}</div>}
        {isGenerating && (
          <div className="bg-violet-50 border border-violet-200 p-3 rounded-xl text-xs text-violet-700 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {status}
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-3">
            {results.map((url, idx) => (
              <div key={idx} className="bg-card border border-border/60 rounded-2xl overflow-hidden">
                <video src={url} controls className="w-full bg-black" />
                <div className="p-3">
                  <a href={url} target="_blank" rel="noreferrer" className="w-full py-3 bg-violet-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                    <Download className="w-4 h-4" />
                    تنزيل النسخة {idx + 1}
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-16 left-0 right-0 bg-card/95 backdrop-blur-xl border-t border-border/60 p-4 z-40">
        <div className="max-w-lg mx-auto">
          <button onClick={handleGenerate} disabled={!canGenerate || isGenerating} className="w-full py-3.5 bg-violet-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
            إنشاء فيديو منتج احترافي
          </button>
        </div>
      </div>
    </div>
  );
}

