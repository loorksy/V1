import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Check, ChevronRight, Loader2, Download, RefreshCw, Wand2, Smile } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { AIService } from '../lib/aiService';
import { MissingApiKeyError } from '../lib/aiProvider';
import { ApiKeyMissing } from '../components/ApiKeyMissing';
import { db, Character } from '../lib/db';
import { cn } from '../lib/utils';
import { CustomSelect } from '../components/CustomSelect';

export default function FunnyHumanCreate() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'input' | 'generating' | 'review'>('input');
  
  // Form State
  const [baseHuman, setBaseHuman] = useState('رجل أعمال جاد');
  const [mergedWith, setMergedWith] = useState('جسم ثلاجة');
  const [crazyFeature, setCrazyFeature] = useState('رأس عملاق وجسم صغير');
  const [expression, setExpression] = useState('نظرة ميتة (Deadpan)');
  const [style, setStyle] = useState('صورة فوتوغرافية واقعية');
  const [environment, setEnvironment] = useState('اجتماع عمل رسمي');
  
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [missingKeyError, setMissingKeyError] = useState<MissingApiKeyError | null>(null);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);

  // Options
  const baseHumans = ['رجل أعمال جاد', 'جدة لطيفة', 'طفل رضيع', 'عامل بناء', 'طبيب جراح', 'حارس أمن', 'طباخ سمين'];
  const mergedWithList = ['بدون دمج (طبيعي)', 'غسالة ملابس', 'أطراف أخطبوط', 'عجلات سيارة', 'جسم ثلاجة', 'أجنحة دجاجة مقلية', 'تلفزيون قديم', 'جسم عنكبوت'];
  const crazyFeatures = ['بدون ميزات غريبة', 'رأس عملاق وجسم صغير', 'عيون في اليدين', 'أنف على شكل فيل', 'رقبة زرافة', 'أذرع طويلة جداً', 'فم كبير جداً'];
  const expressions = ['يضحك بهستيريا', 'نظرة ميتة (Deadpan)', 'مصدوم جداً', 'يبكي من الضحك', 'غاضب بشكل مضحك', 'مبتسم بخبث'];
  const styles = ['صورة فوتوغرافية واقعية', 'كاميرا مراقبة (CCTV)', 'أنمي ياباني', 'رسوم متحركة 3D', 'صورة بولارويد قديمة', 'رسم كاريكاتير'];
  const environments = ['سوبر ماركت', 'اجتماع عمل رسمي', 'الفضاء الخارجي', 'حمام سباحة', 'صحراء قاحلة', 'استوديو أخبار'];

  const startGeneration = async () => {
    setIsProcessing(true);
    setStep('generating');
    
    try {
      const image = await AIService.generateFunnyHuman({
        baseHuman, mergedWith, crazyFeature, expression, style, environment
      });
      setGeneratedImage(image);
      setStep('review');
    } catch (error: any) {
      if (error instanceof MissingApiKeyError) { setMissingKeyError(error); }
      else { alert(`فشل التوليد: ${error.message}`); }
      setStep('input');
    } finally {
      setIsProcessing(false);
    }
  };

  const autoGenerateIdea = async () => {
    setIsAutoGenerating(true);
    try {
      const idea = await AIService.generateRandomFunnyHumanIdea();
      setBaseHuman(idea.baseHuman || 'رجل أعمال');
      setMergedWith(idea.mergedWith || 'غسالة');
      setCrazyFeature(idea.crazyFeature || 'رأس عملاق');
      setExpression(idea.expression || 'مصدوم');
      setStyle(idea.style || 'واقعي');
      setEnvironment(idea.environment || 'الشارع');
    } catch (error: any) {
      if (error instanceof MissingApiKeyError) { setMissingKeyError(error); }
      else { alert(error.message); }
    } finally {
      setIsAutoGenerating(false);
    }
  };

  const downloadImage = () => {
    if (!generatedImage) return;
    const a = document.createElement('a');
    a.href = generatedImage;
    a.download = `funny-human-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const saveCharacter = async () => {
    if (!generatedImage) return;
    const characterName = `شخصية مضحكة (${baseHuman})`;
    const character: Character = {
      id: uuidv4(),
      name: characterName,
      description: `Funny Human: ${baseHuman} merged with ${mergedWith}`,
      visualTraits: `Base: ${baseHuman}. Merged with: ${mergedWith}. Feature: ${crazyFeature}. Expression: ${expression}. Style: ${style}. Environment: ${environment}.`,
      images: {
        front: generatedImage,
      },
      createdAt: Date.now()
    };
    
    await db.saveCharacter(character);
    navigate('/characters');
  };

  return (
    <div className="p-4 max-w-lg mx-auto min-h-screen bg-background pb-32">
      {/* Header */}
      <div className="flex items-center mb-6 pt-2">
        <button onClick={() => navigate(-1)} className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold mr-2 flex items-center gap-2 text-foreground">
          <Smile className="w-5 h-5 text-orange-500" />
          بشري مضحك وخيالي
        </h1>
      </div>

      {step === 'input' && (
        <div className="space-y-6">
          
          <div className="bg-orange-50 border border-orange-100 p-4 rounded-xl text-sm text-orange-800 leading-relaxed">
            هذا القسم مخصص لصنع شخصيات بشرية مجنونة ومضحكة جداً (دمج البشر مع الأشياء، نسب جسم غريبة، مواقف مضحكة).
          </div>

          {/* AI Magic Button */}
          <button
            onClick={autoGenerateIdea}
            disabled={isAutoGenerating}
            className="w-full py-3 bg-gradient-to-r from-orange-400 to-rose-500 text-white rounded-xl font-bold shadow-md hover:from-orange-500 hover:to-rose-600 flex items-center justify-center gap-2 transition-all"
          >
            {isAutoGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
            <span>{isAutoGenerating ? 'جاري ابتكار فكرة مجنونة...' : 'ابتكار فكرة مضحكة بالذكاء الاصطناعي'}</span>
          </button>

          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">الشخصية الأساسية</label>
              <CustomSelect value={baseHuman} onChange={setBaseHuman} options={baseHumans} className="p-3 rounded-xl text-sm focus:ring-2 focus:ring-orange-500" />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">مدمج مع (اختياري)</label>
              <CustomSelect value={mergedWith} onChange={setMergedWith} options={mergedWithList} className="p-3 rounded-xl text-sm focus:ring-2 focus:ring-orange-500" />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">ميزة غريبة / طفرة</label>
              <CustomSelect value={crazyFeature} onChange={setCrazyFeature} options={crazyFeatures} className="p-3 rounded-xl text-sm focus:ring-2 focus:ring-orange-500" />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">تعبير الوجه</label>
              <CustomSelect value={expression} onChange={setExpression} options={expressions} className="p-3 rounded-xl text-sm focus:ring-2 focus:ring-orange-500" />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">البيئة / المكان</label>
              <CustomSelect value={environment} onChange={setEnvironment} options={environments} className="p-3 rounded-xl text-sm focus:ring-2 focus:ring-orange-500" />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">نمط الرسم</label>
              <CustomSelect value={style} onChange={setStyle} options={styles} className="p-3 rounded-xl text-sm focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>

          <button
            onClick={startGeneration}
            className="w-full py-4 bg-orange-500 text-white rounded-xl font-bold shadow-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-8"
          >
            <Sparkles className="w-5 h-5" />
            <span>توليد الصورة المضحكة</span>
          </button>
        </div>
      )}

      {step === 'generating' && (
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-6 text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-orange-500 blur-xl opacity-20 animate-pulse rounded-full"></div>
            <Loader2 className="w-16 h-16 text-orange-500 animate-spin relative z-10" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">جاري توليد الكارثة...</h3>
            <p className="text-slate-500 mt-2">استعد للضحك، يقوم الذكاء الاصطناعي بدمج الأشياء الآن</p>
          </div>
        </div>
      )}

      {step === 'review' && generatedImage && (
        <div className="space-y-6">
          <div className="aspect-[3/4] rounded-2xl overflow-hidden shadow-xl border border-slate-200">
            <img src={generatedImage} className="w-full h-full object-cover" alt="Generated Funny Human" />
          </div>

          <div className="bg-slate-50 p-4 rounded-xl">
            <h4 className="font-medium text-sm mb-2 text-slate-900">تفاصيل الكارثة:</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              الشخصية: {baseHuman}<br/>
              الدمج: {mergedWith}<br/>
              الميزة: {crazyFeature}
            </p>
          </div>

          <div className="flex flex-col gap-3 pb-8">
            <div className="flex gap-3">
              <button
                onClick={downloadImage}
                className="flex-1 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold shadow-sm hover:bg-slate-50 flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-5 h-5" />
                <span>تنزيل الصورة</span>
              </button>
              <button
                onClick={startGeneration}
                disabled={isProcessing}
                className="flex-1 py-3 bg-orange-50 text-orange-700 rounded-xl font-bold shadow-sm hover:bg-orange-100 flex items-center justify-center gap-2 transition-colors"
              >
                <RefreshCw className="w-5 h-5" />
                <span>إعادة توليد</span>
              </button>
            </div>
            <button
              onClick={saveCharacter}
              className="w-full py-4 bg-orange-500 text-white rounded-xl font-bold shadow-lg hover:bg-orange-600 flex items-center justify-center gap-2 transition-colors"
            >
              <Check className="w-5 h-5" />
              <span>حفظ في مكتبة الشخصيات</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
