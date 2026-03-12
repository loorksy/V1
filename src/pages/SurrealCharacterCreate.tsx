import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Check, ChevronRight, Loader2, Ghost, Download, RefreshCw, Wand2, LayoutGrid, Settings2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { AIService } from '../lib/aiService';
import { MissingApiKeyError } from '../lib/aiProvider';
import { ApiKeyMissing } from '../components/ApiKeyMissing';
import { db, Character } from '../lib/db';
import { cn } from '../lib/utils';
import { surrealTrends } from '../lib/surrealTrends';
import { CustomSelect } from '../components/CustomSelect';
import { useToast } from '../components/Toast';

export default function SurrealCharacterCreate() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [step, setStep] = useState<'input' | 'generating' | 'review'>('input');
  const [missingKeyError, setMissingKeyError] = useState<MissingApiKeyError | null>(null);
  const [activeTab, setActiveTab] = useState<'basic' | 'advanced' | 'trends'>('basic');
  
  // Form State
  const [objectName, setObjectName] = useState('');
  const [emotion, setEmotion] = useState('Creepy / مخيف');
  const [style, setStyle] = useState('Hyperrealistic / واقعي جداً');
  const [body, setBody] = useState('بدون جسم (وجه فقط)');
  const [limbs, setLimbs] = useState('بدون أطراف');
  const [hair, setHair] = useState('أصلع (بدون شعر)');
  const [cameraAngle, setCameraAngle] = useState('زاوية أمامية مباشرة (Front-facing)');
  const [lighting, setLighting] = useState('إضاءة استوديو ساطعة');
  const [environment, setEnvironment] = useState('خلفية بيضاء نقية (Pure White)');
  const [generateNormal, setGenerateNormal] = useState(false);
  
  const [generatedImages, setGeneratedImages] = useState<{surreal: string, normal?: string} | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);

  // Handle image load error
  const handleImageError = useCallback(() => {
    setImageLoadError(true);
    showToast('فشل تحميل الصورة', 'error');
  }, [showToast]);

  // Options
  const emotions = ['Creepy / مخيف', 'Crying / يبكي', 'Smiling / يبتسم', 'Angry / غاضب', 'Shocked / مصدوم', 'Disgusted / مشمئز'];
  const styles = ['Hyperrealistic / واقعي جداً', 'Claymation / صلصال', '3D Render / ثلاثي الأبعاد', 'Cinematic / سينمائي'];
  const bodyTypes = ['بدون جسم (وجه فقط)', 'جسم صغير جداً', 'جسم بشري كامل', 'جسم كرتوني ممتلئ', 'جسم نحيل وطويل'];
  const limbsTypes = ['بدون أطراف', 'أيدي بشرية واقعية', 'أذرع كرتونية', 'جذور/أغصان', 'مخالب'];
  const hairTypes = ['أصلع (بدون شعر)', 'شعر بشري فوضوي', 'عشب/نباتات', 'نار مشتعلة', 'دخان', 'شعر مستعار كلاسيكي'];
  const cameraAngles = ['زاوية أمامية مباشرة (Front-facing)', 'تصوير ماكرو (قريب جداً)', 'زاوية منخفضة (Low Angle)', 'زاوية مرتفعة (High Angle)', 'لقطة واسعة', 'عين السمكة (Fisheye)'];
  const lightingTypes = ['إضاءة استوديو ساطعة', 'إضاءة سينمائية درامية', 'إضاءة نيون (سايبربانك)', 'إضاءة طبيعية (وقت الغروب)', 'إضاءة خافتة ومخيفة'];
  const environments = ['خلفية بيضاء نقية (Pure White)', 'خلفية سوداء داكنة', 'شاشة خضراء (Green Screen)', 'مطبخ فوضوي', 'غابة مظلمة', 'الفضاء الخارجي', 'مختبر علمي', 'طاولة خشبية'];

  const startGeneration = async () => {
    if (!objectName) return;
    setIsProcessing(true);
    setStep('generating');
    setImageLoadError(false);
    
    try {
      console.log('Starting image generation...');
      const images = await AIService.generateSurrealObject({
        objectName, emotion, style, body, limbs, hair, cameraAngle, lighting, environment, generateNormal
      });
      
      console.log('Images received from API');
      
      // Validate images before setting state
      if (!images || !images.surreal) {
        throw new Error('لم يتم استلام صورة من الخادم');
      }
      
      console.log('Setting generated images to state...');
      
      // Use requestAnimationFrame to ensure smooth UI update
      requestAnimationFrame(() => {
        setGeneratedImages(images);
        setStep('review');
        setIsProcessing(false);
        console.log('State updated successfully');
      });
      
    } catch (error: any) {
      if (error instanceof MissingApiKeyError) { setMissingKeyError(error); }
      else { showToast(error.message || 'فشل التوليد', 'error'); }
      setStep('input');
      setIsProcessing(false);
    }
  };

  const autoGenerateIdea = async () => {
    setIsAutoGenerating(true);
    try {
      const idea = await AIService.generateRandomSurrealIdea(objectName);
      setObjectName(idea.objectName || 'Unknown Object');
      setEmotion(idea.emotion || 'Creepy');
      setStyle(idea.style || 'Hyperrealistic');
      setBody(idea.body || 'No body');
      setLimbs(idea.limbs || 'No limbs');
      setHair(idea.hair || 'Bald');
      setCameraAngle(idea.cameraAngle || 'Macro shot');
      setLighting(idea.lighting || 'Cinematic');
      setEnvironment(idea.environment || 'Dark void');
      setActiveTab('advanced'); // Switch to advanced to show the filled fields
    } catch (error: any) {
      if (error instanceof MissingApiKeyError) { setMissingKeyError(error); }
      else { showToast(error.message || 'فشل توليد الفكرة', 'error'); }
    } finally {
      setIsAutoGenerating(false);
    }
  };

  const applyTrend = (trend: typeof surrealTrends[0]) => {
    setObjectName(trend.objectName);
    setEmotion(trend.emotion);
    setStyle(trend.style);
    setBody(trend.body);
    setLimbs(trend.limbs);
    setHair(trend.hair);
    setCameraAngle(trend.cameraAngle);
    setLighting(trend.lighting);
    setEnvironment(trend.environment);
    setActiveTab('basic');
  };

  const downloadImage = (url: string, type: 'surreal' | 'normal') => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-${objectName.replace(/\s+/g, '-')}-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const saveCharacter = async () => {
    if (!generatedImages?.surreal) return;
    const character: Character = {
      id: uuidv4(),
      name: objectName,
      description: `Surreal object: ${objectName}, Emotion: ${emotion}, Style: ${style}`,
      visualTraits: `Surreal anthropomorphic ${objectName} with a ${emotion} face in ${style} style. Body: ${body}, Limbs: ${limbs}, Hair: ${hair}, Camera: ${cameraAngle}, Lighting: ${lighting}, Environment: ${environment}.`,
      images: {
        front: generatedImages.surreal,
        normal: generatedImages.normal
      },
      createdAt: Date.now()
    };
    
    await db.saveCharacter(character);
    navigate('/characters');
  };

  return (
    <div className="p-4 max-w-lg mx-auto min-h-screen bg-background pb-32">
      {missingKeyError && <ApiKeyMissing error={missingKeyError} onDismiss={() => setMissingKeyError(null)} />}
      <div className="flex items-center mb-6 pt-2">
        <button onClick={() => navigate(-1)} className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold mr-2 flex items-center gap-2 text-foreground">
          <Ghost className="w-5 h-5 text-emerald-500" />
          شخصية خيالية (تريند)
        </h1>
      </div>

      {step === 'input' && (
        <div className="space-y-6">
          
          {/* AI Magic Button */}
          <button
            onClick={autoGenerateIdea}
            disabled={isAutoGenerating}
            className="w-full py-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl font-bold shadow-md hover:from-purple-600 hover:to-indigo-700 flex items-center justify-center gap-2 transition-all"
          >
            {isAutoGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
            <span>{isAutoGenerating ? 'جاري التفكير في فكرة مجنونة...' : 'توليد فكرة عشوائية بالذكاء الاصطناعي'}</span>
          </button>

          {/* Tabs */}
          <div className="flex p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setActiveTab('basic')}
              className={cn("flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1", activeTab === 'basic' ? "bg-white shadow-sm text-emerald-600" : "text-slate-500")}
            >
              <Ghost className="w-4 h-4" /> أساسي
            </button>
            <button
              onClick={() => setActiveTab('advanced')}
              className={cn("flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1", activeTab === 'advanced' ? "bg-white shadow-sm text-emerald-600" : "text-slate-500")}
            >
              <Settings2 className="w-4 h-4" /> متقدم
            </button>
            <button
              onClick={() => setActiveTab('trends')}
              className={cn("flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1", activeTab === 'trends' ? "bg-white shadow-sm text-emerald-600" : "text-slate-500")}
            >
              <LayoutGrid className="w-4 h-4" /> قوالب جاهزة
            </button>
          </div>

          {/* Basic Tab */}
          {activeTab === 'basic' && (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ما هو الشيء؟ (مثال: بيضة، كوكب، فنجان)</label>
                <input
                  type="text"
                  value={objectName}
                  onChange={(e) => setObjectName(e.target.value)}
                  className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="اكتب اسم الشيء بالإنجليزية أو العربية..."
                />
              </div>

              {/* Before/After Toggle */}
              <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                <div>
                  <h4 className="text-sm font-bold text-emerald-900">توليد نسخة طبيعية (قبل/بعد)</h4>
                  <p className="text-[10px] text-emerald-700 mt-1">سيتم توليد صورة للشيء بشكله الحقيقي وصورة بوجه بشري</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={generateNormal} onChange={(e) => setGenerateNormal(e.target.checked)} />
                  <div className="w-11 h-6 bg-emerald-200 peer-focus:outline-none rounded-full peer peer-checked:after:-translate-x-full rtl:peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:end-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">المشاعر / التعبير</label>
                <div className="grid grid-cols-2 gap-2">
                  {emotions.map((e) => (
                    <button
                      key={e}
                      onClick={() => setEmotion(e)}
                      className={cn(
                        "py-2 px-2 text-xs font-medium rounded-lg border transition-all",
                        emotion === e ? "bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm" : "bg-white border-slate-200 text-slate-600 hover:border-emerald-200"
                      )}
                    >
                      {e.split(' / ')[1] || e}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">نمط الرسم</label>
                <div className="grid grid-cols-2 gap-2">
                  {styles.map((s) => (
                    <button
                      key={s}
                      onClick={() => setStyle(s)}
                      className={cn(
                        "py-2 px-2 text-xs font-medium rounded-lg border transition-all",
                        style === s ? "bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm" : "bg-white border-slate-200 text-slate-600 hover:border-emerald-200"
                      )}
                    >
                      {s.split(' / ')[1] || s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Advanced Tab */}
          {activeTab === 'advanced' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg text-xs text-amber-800">
                هذه الخيارات تمنحك تحكماً احترافياً ودقيقاً جداً في شكل الشخصية والمشهد.
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الجسم</label>
                  <CustomSelect value={body} onChange={setBody} options={bodyTypes} className="p-2 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الأطراف/الأصابع</label>
                  <CustomSelect value={limbs} onChange={setLimbs} options={limbsTypes} className="p-2 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الشعر/الرأس</label>
                  <CustomSelect value={hair} onChange={setHair} options={hairTypes} className="p-2 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">زاوية التصوير</label>
                  <CustomSelect value={cameraAngle} onChange={setCameraAngle} options={cameraAngles} className="p-2 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الإضاءة</label>
                  <CustomSelect value={lighting} onChange={setLighting} options={lightingTypes} className="p-2 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">البيئة/الخلفية</label>
                  <CustomSelect value={environment} onChange={setEnvironment} options={environments} className="p-2 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
            </div>
          )}

          {/* Trends Tab */}
          {activeTab === 'trends' && (
            <div className="animate-in fade-in slide-in-from-bottom-2">
              <h3 className="text-sm font-bold text-slate-800 mb-3">مكتبة التريندات (أكثر من 40 شخصية جاهزة)</h3>
              <div className="grid grid-cols-2 gap-3 h-96 overflow-y-auto pr-1 pb-4">
                {surrealTrends.map((trend) => (
                  <button
                    key={trend.id}
                    onClick={() => applyTrend(trend)}
                    className="flex flex-col items-center p-3 bg-white border border-slate-200 rounded-xl hover:border-emerald-400 hover:shadow-md transition-all text-center gap-2"
                  >
                    <span className="text-3xl">{trend.emoji}</span>
                    <span className="text-xs font-bold text-slate-700">{trend.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={startGeneration}
            disabled={!objectName}
            className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold shadow-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-8"
          >
            <Sparkles className="w-5 h-5" />
            <span>توليد الشخصية الخيالية</span>
          </button>
        </div>
      )}

      {step === 'generating' && (
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-6 text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500 blur-xl opacity-20 animate-pulse rounded-full"></div>
            <Loader2 className="w-16 h-16 text-emerald-600 animate-spin relative z-10" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">جاري التوليد...</h3>
            <p className="text-slate-500 mt-2">
              {generateNormal ? 'يقوم Gemini برسم النسخة الطبيعية والنسخة الخيالية معاً' : `يقوم Gemini برسم وجه بشري على ${objectName || 'الشيء'}`}
            </p>
          </div>
        </div>
      )}

      {step === 'review' && generatedImages && (
        <div className="space-y-6">
          {generatedImages.normal ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="bg-slate-800 text-white text-xs text-center py-1 rounded-t-lg font-bold">الشكل الطبيعي</div>
                <div className="aspect-[3/4] rounded-b-xl overflow-hidden shadow-md border border-slate-200 bg-slate-100">
                  <img 
                    src={generatedImages.normal} 
                    className="w-full h-full object-cover" 
                    alt="Normal Object"
                    onError={(e) => {
                      console.error('Failed to load normal image');
                      e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text x="50%" y="50%" text-anchor="middle">❌</text></svg>';
                    }}
                  />
                </div>
                <button
                  onClick={() => downloadImage(generatedImages.normal!, 'normal')}
                  className="w-full py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 flex items-center justify-center gap-1"
                >
                  <Download className="w-4 h-4" /> تنزيل
                </button>
              </div>
              <div className="space-y-2">
                <div className="bg-emerald-600 text-white text-xs text-center py-1 rounded-t-lg font-bold">الشكل الخيالي</div>
                <div className="aspect-[3/4] rounded-b-xl overflow-hidden shadow-md border border-slate-200 bg-slate-100">
                  <img 
                    src={generatedImages.surreal} 
                    className="w-full h-full object-cover" 
                    alt="Surreal Object"
                    onError={(e) => {
                      console.error('Failed to load surreal image');
                      e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text x="50%" y="50%" text-anchor="middle">❌</text></svg>';
                    }}
                  />
                </div>
                <button
                  onClick={() => downloadImage(generatedImages.surreal, 'surreal')}
                  className="w-full py-2 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-100 flex items-center justify-center gap-1"
                >
                  <Download className="w-4 h-4" /> تنزيل
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="aspect-[3/4] rounded-2xl overflow-hidden shadow-xl border border-slate-200 bg-slate-100">
                <img 
                  src={generatedImages.surreal} 
                  className="w-full h-full object-cover" 
                  alt="Generated Surreal Object"
                  onError={(e) => {
                    console.error('Failed to load surreal image');
                    e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text x="50%" y="50%" text-anchor="middle">❌</text></svg>';
                  }}
                />
              </div>
              <button
                onClick={() => downloadImage(generatedImages.surreal, 'surreal')}
                className="w-full py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold shadow-sm hover:bg-slate-50 flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-5 h-5" />
                <span>تنزيل الصورة</span>
              </button>
            </div>
          )}

          <div className="bg-slate-50 p-4 rounded-xl">
            <h4 className="font-medium text-sm mb-2 text-slate-900">تفاصيل الشخصية:</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              الشيء: {objectName}<br/>
              المشاعر: {emotion.split(' / ')[1] || emotion}<br/>
              النمط: {style.split(' / ')[1] || style}
            </p>
          </div>

          <div className="flex flex-col gap-3 pb-8">
            <button
              onClick={startGeneration}
              disabled={isProcessing}
              className="w-full py-3 bg-emerald-50 text-emerald-700 rounded-xl font-bold shadow-sm hover:bg-emerald-100 flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
              <span>إعادة توليد</span>
            </button>
            <button
              onClick={saveCharacter}
              className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold shadow-lg hover:bg-emerald-700 flex items-center justify-center gap-2 transition-colors"
            >
              <Check className="w-5 h-5" />
              <span>حفظ في مكتبة الشخصيات</span>
            </button>
            <p className="text-[10px] text-center text-slate-400 mt-1">
              حفظ الشخصية يسمح لك باستخدامها لاحقاً في قسم "قصة جديدة"
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
