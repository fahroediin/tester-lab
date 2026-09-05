import { Router, Response } from 'express';
import { authenticateJWT, requireApprovedUser } from '../auth-middleware.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';
import { getUserFolders, getFolderById, createFolder, updateFolder, deleteFolder } from '../folder-store.js';
import { getUserHistory } from '../flow-history-store.js';
import { addLog } from '../activity-log-store.js';

export const folderRoutes = Router();

const MAX_NAME_LEN = 120;
const MAX_DESC_LEN = 500;

function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  if (!name || name.length > MAX_NAME_LEN) return null;
  return name;
}

/**
 * GET /api/v1/folders
 * List the current user's folders, each with a count of scenarios inside.
 */
folderRoutes.get('/', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const [folders, history] = await Promise.all([getUserFolders(userId), getUserHistory(userId)]);

    const counts = new Map<string, number>();
    let uncategorized = 0;
    for (const h of history) {
      if (h.folderId) counts.set(h.folderId, (counts.get(h.folderId) || 0) + 1);
      else uncategorized += 1;
    }

    const withCounts = folders.map(f => ({ ...f, scenarioCount: counts.get(f.id) || 0 }));
    res.json({ success: true, folders: withCounts, uncategorizedCount: uncategorized });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch folders' });
  }
});

/**
 * POST /api/v1/folders
 * Create a new folder for the current user.
 */
folderRoutes.post('/', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const name = cleanName(req.body?.name);
    if (!name) {
      res.status(400).json({ success: false, error: 'Folder name is required (max 120 characters)' });
      return;
    }
    const description = typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, MAX_DESC_LEN) : '';

    const folder = await createFolder(userId, name, description);
    await addLog({ userId, username: req.user!.username, action: 'Create Folder', details: `Created folder: ${name}` });
    res.json({ success: true, folder });
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message === 'DUPLICATE_FOLDER') {
      res.status(409).json({ success: false, error: 'A folder with this name already exists' });
      return;
    }
    res.status(500).json({ success: false, error: error.message || 'Failed to create folder' });
  }
});

/**
 * PATCH /api/v1/folders/:id
 * Rename or update a folder the user owns.
 */
folderRoutes.patch('/:id', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const folder = await getFolderById(req.params.id || '');
    if (!folder) {
      res.status(404).json({ success: false, error: 'Folder not found' });
      return;
    }
    if (folder.userId !== userId && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Unauthorized to modify this folder' });
      return;
    }

    const updates: { name?: string; description?: string } = {};
    if (req.body?.name !== undefined) {
      const name = cleanName(req.body.name);
      if (!name) {
        res.status(400).json({ success: false, error: 'Folder name is invalid (max 120 characters)' });
        return;
      }
      updates.name = name;
    }
    if (typeof req.body?.description === 'string') {
      updates.description = req.body.description.trim().slice(0, MAX_DESC_LEN);
    }

    const updated = await updateFolder(folder.id, updates);
    if (!updated) {
      res.status(500).json({ success: false, error: 'Failed to update folder' });
      return;
    }
    res.json({ success: true, folder: updated });
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message === 'DUPLICATE_FOLDER') {
      res.status(409).json({ success: false, error: 'A folder with this name already exists' });
      return;
    }
    res.status(500).json({ success: false, error: error.message || 'Failed to update folder' });
  }
});

/**
 * DELETE /api/v1/folders/:id
 * Delete a folder the user owns. Scenarios inside become uncategorized, not deleted.
 */
folderRoutes.delete('/:id', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const folder = await getFolderById(req.params.id || '');
    if (!folder) {
      res.status(404).json({ success: false, error: 'Folder not found' });
      return;
    }
    if (folder.userId !== userId && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Unauthorized to delete this folder' });
      return;
    }

    const deleted = await deleteFolder(folder.id);
    if (!deleted) {
      res.status(500).json({ success: false, error: 'Failed to delete folder' });
      return;
    }
    await addLog({ userId, username: req.user!.username, action: 'Delete Folder', details: `Deleted folder: ${folder.name}` });
    res.json({ success: true, message: 'Folder deleted. Scenarios inside are now uncategorized.' });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message || 'Failed to delete folder' });
  }
});
