import React from 'react';
import { Link } from 'react-router-dom';
import { Users, Clapperboard, Film, Plus, Sparkles, ArrowRight, Ghost, Smile, Youtube, Cat, Lightbulb, Dna, Package, Megaphone, Video, UserSquare2, PlaySquare, ShoppingBag } from 'lucide-react';
import { motion } from 'framer-motion';

function ToolCard({ to, icon: Icon, label, description, color }: { to: string; icon: any; label: string; description: string; color: string }) {
  const colorMap: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    red: 'bg-red-500/10 text-red-600',
    sky: 'bg-sky-500/10 text-sky-600',
    amber: 'bg-amber-500/10 text-amber-600',
    emerald: 'bg-emerald-500/10 text-emerald-600',
    orange: 'bg-orange-500/10 text-orange-600',
    pink: 'bg-pink-500/10 text-pink-600',
    rose: 'bg-rose-500/10 text-rose-600',
    indigo: 'bg-primary/10 text-primary',
  };

  return (
    <Link 
      to={to} 
      className="group flex items-center gap-3 bg-card p-3.5 rounded-2xl border border-border/60 hover:border-primary/30 hover:shadow-md transition-all duration-200"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colorMap[color] || colorMap.primary} transition-transform duration-200 group-hover:scale-105`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-card-foreground text-sm leading-tight">{label}</h3>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:-translate-x-1 transition-all duration-200 flex-shrink-0 rotate-180" />
    </Link>
  );
}

function QuickAction({ to, icon: Icon, label, gradient }: { to: string; icon: any; label: string; gradient: string }) {
  return (
    <Link 
      to={to} 
      className={`${gradient} text-white p-3 rounded-xl font-semibold text-xs flex flex-col items-center justify-center gap-1.5 text-center shadow-sm hover:shadow-md transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]`}
    >
      <Icon className="w-5 h-5" />
      <span className="leading-tight">{label}</span>
    </Link>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-6xl mx-auto px-4 lg:px-6 pt-6 lg:pt-8 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="rounded-3xl bg-[#0c0e12] text-white relative overflow-hidden border border-white/10"
        >
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-10" />
          <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-transparent to-[#0c0e12]" />

          <div className="relative p-5 sm:p-6 lg:p-8 grid gap-5 lg:grid-cols-2 lg:items-center">
            <div className="space-y-3">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight">
                لوحة إنشاء المحتوى
              </h1>
              <p className="text-white/70 text-sm sm:text-base leading-relaxed max-w-xl">
                ابدأ بسرعة من الأدوات الأساسية، وانتقل بين إنشاء الشخصيات، بناء المشاهد، وتوليد الفيديو من شاشة واحدة.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <Link
                to="/storyboards?tab=create"
                className="bg-primary text-primary-foreground py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:brightness-110 transition-all active:scale-[0.98]"
              >
                <Plus className="w-4 h-4" />
                <span>قصة جديدة</span>
              </Link>
              <Link
                to="/thumbnails/new"
                className="bg-white/10 backdrop-blur-sm border border-white/10 text-white py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-white/15 transition-all active:scale-[0.98]"
              >
                <Youtube className="w-4 h-4 text-red-400" />
                <span>صورة مصغرة</span>
              </Link>
            </div>
          </div>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
          <div className="lg:col-span-8 space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-2.5"
            >
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">الأدوات</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                <ToolCard to="/character-sheet/new" icon={UserSquare2} label="منشئ ورقة الشخصية" description="رفع صورة وتوليد 3 زوايا للشخصية" color="indigo" />
                <ToolCard to="/product-studio" icon={Package} label="استوديو المنتجات والهوية" description="تصوير منتجات وبناء هوية بصرية" color="sky" />
                <ToolCard to="/ad-campaign-studio" icon={Megaphone} label="استوديو الإعلانات" description="تصميم بوستات إعلانية احترافية" color="primary" />
                <ToolCard to="/kling-motion" icon={Video} label="Motion Control (Kling AI)" description="انقل حركة فيديو حقيقي الى شخصيتك" color="pink" />
                <ToolCard to="/short-video-studio" icon={PlaySquare} label="استوديو الفيديو القصير" description="فيديوهات قصيرة احترافية مع شخصية مرجعية" color="rose" />
                <ToolCard to="/product-video-studio" icon={ShoppingBag} label="استوديو فيديو المنتجات" description="إنشاء فيديوهات منتجات بأسلوب الحملات الإعلانية" color="sky" />
              </div>
            </motion.div>

            <div className="space-y-2.5">
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">الاستكشاف</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <Link to="/characters" className="bg-card p-4 rounded-2xl border border-border/60 hover:border-primary/30 hover:shadow-md transition-all group">
                  <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center text-primary mb-2.5 group-hover:scale-105 transition-transform">
                    <Users className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-card-foreground text-sm">مكتبة الشخصيات</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">إدارة وتصميم أبطال قصتك</p>
                </Link>

                <Link to="/storyboards" className="bg-card p-4 rounded-2xl border border-border/60 hover:border-primary/30 hover:shadow-md transition-all group">
                  <div className="w-9 h-9 bg-sky-500/10 rounded-lg flex items-center justify-center text-sky-600 mb-2.5 group-hover:scale-105 transition-transform">
                    <Clapperboard className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-card-foreground text-sm">القصص والمشاهد</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">كتابة السيناريو وتوليد اللقطات</p>
                </Link>
              </div>

              <Link to="/gallery" className="bg-card p-4 rounded-2xl border border-border/60 hover:border-primary/30 hover:shadow-md transition-all group flex items-center gap-4">
                <div className="w-11 h-11 bg-rose-500/10 rounded-xl flex items-center justify-center text-rose-500 flex-shrink-0 group-hover:scale-105 transition-transform">
                  <Film className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-card-foreground text-sm">معرض الفيديو (Veo3)</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">شاهد وحمل أعمالك النهائية بجودة عالية</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary group-hover:-translate-x-1 transition-all rotate-180 flex-shrink-0" />
              </Link>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-card rounded-2xl p-4 border border-border/60"
            >
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">إنشاء سريع</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2.5">
                <QuickAction to="/surreal-characters/new" icon={Ghost} label="شخصية خيالية" gradient="bg-emerald-600" />
                <QuickAction to="/funny-humans/new" icon={Smile} label="بشري مضحك" gradient="bg-orange-500" />
                <QuickAction to="/creature-characters/new" icon={Cat} label="مخلوق / حيوان" gradient="bg-teal-600" />
                <QuickAction to="/hybrid-characters/new" icon={Dna} label="شخصية هجينة" gradient="bg-rose-500" />
                <QuickAction to="/viral-ideas" icon={Lightbulb} label="أفكار فيروسية" gradient="bg-amber-500" />
              </div>
            </motion.div>

            <div className="bg-[#0c0e12] rounded-2xl p-5 text-white relative overflow-hidden border border-white/10">
              <div className="absolute top-0 left-0 p-4 opacity-5">
                <Sparkles className="w-20 h-20" />
              </div>
              <div className="relative z-10">
                <h3 className="font-bold text-sm mb-1.5 text-white/90">نصيحة</h3>
                <p className="text-sm text-white/50 leading-relaxed mb-3">
                  للحصول على اتساق أعلى في الشخصية، استخدم صورة مرجعية واضحة وكرر نفس الهوية عبر جميع المشاهد.
                </p>
                <Link to="/settings" className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-lg transition-colors text-white/80 hover:text-white">
                  <span>ضبط الإعدادات</span>
                  <ArrowRight className="w-3 h-3 rotate-180" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
