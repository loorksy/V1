import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Upload, Sparkles, Check, ChevronRight, Loader2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { AIService } from '../lib/aiService';
import { MissingApiKeyError } from '../lib/aiProvider';
import { ApiKeyMissing } from '../components/ApiKeyMissing';
import { db, Character } from '../lib/db';
import { cn } from '../lib/utils';

export default function CharacterCreate() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'input' | 'analyzing' | 'generating' | 'review'>('input');
  const [mode, setMode] = useState<'text' | 'image'>('text');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<{
    front?: string;
    left?: string;
    right?: string;
    threeQuarter?: string;
  }>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [missingKeyError, setMissingKeyError] = useState<MissingApiKeyError | null>(null);

  const [style, setStyle] = useState('Pixar 3D');
  const [expression, setExpression] = useState('Neutral');
  const [clothing, setClothing] = useState('Casual');
  const [eyeColor, setEyeColor] = useState('Default');
  const [clothingColor, setClothingColor] = useState('Default');
  const [backgroundColor, setBackgroundColor] = useState('White');
  const [accessories, setAccessories] = useState('');
  
  const styles = [
    { value: 'Pixar 3D', label: 'بيكسار 3D' },
    { value: 'Anime', label: 'أنمي' },
    { value: 'Realistic', label: 'واقعي' },
    { value: 'Watercolor', label: 'ألوان مائية' },
    { value: 'Cyberpunk', label: 'سايبربانك' },
    { value: 'Claymation', label: 'صلصال' }
  ];
  const expressions = [
    { value: 'Neutral', label: 'محايد' },
    { value: 'Happy', label: 'سعيد' },
    { value: 'Angry', label: 'غاضب' },
    { value: 'Sad', label: 'حزين' },
    { value: 'Determined', label: 'عازم / مصمم' },
    { value: 'Surprised', label: 'متفاجئ' }
  ];
  const clothingStyles = [
    { value: 'Casual', label: 'كاجوال' },
    { value: 'Formal', label: 'رسمي' },
    { value: 'Sci-Fi Armor', label: 'درع خيال علمي' },
    { value: 'Fantasy Armor', label: 'درع خيالي' },
    { value: 'Streetwear', label: 'ملابس شارع' },
    { value: 'Historical', label: 'تاريخي' }
  ];
  const colors = [
    { value: 'Default', label: 'افتراضي' },
    { value: 'Black', label: 'أسود' },
    { value: 'White', label: 'أبيض' },
    { value: 'Red', label: 'أحمر' },
    { value: 'Blue', label: 'أزرق' },
    { value: 'Green', label: 'أخضر' },
    { value: 'Gold', label: 'ذهبي' },
    { value: 'Purple', label: 'بنفسجي' },
    { value: 'Brown', label: 'بني' }
  ];
  const bgColors = [
    { value: 'White', label: 'أبيض' },
    { value: 'Black', label: 'أسود' },
    { value: 'Green Screen', label: 'شاشة خضراء (كروما)' },
    { value: 'Blue Screen', label: 'شاشة زرقاء' },
    { value: 'Transparent', label: 'شفاف' },
    { value: 'Gray', label: 'رمادي' },
    { value: 'Red', label: 'أحمر' },
    { value: 'Blue', label: 'أزرق' }
  ];

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const startGeneration = async () => {
    if (!name) return;
    setIsProcessing(true);
    
    try {
      let finalDescription = description;

      // Step 1: Analyze if image provided
      if (mode === 'image' && uploadedImage) {
        setStep('analyzing');
        finalDescription = await AIService.analyzeCharacter(uploadedImage);
        setDescription(finalDescription);
      }
      
      // Append style and customization to description
      const styledDescription = `${finalDescription}. Art Style: ${style}. Expression: ${expression}. Clothing Style: ${clothing}. Eye Color: ${eyeColor}. Clothing Color: ${clothingColor}. Accessories: ${accessories || 'None'}. Background Color: ${backgroundColor}.`;

      // Step 2: Generate Angles
      setStep('generating');

      
      // Parallel generation for speed
      const [front, left, right, threeQuarter] = await Promise.all([
        AIService.generateCharacterAngle(styledDescription, 'front'),
        AIService.generateCharacterAngle(styledDescription, 'left side'),
        AIService.generateCharacterAngle(styledDescription, 'right side'),
        AIService.generateCharacterAngle(styledDescription, '3/4 view')
      ]);

      setGeneratedImages({ front, left, right, threeQuarter });
      setStep('review');
    } catch (error: any) {
      if (error instanceof MissingApiKeyError) { setMissingKeyError(error); }
      else { console.error(error); alert(`فشل التوليد: ${error.message || 'خطأ غير معروف'}`); }
      setStep('input');
    } finally {
      setIsProcessing(false);
    }
  };

  const saveCharacter = async () => {
    const character: Character = {
      id: uuidv4(),
      name,
      description,
      visualTraits: description,
      images: generatedImages,
      createdAt: Date.now()
    };
    
    await db.saveCharacter(character);
    navigate('/characters');
  };

  return (
    <div className="p-4 max-w-lg mx-auto min-h-screen bg-background">
      {missingKeyError && <ApiKeyMissing error={missingKeyError} onDismiss={() => setMissingKeyError(null)} />}
      {/* Header */}
      <div className="flex items-center mb-6 pt-2">
        <button onClick={() => navigate(-1)} className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold mr-2 text-foreground">شخصية جديدة</h1>
      </div>

      {step === 'input' && (
        <div className="space-y-6">
          {/* Name Input */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">اسم الشخصية</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-3 border border-border rounded-xl focus:ring-2 focus:ring-ring/30 focus:border-primary outline-none bg-secondary/50 text-sm transition-all"
              placeholder="مثال: سارة، المحارب الشجاع..."
            />
          </div>

          {/* Mode Toggle */}
          <div className="flex p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setMode('text')}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                mode === 'text' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500"
              )}
            >
              وصف نصي
            </button>
            <button
              onClick={() => setMode('image')}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                mode === 'image' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500"
              )}
            >
              رفع صورة
            </button>
          </div>

          {/* Style Selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">نمط الرسم</label>
            <div className="grid grid-cols-3 gap-2">
              {styles.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStyle(s.value)}
                  className={cn(
                    "py-2 px-1 text-xs font-medium rounded-lg border transition-all",
                    style === s.value 
                      ? "bg-indigo-50 border-indigo-500 text-indigo-700 shadow-sm" 
                      : "bg-white border-slate-200 text-slate-600 hover:border-indigo-200"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Customization Selectors */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">تعبير الوجه</label>
              <select 
                value={expression} 
                onChange={(e) => setExpression(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {expressions.map(exp => <option key={exp.value} value={exp.value}>{exp.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">نمط الملابس</label>
              <select 
                value={clothing} 
                onChange={(e) => setClothing(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {clothingStyles.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">لون العينين</label>
              <select 
                value={eyeColor} 
                onChange={(e) => setEyeColor(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {colors.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">لون الملابس</label>
              <select 
                value={clothingColor} 
                onChange={(e) => setClothingColor(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {colors.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">لون الخلفية (مفيد للقص لاحقاً)</label>
              <select 
                value={backgroundColor} 
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {bgColors.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          {/* Accessories Input */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">الإكسسوارات (اختياري)</label>
            <input
              type="text"
              value={accessories}
              onChange={(e) => setAccessories(e.target.value)}
              className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              placeholder="مثال: نظارات، قبعة، قلادة..."
            />
          </div>

          {mode === 'text' ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">الوصف</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-xl h-32 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                placeholder="صف مظهر الشخصية، الملابس، الألوان..."
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">صورة مرجعية</label>
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center relative hover:bg-slate-50 transition-colors">
                {uploadedImage ? (
                  <img src={uploadedImage} alt="Preview" className="mx-auto h-48 object-contain rounded-lg" />
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-8 h-8 mx-auto text-slate-400" />
                    <p className="text-sm text-slate-500">اضغط لرفع صورة</p>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>
            </div>
          )}

          <button
            onClick={startGeneration}
            disabled={!name || (mode === 'text' && !description) || (mode === 'image' && !uploadedImage)}
            className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-bold shadow-md shadow-primary/20 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <Sparkles className="w-5 h-5" />
            <span>توليد الشخصية</span>
          </button>
        </div>
      )}

      {(step === 'analyzing' || step === 'generating') && (
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-6 text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 animate-pulse rounded-full"></div>
            <Loader2 className="w-16 h-16 text-indigo-600 animate-spin relative z-10" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">
              {step === 'analyzing' ? 'جاري تحليل الصورة...' : 'جاري توليد الشخصية...'}
            </h3>
            <p className="text-slate-500 mt-2">
              {step === 'analyzing' 
                ? 'يقوم Gemini باستخراج السمات البصرية' 
                : 'يقوم Nano Banana برسم الزوايا المختلفة'}
            </p>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <span className="text-xs font-medium text-slate-500">أمام</span>
              <img src={generatedImages.front} className="w-full rounded-xl shadow-sm border border-slate-100" />
            </div>
            <div className="space-y-2">
              <span className="text-xs font-medium text-slate-500">جانب أيسر</span>
              <img src={generatedImages.left} className="w-full rounded-xl shadow-sm border border-slate-100" />
            </div>
            <div className="space-y-2">
              <span className="text-xs font-medium text-slate-500">جانب أيمن</span>
              <img src={generatedImages.right} className="w-full rounded-xl shadow-sm border border-slate-100" />
            </div>
            <div className="space-y-2">
              <span className="text-xs font-medium text-slate-500">3/4</span>
              <img src={generatedImages.threeQuarter} className="w-full rounded-xl shadow-sm border border-slate-100" />
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl">
            <h4 className="font-medium text-sm mb-2 text-slate-900">الوصف المستخرج:</h4>
            <p className="text-xs text-slate-600 leading-relaxed">{description}</p>
          </div>

          <button
            onClick={saveCharacter}
            className="w-full py-3.5 bg-emerald-600 text-white rounded-xl font-bold shadow-md hover:bg-emerald-700 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <Check className="w-5 h-5" />
            <span>حفظ الشخصية</span>
          </button>
        </div>
      )}
    </div>
  );
}
