import axios from 'axios';

const API_URL = 'http://localhost:3000';

export const api = axios.create({
  baseURL: API_URL,
});

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
  duration?: number;
}

export interface QueueJob {
  id: string;
  name: string;
  data: any;
  timestamp: number;
  failedReason?: string;
  progress: number | any;
  processedOn?: number;
  finishedOn?: number;
  opts: any;
}

export interface QueueStatus {
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

export const ingestAccount = async (username: string) => {
  const { data } = await api.post('/ingest', { username });
  return data;
};

export const getQueueStatus = async () => {
  const { data } = await api.get<QueueStatus>('/queue');
  return data;
};
