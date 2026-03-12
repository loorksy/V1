import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Sparkles, Check, ChevronRight, Loader2, User, Download, RefreshCw, X, Camera, Image } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { AIService } from '../lib/aiService';
import { db, Character } from '../lib/db';
import { useToast } from '../components/Toast';

export default function CharacterSheetCreate() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [step, setStep] = useState<'upload' | 'generating' | 'review'>('upload');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [characterName, setCharacterName] = useState('');
  const [characterType, setCharacterType] = useState<'human' | 'animal' | 'object' | 'fantasy'>('human');
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generatedImages, setGeneratedImages] = useState<{
    front: string;
    back: string;
    closeup: string;
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const characterTypes = [
    { id: 'human', label: 'إنسان', icon: '👤' },
    { id: 'animal', label: 'حيوان', icon: '🐾' },
    { id: 'object', label: 'عنصر/شيء', icon: '📦' },
    { id: 'fantasy', label: 'خيالي', icon: '🧙' },
  ];

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('الرجاء اختيار ملف صورة', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, [showToast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadedImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const startGeneration = async () => {
    if (!uploadedImage || !characterName.trim()) {
      showToast('الرجاء رفع صورة وإدخال اسم الشخصية', 'error');
      return;
    }

    setIsProcessing(true);
    setStep('generating');
    setGenerationProgress(0);

    try {
      console.log('Starting character sheet generation...');
      
      // Generate all 3 views
      const images = await AIService.generateCharacterSheet({
        referenceImage: uploadedImage,
        characterType,
        characterName,
        onProgress: (progress) => setGenerationProgress(progress)
      });

      console.log('Character sheet generated successfully');
      
      requestAnimationFrame(() => {
        setGeneratedImages(images);
        setStep('review');
        setIsProcessing(false);
      });

    } catch (error: any) {
      console.error('Generation error:', error);
      showToast(error.message || 'فشل التوليد', 'error');
      setStep('upload');
      setIsProcessing(false);
    }
  };

  const regenerateView = async (view: 'front' | 'back' | 'closeup') => {
    if (!uploadedImage) return;
    
    setIsProcessing(true);
    try {
      const newImage = await AIService.regenerateCharacterView({
        referenceImage: uploadedImage,
        existingImages: generatedImages!,
        viewToRegenerate: view,
        characterType,
        characterName
      });
      
      setGeneratedImages(prev => prev ? { ...prev, [view]: newImage } : null);
      showToast('تم إعادة توليد الصورة', 'success');
    } catch (error: any) {
      showToast(error.message || 'فشل إعادة التوليد', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadImage = (url: string, viewName: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${characterName.replace(/\s+/g, '-')}-${viewName}-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const saveCharacter = async () => {
    if (!generatedImages) return;
    
    try {
      const character: Character = {
        id: uuidv4(),
        name: characterName,
        description: `شخصية من نوع ${characterTypes.find(t => t.id === characterType)?.label}`,
        visualTraits: `Character sheet with front, back, and closeup views. Type: ${characterType}`,
        images: {
          front: generatedImages.front,
          back: generatedImages.back,
          closeup: generatedImages.closeup,
          reference: uploadedImage || undefined
        },
        createdAt: Date.now()
      };
      
      await db.saveCharacter(character);
      showToast('تم حفظ الشخصية بنجاح!', 'success');
      navigate('/characters');
    } catch (error: any) {
      showToast('فشل حفظ الشخصية', 'error');
    }
  };

  return (
    <div className="p-4 max-w-lg mx-auto min-h-screen bg-background pb-32">
      {/* Header */}
      <div className="flex items-center mb-6 pt-2">
        <button onClick={() => navigate(-1)} className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold mr-2 flex items-center gap-2 text-foreground">
          <User className="w-5 h-5 text-blue-500" />
          منشئ ورقة الشخصية
        </h1>
      </div>

      {step === 'upload' && (
        <div className="space-y-6">
          {/* Info Card */}
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl">
            <h3 className="font-bold text-blue-900 text-sm mb-2">كيف تعمل هذه الأداة؟</h3>
            <p className="text-xs text-blue-800 leading-relaxed">
              ارفع صورة لوجه أو شخصية، وسيقوم الذكاء الاصطناعي بإنشاء 3 صور عالية الجودة:
              صورة أمامية بجسم كامل، صورة خلفية، وصورة مقربة للوجه.
              يمكنك حفظ الشخصية واستخدامها في أدوات أخرى مع الحفاظ على تناسق الملامح.
            </p>
          </div>

          {/* Character Name */}
          <div>
            <label className="block text-sm font-bold text-foreground mb-2">اسم الشخصية</label>
            <input
              type="text"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              className="w-full p-3 border border-border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-card"
              placeholder="مثال: أحمد، ليلى، القط توم..."
            />
          </div>

          {/* Character Type */}
          <div>
            <label className="block text-sm font-bold text-foreground mb-2">نوع الشخصية</label>
            <div className="grid grid-cols-4 gap-2">
              {characterTypes.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setCharacterType(type.id as any)}
                  className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 ${
                    characterType === type.id
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-border bg-card text-muted-foreground hover:border-blue-200'
                  }`}
                >
                  <span className="text-2xl">{type.icon}</span>
                  <span className="text-[10px] font-medium">{type.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Upload Area */}
          <div>
            <label className="block text-sm font-bold text-foreground mb-2">الصورة المرجعية</label>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                uploadedImage
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-border hover:border-blue-300 hover:bg-blue-50/50'
              }`}
            >
              {uploadedImage ? (
                <div className="space-y-4">
                  <div className="w-32 h-32 mx-auto rounded-xl overflow-hidden shadow-lg">
                    <img src={uploadedImage} alt="Uploaded" className="w-full h-full object-cover" />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setUploadedImage(null);
                    }}
                    className="absolute top-2 left-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <p className="text-sm text-blue-700 font-medium">اضغط لتغيير الصورة</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                    <Upload className="w-8 h-8 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">اسحب الصورة هنا أو اضغط للاختيار</p>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG, WEBP</p>
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={startGeneration}
            disabled={!uploadedImage || !characterName.trim()}
            className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold shadow-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
          >
            <Sparkles className="w-5 h-5" />
            <span>توليد ورقة الشخصية</span>
          </button>
        </div>
      )}

      {step === 'generating' && (
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-6 text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 animate-pulse rounded-full"></div>
            <Loader2 className="w-16 h-16 text-blue-600 animate-spin relative z-10" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-foreground">جاري إنشاء ورقة الشخصية...</h3>
            <p className="text-muted-foreground mt-2">
              {generationProgress < 33 && 'يتم تحليل الصورة المرجعية...'}
              {generationProgress >= 33 && generationProgress < 66 && 'يتم توليد الصورة الأمامية...'}
              {generationProgress >= 66 && generationProgress < 100 && 'يتم توليد الصور المتبقية...'}
            </p>
          </div>
          <div className="w-full max-w-xs bg-secondary rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-500 h-full transition-all duration-500"
              style={{ width: `${generationProgress}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground">{Math.round(generationProgress)}%</p>
        </div>
      )}

      {step === 'review' && generatedImages && (
        <div className="space-y-6">
          {/* Character Name Display */}
          <div className="bg-card p-4 rounded-xl border border-border">
            <h3 className="font-bold text-lg text-foreground">{characterName}</h3>
            <p className="text-sm text-muted-foreground">
              {characterTypes.find(t => t.id === characterType)?.label} • 3 صور مرجعية
            </p>
          </div>

          {/* Generated Images Grid */}
          <div className="space-y-4">
            {/* Front View */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="bg-blue-600 text-white text-sm text-center py-2 font-bold flex items-center justify-center gap-2">
                <Camera className="w-4 h-4" />
                الصورة الأمامية (جسم كامل)
              </div>
              <div className="aspect-[3/4] bg-slate-100">
                <img
                  src={generatedImages.front}
                  alt="Front view"
                  className="w-full h-full object-cover"
                  onError={(e) => e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text x="50%" y="50%" text-anchor="middle">❌</text></svg>'}
                />
              </div>
              <div className="p-3 flex gap-2">
                <button
                  onClick={() => regenerateView('front')}
                  disabled={isProcessing}
                  className="flex-1 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-bold hover:bg-muted flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  <RefreshCw className="w-3 h-3" /> إعادة توليد
                </button>
                <button
                  onClick={() => downloadImage(generatedImages.front, 'front')}
                  className="flex-1 py-2 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-100 flex items-center justify-center gap-1"
                >
                  <Download className="w-3 h-3" /> تنزيل
                </button>
              </div>
            </div>

            {/* Back and Closeup Grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Back View */}
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="bg-slate-700 text-white text-xs text-center py-1.5 font-bold">
                  الخلفية
                </div>
                <div className="aspect-[3/4] bg-slate-100">
                  <img
                    src={generatedImages.back}
                    alt="Back view"
                    className="w-full h-full object-cover"
                    onError={(e) => e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text x="50%" y="50%" text-anchor="middle">❌</text></svg>'}
                  />
                </div>
                <div className="p-2 flex gap-1">
                  <button
                    onClick={() => regenerateView('back')}
                    disabled={isProcessing}
                    className="flex-1 py-1.5 bg-secondary rounded-lg text-[10px] font-bold disabled:opacity-50"
                  >
                    <RefreshCw className="w-3 h-3 mx-auto" />
                  </button>
                  <button
                    onClick={() => downloadImage(generatedImages.back, 'back')}
                    className="flex-1 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-bold"
                  >
                    <Download className="w-3 h-3 mx-auto" />
                  </button>
                </div>
              </div>

              {/* Closeup View */}
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="bg-amber-600 text-white text-xs text-center py-1.5 font-bold">
                  مقربة للوجه
                </div>
                <div className="aspect-[3/4] bg-slate-100">
                  <img
                    src={generatedImages.closeup}
                    alt="Closeup view"
                    className="w-full h-full object-cover"
                    onError={(e) => e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text x="50%" y="50%" text-anchor="middle">❌</text></svg>'}
                  />
                </div>
                <div className="p-2 flex gap-1">
                  <button
                    onClick={() => regenerateView('closeup')}
                    disabled={isProcessing}
                    className="flex-1 py-1.5 bg-secondary rounded-lg text-[10px] font-bold disabled:opacity-50"
                  >
                    <RefreshCw className="w-3 h-3 mx-auto" />
                  </button>
                  <button
                    onClick={() => downloadImage(generatedImages.closeup, 'closeup')}
                    className="flex-1 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-bold"
                  >
                    <Download className="w-3 h-3 mx-auto" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 pb-8">
            <button
              onClick={startGeneration}
              disabled={isProcessing}
              className="w-full py-3 bg-secondary text-secondary-foreground rounded-xl font-bold hover:bg-muted flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              <RefreshCw className="w-5 h-5" />
              <span>إعادة توليد الكل</span>
            </button>
            <button
              onClick={saveCharacter}
              className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold shadow-lg hover:bg-blue-700 flex items-center justify-center gap-2 transition-colors"
            >
              <Check className="w-5 h-5" />
              <span>حفظ الشخصية</span>
            </button>
            <p className="text-[10px] text-center text-muted-foreground">
              سيتم حفظ جميع الصور كمراجع للاستخدام في أدوات التوليد الأخرى
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
