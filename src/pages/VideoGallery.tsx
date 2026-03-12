import React, { useEffect, useState } from 'react';
import { Film, Image as ImageIcon, Youtube, Trash2, Download, PlaySquare, Package, Palette } from 'lucide-react';
import { db, Storyboard, MediaItem } from '../lib/db';
import { Link } from 'react-router-dom';

type TabType = 'all' | 'video' | 'image' | 'thumbnail';

const SOURCE_LABELS: Record<string, string> = {
  animation: 'تحريك شخصية',
  product: 'استوديو المنتجات',
  thumbnail: 'صورة مصغرة',
  brand: 'هوية بصرية',
  storyboard: 'قصة مصورة',
};

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  animation: <PlaySquare className="w-3 h-3" />,
  product: <Package className="w-3 h-3" />,
  thumbnail: <Youtube className="w-3 h-3" />,
  brand: <Palette className="w-3 h-3" />,
  storyboard: <Film className="w-3 h-3" />,
};

export default function VideoGallery() {
  const [storyboardVideos, setStoryboardVideos] = useState<{storyId: string, title: string, clip: string}[]>([]);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('all');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    // Load storyboard videos
    const storyboards = await db.getAllStoryboards();
    const allClips: {storyId: string, title: string, clip: string}[] = [];
    storyboards.forEach(story => {
      story.scenes.forEach(scene => {
        if (scene.videoClip) {
          allClips.push({
            storyId: story.id,
            title: story.title,
            clip: scene.videoClip
          });
        }
      });
    });
    setStoryboardVideos(allClips);

    // Load media gallery items
    const media = await db.getAllMedia();
    setMediaItems(media.sort((a, b) => b.createdAt - a.createdAt));
  }

  const handleDeleteMedia = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا العنصر؟')) return;
    await db.deleteMediaItem(id);
    setMediaItems(prev => prev.filter(m => m.id !== id));
  };

  const handleDownload = (dataUrl: string, filename: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const filteredMedia = activeTab === 'all'
    ? mediaItems
    : mediaItems.filter(m => m.type === activeTab);

  const totalCount = mediaItems.length + storyboardVideos.length;
  const videoCount = mediaItems.filter(m => m.type === 'video').length + storyboardVideos.length;
  const imageCount = mediaItems.filter(m => m.type === 'image').length;
  const thumbCount = mediaItems.filter(m => m.type === 'thumbnail').length;

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: 'all', label: 'الكل', count: totalCount },
    { key: 'video', label: 'فيديو', count: videoCount },
    { key: 'image', label: 'صور', count: imageCount },
    { key: 'thumbnail', label: 'مصغرات', count: thumbCount },
  ];

  return (
    <div className="p-4 max-w-6xl mx-auto pb-24 lg:pb-8">
      <header className="pt-2 mb-5">
        <h1 className="text-xl font-bold text-foreground">المعرض</h1>
        <p className="text-xs text-muted-foreground mt-0.5">جميع المحتوى المولد محفوظ هنا تلقائيا</p>
      </header>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-5 pb-1">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-muted'
            }`}
          >
            {tab.label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              activeTab === tab.key ? 'bg-white/20' : 'bg-muted'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Storyboard Videos (show in 'all' and 'video' tabs) */}
        {(activeTab === 'all' || activeTab === 'video') && storyboardVideos.map((video, idx) => (
          <div key={`sv-${idx}`} className="bg-card rounded-2xl overflow-hidden border border-border/60 hover:shadow-md transition-all">
            <div className="aspect-video bg-foreground/95 relative group">
              <video src={video.clip} controls className="w-full h-full" />
            </div>
            <div className="p-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-card-foreground truncate text-sm">{video.title}</h3>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1">
                    <Film className="w-3 h-3" />
                    قصة مصورة
                  </span>
                </div>
                <Link to={`/storyboards?tab=studio&storyId=${video.storyId}`} className="text-xs text-primary font-medium hover:underline">
                  عرض القصة
                </Link>
              </div>
            </div>
          </div>
        ))}

        {/* Media Gallery Items */}
        {filteredMedia.map(item => (
          <div key={item.id} className="bg-card rounded-2xl overflow-hidden border border-border/60 hover:shadow-md transition-all">
            {item.type === 'video' ? (
              <div className="aspect-video bg-foreground/95 relative group">
                <video src={item.data} controls className="w-full h-full" />
              </div>
            ) : (
              <div className={`${item.type === 'thumbnail' ? 'aspect-video' : 'aspect-square'} bg-secondary relative group`}>
                <img src={item.data} alt={item.title} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-card-foreground truncate text-sm">{item.title}</h3>
                  {item.description && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{item.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                      {SOURCE_ICONS[item.source]}
                      {SOURCE_LABELS[item.source] || item.source}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60">
                      {new Date(item.createdAt).toLocaleDateString('ar-SA')}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleDownload(item.data, `${item.id}.${item.type === 'video' ? 'mp4' : 'png'}`)}
                    className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                    title="تحميل"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteMedia(item.id)}
                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                    title="حذف"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Empty State */}
        {totalCount === 0 && (
          <div className="py-16 text-center col-span-full">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
              <Film className="w-6 h-6 text-muted-foreground/40" />
            </div>
            <p className="text-muted-foreground font-medium text-sm">لا يوجد محتوى محفوظ بعد</p>
            <p className="text-xs text-muted-foreground/60 mt-1">كل صورة أو فيديو تقوم بتوليده سيظهر هنا تلقائيا</p>
          </div>
        )}
      </div>
    </div>
  );
}
