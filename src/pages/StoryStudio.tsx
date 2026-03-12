import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Check,
  Clapperboard,
  Download,
  Film,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Video,
  Wand2,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { db, Character, Scene, Storyboard } from '../lib/db';
import { AIService } from '../lib/aiService';
import { FalService } from '../lib/fal';
import { getProviderSettings, MissingApiKeyError } from '../lib/aiProvider';
import { ApiKeyMissing } from '../components/ApiKeyMissing';

type StudioTab = 'projects' | 'create' | 'studio';

interface StoryPreset {
  id: string;
  label: string;
  note: string;
  contentType: string;
  sceneCount: number;
  aspectRatio: '16:9' | '9:16';
  style: string;
  promptHint: string;
}

const STORY_PRESETS: StoryPreset[] = [
  {
    id: 'yt-viral',
    label: 'YouTube Viral',
    note: 'هوك قوي + تصاعد + نهاية قابلة للمشاركة',
    contentType: 'حركة (أكشن)',
    sceneCount: 8,
    aspectRatio: '16:9',
    style: 'Cinematic',
    promptHint: 'اصنع هوك خلال أول 3 ثواني، تصاعد سريع، ومفاجأة في النهاية.',
  },
  {
    id: 'tiktok-trend',
    label: 'TikTok Trend',
    note: 'سرعة إيقاع + لقطات قصيرة + حوار خاطف',
    contentType: 'كوميدي',
    sceneCount: 6,
    aspectRatio: '9:16',
    style: 'Dynamic Social',
    promptHint: 'المشاهد قصيرة وسريعة مع جمل مباشرة مناسبة للترند.',
  },
  {
    id: 'drama',
    label: 'قصة درامية',
    note: 'بناء شخصيات + تصعيد عاطفي',
    contentType: 'قصة درامية',
    sceneCount: 7,
    aspectRatio: '16:9',
    style: 'Cinematic',
    promptHint: 'تركيز على مشاعر الشخصيات والتحول الدرامي عبر المشاهد.',
  },
  {
    id: 'educational',
    label: 'تعليمي سريع',
    note: 'معلومة واضحة + أمثلة بصرية',
    contentType: 'تعليمي',
    sceneCount: 5,
    aspectRatio: '9:16',
    style: 'Documentary',
    promptHint: 'اجعل كل مشهد يقدم نقطة واضحة وسهلة الفهم.',
  },
];

const CONTENT_TYPES = [
  'قصة درامية',
  'كوميدي',
  'مغامرة',
  'رومانسي',
  'خيال علمي',
  'فانتازيا',
  'رعب / إثارة',
  'تعليمي',
  'وثائقي',
  'أطفال',
  'حركة (أكشن)',
  'اجتماعي',
  'مخصص',
];

const STYLE_OPTIONS = ['Cinematic', 'Anime', '3D Render', 'Cyberpunk', 'Documentary', 'Dynamic Social'];
const DIALOGUE_LANGUAGES = ['العربية', 'الإنجليزية', 'الفرنسية', 'الإسبانية', 'التركية'];

export default function StoryStudio() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<StudioTab>('projects');

  const [characters, setCharacters] = useState<Character[]>([]);
  const [storyboards, setStoryboards] = useState<Storyboard[]>([]);
  const [selectedStoryboardId, setSelectedStoryboardId] = useState('');
  const [studioStoryboard, setStudioStoryboard] = useState<Storyboard | null>(null);

  const [selectedPresetId, setSelectedPresetId] = useState(STORY_PRESETS[0].id);
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);
  const [idea, setIdea] = useState('');
  const [script, setScript] = useState('');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [contentType, setContentType] = useState('قصة درامية');
  const [customContentType, setCustomContentType] = useState('');
  const [style, setStyle] = useState('Cinematic');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [sceneCount, setSceneCount] = useState(6);
  const [dialogueLanguage, setDialogueLanguage] = useState('العربية');
  const [characterReferenceProfiles, setCharacterReferenceProfiles] = useState<Record<string, string>>({});

  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isGeneratingFrames, setIsGeneratingFrames] = useState(false);
  const [isGeneratingVideos, setIsGeneratingVideos] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [status, setStatus] = useState('');
  const [videoStatuses, setVideoStatuses] = useState<Record<number, string>>({});
  const [mergedVideoUrl, setMergedVideoUrl] = useState('');
  const [missingKeyError, setMissingKeyError] = useState<MissingApiKeyError | null>(null);

  const selectedChars = useMemo(
    () => characters.filter((c) => selectedCharIds.includes(c.id)),
    [characters, selectedCharIds]
  );

  const selectedPreset = useMemo(
    () => STORY_PRESETS.find((p) => p.id === selectedPresetId) || STORY_PRESETS[0],
    [selectedPresetId]
  );

  useEffect(() => {
    const tab = (searchParams.get('tab') as StudioTab) || 'projects';
    const safeTab: StudioTab = tab === 'create' || tab === 'studio' ? tab : 'projects';
    setActiveTab(safeTab);
    const storyId = searchParams.get('storyId') || '';
    if (storyId) setSelectedStoryboardId(storyId);
  }, [searchParams]);

  useEffect(() => {
    void loadInitialData();
  }, []);

  useEffect(() => {
    if (!selectedStoryboardId) {
      setStudioStoryboard(null);
      return;
    }
    void loadStoryboardById(selectedStoryboardId);
  }, [selectedStoryboardId]);

  const loadInitialData = async () => {
    const [allChars, allStories] = await Promise.all([db.getAllCharacters(), db.getAllStoryboards()]);
    setCharacters(allChars);
    setStoryboards(allStories.sort((a, b) => b.createdAt - a.createdAt));
  };

  const loadStoryboardById = async (id: string) => {
    const story = await db.getStoryboard(id);
    if (!story) return;
    setStudioStoryboard(story);
    setActiveTab('studio');
    setSearchParams({ tab: 'studio', storyId: story.id });
  };

  const applyPreset = (presetId: string) => {
    const preset = STORY_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setSelectedPresetId(preset.id);
    setContentType(preset.contentType);
    setSceneCount(preset.sceneCount);
    setAspectRatio(preset.aspectRatio);
    setStyle(preset.style);
    if (!idea.trim()) setIdea(preset.promptHint);
  };

  const toggleChar = (id: string) => {
    setSelectedCharIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toBase64Data = async (img: string): Promise<string> => {
    if (!img) return '';
    if (img.startsWith('data:')) return img;
    if (img.length > 180 && img.includes('base64,')) return img;
    try {
      const resp = await fetch(img.startsWith('/') ? `${window.location.origin}${img}` : img);
      const blob = await resp.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string) || '');
        reader.readAsDataURL(blob);
      });
    } catch {
      return '';
    }
  };

  const getPrimaryCharacterRefImage = async (char: Character): Promise<string> => {
    const images = char.images as Record<string, string | undefined>;
    const candidates = [images.front, images.reference, images.closeup, images.left, images.right, images.threeQuarter, images.normal].filter(Boolean) as string[];
    if (!candidates.length) return '';
    return toBase64Data(candidates[0]);
  };

  const ensureReferenceProfiles = async (chars: Character[]) => {
    const nextProfiles = { ...characterReferenceProfiles };
    let changed = false;
    for (const char of chars) {
      if (nextProfiles[char.id]) continue;
      const refImage = await getPrimaryCharacterRefImage(char);
      if (!refImage) continue;
      try {
        const analyzed = await AIService.analyzeCharacter(refImage);
        if (analyzed?.trim()) {
          nextProfiles[char.id] = analyzed.trim();
          changed = true;
        }
      } catch {
        // fallback
      }
    }
    if (changed) setCharacterReferenceProfiles(nextProfiles);
    return nextProfiles;
  };

  const buildCharacterDNA = (chars: Character[], profiles: Record<string, string>) =>
    chars
      .map((c) => `${c.name}: ${profiles[c.id] ? `REFERENCE IMAGE PROFILE: ${profiles[c.id]}` : c.visualTraits || c.description}`)
      .join('\n');

  const getCharacterRefsForScene = async (sceneCharacterIds: string[]) => {
    const targetChars = sceneCharacterIds.length ? selectedChars.filter((c) => sceneCharacterIds.includes(c.id)) : selectedChars;
    const refs: string[] = [];
    for (const char of targetChars) {
      const images = char.images as Record<string, string | undefined>;
      const ordered = [images.front, images.reference, images.closeup, images.left, images.right, images.threeQuarter, images.normal].filter(Boolean) as string[];
      for (const src of ordered.slice(0, 2)) {
        const b64 = await toBase64Data(src);
        if (b64) refs.push(b64);
      }
    }
    return refs.slice(0, 6);
  };

  const getCharacterRefsForSceneFromChars = async (sceneCharacterIds: string[], sourceChars: Character[]) => {
    const targetChars = sceneCharacterIds.length ? sourceChars.filter((c) => sceneCharacterIds.includes(c.id)) : sourceChars;
    const refs: string[] = [];
    for (const char of targetChars) {
      const images = char.images as Record<string, string | undefined>;
      const ordered = [images.front, images.reference, images.closeup, images.left, images.right, images.threeQuarter, images.normal].filter(Boolean) as string[];
      for (const src of ordered.slice(0, 2)) {
        const b64 = await toBase64Data(src);
        if (b64) refs.push(b64);
      }
    }
    return refs.slice(0, 6);
  };

  const buildScenePrompt = (params: {
    scene: Scene;
    idx: number;
    total: number;
    storyScript: string;
    previousSceneDescription?: string;
  }) => {
    const { scene, idx, total, storyScript, previousSceneDescription } = params;
    const dialoguePart = scene.dialogue ? `Dialogue: "${scene.dialogue}".` : 'No dialogue.';
    const continuityLine =
      idx === 0
        ? 'This is the canonical reference shot. Define the final locked identity for all upcoming shots.'
        : `Continue from previous shot without redesign. Previous shot context: ${previousSceneDescription || 'same timeline and location flow'}.`;
    return `You are directing a professional storyboard with strict cinematic continuity.
Global story script: ${storyScript || 'N/A'}
Shot ${idx + 1}/${total}: ${scene.description}
${dialoguePart}
Direction rules:
- Think like a director + cinematographer + script supervisor.
- Keep same character identity (face, hairstyle, clothing design, color palette, body proportions).
- Keep same environment continuity unless this shot explicitly changes location.
- Keep camera logic coherent with previous shot (angle, blocking, eye-line, motion continuity).
- Avoid random character redesign, random background replacement, text overlays, or artifacts.
${continuityLine}`;
  };

  const generateScriptAndScenes = async () => {
    if (selectedCharIds.length === 0) return;
    setIsGeneratingScript(true);
    setStatus('جاري كتابة السيناريو وتقسيم المشاهد...');
    try {
      const genre = contentType === 'مخصص' ? customContentType : contentType;
      const prompt = `${selectedPreset.promptHint}
الفكرة: ${idea || 'أنشئ قصة جذابة مناسبة للترند'}
النوع: ${genre}
عدد المشاهد: ${sceneCount}
النمط: ${style}
الأبعاد: ${aspectRatio}
لغة الحوار: ${dialogueLanguage}`;
      const result = await AIService.generateScriptAndScenes(
        prompt,
        selectedChars.map((c) => ({ name: c.name, description: c.description, visualTraits: c.visualTraits }))
      );
      const mappedScenes: Scene[] = (result.scenes || []).map((s: any) => ({
        id: uuidv4(),
        description: s.description || '',
        dialogue: s.dialogue || '',
        characterIds: (s.characters || [])
          .map((name: string) => {
            const found = selectedChars.find((c) => c.name.includes(name) || name.includes(c.name));
            return found?.id || '';
          })
          .filter(Boolean),
      }));
      if (!mappedScenes.length) throw new Error('لم يتم توليد مشاهد صالحة.');
      setScript(result.script || '');
      setScenes(mappedScenes);
      setStatus('تم توليد السيناريو والمشاهد.');
    } catch (e: any) {
      if (e instanceof MissingApiKeyError) setMissingKeyError(e);
      else setStatus(e.message || 'فشل توليد السيناريو.');
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const generateFramesForScenes = async () => {
    if (!scenes.length) return;
    setIsGeneratingFrames(true);
    try {
      const profiles = await ensureReferenceProfiles(selectedChars);
      const characterDNA = buildCharacterDNA(selectedChars, profiles);
      const updated = [...scenes];
      const total = updated.length;
      const concurrency = Math.min(3, Math.max(1, total - 1));
      let finished = 0;

      // Generate scene 1 first as canonical anchor for consistency.
      setStatus(`جاري توليد المشهد المرجعي 1/${total}...`);
      const firstRefs = await getCharacterRefsForScene(updated[0].characterIds);
      const firstImage = await AIService.generateStoryboardFrame({
        sceneDescription: buildScenePrompt({
          scene: updated[0],
          idx: 0,
          total,
          storyScript: script,
          previousSceneDescription: undefined,
        }),
        characterImages: firstRefs,
        firstSceneImage: updated[0].frameImage,
        previousSceneImage: undefined,
        sceneIndex: 0,
        totalScenes: total,
        style,
        aspectRatio,
        characterDNA,
      });
      updated[0].frameImage = firstImage;
      finished = 1;
      setScenes([...updated]);

      const pendingIndexes = Array.from({ length: total - 1 }, (_, i) => i + 1);
      const workerCount = Math.min(concurrency, pendingIndexes.length);
      await Promise.all(
        Array.from({ length: workerCount }, async () => {
          while (pendingIndexes.length) {
            const i = pendingIndexes.shift();
            if (i === undefined) return;
            setStatus(`جاري توليد الصور دفعة واحدة... ${finished}/${total}`);
            const refs = await getCharacterRefsForScene(updated[i].characterIds);
            const img = await AIService.generateStoryboardFrame({
              sceneDescription: buildScenePrompt({
                scene: updated[i],
                idx: i,
                total,
                storyScript: script,
                previousSceneDescription: i > 0 ? updated[i - 1].description : undefined,
              }),
              characterImages: refs,
              firstSceneImage: firstImage,
              previousSceneImage: updated[i - 1]?.frameImage,
              sceneIndex: i,
              totalScenes: total,
              style,
              aspectRatio,
              characterDNA,
            });
            updated[i].frameImage = img;
            finished += 1;
            setScenes([...updated]);
          }
        })
      );
      setStatus('تم توليد الصور بنجاح.');
    } catch (e: any) {
      if (e instanceof MissingApiKeyError) setMissingKeyError(e);
      else setStatus(e.message || 'فشل توليد الصور.');
    } finally {
      setIsGeneratingFrames(false);
    }
  };

  const generateVideosForScenes = async (source: Scene[], ratio: '16:9' | '9:16') => {
    setIsGeneratingVideos(true);
    const statuses: Record<number, string> = {};
    setVideoStatuses(statuses);
    try {
      const service = FalService;
      const model = getProviderSettings().videoModel;
      for (let i = 0; i < source.length; i++) {
        if (!source[i].frameImage || source[i].videoClip) continue;
        statuses[i] = 'جاري الإرسال...';
        setVideoStatuses({ ...statuses });
        const prompt = `${source[i].description}. ${
          source[i].dialogue ? `Dialogue: "${source[i].dialogue}"` : ''
        } Keep character identity locked and cinematic continuity.`;
        const task = await service.generateImageToVideo(source[i].frameImage!, prompt, model, ratio);
        statuses[i] = 'جاري التوليد...';
        setVideoStatuses({ ...statuses });
        const startedAt = Date.now();
        const url = await service.pollTaskStatus(task.taskId, () => {
          statuses[i] = `جاري التوليد... ${Math.floor((Date.now() - startedAt) / 1000)}s`;
          setVideoStatuses({ ...statuses });
        });
        source[i].videoClip = url;
        statuses[i] = 'مكتمل';
        setVideoStatuses({ ...statuses });
      }
      setStatus('تم توليد الفيديوهات.');
    } catch (e: any) {
      if (e instanceof MissingApiKeyError) setMissingKeyError(e);
      else setStatus(e.message || 'فشل توليد الفيديو.');
    } finally {
      setIsGeneratingVideos(false);
    }
  };

  const saveNewStoryboard = async () => {
    if (!scenes.length) return;
    setIsSaving(true);
    try {
      const story: Storyboard = {
        id: uuidv4(),
        title: (idea || script || 'Story Project').slice(0, 50),
        script,
        characters: selectedCharIds,
        scenes,
        aspectRatio,
        createdAt: Date.now(),
      };
      await db.saveStoryboard(story);
      await loadInitialData();
      setSelectedStoryboardId(story.id);
      setStudioStoryboard(story);
      setSearchParams({ tab: 'studio', storyId: story.id });
      setActiveTab('studio');
      setStatus('تم حفظ المشروع.');
    } finally {
      setIsSaving(false);
    }
  };

  const regenerateStudioScene = async (idx: number) => {
    if (!studioStoryboard) return;
    const allChars = (await Promise.all((studioStoryboard.characters || []).map((id) => db.getCharacter(id)))).filter(Boolean) as Character[];
    try {
      const profiles = await ensureReferenceProfiles(allChars);
      const refs: string[] = [];
      for (const c of allChars) {
        const b64 = await getPrimaryCharacterRefImage(c);
        if (b64) refs.push(b64);
      }
      const image = await AIService.generateStoryboardFrame({
        sceneDescription: buildScenePrompt({
          scene: studioStoryboard.scenes[idx],
          idx,
          total: studioStoryboard.scenes.length,
          storyScript: studioStoryboard.script || '',
          previousSceneDescription: idx > 0 ? studioStoryboard.scenes[idx - 1]?.description : undefined,
        }),
        characterImages: refs.slice(0, 6),
        firstSceneImage: studioStoryboard.scenes[0]?.frameImage,
        previousSceneImage: idx > 0 ? studioStoryboard.scenes[idx - 1]?.frameImage : undefined,
        sceneIndex: idx,
        totalScenes: studioStoryboard.scenes.length,
        style: 'Cinematic',
        aspectRatio: (studioStoryboard.aspectRatio || '16:9') as '16:9' | '9:16',
        characterDNA: buildCharacterDNA(allChars, profiles),
      });
      const next = { ...studioStoryboard, scenes: [...studioStoryboard.scenes] };
      next.scenes[idx].frameImage = image;
      setStudioStoryboard(next);
      await db.saveStoryboard(next);
      await loadInitialData();
    } catch (e: any) {
      if (e instanceof MissingApiKeyError) setMissingKeyError(e);
      else setStatus(e.message || 'فشل إعادة توليد المشهد.');
    }
  };

  const generateStudioFrames = async () => {
    if (!studioStoryboard) return;
    setIsGeneratingFrames(true);
    try {
      const liveChars = (await Promise.all((studioStoryboard.characters || []).map((id) => db.getCharacter(id)))).filter(Boolean) as Character[];
      const profiles = await ensureReferenceProfiles(liveChars);
      const characterDNA = buildCharacterDNA(liveChars, profiles);
      const next = { ...studioStoryboard, scenes: [...studioStoryboard.scenes] };
      const total = next.scenes.length;
      const missingIndexes = next.scenes
        .map((scene, i) => (scene.frameImage ? -1 : i))
        .filter((i) => i >= 0);

      if (!missingIndexes.length) {
        setStatus('كل مشاهد المشروع تحتوي صوراً بالفعل.');
      } else {
        let firstSceneImage: string | undefined = next.scenes[0]?.frameImage;
        let finished = 0;
        const concurrency = Math.min(3, missingIndexes.length);

        if (!firstSceneImage) {
          setStatus(`توليد المشهد المرجعي 1/${total}...`);
          const refs0 = await getCharacterRefsForSceneFromChars(next.scenes[0].characterIds, liveChars);
          firstSceneImage = await AIService.generateStoryboardFrame({
            sceneDescription: buildScenePrompt({
              scene: next.scenes[0],
              idx: 0,
              total,
              storyScript: next.script || '',
              previousSceneDescription: undefined,
            }),
            characterImages: refs0,
            firstSceneImage: undefined,
            previousSceneImage: undefined,
            sceneIndex: 0,
            totalScenes: total,
            style: 'Cinematic',
            aspectRatio: (next.aspectRatio || '16:9') as '16:9' | '9:16',
            characterDNA,
          });
          next.scenes[0].frameImage = firstSceneImage;
          finished += 1;
          const anchorPos = missingIndexes.indexOf(0);
          if (anchorPos >= 0) missingIndexes.splice(anchorPos, 1);
          setStudioStoryboard({ ...next, scenes: [...next.scenes] });
        }

        await Promise.all(
          Array.from({ length: concurrency }, async () => {
            while (missingIndexes.length) {
              const i = missingIndexes.shift();
              if (i === undefined) return;
              setStatus(`توليد المشاهد دفعة واحدة... ${finished}/${total}`);
              const scene = next.scenes[i];
              const refs = await getCharacterRefsForSceneFromChars(scene.characterIds, liveChars);
              const image = await AIService.generateStoryboardFrame({
                sceneDescription: buildScenePrompt({
                  scene,
                  idx: i,
                  total,
                  storyScript: next.script || '',
                  previousSceneDescription: i > 0 ? next.scenes[i - 1]?.description : undefined,
                }),
                characterImages: refs,
                firstSceneImage,
                previousSceneImage: next.scenes[i - 1]?.frameImage,
                sceneIndex: i,
                totalScenes: total,
                style: 'Cinematic',
                aspectRatio: (next.aspectRatio || '16:9') as '16:9' | '9:16',
                characterDNA,
              });
              next.scenes[i].frameImage = image;
              finished += 1;
              setStudioStoryboard({ ...next, scenes: [...next.scenes] });
            }
          })
        );
      }

      setStudioStoryboard(next);
      await db.saveStoryboard(next);
      await loadInitialData();
      setStatus('تم توليد المشاهد باستراتيجية المرجع بنجاح.');
    } catch (e: any) {
      if (e instanceof MissingApiKeyError) setMissingKeyError(e);
      else setStatus(e.message || 'فشل توليد المشاهد.');
    } finally {
      setIsGeneratingFrames(false);
    }
  };

  const generateStudioVideos = async () => {
    if (!studioStoryboard) return;
    const next = { ...studioStoryboard, scenes: [...studioStoryboard.scenes] };
    await generateVideosForScenes(next.scenes, (studioStoryboard.aspectRatio || '16:9') as '16:9' | '9:16');
    setStudioStoryboard(next);
    await db.saveStoryboard(next);
    await loadInitialData();
  };

  const generateDraftVideos = async () => {
    const next = [...scenes];
    await generateVideosForScenes(next, aspectRatio);
    setScenes(next);
  };

  const exportStudioFinalVideo = async () => {
    if (!studioStoryboard) return;
    const videoUrls = studioStoryboard.scenes.filter((s) => s.videoClip).map((s) => s.videoClip!) as string[];
    if (!videoUrls.length) return;
    setIsMerging(true);
    try {
      const resp = await fetch(`${window.location.origin}/api/merge-videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_urls: videoUrls }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.detail || 'فشل دمج الفيديو.');
      setMergedVideoUrl(result.url || '');
    } catch (e: any) {
      setStatus(e.message || 'فشل التصدير.');
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="p-4 max-w-7xl mx-auto min-h-screen bg-background pb-24 lg:pb-8 space-y-4">
      {missingKeyError && <ApiKeyMissing error={missingKeyError} onDismiss={() => setMissingKeyError(null)} />}

      <header className="bg-card border border-border/60 rounded-2xl p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Clapperboard className="w-5 h-5 text-primary" />
            Story Studio
          </h1>
          <p className="text-xs text-muted-foreground mt-1">أداة موحدة لإنشاء القصص من الفكرة حتى الفيديو النهائي</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setActiveTab('projects'); setSearchParams({ tab: 'projects' }); }} className={`px-3 py-2 rounded-xl text-xs font-bold ${activeTab === 'projects' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>المشاريع</button>
          <button onClick={() => { setActiveTab('create'); setSearchParams({ tab: 'create' }); }} className={`px-3 py-2 rounded-xl text-xs font-bold ${activeTab === 'create' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>إنشاء قصة</button>
          <button onClick={() => { setActiveTab('studio'); setSearchParams(selectedStoryboardId ? { tab: 'studio', storyId: selectedStoryboardId } : { tab: 'studio' }); }} className={`px-3 py-2 rounded-xl text-xs font-bold ${activeTab === 'studio' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>الإنتاج</button>
        </div>
      </header>

      {status && <div className="bg-violet-50 border border-violet-200 p-3 rounded-xl text-xs text-violet-700">{status}</div>}

      {activeTab === 'projects' && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">لوحة المشاريع</h2>
            <button onClick={() => { setActiveTab('create'); setSearchParams({ tab: 'create' }); }} className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              مشروع جديد
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {storyboards.map((story) => {
              const frames = story.scenes.filter((s) => s.frameImage).length;
              const videos = story.scenes.filter((s) => s.videoClip).length;
              return (
                <button key={story.id} onClick={() => setSelectedStoryboardId(story.id)} className="text-right bg-card border border-border/60 rounded-2xl p-4 hover:border-primary/40 transition-all">
                  <h3 className="font-bold text-sm">{story.title}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{story.script}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="text-[10px] bg-secondary px-2 py-0.5 rounded-full">{story.scenes.length} مشاهد</span>
                    <span className="text-[10px] bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full">صور {frames}</span>
                    <span className="text-[10px] bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full">فيديو {videos}</span>
                  </div>
                </button>
              );
            })}
            {!storyboards.length && <div className="bg-card border border-border/60 rounded-2xl p-8 text-center text-sm text-muted-foreground lg:col-span-2">لا توجد مشاريع قصص بعد.</div>}
          </div>
        </section>
      )}

      {activeTab === 'create' && (
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-4 bg-card border border-border/60 rounded-2xl p-4 space-y-3 h-fit">
            <h3 className="text-sm font-bold">Presets للقصص</h3>
            {STORY_PRESETS.map((p) => (
              <button key={p.id} onClick={() => applyPreset(p.id)} className={`w-full text-right p-3 rounded-xl border text-xs ${selectedPresetId === p.id ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-secondary/40 text-muted-foreground'}`}>
                <p className="font-bold">{p.label}</p>
                <p className="mt-1 opacity-80">{p.note}</p>
              </button>
            ))}
          </div>

          <div className="xl:col-span-8 space-y-4">
            <div className="bg-card border border-border/60 rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-bold flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-primary" /> إعداد القصة</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <select value={contentType} onChange={(e) => setContentType(e.target.value)} className="p-2.5 border border-border rounded-xl bg-secondary/50 text-xs">
                  {CONTENT_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
                <select value={style} onChange={(e) => setStyle(e.target.value)} className="p-2.5 border border-border rounded-xl bg-secondary/50 text-xs">
                  {STYLE_OPTIONS.map((x) => <option key={x}>{x}</option>)}
                </select>
                <select value={dialogueLanguage} onChange={(e) => setDialogueLanguage(e.target.value)} className="p-2.5 border border-border rounded-xl bg-secondary/50 text-xs">
                  {DIALOGUE_LANGUAGES.map((x) => <option key={x}>{x}</option>)}
                </select>
                <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as '16:9' | '9:16')} className="p-2.5 border border-border rounded-xl bg-secondary/50 text-xs">
                  <option value="16:9">16:9 (YouTube)</option>
                  <option value="9:16">9:16 (TikTok/Reels)</option>
                </select>
              </div>
              {contentType === 'مخصص' && (
                <input value={customContentType} onChange={(e) => setCustomContentType(e.target.value)} className="w-full p-3 border border-border rounded-xl text-sm bg-secondary/50" placeholder="نوع المحتوى المخصص" />
              )}
              <div className="grid grid-cols-1 md:grid-cols-[1fr_100px] gap-2">
                <textarea value={idea} onChange={(e) => setIdea(e.target.value)} rows={4} className="w-full p-3 border border-border rounded-xl text-sm bg-secondary/50 resize-none" placeholder="اكتب فكرة القصة أو هوك الترند..." />
                <input type="number" min={2} max={24} value={sceneCount} onChange={(e) => setSceneCount(Math.max(2, Math.min(24, Number(e.target.value) || 2)))} className="p-3 border border-border rounded-xl text-sm bg-secondary/50 h-fit" />
              </div>
            </div>

            <div className="bg-card border border-border/60 rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-bold">اختيار الشخصيات</h3>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                {characters.map((char) => {
                  const ref = char.images.front || char.images.reference || char.images.normal || '';
                  const selected = selectedCharIds.includes(char.id);
                  return (
                    <button key={char.id} onClick={() => toggleChar(char.id)} className={`border rounded-xl overflow-hidden ${selected ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`}>
                      <div className="aspect-square bg-secondary">{ref ? <img src={ref} alt={char.name} className="w-full h-full object-cover" /> : <div className="w-full h-full" />}</div>
                      <div className="text-[10px] p-1 truncate">{char.name}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-card border border-border/60 rounded-2xl p-4 space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <button onClick={generateScriptAndScenes} disabled={isGeneratingScript || !selectedCharIds.length} className="py-3 bg-primary text-primary-foreground rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50">
                  {isGeneratingScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} توليد سيناريو
                </button>
                <button onClick={generateFramesForScenes} disabled={isGeneratingFrames || !scenes.length} className="py-3 bg-secondary text-secondary-foreground rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50">
                  {isGeneratingFrames ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />} توليد الصور
                </button>
                <button onClick={generateDraftVideos} disabled={isGeneratingVideos || !scenes.some((s) => s.frameImage)} className="py-3 bg-secondary text-secondary-foreground rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50">
                  {isGeneratingVideos ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />} توليد الفيديو
                </button>
                <button onClick={saveNewStoryboard} disabled={isSaving || !scenes.length} className="py-3 bg-primary text-primary-foreground rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50">
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} حفظ المشروع
                </button>
              </div>
            </div>

            {(script || scenes.length > 0) && (
              <div className="bg-card border border-border/60 rounded-2xl p-4 space-y-3">
                {script && (
                  <div className="bg-secondary/40 border border-border rounded-xl p-3">
                    <h4 className="text-xs font-bold mb-1">السيناريو</h4>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{script}</p>
                  </div>
                )}
                <div className="space-y-3">
                  {scenes.map((scene, idx) => (
                    <div key={scene.id} className="bg-secondary/30 border border-border rounded-xl p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">مشهد {idx + 1}</span>
                        <span className="text-[10px] text-muted-foreground">{videoStatuses[idx] || ''}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{scene.description}</p>
                      {scene.dialogue && <p className="text-[11px] mt-1.5 text-foreground/90">"{scene.dialogue}"</p>}
                      {scene.frameImage && <img src={scene.frameImage} alt={`scene-${idx}`} className="mt-2 w-full max-h-56 object-cover rounded-lg border border-border" />}
                      {scene.videoClip && <video src={scene.videoClip} controls className="mt-2 w-full rounded-lg border border-border" />}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === 'studio' && (
        <section className="space-y-4">
          <div className="bg-card border border-border/60 rounded-2xl p-4 space-y-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <h3 className="text-sm font-bold">المحرر والإنتاج</h3>
              <div className="flex gap-2">
                <select value={selectedStoryboardId} onChange={(e) => setSelectedStoryboardId(e.target.value)} className="p-2.5 border border-border rounded-xl bg-secondary/50 text-xs min-w-[220px]">
                  <option value="">اختر مشروع قصة</option>
                  {storyboards.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
                <Link to="/storyboards?tab=create" className="px-3 py-2 rounded-xl bg-secondary text-secondary-foreground text-xs font-bold flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  جديد
                </Link>
              </div>
            </div>
            {!studioStoryboard && <div className="text-xs text-muted-foreground">اختر مشروعًا من القائمة لبدء التحرير والإنتاج.</div>}
          </div>

          {studioStoryboard && (
            <>
              <div className="bg-card border border-border/60 rounded-2xl p-4">
                <h4 className="text-sm font-bold">{studioStoryboard.title}</h4>
                <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{studioStoryboard.script}</p>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {studioStoryboard.scenes.map((scene, idx) => (
                  <div key={scene.id} className="bg-card border border-border/60 rounded-2xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">مشهد {idx + 1}</span>
                      <button onClick={() => regenerateStudioScene(idx)} className="text-[11px] text-primary flex items-center gap-1">
                        <RefreshCw className="w-3 h-3" />
                        إعادة توليد
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">{scene.description}</p>
                    {scene.dialogue && <p className="text-[11px] text-foreground/90">"{scene.dialogue}"</p>}
                    {scene.frameImage ? (
                      <img src={scene.frameImage} alt={`studio-scene-${idx}`} className="w-full rounded-xl border border-border max-h-64 object-cover" />
                    ) : (
                      <div className="w-full aspect-video rounded-xl border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground">لا توجد صورة</div>
                    )}
                    {scene.videoClip && <video src={scene.videoClip} controls className="w-full rounded-xl border border-border" />}
                    {videoStatuses[idx] && <div className="text-[10px] text-muted-foreground">{videoStatuses[idx]}</div>}
                  </div>
                ))}
              </div>

              <div className="bg-card border border-border/60 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                <button
                  onClick={generateStudioFrames}
                  disabled={isGeneratingFrames}
                  className="py-3 bg-secondary text-secondary-foreground rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isGeneratingFrames ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
                  توليد المشاهد غير المولدة
                </button>
                <button onClick={generateStudioVideos} disabled={isGeneratingVideos} className="py-3 bg-primary text-primary-foreground rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50">
                  {isGeneratingVideos ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  توليد فيديوهات المشاهد
                </button>
                <button onClick={exportStudioFinalVideo} disabled={isMerging || !studioStoryboard.scenes.some((s) => s.videoClip)} className="py-3 bg-secondary text-secondary-foreground rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50">
                  {isMerging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  تصدير الفيديو النهائي
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {mergedVideoUrl && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setMergedVideoUrl('')}>
          <div className="bg-card border border-border rounded-2xl p-4 max-w-2xl w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold">الفيديو النهائي</h3>
            <video src={mergedVideoUrl} controls className="w-full rounded-xl" autoPlay />
            <a href={mergedVideoUrl} download="final_story_video.mp4" className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold flex items-center justify-center gap-2">
              <Download className="w-4 h-4" />
              تنزيل الفيديو
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
