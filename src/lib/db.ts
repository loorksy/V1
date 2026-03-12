const API = window.location.origin;

// In-memory cache for performance
const cache: {
  characters?: { data: Character[]; ts: number };
  storyboards?: { data: Storyboard[]; ts: number };
} = {};
const CACHE_TTL = 30000; // 30 seconds

function toTimestamp(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Date.parse(value);
    if (!Number.isNaN(n)) return n;
  }
  return Date.now();
}

export interface Character {
  id: string;
  name: string;
  description: string;
  visualTraits: string;
  images: {
    front?: string;
    back?: string;
    closeup?: string;
    left?: string;
    right?: string;
    threeQuarter?: string;
    reference?: string;
    normal?: string;
    surreal?: string;
  };
  createdAt: number;
}

export interface Storyboard {
  id: string;
  title: string;
  script: string;
  characters: string[];
  scenes: Scene[];
  aspectRatio?: '16:9' | '9:16';
  createdAt: number;
  videoTasks?: { taskId: string; sceneIndex: number }[];
}

export interface Scene {
  id: string;
  description: string;
  characterIds: string[];
  dialogue?: string;
  frameImage?: string;
  videoClip?: string;
  audioClip?: string;
}

export interface AdCampaign {
  id: string;
  title: string;
  images: string[];
  createdAt: number;
}

export interface MediaItem {
  id: string;
  type: 'video' | 'image' | 'thumbnail';
  title: string;
  description?: string;
  data: string;
  source: 'animation' | 'product' | 'thumbnail' | 'brand' | 'storyboard';
  characterName?: string;
  aspectRatio?: string;
  createdAt: number;
}

async function api(path: string, options?: RequestInit) {
  const resp = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || `API error ${resp.status}`);
  }
  return resp.json();
}

export const db = {
  // Characters
  async getCharacter(id: string): Promise<Character | undefined> {
    try {
      return await api(`/api/characters/${id}`);
    } catch { return undefined; }
  },

  async getAllCharacters(): Promise<Character[]> {
    try {
      if (cache.characters && Date.now() - cache.characters.ts < CACHE_TTL) {
        return cache.characters.data;
      }
      const data = await api('/api/characters/list');
      const normalized = (data || []).map((c: any) => ({ ...c, createdAt: toTimestamp(c.createdAt) }));
      cache.characters = { data: normalized, ts: Date.now() };
      return normalized;
    } catch { return []; }
  },

  async saveCharacter(character: Character) {
    cache.characters = undefined; // invalidate
    return api('/api/characters/save', {
      method: 'POST',
      body: JSON.stringify({
        id: character.id,
        name: character.name,
        description: character.description,
        visualTraits: character.visualTraits || '',
        images: character.images,
      }),
    });
  },

  async deleteCharacter(id: string) {
    cache.characters = undefined; // invalidate
    return api(`/api/characters/${id}`, { method: 'DELETE' });
  },

  // Storyboards
  async getStoryboard(id: string): Promise<Storyboard | undefined> {
    try {
      const data = await api(`/api/storyboards/${id}`);
      if (data && data.scenes) {
        data.scenes = data.scenes.map((s: any, i: number) => ({
          id: s.id || `scene-${i}`,
          description: s.description || '',
          characterIds: s.characterIds || [],
          dialogue: s.dialogue || '',
          frameImage: s.frameImage || '',
          videoClip: s.videoUrl || s.videoClip || '',
          audioClip: s.audioClip || '',
        }));
      }
      if (data) data.createdAt = toTimestamp(data.createdAt);
      return data;
    } catch { return undefined; }
  },

  async getAllStoryboards(): Promise<Storyboard[]> {
    try {
      if (cache.storyboards && Date.now() - cache.storyboards.ts < CACHE_TTL) {
        return cache.storyboards.data;
      }
      const items = await api('/api/storyboards/list');
      const result = items.map((sb: any) => ({
        ...sb,
        createdAt: toTimestamp(sb.createdAt),
        scenes: (sb.scenes || []).map((s: any, i: number) => ({
          id: s.id || `scene-${i}`,
          description: s.description || '',
          characterIds: s.characterIds || [],
          dialogue: s.dialogue || '',
          frameImage: s.frameImage || '',
          videoClip: s.videoUrl || s.videoClip || '',
          audioClip: s.audioClip || '',
        })),
      }));
      cache.storyboards = { data: result, ts: Date.now() };
      return result;
    } catch { return []; }
  },

  async saveStoryboard(storyboard: Storyboard) {
    cache.storyboards = undefined; // invalidate
    return api("/api/storyboards/save", {
      method: "POST",
      body: JSON.stringify({
        id: storyboard.id,
        title: storyboard.title || "",
        script: storyboard.script || "",
        characters: storyboard.characters || [],
        aspectRatio: storyboard.aspectRatio || "16:9",
        scenes: (storyboard.scenes || []).map(s => ({
          id: s.id,
          description: s.description || "",
          characterIds: s.characterIds || [],
          dialogue: s.dialogue || "",
          frameImage: s.frameImage || "",
          videoUrl: s.videoClip || "",
          audioClip: s.audioClip || "",
        })),
      }),
    });
  },

  async deleteStoryboard(id: string) {
    cache.storyboards = undefined; // invalidate
    return api(`/api/storyboards/${id}`, { method: 'DELETE' });
  },

  // Media Gallery - upload to server
  async getMediaItem(id: string): Promise<MediaItem | undefined> {
    try {
      const items = await api('/api/media/list');
      return items.find((m: any) => m.id === id);
    } catch { return undefined; }
  },

  async getAllMedia(): Promise<MediaItem[]> {
    try {
      const items = await api('/api/media/list');
      return items.map((m: any) => ({
        id: m.id,
        type: m.type,
        title: m.source || '',
        data: m.url,
        source: m.source,
        createdAt: toTimestamp(m.createdAt),
      }));
    } catch { return []; }
  },

  async saveMediaItem(item: MediaItem) {
    return api('/api/media/upload', {
      method: 'POST',
      body: JSON.stringify({
        id: item.id,
        data: item.data,
        type: item.type,
        source: item.source,
        title: item.title || '',
        description: item.description || '',
        aspectRatio: item.aspectRatio || '16:9',
      }),
    });
  },

  async deleteMediaItem(id: string) {
    return api(`/api/media/${id}`, { method: 'DELETE' });
  },

  // Ad Campaigns (keep simple for now)
  async getAdCampaign(id: string): Promise<AdCampaign | undefined> { return undefined; },
  async getAllAdCampaigns(): Promise<AdCampaign[]> { return []; },
  async saveAdCampaign(campaign: AdCampaign) { return; },
  async deleteAdCampaign(id: string) { return; },
};
