import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight, Loader2, Download, Users, Wand2, Film, Play, Check,
  AlertCircle, Video, Link2,
  Sparkles, Ban, Image as ImageIcon, Upload, X
} from 'lucide-react';
import { db, Character, MediaItem } from '../lib/db';
import { AIService } from '../lib/aiService';
import { requireKieKey, MissingApiKeyError } from '../lib/aiProvider';
import { ApiKeyMissing } from '../components/ApiKeyMissing';
import { motion, AnimatePresence } from 'framer-motion';

const API = window.location.origin;

const MODES = [
  { id: 'standard' as const, value: '720p', label: 'Standard', sub: '720p' },
  { id: 'pro' as const, value: '1080p', label: 'Professional', sub: '1080p' },
];

const ORIENTATIONS = [
  { value: 'video' as const, label: 'اداء كامل الجسم', sub: 'حتى 30 ث', desc: 'رقص، مشي، حركة كاملة' },
  { value: 'image' as const, label: 'بورتريه / وجه', sub: 'حتى 10 ث', desc: 'تعبيرات وجه، حركة كاميرا' },
];

const ASPECT_RATIOS = [
  { value: '9:16' as const, label: 'عمودي 9:16' },
  { value: '16:9' as const, label: 'أفقي 16:9' },
];

const MAX_IMAGE_MB = 12;
const MAX_VIDEO_MB = 120;

function getCharImage(char: Character): string | null {
  return char.images?.front || char.images?.threeQuarter || char.images?.right || char.images?.left || null;
}

function DropZone({
  accept, label, hint, file, url, inputMode, preview, onFile, onUrl, onClear,
}: {
  accept: string; label: string; hint: string; file: File | null; url: string;
  inputMode: 'upload' | 'url'; preview?: string | null;
  onFile: (f: File) => void; onUrl: (u: string) => void; onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const isVideo = accept.includes('video');

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) onFile(dropped);
  };

  return (
    <div className="space-y-2">
      {inputMode === 'upload' ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => !file && inputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl transition-all cursor-pointer overflow-hidden
            ${dragging ? 'border-violet-400 bg-violet-50/50' : file ? 'border-emerald-400 bg-emerald-50/30 cursor-default' : 'border-border hover:border-violet-300 hover:bg-violet-50/20'}`}
        >
          <input ref={inputRef} type="file" accept={accept} className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
          {file ? (
            <div className="relative">
              {isVideo ? (preview ? <video src={preview} controls className="w-full max-h-52 object-contain bg-black" /> :
                <div className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center"><Film className="w-5 h-5 text-emerald-600" /></div>
                  <div><p className="text-sm font-bold text-foreground truncate max-w-[220px]">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p></div>
                </div>
              ) : preview ? <img src={preview} alt="preview" className="w-full max-h-52 object-contain bg-secondary/30" /> : null}
              <button onClick={(e) => { e.stopPropagation(); onClear(); }}
                className="absolute top-2 left-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80">
                <X className="w-3.5 h-3.5 text-white" />
              </button>
              <div className="absolute top-2 right-2 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center">
                <Check className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
          ) : (
            <div className="p-6 flex flex-col items-center justify-center gap-2 text-center">
              <div className="w-12 h-12 bg-violet-100 rounded-2xl flex items-center justify-center">
                <Upload className="w-5 h-5 text-violet-600" />
              </div>
              <p className="text-sm font-bold text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="relative">
            <Link2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="url" value={url} onChange={(e) => onUrl(e.target.value)}
              placeholder={isVideo ? 'https://example.com/dance.mp4' : 'https://example.com/character.png'}
              className="w-full p-3 pr-10 border border-border rounded-xl focus:ring-2 focus:ring-violet-500/30 outline-none bg-secondary/50 text-sm" dir="ltr" />
          </div>
          {url.startsWith('http') && (
            <div className="mt-2 rounded-xl overflow-hidden bg-black/5 border border-border/40">
              {isVideo ? <video src={url} controls className="w-full max-h-48 object-contain bg-black" /> :
                <img src={url} alt="preview" className="w-full max-h-48 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function KlingMotionControl() {
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);

  const [imageInputMode, setImageInputMode] = useState<'upload' | 'url'>('upload');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState('');

  const [videoInputMode, setVideoInputMode] = useState<'upload' | 'url'>('upload');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState('');

  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [showNegative, setShowNegative] = useState(false);
  const [mode, setMode] = useState<'standard' | 'pro'>('standard');
  const [characterOrientation, setCharacterOrientation] = useState<'video' | 'image'>('video');
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');

  const [isGeneratingIdea, setIsGeneratingIdea] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [resultVideoUrl, setResultVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [missingKeyError, setMissingKeyError] = useState<MissingApiKeyError | null>(null);

  useEffect(() => { db.getAllCharacters().then(setCharacters); }, []);

  useEffect(() => {
    return () => {
      if (videoPreview?.startsWith('blob:')) URL.revokeObjectURL(videoPreview);
    };
  }, [videoPreview]);

  const hasImage = imageInputMode === 'upload' ? !!imageFile : imageUrl.startsWith('http');
  const hasVideo = videoInputMode === 'upload' ? !!videoFile : videoUrl.startsWith('http');
  const canGenerate = hasImage && hasVideo && prompt.trim();

  const handleSelectCharacter = (char: Character) => {
    const already = selectedCharacter?.id === char.id;
    setSelectedCharacter(already ? null : char);
    if (!already) {
      const img = getCharImage(char);
      if (img) {
        try {
          const byteString = atob(img.split(',')[1]);
          const mimeString = img.split(',')[0].split(':')[1].split(';')[0];
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
          const file = new File([ab], `${char.name}.png`, { type: mimeString });
          setImageFile(file); setImagePreview(img); setImageInputMode('upload');
        } catch {
          setImageUrl(img); setImageInputMode('url');
        }
      }
    }
  };

  const handleImageFile = (f: File) => {
    if (!f.type.startsWith('image/')) {
      setError('الملف المختار ليس صورة صالحة.');
      return;
    }
    if (f.size > MAX_IMAGE_MB * 1024 * 1024) {
      setError(`حجم الصورة كبير جدا. الحد الأقصى ${MAX_IMAGE_MB}MB.`);
      return;
    }
    setImageFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(f);
    setSelectedCharacter(null);
    setError(null);
  };

  const handleVideoFile = (f: File) => {
    if (!f.type.startsWith('video/')) {
      setError('الملف المختار ليس فيديو صالحا.');
      return;
    }
    if (f.size > MAX_VIDEO_MB * 1024 * 1024) {
      setError(`حجم الفيديو كبير جدا. الحد الأقصى ${MAX_VIDEO_MB}MB.`);
      return;
    }
    if (videoPreview?.startsWith('blob:')) URL.revokeObjectURL(videoPreview);
    setVideoFile(f);
    setVideoPreview(URL.createObjectURL(f));
    setError(null);
  };

  const generatePromptIdea = async () => {
    if (!selectedCharacter) return;
    setIsGeneratingIdea(true);
    try {
      const idea = await AIService.generateVideoIdeaFromCharacters({
        characters: [{ name: selectedCharacter.name, description: selectedCharacter.description || selectedCharacter.name, visualTraits: selectedCharacter.visualTraits || '' }],
        videoType: 'action', dialogueLanguage: 'English',
      });
      setPrompt(idea.prompt?.slice(0, 2500) || idea.description?.slice(0, 2500) || '');
    } catch (err: any) { alert(`فشل توليد الفكرة: ${err.message}`); }
    finally { setIsGeneratingIdea(false); }
  };

  // Upload a local file to kie.ai CDN via backend
  const uploadFile = async (file: File, statusMsg: string): Promise<string> => {
    setGenerationStatus(statusMsg);
    const formData = new FormData();
    formData.append('file', file);
    const uploadUrl = `${API}/api/fal/upload-file`;
    const resp = await fetch(uploadUrl, { method: 'POST', body: formData });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || `فشل رفع الملف: ${resp.status}`);
    }
    const data = await resp.json();
    return data.url;
  };

  const buildFinalPrompt = () => {
    const base = prompt.trim();
    if (!selectedCharacter) return base;
    const visual = selectedCharacter.visualTraits || selectedCharacter.description || '';
    return `${base}

Character lock instructions:
- Keep the exact identity of "${selectedCharacter.name}" from the reference image.
- Preserve face structure, hairstyle, skin tone, outfit design, and proportions.
- Avoid redesigning the character or changing age/gender/style.
- Visual notes: ${visual}`;
  };

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setIsGenerating(true); setError(null); setResultVideoUrl(null); setIsSaved(false);

    try {
      requireKieKey();

      // Upload files if needed
      let finalImageUrl = imageUrl;
      let finalVideoUrl = videoUrl;

      if (imageInputMode === 'upload' && imageFile) {
        finalImageUrl = await uploadFile(imageFile, `جاري رفع الصورة (${(imageFile.size / 1024 / 1024).toFixed(1)} MB)...`);
      }
      if (videoInputMode === 'upload' && videoFile) {
        finalVideoUrl = await uploadFile(videoFile, `جاري رفع الفيديو (${(videoFile.size / 1024 / 1024).toFixed(1)} MB)...`);
      }

      setGenerationStatus('جاري إرسال المهمة إلى Kling عبر fal.ai...');
      const modeValue = mode === 'pro' ? '1080p' : '720p';
      const klingUrl = `${API}/api/fal/kling-motion`;
      const createResp = await fetch(klingUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: buildFinalPrompt(), image_url: finalImageUrl, video_url: finalVideoUrl,
          mode: modeValue, character_orientation: characterOrientation,
          aspect_ratio: aspectRatio,
          negative_prompt: negativePrompt.trim(),
        }),
      });
      if (!createResp.ok) {
        const err = await createResp.json().catch(() => ({}));
        throw new Error(err.detail || `فشل إنشاء المهمة: ${createResp.status}`);
      }
      const { taskId } = await createResp.json();
      if (!taskId) throw new Error('لم يتم إرجاع معرف المهمة');

      // Poll for completion
      const startTime = Date.now();
      let videoResult = '';
      for (let i = 0; i < 180; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setGenerationStatus(`جاري توليد الفيديو... (${elapsed} ث)`);

        const statusUrl = `${API}/api/fal/kling-status/${taskId}`;
        const statusResp = await fetch(statusUrl);
        const statusData = await statusResp.json();

        if (statusData.status === 'completed' && statusData.videoUrl) {
          videoResult = statusData.videoUrl;
          break;
        } else if (statusData.status === 'failed') {
          throw new Error(statusData.error || 'فشل توليد الفيديو');
        }
      }

      if (!videoResult) throw new Error('انتهت مهلة التوليد');

      setResultVideoUrl(videoResult);
      setGenerationStatus('اكتمل التوليد!');

      const mediaItem: MediaItem = {
        id: `kling-${Date.now()}`, type: 'video',
        title: `Motion Control: ${selectedCharacter?.name || 'شخصية مخصصة'}`,
        description: prompt.slice(0, 200), data: videoResult,
        source: 'animation', characterName: selectedCharacter?.name, createdAt: Date.now(),
      };
      await db.saveMediaItem(mediaItem);
      setIsSaved(true);
    } catch (err: any) {
      if (err instanceof MissingApiKeyError) {
        setMissingKeyError(err);
      } else {
        setError(err.message || 'حدث خطا غير متوقع');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-4 max-w-lg mx-auto min-h-screen bg-background pb-32" data-testid="kling-motion-page">
      {missingKeyError && <ApiKeyMissing error={missingKeyError} onDismiss={() => setMissingKeyError(null)} />}
      <div className="flex items-center mb-5 pt-2">
        <button onClick={() => navigate(-1)} className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
        <div className="mr-2">
          <h1 className="text-lg font-bold flex items-center gap-2 text-foreground">
            <Video className="w-5 h-5 text-violet-500" />
            Motion Control
          </h1>
          <p className="text-[11px] text-muted-foreground">
            Kling 2.6 عبر fal.ai
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Step 1: Character Image */}
        <div className="bg-card p-4 rounded-2xl border border-border/60">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-card-foreground flex items-center gap-2 text-sm">
              <ImageIcon className="w-4 h-4 text-violet-500" /> 1. صورة الشخصية
            </h2>
            <div className="flex items-center gap-1.5 bg-secondary rounded-lg p-0.5">
              <button onClick={() => setImageInputMode('upload')}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition-all ${imageInputMode === 'upload' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}>
                <Upload className="w-3 h-3 inline ml-1" /> رفع
              </button>
              <button onClick={() => setImageInputMode('url')}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition-all ${imageInputMode === 'url' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}>
                <Link2 className="w-3 h-3 inline ml-1" /> رابط
              </button>
            </div>
          </div>
          {characters.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-muted-foreground mb-1.5">اختر من مكتبتك:</p>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {characters.map(char => {
                  const img = getCharImage(char);
                  const isSelected = selectedCharacter?.id === char.id;
                  return (
                    <button key={char.id} onClick={() => handleSelectCharacter(char)}
                      className={`relative rounded-xl overflow-hidden border-2 transition-all w-12 h-12 flex-shrink-0 ${isSelected ? 'border-violet-500 shadow-md' : 'border-border/60 hover:border-violet-300'}`}>
                      {img ? <img src={img} alt={char.name} className="w-full h-full object-cover" /> :
                        <div className="w-full h-full bg-secondary flex items-center justify-center"><Users className="w-3.5 h-3.5 text-muted-foreground/40" /></div>}
                      {isSelected && <div className="absolute inset-0 bg-violet-500/20 flex items-center justify-center"><Check className="w-3.5 h-3.5 text-violet-700 drop-shadow" /></div>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <DropZone accept="image/png,image/jpeg,image/webp" label="ارفع صورة الشخصية" hint="PNG، JPG، WebP — وجه واضح"
            file={imageFile} url={imageUrl} inputMode={imageInputMode} preview={imagePreview}
            onFile={handleImageFile} onUrl={setImageUrl} onClear={() => { setImageFile(null); setImagePreview(null); setSelectedCharacter(null); }} />
        </div>

        {/* Step 2: Driving Video */}
        <div className="bg-card p-4 rounded-2xl border border-border/60">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-card-foreground flex items-center gap-2 text-sm">
              <Play className="w-4 h-4 text-violet-500" /> 2. فيديو القيادة
            </h2>
            <div className="flex items-center gap-1.5 bg-secondary rounded-lg p-0.5">
              <button onClick={() => setVideoInputMode('upload')}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition-all ${videoInputMode === 'upload' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}>
                <Upload className="w-3 h-3 inline ml-1" /> رفع
              </button>
              <button onClick={() => setVideoInputMode('url')}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition-all ${videoInputMode === 'url' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}>
                <Link2 className="w-3 h-3 inline ml-1" /> رابط
              </button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
            فيديو يحتوي على الحركة المراد نقلها: رقص، مشي، تعابير وجه.
          </p>
          <DropZone accept="video/mp4,video/mov,video/avi,video/*" label="ارفع فيديو القيادة" hint="MP4، MOV — حتى 30 ثانية"
            file={videoFile} url={videoUrl} inputMode={videoInputMode} preview={videoPreview}
            onFile={handleVideoFile} onUrl={setVideoUrl} onClear={() => { setVideoFile(null); setVideoPreview(null); }} />
        </div>

        {/* Step 3: Orientation */}
        <div className="bg-card p-4 rounded-2xl border border-border/60">
          <h2 className="font-bold text-card-foreground mb-3 flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-violet-500" /> 3. نوع الحركة
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            {ORIENTATIONS.map(o => (
              <button key={o.value} onClick={() => setCharacterOrientation(o.value)}
                className={`py-3 px-3 rounded-xl border-2 text-right transition-all ${characterOrientation === o.value ? 'border-violet-500 bg-violet-50' : 'border-border bg-card hover:bg-secondary/50'}`}>
                <p className={`text-sm font-bold ${characterOrientation === o.value ? 'text-violet-700' : 'text-foreground'}`}>{o.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{o.desc}</p>
                <p className={`text-[10px] mt-1 font-bold ${characterOrientation === o.value ? 'text-violet-500' : 'text-muted-foreground/50'}`}>{o.sub}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Step 4: Prompt */}
        <div className="bg-card p-4 rounded-2xl border border-border/60">
          <h2 className="font-bold text-card-foreground mb-2 flex items-center gap-2 text-sm">
            <Wand2 className="w-4 h-4 text-violet-500" /> 4. وصف البيئة والسياق
          </h2>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
            className="w-full p-3 border border-border rounded-xl focus:ring-2 focus:ring-violet-500/30 outline-none bg-secondary/50 text-sm resize-none"
            rows={4} placeholder="A dancer on a neon-lit rooftop at night, cinematic lighting..." dir="ltr" maxLength={2500}
            data-testid="motion-prompt-input" />
          <div className="flex items-center justify-between mt-1.5">
            <button onClick={() => setShowNegative(!showNegative)}
              className="text-[10px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1">
              <Ban className="w-3 h-3" /> Negative Prompt
            </button>
            <span className="text-[10px] text-muted-foreground">{prompt.length}/2500</span>
          </div>
          {showNegative && (
            <textarea value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)}
              className="w-full mt-2 p-2.5 border border-border rounded-xl focus:ring-2 focus:ring-violet-500/30 outline-none bg-secondary/50 text-xs resize-none"
              rows={2} placeholder="blurry, distorted, watermark..." dir="ltr" />
          )}
          {selectedCharacter && (
            <button onClick={generatePromptIdea} disabled={isGeneratingIdea}
              className="mt-3 w-full py-2.5 bg-violet-50 border border-violet-200 text-violet-700 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-violet-100 disabled:opacity-50"
              data-testid="generate-prompt-btn">
              {isGeneratingIdea ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> جاري التوليد...</> :
                <><Sparkles className="w-3.5 h-3.5" /> توليد Prompt بالذكاء الاصطناعي</>}
            </button>
          )}
        </div>

        {/* Step 5: Video Settings */}
        <div className="bg-card p-4 rounded-2xl border border-border/60">
          <h2 className="font-bold text-card-foreground mb-3 flex items-center gap-2 text-sm">
            <Film className="w-4 h-4 text-violet-500" /> 5. جودة الفيديو
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {MODES.map(m => (
              <button key={m.id} onClick={() => setMode(m.id)}
                className={`py-2.5 rounded-xl border-2 text-sm font-bold flex flex-col items-center gap-0.5 transition-all ${
                  mode === m.id ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-border bg-card text-muted-foreground hover:bg-secondary/50'}`}
                data-testid={`mode-${m.id}`}>
                <span>{m.label}</span>
                <span className="text-[10px] font-normal opacity-70">{m.sub}</span>
              </button>
            ))}
          </div>

          <div className="mt-3">
            <p className="text-[11px] text-muted-foreground mb-2">الأبعاد</p>
            <div className="grid grid-cols-2 gap-2">
              {ASPECT_RATIOS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setAspectRatio(r.value)}
                  className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                    aspectRatio === r.value
                      ? 'border-violet-500 bg-violet-50 text-violet-700'
                      : 'border-border bg-card text-muted-foreground hover:bg-secondary/50'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3" data-testid="error-message">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-800">فشل التوليد</p>
                <p className="text-xs text-red-600 mt-1 leading-relaxed">{error}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Generation Status */}
        {isGenerating && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="bg-violet-50 border border-violet-200 rounded-2xl p-4" data-testid="generation-status">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="w-5 h-5 text-violet-600 animate-spin flex-shrink-0" />
              <p className="text-sm font-bold text-violet-800">جاري توليد الفيديو...</p>
            </div>
            <p className="text-xs text-violet-600 leading-relaxed mr-8">{generationStatus}</p>
            <div className="mt-3 bg-violet-100 rounded-full h-1.5 overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </motion.div>
        )}

        {/* Result */}
        <AnimatePresence>
          {resultVideoUrl && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-border/60 rounded-2xl overflow-hidden" data-testid="result-video">
              <video src={resultVideoUrl} controls autoPlay loop className="w-full bg-black" />
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-foreground">الفيديو جاهز</p>
                  {isSaved && <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full"><Check className="w-3 h-3" /> تم الحفظ</span>}
                </div>
                <a href={resultVideoUrl} download="kling-motion.mp4" target="_blank" rel="noreferrer"
                  className="w-full py-3 bg-violet-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-violet-700 active:scale-[0.98]"
                  data-testid="download-video-btn">
                  <Download className="w-4 h-4" /> تحميل الفيديو
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Generate Button - Fixed bottom */}
      <div className="fixed bottom-16 left-0 right-0 bg-card/95 backdrop-blur-xl border-t border-border/60 p-4 z-40">
        <div className="max-w-lg mx-auto">
          <button onClick={handleGenerate} disabled={!canGenerate || isGenerating}
            className="w-full py-3.5 bg-violet-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-violet-500/20 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            data-testid="generate-motion-btn">
            {isGenerating ? <><Loader2 className="w-5 h-5 animate-spin" /> {generationStatus || 'جاري التوليد...'}</> :
              <><Sparkles className="w-5 h-5" /> توليد Motion Control</>}
          </button>
        </div>
      </div>
    </div>
  );
}
