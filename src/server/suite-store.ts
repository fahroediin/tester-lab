/*
 * tester-lab - Suite store
 * Test suites that group test scenarios under a project.
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { supabase } from './supabase-client.js';

export interface Suite {
  id: string;
  projectId: string;
  name: string;
  description: string;
  createdAt: string;
}

interface SuiteRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

function rowToSuite(row: SuiteRow): Suite {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description || '',
    createdAt: row.created_at
  };
}

export async function getSuitesByProjectId(projectId: string): Promise<Suite[]> {
  const { data, error } = await supabase
    .from('suites')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch suites:', error);
    return [];
  }
  return (data || []).map(rowToSuite);
}

export async function getSuiteById(id: string): Promise<Suite | undefined> {
  const { data, error } = await supabase
    .from('suites')
    .select('*')
    .eq('id', id)
    .limit(1)
    .single();

  if (error || !data) return undefined;
  return rowToSuite(data);
}

export async function createSuite(projectId: string, name: string, description = ''): Promise<Suite> {
  const { data, error } = await supabase
    .from('suites')
    .insert({ project_id: projectId, name, description })
    .select()
    .single();

  if (error || !data) {
    if ((error as { code?: string })?.code === '23505') {
      throw new Error('DUPLICATE_SUITE');
    }
    console.error('Failed to create suite:', error);
    throw new Error('Failed to create suite');
  }
  return rowToSuite(data);
}

export async function updateSuite(
  id: string,
  updates: Partial<Pick<Suite, 'name' | 'description'>>
): Promise<Suite | null> {
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.description !== undefined) payload.description = updates.description;

  const { data, error } = await supabase
    .from('suites')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    if ((error as { code?: string })?.code === '23505') {
      throw new Error('DUPLICATE_SUITE');
    }
    console.error('Failed to update suite:', error);
    return null;
  }
  return rowToSuite(data);
}

/**
 * Delete a suite. Scenarios referencing it will have suite_id set to NULL
 * via ON DELETE SET NULL constraint.
 */
export async function deleteSuite(id: string): Promise<boolean> {
  const { error } = await supabase.from('suites').delete().eq('id', id);
  if (error) {
    console.error('Failed to delete suite:', error);
    return false;
  }
  return true;
}
