/*
 * tester-lab - Suite report export (POC).
 * HTML export is the rendered document. PDF is the same HTML printed by
 * Chromium, so the two never drift. Screenshots are embedded as data URIs;
 * a size guard drops passing-scenario evidence before failing evidence.
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { chromium } from 'playwright';
import { globalTestGeneratorQueue } from '../queue-manager.js';
import { renderSuiteReportHtml, type SuiteReport, type EmbeddedImages } from './suite-report-service.js';

export type ExportFormat = 'html' | 'pdf';

export interface ExportResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
  droppedPassingEvidence: boolean;
}

const MAX_EXPORT_BYTES = (() => {
  const configured = parseInt(process.env.EXPORT_MAX_BYTES || '', 10);
  return Number.isFinite(configured) && configured > 0 ? configured : 25 * 1024 * 1024;
})();

const FETCH_TIMEOUT_MS = 15000;

interface ShotRef {
  url: string;
  failing: boolean;
}

function collectShots(report: SuiteReport): ShotRef[] {
  const shots = new Map<string, boolean>();
  for (const scenario of report.scenarios) {
    const failing = scenario.status === 'FAILED';
    if (scenario.screenshotUrl) {
      shots.set(scenario.screenshotUrl, (shots.get(scenario.screenshotUrl) || false) || failing);
    }
    for (const shot of scenario.stepShots || []) {
      shots.set(shot.url, (shots.get(shot.url) || false) || failing);
    }
  }
  return [...shots.entries()].map(([url, failing]) => ({ url, failing }));
}

async function downloadShot(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    return `data:image/png;base64,${bytes.toString('base64')}`;
  } catch {
    // A screenshot that will not download costs the report that one picture and
    // nothing else; the renderer already shows a placeholder for a missing shot.
    return null;
  }
}

/**
 * Embed as many screenshots as the size ceiling allows. Failing-scenario
 * evidence is embedded first so a report forced to shed weight still shows what
 * broke; passing evidence fills the remaining budget.
 */
async function embedImages(report: SuiteReport): Promise<{ images: EmbeddedImages; dropped: boolean }> {
  const shots = collectShots(report);
  shots.sort((a, b) => Number(b.failing) - Number(a.failing));

  const images: EmbeddedImages = new Map();
  let used = 0;
  let dropped = false;

  for (const shot of shots) {
    const dataUri = await downloadShot(shot.url);
    if (!dataUri) continue;
    if (!shot.failing && used + dataUri.length > MAX_EXPORT_BYTES) {
      dropped = true;
      continue;
    }
    images.set(shot.url, dataUri);
    used += dataUri.length;
  }
  return { images, dropped };
}

function safeName(suiteName: string): string {
  const base = suiteName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'suite';
  return base;
}

export async function exportSuiteReport(report: SuiteReport, format: ExportFormat): Promise<ExportResult> {
  return globalTestGeneratorQueue.enqueue(async () => {
    const { images, dropped } = await embedImages(report);
    const html = renderSuiteReportHtml(report, images);
    const name = safeName(report.suiteName);

    if (format === 'html') {
      return {
        buffer: Buffer.from(html, 'utf-8'),
        contentType: 'text/html; charset=utf-8',
        filename: `${name}_report.html`,
        droppedPassingEvidence: dropped
      };
    }

    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const buffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '16mm', bottom: '16mm', left: '12mm', right: '12mm' }
      });
      return {
        buffer,
        contentType: 'application/pdf',
        filename: `${name}_report.pdf`,
        droppedPassingEvidence: dropped
      };
    } finally {
      if (browser) await browser.close();
    }
  });
}
