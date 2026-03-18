import axios from 'axios';

// Sanitize URL to remove accidental quotes, whitespace, or trailing semicolons
const rawUrl = import.meta.env.VITE_API_URL || '/api';
export const API_URL = rawUrl.replace(/['";]/g, '').trim();

export const api = axios.create({
  baseURL: API_URL,
});

export const getMediaUrl = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('/content')) {
    if (API_URL.startsWith('http')) {
      try {
        const urlObj = new URL(API_URL);
        return `${urlObj.origin}${url}`;
      } catch (e) {
        return url;
      }
    }
    return url;
  }
  return url;
};

export interface Account {
  username: string;
  profileImageUrl: string;
  lastScrapedAt: string;
  _count?: {
    posts: number;
  };
}

export interface Transcript {
  id: string;
  text: string;
  json?: any;
}

export interface Post {
  id: string;
  instagramUrl: string;
  caption?: string;
  postedAt: string;
  likes: number;
  comments: number;
  views?: number;
  engagementScore?: number;
  username?: string;
  media: Media[];
  transcripts?: Transcript[];
  collaborators?: { username: string; profilePicUrl?: string; role?: string }[];
  newerPostId?: string | null;
  olderPostId?: string | null;
}

export interface AccountDetails extends Account {
  posts: Post[];
}

export interface Media {
  id: string;
  type: 'video' | 'image';
  storageUrl: string;
  thumbnailUrl?: string; // Added for fast loading
  duration?: number;
}

export interface QueueJob {
  id: string;
  name: string;
  data: any;
  timestamp: number;
  failedReason?: string;
  progress: number;
  progressData?: any;
  processedOn?: number;
  finishedOn?: number;
  opts: any;
  attemptsMade?: number;
}

export interface QueueMetrics {
  counts: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  };
  active: QueueJob[];
  waiting: QueueJob[];
  failed: QueueJob[];
}

export interface QueueStatus {
  download: QueueMetrics;
  compute: QueueMetrics;
  ingestion: QueueMetrics;
}

export const getAccounts = async () => {
  const { data } = await api.get<Account[]>('/accounts');
  return data;
};

export const getAccount = async (username: string) => {
  const { data } = await api.get<AccountDetails>(`/accounts/${username}`);
  return data;
};

export const getPost = async (id: string) => {
  const { data } = await api.get<Post>(`/posts/${id}`);
  return data;
};

export const updatePost = async (
  id: string,
  updates: { caption?: string; transcriptText?: string },
) => {
  const { data } = await api.put(`/posts/${id}`, updates);
  return data;
};

export const ingestAccount = async (payload: {
  username: string;
  limit: number;
  updateSync?: boolean;
}) => {
  const { data } = await api.post('/ingest', payload);
  return data;
};

export const getQueueStatus = async () => {
  const { data } = await api.get<QueueStatus>('/queue');
  return data;
};

export const deleteJob = async (queueName: string, jobId: string) => {
  const { data } = await api.post('/queue/delete-job', { queueName, jobId });
  return data;
};

export interface PostProgress {
  id: string;
  instagramId: string;
  postedAt: string;
  caption: string | null;
  mediaCount: number;
  downloaded: boolean;
  hasVideo: boolean;
  transcribed: boolean;
  transcriptPreview: string | null;
}

export interface AccountProgress {
  summary: {
    totalPosts: number;
    totalMedia: number;
    localMedia: number;
    pendingDownloads: number;
    downloadPct: number;
    videoPostsTotal: number;
    transcribedPosts: number;
    transcriptPct: number;
    totalTranscripts: number;
    phase: string;
    isPaused: boolean;
  };
  activeJobs: Array<{
    id: string;
    name: string;
    progress: number;
    data: any;
    timestamp: number;
    progressData?: {
      step?: string;
      currentItem?: {
        username: string;
        postedAt: string;
        type: string;
      };
    };
  }>;
  posts: PostProgress[];
}

export const getAccountProgress = async (username: string) => {
  const { data } = await api.get<AccountProgress>(`/accounts/${username}/progress`);
  return data;
};

export const abortIngestion = async (username: string) => {
  const { data } = await api.post('/abort', { username });
  return data;
};

export const pauseIngestion = async (username: string) => {
  const { data } = await api.post('/pause', { username });
  return data;
};

export const resumeIngestion = async (username: string) => {
  const { data } = await api.post('/resume', { username });
  return data;
};
