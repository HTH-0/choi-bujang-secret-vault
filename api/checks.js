// 12단계: 탈환 작전실 API(읽기 전용, GET만).
//  - GET /api/checks: 점검 기록(ops/ops-record.json)에서 센 수치와 표를 돌려준다. Authorization이 있으면 본인 백업의 건수·지문도 더한다.
//  - GET /api/checks?case=<이름>: src/rule-check.mjs의 고정된 가상 입력으로 판정기·탐지 규칙을 실행한 결과. 표에 없는 이름은 400.
// 응답과 서버 기록에는 메모 제목·본문·소유자·사용자 ID·토큰을 넣지 않는다.
import record from '../ops/ops-record.json' with { type: 'json' };
import policy from '../restore/safe-policy.json' with { type: 'json' };
import { RULE_IDS } from '../src/decider.mjs';
import { buildChecks, checksLogLine } from '../src/checks.mjs';
import { runRuleCheck } from '../src/rule-check.mjs';
import { authorize, guard, requireNoteResource, resourceIdForRoute, rest } from '../src/notes-api.mjs';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const caseId = request.query?.case;
  if (caseId !== undefined) {
    response.setHeader('Cache-Control', 'no-store');
    const result = await runRuleCheck(caseId);
    return result ? response.status(200).json(result) : response.status(400).json({ error: 'UNKNOWN_CHECK' });
  }
  let backup = null;
  if (request.headers.authorization) {
    // 로그인 검사는 guard가 한다. 실패하면 guard가 응답을 보냈으므로 그대로 끝낸다.
    const login = await guard(request, response, ['GET'], resourceIdForRoute('/api/notes'));
    if (!login) return;
    if (!requireNoteResource(login, request, response)) return;
    try {
      const upstream = await rest({ table: 'vault_notes_backup', query: { select: 'owner_id,content_hash', owner_id: `eq.${login.userId}` } });
      const rows = upstream.ok ? await upstream.json() : null;
      backup = Array.isArray(rows)
        ? { hashes: rows.filter((row) => authorize(login, row).ok).map((row) => row.content_hash) }
        : { reason: 'upstream_error' };
    } catch { backup = { reason: 'upstream_error' }; }
  } else {
    response.setHeader('Cache-Control', 'no-store');
  }
  const checks = buildChecks({ ruleIds: RULE_IDS, policy, backup, record });
  console.warn(JSON.stringify(checksLogLine(checks)));
  return response.status(200).json(checks);
}
