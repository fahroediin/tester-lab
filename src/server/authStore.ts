import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

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

const dataDir = path.join(process.cwd(), 'data');
const usersFilePath = path.join(dataDir, 'users.json');

function getAdminConfig(): { username: string; email: string; password: string } {
  return {
    username: process.env.ADMIN_USERNAME || 'admin',
    email: process.env.ADMIN_EMAIL || 'admin@testerlab.com',
    password: process.env.ADMIN_PASSWORD || 'AdminPassword123!'
  };
}

function ensureDataDirExists() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

export function loadUsers(): User[] {
  ensureDataDirExists();
  let users: User[] = [];

  if (fs.existsSync(usersFilePath)) {
    try {
      const raw = fs.readFileSync(usersFilePath, 'utf-8');
      users = JSON.parse(raw);
    } catch {
      users = [];
    }
  }

  const { username, email, password } = getAdminConfig();

  // Ensure Admin configured in .env is always synced and present
  const adminIndex = users.findIndex(
    (u) => u.username.toLowerCase() === username.toLowerCase() || u.role === 'admin'
  );

  if (adminIndex === -1) {
    const adminUser: User = {
      id: 'usr_admin_env',
      username,
      email,
      passwordHash: bcrypt.hashSync(password, 10),
      role: 'admin',
      status: 'approved',
      createdAt: new Date().toISOString()
    };
    users.unshift(adminUser);
    saveUsers(users);
  } else {
    // If admin credentials in .env are updated, keep credentials in sync
    const currentAdmin = users[adminIndex];
    const isPasswordSame = bcrypt.compareSync(password, currentAdmin.passwordHash);
    if (currentAdmin.username !== username || !isPasswordSame) {
      users[adminIndex].username = username;
      users[adminIndex].email = email;
      users[adminIndex].passwordHash = bcrypt.hashSync(password, 10);
      users[adminIndex].status = 'approved';
      saveUsers(users);
    }
  }

  return users;
}

export function saveUsers(users: User[]): void {
  ensureDataDirExists();
  fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2), 'utf-8');
}

export function findUserByUsername(username: string): User | undefined {
  const users = loadUsers();
  return users.find((u) => u.username.toLowerCase() === username.toLowerCase());
}

export function findUserById(id: string): User | undefined {
  const users = loadUsers();
  return users.find((u) => u.id === id);
}

export function addUser(user: Omit<User, 'id' | 'createdAt'>): User {
  const users = loadUsers();
  const newUser: User = {
    ...user,
    id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  saveUsers(users);
  return newUser;
}

export function updateUserStatus(id: string, status: 'approved' | 'rejected'): User | null {
  const users = loadUsers();
  const index = users.findIndex((u) => u.id === id);
  if (index === -1) return null;

  users[index].status = status;
  saveUsers(users);
  return users[index];
}

export function deleteUser(id: string): boolean {
  const users = loadUsers();
  const filtered = users.filter((u) => u.id !== id);
  if (filtered.length === users.length) return false;
  saveUsers(filtered);
  return true;
}
