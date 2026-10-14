// 12단계: 탈환 작전실 요약. /api/checks 응답과 서버 기록 한 줄이 같은 값을 쓰도록 계산을 한 곳에 둔다.
// 수치는 점검 기록(ops/ops-record.json: 실제 배포에 GET으로 보낸 점검의 결과)에서만 센다. 기록에 없는 결과는 만들지 않는다.
// result 값: blocked(금지 요청이 거부됨), allowed(정상 요청이 허용됨), unexpected(기대와 다름), not_run(보내지 않음).
// 메모 제목·본문·소유자·사용자 ID·토큰은 입력으로 받지도 않는다. 백업은 건수와 내용 해시만 받는다.
import { createHash } from 'node:crypto';

const HASH = /^[0-9a-f]{64}$/u;
const RESULTS = ['blocked', 'allowed', 'unexpected', 'not_run'];
const AREAS = ['access', 'decision', 'detection', 'restore', 'device', 'app'];

export function countRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const count = (result) => list.filter((item) => item?.result === result).length;
  return { total: list.length, blocked: count('blocked'), allowed: count('allowed'), unexpected: count('unexpected'), notRun: count('not_run') };
}

const cleanRow = (item) => ({
  attackId: String(item.attackId), stage: Number(item.stage), kind: item.kind === 'allow' ? 'allow' : 'deny',
  area: AREAS.includes(item.area) ? item.area : 'access', expected: String(item.expected), observed: String(item.observed),
  result: RESULTS.includes(item.result) ? item.result : 'not_run',
  requestIds: Array.isArray(item.requestIds) ? item.requestIds.filter((id) => typeof id === 'string') : [],
  checkedAt: typeof item.checkedAt === 'string' ? item.checkedAt : null,
});

export function buildChecks({ ruleIds, policy, backup, record }) {
  const okRecord = record?.schema === 'byteback.ops-record.v1' && Array.isArray(record.rows);
  const rows = okRecord ? record.rows.map(cleanRow) : [];
  const area = (name) => countRows(rows.filter((item) => item.area === name));
  const checks = {
    schema: 'byteback.checks.v2',
    record: okRecord
      ? { status: 'confirmed', source: 'ops/ops-record.json', commit: String(record.commit).slice(0, 12), checkedAt: record.checkedAt, counts: countRows(rows) }
      : { status: 'not_run', source: 'ops/ops-record.json', reason: 'record_missing', counts: countRows([]) },
    areas: {
      decision: area('decision'),
      detection: area('detection'),
      revocation: { ...countRows([]), status: 'not_run', note: '접속 회수를 집행하는 경로가 이 저장소에 없어 회수는 실측하지 않았습니다. 탐지 행은 회수 제안까지만 봅니다.' },
      restore: area('restore'),
      access: area('access'),
      device: area('device'),
      app: area('app'),
    },
    rows,
    rules: { source: 'RULE_IDS', note: '코드에 구현된 규칙 이름 목록이며 실측 결과가 아닙니다.', ids: Array.isArray(ruleIds) ? ruleIds.filter((id) => typeof id === 'string') : [] },
    versions: null,
  };
  const policyOk = typeof policy?.sha256 === 'string' && HASH.test(policy.sha256) && typeof policy?.commit === 'string';
  const policySummary = policyOk ? { commit: policy.commit.slice(0, 7), sha256: policy.sha256.slice(0, 12) } : null;
  if (backup && Array.isArray(backup.hashes)) {
    const hashes = backup.hashes.filter((value) => typeof value === 'string' && HASH.test(value)).sort();
    checks.versions = {
      status: 'confirmed', source: 'vault_notes_backup', policy: policySummary,
      backupCount: hashes.length,
      backupFingerprint: hashes.length ? createHash('sha256').update(hashes.join('\n'), 'utf8').digest('hex').slice(0, 12) : null,
    };
  } else {
    checks.versions = {
      status: 'not_run', source: 'vault_notes_backup', reason: backup?.reason ?? 'login_required', policy: policySummary,
      note: '백업 확인은 로그인한 본인 행만 읽으므로 로그인 없이는 실행하지 않았습니다.',
    };
  }
  return checks;
}

// 서버 기록 한 줄. 화면에 나온 수치와 같은 필드에서만 만든다.
export function checksLogLine(checks) {
  const c = checks.record.counts;
  return {
    event: 'checks',
    record: checks.record.status,
    recordCommit: checks.record.commit ?? null,
    total: c.total, blocked: c.blocked, allowed: c.allowed, unexpected: c.unexpected, notRun: c.notRun,
    versions: checks.versions.status,
    backups: checks.versions.backupCount ?? null,
    fingerprint: checks.versions.backupFingerprint ?? null,
  };
}
