import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

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

function ensureDataDirExists() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

export function loadUsers(): User[] {
  ensureDataDirExists();
  if (!fs.existsSync(usersFilePath)) {
    // Seed default admin account
    const defaultAdmin: User = {
      id: 'usr_admin_default',
      username: 'admin',
      email: 'admin@testerlab.com',
      passwordHash: bcrypt.hashSync('AdminPassword123!', 10),
      role: 'admin',
      status: 'approved',
      createdAt: new Date().toISOString()
    };
    fs.writeFileSync(usersFilePath, JSON.stringify([defaultAdmin], null, 2), 'utf-8');
    return [defaultAdmin];
  }

  try {
    const raw = fs.readFileSync(usersFilePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
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
