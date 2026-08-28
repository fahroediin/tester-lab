"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadUsers = loadUsers;
exports.saveUsers = saveUsers;
exports.findUserByUsername = findUserByUsername;
exports.findUserById = findUserById;
exports.addUser = addUser;
exports.updateUserStatus = updateUserStatus;
exports.deleteUser = deleteUser;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const dataDir = path_1.default.join(process.cwd(), 'data');
const usersFilePath = path_1.default.join(dataDir, 'users.json');
// In-memory cache to prevent race conditions on concurrent file I/O
let cachedUsers = null;
function getAdminConfig() {
    return {
        username: process.env.ADMIN_USERNAME || 'admin',
        email: process.env.ADMIN_EMAIL || 'admin@testerlab.com',
        password: process.env.ADMIN_PASSWORD || 'AdminPassword123!'
    };
}
function ensureDataDirExists() {
    if (!fs_1.default.existsSync(dataDir)) {
        fs_1.default.mkdirSync(dataDir, { recursive: true });
    }
}
function loadUsers() {
    // Return cached copy if available (prevents redundant disk reads & race conditions)
    if (cachedUsers !== null) {
        return cachedUsers;
    }
    ensureDataDirExists();
    let users = [];
    if (fs_1.default.existsSync(usersFilePath)) {
        try {
            const raw = fs_1.default.readFileSync(usersFilePath, 'utf-8');
            users = JSON.parse(raw);
        }
        catch {
            users = [];
        }
    }
    const { username, email, password } = getAdminConfig();
    // Ensure Admin configured in .env is always synced and present
    const adminIndex = users.findIndex((u) => u.username.toLowerCase() === username.toLowerCase() || u.role === 'admin');
    if (adminIndex === -1) {
        const adminUser = {
            id: 'usr_admin_env',
            username,
            email,
            passwordHash: bcryptjs_1.default.hashSync(password, 10),
            role: 'admin',
            status: 'approved',
            createdAt: new Date().toISOString()
        };
        users.unshift(adminUser);
        saveUsers(users);
    }
    else {
        // If admin credentials in .env are updated, keep credentials in sync
        const currentAdmin = users[adminIndex];
        const isPasswordSame = bcryptjs_1.default.compareSync(password, currentAdmin.passwordHash);
        if (currentAdmin.username !== username || !isPasswordSame) {
            users[adminIndex].username = username;
            users[adminIndex].email = email;
            users[adminIndex].passwordHash = bcryptjs_1.default.hashSync(password, 10);
            users[adminIndex].status = 'approved';
            saveUsers(users);
        }
    }
    cachedUsers = users;
    return users;
}
function saveUsers(users) {
    ensureDataDirExists();
    fs_1.default.writeFileSync(usersFilePath, JSON.stringify(users, null, 2), 'utf-8');
    // Keep in-memory cache in sync with persisted data
    cachedUsers = users;
}
function findUserByUsername(username) {
    const users = loadUsers();
    return users.find((u) => u.username.toLowerCase() === username.toLowerCase());
}
function findUserById(id) {
    const users = loadUsers();
    return users.find((u) => u.id === id);
}
function addUser(user) {
    const users = loadUsers();
    const newUser = {
        ...user,
        id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        createdAt: new Date().toISOString()
    };
    users.push(newUser);
    saveUsers(users);
    return newUser;
}
function updateUserStatus(id, status) {
    const users = loadUsers();
    const index = users.findIndex((u) => u.id === id);
    if (index === -1)
        return null;
    users[index].status = status;
    saveUsers(users);
    return users[index];
}
function deleteUser(id) {
    const users = loadUsers();
    const filtered = users.filter((u) => u.id !== id);
    if (filtered.length === users.length)
        return false;
    saveUsers(filtered);
    return true;
}
