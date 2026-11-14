/**
 * Token Usage Sidecar Backend.
 *
 * Read-only local telemetry aggregator for Antigravity:
 * - Parses <appData>/brain/<convId>/.system_generated/logs/transcript.jsonl
 * - Reads conversation titles and parent links from conversation_summaries.db
 * - Caches parsed transcripts by (mtime, size) for instant polling responses
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SidecarApp, Response } from 'sidecar_sdk';

let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  // Older Node without built-in node:sqlite degrades gracefully to ID fallback.
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f-]{12,}$/i;
// Idle gaps longer than 10 minutes inside one turn usually indicate waiting for
// user confirmation, sleep, or stalled error recovery rather than active work.
const MAX_ACTIVE_GAP_MS = 10 * 60 * 1000;

const STATIC_ASSETS = {
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'application/javascript; charset=utf-8'],
};

const transcriptCache = new Map(); // path -> { key, parsed }
const dbMetaCache = new Map();     // appData -> { key, map }

function safeReaddir(dirPath) {
  try {
    return readdirSync(dirPath);
  } catch {
    return [];
  }
}

function statOf(filePath) {
  try {
    const s = statSync(filePath);
    return { mtimeMs: Math.trunc(s.mtimeMs), size: s.size };
  } catch {
    return { mtimeMs: 0, size: -1 };
  }
}

/**
 * Resolves Antigravity's active app data directories.
 * Mirrors swarm_board's discovery so both hosted and standalone modes work.
 */
function findAppDataDirs() {
  const execDataDir = process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR;
  if (execDataDir) {
    for (let d = execDataDir; d !== dirname(d); d = dirname(d)) {
      if (basename(d) !== 'sidecar_data') continue;
      const appData = dirname(d);
      return existsSync(join(appData, 'brain')) ? [appData] : [];
    }
    return [];
  }
  const root = join(homedir(), '.gemini');
  return safeReaddir(root)
    .sort()
    .map((name) => join(root, name))
    .filter((dir) => existsSync(join(dir, 'brain')));
}

function toLocalDateKey(ms) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateKey, deltaDays) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return toLocalDateKey(dt.getTime());
}

function emptyBucket() {
  return { input: 0, cacheRead: 0, output: 0, total: 0, net: 0, steps: 0, turns: 0, activeMs: 0 };
}

function addToBucket(bucket, input, cacheRead, output, hasTokens) {
  if (!hasTokens) return;
  bucket.input += input;
  bucket.cacheRead += cacheRead;
  bucket.output += output;
  bucket.net += input + output;
  bucket.total += input + cacheRead + output;
  bucket.steps += 1;
}

/**
 * Loads conversation titles and subagent nesting metadata from SQLite read-only.
 */
function loadConversationMeta(appData) {
  if (!DatabaseSync) return new Map();
  const dbPath = join(appData, 'conversation_summaries.db');
  const dbStat = statOf(dbPath);
  if (dbStat.size < 0) return new Map();
  const walStat = statOf(`${dbPath}-wal`);
  const key = `${dbStat.mtimeMs}:${dbStat.size}|${walStat.mtimeMs}:${walStat.size}`;
  const cached = dbMetaCache.get(appData);
  if (cached && cached.key === key) return cached.map;

  const map = new Map();
  let db = null;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true, timeout: 500 });
    const rows = db
      .prepare('SELECT conversation_id, title, parent_conversation_id, nesting_depth FROM conversation_summaries')
      .all();
    for (const row of rows) {
      map.set(row.conversation_id, {
        title: (row.title || '').trim(),
        parentId: (row.parent_conversation_id || '').trim(),
        nestingDepth: Number(row.nesting_depth) || 0,
      });
    }
    dbMetaCache.set(appData, { key, map });
  } catch {
    // Keep prior cache if DB is briefly locked during a checkpoint.
    return cached ? cached.map : map;
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
  return map;
}

/**
 * Minimal protobuf wire-format reader: returns [fieldNo, wireType, value] tuples.
 * Varints are returned as Numbers, length-delimited fields as Uint8Array slices.
 */
function readVarint(buf, pos) {
  let val = 0;
  let mul = 1;
  while (pos < buf.length) {
    const b = buf[pos++];
    val += (b & 0x7f) * mul;
    if (!(b & 0x80)) return [val, pos];
    mul *= 128;
  }
  throw new Error('truncated varint');
}

function pbFields(buf) {
  const out = [];
  let pos = 0;
  while (pos < buf.length) {
    let tag;
    [tag, pos] = readVarint(buf, pos);
    const fn = Math.floor(tag / 8);
    const wt = tag & 7;
    if (wt === 0) {
      let v;
      [v, pos] = readVarint(buf, pos);
      out.push([fn, wt, v]);
    } else if (wt === 2) {
      let len;
      [len, pos] = readVarint(buf, pos);
      if (pos + len > buf.length) throw new Error('truncated field');
      out.push([fn, wt, buf.subarray(pos, pos + len)]);
      pos += len;
    } else if (wt === 1) {
      pos += 8;
    } else if (wt === 5) {
      pos += 4;
    } else {
      throw new Error(`unsupported wire type ${wt}`);
    }
  }
  return out;
}

function pbGet(fields, fn, wt) {
  for (const f of fields) if (f[0] === fn && f[1] === wt) return f[2];
  return undefined;
}

const utf8 = new TextDecoder();
const isDisplayName = (s) => /\(.+\)$/.test(s);

/**
 * Reads per-step model usage from <appData>/conversations/<convId>.db (read-only).
 * steps.metadata (step_type 15 = model response): field 1 = timestamp,
 * field 9 = usage { 1: modelId, 2: input, 3: output, 5: cacheRead }.
 * gen_metadata maps modelId -> display name ("Gemini 4 Hydrogen (High)") or slug.
 */
const convDbCache = new Map(); // path -> { key, parsed }

function openConvDb(dbPath, hasWal) {
  try {
    return new DatabaseSync(dbPath, { readOnly: true, timeout: 500 });
  } catch (err) {
    // A closed WAL database without -wal/-shm may refuse plain read-only opens;
    // immutable is safe only when no writer is active.
    if (hasWal) throw err;
    const url = pathToFileURL(dbPath);
    url.searchParams.set('immutable', '1');
    return new DatabaseSync(url, { readOnly: true });
  }
}

function parseConvModels(dbPath) {
  if (!DatabaseSync) return null;
  const st = statOf(dbPath);
  if (st.size < 0) return null;
  const wal = statOf(`${dbPath}-wal`);
  const key = `${st.mtimeMs}:${st.size}|${wal.mtimeMs}:${wal.size}`;
  const cached = convDbCache.get(dbPath);
  if (cached && cached.key === key) return cached.parsed;

  const names = new Map();  // modelId -> name
  const daily = new Map();  // dateKey -> Map(modelId -> bucket)
  let db = null;
  try {
    db = openConvDb(dbPath, wal.size >= 0);
    for (const row of db.prepare('SELECT data FROM gen_metadata').iterate()) {
      try {
        const top = pbFields(row.data);
        const a = pbGet(top, 1, 2);
        if (a) {
          const f = pbFields(a);
          const id = pbGet(f, 3, 0);
          const disp = pbGet(f, 21, 2);
          const slug = pbGet(f, 19, 2);
          if (id !== undefined) {
            const name = disp ? utf8.decode(disp) : slug ? utf8.decode(slug) : '';
            if (name && (!names.has(id) || (isDisplayName(name) && !isDisplayName(names.get(id))))) {
              names.set(id, name);
            }
          }
        }
        const b = pbGet(top, 3, 2);
        if (b) {
          const f = pbFields(b);
          const id = pbGet(f, 1, 0);
          const slug = pbGet(f, 28, 2);
          if (id !== undefined && slug && !names.has(id)) names.set(id, utf8.decode(slug));
        }
      } catch {
        // Skip unknown/legacy gen_metadata encodings.
      }
    }
    for (const row of db.prepare('SELECT metadata FROM steps WHERE step_type = 15').iterate()) {
      if (!row.metadata) continue;
      try {
        const f = pbFields(row.metadata);
        const usageBuf = pbGet(f, 9, 2);
        const tsBuf = pbGet(f, 1, 2);
        if (!usageBuf || !tsBuf) continue;
        const u = pbFields(usageBuf);
        const id = pbGet(u, 1, 0) ?? pbGet(f, 11, 0);
        if (id === undefined) continue;
        const seconds = pbGet(pbFields(tsBuf), 1, 0) || 0;
        const dateKey = toLocalDateKey(seconds * 1000);
        if (!daily.has(dateKey)) daily.set(dateKey, new Map());
        const perDay = daily.get(dateKey);
        if (!perDay.has(id)) perDay.set(id, emptyBucket());
        addToBucket(perDay.get(id), pbGet(u, 2, 0) || 0, pbGet(u, 5, 0) || 0, pbGet(u, 3, 0) || 0, true);
      } catch {
        // Skip malformed step metadata.
      }
    }
  } catch {
    return cached ? cached.parsed : null;
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
  const parsed = { key, names, daily };
  convDbCache.set(dbPath, { key, parsed });
  return parsed;
}

function mergeModelBucket(target, id, b) {
  if (!target.has(id)) target.set(id, emptyBucket());
  const t = target.get(id);
  t.input += b.input;
  t.cacheRead += b.cacheRead;
  t.output += b.output;
  t.total += b.total;
  t.net += b.net;
  t.steps += b.steps;
}

const TIER_SUFFIX_RE = /-(xhigh|high|medium|low|n|tiered|trial|exp-[a-z0-9]+)$/;

/**
 * Collapses tier variants into one family name:
 * "Gemini 4 Hydrogen (High)" / "gemini-4-hydrogen-medium" -> "Gemini 4 Hydrogen".
 */
function baseModelName(name) {
  let s = String(name).trim().replace(/\s*\([^)]*\)\s*$/, '');
  if (/^[a-z0-9.\-]+$/.test(s)) {
    while (TIER_SUFFIX_RE.test(s)) s = s.replace(TIER_SUFFIX_RE, '');
    s = s
      .split('-')
      .map((w) => (/^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ');
  }
  return s;
}

function modelList(map, names) {
  const merged = new Map();
  for (const [id, b] of map) {
    const name = baseModelName(names.get(id) || `Model ${id}`);
    mergeModelBucket(merged, name, b);
  }
  return [...merged.entries()]
    .map(([name, b]) => ({ name, ...b }))
    .filter((m) => m.total > 0)
    .sort((a, b) => b.total - a.total);
}

/**
 * Parses a single conversation's transcript.jsonl with (mtime, size) caching.
 */
function parseTranscript(filePath, convId) {
  const st = statOf(filePath);
  if (st.size < 0) return null;
  const key = `${st.mtimeMs}:${st.size}`;
  const cached = transcriptCache.get(filePath);
  if (cached && cached.key === key) return cached.parsed;

  let text = '';
  try {
    text = readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  const daily = new Map(); // dateKey -> bucket
  const totals = emptyBucket();
  let maxTurn = { durationMs: 0, date: '' };
  let lastDate = '';

  let turnActiveMs = 0;
  let turnStartDate = '';
  let prevStepMs = null;

  const flushTurn = () => {
    if (turnStartDate && turnActiveMs > maxTurn.durationMs) {
      maxTurn = { durationMs: turnActiveMs, date: turnStartDate };
    }
    if (turnStartDate) {
      const b = daily.get(turnStartDate);
      if (b) b.activeMs += turnActiveMs;
    }
  };

  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let step;
    try {
      step = JSON.parse(line);
    } catch {
      // Ignore torn trailing JSON line mid-write; picked up on next poll.
      continue;
    }
    if (!step || typeof step !== 'object' || !step.created_at) continue;
    const ms = Date.parse(step.created_at);
    if (!Number.isFinite(ms)) continue;

    const dateKey = toLocalDateKey(ms);
    if (dateKey > lastDate) lastDate = dateKey;

    const input = Math.max(0, Number(step.input_tokens) || 0);
    const cacheRead = Math.max(0, Number(step.cache_read_tokens) || 0);
    const output = Math.max(0, Number(step.output_tokens) || 0);
    const hasTokens =
      step.input_tokens !== undefined ||
      step.cache_read_tokens !== undefined ||
      step.output_tokens !== undefined;

    let dayBucket = daily.get(dateKey);
    if (!dayBucket && (hasTokens || step.type === 'USER_INPUT')) {
      dayBucket = emptyBucket();
      daily.set(dateKey, dayBucket);
    }

    if (hasTokens) {
      addToBucket(dayBucket, input, cacheRead, output, true);
      addToBucket(totals, input, cacheRead, output, true);
    }

    if (step.type === 'USER_INPUT') {
      flushTurn();
      turnActiveMs = 0;
      turnStartDate = dateKey;
      prevStepMs = ms;
      dayBucket.turns += 1;
      totals.turns += 1;
    } else if (turnStartDate && prevStepMs !== null) {
      const delta = ms - prevStepMs;
      if (delta > 0 && delta <= MAX_ACTIVE_GAP_MS) {
        turnActiveMs += delta;
      }
      prevStepMs = ms;
    }
  }
  flushTurn();

  const parsed = { convId, key, daily, totals, maxTurn, lastDate };
  transcriptCache.set(filePath, { key, parsed });
  return parsed;
}

/**
 * Computes longest and current consecutive active-day streaks.
 */
function computeStreaks(activeDatesSet, todayKey, yesterdayKey) {
  const sorted = [...activeDatesSet].sort();
  if (!sorted.length) return { longest: 0, current: 0, activeDays: 0 };

  let longest = 0;
  let run = 0;
  let prev = '';
  for (const d of sorted) {
    if (prev && addDays(prev, 1) === d) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
    prev = d;
  }

  let current = 0;
  let cursor = activeDatesSet.has(todayKey)
    ? todayKey
    : activeDatesSet.has(yesterdayKey)
      ? yesterdayKey
      : '';
  while (cursor && activeDatesSet.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  return { longest, current, activeDays: sorted.length };
}

/**
 * Aggregates all local transcripts into a full dashboard snapshot + etag.
 */
function buildSnapshot() {
  const now = new Date();
  const todayKey = toLocalDateKey(now.getTime());
  const yesterdayKey = addDays(todayKey, -1);

  const appDataDirs = findAppDataDirs();
  const metaByConv = new Map();
  const transcripts = [];
  const modelSources = [];
  const seenModelConvs = new Set();
  const etagParts = [todayKey];

  for (const appData of appDataDirs) {
    const dbMeta = loadConversationMeta(appData);
    for (const [cid, info] of dbMeta.entries()) {
      if (!metaByConv.has(cid)) metaByConv.set(cid, info);
    }
    const brainDir = join(appData, 'brain');
    for (const entry of safeReaddir(brainDir).sort()) {
      if (!UUID_RE.test(entry)) continue;
      const logPath = join(brainDir, entry, '.system_generated', 'logs', 'transcript.jsonl');
      const parsed = parseTranscript(logPath, entry);
      if (!parsed) continue;
      transcripts.push(parsed);
      etagParts.push(`${entry}:${parsed.key}`);
    }
    const convDir = join(appData, 'conversations');
    for (const file of safeReaddir(convDir).sort()) {
      const cid = file.slice(0, -3);
      // Backup app-data dirs may hold copies of the same conversation; count each once.
      if (!file.endsWith('.db') || !UUID_RE.test(cid) || seenModelConvs.has(cid)) continue;
      const parsed = parseConvModels(join(convDir, file));
      if (!parsed) continue;
      seenModelConvs.add(cid);
      modelSources.push(parsed);
      etagParts.push(`m${file}:${parsed.key}`);
    }
  }

  const modelNames = new Map();
  const modelTotals = new Map();
  const modelsByDay = new Map(); // dateKey -> Map(modelId -> bucket)
  for (const src of modelSources) {
    for (const [id, name] of src.names) {
      if (!modelNames.has(id) || (isDisplayName(name) && !isDisplayName(modelNames.get(id)))) {
        modelNames.set(id, name);
      }
    }
    for (const [dateKey, perModel] of src.daily) {
      if (!modelsByDay.has(dateKey)) modelsByDay.set(dateKey, new Map());
      for (const [id, b] of perModel) {
        mergeModelBucket(modelTotals, id, b);
        mergeModelBucket(modelsByDay.get(dateKey), id, b);
      }
    }
  }

  const etag = etagParts.join('|');
  const dailyMap = new Map();          // dateKey -> aggregate bucket
  const byDayConvs = new Map();        // dateKey -> conversation breakdown[]
  const totals = emptyBucket();
  let longestTask = { durationMs: 0, conversationId: '', title: '', date: '' };
  const activeDatesTotal = new Set();
  const activeDatesNet = new Set();
  const convTotals = [];

  for (const tr of transcripts) {
    const meta = metaByConv.get(tr.convId);
    const title = meta?.title || `会话 ${tr.convId.slice(0, 8)}`;
    const isSubagent = Boolean(meta?.parentId || (meta?.nestingDepth || 0) > 0);

    if (tr.totals.steps > 0) {
      totals.input += tr.totals.input;
      totals.cacheRead += tr.totals.cacheRead;
      totals.output += tr.totals.output;
      totals.total += tr.totals.total;
      totals.net += tr.totals.net;
      totals.steps += tr.totals.steps;
      totals.turns += tr.totals.turns;

      let convActiveMs = 0;
      for (const b of tr.daily.values()) convActiveMs += b.activeMs;
      totals.activeMs += convActiveMs;

      convTotals.push({
        conversationId: tr.convId,
        title,
        isSubagent,
        input: tr.totals.input,
        cacheRead: tr.totals.cacheRead,
        output: tr.totals.output,
        total: tr.totals.total,
        net: tr.totals.net,
        steps: tr.totals.steps,
        turns: tr.totals.turns,
        activeMs: convActiveMs,
        lastDate: tr.lastDate,
      });
    }

    if (tr.maxTurn.durationMs > longestTask.durationMs) {
      longestTask = {
        durationMs: tr.maxTurn.durationMs,
        conversationId: tr.convId,
        title,
        date: tr.maxTurn.date,
      };
    }

    for (const [dateKey, b] of tr.daily.entries()) {
      if (b.steps === 0) continue;
      if (b.total > 0) activeDatesTotal.add(dateKey);
      if (b.net > 0) activeDatesNet.add(dateKey);

      let agg = dailyMap.get(dateKey);
      if (!agg) {
        agg = emptyBucket();
        dailyMap.set(dateKey, agg);
      }
      agg.input += b.input;
      agg.cacheRead += b.cacheRead;
      agg.output += b.output;
      agg.total += b.total;
      agg.net += b.net;
      agg.steps += b.steps;
      agg.turns += b.turns;
      agg.activeMs += b.activeMs;

      if (b.steps > 0) {
        if (!byDayConvs.has(dateKey)) byDayConvs.set(dateKey, []);
        byDayConvs.get(dateKey).push({
          conversationId: tr.convId,
          title,
          isSubagent,
          input: b.input,
          cacheRead: b.cacheRead,
          output: b.output,
          total: b.total,
          net: b.net,
          steps: b.steps,
          activeMs: b.activeMs,
        });
      }
    }
  }

  const daily = [...dailyMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, b]) => ({ date, ...b }));

  for (const list of byDayConvs.values()) {
    list.sort((a, b) => b.total - a.total);
  }

  let peakDailyTotal = { date: '', value: 0 };
  let peakDailyNet = { date: '', value: 0 };
  for (const d of daily) {
    if (d.total > peakDailyTotal.value) peakDailyTotal = { date: d.date, value: d.total };
    if (d.net > peakDailyNet.value) peakDailyNet = { date: d.date, value: d.net };
  }

  convTotals.sort((a, b) => b.total - a.total);
  const topConversations = convTotals.slice(0, 20);

  const todayBucket = dailyMap.get(todayKey) || emptyBucket();

  return {
    etag,
    generatedAt: now.toISOString(),
    todayKey,
    yesterdayKey,
    totals: {
      ...totals,
      conversations: convTotals.length,
    },
    today: {
      date: todayKey,
      ...todayBucket,
      conversations: byDayConvs.get(todayKey) || [],
    },
    peaks: {
      dailyTotal: peakDailyTotal,
      dailyNet: peakDailyNet,
    },
    longestTask,
    streaks: {
      total: computeStreaks(activeDatesTotal, todayKey, yesterdayKey),
      net: computeStreaks(activeDatesNet, todayKey, yesterdayKey),
    },
    daily,
    byDayConversations: Object.fromEntries(byDayConvs.entries()),
    topConversations,
    models: {
      total: modelList(modelTotals, modelNames),
      byDay: Object.fromEntries(
        [...modelsByDay.entries()].map(([d, m]) => [d, modelList(m, modelNames)]),
      ),
    },
  };
}

const app = new SidecarApp();

function readAsset(filename) {
  try {
    return readFileSync(join(__dirname, filename), 'utf-8');
  } catch {
    return null;
  }
}

app.page('/', () => {
  const html = readAsset('index.html');
  return html !== null
    ? new Response(html, { contentType: 'text/html; charset=utf-8', headers: { 'Cache-Control': 'no-store' } })
    : new Response('Asset unavailable', { status: 503 });
});

for (const [route, [file, contentType]] of Object.entries(STATIC_ASSETS)) {
  app.api(
    route,
    () => {
      const text = readAsset(file);
      return text !== null
        ? new Response(text, { contentType, headers: { 'Cache-Control': 'no-store' } })
        : new Response('Not found', { status: 404 });
    },
    'GET',
  );
}

app.api('/api/stats', (data) => {
  const snap = buildSnapshot();
  if (data.etag && data.etag === snap.etag) {
    return { unchanged: true, etag: snap.etag, generatedAt: snap.generatedAt };
  }
  return snap;
}, 'GET');

app.run();
