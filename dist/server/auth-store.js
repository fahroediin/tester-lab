"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureAdminUser = ensureAdminUser;
exports.loadUsersAsync = loadUsersAsync;
exports.findUserByUsernameAsync = findUserByUsernameAsync;
exports.findUserByIdAsync = findUserByIdAsync;
exports.addUser = addUser;
exports.updateUserStatus = updateUserStatus;
exports.deleteUser = deleteUser;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const dotenv_1 = __importDefault(require("dotenv"));
const supabase_client_js_1 = require("./supabase-client.js");
dotenv_1.default.config();
function rowToUser(row) {
    return {
        id: row.id,
        username: row.username,
        email: row.email,
        passwordHash: row.password_hash,
        role: row.role,
        status: row.status,
        createdAt: row.created_at
    };
}
function getAdminConfig() {
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
async function ensureAdminUser() {
    const { username, email, password } = getAdminConfig();
    const { data: existingAdmin } = await supabase_client_js_1.supabase
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
            password_hash: bcryptjs_1.default.hashSync(password, 10),
            role: 'admin',
            status: 'approved',
            created_at: new Date().toISOString()
        };
        await supabase_client_js_1.supabase.from('users').upsert(adminUser, { onConflict: 'id' });
    }
    else {
        const isPasswordSame = bcryptjs_1.default.compareSync(password, existingAdmin.password_hash);
        if (existingAdmin.username !== username || !isPasswordSame) {
            await supabase_client_js_1.supabase
                .from('users')
                .update({
                username,
                email,
                password_hash: bcryptjs_1.default.hashSync(password, 10),
                status: 'approved'
            })
                .eq('id', existingAdmin.id);
        }
    }
}
async function loadUsersAsync() {
    const { data, error } = await supabase_client_js_1.supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: true });
    if (error) {
        console.error('Failed to load users from Supabase:', error);
        return [];
    }
    return (data || []).map(rowToUser);
}
async function findUserByUsernameAsync(username) {
    const { data, error } = await supabase_client_js_1.supabase
        .from('users')
        .select('*')
        .ilike('username', username)
        .limit(1)
        .single();
    if (error || !data)
        return undefined;
    return rowToUser(data);
}
async function findUserByIdAsync(id) {
    const { data, error } = await supabase_client_js_1.supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .limit(1)
        .single();
    if (error || !data)
        return undefined;
    return rowToUser(data);
}
async function addUser(user) {
    const newRow = {
        id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        username: user.username,
        email: user.email,
        password_hash: user.passwordHash,
        role: user.role,
        status: user.status,
        created_at: new Date().toISOString()
    };
    const { data, error } = await supabase_client_js_1.supabase
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
async function updateUserStatus(id, status) {
    const { data, error } = await supabase_client_js_1.supabase
        .from('users')
        .update({ status })
        .eq('id', id)
        .select()
        .single();
    if (error || !data)
        return null;
    return rowToUser(data);
}
async function deleteUser(id) {
    const { error } = await supabase_client_js_1.supabase
        .from('users')
        .delete()
        .eq('id', id);
    if (error)
        return false;
    return true;
}
