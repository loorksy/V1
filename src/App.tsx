import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate, useParams } from 'react-router-dom';
import { Users, Clapperboard, Film, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from './lib/utils';
import { ToastProvider } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import Home from './pages/Home';
import CharacterList from './pages/CharacterList';
import CharacterCreate from './pages/CharacterCreate';
import CharacterSheetCreate from './pages/CharacterSheetCreate';
import SurrealCharacterCreate from './pages/SurrealCharacterCreate';
import FunnyHumanCreate from './pages/FunnyHumanCreate';
import CreatureCharacterCreate from './pages/CreatureCharacterCreate';
import HybridCharacterCreate from './pages/HybridCharacterCreate';
import ViralIdeasGenerator from './pages/ViralIdeasGenerator';
import ThumbnailCreate from './pages/ThumbnailCreate';
import ProductStudio from './pages/ProductStudio';
import AdCampaignStudio from './pages/AdCampaignStudio';
import KlingMotionControl from './pages/KlingMotionControl';
import ShortVideoStudio from './pages/ShortVideoStudio';
import ProductVideoStudio from './pages/ProductVideoStudio';
import StoryStudio from './pages/StoryStudio';
import VideoGallery from './pages/VideoGallery';
import SettingsPage from './pages/Settings';
import { Home as HomeIcon } from 'lucide-react';

function NavItem({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  const location = useLocation();
  const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
  
  return (
    <Link 
      to={to} 
      className={cn(
        "flex flex-col items-center justify-center w-full h-full gap-0.5 transition-all duration-200 relative",
        isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {isActive && (
        <motion.div 
          layoutId="nav-indicator"
          className="absolute -top-px w-10 h-[3px] bg-primary rounded-b-full"
        />
      )}
      <Icon className={cn("w-5 h-5 transition-transform duration-200", isActive && "scale-110")} strokeWidth={isActive ? 2.5 : 1.8} />
      <span className={cn("text-[10px] leading-tight", isActive ? "font-bold" : "font-medium")}>{label}</span>
    </Link>
  );
}

function DesktopNavItem({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  const location = useLocation();
  const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));

  return (
    <Link
      to={to}
      className={cn(
        'group flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all',
        isActive
          ? 'bg-primary/20 border-primary/40 text-primary'
          : 'bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-card/70 hover:border-border/70'
      )}
    >
      <Icon className={cn('w-4.5 h-4.5', isActive && 'scale-105')} strokeWidth={isActive ? 2.4 : 2} />
      <span className={cn('text-sm', isActive ? 'font-bold' : 'font-medium')}>{label}</span>
    </Link>
  );
}

function StoryboardLegacyRedirect() {
  const { id } = useParams();
  if (id) return <Navigate to={`/storyboards?tab=studio&storyId=${id}`} replace />;
  return <Navigate to="/storyboards?tab=create" replace />;
}

function AuthenticatedApp({ onLogout }: { onLogout: () => void }) {
  return (
    <Router>
      <div className="flex h-screen overflow-hidden bg-background font-sans">
        <aside className="hidden lg:flex lg:w-72 xl:w-80 border-l border-border/60 bg-card/70 backdrop-blur-xl p-4 xl:p-5 flex-col gap-4">
          <div className="px-2 py-1">
            <h1 className="text-lg font-bold text-foreground">Videos AI</h1>
            <p className="text-xs text-muted-foreground mt-1">لوحة التحكم</p>
          </div>

          <nav className="space-y-1">
            <DesktopNavItem to="/" icon={HomeIcon} label="الرئيسية" />
            <DesktopNavItem to="/characters" icon={Users} label="الشخصيات" />
            <DesktopNavItem to="/storyboards" icon={Clapperboard} label="القصص" />
            <DesktopNavItem to="/gallery" icon={Film} label="المعرض" />
            <DesktopNavItem to="/settings" icon={Settings} label="الإعدادات" />
          </nav>

          <div className="mt-auto p-3 rounded-xl border border-border/70 bg-secondary/40">
            <p className="text-xs text-muted-foreground">جاهز لإنشاء المحتوى</p>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto pb-20 lg:pb-0 scroll-smooth">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/characters" element={<CharacterList />} />
            <Route path="/characters/new" element={<CharacterCreate />} />
            <Route path="/character-sheet/new" element={<CharacterSheetCreate />} />
            <Route path="/surreal-characters/new" element={<SurrealCharacterCreate />} />
            <Route path="/funny-humans/new" element={<FunnyHumanCreate />} />
            <Route path="/creature-characters/new" element={<CreatureCharacterCreate />} />
            <Route path="/hybrid-characters/new" element={<HybridCharacterCreate />} />
            <Route path="/viral-ideas" element={<ViralIdeasGenerator />} />
            <Route path="/character-animation" element={<Navigate to="/" replace />} />
            <Route path="/product-studio" element={<ProductStudio />} />
            <Route path="/ad-campaign-studio" element={<AdCampaignStudio />} />
            <Route path="/kling-motion" element={<KlingMotionControl />} />
            <Route path="/short-video-studio" element={<ShortVideoStudio />} />
            <Route path="/product-video-studio" element={<ProductVideoStudio />} />
            <Route path="/thumbnails/new" element={<ThumbnailCreate />} />
            <Route path="/storyboards" element={<StoryStudio />} />
            <Route path="/storyboards/new" element={<StoryboardLegacyRedirect />} />
            <Route path="/storyboards/:id" element={<StoryboardLegacyRedirect />} />
            <Route path="/gallery" element={<VideoGallery />} />
            <Route path="/settings" element={<SettingsPage onLogout={onLogout} />} />
          </Routes>
        </main>
        
        {/* Mobile Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 h-16 bg-card/95 backdrop-blur-xl border-t border-border/60 shadow-[0_-2px_24px_rgba(0,0,0,0.25)] z-50 lg:hidden">
          <div className="grid grid-cols-5 h-full max-w-lg mx-auto">
            <NavItem to="/" icon={HomeIcon} label="الرئيسية" />
            <NavItem to="/characters" icon={Users} label="الشخصيات" />
            <NavItem to="/storyboards" icon={Clapperboard} label="القصص" />
            <NavItem to="/gallery" icon={Film} label="المعرض" />
            <NavItem to="/settings" icon={Settings} label="الإعدادات" />
          </div>
        </nav>
      </div>
    </Router>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const auth = localStorage.getItem('isAuthenticated');
    setIsAuthenticated(auth === 'true');
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    let isCancelled = false;

    const syncSettings = async () => {
      try {
        const resp = await fetch(`${window.location.origin}/api/settings`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (isCancelled) return;

        localStorage.setItem('AI_PROVIDER', 'fal');

        if (typeof data.text_model === 'string' && data.text_model.trim()) {
          localStorage.setItem('AI_TEXT_MODEL', data.text_model);
        }
        if (typeof data.image_model === 'string' && data.image_model.trim()) {
          localStorage.setItem('AI_IMAGE_MODEL', data.image_model);
        }
        if (typeof data.video_model === 'string') {
          localStorage.setItem('AI_VIDEO_MODEL', data.video_model);
        }

        if (data.has_fal_key) {
          localStorage.setItem('HAS_FAL_KEY', '1');
        } else {
          localStorage.removeItem('HAS_FAL_KEY');
        }
      } catch {
        // Keep app usable even if settings sync fails.
      }
    };

    syncSettings();
    return () => {
      isCancelled = true;
    };
  }, [isAuthenticated]);

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    setIsAuthenticated(false);
  };

  // Loading state
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthenticatedApp onLogout={handleLogout} />
      </ToastProvider>
    </ErrorBoundary>
  );
}
