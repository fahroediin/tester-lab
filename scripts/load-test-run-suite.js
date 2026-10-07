/*
 * Load test — Run Suite concurrency (Skema B)
 * ===========================================
 * Mensimulasikan N user menjalankan "Run Suite" BERSAMAAN ke server nyata, lalu
 * mengukur apakah queue benar-benar membatasi konkurensi (MAX_CONCURRENT_TESTS),
 * antre FIFO, dan menolak kelebihan beban dengan HTTP 503 (MAX_QUEUE_LENGTH).
 *
 * Ini menembak server SUNGGUHAN — tiap run menjalankan Chromium di server itu.
 * Jalankan terhadap server uji/staging, JANGAN produksi saat jam sibuk.
 *
 * Butuh: Node 18+ (pakai fetch & ReadableStream bawaan). Tanpa dependensi.
 *
 * Cara pakai:
 *   BASE_URL=http://localhost:3000 \
 *   API_KEY=tl_live_xxxxx \
 *   USERS=10 \
 *   node scripts/load-test-run-suite.js [SUITE_ID]
 *
 * Jika SUITE_ID tidak diberikan, skrip memakai SUITE_ID dari env, atau mencoba
 * menemukan satu suite yang punya scenario lewat API (project pertama).
 *
 * Env (semua opsional kecuali API_KEY):
 *   BASE_URL   default http://localhost:3000
 *   API_KEY    WAJIB — API key (tl_live_...) milik user pemilik suite
 *   USERS      jumlah Run Suite paralel (default 10) — mensimulasikan N user
 *   SUITE_ID   suite yang dijalankan (atau argumen pertama CLI)
 *   PROJECT_ID batasi auto-discovery ke project ini (opsional)
 *   TIMEOUT_MS batas waktu per run sebelum dianggap gagal (default 600000)
 *
 * NOTE: untuk benar-benar menguji FIFO/konkurensi, SEMUA run menembak suite yang
 * sama milik satu user. Server membatasi per-queue global, bukan per-user, jadi
 * satu API key sudah cukup untuk mensimulasikan tekanan N user.
 */
'use strict';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const API_KEY = process.env.API_KEY || '';
const USERS = Math.max(1, parseInt(process.env.USERS || '10', 10));
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '600000', 10);
let SUITE_ID = process.argv[2] || process.env.SUITE_ID || '';
const PROJECT_ID = process.env.PROJECT_ID || '';

function authHeaders(extra) {
  return Object.assign({ 'X-API-Key': API_KEY }, extra || {});
}

function nowMs() { return Date.now(); }
function fmt(ms) { return (ms / 1000).toFixed(1) + 's'; }

/** Find a suite that has at least one runnable scenario, via the public API. */
async function discoverSuite() {
  const projRes = await fetch(`${BASE_URL}/api/v1/projects`, { headers: authHeaders() });
  if (!projRes.ok) throw new Error(`GET /projects gagal (HTTP ${projRes.status}). Cek API_KEY.`);
  const projData = await projRes.json();
  const projects = (projData.projects || []).filter(p => !PROJECT_ID || p.id === PROJECT_ID);
  if (projects.length === 0) throw new Error('Tidak ada project. Buat satu dulu, atau set SUITE_ID.');

  for (const p of projects) {
    const sRes = await fetch(`${BASE_URL}/api/v1/suites?projectId=${encodeURIComponent(p.id)}`, { headers: authHeaders() });
    if (!sRes.ok) continue;
    const sData = await sRes.json();
    for (const s of (sData.suites || [])) {
      if ((s.scenarioCount || 0) > 0) {
        console.log(`  → auto-pakai suite "${s.name}" (${s.id}) di project "${p.name}" — ${s.scenarioCount} scenario`);
        return s.id;
      }
    }
  }
  throw new Error('Tak ada suite berisi scenario. Buat scenario dulu, atau set SUITE_ID.');
}

/**
 * Jalankan satu Run Suite, baca stream NDJSON, kembalikan ringkasan waktunya.
 * Menandai kapan mulai mengantre (queued), kapan scenario pertama jalan (start),
 * dan kapan selesai (done) — itu yang mengungkap perilaku queue.
 */
async function runOne(userLabel, t0) {
  const sent = nowMs();
  let res;
  try {
    res = await fetch(`${BASE_URL}/api/v1/suites/${encodeURIComponent(SUITE_ID)}/run`, {
      method: 'POST',
      headers: authHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (e) {
    return { userLabel, outcome: 'network_error', error: String(e && e.message || e), sentAt: sent - t0 };
  }

  // 503 = queue penuh (ditolak backpressure). JSON, bukan stream.
  if (res.status === 503) {
    return { userLabel, outcome: 'rejected_503', sentAt: sent - t0, httpStatus: 503 };
  }
  const ctype = res.headers.get('content-type') || '';
  if (!res.ok || ctype.indexOf('application/x-ndjson') === -1) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    return { userLabel, outcome: 'error', error: msg, sentAt: sent - t0, httpStatus: res.status };
  }

  // Baca stream baris demi baris.
  let queuedAt = null, startedAt = null, doneAt = null, jobStatus = null, scenarioCount = 0;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let ev; try { ev = JSON.parse(line); } catch { continue; }
      if (ev.type === 'queued' && queuedAt === null) queuedAt = nowMs() - t0;
      else if (ev.type === 'start' && startedAt === null) { startedAt = nowMs() - t0; scenarioCount = ev.total || 0; }
      else if (ev.type === 'scenario_start' && startedAt === null) startedAt = nowMs() - t0;
      else if (ev.type === 'done') { doneAt = nowMs() - t0; jobStatus = ev.jobStatus; }
      else if (ev.type === 'error') { return { userLabel, outcome: 'stream_error', error: ev.error, sentAt: sent - t0, queuedAt, startedAt }; }
    }
  }
  return {
    userLabel, outcome: 'completed', httpStatus: 200,
    sentAt: sent - t0, queuedAt, startedAt, doneAt, jobStatus, scenarioCount,
    waitMs: (startedAt != null ? startedAt - (queuedAt != null ? queuedAt : startedAt) : null),
    runMs: (doneAt != null && startedAt != null ? doneAt - startedAt : null)
  };
}

async function main() {
  if (!API_KEY) {
    console.error('ERROR: set env API_KEY=tl_live_... (API key milik pemilik suite).');
    process.exit(2);
  }
  console.log(`\nLoad test Run Suite — Skema B`);
  console.log(`  server : ${BASE_URL}`);
  console.log(`  users  : ${USERS} (Run Suite paralel)`);
  if (!SUITE_ID) { console.log('  suite  : (auto-discovery...)'); SUITE_ID = await discoverSuite(); }
  else console.log(`  suite  : ${SUITE_ID}`);
  console.log('');

  const t0 = nowMs();
  // Tembak semua BERSAMAAN — ini inti ujinya.
  const jobs = [];
  for (let i = 1; i <= USERS; i++) jobs.push(runOne('user-' + i, t0));
  const results = await Promise.all(jobs);
  const totalMs = nowMs() - t0;

  // --- Ringkasan ---
  const completed = results.filter(r => r.outcome === 'completed');
  const rejected = results.filter(r => r.outcome === 'rejected_503');
  const errored = results.filter(r => !['completed', 'rejected_503'].includes(r.outcome));

  console.log('Hasil per user (urut waktu mulai jalan):');
  completed
    .slice()
    .sort((a, b) => (a.startedAt ?? 1e15) - (b.startedAt ?? 1e15))
    .forEach(r => {
      const waited = r.queuedAt != null && r.startedAt != null ? ` | nunggu antre ${fmt(r.startedAt - r.queuedAt)}` : '';
      console.log(`  ${r.userLabel.padEnd(8)} mulai@${fmt(r.startedAt)} selesai@${fmt(r.doneAt)} (${r.jobStatus}, ${r.scenarioCount} scn)${waited}`);
    });
  rejected.forEach(r => console.log(`  ${r.userLabel.padEnd(8)} DITOLAK 503 (antrean penuh) @${fmt(r.sentAt)}`));
  errored.forEach(r => console.log(`  ${r.userLabel.padEnd(8)} ERROR: ${r.outcome} — ${r.error || ''}`));

  // --- Estimasi konkurensi nyata dari overlap interval [startedAt, doneAt] ---
  const intervals = completed
    .filter(r => r.startedAt != null && r.doneAt != null)
    .map(r => [r.startedAt, r.doneAt]);
  let peak = 0;
  const points = [];
  intervals.forEach(([s, e]) => { points.push([s, 1]); points.push([e, -1]); });
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0;
  for (const [, d] of points) { cur += d; peak = Math.max(peak, cur); }

  console.log('\nRingkasan:');
  console.log(`  total waktu wall-clock : ${fmt(totalMs)}`);
  console.log(`  selesai                : ${completed.length}/${USERS}`);
  console.log(`  ditolak 503            : ${rejected.length}`);
  console.log(`  error lain             : ${errored.length}`);
  console.log(`  PUNCAK run serentak    : ${peak}  ← bandingkan dengan MAX_CONCURRENT_TESTS di server`);
  const anyQueued = completed.some(r => r.queuedAt != null && r.startedAt != null && r.startedAt - r.queuedAt > 50);
  console.log(`  ada yang mengantre?    : ${anyQueued ? 'YA (queue bekerja)' : 'tidak (semua langsung jalan / server longgar)'}`);

  console.log('\nInterpretasi:');
  console.log(`  • Jika PUNCAK ≈ MAX_CONCURRENT_TESTS dan sebagian user "nunggu antre" > 0s,`);
  console.log(`    berarti Skema B bekerja: Run Suite dibatasi & FIFO, bukan N browser sekaligus.`);
  console.log(`  • Jika ada 503, set MAX_QUEUE_LENGTH lebih besar (atau memang sengaja membatasi beban).`);
  console.log('');
}

main().catch(e => { console.error('\nGagal menjalankan load test:', e.message); process.exit(1); });
