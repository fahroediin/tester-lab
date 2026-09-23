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

export async function findUserByEmailAsync(email: string): Promise<User | undefined> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .ilike('email', email)
    .limit(1)
    .single();

  if (error || !data) return undefined;
  return rowToUser(data);
}

/** Store a password-reset token hash + expiry, and clear the used flag. */
export async function setResetToken(userId: string, hash: string, expiresIso: string): Promise<void> {
  await supabase
    .from('users')
    .update({ reset_token_hash: hash, reset_token_expires: expiresIso, reset_token_used: false })
    .eq('id', userId);
}

/** Find a user by their reset-token hash, returning only the fields the reset flow needs. */
export async function findUserByResetHash(
  hash: string
): Promise<{ id: string; expires: string | null; used: boolean } | undefined> {
  const { data, error } = await supabase
    .from('users')
    .select('id, reset_token_expires, reset_token_used')
    .eq('reset_token_hash', hash)
    .limit(1)
    .single();

  if (error || !data) return undefined;
  return { id: data.id, expires: data.reset_token_expires, used: !!data.reset_token_used };
}

/** Apply a new password hash and burn the reset token (single use). */
export async function consumeResetToken(userId: string, newPasswordHash: string): Promise<void> {
  await supabase
    .from('users')
    .update({ password_hash: newPasswordHash, reset_token_used: true })
    .eq('id', userId);
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
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', id);

  if (error) return false;
  return true;
}
