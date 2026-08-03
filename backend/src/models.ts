import { nanoid } from 'nanoid';

export interface User {
  id: string;
  device_id: string;
  session_token: string;
  role: 'user' | 'admin';
  created_at: number;
}

export interface Post {
  id: string;
  user_id: string;
  type: 'photo' | 'video' | 'text';
  lat: number;
  lng: number;
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  media_key: string | null;
  thumb_key: string | null;
  duration_ms: number | null;
  created_at: number;
  expires_at: number;
  likes_count: number;
  views_count: number;
  shares_count: number;
  grid_cell_id: string | null;
}

export interface Story extends Omit<Post, 'status'> {
  liked: boolean;
  watched: boolean;
  author_name: string;
  media_url: string | null;
  thumb_url: string | null;
}

export interface HeatmapCell {
  grid_cell_id: string;
  lat: number;
  lng: number;
  heat: number;
}

export function gridCellId(lat: number, lng: number, cellSize: number = 0.002): string {
  const latIx = Math.floor(lat / cellSize);
  const lngIx = Math.floor(lng / cellSize);
  return `${latIx}:${lngIx}`;
}

export const POPULARITY_WEIGHTS = {
  views: 1,
  likes: 3,
  shares: 5,
  decay: 0.99,
};

const HOUR_MS = 3_600_000;

export function popularityScore(post: Post): number {
  const ageH = Math.max(0, (Date.now() - post.created_at) / HOUR_MS);
  const raw =
    POPULARITY_WEIGHTS.views * post.views_count +
    POPULARITY_WEIGHTS.likes * post.likes_count +
    POPULARITY_WEIGHTS.shares * post.shares_count;
  return raw * Math.pow(POPULARITY_WEIGHTS.decay, ageH);
}

export const TTL_HOURS = 24;
export const TTL_MS = TTL_HOURS * HOUR_MS;

export const ADMIN_SECRET = 'panperyskop-admin-dev';
