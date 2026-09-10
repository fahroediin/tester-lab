/*
 * tester-lab - Project (Folder) store
 * Per-user projects (stored in table 'folders') that group test suites.
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { supabase } from './supabase-client.js';

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string;
  createdAt: string;
}

// Backward-compatible type alias
export type Folder = Project;

interface FolderRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

function rowToProject(row: FolderRow): Project {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description || '',
    createdAt: row.created_at
  };
}

export async function getUserProjects(userId: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch projects:', error);
    return [];
  }
  return (data || []).map(rowToProject);
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .eq('id', id)
    .limit(1)
    .single();

  if (error || !data) return undefined;
  return rowToProject(data);
}

export async function createProject(userId: string, name: string, description = ''): Promise<Project> {
  const { data, error } = await supabase
    .from('folders')
    .insert({ user_id: userId, name, description })
    .select()
    .single();

  if (error || !data) {
    // 23505 is Postgres unique_violation (duplicate project name for this user)
    if ((error as { code?: string })?.code === '23505') {
      throw new Error('DUPLICATE_PROJECT');
    }
    console.error('Failed to create project:', error);
    throw new Error('Failed to create project');
  }
  return rowToProject(data);
}

export async function updateProject(id: string, updates: Partial<Pick<Project, 'name' | 'description'>>): Promise<Project | null> {
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
      throw new Error('DUPLICATE_PROJECT');
    }
    console.error('Failed to update project:', error);
    return null;
  }
  return rowToProject(data);
}

/**
 * Delete a project. Scenarios inside it are not deleted; their folder_id is set
 * to NULL by the ON DELETE SET NULL constraint, so they become uncategorized.
 * Suites inside it are cascade deleted.
 */
export async function deleteProject(id: string): Promise<boolean> {
  const { error } = await supabase.from('folders').delete().eq('id', id);
  if (error) {
    console.error('Failed to delete project:', error);
    return false;
  }
  return true;
}

// Backward compatibility aliases
export const getUserFolders = getUserProjects;
export const getFolderById = getProjectById;
export const createFolder = createProject;
export const updateFolder = updateProject;
export const deleteFolder = deleteProject;
