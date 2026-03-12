// fal.ai Video Generation Service via Backend API

const getApiBase = () => window.location.origin;

function getVideoModel(): string {
  return localStorage.getItem('AI_VIDEO_MODEL') || 'fal-ai/kling-video/v2.6/text-to-video/standard';
}

export interface FalVideoTask {
  taskId: string;
  imageUrl?: string;
}

export interface FalTaskStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  progress?: number;
  error?: string;
}

export const FalService = {
  async generateTextToVideo(prompt: string, model?: string, aspectRatio = '9:16'): Promise<FalVideoTask> {
    const videoModel = model || getVideoModel();
    const resp = await fetch(`${getApiBase()}/api/fal/generate-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model: videoModel, aspect_ratio: aspectRatio }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || `خطأ ${resp.status}`);
    }
    const data = await resp.json();
    return { taskId: data.taskId || data.data?.taskId };
  },

  async generateImageToVideo(imageBase64: string, prompt: string, model?: string, aspectRatio = '9:16'): Promise<FalVideoTask> {
    const videoModel = model || getVideoModel();
    const resp = await fetch(`${getApiBase()}/api/fal/image-to-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: imageBase64,
        prompt,
        model: videoModel,
        aspect_ratio: aspectRatio,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || `خطأ ${resp.status}`);
    }
    const data = await resp.json();
    return { taskId: data.taskId, imageUrl: data.imageUrl };
  },

  async pollTaskStatus(taskId: string, onProgress?: (status: string) => void): Promise<string> {
    const maxPolls = 120;
    for (let i = 0; i < maxPolls; i++) {
      await new Promise((r) => setTimeout(r, 5000));

      const resp = await fetch(`${getApiBase()}/api/fal/task-status/${taskId}`);
      if (!resp.ok) continue;

      const result = await resp.json();
      const status = result.status || '';

      if (onProgress) {
        onProgress(`${status} (${i + 1}/${maxPolls})`);
      }

      if (status === 'completed' && result.videoUrl) {
        return result.videoUrl;
      }

      if (status === 'failed') {
        throw new Error(result.error || 'فشل توليد الفيديو');
      }
    }
    throw new Error('انتهت مهلة توليد الفيديو (10 دقائق)');
  },

  async uploadImage(imageBase64: string): Promise<string> {
    const resp = await fetch(`${getApiBase()}/api/fal/upload-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: imageBase64 }),
    });
    if (!resp.ok) throw new Error('فشل رفع الصورة');
    const data = await resp.json();
    return data.url;
  },
};
