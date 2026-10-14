// 12단계 로컬 연습: 작전실 요약·점검 기록·제출 묶음 점검이 같은 기록에서 나오고, 메모 내용을 싣지 않고,
// 격리 환경 규칙(GET만, 요청마다 alephEvidence, URL.searchParams 없이 동작)을 지키는지 가상 입력으로 확인한다.
// 이 시험은 심판 판정이 아니며 실제 배포나 실제 Supabase 응답을 확인하지 않는다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import policy from '../restore/safe-policy.json' with { type: 'json' };
import config from '../aleph.config.json' with { type: 'json' };
import { RULE_IDS } from '../src/decider.mjs';
import { buildChecks, checksLogLine, countRows } from '../src/checks.mjs';
import { RULE_CASES, runRuleCheck } from '../src/rule-check.mjs';

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log(`통과: ${name}`); };
const SECRET_BODY = '가상본문-노출금지';
const h = (c) => c.repeat(64);

// 가짜 배포: 우리 서버 함수가 돌려줄 모양을 흉내 낸다. /api/checks?case=는 실제 runRuleCheck를 부른다.
const RealURL = URL;
const calls = [];
const fakeFetch = async (url, init = {}) => {
  const href = String(url instanceof RealURL ? url.href : url);
  calls.push({ method: init.method ?? 'GET', href, evidence: init.alephEvidence ?? null });
  const u = new RealURL(href);
  const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  if (u.hostname.endsWith('supabase.co')) return json({ code: '42501', message: 'denied' }, 401);
  if (u.pathname === '/data.json') return new Response('not found', { status: 404 });
  if (u.pathname === '/') return new Response('<html>탈환 작전실</html>', { status: 200 });
  if (u.pathname === '/api/config') return json({ supabaseUrl: 'https://x.supabase.co', publishableKey: `sb_publishable_${'x'.repeat(30)}` });
  if (u.pathname === '/aleph.json') return json({ originalApiUrl: config.originalApiUrl, allowedRoutes: config.allowedRoutes });
  if (u.pathname === '/api/device/status') return json({ approved: false, reason: 'device_not_registered' });
  if (u.pathname === '/api/restore') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  if (u.pathname === '/api/checks') {
    const c = href.match(/[?&]case=([a-z_]+)/u)?.[1];
    if (c) { const r = await runRuleCheck(c); return r ? json(r) : json({ error: 'UNKNOWN_CHECK' }, 400); }
    return json({ schema: 'byteback.checks.v2' });
  }
  if (u.pathname === '/api/notes') return json({ error: 'LOGIN_REQUIRED' }, 401);
  return json({ error: 'NOT_FOUND' }, 404);
};

await check('가상 판정 사례는 모두 기대한 결과가 나온다', async () => {
  for (const c of RULE_CASES) assert.equal((await runRuleCheck(c))?.ready, true, c);
  assert.equal(await runRuleCheck('없는_사례'), null);
  assert.equal(await runRuleCheck({ toString: () => 'x' }), null);
});

// 점검 실행: searchParams가 없는 URL(격리 환경 흉내)과 가짜 fetch
globalThis.fetch = fakeFetch;
class LimitedURL extends RealURL { get searchParams() { return undefined; } }
globalThis.URL = LimitedURL;
const { runAttackRecords, runAttackChecks } = await import('../src/attack-check.mjs');
const records = await runAttackRecords(config);
const recordCalls = calls.splice(0);
const attempts = await runAttackChecks(config);
globalThis.URL = RealURL;

await check('점검은 GET만 보내고 searchParams 없이도 끝난다', () => {
  assert.equal(recordCalls.filter((c) => c.method !== 'GET').length, 0);
  assert.ok(records.length > 0 && records.length <= 20);
});
await check('실측 행은 모두 자기 attackId의 alephEvidence 요청이 있고, 미실행 행은 요청이 없다', () => {
  for (const item of records) {
    const mine = recordCalls.filter((c) => c.evidence?.caseId === item.attackId);
    if (item.result === 'not_run' && item.observed.startsWith('미실행:') && !item.requestIds.length) assert.equal(mine.length, 0, item.attackId);
    else {
      assert.ok(mine.length >= 1, item.attackId);
      assert.deepEqual(mine.map((c) => c.evidence.requestKey), item.requestIds, item.attackId);
    }
  }
  assert.equal(recordCalls.every((c) => c.evidence && typeof c.evidence.caseId === 'string'), true);
  assert.equal(recordCalls.some((c) => c.href.includes(recordCalls[0].evidence.requestKey)), false, '요청 ID를 URL에 넣지 않음');
});
await check('제출 묶음 점검은 기록과 1:1이고 형식이 맞다', () => {
  assert.deepEqual(attempts.map((a) => a.attackId), records.map((r) => r.attackId));
  assert.equal(new Set(attempts.map((a) => a.attackId)).size, attempts.length);
  for (const a of attempts) {
    assert.deepEqual(Object.keys(a).sort(), ['attackId', 'expected', 'observed']);
    assert.ok(a.observed.trim() && a.observed.length <= 300 && a.expected.length <= 300);
    assert.match(a.attackId, /^[a-z0-9][a-z0-9_.-]{0,79}$/iu);
  }
});
await check('가짜 배포에서는 기대와 다른 실측이 없다', () => {
  const odd = records.filter((r) => r.result === 'unexpected').map((r) => `${r.attackId}: ${r.observed}`);
  assert.deepEqual(odd, []);
  assert.ok(records.some((r) => r.result === 'allowed') && records.some((r) => r.result === 'blocked'));
});

const record = { schema: 'byteback.ops-record.v1', commit: 'a'.repeat(40), checkedAt: '2026-10-14T00:00:00.000Z', rows: records };
await check('작전실 수치는 점검 기록에서 센 값과 같고, 서버 기록 줄도 같다', () => {
  const c = buildChecks({ ruleIds: RULE_IDS, policy, backup: null, record });
  assert.deepEqual(c.record.counts, countRows(records));
  const line = checksLogLine(c);
  assert.deepEqual([line.total, line.blocked, line.allowed, line.unexpected, line.notRun],
    [c.record.counts.total, c.record.counts.blocked, c.record.counts.allowed, c.record.counts.unexpected, c.record.counts.notRun]);
  assert.equal(c.rows.length, records.length);
});
await check('기록이 없으면 수치를 만들지 않고 미실행이다', () => {
  const c = buildChecks({ ruleIds: RULE_IDS, policy, backup: null, record: { schema: 'byteback.ops-record.pending', rows: [] } });
  assert.equal(c.record.status, 'not_run');
  assert.deepEqual(c.record.counts, { total: 0, blocked: 0, allowed: 0, unexpected: 0, notRun: 0 });
  assert.equal(c.areas.revocation.status, 'not_run');
});
await check('백업은 건수와 지문만, 메모 본문은 응답과 기록에 없다', () => {
  const c = buildChecks({ ruleIds: RULE_IDS, policy, backup: { hashes: [h('b'), h('a'), 'bad'], content: SECRET_BODY }, record });
  assert.equal(c.versions.backupCount, 2);
  assert.match(c.versions.backupFingerprint, /^[0-9a-f]{12}$/u);
  assert.equal((JSON.stringify(c) + JSON.stringify(checksLogLine(c))).includes(SECRET_BODY), false);
});

const call = async (request) => {
  const { default: handler } = await import('../api/checks.js');
  const res = { headers: {}, code: null, body: null, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, json(b) { this.body = b; return this; } };
  const lines = []; const warn = console.warn; console.warn = (s) => lines.push(s);
  try { await handler(request, res); } finally { console.warn = warn; }
  return { res, lines };
};
await check('핸들러: 로그인 없이 200이고 응답 수치와 서버 기록 줄이 같다', async () => {
  const { res, lines } = await call({ method: 'GET', headers: {}, query: {} });
  assert.equal(res.code, 200);
  assert.equal(res.body.schema, 'byteback.checks.v2');
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), checksLogLine(res.body));
});
await check('핸들러: ?case=는 가상 판정만 하고, 모르는 이름은 400, GET이 아니면 405', async () => {
  const ok = await call({ method: 'GET', headers: {}, query: { case: 'unregistered_device_denied' } });
  assert.equal(ok.res.code, 200); assert.equal(ok.res.body.ready, true); assert.equal(ok.res.body.virtual, true);
  assert.equal((await call({ method: 'GET', headers: {}, query: { case: 'drop_table' } })).res.code, 400);
  assert.equal((await call({ method: 'POST', headers: {}, query: {} })).res.code, 405);
});
await check('핸들러: 토큰이 있는데 서버 설정이 없으면 요약 없이 500이다', async () => {
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SECRET_KEY;
  const r = await call({ method: 'GET', headers: { authorization: 'Bearer fake' }, query: {} });
  assert.equal(r.res.code, 500); assert.equal(r.res.body.rows, undefined);
});
await check('화면: 작전실 코드는 innerHTML을 쓰지 않고 /api/checks만 읽는다', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const ops = html.slice(html.indexOf('// 12단계: 탈환 작전실'), html.indexOf('const render = '));
  assert.ok(ops.length > 100);
  assert.equal(/innerHTML|\.content\b/u.test(ops), false);
  assert.match(ops, /\/api\/checks/u);
});
console.log(`\n탈환 작전실 가상 시험 ${passed}개 통과 (심판 판정 아님)`);
