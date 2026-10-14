// 12단계: 탈환 작전실 요약. /api/checks 응답과 서버 기록 한 줄이 같은 값을 쓰도록 계산을 한 곳에 둔다.
// 각 항목의 status는 두 가지뿐이다: confirmed(이 요청에서 서버가 직접 읽은 값), not_run(확인할 경로가 없거나 실행하지 않음).
// 메모 제목·본문·소유자·사용자 ID·토큰은 입력으로 받지도 않는다. 백업은 건수와 내용 해시만 받는다.
import { createHash } from 'node:crypto';

const HASH = /^[0-9a-f]{64}$/u;

export function buildChecks({ ruleIds, policy, backup }) {
  const rules = Array.isArray(ruleIds) ? ruleIds.filter((id) => typeof id === 'string') : [];
  const checks = {
    schema: 'byteback.checks.v1',
    rules: { status: 'confirmed', source: 'RULE_IDS', count: rules.length, ids: rules },
    detection: {
      status: 'not_run', source: 'none',
      reason: 'no_event_feed',
      note: '운영 엔진이 검증한 사건을 이 서버로 전달하는 경로가 없어 사건 건수를 세지 않았습니다.',
      contract: { action: 'propose_revocation', reasonCode: 'burst_read', over: 120, windowMinutes: 10 },
    },
    revocation: {
      status: 'not_run', source: 'none',
      reason: 'no_revocation_path',
      note: '접속을 회수하는 경로와 기록이 없어 회수 상태를 확인하지 않았습니다.',
      deviceApproved: false,
    },
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
  return {
    event: 'checks',
    rules: checks.rules.count,
    detection: checks.detection.status,
    revocation: checks.revocation.status,
    versions: checks.versions.status,
    backups: checks.versions.backupCount ?? null,
    fingerprint: checks.versions.backupFingerprint ?? null,
  };
}
