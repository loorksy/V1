import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ChevronRight, Loader2, Download, Youtube, Image as ImageIcon, RefreshCw, Upload, X, Wand2, Type as TypeIcon, ChevronDown, ChevronUp, Check, BookOpen, Copy, Hash } from 'lucide-react';
import { AIService } from '../lib/aiService';
import { MissingApiKeyError } from '../lib/aiProvider';
import { ApiKeyMissing } from '../components/ApiKeyMissing';
import { db, Character, MediaItem, Storyboard } from '../lib/db';
import { CustomSelect } from '../components/CustomSelect';
import { cn } from '../lib/utils';
import {
  facialExpressions,
  eyeExpressions,
  headShapes,
  bodyShapes,
  eyeColors,
  emotions,
  bodyPoses,
  channelNiches,
  videoTypes,
  brandColors,
  styles as allStyles,
  aspectRatios
} from '../lib/thumbnailOptions';

interface UploadedImage {
  id: string;
  dataUrl: string;
  name: string;
  type: 'character' | 'element';
}

interface ThumbnailAnalysis {
  critique: string;
  suggestedElements: string;
  suggestedText: string;
  suggestedStyle: string;
}

const THUMBNAIL_DRAFT_KEY = 'thumbnail_draft';

/** أول صورة متوفرة من شخصية (مرجعي: دعم كل أنواع الصور) */
function getCharacterThumb(char: Character): string {
  const imgs = char.images as Record<string, string | undefined>;
  return imgs.front || imgs.reference || imgs.threeQuarter || imgs.closeup || imgs.left || imgs.right || imgs.normal || '';
}

export default function ThumbnailCreate() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'input' | 'generating' | 'review'>('input');
  const [mode, setMode] = useState<'create' | 'enhance' | 'from_story'>('create');
  const [hasDraft, setHasDraft] = useState(false);
  
  // Form State
  const [title, setTitle] = useState('');
  const [elements, setElements] = useState('');
  const [style, setStyle] = useState(allStyles[0]);
  const [background, setBackground] = useState('');
  const [imageText, setImageText] = useState('');
  const [baseThumbnail, setBaseThumbnail] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [thumbnailAnalysis, setThumbnailAnalysis] = useState<ThumbnailAnalysis | null>(null);
  
  // New state variables for advanced options
  const [facialExpression, setFacialExpression] = useState('');
  const [eyeExpression, setEyeExpression] = useState('');
  const [headShape, setHeadShape] = useState('');
  const [bodyShape, setBodyShape] = useState('');
  const [eyeColor, setEyeColor] = useState('');
  const [emotion, setEmotion] = useState('');
  const [bodyPose, setBodyPose] = useState('');
  const [channelNiche, setChannelNiche] = useState(channelNiches[0]);
  const [videoType, setVideoType] = useState(videoTypes[0]);
  const [brandColor, setBrandColor] = useState(brandColors[0]);
  const [aspectRatio, setAspectRatio] = useState(aspectRatios[0]);

  // Accordion state
  const [openSection, setOpenSection] = useState<'video' | 'character' | 'design'>('video');
  
  // Multi-select state
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  
  const [characters, setCharacters] = useState<Character[]>([]);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [thumbnailSaved, setThumbnailSaved] = useState(false);

  // Story mode state
  const [storyboards, setStoryboards] = useState<Storyboard[]>([]);
  const [selectedStoryId, setSelectedStoryId] = useState<string>('');
  const [storyMetadata, setStoryMetadata] = useState<{
    videoTitle: string;
    videoDescription: string;
    hashtags: string;
  } | null>(null);
  const [isAnalyzingStory, setIsAnalyzingStory] = useState(false);
  const [missingKeyError, setMissingKeyError] = useState<MissingApiKeyError | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const baseThumbInputRef = useRef<HTMLInputElement>(null);
  const [uploadType, setUploadType] = useState<'character' | 'element'>('character');

  useEffect(() => {
    loadCharacters();
    loadStoryboards();
    try {
      const raw = sessionStorage.getItem(THUMBNAIL_DRAFT_KEY);
      setHasDraft(Boolean(raw && JSON.parse(raw)));
    } catch {
      setHasDraft(false);
    }
  }, []);

  useEffect(() => {
    if (step !== 'input') return;
    const payload = {
      mode,
      title,
      elements,
      style,
      background,
      imageText,
      selectedCharIds,
      aspectRatio,
      selectedStoryId: mode === 'from_story' ? selectedStoryId : '',
    };
    sessionStorage.setItem(THUMBNAIL_DRAFT_KEY, JSON.stringify(payload));
    setHasDraft(true);
  }, [step, mode, title, elements, style, background, imageText, selectedCharIds, aspectRatio, selectedStoryId]);

  // عند الاستئناف في وضع "من القصة": تحميل metadata إذا كانت القوائم جاهزة
  useEffect(() => {
    if (mode !== 'from_story' || !selectedStoryId || !storyboards.length || storyMetadata) return;
    const story = storyboards.find((s) => s.id === selectedStoryId);
    if (story) void selectStory(story.id);
  }, [mode, selectedStoryId, storyboards, storyMetadata]);

  async function loadCharacters() {
    const chars = await db.getAllCharacters();
    setCharacters(chars.sort((a, b) => b.createdAt - a.createdAt));
  }

  async function loadStoryboards() {
    const sbs = await db.getAllStoryboards();
    setStoryboards(sbs.sort((a, b) => b.createdAt - a.createdAt));
  }

  const selectStory = async (storyId: string) => {
    setSelectedStoryId(storyId);
    const story = storyboards.find(s => s.id === storyId);
    if (!story) return;

    setIsAnalyzingStory(true);
    try {
      // Auto-select characters used in this story
      const charIds = [...new Set(story.scenes.flatMap(s => s.characterIds || []))];
      if (charIds.length > 0) {
        setSelectedCharIds(charIds);
      } else if (story.characters?.length) {
        setSelectedCharIds(story.characters);
      }

      // Use AI to analyze story and generate metadata
      const metadata = await AIService.generateStoryMetadata(story);
      setStoryMetadata(metadata);
      setTitle(metadata.videoTitle);
      setImageText(metadata.videoTitle);
    } catch (e: any) {
      if (e instanceof MissingApiKeyError) { setMissingKeyError(e); }
      else { console.error('Failed to analyze story:', e); }
    } finally {
      setIsAnalyzingStory(false);
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const toggleCharacterSelection = (id: string) => {
    setSelectedCharIds(prev => 
      prev.includes(id) ? prev.filter(charId => charId !== id) : [...prev, id]
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const newImage: UploadedImage = {
        id: Date.now().toString(),
        dataUrl: reader.result as string,
        name: file.name.split('.')[0],
        type: uploadType
      };
      setUploadedImages(prev => [...prev, newImage]);
    };
    reader.readAsDataURL(file);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeUploadedImage = (id: string) => {
    setUploadedImages(prev => prev.filter(img => img.id !== id));
  };

  const triggerUpload = (type: 'character' | 'element') => {
    setUploadType(type);
    fileInputRef.current?.click();
  };

  const resumeDraft = () => {
    try {
      const raw = sessionStorage.getItem(THUMBNAIL_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.mode) setMode(draft.mode);
      if (draft.title != null) setTitle(draft.title);
      if (draft.elements != null) setElements(draft.elements);
      if (draft.style) setStyle(draft.style);
      if (draft.background != null) setBackground(draft.background);
      if (draft.imageText != null) setImageText(draft.imageText);
      if (draft.selectedCharIds?.length) setSelectedCharIds(draft.selectedCharIds);
      if (draft.aspectRatio) setAspectRatio(draft.aspectRatio);
      if (draft.selectedStoryId && draft.mode === 'from_story') {
        setSelectedStoryId(draft.selectedStoryId);
        const story = storyboards.find((s) => s.id === draft.selectedStoryId);
        if (story) selectStory(story.id);
      }
      setStep('input');
      setHasDraft(true);
    } catch {
      setHasDraft(false);
    }
  };

  const startNewDraft = () => {
    sessionStorage.removeItem(THUMBNAIL_DRAFT_KEY);
    setHasDraft(false);
    setTitle('');
    setElements('');
    setImageText('');
    setBackground('');
    setSelectedCharIds([]);
    setBaseThumbnail(null);
    setThumbnailAnalysis(null);
    setSelectedStoryId('');
    setStoryMetadata(null);
  };

  const handleBaseThumbUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setBaseThumbnail(base64);
      
      // Trigger analysis
      setAnalysisLoading(true);
      setThumbnailAnalysis(null);
      try {
        const analysis = await AIService.analyzeThumbnail(base64);
        setThumbnailAnalysis(analysis);
      } catch (err: any) {
        console.error('Thumbnail analysis failed:', err);
        alert(err?.message ? `فشل تحليل الصورة المصغرة: ${err.message}` : 'تعذر تحليل الصورة المصغرة. تأكد من اتصال الخادم ومفتاح fal.ai ثم أعد المحاولة.');
      } finally {
        setAnalysisLoading(false);
      }
    };
    reader.readAsDataURL(file);
    
    if (baseThumbInputRef.current) {
      baseThumbInputRef.current.value = '';
    }
  };

  const startGeneration = async () => {
    if (mode === 'enhance' && !baseThumbnail) {
      alert('الرجاء رفع صورة الأساس أولاً للتحسين.');
      return;
    }
    if (mode === 'from_story' && !selectedStoryId) {
      alert('الرجاء اختيار قصة أولاً.');
      return;
    }

    setIsProcessing(true);
    setStep('generating');
    
    try {
      // Helper to convert URL to base64
      const toBase64 = async (img: string): Promise<string> => {
        if (!img) return '';
        if (img.length > 200) return img;
        try {
          const resp = await fetch(img.startsWith('/') ? `${window.location.origin}${img}` : img);
          const blob = await resp.blob();
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch { return ''; }
      };

      // Gather all reference images
      const referenceImages: { name: string; dataUrl: string }[] = [];
      
      // 1. Add selected DB characters (convert URLs to base64) — مرجعي: أي صورة متوفرة
      for (const id of selectedCharIds) {
        const char = characters.find(c => c.id === id);
        const src = char ? getCharacterThumb(char) : '';
        if (char && src) {
          const b64 = await toBase64(src);
          if (b64) referenceImages.push({ name: char.name, dataUrl: b64 });
        }
      }

      // 2. Add uploaded character images
      uploadedImages.filter(img => img.type === 'character').forEach(img => {
        referenceImages.push({ name: img.name, dataUrl: img.dataUrl });
      });

      // Gather element images
      const elementImages = uploadedImages
        .filter(img => img.type === 'element')
        .map(img => ({ name: img.name, dataUrl: img.dataUrl }));

      // Append uploaded element names to the elements text prompt
      const uploadedElementNames = uploadedImages
        .filter(img => img.type === 'element')
        .map(img => img.name)
        .join('، ');
        
      const finalElementsText = [elements, uploadedElementNames].filter(Boolean).join('، ');

      // For from_story mode, use story context as the prompt
      let thumbTitle = title;
      let thumbStyle = style;
      let thumbElements = finalElementsText;
      let thumbBackground = background;
      if (mode === 'from_story' && storyMetadata) {
        thumbTitle = storyMetadata.videoTitle;
        thumbStyle = 'أطفال يوتيوب (Kids YouTube)';
        const story = storyboards.find(s => s.id === selectedStoryId);
        thumbElements = story?.script?.slice(0, 200) || '';
        thumbBackground = 'خلفية مشرقة بألوان باستيل دافئة مناسبة للأطفال';
      }

      const image = await AIService.generateThumbnail({
        title: thumbTitle,
        style: thumbStyle,
        elements: thumbElements,
        background: thumbBackground,
        referenceImages,
        elementImages,
        baseThumbnail: mode === 'enhance' ? baseThumbnail || undefined : undefined,
        imageText: imageText || undefined,
        facialExpression,
        eyeExpression,
        headShape,
        bodyShape,
        eyeColor,
        emotion,
        bodyPose,
        channelNiche,
        videoType,
        brandColors: brandColor,
        aspectRatio
      });
      
      setGeneratedImage(image);
      setStep('review');

      // Auto-save to media gallery
      const mediaItem: MediaItem = {
        id: `thumb-${Date.now()}`,
        type: 'thumbnail',
        title: mode === 'from_story' && storyMetadata
          ? `صورة مصغرة: ${storyMetadata.videoTitle}`
          : title ? `صورة مصغرة: ${title}` : `صورة مصغرة - ${style.split(' (')[0]}`,
        description: mode === 'from_story' && storyMetadata
          ? `${storyMetadata.videoDescription}\n\n${storyMetadata.hashtags}`
          : `${style} | ${elements || 'بدون عناصر إضافية'}`,
        data: image,
        source: 'thumbnail',
        aspectRatio,
        createdAt: Date.now(),
      };
      await db.saveMediaItem(mediaItem);
      setThumbnailSaved(true);
      sessionStorage.removeItem(THUMBNAIL_DRAFT_KEY);
      setHasDraft(false);
    } catch (error: any) {
      if (error instanceof MissingApiKeyError) { setMissingKeyError(error); }
      else { console.error(error); alert(`فشل التوليد: ${error.message}`); }
      setStep('input');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadImage = () => {
    if (!generatedImage) return;
    const a = document.createElement('a');
    a.href = generatedImage;
    a.download = `thumbnail-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="p-4 max-w-lg mx-auto min-h-screen bg-background pb-32">
      {missingKeyError && <ApiKeyMissing error={missingKeyError} onDismiss={() => setMissingKeyError(null)} />}
      {/* Hidden File Input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept="image/*" 
        className="hidden" 
      />
      <input 
        type="file" 
        ref={baseThumbInputRef} 
        onChange={handleBaseThumbUpload} 
        accept="image/*" 
        className="hidden" 
      />

      {/* Header */}
      <div className="flex items-center mb-6 pt-2">
        <button onClick={() => navigate(-1)} className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold mr-2 flex items-center gap-2 text-foreground">
          <Youtube className="w-5 h-5 text-red-600" />
          صورة مصغرة (Thumbnail)
        </h1>
      </div>

      {step === 'input' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
          
          {/* Mode Toggle */}
          <div className="flex bg-slate-100 p-1.5 rounded-xl">
            <button 
              onClick={() => setMode('create')} 
              className={cn(
                "flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1", 
                mode === 'create' ? "bg-white shadow-sm text-red-600" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Sparkles className="w-3 h-3" />
              من الصفر
            </button>
            <button 
              onClick={() => setMode('from_story' as any)} 
              className={cn(
                "flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1", 
                mode === 'from_story' ? "bg-white shadow-sm text-red-600" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <BookOpen className="w-3 h-3" />
              من القصة
            </button>
            <button 
              onClick={() => setMode('enhance')} 
              className={cn(
                "flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1", 
                mode === 'enhance' ? "bg-white shadow-sm text-red-600" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Wand2 className="w-3 h-3" />
              تحسين
            </button>
          </div>

          {hasDraft && (
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-center justify-between">
              <span className="text-xs text-amber-800 font-medium">لديك مسودة صورة مصغرة محفوظة</span>
              <div className="flex gap-2">
                <button type="button" onClick={resumeDraft} className="px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600">
                  استئناف
                </button>
                <button type="button" onClick={startNewDraft} className="px-3 py-1.5 bg-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-300">
                  تجاهل
                </button>
              </div>
            </div>
          )}

          <div className="bg-red-50 border border-red-100 p-4 rounded-xl text-sm text-red-800 leading-relaxed">
            {mode === 'create'
              ? 'صمم صورة مصغرة جذابة (Clickbait) لفيديو اليوتيوب الخاص بك.'
              : mode === 'from_story'
                ? 'اختر قصة وسيقوم الذكاء الاصطناعي بتحليلها وإنشاء صورة مصغرة + عنوان + وصف + هاشتاقات تلقائياً.'
                : 'ارفع صورة مصغرة جاهزة وسيقوم الذكاء الاصطناعي بتحسينها.'}
          </div>

          <div className="space-y-6">
            {/* Story Selection (From Story Mode) */}
            {mode === 'from_story' && (
              <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 space-y-3">
                <label className="block text-sm font-bold text-indigo-800 flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  اختر القصة
                </label>
                {storyboards.length === 0 ? (
                  <p className="text-xs text-slate-500">لا توجد قصص محفوظة. أنشئ قصة أولاً.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {storyboards.map(sb => (
                      <button
                        key={sb.id}
                        onClick={() => selectStory(sb.id)}
                        className={cn(
                          "w-full text-right p-3 rounded-lg border transition-all text-sm",
                          selectedStoryId === sb.id
                            ? "border-indigo-500 bg-indigo-100 text-indigo-800 font-bold"
                            : "border-slate-200 bg-white hover:border-indigo-300 text-slate-700"
                        )}
                      >
                        <div className="font-medium">{sb.title}</div>
                        <div className="text-xs text-slate-500 mt-1">{sb.scenes.length} مشهد</div>
                      </button>
                    ))}
                  </div>
                )}

                {isAnalyzingStory && (
                  <div className="flex items-center gap-2 text-xs text-indigo-600 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    جاري تحليل القصة وتوليد البيانات...
                  </div>
                )}

                {/* Story Metadata Output */}
                {storyMetadata && (
                  <div className="space-y-3 bg-white p-4 rounded-lg border border-indigo-100">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-slate-700">عنوان الفيديو (Hook)</label>
                        <button onClick={() => copyText(storyMetadata.videoTitle)} className="text-xs text-indigo-600 flex items-center gap-1">
                          <Copy className="w-3 h-3" /> نسخ
                        </button>
                      </div>
                      <p className="text-sm text-slate-800 bg-yellow-50 p-2 rounded border border-yellow-100 font-medium">{storyMetadata.videoTitle}</p>
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-slate-700">وصف الفيديو</label>
                        <button onClick={() => copyText(storyMetadata.videoDescription)} className="text-xs text-indigo-600 flex items-center gap-1">
                          <Copy className="w-3 h-3" /> نسخ
                        </button>
                      </div>
                      <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 whitespace-pre-wrap leading-relaxed">{storyMetadata.videoDescription}</p>
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1"><Hash className="w-3 h-3" /> هاشتاقات</label>
                        <button onClick={() => copyText(storyMetadata.hashtags)} className="text-xs text-indigo-600 flex items-center gap-1">
                          <Copy className="w-3 h-3" /> نسخ
                        </button>
                      </div>
                      <p className="text-xs text-blue-600 bg-blue-50 p-2 rounded border border-blue-100">{storyMetadata.hashtags}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Base Thumbnail Upload (Enhance Mode Only) */}
            {mode === 'enhance' && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4">
                <label className="block text-sm font-bold text-slate-700 flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-indigo-500" />
                  صورة الأساس (مطلوب)
                </label>
                {baseThumbnail ? (
                  <div className="space-y-4">
                    <div className="relative aspect-video rounded-xl overflow-hidden border-2 border-indigo-500 shadow-md group">
                      <img src={baseThumbnail} alt="Base Thumbnail" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button 
                          onClick={() => baseThumbInputRef.current?.click()}
                          className="bg-white text-slate-900 px-4 py-2 rounded-lg font-bold text-sm shadow-lg hover:bg-slate-50"
                        >
                          تغيير الصورة
                        </button>
                      </div>
                    </div>
                    
                    {/* Analysis Section */}
                    <div className="bg-white p-4 rounded-lg border border-indigo-100 shadow-sm animate-in fade-in slide-in-from-top-2">
                      <h4 className="font-bold text-indigo-900 mb-3 flex items-center gap-2 text-sm">
                        <Sparkles className="w-4 h-4 text-indigo-500" />
                        تحليل الذكاء الاصطناعي
                      </h4>
                      {!thumbnailAnalysis && !analysisLoading && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!baseThumbnail) return;
                            setAnalysisLoading(true);
                            setThumbnailAnalysis(null);
                            try {
                              const analysis = await AIService.analyzeThumbnail(baseThumbnail);
                              setThumbnailAnalysis(analysis);
                            } catch (err: any) {
                              console.error('Thumbnail analysis failed:', err);
                              alert(err?.message ? `فشل تحليل الصورة المصغرة: ${err.message}` : 'تعذر تحليل الصورة. تأكد من اتصال الخادم ومفتاح fal.ai ثم أعد المحاولة.');
                            } finally {
                              setAnalysisLoading(false);
                            }
                          }}
                          disabled={analysisLoading}
                          className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-bold text-xs hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 mb-3"
                        >
                          {analysisLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                          تحليل الصورة (Image Analysis)
                        </button>
                      )}
                      {analysisLoading ? (
                        <div className="flex items-center gap-3 text-slate-500 text-xs p-2">
                          <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                          جاري تحليل الصورة واقتراح تحسينات...
                        </div>
                      ) : thumbnailAnalysis ? (
                        <div className="space-y-3">
                          <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap p-3 bg-indigo-50/50 rounded-md border border-indigo-50">
                            <span className="font-bold block mb-1 text-indigo-900">التقييم:</span>
                            {thumbnailAnalysis.critique}
                          </div>
                          
                          <div className="text-xs text-slate-600 space-y-2 p-2 bg-slate-50 rounded-md border border-slate-100">
                            <p><span className="font-bold text-slate-800">عناصر مقترحة:</span> {thumbnailAnalysis.suggestedElements}</p>
                            <p><span className="font-bold text-slate-800">نص مقترح:</span> {thumbnailAnalysis.suggestedText}</p>
                            <p><span className="font-bold text-slate-800">أسلوب مقترح:</span> {thumbnailAnalysis.suggestedStyle}</p>
                          </div>

                          <button
                            onClick={() => {
                              setElements(thumbnailAnalysis.suggestedElements);
                              setImageText(thumbnailAnalysis.suggestedText);
                              setStyle(thumbnailAnalysis.suggestedStyle);
                            }}
                            className="w-full py-2.5 bg-indigo-100 text-indigo-700 rounded-lg font-bold text-xs hover:bg-indigo-200 transition-colors flex items-center justify-center gap-2 shadow-sm"
                          >
                            <Wand2 className="w-4 h-4" />
                            تطبيق التحسينات المقترحة
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={() => baseThumbInputRef.current?.click()}
                    className="w-full aspect-video rounded-xl border-2 border-dashed border-slate-300 bg-white hover:bg-slate-50 hover:border-indigo-400 transition-all flex flex-col items-center justify-center gap-3 text-slate-500 hover:text-indigo-600"
                  >
                    <Upload className="w-8 h-8" />
                    <span className="font-medium">اضغط لرفع الصورة المصغرة</span>
                    <span className="text-xs text-slate-400">سيتم تحسينها وتعديلها بناءً على خياراتك</span>
                  </button>
                )}
              </div>
            )}

            {/* Character Selection */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div className="flex justify-between items-center mb-4">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-indigo-500" />
                  الشخصيات (يمكنك اختيار أكثر من واحدة)
                </label>
              </div>
              
              <div className="flex gap-3 overflow-x-auto pb-3 snap-x scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent items-start">
                {/* Upload Button */}
                <div className="flex flex-col items-center gap-2 flex-shrink-0 w-20 snap-center">
                  <button 
                    onClick={() => triggerUpload('character')}
                    className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 bg-white hover:bg-slate-50 hover:border-indigo-400 transition-all flex flex-col items-center justify-center gap-1 text-slate-500 hover:text-indigo-600 group"
                  >
                    <Upload className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
                    <span className="text-[10px] font-medium">رفع صورة</span>
                  </button>
                </div>

                {/* Uploaded Characters */}
                {uploadedImages.filter(img => img.type === 'character').map(img => (
                  <div key={img.id} className="flex flex-col items-center gap-2 flex-shrink-0 w-20 snap-center">
                    <div className="relative w-20 h-20 rounded-xl border-2 border-indigo-500 shadow-md group">
                      <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover rounded-lg" />
                      <button 
                        onClick={() => removeUploadedImage(img.id)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-red-600 z-10"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <div className="absolute -top-2 -left-2 bg-indigo-500 text-white rounded-full p-1 shadow-sm z-10">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </div>
                    <input 
                      type="text" 
                      value={img.name}
                      onChange={(e) => {
                        setUploadedImages(prev => prev.map(p => p.id === img.id ? {...p, name: e.target.value} : p));
                      }}
                      className="text-[10px] text-center border border-slate-200 rounded px-1 py-1 w-full focus:ring-1 focus:ring-indigo-500 outline-none"
                      placeholder="اسم الشخصية"
                    />
                  </div>
                ))}

                {/* DB Characters */}
                {characters.map(char => {
                  const isSelected = selectedCharIds.includes(char.id);
                  return (
                    <div key={char.id} className="flex flex-col items-center gap-2 flex-shrink-0 w-20 snap-center">
                      <button
                        onClick={() => toggleCharacterSelection(char.id)}
                        className={cn(
                          "w-20 h-20 rounded-xl border-2 overflow-hidden transition-all relative group",
                          isSelected 
                            ? "border-indigo-500 shadow-md ring-2 ring-indigo-500/20 ring-offset-1" 
                            : "border-slate-200 hover:border-indigo-300 hover:shadow-sm opacity-80 hover:opacity-100"
                        )}
                      >
                        <img src={getCharacterThumb(char)} alt={char.name} className="w-full h-full object-cover" />
                        {isSelected && (
                          <>
                            <div className="absolute inset-0 bg-indigo-500/10 transition-colors"></div>
                            <div className="absolute -top-2 -left-2 bg-indigo-500 text-white rounded-full p-1 shadow-sm">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          </>
                        )}
                      </button>
                      <span className="text-[10px] text-slate-600 truncate w-full text-center font-medium px-1" title={char.name}>
                        {char.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Text in Image */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-2">
                <TypeIcon className="w-4 h-4 text-indigo-500" />
                النص المكتوب في الصورة (اختياري)
              </label>
              <p className="text-xs text-slate-500 mb-3">
                {mode === 'enhance' ? 'سيتم استبدال النص القديم في الصورة بهذا النص.' : 'سيتم كتابة هذا النص بخط يوتيوب عريض ومجسم.'}
              </p>
              <input 
                type="text" 
                value={imageText} 
                onChange={(e) => setImageText(e.target.value)} 
                className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-red-500" 
                placeholder="مثال: لن تصدق ما حدث! 😱" 
              />
            </div>

            {mode === 'create' && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">فكرة الفيديو / العنوان</label>
                <input 
                  type="text" 
                  value={title} 
                  onChange={(e) => setTitle(e.target.value)} 
                  className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-red-500" 
                  placeholder="مثال: كيف ربحت مليون دولار في يومين..." 
                />
              </div>
            )}

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-bold text-slate-700">عناصر إضافية في الصورة</label>
                <button 
                  onClick={() => triggerUpload('element')}
                  className="text-xs bg-white border border-slate-200 px-2 py-1 rounded-md shadow-sm hover:bg-slate-50 flex items-center gap-1 text-slate-600"
                >
                  <Upload className="w-3 h-3" /> رفع عنصر
                </button>
              </div>
              
              {/* Uploaded Elements */}
              {uploadedImages.filter(img => img.type === 'element').length > 0 && (
                <div className="flex gap-2 flex-wrap mb-3">
                  {uploadedImages.filter(img => img.type === 'element').map(img => (
                    <div key={img.id} className="relative flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1 pr-2 shadow-sm">
                      <img src={img.dataUrl} alt={img.name} className="w-8 h-8 object-cover rounded-md" />
                      <input 
                        type="text" 
                        value={img.name}
                        onChange={(e) => {
                          setUploadedImages(prev => prev.map(p => p.id === img.id ? {...p, name: e.target.value} : p));
                        }}
                        className="text-xs outline-none w-20 bg-transparent"
                        placeholder="اسم العنصر"
                      />
                      <button onClick={() => removeUploadedImage(img.id)} className="text-slate-400 hover:text-red-500">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <input 
                type="text" 
                value={elements} 
                onChange={(e) => setElements(e.target.value)} 
                className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-red-500" 
                placeholder="مثال: حقائب أموال تتطاير، سهم أحمر صاعد..." 
              />
            </div>

            {mode !== 'from_story' && (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">أسلوب التصميم (ستايل القناة)</label>
              <CustomSelect 
                value={style} 
                onChange={setStyle} 
                options={allStyles} 
                className="p-3 rounded-xl text-sm focus:ring-2 focus:ring-red-500" 
              />
            </div>
            )}

            {mode === 'create' && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">الخلفية</label>
                <input 
                  type="text"
                  value={background} 
                  onChange={(e) => setBackground(e.target.value)} 
                  className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-red-500" 
                  placeholder="مثال: غرفة مظلمة مع إضاءة نيون ��رقاء..."
                />
              </div>
            )}

            {mode !== 'from_story' && (
            <div className="space-y-3 mt-6">
              <h3 className="font-bold text-slate-800 border-b pb-2">إعدادات متقدمة (اختياري)</h3>
              
              {/* Video & Channel Settings */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setOpenSection(openSection === 'video' ? '' as any : 'video')}
                  className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <span className="font-bold text-sm text-slate-700">إعدادات القناة والفيديو</span>
                  {openSection === 'video' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {openSection === 'video' && (
                  <div className="p-4 bg-white space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">نيش القناة (Niche)</label>
                      <CustomSelect value={channelNiche} onChange={setChannelNiche} options={channelNiches} className="p-3 rounded-xl text-sm focus:ring-2 focus:ring-red-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">نوع الفيديو</label>
                      <CustomSelect value={videoType} onChange={setVideoType} options={videoTypes} className="p-3 rounded-xl text-sm focus:ring-2 focus:ring-red-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">ألوان الهوية البصرية (Brand Colors)</label>
                      <CustomSelect value={brandColor} onChange={setBrandColor} options={brandColors} className="p-3 rounded-xl text-sm focus:ring-2 focus:ring-red-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">أبعاد الصورة</label>
                      <CustomSelect value={aspectRatio} onChange={setAspectRatio} options={aspectRatios} className="p-3 rounded-xl text-sm focus:ring-2 focus:ring-red-500" />
                    </div>
                  </div>
                )}
              </div>

              {/* Character Settings */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setOpenSection(openSection === 'character' ? '' as any : 'character')}
                  className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <span className="font-bold text-sm text-slate-700">إعدادات الشخصية (إذا وجدت)</span>
                  {openSection === 'character' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {openSection === 'character' && (
                  <div className="p-4 bg-white grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">تعابير الوجه</label>
                      <CustomSelect value={facialExpression} onChange={setFacialExpression} options={['', ...facialExpressions]} placeholder="اختر أو اترك فارغاً" className="p-3 rounded-xl text-sm focus:ring-2 focus:ring-red-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">المشاعر</label>
                      <CustomSelect value={emotion} onChange={setEmotion} options={['', ...emotions]} placeholder="اختر أو اترك فارغاً" className="p-3 rounded-xl text-sm focus:ring-2 focus:ring-red-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">تعابير العيون</label>
                      <CustomSelect value={eyeExpression} onChange={setEyeExpression} options={['', ...eyeExpressions]} placeholder="اختر أو اترك فارغاً" className="p-3 rounded-xl text-sm focus:ring-2 focus:ring-red-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">لون العيون</label>
                      <CustomSelect value={eyeColor} onChange={setEyeColor} options={['', ...eyeColors]} placeholder="اختر أو اترك فارغاً" className="p-3 rounded-xl text-sm focus:ring-2 focus:ring-red-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">شكل الرأس</label>
                      <CustomSelect value={headShape} onChange={setHeadShape} options={['', ...headShapes]} placeholder="اختر أو اترك فارغاً" className="p-3 rounded-xl text-sm focus:ring-2 focus:ring-red-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">شكل الجسم</label>
                      <CustomSelect value={bodyShape} onChange={setBodyShape} options={['', ...bodyShapes]} placeholder="اختر أو اترك فارغاً" className="p-3 rounded-xl text-sm focus:ring-2 focus:ring-red-500" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-bold text-slate-700 mb-1">وضع الجسم (Pose)</label>
                      <CustomSelect value={bodyPose} onChange={setBodyPose} options={['', ...bodyPoses]} placeholder="اختر أو اترك فارغاً" className="p-3 rounded-xl text-sm focus:ring-2 focus:ring-red-500" />
                    </div>
                  </div>
                )}
              </div>
            </div>
            )}
          </div>

          <button
            onClick={startGeneration}
            disabled={
              isProcessing ||
              (mode === 'from_story' && (!selectedStoryId || isAnalyzingStory || !storyMetadata)) ||
              (mode === 'enhance' && !baseThumbnail)
            }
            className="w-full py-4 bg-red-600 text-white rounded-xl font-bold shadow-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-8"
          >
            {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : mode === 'enhance' ? <Wand2 className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
            <span>{mode === 'from_story' ? 'توليد صورة مصغرة للقصة' : mode === 'enhance' ? 'تحسين الصورة المصغرة (Image Enhancement)' : 'توليد من الصفر (Generate from Scratch)'}</span>
          </button>
        </div>
      )}

      {step === 'generating' && (
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-6 text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-red-500 blur-xl opacity-20 animate-pulse rounded-full"></div>
            <Loader2 className="w-16 h-16 text-red-600 animate-spin relative z-10" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">جاري تصميم الـ Thumbnail...</h3>
            <p className="text-slate-500 mt-2">نطبق أساليب القنوات المشهورة لجذب المشاهدات</p>
          </div>
        </div>
      )}

      {step === 'review' && generatedImage && (
        <div className="space-y-6 animate-in fade-in zoom-in-95">
          {thumbnailSaved && (
            <div className="flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-600 bg-emerald-50 px-3 py-2 rounded-xl">
              <Check className="w-4 h-4" />
              تم حفظ الصورة تلقائيا في المعرض
            </div>
          )}
          <div className="aspect-video rounded-2xl overflow-hidden shadow-xl border border-slate-200 bg-slate-100">
            <img src={generatedImage} className="w-full h-full object-cover" alt="Generated Thumbnail" />
          </div>

          {/* Show metadata for from_story mode */}
          {mode === 'from_story' && storyMetadata && (
            <div className="space-y-3 bg-white p-4 rounded-xl border border-indigo-100 shadow-sm">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-slate-700">عنوان الفيديو (Hook)</label>
                  <button onClick={() => copyText(storyMetadata.videoTitle)} className="text-xs text-indigo-600 flex items-center gap-1">
                    <Copy className="w-3 h-3" /> نسخ
                  </button>
                </div>
                <p className="text-sm text-slate-800 bg-yellow-50 p-2 rounded border border-yellow-100 font-medium">{storyMetadata.videoTitle}</p>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-slate-700">وصف الفيديو</label>
                  <button onClick={() => copyText(storyMetadata.videoDescription)} className="text-xs text-indigo-600 flex items-center gap-1">
                    <Copy className="w-3 h-3" /> نسخ
                  </button>
                </div>
                <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 whitespace-pre-wrap leading-relaxed">{storyMetadata.videoDescription}</p>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1"><Hash className="w-3 h-3" /> هاشتاقات</label>
                  <button onClick={() => copyText(storyMetadata.hashtags)} className="text-xs text-indigo-600 flex items-center gap-1">
                    <Copy className="w-3 h-3" /> نسخ
                  </button>
                </div>
                <p className="text-xs text-blue-600 bg-blue-50 p-2 rounded border border-blue-100">{storyMetadata.hashtags}</p>
              </div>
            </div>
          )}

          <div className="bg-slate-50 p-4 rounded-xl">
            <h4 className="font-medium text-sm mb-2 text-slate-900">تفاصيل التصميم:</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              الأسلوب: {style.split(' (')[0]}<br/>
              العناصر: {elements || 'بدون'}<br/>
              الخلفية: {background}
            </p>
          </div>

          <div className="flex flex-col gap-3 pb-8">
            <button
              onClick={downloadImage}
              className="w-full py-4 bg-red-600 text-white rounded-xl font-bold shadow-lg hover:bg-red-700 flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-5 h-5" />
              <span>تنزيل الصورة (16:9)</span>
            </button>
            <button
              onClick={startGeneration}
              disabled={isProcessing}
              className="w-full py-3 bg-red-50 text-red-700 rounded-xl font-bold shadow-sm hover:bg-red-100 flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
              <span>إعادة توليد بنتيجة مختلفة</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
