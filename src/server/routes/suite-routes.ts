import { Router, Response } from 'express';
import { authenticateJWT, requireApprovedUser } from '../auth-middleware.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';
import { getSuitesByProjectId, getSuiteById, createSuite, updateSuite, deleteSuite } from '../suite-store.js';
import { getProjectById } from '../folder-store.js';
import { getScenarioCountsBySuite, getRunnableScenariosBySuite } from '../flow-history-store.js';
import { dedupeLatestByName } from '../services/run-suite-service.js';
import { runSuiteForSuite } from '../services/run-suite-service.js';
import { addLog } from '../activity-log-store.js';

export const suiteRoutes = Router();

const MAX_NAME_LEN = 120;
const MAX_DESC_LEN = 500;

function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  if (!name || name.length > MAX_NAME_LEN) return null;
  return name;
}

/**
 * GET /api/v1/suites
 * Query: ?projectId=<id>
 * List suites in the given project (or all user suites if no projectId specified),
 * each with scenario count.
 */
suiteRoutes.get('/', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId.trim() : '';

    if (!projectId) {
      res.status(400).json({ success: false, error: 'projectId is required' });
      return;
    }

    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }
    if (project.userId !== userId && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Unauthorized to view this project' });
      return;
    }

    const [suites, { counts, uncategorized }] = await Promise.all([
      getSuitesByProjectId(projectId),
      getScenarioCountsBySuite(userId, projectId)
    ]);

    const withCounts = suites.map(s => ({ ...s, scenarioCount: counts[s.id] || 0 }));
    res.json({ success: true, suites: withCounts, uncategorizedCount: uncategorized });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch suites' });
  }
});

/**
 * POST /api/v1/suites/:suiteId/run
 * Run Suite (POC): execute every scenario in the suite sequentially in one
 * batch (Model B), and return the aggregate job status plus per-scenario
 * results. AC-15.01/02/03/05/06/07/08/09/10/11/12-14.
 *
 * Empty suite (no runnable scenario) is rejected without starting a run
 * (AC-15.08). Cancel and real-time status are out of POC scope.
 */
suiteRoutes.post('/:suiteId/run', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const suiteId = typeof req.params.suiteId === 'string' ? req.params.suiteId.trim() : '';
    if (!suiteId) {
      res.status(400).json({ success: false, error: 'suiteId is required' });
      return;
    }

    const suite = await getSuiteById(suiteId);
    if (!suite) {
      res.status(404).json({ success: false, error: 'Suite not found' });
      return;
    }
    const project = await getProjectById(suite.projectId);
    if (!project || (project.userId !== userId && req.user!.role !== 'admin')) {
      res.status(403).json({ success: false, error: 'Unauthorized to run this suite' });
      return;
    }

    // AC-15.08: a suite with no scenario is rejected; no job is created.
    const scenarios = dedupeLatestByName(await getRunnableScenariosBySuite(userId, suiteId));
    if (scenarios.length === 0) {
      res.status(400).json({ success: false, error: 'Suite has no scenario to run.' });
      return;
    }

    const result = await runSuiteForSuite(userId, suiteId);
    await addLog({ userId, username: req.user!.username, action: 'run_suite', details: `suite=${suiteId} status=${result.jobStatus}` });
    res.json({ success: true, ...result });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message || 'Failed to run suite' });
  }
});

/**
 * POST /api/v1/suites
 * Create a new suite inside a project.
 */
suiteRoutes.post('/', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId.trim() : '';
    if (!projectId) {
      res.status(400).json({ success: false, error: 'projectId is required' });
      return;
    }

    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }
    if (project.userId !== userId && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Unauthorized to modify this project' });
      return;
    }

    const name = cleanName(req.body?.name);
    if (!name) {
      res.status(400).json({ success: false, error: 'Suite name is required (max 120 characters)' });
      return;
    }
    const description = typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, MAX_DESC_LEN) : '';

    const suite = await createSuite(projectId, name, description);
    await addLog({
      userId,
      username: req.user!.username,
      action: 'Create Suite',
      details: `Created suite: ${name} in project ${project.name}`
    });
    res.json({ success: true, suite });
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message === 'DUPLICATE_SUITE') {
      res.status(409).json({ success: false, error: 'A suite with this name already exists in this project' });
      return;
    }
    res.status(500).json({ success: false, error: error.message || 'Failed to create suite' });
  }
});

/**
 * PATCH /api/v1/suites/:id
 * Rename or update description of a suite.
 */
suiteRoutes.patch('/:id', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const suite = await getSuiteById(req.params.id || '');
    if (!suite) {
      res.status(404).json({ success: false, error: 'Suite not found' });
      return;
    }

    const project = await getProjectById(suite.projectId);
    if (!project || (project.userId !== userId && req.user!.role !== 'admin')) {
      res.status(403).json({ success: false, error: 'Unauthorized to modify this suite' });
      return;
    }

    const updates: { name?: string; description?: string } = {};
    if (req.body?.name !== undefined) {
      const name = cleanName(req.body.name);
      if (!name) {
        res.status(400).json({ success: false, error: 'Suite name is invalid (max 120 characters)' });
        return;
      }
      updates.name = name;
    }
    if (typeof req.body?.description === 'string') {
      updates.description = req.body.description.trim().slice(0, MAX_DESC_LEN);
    }

    const updated = await updateSuite(suite.id, updates);
    if (!updated) {
      res.status(500).json({ success: false, error: 'Failed to update suite' });
      return;
    }
    res.json({ success: true, suite: updated });
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message === 'DUPLICATE_SUITE') {
      res.status(409).json({ success: false, error: 'A suite with this name already exists in this project' });
      return;
    }
    res.status(500).json({ success: false, error: error.message || 'Failed to update suite' });
  }
});

/**
 * DELETE /api/v1/suites/:id
 * Delete a suite. Scenarios inside remain in project with suite_id = NULL.
 */
suiteRoutes.delete('/:id', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const suite = await getSuiteById(req.params.id || '');
    if (!suite) {
      res.status(404).json({ success: false, error: 'Suite not found' });
      return;
    }

    const project = await getProjectById(suite.projectId);
    if (!project || (project.userId !== userId && req.user!.role !== 'admin')) {
      res.status(403).json({ success: false, error: 'Unauthorized to delete this suite' });
      return;
    }

    const deleted = await deleteSuite(suite.id);
    if (!deleted) {
      res.status(500).json({ success: false, error: 'Failed to delete suite' });
      return;
    }
    await addLog({
      userId,
      username: req.user!.username,
      action: 'Delete Suite',
      details: `Deleted suite: ${suite.name} from project ${project.name}`
    });
    res.json({ success: true, message: 'Suite deleted. Scenarios inside are now uncategorized in this project.' });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message || 'Failed to delete suite' });
  }
});
