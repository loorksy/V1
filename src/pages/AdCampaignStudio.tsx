import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone, ChevronRight, Loader2, Save, Image as ImageIcon, Download, Palette, Edit3, Type, DollarSign, Phone, Upload, Layout, Sparkles, Briefcase, User } from 'lucide-react';
import { AIService } from '../lib/aiService';
import { CustomSelect } from '../components/CustomSelect';
import { db, Character } from '../lib/db';

interface BrandProfile {
  name: string;
  industry: string;
  primaryColor: string;
  secondaryColor: string;
  visualStyle: string;
  largeText?: string;
  smallText?: string;
  phoneNumber?: string;
  logoBase64?: string;
  elementsPosition?: string;
  language?: string;
  fontType?: string;
  textColor?: string;
  textStyle?: string;
  aspectRatio?: string;
  imageSize?: string;
}

const textStyleOptions = [
  'بدون تأثير (Normal)', '3D بارز (Extruded 3D)', '2D مسطح (Flat 2D)', 'زجاجي شفاف (Glassmorphism)', 
  'نيون مضيء (Glowing Neon)', 'معدني ذهبي (Metallic Gold)', 'معدني فضي (Metallic Silver)', 
  'معدني كروم (Chrome)', 'خشبي محفور (Carved Wood)', 'حجري / صخري (Stone / Rock)', 
  'ناري / مشتعل (On Fire)', 'مائي / سائل (Liquid / Water)', 'ثلجي / متجمد (Ice / Frozen)', 
  'بلاستيكي لامع (Glossy Plastic)', 'مطاطي (Rubber / Balloon)', 'قماشي / مطرز (Fabric / Embroidered)', 
  'جلدي (Leather Texture)', 'ورقي مقصوص (Paper Cutout)', 'طباشيري (Chalkboard)', 
  'ألوان مائية (Watercolor)', 'زيتي (Oil Painting)', 'بيكسل آرت (Pixel Art)', 
  'سايبربانك (Cyberpunk Glitch)', 'هولوجرام (Holographic)', 'ريترو 80s (Retro 80s Synthwave)', 
  'جرنج / متهالك (Grunge / Distressed)', 'فقاعات صابون (Soap Bubbles)', 'أوراق شجر (Foliage / Plant)', 
  'غيوم / دخان (Clouds / Smoke)', 'رملي (Sand / Desert)', 'شوكولاتة ذائبة (Melted Chocolate)', 
  'حلوى جيلي (Jelly Candy)', 'كريستال / ألماس (Crystal / Diamond)', 'رخامي (Marble Texture)', 
  'فسيفساء (Mosaic)', 'زجاج ملون (Stained Glass)', 'أضواء ليد (LED Matrix)', 
  'أسلاك نيون (Neon Wire)', 'بخاخ جرافيتي (Graffiti Spray)', 'شريط لاصق (Duct Tape)', 
  'كرتون مضلع (Cardboard)', 'فرو / قطيفة (Fur / Fluffy)', 'تروس ميكانيكية (Steampunk Gears)', 
  'دوائر كهربائية (Circuit Board)', 'طين صلصال (Claymation)', 'أوريغامي (Origami)', 
  'خيوط صوف (Knitted Wool)', 'أضواء بوكيه (Bokeh Lights)', 'زجاج مكسور (Shattered Glass)', 
  'حبر متناثر (Ink Splatter)', 'طباعة حريرية (Screen Print)'
];

const aspectRatioOptions = ['1:1', '3:4', '4:3', '9:16', '16:9'];
const imageSizeOptions = ['1K', '2K', '4K'];

export default function AdCampaignStudio() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const extraImageRef = useRef<HTMLInputElement>(null);
  
  const [brandProfile, setBrandProfile] = useState<BrandProfile>({
    name: 'علامتي التجارية',
    industry: 'عام (General)',
    primaryColor: 'أزرق داكن',
    secondaryColor: '#1b2338',
    visualStyle: '3D كرتوني لطيف (Claymation/3D Icon)',
    elementsPosition: 'توزيع حر ومناسب للتصميم (Dynamic Layout)',
    language: 'العربية (Arabic)',
    fontType: 'خط هندسي حديث (Modern Geometric)',
    textColor: '#e9edff',
    textStyle: 'بدون تأثير (Normal)',
    aspectRatio: '3:4',
    imageSize: '2K'
  });
  
  const [isEditingBrand, setIsEditingBrand] = useState(true);
  
  // Post Generation State
  const [postTopic, setPostTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [isMultiPost, setIsMultiPost] = useState(false);
  
  // New Features State
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>('');
  const [extraImageBase64, setExtraImageBase64] = useState<string | null>(null);
  const [isImprovingText, setIsImprovingText] = useState(false);

  const industryOptions = [
    'عام (General)',
    'طبيب أسنان (Dentist)',
    'عيادة طبية (Medical Clinic)',
    'حداد / ورشة (Blacksmith / Workshop)',
    'مهندس / مكتب هندسي (Engineer / Engineering)',
    'مقاولات وبناء (Construction)',
    'مطعم / كافيه (Restaurant / Cafe)',
    'عقارات (Real Estate)',
    'تقنية وبرمجيات (Tech / Software)',
    'صالون تجميل (Beauty Salon)',
    'ملابس وأزياء (Fashion & Apparel)',
    'سيارات / معارض (Automotive)',
    'تعليم وتدريب (Education & Training)',
    'سياحة وسفر (Travel & Tourism)',
    'صحة ولياقة / جيم (Health & Fitness / Gym)',
    'تجارة إلكترونية (E-commerce)',
    'خدمات تنظيف (Cleaning Services)',
    'تصوير ومونتاج (Photography / Video)',
    'أثاث وديكور (Furniture & Decor)',
    'مخبز / حلويات (Bakery / Pastry)',
    'محاماة واستشارات (Law & Consulting)',
    'أخرى (Other)'
  ];

  const styleOptions = [
    '3D كرتوني لطيف (Claymation/3D Icon)',
    '3D واقعي ومفصل (Realistic 3D Render)',
    '3D لامع ومعدني (Glossy/Metallic 3D)',
    '3D نيون ومضيء (Neon/Glowing 3D)',
    'مسطح وحديث (Flat Modern Vector)',
    'دمج صوري سريالي (Surreal Photo Manipulation)',
    'مينيماليست / بسيط (Minimalist & Clean)',
    'بوب آرت (Pop Art)',
    'سايبربانك / نيون (Cyberpunk / Neon)',
    'فاخر وأنيق (Luxury & Elegant)',
    'كلاسيكي عتيق (Vintage / Retro 80s)',
    'ألوان مائية فنية (Watercolor Art)',
    'رسم يدوي (Hand-drawn / Sketch)',
    'هندسي تجريدي (Abstract Geometric)',
    'كولاج فني (Artistic Collage)',
    'تصوير فوتوغرافي سينمائي (Cinematic Photography)',
    'أسلوب المجلات (Editorial Magazine Style)',
    'إيزومتريك (Isometric Design)',
    'جرنج / متمرد (Grunge / Edgy)',
    'طبيعي وعضوي (Natural & Organic)',
    'تيبوغرافي جريء (Bold Typography Focus)',
    'أسلوب الميمز (Meme / Internet Culture Style)',
    'بيكسل آرت (Pixel Art / 8-bit)',
    'أسلوب الورق المقصوص (Paper Cutout Style)',
    'ديستوبيا مستقبلية (Futuristic Dystopia)',
    'أسلوب المانجا/الأنمي (Manga / Anime Style)',
    'أسلوب لوحات النيون (Neon Signage)',
    'أسلوب الطباعة الحريرية (Screen Printing Style)',
    'أسلوب الرسوم البيانية (Infographic Style)',
    'أسلوب الألوان المتدرجة (Vibrant Gradients / Holographic)',
    'أسلوب التغليف الفاخر (Premium Packaging Style)',
    'أسلوب الشارع / جرافيتي (Street Art / Graffiti)',
    'أسلوب الخيال العلمي (Sci-Fi Concept Art)',
    'أسلوب القصص المصورة (Comic Book Style)',
    'أسلوب الفن الإسلامي/الزخارف (Islamic Art / Arabesque)',
    'أسلوب الباستيل الناعم (Soft Pastel Aesthetic)',
    'أسلوب الفن البصري (Op Art / Optical Illusion)',
    'أسلوب ستيم بانك (Steampunk)',
    'أسلوب الفن التكعيبي (Cubism Inspired)',
    'أسلوب الفن السريالي (Dali-esque Surrealism)',
    'أسلوب الألوان المتباينة (Duotone / High Contrast)',
    'أسلوب الفن الشعبي (Folk Art)',
    'أسلوب الفسيفساء (Mosaic Art)',
    'أسلوب الزجاج الملون (Stained Glass)',
    'أسلوب الفن الرقمي السائل (Liquid Digital Art)',
    'أسلوب الفن الحركي (Kinetic Typography/Art)',
    'أسلوب الفن البيئي (Eco-Friendly / Green Art)',
    'أسلوب الفن الصناعي (Industrial Design Aesthetic)',
    'أسلوب الفن الفضائي (Cosmic / Space Art)',
    'أسلوب الفن الكريستالي (Crystal / Gemstone Render)'
  ];

  const positionOptions = [
    'توزيع حر ومناسب للتصميم (Dynamic Layout)',
    'أعلى اليمين (Top Right)',
    'أعلى اليسار (Top Left)',
    'أعلى المنتصف (Top Center)',
    'أسفل اليمين (Bottom Right)',
    'أسفل اليسار (Bottom Left)',
    'أسفل المنتصف (Bottom Center)',
    'في المنتصف (Center)'
  ];

  const languageOptions = [
    'العربية (Arabic)',
    'الإنجليزية (English)',
    'مزيج عربي/إنجليزي (Mixed Arabic/English)',
    'الفرنسية (French)',
    'الإسبان��ة (Spanish)',
    'الألمانية (German)',
    'اليابانية (Japanese)',
    'الكورية (Korean)'
  ];

  const fontOptions = [
    // الخطوط العربية
    'خط هندسي حديث (Modern Geometric)',
    'كوفي (Kufi - Geometric & Classic)',
    'رقعة (Ruq\'ah - Handwriting)',
    'ديواني (Diwani - Calligraphy)',
    'ثلث (Thuluth - Elegant Calligraphy)',
    'نسخ (Naskh - Standard Reading)',
    'فارسي/نستعليق (Farsi/Nastaliq)',
    'مغربي (Maghrebi)',
    'خط حر/توقيع (Freehand/Signature)',
    'خط عريض/عناوين (Bold/Display)',
    // الخطوط الإنجليزية والعامة
    'Serif (تقليدي/كلاسيكي)',
    'Sans-Serif (حديث/بدون زوائد)',
    'Script/Handwriting (كتابة يدوية)',
    'Monospace (آلة كاتبة)',
    'Display/Decorative (عناوين مزخرفة)',
    'Comic/Playful (مرح/كرتوني)',
    'Grunge/Distressed (متهالك/جرنج)',
    'Neon/Glowing (نيون مضيء)',
    'Pixel/8-bit (بكسل)',
    'Gothic/Blackletter (قوطي)',
    'Retro/Vintage (كلاسيكي قديم)',
    'Futuristic/Sci-Fi (مستقبلي)',
    'Stencil (استنسل/عسكري)',
    'Brush/Marker (فرشاة/قلم عريض)',
    'Typewriter (آلة كاتبة كلاسيكية)'
  ];

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isSavingToGallery, setIsSavingToGallery] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('brand_profile');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.style3D && !parsed.visualStyle) {
        parsed.visualStyle = parsed.style3D;
        delete parsed.style3D;
      }
      if (!parsed.industry) parsed.industry = 'عام (General)';
      setBrandProfile(parsed);
      setIsEditingBrand(false);
    }
    
    // Load characters
    db.getAllCharacters().then(setCharacters);
  }, []);

  const saveBrandProfile = () => {
    if (!brandProfile.name.trim()) {
      alert("يرجى إدخال اسم العلامة التجارية.");
      return;
    }
    localStorage.setItem('brand_profile', JSON.stringify(brandProfile));
    setIsEditingBrand(false);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setBrandProfile({...brandProfile, logoBase64: reader.result as string});
      };
      reader.readAsDataURL(file);
    }
  };

  const handleExtraImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setExtraImageBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const improveText = async () => {
    if (!postTopic.trim()) {
      alert("يرجى كتابة موضوع الإعلان أولاً (مثال: خصم على النظارات).");
      return;
    }

    setIsImprovingText(true);
    try {
      const result = await AIService.improveAdCopy(postTopic, brandProfile.industry);
      setBrandProfile(prev => ({
        ...prev,
        largeText: result.largeText,
        smallText: result.smallText
      }));
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsImprovingText(false);
    }
  };

  const [isImprovingIdea, setIsImprovingIdea] = useState(false);

  const improveIdea = async () => {
    if (!postTopic.trim()) {
      alert("يرجى كتابة فكرة مبدئية أولاً ليتم تحسينها.");
      return;
    }

    setIsImprovingIdea(true);
    try {
      const improved = await AIService.improveAdIdea(postTopic, brandProfile.industry);
      if (improved?.trim()) setPostTopic(improved.trim());
    } catch (error: any) {
      alert("حدث خطأ أثناء تحسين الفكرة: " + error.message);
    } finally {
      setIsImprovingIdea(false);
    }
  };

  const generateAd = async () => {
    if (!postTopic.trim()) {
      alert("يرجى كتابة موضوع الإعلان.");
      return;
    }

    setIsGenerating(true);
    try {
      let characterImageBase64 = undefined;
      if (selectedCharacterId) {
        const char = characters.find(c => c.id === selectedCharacterId);
        if (char && char.imageUrl) {
          characterImageBase64 = char.imageUrl;
        }
      }

      const adParams = {
        topic: postTopic,
        brandName: brandProfile.name,
        industry: brandProfile.industry,
        primaryColor: brandProfile.primaryColor,
        secondaryColor: brandProfile.secondaryColor,
        visualStyle: brandProfile.visualStyle,
        largeText: brandProfile.largeText?.trim() || undefined,
        smallText: brandProfile.smallText?.trim() || undefined,
        phoneNumber: brandProfile.phoneNumber?.trim() || undefined,
        logoBase64: brandProfile.logoBase64 || undefined,
        elementsPosition: brandProfile.elementsPosition || undefined,
        language: brandProfile.language || undefined,
        fontType: brandProfile.fontType || undefined,
        textColor: brandProfile.textColor || undefined,
        textStyle: brandProfile.textStyle || undefined,
        aspectRatio: brandProfile.aspectRatio || '3:4',
        imageSize: brandProfile.imageSize || '2K',
        extraImageBase64: extraImageBase64 || undefined,
        characterImageBase64: characterImageBase64
      };

      if (isMultiPost) {
        const results = await AIService.generateAdCampaign(adParams);
        setGeneratedImages(results);
      } else {
        const result = await AIService.generateAdPoster(adParams);
        setGeneratedImages([result]);
      }
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsGenerating(false);
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

  const saveToGallery = async () => {
    if (generatedImages.length === 0) return;
    setIsSavingToGallery(true);
    try {
      const campaign = {
        id: Date.now().toString(),
        title: postTopic || 'حملة إعلانية جديدة',
        images: generatedImages,
        createdAt: Date.now()
      };
      await db.saveAdCampaign(campaign);
      alert('تم حفظ الصور في المعرض بنجاح!');
    } catch (error: any) {
      alert('حدث خطأ أثناء الحفظ: ' + error.message);
    } finally {
      setIsSavingToGallery(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto min-h-screen bg-background pb-32 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 flex items-center justify-center bg-card rounded-full border border-border/60 text-muted-foreground hover:text-foreground hover:shadow-sm transition-all">
            <ChevronRight className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              استوديو الإعلانات الاحترافي
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">صمم إعلانات بمستوى وكالات الدعاية العالمية</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Settings (Takes 7 columns on large screens) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Brand Profile Section */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100/60 transition-all hover:shadow-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Palette className="w-5 h-5 text-indigo-500" />
                الهوية البصرية للعلامة التجارية
              </h2>
              {!isEditingBrand && (
                <button 
                  onClick={() => setIsEditingBrand(true)}
                  className="text-sm text-indigo-600 font-bold flex items-center gap-1 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-full transition-colors"
                >
                  <Edit3 className="w-4 h-4" />
                  تعديل الهوية
                </button>
              )}
            </div>

            {isEditingBrand ? (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Basic Info Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">اسم العلامة التجارية</label>
                    <input
                      type="text"
                      value={brandProfile.name}
                      onChange={(e) => setBrandProfile({...brandProfile, name: e.target.value})}
                      className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                      placeholder="مثال: مطعم السعادة"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">مجال العمل / الصناعة</label>
                    <CustomSelect 
                      value={brandProfile.industry || industryOptions[0]} 
                      onChange={(val) => setBrandProfile({...brandProfile, industry: val})} 
                      options={industryOptions} 
                      className="p-3 rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:ring-indigo-500/20 focus:border-indigo-500 text-sm transition-all" 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">اللون الأساسي</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                        <div className="w-4 h-4 rounded-full border border-slate-200 shadow-sm" style={{ backgroundColor: brandProfile.primaryColor.includes('#') ? brandProfile.primaryColor : '#4f46e5' }}></div>
                      </div>
                      <input
                        type="text"
                        value={brandProfile.primaryColor}
                        onChange={(e) => setBrandProfile({...brandProfile, primaryColor: e.target.value})}
                        className="w-full p-3 pr-10 border border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                        placeholder="مثال: أزرق داكن أو #1e3a8a"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">اللون الثانوي</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                        <div className="w-4 h-4 rounded-full border border-slate-200 shadow-sm" style={{ backgroundColor: brandProfile.secondaryColor.includes('#') ? brandProfile.secondaryColor : '#1b2338' }}></div>
                      </div>
                      <input
                        type="text"
                        value={brandProfile.secondaryColor}
                        onChange={(e) => setBrandProfile({...brandProfile, secondaryColor: e.target.value})}
                        className="w-full p-3 pr-10 border border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                        placeholder="مثال: أبيض أو #ffffff"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">الأسلوب البصري (Visual Style)</label>
                  <CustomSelect 
                    value={brandProfile.visualStyle} 
                    onChange={(val) => setBrandProfile({...brandProfile, visualStyle: val})} 
                    options={styleOptions} 
                    className="p-3 rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:ring-indigo-500/20 focus:border-indigo-500 text-sm transition-all" 
                  />
                  <p className="text-[10px] text-slate-400 mt-1">اختر الأسلوب الذي يعكس شخصية علامتك التجارية بدقة.</p>
                </div>

                {/* Additional Elements */}
                <div className="pt-6 border-t border-slate-100 space-y-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Layout className="w-4 h-4 text-indigo-500" />
                      محتوى الإعلان الثابت
                    </h3>
                    <button 
                      onClick={improveText}
                      disabled={isImprovingText}
                      className="text-xs bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-3 py-1.5 rounded-full font-bold flex items-center gap-1.5 hover:shadow-md hover:opacity-90 disabled:opacity-50 transition-all"
                    >
                      {isImprovingText ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      صياغة احترافية (AI)
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">لغة النصوص</label>
                      <CustomSelect 
                        value={brandProfile.language || languageOptions[0]} 
                        onChange={(val) => setBrandProfile({...brandProfile, language: val})} 
                        options={languageOptions} 
                        className="p-2.5 rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white text-xs transition-all" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">نوع الخط</label>
                      <CustomSelect 
                        value={brandProfile.fontType || fontOptions[0]} 
                        onChange={(val) => setBrandProfile({...brandProfile, fontType: val})} 
                        options={fontOptions} 
                        className="p-2.5 rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white text-xs transition-all" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">لون النص</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                          <div className="w-4 h-4 rounded-full border border-slate-200 shadow-sm" style={{ backgroundColor: brandProfile.textColor?.includes('#') ? brandProfile.textColor : '#e9edff' }}></div>
                        </div>
                        <input
                          type="text"
                          value={brandProfile.textColor || '#e9edff'}
                          onChange={(e) => setBrandProfile({...brandProfile, textColor: e.target.value})}
                          className="w-full p-2.5 pr-10 border border-slate-200 rounded-xl text-xs bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                          placeholder="مثال: أبيض أو #ffffff"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">تأثير النص (50 نمط)</label>
                      <CustomSelect 
                        value={brandProfile.textStyle || textStyleOptions[0]} 
                        onChange={(val) => setBrandProfile({...brandProfile, textStyle: val})} 
                        options={textStyleOptions} 
                        className="p-2.5 rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white text-xs transition-all" 
                      />
                    </div>
                  </div>

                  <div className="space-y-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100/50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm border border-slate-100 shrink-0">
                        <Type className="w-4 h-4 text-slate-400" />
                      </div>
                      <input
                        type="text"
                        value={brandProfile.largeText || ''}
                        onChange={(e) => setBrandProfile({...brandProfile, largeText: e.target.value})}
                        placeholder="العنوان الرئيسي (مثال: خصم حصري!)"
                        className="flex-1 p-2.5 border-b border-slate-200 bg-transparent focus:border-indigo-500 outline-none text-sm font-bold text-slate-800 placeholder:font-normal transition-colors"
                      />
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm border border-slate-100 shrink-0">
                        <Type className="w-4 h-4 text-slate-400" />
                      </div>
                      <input
                        type="text"
                        value={brandProfile.smallText || ''}
                        onChange={(e) => setBrandProfile({...brandProfile, smallText: e.target.value})}
                        placeholder="الوصف الفرعي (مثال: تسوق الآن واستمتع بأفضل العروض)"
                        className="flex-1 p-2.5 border-b border-slate-200 bg-transparent focus:border-indigo-500 outline-none text-sm text-slate-600 transition-colors"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm border border-slate-100 shrink-0">
                          <Phone className="w-4 h-4 text-slate-400" />
                        </div>
                        <input
                          type="text"
                          value={brandProfile.phoneNumber || ''}
                          onChange={(e) => setBrandProfile({...brandProfile, phoneNumber: e.target.value})}
                          placeholder="رقم التواصل"
                          className="flex-1 p-2.5 border-b border-slate-200 bg-transparent focus:border-indigo-500 outline-none text-sm text-slate-800 transition-colors"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">شعار العلامة التجارية (Logo)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          accept="image/*"
                          ref={fileInputRef}
                          onChange={handleLogoUpload}
                          className="hidden"
                        />
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className={`flex-1 p-3 border border-dashed rounded-xl text-sm transition-all flex items-center justify-center gap-2 ${brandProfile.logoBase64 ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'}`}
                        >
                          <Upload className="w-4 h-4" />
                          {brandProfile.logoBase64 ? 'تم رفع الشعار ✓' : 'اختر صورة الشعار'}
                        </button>
                        {brandProfile.logoBase64 && (
                          <button 
                            onClick={() => setBrandProfile({...brandProfile, logoBase64: undefined})}
                            className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-colors border border-red-100"
                            title="إزالة الشعار"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">موقع العناصر في التصميم</label>
                      <CustomSelect 
                        value={brandProfile.elementsPosition || positionOptions[0]} 
                        onChange={(val) => setBrandProfile({...brandProfile, elementsPosition: val})} 
                        options={positionOptions} 
                        className="p-3 rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white text-sm transition-all" 
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={saveBrandProfile}
                  className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg"
                >
                  <Save className="w-5 h-5" />
                  <span>حفظ الهوية البصرية</span>
                </button>
              </div>
            ) : (
              <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-200/60 animate-in fade-in">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-black text-slate-900">{brandProfile.name}</h3>
                    <div className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
                      <Briefcase className="w-4 h-4 text-slate-400" />
                      {brandProfile.industry}
                    </div>
                  </div>
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-bold border border-emerald-200">
                    هوية نشطة
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-white p-3 rounded-xl border border-slate-100">
                    <span className="block text-[10px] text-slate-400 font-bold uppercase mb-1">الألوان</span>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full shadow-sm border border-slate-200" style={{ backgroundColor: brandProfile.primaryColor.includes('#') ? brandProfile.primaryColor : '#eee' }}></div>
                      <div className="w-5 h-5 rounded-full shadow-sm border border-slate-200" style={{ backgroundColor: brandProfile.secondaryColor.includes('#') ? brandProfile.secondaryColor : '#eee' }}></div>
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-100">
                    <span className="block text-[10px] text-slate-400 font-bold uppercase mb-1">الأسلوب</span>
                    <span className="text-xs font-bold text-slate-700 truncate block">{brandProfile.visualStyle.split('(')[0]}</span>
                  </div>
                </div>
                
                {/* Show saved elements summary */}
                {(brandProfile.largeText || brandProfile.phoneNumber || brandProfile.logoBase64) && (
                  <div className="pt-4 border-t border-slate-200/60 flex flex-wrap gap-2">
                    {brandProfile.largeText && <span className="text-[11px] bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-slate-600 font-medium">نص كبير</span>}
                    {brandProfile.smallText && <span className="text-[11px] bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-slate-600 font-medium">نص صغير</span>}
                    {brandProfile.phoneNumber && <span className="text-[11px] bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-slate-600 font-medium">هاتف</span>}
                    {brandProfile.logoBase64 && <span className="text-[11px] bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-slate-600 font-medium">شعار</span>}
                    {brandProfile.language && <span className="text-[11px] bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg text-indigo-700 font-medium">{brandProfile.language.split(' ')[0]}</span>}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Right Column: Generation & Result (Takes 5 columns on large screens) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Post Generation Section */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100/60 transition-all hover:shadow-md">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-5">
              <ImageIcon className="w-5 h-5 text-indigo-500" />
              إعداد الإعلان
            </h2>
            
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">أبعاد الصورة</label>
                  <CustomSelect 
                    value={brandProfile.aspectRatio || aspectRatioOptions[1]} 
                    onChange={(val) => setBrandProfile({...brandProfile, aspectRatio: val})} 
                    options={aspectRatioOptions} 
                    className="p-2.5 rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white text-xs transition-all" 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">جودة الصورة</label>
                  <CustomSelect 
                    value={brandProfile.imageSize || imageSizeOptions[1]} 
                    onChange={(val) => setBrandProfile({...brandProfile, imageSize: val})} 
                    options={imageSizeOptions} 
                    className="p-2.5 rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white text-xs transition-all" 
                  />
                </div>
              </div>

              {/* Campaign Type Toggle */}
              <div className="flex bg-slate-100 p-1.5 rounded-xl">
                <button
                  onClick={() => setIsMultiPost(false)}
                  className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${!isMultiPost ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  صورة واحدة
                </button>
                <button
                  onClick={() => setIsMultiPost(true)}
                  className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${isMultiPost ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  حملة متسلسلة (4 صور)
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-bold text-slate-700">الفكرة / الموضوع</label>
                  {!isEditingBrand && (
                    <button 
                      onClick={improveIdea}
                      disabled={isImprovingIdea || !postTopic.trim()}
                      className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md font-bold flex items-center gap-1 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                    >
                      {isImprovingIdea ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      تحسين الفكرة (AI)
                    </button>
                  )}
                </div>
                <textarea
                  value={postTopic}
                  onChange={(e) => setPostTopic(e.target.value)}
                  placeholder="صف فكرة الإعلان بدقة... (مثال: إعلان تشويقي لمنتج جديد بخلفية سينمائية)"
                  className="w-full h-28 p-4 border border-slate-200 rounded-2xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none resize-none transition-all"
                  disabled={isEditingBrand}
                />
                {isEditingBrand && (
                  <p className="text-xs text-amber-600 mt-2 font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    احفظ الهوية أولاً لتفعيل التصميم
                  </p>
                )}
              </div>

              {/* New Additions: Extra Image & Character Selection */}
              {!isEditingBrand && (
                <div className="pt-5 border-t border-slate-100 space-y-4">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">عناصر إضافية للتصميم</h3>
                  
                  <div className="space-y-3">
                    {/* Extra Image Upload */}
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        ref={extraImageRef}
                        onChange={handleExtraImageUpload}
                        className="hidden"
                      />
                      <button
                        onClick={() => extraImageRef.current?.click()}
                        className={`flex-1 p-3 border border-dashed rounded-xl text-sm transition-all flex items-center justify-center gap-2 ${extraImageBase64 ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'}`}
                      >
                        <ImageIcon className="w-4 h-4" />
                        {extraImageBase64 ? 'تم إرفاق صورة المنتج ✓' : 'إرفاق صورة منتج (اختياري)'}
                      </button>
                      {extraImageBase64 && (
                        <button 
                          onClick={() => setExtraImageBase64(null)}
                          className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-colors border border-red-100"
                        >
                          ×
                        </button>
                      )}
                    </div>

                    {/* Character Selection */}
                    {characters.length > 0 && (
                      <div className="relative">
                        <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                          <User className="w-4 h-4 text-slate-400" />
                        </div>
                        <select
                          value={selectedCharacterId}
                          onChange={(e) => setSelectedCharacterId(e.target.value)}
                          className="w-full p-3 pr-10 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all appearance-none"
                        >
                          <option value="">بدون شخصية (اختياري)</option>
                          {characters.map(char => (
                            <option key={char.id} value={char.id}>{char.name} ({char.type})</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={generateAd}
                disabled={isGenerating || isEditingBrand}
                className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl font-black text-lg shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none flex items-center justify-center gap-2 transition-all duration-300"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span>جاري الإبداع...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-6 h-6" />
                    <span>توليد التصميم الاحترافي</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Result */}
          {generatedImages.length > 0 && (
            <div className="bg-white p-5 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 animate-in zoom-in-95 duration-500">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-black text-slate-800">النتيجة النهائية</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={saveToGallery}
                    disabled={isSavingToGallery}
                    className="text-[10px] bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-full font-bold uppercase tracking-wider hover:bg-indigo-200 transition-colors flex items-center gap-1 disabled:opacity-50"
                  >
                    {isSavingToGallery ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    حفظ في المعرض
                  </button>
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-bold uppercase tracking-wider">Masterpiece</span>
                </div>
              </div>
              
              <div className={`grid ${generatedImages.length > 1 ? 'grid-cols-2 gap-4' : 'grid-cols-1'} mb-5`}>
                {generatedImages.map((img, idx) => (
                  <div key={idx} className="aspect-[4/5] rounded-2xl overflow-hidden shadow-inner bg-slate-100 relative group cursor-pointer" onClick={() => setPreviewImage(img)}>
                    <img src={img} alt={`Ad Poster ${idx + 1}`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-6">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDownload(img, `professional-ad-${idx + 1}.png`); }}
                        className="bg-white/90 backdrop-blur-sm text-slate-900 px-4 py-2 rounded-full font-bold flex items-center gap-2 hover:bg-white hover:scale-105 transition-all text-sm"
                      >
                        <Download className="w-4 h-4" />
                        تحميل
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
              <p className="text-xs text-slate-500 text-center leading-relaxed">
                هذا التصميم يمثل الهيكل البصري الإبداعي. يمكنك استخدام برامج مثل Canva أو Photoshop لإضافة نصوص إضافية أو تعديلات دقيقة.
              </p>
            </div>
          )}
        </div>
      </div>
      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center justify-center" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setPreviewImage(null)}
              className="absolute -top-12 right-0 text-white hover:text-slate-300 p-2"
            >
              إغلاق ✕
            </button>
            <img src={previewImage} alt="Preview" className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" />
            <button
              onClick={() => handleDownload(previewImage, 'professional-ad-preview.png')}
              className="mt-4 bg-white text-slate-900 px-6 py-3 rounded-full font-bold flex items-center gap-2 hover:bg-slate-100 transition-all"
            >
              <Download className="w-5 h-5" />
              تحميل الصورة
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
