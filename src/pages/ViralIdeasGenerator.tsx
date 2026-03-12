import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lightbulb, ChevronRight, Loader2, Copy, Check, Zap, Hash, PlayCircle, Clapperboard, Users, Film } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { AIService } from '../lib/aiService';
import { MissingApiKeyError } from '../lib/aiProvider';
import { ApiKeyMissing } from '../components/ApiKeyMissing';
import { db, Character, Storyboard, Scene } from '../lib/db';
import { CustomSelect } from '../components/CustomSelect';

export default function ViralIdeasGenerator() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'input' | 'generating' | 'review'>('input');
  
  // Form State
  const [niche, setNiche] = useState('رعب وغموض (Horror & Mystery)');
  const [tone, setTone] = useState('غامض ومثير (Mysterious & Thrilling)');
  const [topic, setTopic] = useState('');
  const [sceneCount, setSceneCount] = useState<number>(5);
  
  // Characters State
  const [availableCharacters, setAvailableCharacters] = useState<Character[]>([]);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([]);
  
  const [generatedIdea, setGeneratedIdea] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadCharacters();
  }, []);

  const loadCharacters = async () => {
    const chars = await db.getAllCharacters();
    setAvailableCharacters(chars);
  };

  const toggleCharacter = (id: string) => {
    setSelectedCharacterIds(prev => 
      prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id]
    );
  };

  // Options
  const niches = [
    'رعب وغموض (Horror & Mystery)',
    'حقائق ومعلومات (Facts & Info)',
    'قصص واقعية (Storytime)',
    'كوميديا وترفيه (Comedy)',
    'تكنولوجيا وذكاء اصطناعي (Tech & AI)',
    'ألعاب فيديو (Gaming)',
    'تطوير الذات (Self-improvement)',
    'مال وأعمال (Finance & Business)',
    'رياضة ولياقة (Sports & Fitness)',
    'طبخ ووصفات (Cooking)'
  ];

  const tones = [
    'غامض ومثير (Mysterious & Thrilling)',
    'مضحك وساخر (Funny & Sarcastic)',
    'تعليمي ومفيد (Educational)',
    'درامي وعاطفي (Dramatic & Emotional)',
    'سريع وحماسي (Fast & Energetic)',
    'صادم ومفاجئ (Shocking)'
  ];

  const startGeneration = async () => {
    setIsProcessing(true);
    setStep('generating');
    
    try {
      let charactersString = '';
      if (selectedCharacterIds.length > 0) {
        const selectedChars = availableCharacters.filter(c => selectedCharacterIds.includes(c.id));
        charactersString = selectedChars.map(c => `${c.name} (${c.description})`).join(', ');
      }

      const idea = await AIService.generateViralShortIdea({
        niche,
        tone,
        topic,
        characters: charactersString,
        sceneCount
      });
      
      setGeneratedIdea(idea);
      setStep('review');
    } catch (error: any) {
      console.error(error);
      alert(`فشل التوليد: ${error.message}`);
      setStep('input');
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = () => {
    if (!generatedIdea) return;
    
    const scriptText = generatedIdea.script.map((s: any) => `[${s.time}] المشهد: ${s.visual}\nالصوت: ${s.audio}`).join('\n\n');
    const fullText = `العنوان: ${generatedIdea.title}\n\nالخطاف (Hook): ${generatedIdea.hook}\n\nالفكرة البصرية: ${generatedIdea.visualConcept}\n\nالسيناريو:\n${scriptText}\n\nالنهاية (CTA): ${generatedIdea.cta}\n\nالهاشتاجات: ${generatedIdea.tags.map((t: string) => '#' + t).join(' ')}`;
    
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const convertToStoryboard = async () => {
    if (!generatedIdea) return;

    const scenes: Scene[] = generatedIdea.script.map((s: any) => ({
      id: uuidv4(),
      description: s.visual,
      dialogue: s.audio,
      characterIds: selectedCharacterIds
    }));

    const newStoryboard: Storyboard = {
      id: uuidv4(),
      title: generatedIdea.title,
      script: `الخطاف: ${generatedIdea.hook}\n\nالفكرة البصرية: ${generatedIdea.visualConcept}\n\nالنهاية: ${generatedIdea.cta}`,
      characters: selectedCharacterIds,
      scenes: scenes,
      aspectRatio: '9:16', // Shorts are vertical
      createdAt: Date.now()
    };

    await db.saveStoryboard(newStoryboard);
    navigate(`/storyboards?tab=studio&storyId=${newStoryboard.id}`);
  };

  return (
    <div className="p-4 max-w-lg mx-auto min-h-screen bg-background pb-32">
      {/* Header */}
      <div className="flex items-center mb-6 pt-2">
        <button onClick={() => navigate(-1)} className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold mr-2 flex items-center gap-2 text-foreground">
          <Lightbulb className="w-5 h-5 text-amber-500" />
          أفكار فيروسية (Shorts)
        </h1>
      </div>

      {step === 'input' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-amber-50 text-amber-800 p-4 rounded-xl text-sm leading-relaxed border border-amber-100">
            احصل على أفكار وسيناريوهات كاملة لفيديوهات قصيرة (Shorts/TikTok) مصممة خصيصاً للانتشار السريع (Viral) وجذب الانتباه في أول 3 ثوانٍ!
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">مجال القناة (Niche)</label>
              <CustomSelect value={niche} onChange={setNiche} options={niches} className="p-3 rounded-xl focus:ring-amber-500" />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">أسلوب الفيديو (Tone)</label>
              <CustomSelect value={tone} onChange={setTone} options={tones} className="p-3 rounded-xl focus:ring-amber-500" />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">موضوع محدد (اختياري)</label>
              <input 
                type="text" 
                value={topic} 
                onChange={(e) => setTopic(e.target.value)} 
                className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-amber-500" 
                placeholder="مثال: قصة اختفاء سفينة ماري سيليست..." 
              />
              <p className="text-xs text-slate-500 mt-1">اتركه فارغاً وسيقوم الذكاء الاصطناعي باقتراح موضوع تريند.</p>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">عدد المشاهد (Scenes)</label>
              <div className="flex items-center gap-4">
                <input 
                  type="range" 
                  min="3" 
                  max="10" 
                  value={sceneCount} 
                  onChange={(e) => setSceneCount(parseInt(e.target.value))}
                  className="w-full accent-amber-500"
                />
                <span className="font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-lg">{sceneCount}</span>
              </div>
            </div>

            {availableCharacters.length > 0 && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-500" />
                  تضمين شخصيات من مكتبتك (اختياري)
                </label>
                <div className="flex gap-2 overflow-x-auto pb-2 snap-x">
                  {availableCharacters.map(char => {
                    const isSelected = selectedCharacterIds.includes(char.id);
                    return (
                      <button
                        key={char.id}
                        onClick={() => toggleCharacter(char.id)}
                        className={`flex-shrink-0 w-20 flex flex-col items-center gap-1 snap-start transition-all ${isSelected ? 'opacity-100 scale-105' : 'opacity-50 hover:opacity-75'}`}
                      >
                        <div className={`w-16 h-16 rounded-full overflow-hidden border-2 ${isSelected ? 'border-amber-500 shadow-md' : 'border-transparent'}`}>
                          <img src={char.images.front || char.images.normal} alt={char.name} className="w-full h-full object-cover" />
                        </div>
                        <span className="text-[10px] font-medium text-slate-700 truncate w-full text-center">{char.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={startGeneration}
            className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold shadow-lg hover:from-amber-600 hover:to-orange-600 flex items-center justify-center gap-2 mt-8"
          >
            <Zap className="w-5 h-5" />
            <span>توليد فكرة فيروسية</span>
          </button>
        </div>
      )}

      {step === 'generating' && (
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-6 text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-amber-500 blur-xl opacity-20 animate-pulse rounded-full"></div>
            <Loader2 className="w-16 h-16 text-amber-500 animate-spin relative z-10" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">جاري تحليل التريندات...</h3>
            <p className="text-slate-500 mt-2">نكتب سيناريو يخطف الانتباه في أول 3 ثوانٍ 🚀</p>
          </div>
        </div>
      )}

      {step === 'review' && generatedIdea && (
        <div className="space-y-6 animate-in fade-in zoom-in-95">
          
          {/* Title & Hook */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-5 text-white shadow-xl">
            <h2 className="text-xl font-bold mb-4 leading-tight text-amber-400">{generatedIdea.title}</h2>
            
            <div className="bg-white/10 p-3 rounded-xl border border-white/10 mb-4">
              <div className="flex items-center gap-2 text-amber-300 text-xs font-bold mb-1 uppercase tracking-wider">
                <Zap className="w-4 h-4" /> الخطاف (أول 3 ثوانٍ)
              </div>
              <p className="text-sm leading-relaxed font-medium">"{generatedIdea.hook}"</p>
            </div>
            
            <div className="text-sm text-slate-300">
              <span className="font-bold text-white">الفكرة البصرية:</span> {generatedIdea.visualConcept}
            </div>
          </div>

          {/* Script */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-slate-50 p-3 border-b border-slate-200 flex items-center gap-2">
              <Clapperboard className="w-5 h-5 text-slate-500" />
              <h3 className="font-bold text-slate-800">السيناريو (السكريبت)</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {generatedIdea.script.map((scene: any, idx: number) => (
                <div key={idx} className="p-4 flex gap-3">
                  <div className="text-xs font-mono font-bold text-indigo-500 bg-indigo-50 px-2 py-1 rounded h-fit whitespace-nowrap">
                    {scene.time}
                  </div>
                  <div className="space-y-2 flex-1">
                    <p className="text-sm text-slate-600"><span className="font-bold text-slate-800">المشهد:</span> {scene.visual}</p>
                    <p className="text-sm text-slate-800 bg-slate-50 p-2 rounded-lg border border-slate-100"><span className="font-bold text-amber-600">الصوت:</span> "{scene.audio}"</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA & Tags */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
            <div>
              <div className="flex items-center gap-2 text-slate-700 text-xs font-bold mb-1">
                <PlayCircle className="w-4 h-4" /> النهاية (Call to Action)
              </div>
              <p className="text-sm font-medium text-slate-900">"{generatedIdea.cta}"</p>
            </div>
            
            <div>
              <div className="flex items-center gap-2 text-slate-700 text-xs font-bold mb-2">
                <Hash className="w-4 h-4" /> الهاشتاجات المقترحة
              </div>
              <div className="flex flex-wrap gap-2">
                {generatedIdea.tags.map((tag: string, idx: number) => (
                  <span key={idx} className="text-xs bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded-md">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 pb-8">
            <button
              onClick={convertToStoryboard}
              className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 flex items-center justify-center gap-2 transition-all"
            >
              <Film className="w-5 h-5" />
              <span>تحويل إلى مشروع فيديو (Storyboard)</span>
            </button>
            <button
              onClick={copyToClipboard}
              className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold shadow-lg hover:bg-slate-800 flex items-center justify-center gap-2 transition-all"
            >
              {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
              <span>{copied ? 'تم النسخ بنجاح!' : 'نسخ السيناريو بالكامل'}</span>
            </button>
            <button
              onClick={() => {
                setGeneratedIdea(null);
                setStep('input');
              }}
              className="w-full py-3 text-slate-500 font-medium text-sm hover:text-slate-700"
            >
              توليد فكرة أخرى
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
