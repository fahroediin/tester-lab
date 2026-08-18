import express, { Request, Response } from 'express';
import path from 'path';
import { TestScriptGenerator } from '../index.js';
import { DOMExtractor } from '../crawler/domExtractor.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(process.cwd(), 'public')));
app.use(express.static(path.join(process.cwd(), 'dist', 'public')));

const generator = new TestScriptGenerator();
const extractor = new DOMExtractor();

/**
 * Root Route: Serve Interactive HTML Web UI
 */
app.get('/', (req: Request, res: Response) => {
  let indexPath = path.join(process.cwd(), 'public', 'index.html');
  res.sendFile(indexPath);
});

/**
 * POST /api/v1/generate-script
 * Generate test script from JSON DSL payload
 */
app.post('/api/v1/generate-script', async (req: Request, res: Response) => {
  try {
    const { dsl, dryRun, outPath } = req.body;

    if (!dsl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: dsl'
      });
    }

    const result = await generator.generate(dsl, {
      dryRun: !!dryRun,
      outPath
    });

    if (!result.success) {
      return res.status(422).json({
        success: false,
        errors: result.warnings
      });
    }

    return res.json({
      success: true,
      code: result.code,
      resolvedSteps: result.resolvedSteps,
      warnings: result.warnings,
      logs: result.logs,
      dryRunPassed: result.dryRunPassed,
      dryRunError: result.dryRunError
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal Server Error'
    });
  }
});

/**
 * POST /api/v1/inspect-dom
 * Extract interactive candidate DOM elements from target URL
 */
app.post('/api/v1/inspect-dom', async (req: Request, res: Response) => {
  try {
    const { url, viewport } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: url'
      });
    }

    const candidates = await extractor.extractCandidates(url, { viewport });

    return res.json({
      success: true,
      url,
      candidateCount: candidates.length,
      candidates
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal Server Error'
    });
  }
});

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', message: 'Test Generator API Service active' });
});

app.listen(port, () => {
  console.log(`Test Generator REST API & Web UI running at http://localhost:${port}`);
});
