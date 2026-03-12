import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Sparkles, Loader2, Video, Upload, Users, Check, Download, Wand2 } from 'lucide-react';
import { db, Character, MediaItem } from '../lib/db';
import { FalService } from '../lib/fal';
import { AIService } from '../lib/aiService';
import { getProviderSettings, MissingApiKeyError, requireKieKey } from '../lib/aiProvider';
import { ApiKeyMissing } from '../components/ApiKeyMissing';

const API = window.location.origin;

interface VideoModelOption {
  id: string;
  label: string;
}

const FALLBACK_FAL_VIDEO_MODELS: VideoModelOption[] = [
  { id: 'fal-ai/kling-video/v2.6/text-to-video/standard', label: 'Kling 2.6 - نص إلى فيديو' },
  { id: 'fal-ai/kling-video/v2.6/image-to-video/standard', label: 'Kling 2.6 - صورة إلى فيديو' },
];

const STYLE_OPTIONS = ['سينمائي', 'إعلاني', 'وثائقي', 'أنمي', 'فاخر', 'سوشيال ديناميكي'];
const CAMERA_OPTIONS = ['ثابت', 'تقريب بطيء', 'تحريك يسار', 'تحريك يمين', 'دوران حول الهدف', 'محمول باليد'];
const RATIO_OPTIONS = ['9:16', '16:9', '1:1'];

function getDurationOptionsByModel(modelId: string): string[] {
  const id = modelId.toLowerCase();
  if (id.includes('/pro')) return ['5s', '8s', '10s'];
  if (id.includes('image-to-video')) return ['5s', '8s', '10s'];
  return ['5s', '8s', '10s', '15s'];
}

function getCharacterImage(char: Character): string | null {
  return char.images.front || char.images.reference || char.images.closeup || char.images.threeQuarter || char.images.normal || null;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function toBase64(src: string): Promise<string> {
  if (!src) return '';
  if (src.startsWith('data:')) return src;
  const resp = await fetch(src.startsWith('/') ? `${window.location.origin}${src}` : src);
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function ShortVideoStudio() {
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState('');
  const [uploadedCharacterImage, setUploadedCharacterImage] = useState<File | null>(null);
  const [uploadedCharacterPreview, setUploadedCharacterPreview] = useState<string | null>(null);

  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('سينمائي');
  const [cameraMotion, setCameraMotion] = useState('تقريب بطيء');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [videoModels, setVideoModels] = useState<VideoModelOption[]>([]);
  const [videoModel, setVideoModel] = useState(getProviderSettings().videoModel);
  const [duration, setDuration] = useState('8s');
  const [durationOptions, setDurationOptions] = useState<string[]>(getDurationOptionsByModel(getProviderSettings().videoModel));
  const [generationMode, setGenerationMode] = useState<'text2video' | 'image2video'>('text2video');
  const [isImprovingIdea, setIsImprovingIdea] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [missingKeyError, setMissingKeyError] = useState<MissingApiKeyError | null>(null);

  const selectedCharacter = useMemo(() => characters.find((c) => c.id === selectedCharacterId) || null, [characters, selectedCharacterId]);

  useEffect(() => {
    db.getAllCharacters().then(setCharacters);
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

  const handleUploadCharacter = async (file: File) => {
    setUploadedCharacterImage(file);
    setUploadedCharacterPreview(await fileToBase64(file));
    setSelectedCharacterId('');
  };

  const canGenerate = prompt.trim().length >= 12 && (generationMode === 'text2video' || !!selectedCharacter || !!uploadedCharacterImage);

  const buildPrompt = () => {
    const identity = selectedCharacter
      ? `${selectedCharacter.name} (${selectedCharacter.visualTraits || selectedCharacter.description})`
      : 'الشخصية المرجعية المرفوعة';
    return `أنشئ فيديو قصير احترافي.
فكرة الفيديو: ${prompt.trim()}
الأسلوب: ${style}
حركة الكاميرا: ${cameraMotion}
المدة المستهدفة: ${duration}
الأبعاد: ${aspectRatio}

تعليمات المرجع:
- استخدم صورة الشخصية كمرجع للهوية فقط (الوجه/الملابس/النسب).
- لا تنسخ الخلفية من الصورة المرجعية.
- أنشئ خلفية جديدة مناسبة للفكرة.
- حافظ على ثبات الشخصية دون تغيير.

ممنوع التشويش، الشعارات المائية، والنصوص العشوائية.`;
  };

  const improveIdea = async () => {
    if (!prompt.trim()) return;
    setIsImprovingIdea(true);
    try {
      const improved = await AIService.improveShortVideoIdea({
        productName: selectedCharacter?.name,
        category: 'فيديو قصير',
        keyFeatures: prompt.trim(),
        brandTone: 'احترافي',
        visualStyle: style,
      });
      if (improved?.trim()) setPrompt(improved.trim());
    } catch (e: any) {
      setError(e.message || 'فشل تحسين الفكرة');
    } finally {
      setIsImprovingIdea(false);
    }
  };

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setIsGenerating(true);
    setGeneratedVideoUrl(null);
    setError('');
    setMissingKeyError(null);

    try {
      requireKieKey();
      const finalPrompt = buildPrompt();
      const service = FalService;

      let taskId = '';
      if (generationMode === 'text2video') {
        setStatus('جاري إرسال مهمة النص إلى فيديو...');
        const task = await service.generateTextToVideo(finalPrompt, videoModel, aspectRatio);
        taskId = task.taskId;
      } else {
        setStatus('جاري تجهيز الصورة المرجعية...');
        const imageSource = uploadedCharacterImage ? await fileToBase64(uploadedCharacterImage) : await toBase64(getCharacterImage(selectedCharacter!) || '');
        if (!imageSource) throw new Error('تعذر تجهيز صورة مرجعية صالحة.');
        setStatus('جاري إرسال مهمة الصورة إلى فيديو...');
        const task = await service.generateImageToVideo(imageSource, finalPrompt, videoModel, aspectRatio);
        taskId = task.taskId;
      }

      const startedAt = Date.now();
      const videoUrl = await service.pollTaskStatus(taskId, () => {
        const sec = Math.floor((Date.now() - startedAt) / 1000);
        setStatus(`جاري التوليد الاحترافي... ${sec}s`);
      });

      setGeneratedVideoUrl(videoUrl);
      setStatus('تم إنشاء الفيديو بنجاح.');

      const item: MediaItem = {
        id: `short-video-${Date.now()}`,
        type: 'video',
        title: `فيديو قصير - ${selectedCharacter?.name || 'مرجع مخصص'}`,
        description: prompt.trim().slice(0, 300),
        data: videoUrl,
        source: 'animation',
        characterName: selectedCharacter?.name,
        aspectRatio,
        createdAt: Date.now(),
      };
      await db.saveMediaItem(item);
    } catch (e: any) {
      if (e instanceof MissingApiKeyError) setMissingKeyError(e);
      else setError(e.message || 'فشل إنشاء الفيديو');
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
            <Video className="w-5 h-5 text-violet-500" />
            استوديو الفيديو القصير
          </h1>
          <p className="text-[11px] text-muted-foreground">إنشاء فيديوهات قصيرة باحتراف مع مرجع شخصية</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-card p-4 rounded-2xl border border-border/60 space-y-3">
          <h2 className="font-bold text-sm text-card-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-violet-500" />
            الشخصية المرجعية
          </h2>
          <select
            value={selectedCharacterId}
            onChange={(e) => { setSelectedCharacterId(e.target.value); setUploadedCharacterImage(null); setUploadedCharacterPreview(null); }}
            className="w-full p-3 border border-border rounded-xl bg-secondary/50 text-sm"
          >
            <option value="">بدون اختيار من المكتبة</option>
            {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label className="block">
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUploadCharacter(f); }} />
            <span className="w-full py-3 border border-dashed border-border rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer hover:bg-secondary/40">
              <Upload className="w-4 h-4" />
              رفع صورة شخصية مخصصة
            </span>
          </label>
          {(uploadedCharacterPreview || (selectedCharacter && getCharacterImage(selectedCharacter))) && (
            <img src={uploadedCharacterPreview || (getCharacterImage(selectedCharacter!) as string)} alt="مرجع الشخصية" className="w-full max-h-56 object-contain rounded-xl border border-border/60 bg-secondary/20" />
          )}
          <p className="text-[11px] text-muted-foreground">الصورة تستخدم كمرجع للشخصية فقط، ولن يتم نسخ نفس الخلفية.</p>
        </div>

        <div className="bg-card p-4 rounded-2xl border border-border/60 space-y-3">
          <h2 className="font-bold text-sm text-card-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-500" />
            إعدادات الفيديو
          </h2>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            className="w-full p-3 border border-border rounded-xl bg-secondary/50 text-sm resize-none"
            placeholder="اكتب فكرة الفيديو القصير بشكل واضح..."
          />
          <button
            onClick={improveIdea}
            disabled={isImprovingIdea || !prompt.trim()}
            className="w-full py-2.5 bg-violet-50 border border-violet-200 text-violet-700 rounded-xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isImprovingIdea ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            تحسين فكرة الفيديو بالذكاء الاصطناعي
          </button>

          <div className="grid grid-cols-2 gap-2">
            <select value={generationMode} onChange={(e) => setGenerationMode(e.target.value as any)} className="p-2.5 border border-border rounded-xl bg-secondary/50 text-xs">
              <option value="text2video">نص إلى فيديو</option>
              <option value="image2video">صورة إلى فيديو</option>
            </select>
            <select value={videoModel} onChange={(e) => setVideoModel(e.target.value)} className="p-2.5 border border-border rounded-xl bg-secondary/50 text-xs">
              {videoModels.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <select value={style} onChange={(e) => setStyle(e.target.value)} className="p-2.5 border border-border rounded-xl bg-secondary/50 text-xs">
              {STYLE_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <select value={cameraMotion} onChange={(e) => setCameraMotion(e.target.value)} className="p-2.5 border border-border rounded-xl bg-secondary/50 text-xs">
              {CAMERA_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="p-2.5 border border-border rounded-xl bg-secondary/50 text-xs">
              {RATIO_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <select value={duration} onChange={(e) => setDuration(e.target.value)} className="p-2.5 border border-border rounded-xl bg-secondary/50 text-xs">
              {durationOptions.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 p-3 rounded-xl text-xs text-red-700">{error}</div>}

        {isGenerating && (
          <div className="bg-violet-50 border border-violet-200 p-3 rounded-xl text-xs text-violet-700 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {status}
          </div>
        )}

        {generatedVideoUrl && (
          <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
            <video src={generatedVideoUrl} controls className="w-full bg-black" />
            <div className="p-3">
              <a href={generatedVideoUrl} target="_blank" rel="noreferrer" className="w-full py-3 bg-violet-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                <Download className="w-4 h-4" />
                تنزيل الفيديو
              </a>
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-16 left-0 right-0 bg-card/95 backdrop-blur-xl border-t border-border/60 p-4 z-40">
        <div className="max-w-lg mx-auto">
          <button onClick={handleGenerate} disabled={!canGenerate || isGenerating} className="w-full py-3.5 bg-violet-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
            إنشاء فيديو قصير احترافي
          </button>
        </div>
      </div>
    </div>
  );
}

