import crypto from 'crypto';
import { supabase } from './supabase-client.js';
import type { User } from './auth-store.js';

export interface ApiKeyRecord {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  status: 'active' | 'revoked';
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export interface GeneratedApiKey extends ApiKeyRecord {
  rawKey: string;
}

interface ApiKeyRow {
  id: string;
  user_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  status: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

function rowToRecord(row: ApiKeyRow): ApiKeyRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    keyPrefix: row.key_prefix,
    status: row.status as 'active' | 'revoked',
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at || undefined,
    revokedAt: row.revoked_at || undefined
  };
}

export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Generate a new API key for a user.
 * Returns the raw key string ONLY once upon creation.
 */
export async function generateApiKey(userId: string, name: string = 'Default API Key'): Promise<GeneratedApiKey> {
  const trimmedName = (name || '').trim() || 'Default API Key';

  // Disallow duplicate API Key name/description for the same user (active or revoked)
  const { data: existingKey } = await supabase
    .from('api_keys')
    .select('id, name')
    .eq('user_id', userId)
    .ilike('name', trimmedName)
    .limit(1)
    .single();

  if (existingKey) {
    throw new Error(`An API key with the name "${trimmedName}" already exists. Please choose a different name.`);
  }

  const randomBytes = crypto.randomBytes(32).toString('hex');
  const rawKey = `tl_live_${randomBytes}`;
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = `${rawKey.substring(0, 15)}...${rawKey.substring(rawKey.length - 4)}`;

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      user_id: userId,
      name: trimmedName,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      status: 'active'
    })
    .select()
    .single();

  if (error || !data) {
    console.error('Failed to create API key in Supabase:', error);
    throw new Error('Failed to generate API key');
  }

  return {
    ...rowToRecord(data),
    rawKey
  };
}

/**
 * Get all API keys for a specific user (excluding hashes).
 */
export async function getUserApiKeys(userId: string): Promise<ApiKeyRecord[]> {
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, user_id, name, key_prefix, status, created_at, last_used_at, revoked_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch user API keys:', error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    keyPrefix: row.key_prefix,
    status: row.status as 'active' | 'revoked',
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at || undefined,
    revokedAt: row.revoked_at || undefined
  }));
}

/**
 * Revoke an API key.
 */
export async function revokeApiKey(userId: string, keyId: string): Promise<boolean> {
  const { error } = await supabase
    .from('api_keys')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString()
    })
    .eq('id', keyId)
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to revoke API key:', error);
    return false;
  }

  return true;
}

/**
 * Hard delete an API key.
 */
export async function deleteApiKey(userId: string, keyId: string): Promise<boolean> {
  const { error } = await supabase
    .from('api_keys')
    .delete()
    .eq('id', keyId)
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to delete API key:', error);
    return false;
  }

  return true;
}

/**
 * Validate an incoming raw API Key against the database.
 * If valid and associated with an approved user, updates last_used_at and returns the User.
 */
export async function validateApiKey(rawKey: string): Promise<User | null> {
  if (!rawKey || !rawKey.startsWith('tl_live_')) {
    return null;
  }

  const keyHash = hashApiKey(rawKey);

  const { data: keyRecord, error: keyError } = await supabase
    .from('api_keys')
    .select('id, user_id, status')
    .eq('key_hash', keyHash)
    .eq('status', 'active')
    .single();

  if (keyError || !keyRecord) {
    return null;
  }

  // Fetch associated user
  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', keyRecord.user_id)
    .single();

  if (userError || !userRow) {
    return null;
  }

  if (userRow.status !== 'approved') {
    return null;
  }

  // Update last_used_at timestamp asynchronously
  Promise.resolve(
    supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyRecord.id)
  ).catch((err: unknown) => console.warn('Failed to update api_key last_used_at:', err));

  return {
    id: userRow.id,
    username: userRow.username,
    email: userRow.email,
    passwordHash: userRow.password_hash,
    role: userRow.role,
    status: userRow.status,
    createdAt: userRow.created_at
  };
}
