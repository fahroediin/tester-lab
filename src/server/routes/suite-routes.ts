import { Router, Response } from 'express';
import { authenticateJWT, requireApprovedUser } from '../auth-middleware.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';
import { getSuitesByProjectId, getSuiteById, createSuite, updateSuite, deleteSuite, setScenarioOrder } from '../suite-store.js';
import { getProjectById } from '../folder-store.js';
import { getScenarioCountsBySuite, getRunnableScenariosBySuite } from '../flow-history-store.js';
import { dedupeLatestByName } from '../services/run-suite-service.js';
import { runSuiteForSuite } from '../services/run-suite-service.js';
import { addLog } from '../activity-log-store.js';
import { addSuiteRun, getSuiteRunById, getSuiteRunsBySuite } from '../suite-run-store.js';
import { buildSuiteReport } from '../services/suite-report-service.js';
import { exportSuiteReport } from '../services/suite-report-export.js';

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
 * PUT /api/v1/suites/:suiteId/scenario-order
 * Save the ordered scenario names for a suite (US-15 re-order).
 */
suiteRoutes.put('/:suiteId/scenario-order', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const suiteId = typeof req.params.suiteId === 'string' ? req.params.suiteId.trim() : '';
    const order = Array.isArray(req.body?.order) ? req.body.order : null;
    if (!suiteId || !order) {
      res.status(400).json({ success: false, error: 'suiteId and order[] are required' });
      return;
    }

    const suite = await getSuiteById(suiteId);
    if (!suite) {
      res.status(404).json({ success: false, error: 'Suite not found' });
      return;
    }
    const project = await getProjectById(suite.projectId);
    if (!project || (project.userId !== userId && req.user!.role !== 'admin')) {
      res.status(403).json({ success: false, error: 'Unauthorized to reorder this suite' });
      return;
    }

    const okSaved = await setScenarioOrder(suiteId, order);
    if (!okSaved) {
      res.status(500).json({ success: false, error: 'Failed to save scenario order' });
      return;
    }
    res.json({ success: true });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message || 'Failed to save scenario order' });
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

    // Stream progress as newline-delimited JSON (US-16): one JSON object per
    // line, flushed as the run advances so the client sees which scenario is
    // running instead of a frozen "Running..." for large suites. The final
    // "done" line carries the same payload the non-streaming response used, so
    // history persistence and the summary modal are unchanged.
    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering so lines arrive live

    const write = (obj: unknown) => res.write(JSON.stringify(obj) + '\n');

    const result = await runSuiteForSuite(userId, suiteId, (ev) => write(ev));

    // Persist the run so its suite-level report can be rebuilt later. A failure
    // to save must not fail the run the user just watched succeed, so the id is
    // best-effort; the summary payload still carries the full result.
    let suiteRunId: string | undefined;
    try {
      const saved = await addSuiteRun({
        userId,
        suiteId,
        suiteName: suite.name,
        targetUrl: '',
        jobStatus: result.jobStatus,
        results: result.results
      });
      suiteRunId = saved.id;
    } catch (persistErr: unknown) {
      console.error('Failed to persist suite run:', persistErr instanceof Error ? persistErr.message : persistErr);
    }

    write({ type: 'done', success: true, suiteRunId, ...result });
    res.end();

    await addLog({ userId, username: req.user!.username, action: 'run_suite', details: `suite=${suiteId} status=${result.jobStatus}` });
  } catch (err: unknown) {
    const error = err as Error;
    // If the stream is already open, headers are sent — report the error inside
    // the stream and close it; otherwise fall back to a normal JSON error.
    if (res.headersSent) {
      try { res.write(JSON.stringify({ type: 'error', success: false, error: error.message || 'Failed to run suite' }) + '\n'); } catch { /* ignore */ }
      res.end();
    } else {
      res.status(500).json({ success: false, error: error.message || 'Failed to run suite' });
    }
  }
});

/** Reject a suite the caller does not own; returns the suite or null after replying. */
async function requireOwnedSuite(req: AuthenticatedRequest, res: Response, suiteId: string) {
  const suite = await getSuiteById(suiteId);
  if (!suite) {
    res.status(404).json({ success: false, error: 'Suite not found' });
    return null;
  }
  const project = await getProjectById(suite.projectId);
  if (!project || (project.userId !== req.user!.id && req.user!.role !== 'admin')) {
    res.status(403).json({ success: false, error: 'Unauthorized to view this suite' });
    return null;
  }
  return suite;
}

/**
 * GET /api/v1/suites/:suiteId/runs
 * List persisted Run Suite results for a suite, newest first.
 */
suiteRoutes.get('/:suiteId/runs', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const suiteId = typeof req.params.suiteId === 'string' ? req.params.suiteId.trim() : '';
    if (!suiteId || !(await requireOwnedSuite(req, res, suiteId))) return;
    const runs = await getSuiteRunsBySuite(suiteId);
    res.json({
      success: true,
      runs: runs.map((r) => ({ id: r.id, jobStatus: r.jobStatus, createdAt: r.createdAt, count: r.results.length }))
    });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message || 'Failed to list suite runs' });
  }
});

/**
 * GET /api/v1/suites/:suiteId/report(.html|.pdf)?
 * Suite-level report for a suite's latest Run Suite, or for ?runId=<id>.
 * No extension returns JSON; .html and .pdf return the rendered document.
 */
suiteRoutes.get('/:suiteId/report:format(\\.html|\\.pdf)?', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const suiteId = typeof req.params.suiteId === 'string' ? req.params.suiteId.trim() : '';
    if (!suiteId) {
      res.status(400).json({ success: false, error: 'suiteId is required' });
      return;
    }
    const suite = await requireOwnedSuite(req, res, suiteId);
    if (!suite) return;

    const runId = typeof req.query.runId === 'string' ? req.query.runId.trim() : '';
    const run = runId
      ? await getSuiteRunById(runId)
      : (await getSuiteRunsBySuite(suiteId))[0];

    if (!run || run.suiteId !== suiteId) {
      res.status(404).json({ success: false, error: 'No run found for this suite. Run the suite first.' });
      return;
    }

    const report = buildSuiteReport(
      { runBatchId: run.id, jobStatus: run.jobStatus, results: run.results },
      { suiteName: run.suiteName || suite.name, targetUrl: run.targetUrl, generatedAt: run.createdAt }
    );

    const format = (req.params.format || '').replace('.', '');
    if (format === 'html' || format === 'pdf') {
      const out = await exportSuiteReport(report, format);
      res.setHeader('Content-Type', out.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
      res.send(out.buffer);
      return;
    }
    res.json({ success: true, report });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message || 'Failed to build suite report' });
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
