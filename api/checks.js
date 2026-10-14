// 12단계: 탈환 작전실 요약(읽기 전용). 판정기 규칙, 탐지 사건, 회수 상태, 복구 버전을 항목별 확인 여부와 함께 돌려준다.
// 로그인 없이도 공개 값(규칙, 정책 사본)은 답하고, 백업 버전은 Authorization이 있을 때 본인 행만 읽는다.
// 응답과 서버 기록에는 메모 제목·본문·소유자·사용자 ID·토큰을 넣지 않는다.
import policy from '../restore/safe-policy.json' with { type: 'json' };
import { RULE_IDS } from '../src/decider.mjs';
import { buildChecks, checksLogLine } from '../src/checks.mjs';
import { authorize, guard, requireNoteResource, resourceIdForRoute, rest } from '../src/notes-api.mjs';

export default async function handler(request, response) {
  let backup = null;
  if (request.method === 'GET' && request.headers.authorization) {
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
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }
  }
  const checks = buildChecks({ ruleIds: RULE_IDS, policy, backup });
  console.warn(JSON.stringify(checksLogLine(checks)));
  return response.status(200).json(checks);
}
