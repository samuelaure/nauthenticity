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

export interface Media {
    id: string;
    type: string;
    storageUrl: string;
}

export interface Post {
    id: string;
    instagramUrl: string;
    caption?: string;
    postedAt: string;
    likes: number;
    comments: number;
    media: Media[];
}

export interface AccountDetails extends Account {
    posts: Post[];
}

export const getAccounts = async () => {
    const { data } = await api.get<Account[]>('/accounts');
    return data;
};

export const getAccount = async (username: string) => {
    const { data } = await api.get<AccountDetails>(`/accounts/${username}`);
    return data;
};

export const ingestAccount = async (username: string) => {
    const { data } = await api.post('/ingest', { username });
    return data;
};
