import { Router, Response } from 'express';
import { authenticateJWT, requireApprovedUser } from '../auth-middleware.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';
import { getUserProjects, getProjectById, createProject, updateProject, deleteProject } from '../folder-store.js';
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
 * GET /api/v1/folders or /api/v1/projects
 * List the current user's projects, each with a count of scenarios inside.
 */
folderRoutes.get('/', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const [projects, history] = await Promise.all([getUserProjects(userId), getUserHistory(userId)]);

    const counts = new Map<string, number>();
    let uncategorized = 0;
    for (const h of history) {
      if (h.folderId) counts.set(h.folderId, (counts.get(h.folderId) || 0) + 1);
      else uncategorized += 1;
    }

    const withCounts = projects.map(p => ({ ...p, scenarioCount: counts.get(p.id) || 0 }));
    res.json({
      success: true,
      projects: withCounts,
      folders: withCounts, // Backward compatibility
      uncategorizedCount: uncategorized
    });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch projects' });
  }
});

/**
 * POST /api/v1/folders or /api/v1/projects
 * Create a new project for the current user.
 */
folderRoutes.post('/', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const name = cleanName(req.body?.name);
    if (!name) {
      res.status(400).json({ success: false, error: 'Project name is required (max 120 characters)' });
      return;
    }
    const description = typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, MAX_DESC_LEN) : '';

    const project = await createProject(userId, name, description);
    await addLog({ userId, username: req.user!.username, action: 'Create Project', details: `Created project: ${name}` });
    res.json({ success: true, project, folder: project });
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message === 'DUPLICATE_PROJECT' || error.message === 'DUPLICATE_FOLDER') {
      res.status(409).json({ success: false, error: 'A project with this name already exists' });
      return;
    }
    res.status(500).json({ success: false, error: error.message || 'Failed to create project' });
  }
});

/**
 * PATCH /api/v1/folders/:id or /api/v1/projects/:id
 * Rename or update a project the user owns.
 */
folderRoutes.patch('/:id', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const project = await getProjectById(req.params.id || '');
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }
    if (project.userId !== userId && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Unauthorized to modify this project' });
      return;
    }

    const updates: { name?: string; description?: string } = {};
    if (req.body?.name !== undefined) {
      const name = cleanName(req.body.name);
      if (!name) {
        res.status(400).json({ success: false, error: 'Project name is invalid (max 120 characters)' });
        return;
      }
      updates.name = name;
    }
    if (typeof req.body?.description === 'string') {
      updates.description = req.body.description.trim().slice(0, MAX_DESC_LEN);
    }

    const updated = await updateProject(project.id, updates);
    if (!updated) {
      res.status(500).json({ success: false, error: 'Failed to update project' });
      return;
    }
    res.json({ success: true, project: updated, folder: updated });
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message === 'DUPLICATE_PROJECT' || error.message === 'DUPLICATE_FOLDER') {
      res.status(409).json({ success: false, error: 'A project with this name already exists' });
      return;
    }
    res.status(500).json({ success: false, error: error.message || 'Failed to update project' });
  }
});

/**
 * DELETE /api/v1/folders/:id or /api/v1/projects/:id
 * Delete a project the user owns. Scenarios inside become uncategorized, not deleted.
 */
folderRoutes.delete('/:id', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const project = await getProjectById(req.params.id || '');
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }
    if (project.userId !== userId && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Unauthorized to delete this project' });
      return;
    }

    const deleted = await deleteProject(project.id);
    if (!deleted) {
      res.status(500).json({ success: false, error: 'Failed to delete project' });
      return;
    }
    await addLog({ userId, username: req.user!.username, action: 'Delete Project', details: `Deleted project: ${project.name}` });
    res.json({ success: true, message: 'Project deleted. Scenarios inside are now uncategorized.' });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message || 'Failed to delete project' });
  }
});
