// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 6단계부터 규칙을 하나씩 추가합니다. 이 기본 응답은 모든 요청을 거부합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
import { readFileSync } from 'node:fs';

export const RULE_IDS = Object.freeze(['starter.deny', 'xdr_bruteforce_block']);

// 무차별 로그인 공격 보너스: xdr/brute-force/respond.mjs가 차단 후보만 xdr/block-rules.json에 넣는다.
// 요청 계약의 subjectId·at만 비교한다. 규칙 파일이 없거나 틀리면 이 규칙은 아무 일도 하지 않고 아래 기존 규칙으로 간다.
function xdrBlock(request) {
  try {
    const file = JSON.parse(readFileSync(new URL('../xdr/block-rules.json', import.meta.url), 'utf8'));
    const at = Date.parse(request?.at);
    if (!Array.isArray(file?.rules) || !Number.isFinite(at) || typeof request?.subjectId !== 'string') return null;
    return file.rules.find((rule) => rule?.ruleId === RULE_IDS[1] && rule.decision === 'deny'
      && Array.isArray(rule.subjectIds) && rule.subjectIds.includes(request.subjectId)
      && Date.parse(rule.createdAt) <= at && at < Date.parse(rule.expiresAt)) ?? null;
  } catch {
    return null;
  }
}

export async function decide(request) {
  const blocked = xdrBlock(request);
  if (blocked) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'deny',
      reasonCode: /^[a-z][a-z0-9_]{0,63}$/u.test(blocked.reasonCode ?? '') ? blocked.reasonCode : 'xdr_brute_force_block',
      ruleIds: [RULE_IDS[1]],
    };
  }
  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision: 'deny',
    reasonCode: 'starter_not_ready',
    ruleIds: [RULE_IDS[0]],
  };
}
