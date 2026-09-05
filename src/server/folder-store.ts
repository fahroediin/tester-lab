/*
 * tester-lab - Folder store
 * Per-user project folders that group test scenarios.
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { supabase } from './supabase-client.js';

export interface Folder {
  id: string;
  userId: string;
  name: string;
  description: string;
  createdAt: string;
}

interface FolderRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

function rowToFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description || '',
    createdAt: row.created_at
  };
}

export async function getUserFolders(userId: string): Promise<Folder[]> {
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch folders:', error);
    return [];
  }
  return (data || []).map(rowToFolder);
}

export async function getFolderById(id: string): Promise<Folder | undefined> {
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .eq('id', id)
    .limit(1)
    .single();

  if (error || !data) return undefined;
  return rowToFolder(data);
}

export async function createFolder(userId: string, name: string, description = ''): Promise<Folder> {
  const { data, error } = await supabase
    .from('folders')
    .insert({ user_id: userId, name, description })
    .select()
    .single();

  if (error || !data) {
    // 23505 is Postgres unique_violation (duplicate folder name for this user)
    if ((error as { code?: string })?.code === '23505') {
      throw new Error('DUPLICATE_FOLDER');
    }
    console.error('Failed to create folder:', error);
    throw new Error('Failed to create folder');
  }
  return rowToFolder(data);
}

export async function updateFolder(id: string, updates: Partial<Pick<Folder, 'name' | 'description'>>): Promise<Folder | null> {
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.description !== undefined) payload.description = updates.description;

  const { data, error } = await supabase
    .from('folders')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    if ((error as { code?: string })?.code === '23505') {
      throw new Error('DUPLICATE_FOLDER');
    }
    console.error('Failed to update folder:', error);
    return null;
  }
  return rowToFolder(data);
}

/**
 * Delete a folder. Scenarios inside it are not deleted; their folder_id is set
 * to NULL by the ON DELETE SET NULL constraint, so they become uncategorized.
 */
export async function deleteFolder(id: string): Promise<boolean> {
  const { error } = await supabase.from('folders').delete().eq('id', id);
  if (error) {
    console.error('Failed to delete folder:', error);
    return false;
  }
  return true;
}
