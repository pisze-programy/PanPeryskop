import { nanoid } from 'nanoid';

export interface User {
  id: string;
  device_id: string;
  session_token: string;
  role: 'user' | 'admin';
  created_at: number;
  avatar_key: string | null;
}

export interface Post {
  id: string;
  user_id: string;
  type: 'photo' | 'video';
  lat: number;
  lng: number;
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  media_key: string | null;
  thumb_key: string | null;
  duration_ms: number | null;
  created_at: number;
  likes_count: number;
  views_count: number;
  shares_count: number;
  grid_cell_id: string | null;
  is_sponsored: boolean;
  category: string;
  link_url: string | null;
  external_id: string | null;
}

// D1 row shape — SQLite returns 0/1 for boolean columns.
export interface PostRow {
  id: string;
  user_id: string;
  type: string;
  lat: number;
  lng: number;
  description: string;
  status: string;
  media_key: string | null;
  thumb_key: string | null;
  duration_ms: number | null;
  created_at: number;
  likes_count: number;
  views_count: number;
  shares_count: number;
  grid_cell_id: string | null;
  is_sponsored: number;
  category: string;
  link_url: string | null;
  external_id: string | null;
}

// A post row joined with author info (and optional watched flag) for /stories.
export interface StoryRow extends PostRow {
  author_name: string;
  author_avatar_key: string | null;
  watched?: number;
}

// Content category enum — NOT driven by is_sponsored (which is visual only).
export const POST_CATEGORIES = ['live', 'events'] as const;
export type PostCategory = (typeof POST_CATEGORIES)[number];
export const POST_CATEGORY_SET: ReadonlySet<string> = new Set<string>(POST_CATEGORIES);

// Media types and moderation statuses — single source of truth.
export const POST_TYPES = ['photo', 'video'] as const;
export type PostType = (typeof POST_TYPES)[number];
export const POST_TYPE_SET: ReadonlySet<string> = new Set<string>(POST_TYPES);

export const STATUS_PENDING = 'pending';
export const STATUS_APPROVED = 'approved';
export const STATUS_REJECTED = 'rejected';
export const POST_STATUSES = [STATUS_PENDING, STATUS_APPROVED, STATUS_REJECTED] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

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
  likes: 5,
  shares: 6,
  decay: 0.99,
};

export const ENGAGEMENT_BONUS_FACTOR = 1.0;

const HOUR_MS = 3_600_000;

export function engagementRatio(post: Post): number {
  const views = Math.max(post.views_count, 1);
  return post.likes_count / views;
}

export function popularityScore(post: Post): number {
  const ageH = Math.max(0, (Date.now() - post.created_at) / HOUR_MS);
  const raw =
    POPULARITY_WEIGHTS.views * post.views_count +
    POPULARITY_WEIGHTS.likes * post.likes_count +
    POPULARITY_WEIGHTS.shares * post.shares_count;
  const engagement = 1 + ENGAGEMENT_BONUS_FACTOR * engagementRatio(post);
  return raw * engagement * Math.pow(POPULARITY_WEIGHTS.decay, ageH);
}

export const TTL_HOURS = 24;
export const TTL_MS = TTL_HOURS * HOUR_MS;

// Seed may schedule posts up to this far into the future (created_at window).
export const MAX_LOOKAHEAD_MS = 366 * 24 * HOUR_MS;

export const ADMIN_SECRET = 'panperyskop-admin-dev';
