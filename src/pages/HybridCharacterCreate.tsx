import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dna, ChevronRight, Loader2, Save, Sparkles, Image as ImageIcon } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { AIService } from '../lib/aiService';
import { MissingApiKeyError } from '../lib/aiProvider';
import { ApiKeyMissing } from '../components/ApiKeyMissing';
import { db, Character } from '../lib/db';
import { CustomSelect } from '../components/CustomSelect';

export default function HybridCharacterCreate() {
  const navigate = useNavigate();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCharacter, setGeneratedCharacter] = useState<any>(null);

  // Form State
  const [baseType, setBaseType] = useState('رجل ضخم ومفتول العضلات');
  const [primaryMaterial, setPrimaryMaterial] = useState('خضروات وفواكه طازجة');
  const [secondaryMaterial, setSecondaryMaterial] = useState('بدون (مادة واحدة فقط)');
  const [style, setStyle] = useState('واقعي جداً وتفاصيل دقيقة (Hyper-realistic)');

  const baseTypes = [
    'رجل ضخم ومفتول العضلات',
    'رجل عجوز حكيم',
    'شاب رياضي وسريع',
    'امرأة محاربة قوية',
    'فتاة صغيرة ولطيفة',
    'عالم مجنون',
    'مخلوق فضائي بهيئة بشرية',
    'فارس مدرع'
  ];

  const materials = [
    'خضروات وفواكه طازجة',
    'خشب ولحاء شجر وجذور',
    'حديد ومعادن صدئة',
    'ريش طيور ملون',
    'زجاج مكسور وشفاف',
    'نار وحمم بركانية متوهجة',
    'ماء وأمواج متدفقة',
    'غيوم وعواصف رعدية',
    'كريستال وأحجار كريمة لامعة',
    'معكرونة وأطعمة',
    'أسلاك وكابلات كهربائية',
    'أوراق لعب (كوتشينة)',
    'ساعات وتروس (Steampunk)',
    'نيون وليزر مشع',
    'رمل وحصى صحراوي',
    'فضاء ونجوم ومجرات',
    'نباتات سامة وأشواك',
    'جليد وثلج متجمد'
  ];

  const secondaryMaterials = [
    'بدون (مادة واحدة فقط)',
    ...materials
  ];

  const styles = [
    'واقعي جداً وتفاصيل دقيقة (Hyper-realistic)',
    'سريالي وغريب (Surrealism)',
    'كرتوني 3D (Pixar/Disney style)',
    'أنمي ياباني (Anime style)',
    'مظلم ومرعب (Dark Fantasy / Horror)',
    'مضحك وكوميدي (Funny & Comic)',
    'رسم زيتي كلاسيكي (Oil Painting)'
  ];

  const generateCharacter = async () => {
    setIsGenerating(true);
    try {
      const prompt = `Create a highly creative, surreal hybrid character design. 
      Base Human Form: ${baseType}. 
      Primary Material forming their body: ${primaryMaterial}. 
      ${secondaryMaterial !== 'بدون (مادة واحدة فقط)' ? `Secondary Material/Accents integrated into the body: ${secondaryMaterial}.` : ''}
      Art Style: ${style}.
      
      The character must look like a seamless, imaginative blend of human anatomy and these bizarre materials. For example, if it's a vegetable man, his muscles might be made of pumpkins and vines. If it's a glass and fire man, the fire should burn inside the glass body.
      
      Make it visually striking, highly detailed, and unique. Provide a creative name for this hybrid entity and a short backstory/description.`;

      const result = await AIService.generateCharacter(prompt);
      setGeneratedCharacter(result);
    } catch (error: any) {
      console.error(error);
      alert(`فشل التوليد: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const saveCharacter = async () => {
    if (!generatedCharacter) return;

    const newCharacter: Character = {
      id: uuidv4(),
      name: generatedCharacter.name,
      description: generatedCharacter.description,
      visualTraits: generatedCharacter.description || generatedCharacter.name,
      images: {
        front: generatedCharacter.front,
        left: generatedCharacter.side,
        back: generatedCharacter.back,
        normal: generatedCharacter.front,
      },
      createdAt: Date.now(),
    };

    await db.saveCharacter(newCharacter);
    navigate('/characters');
  };

  return (
    <div className="p-4 max-w-lg mx-auto min-h-screen bg-background pb-32">
      <div className="flex items-center mb-6 pt-2">
        <button onClick={() => navigate(-1)} className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold mr-2 flex items-center gap-2 text-foreground">
          <Dna className="w-5 h-5 text-pink-500" />
          شخصية هجينة (مواد غريبة)
        </h1>
      </div>

      {!generatedCharacter ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-pink-50 text-pink-800 p-4 rounded-xl text-sm leading-relaxed border border-pink-100">
            اصنع شخصيات خيالية وسريالية من خلال دمج البشر مع مواد وأشياء لا تخطر على البال! (مثل رجل الخضروات، وحش الكريستال، أو محارب النار والزجاج).
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">الهيكل البشري الأساسي</label>
              <CustomSelect value={baseType} onChange={setBaseType} options={baseTypes} className="p-3 rounded-xl focus:ring-pink-500" />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">المادة الأساسية للجسم</label>
              <CustomSelect value={primaryMaterial} onChange={setPrimaryMaterial} options={materials} className="p-3 rounded-xl focus:ring-pink-500" />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">مادة ثانوية مدمجة (اختياري)</label>
              <CustomSelect value={secondaryMaterial} onChange={setSecondaryMaterial} options={secondaryMaterials} className="p-3 rounded-xl focus:ring-pink-500" />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">الأسلوب الفني (Style)</label>
              <CustomSelect value={style} onChange={setStyle} options={styles} className="p-3 rounded-xl focus:ring-pink-500" />
            </div>
          </div>

          <button
            onClick={generateCharacter}
            disabled={isGenerating}
            className="w-full py-4 bg-gradient-to-r from-pink-500 to-rose-600 text-white rounded-xl font-bold shadow-lg hover:from-pink-600 hover:to-rose-700 disabled:opacity-50 flex items-center justify-center gap-2 mt-8 transition-all"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>جاري دمج المواد وتوليد الشخصية...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>توليد الشخصية الهجينة</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in zoom-in-95">
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200">
            <div className="aspect-square bg-slate-100 relative">
              <img 
                src={generatedCharacter.front} 
                alt="Front View" 
                className="w-full h-full object-cover"
              />
              <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-md text-white text-xs px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" />
                النتيجة النهائية
              </div>
            </div>
            
            <div className="p-5">
              <h2 className="text-xl font-bold text-slate-900 mb-2">{generatedCharacter.name}</h2>
              <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                {generatedCharacter.description}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setGeneratedCharacter(null)}
              className="flex-1 py-3.5 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors"
            >
              إعادة المحاولة
            </button>
            <button
              onClick={saveCharacter}
              className="flex-1 py-3.5 bg-pink-600 text-white rounded-xl font-bold shadow-lg hover:bg-pink-700 flex items-center justify-center gap-2 transition-colors"
            >
              <Save className="w-5 h-5" />
              <span>حفظ الشخصية</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
