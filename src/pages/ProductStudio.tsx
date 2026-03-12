import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, ChevronRight, Loader2, Image as ImageIcon, Sparkles, Palette, Download, Check } from 'lucide-react';
import { AIService } from '../lib/aiService';
import { db, MediaItem } from '../lib/db';
import { CustomSelect } from '../components/CustomSelect';

export default function ProductStudio() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'product' | 'brand'>('product');

  // Product Shot State
  const [productName, setProductName] = useState('');
  const [background, setBackground] = useState('استوديو بخلفية بيضاء نقية');
  const [lighting, setLighting] = useState('إضاءة استوديو احترافية (Softbox)');
  const [style, setStyle] = useState('واقعي جداً (Photorealistic)');
  const [isGeneratingProduct, setIsGeneratingProduct] = useState(false);
  const [productImage, setProductImage] = useState<string | null>(null);
  const [productSaved, setProductSaved] = useState(false);

  // Brand Identity State
  const [brandDescription, setBrandDescription] = useState('');
  const [isGeneratingBrand, setIsGeneratingBrand] = useState(false);
  const [brandSaved, setBrandSaved] = useState(false);
  const [brandResult, setBrandResult] = useState<{
    names: string[];
    slogan: string;
    colors: string[];
    typography: string;
    moodboardImage: string;
  } | null>(null);

  const backgrounds = [
    'استوديو بخلفية بيضاء نقية',
    'رخام فاخر مع انعكاسات',
    'طبيعة، أوراق شجر وضوء شمس',
    'ماء متناثر (Splash)',
    'منصة خشبية ريفية',
    'إضاءة نيون سينمائية',
    'خلفية ملونة باستيل (Pastel)',
    'رمال شاطئ وصيف'
  ];

  const lightings = [
    'إضاءة استوديو احترافية (Softbox)',
    'إضاءة شمس طبيعية (Golden Hour)',
    'إضاءة درامية بظلال قوية',
    'إضاءة نيون ملونة',
    'إضاءة ساطعة جداً (High Key)'
  ];

  const styles = [
    'واقعي جداً (Photorealistic)',
    'بسيط وأنيق (Minimalist)',
    'حيوي وملون (Vibrant)',
    'فاخر وكلاسيكي (Luxury)',
    'عصري وشبابي (Modern/Pop)'
  ];

  const generateProduct = async () => {
    if (!productName.trim()) {
      alert("يرجى كتابة اسم/وصف المنتج.");
      return;
    }
    setIsGeneratingProduct(true);
    try {
      const result = await AIService.generateProductShot({
        product: productName,
        background,
        lighting,
        style
      });
      setProductImage(result);

      // Auto-save to media gallery
      const mediaItem: MediaItem = {
        id: `product-${Date.now()}`,
        type: 'image',
        title: `منتج: ${productName}`,
        description: `${background} - ${lighting} - ${style}`,
        data: result,
        source: 'product',
        createdAt: Date.now(),
      };
      await db.saveMediaItem(mediaItem);
      setProductSaved(true);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsGeneratingProduct(false);
    }
  };

  const generateBrand = async () => {
    if (!brandDescription.trim()) {
      alert("يرجى وصف مشروعك.");
      return;
    }
    setIsGeneratingBrand(true);
    try {
      const result = await AIService.generateBrandIdentity(brandDescription);
      setBrandResult(result);

      // Auto-save moodboard to media gallery
      if (result.moodboardImage) {
        const mediaItem: MediaItem = {
          id: `brand-${Date.now()}`,
          type: 'image',
          title: `هوية بصرية: ${brandDescription.slice(0, 40)}`,
          description: `شعار: ${result.slogan} | أسماء: ${result.names.join('، ')}`,
          data: result.moodboardImage,
          source: 'brand',
          createdAt: Date.now(),
        };
        await db.saveMediaItem(mediaItem);
        setBrandSaved(true);
      }
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsGeneratingBrand(false);
    }
  };

  const handleDownload = (imgUrl: string, filename: string) => {
    const a = document.createElement('a');
    a.href = imgUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="p-4 max-w-lg mx-auto min-h-screen bg-background pb-32">
      {/* Header */}
      <div className="flex items-center mb-6 pt-2">
        <button onClick={() => navigate(-1)} className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold mr-2 flex items-center gap-2 text-foreground">
          <Package className="w-5 h-5 text-sky-500" />
          استوديو المنتجات والهوية
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex bg-card rounded-xl p-1 border border-border/60 mb-6">
        <button
          onClick={() => setActiveTab('product')}
          className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${
            activeTab === 'product' ? 'bg-sky-50 text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          تصوير المنتجات
        </button>
        <button
          onClick={() => setActiveTab('brand')}
          className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${
            activeTab === 'brand' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          بناء الهوية البصرية
        </button>
      </div>

      {/* Tab 1: Product Shot */}
      {activeTab === 'product' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">وصف المنتج</label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="مثال: زجاجة عطر فاخرة، كوب قهوة سيراميك..."
                className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">الخلفية والبيئة</label>
              <CustomSelect value={background} onChange={setBackground} options={backgrounds} className="p-3 rounded-xl focus:ring-sky-500" />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">الإضاءة</label>
              <CustomSelect value={lighting} onChange={setLighting} options={lightings} className="p-3 rounded-xl focus:ring-sky-500" />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">الأسلوب (Style)</label>
              <CustomSelect value={style} onChange={setStyle} options={styles} className="p-3 rounded-xl focus:ring-sky-500" />
            </div>
          </div>

          <button
            onClick={generateProduct}
            disabled={isGeneratingProduct}
            className="w-full py-4 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-xl font-bold shadow-lg hover:from-sky-600 hover:to-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
          >
            {isGeneratingProduct ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>جاري تصوير المنتج...</span>
              </>
            ) : (
              <>
                <ImageIcon className="w-5 h-5" />
                <span>توليد صورة المنتج</span>
              </>
            )}
          </button>

          {productImage && (
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 animate-in zoom-in-95">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-slate-800">النتيجة النهائية</h2>
                {productSaved && (
                  <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                    <Check className="w-3 h-3" />
                    تم الحفظ
                  </span>
                )}
              </div>
              <div className="aspect-square rounded-xl overflow-hidden shadow-inner mb-4">
                <img src={productImage} alt="Product" className="w-full h-full object-cover" />
              </div>
              <button
                onClick={() => handleDownload(productImage, 'product-shot.png')}
                className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 flex items-center justify-center gap-2 transition-all"
              >
                <Download className="w-5 h-5" />
                <span>تحميل الصورة</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Brand Identity */}
      {activeTab === 'brand' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">فكرة المشروع / المنتج</label>
              <textarea
                value={brandDescription}
                onChange={(e) => setBrandDescription(e.target.value)}
                placeholder="مثال: مقهى مختص يقدم قهوة عضوية في أجواء كلاسيكية هادئة..."
                className="w-full h-24 p-3 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>
          </div>

          <button
            onClick={generateBrand}
            disabled={isGeneratingBrand}
            className="w-full py-4 bg-gradient-to-r from-indigo-500 to-violet-600 text-white rounded-xl font-bold shadow-lg hover:from-indigo-600 hover:to-violet-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
          >
            {isGeneratingBrand ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>جاري بناء الهوية (قد يستغرق وقتاً)...</span>
              </>
            ) : (
              <>
                <Palette className="w-5 h-5" />
                <span>ابتكار الهوية البصرية</span>
              </>
            )}
          </button>

          {brandResult && (
            <div className="space-y-4 animate-in zoom-in-95">
              {/* Names & Slogan */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">الأسماء المقترحة</h3>
                <div className="flex flex-wrap gap-2 mb-4">
                  {brandResult.names.map((name, i) => (
                    <span key={i} className="bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg text-sm font-bold border border-indigo-100">
                      {name}
                    </span>
                  ))}
                </div>
                
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">الشعار اللفظي (Slogan)</h3>
                <p className="text-slate-800 font-medium text-lg italic">"{brandResult.slogan}"</p>
              </div>

              {/* Colors & Typography */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">لوحة الألوان</h3>
                <div className="flex gap-2 mb-5">
                  {brandResult.colors.map((color, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div 
                        className="w-full aspect-square rounded-xl shadow-inner border border-slate-200" 
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-[10px] font-mono text-slate-500">{color}</span>
                    </div>
                  ))}
                </div>

                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">الخطوط المقترحة</h3>
                <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  {brandResult.typography}
                </p>
              </div>

              {/* Moodboard */}
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  لوحة الإلهام (Moodboard)
                </h3>
                <div className="aspect-video rounded-xl overflow-hidden shadow-inner mb-4">
                  <img src={brandResult.moodboardImage} alt="Moodboard" className="w-full h-full object-cover" />
                </div>
                <button
                  onClick={() => handleDownload(brandResult.moodboardImage, 'brand-moodboard.png')}
                  className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 flex items-center justify-center gap-2 transition-all"
                >
                  <Download className="w-5 h-5" />
                  <span>تحميل الـ Moodboard</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
