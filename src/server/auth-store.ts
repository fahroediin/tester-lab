import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { supabase } from './supabase-client.js';

dotenv.config();

export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'user';
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  role: string;
  status: string;
  created_at: string;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role as 'admin' | 'user',
    status: row.status as 'pending' | 'approved' | 'rejected',
    createdAt: row.created_at
  };
}

function getAdminConfig(): { username: string; email: string; password: string } {
  return {
    username: process.env.ADMIN_USERNAME || 'admin',
    email: process.env.ADMIN_EMAIL || 'admin@testerlab.com',
    password: process.env.ADMIN_PASSWORD || 'AdminPassword123!'
  };
}

/**
 * Ensures the admin user from .env exists and is synced in the database.
 * Called once during server bootstrap.
 */
export async function ensureAdminUser(): Promise<void> {
  const { username, email, password } = getAdminConfig();

  const { data: existingAdmin } = await supabase
    .from('users')
    .select('*')
    .or(`username.ilike.${username},role.eq.admin`)
    .limit(1)
    .single();

  if (!existingAdmin) {
    const adminUser = {
      id: 'usr_admin_env',
      username,
      email,
      password_hash: bcrypt.hashSync(password, 10),
      role: 'admin',
      status: 'approved',
      created_at: new Date().toISOString()
    };
    await supabase.from('users').upsert(adminUser, { onConflict: 'id' });
  } else {
    const isPasswordSame = bcrypt.compareSync(password, existingAdmin.password_hash);
    if (existingAdmin.username !== username || !isPasswordSame) {
      await supabase
        .from('users')
        .update({
          username,
          email,
          password_hash: bcrypt.hashSync(password, 10),
          status: 'approved'
        })
        .eq('id', existingAdmin.id);
    }
  }
}

export function loadUsers(): User[] {
  // Synchronous wrapper — kept for backward compatibility with admin-routes.ts
  // In practice, use loadUsersAsync() for new code
  console.warn('[DEPRECATION] loadUsers() is synchronous and should be replaced with loadUsersAsync()');
  return [];
}

export async function loadUsersAsync(): Promise<User[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to load users from Supabase:', error);
    return [];
  }

  return (data || []).map(rowToUser);
}

export function findUserByUsername(username: string): User | undefined {
  // This must remain synchronous for auth-routes.ts compatibility
  // We'll use a blocking pattern via cache that's refreshed
  return undefined; // Replaced by async version
}

export async function findUserByUsernameAsync(username: string): Promise<User | undefined> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .ilike('username', username)
    .limit(1)
    .single();

  if (error || !data) return undefined;
  return rowToUser(data);
}

export function findUserById(id: string): User | undefined {
  // Synchronous stub — replaced by async version
  return undefined;
}

export async function findUserByIdAsync(id: string): Promise<User | undefined> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .limit(1)
    .single();

  if (error || !data) return undefined;
  return rowToUser(data);
}

export async function addUser(user: Omit<User, 'id' | 'createdAt'>): Promise<User> {
  const newRow = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    username: user.username,
    email: user.email,
    password_hash: user.passwordHash,
    role: user.role,
    status: user.status,
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('users')
    .insert(newRow)
    .select()
    .single();

  if (error) {
    console.error('Failed to add user:', error);
    throw new Error('Failed to create user');
  }

  return rowToUser(data);
}

export async function updateUserStatus(id: string, status: 'approved' | 'rejected'): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error || !data) return null;
  return rowToUser(data);
}

export async function deleteUser(id: string): Promise<boolean> {
  const { error, count } = await supabase
    .from('users')
    .delete()
    .eq('id', id);

  if (error) return false;
  return true;
}

export function saveUsers(_users: User[]): void {
  // No-op: individual operations are handled by Supabase directly
  console.warn('[DEPRECATION] saveUsers() is a no-op in Supabase mode');
}
