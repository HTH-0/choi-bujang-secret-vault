// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 6단계부터 규칙을 하나씩 추가합니다. 이 기본 응답은 모든 요청을 거부합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
import { readFileSync } from 'node:fs';

export const RULE_IDS = Object.freeze(['starter.deny', 'xdr_bruteforce_block', 'xdr_webinjection_block']);

// XDR 보너스: 각 respond.mjs가 차단 후보만 규칙 파일에 넣는다(무차별 로그인: xdr/block-rules.json, 웹 주입: xdr/web-injection/block-rules.json).
// 요청 계약의 subjectId·at만 비교한다. 규칙 파일이 없거나 틀리면 그 규칙은 아무 일도 하지 않고 아래 기존 규칙으로 간다.
const XDR_SOURCES = Object.freeze([
  Object.freeze({ file: '../xdr/block-rules.json', ruleId: RULE_IDS[1], fallbackReason: 'xdr_brute_force_block' }),
  Object.freeze({ file: '../xdr/web-injection/block-rules.json', ruleId: RULE_IDS[2], fallbackReason: 'xdr_web_injection_block' }),
]);

function xdrBlock(request) {
  const at = Date.parse(request?.at);
  if (!Number.isFinite(at) || typeof request?.subjectId !== 'string') return null;
  for (const source of XDR_SOURCES) {
    try {
      const file = JSON.parse(readFileSync(new URL(source.file, import.meta.url), 'utf8'));
      if (!Array.isArray(file?.rules)) continue;
      const rule = file.rules.find((item) => item?.ruleId === source.ruleId && item.decision === 'deny'
        && Array.isArray(item.subjectIds) && item.subjectIds.includes(request.subjectId)
        && Date.parse(item.createdAt) <= at && at < Date.parse(item.expiresAt));
      if (rule) return { rule, source };
    } catch {
      // 이 규칙 파일은 건너뛴다.
    }
  }
  return null;
}

export async function decide(request) {
  const blocked = xdrBlock(request);
  if (blocked) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'deny',
      reasonCode: /^[a-z][a-z0-9_]{0,63}$/u.test(blocked.rule.reasonCode ?? '') ? blocked.rule.reasonCode : blocked.source.fallbackReason,
      ruleIds: [blocked.source.ruleId],
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
