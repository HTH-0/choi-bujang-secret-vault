// 12단계 로컬 연습: 탈환 작전실 요약이 항목별 확인 여부를 지키고 메모 내용을 싣지 않는지 가상 입력으로 확인한다.
// 이 시험은 심판 판정이 아니며 실제 배포나 실제 Supabase 응답을 확인하지 않는다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import policy from '../restore/safe-policy.json' with { type: 'json' };
import { RULE_IDS } from '../src/decider.mjs';
import { buildChecks, checksLogLine } from '../src/checks.mjs';

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; console.log(`통과: ${name}`); };
const SECRET_TITLE = '가상제목-노출금지';
const SECRET_BODY = '가상본문-노출금지';
const h = (c) => c.repeat(64);

check('규칙은 RULE_IDS와 같고 확인됨이다', () => {
  const c = buildChecks({ ruleIds: RULE_IDS, policy, backup: null });
  assert.equal(c.rules.status, 'confirmed');
  assert.deepEqual(c.rules.ids, [...RULE_IDS]);
  assert.equal(c.rules.count, RULE_IDS.length);
});
check('탐지 사건과 회수 상태는 항상 미실행이며 건수를 만들지 않는다', () => {
  const c = buildChecks({ ruleIds: RULE_IDS, policy, backup: { hashes: [h('a')] } });
  assert.equal(c.detection.status, 'not_run');
  assert.equal(c.revocation.status, 'not_run');
  assert.equal('count' in c.detection, false);
  assert.equal(c.revocation.deviceApproved, false);
});
check('로그인 없이는 복구 버전이 미실행이고 정책 사본만 보인다', () => {
  const c = buildChecks({ ruleIds: RULE_IDS, policy, backup: null });
  assert.equal(c.versions.status, 'not_run');
  assert.equal(c.versions.reason, 'login_required');
  assert.equal(c.versions.policy.sha256, policy.sha256.slice(0, 12));
  assert.equal('backupCount' in c.versions, false);
});
check('백업이 있으면 건수와 지문만 확인됨으로 낸다', () => {
  const c = buildChecks({ ruleIds: RULE_IDS, policy, backup: { hashes: [h('b'), h('a'), 'bad', 7] } });
  assert.equal(c.versions.status, 'confirmed');
  assert.equal(c.versions.backupCount, 2);
  assert.match(c.versions.backupFingerprint, /^[0-9a-f]{12}$/u);
  const same = buildChecks({ ruleIds: RULE_IDS, policy, backup: { hashes: [h('a'), h('b')] } });
  assert.equal(same.versions.backupFingerprint, c.versions.backupFingerprint);
});
check('백업 0건은 확인됨이며 지문이 없다', () => {
  const c = buildChecks({ ruleIds: RULE_IDS, policy, backup: { hashes: [] } });
  assert.equal(c.versions.status, 'confirmed');
  assert.equal(c.versions.backupCount, 0);
  assert.equal(c.versions.backupFingerprint, null);
});
check('위쪽 오류는 미실행이며 확인됨으로 바뀌지 않는다', () => {
  const c = buildChecks({ ruleIds: RULE_IDS, policy, backup: { reason: 'upstream_error' } });
  assert.equal(c.versions.status, 'not_run');
  assert.equal(c.versions.reason, 'upstream_error');
});
check('입력에 메모 제목·본문이 섞여도 응답과 기록에 나오지 않는다', () => {
  const c = buildChecks({ ruleIds: RULE_IDS, policy, backup: { hashes: [h('c')], title: SECRET_TITLE, content: SECRET_BODY } });
  const text = JSON.stringify(c) + JSON.stringify(checksLogLine(c));
  assert.equal(text.includes(SECRET_TITLE) || text.includes(SECRET_BODY), false);
});
check('서버 기록 한 줄이 응답 수치와 같다', () => {
  const c = buildChecks({ ruleIds: RULE_IDS, policy, backup: { hashes: [h('a'), h('b')] } });
  assert.deepEqual(checksLogLine(c), {
    event: 'checks', rules: RULE_IDS.length, detection: 'not_run', revocation: 'not_run', versions: 'confirmed',
    backups: 2, fingerprint: c.versions.backupFingerprint,
  });
});

const call = async (request) => {
  const { default: handler } = await import('../api/checks.js');
  const res = { headers: {}, code: null, body: null, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, json(b) { this.body = b; return this; } };
  const lines = []; const warn = console.warn; console.warn = (s) => lines.push(s);
  try { await handler(request, res); } finally { console.warn = warn; }
  return { res, lines };
};
{
  const { res, lines } = await call({ method: 'GET', headers: {} });
  check('핸들러: 로그인 없이 200이고 화면 수치와 서버 기록이 같다', () => {
    assert.equal(res.code, 200);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(res.body.rules.count, RULE_IDS.length);
    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0]), checksLogLine(res.body));
  });
  const post = await call({ method: 'POST', headers: {} });
  check('핸들러: GET이 아니면 405다', () => { assert.equal(post.res.code, 405); assert.equal(post.res.headers.Allow, 'GET'); });
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SECRET_KEY;
  const noEnv = await call({ method: 'GET', headers: { authorization: 'Bearer fake' } });
  check('핸들러: 서버 설정이 없으면 요약 없이 500이다', () => {
    assert.equal(noEnv.res.code, 500);
    assert.equal(noEnv.res.body.rules, undefined);
  });
}
{
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const ops = html.slice(html.indexOf('const opsCells'), html.indexOf('const render = '));
  check('화면: 작전실 코드는 innerHTML을 쓰지 않고 본문 필드를 읽지 않는다', () => {
    assert.equal(/innerHTML|\.body\b|\.content\b|\.title\b/u.test(ops), false);
    assert.match(ops, /\/api\/checks/u);
  });
}
console.log(`\n탈환 작전실 가상 시험 ${passed}개 통과 (심판 판정 아님)`);
