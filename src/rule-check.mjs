// 12단계: 판정기·탐지 규칙을 고정된 가상 입력으로 실행한다. GET /api/checks?case=<이름>이 이 함수를 부른다.
// 입력은 아래 표에 적힌 값뿐이며, 요청의 쿼리·헤더·본문 값을 판정 입력으로 쓰지 않는다(case 이름으로 표의 한 줄을 고를 뿐이다).
// 결과는 가상 입력에 대한 판정이며 실제 사용자 기기, 실제 사건, 실제 접속 회수를 뜻하지 않는다.
import { decide } from './decider.mjs';
import { detect } from './detect.mjs';

// 계약(docs/DECIDER_REQUEST.md)의 18개 이름만 쓴 가상 요청. 시각은 실행할 때 만든다.
const request = (overrides = {}) => ({
  schema: 'aleph.decision.v1', requestId: '00000000-0000-4000-8000-0000000000c1', classId: 'check_class', projectId: 'check_project',
  subjectId: 'check_subject', deviceId: '0123456789abcdef', service: 'notes', method: 'GET', path: '/notes/check',
  route: 'GET /notes/:id', queryLength: 0, querySha256: '0'.repeat(64), at: new Date().toISOString(), policyRevision: 'check',
  deviceRegistered: true, stepUp: { verified: false, authAgeSeconds: null }, recentEvents: [],
  signals: { source: 'none', region: 'unknown', network: 'unknown', hour: null }, ...overrides,
});

const DECISION_CASES = Object.freeze({
  registered_device_note_allowed: { expected: 'allow', input: () => request() },
  unregistered_device_denied: { expected: 'deny', input: () => request({ deviceRegistered: false }) },
  unusual_access_step_up: {
    expected: 'step_up',
    input: () => request({
      signals: { source: 'judge_fixture', region: 'unknown', network: 'unusual', hour: 3 },
      recentEvents: [{ kind: 'risk_signal', ageSeconds: 60, count: 20 }],
    }),
  },
  other_zone_route_denied: { expected: 'deny', input: () => request({ service: 'notices', path: '/notices/check', route: 'GET /notices/:id' }) },
});

export const RULE_CASES = Object.freeze([...Object.keys(DECISION_CASES), 'burst_read_revocation']);

export async function runRuleCheck(caseId) {
  if (typeof caseId !== 'string') return null;
  if (Object.hasOwn(DECISION_CASES, caseId)) {
    const { expected, input } = DECISION_CASES[caseId];
    const result = await decide(input());
    return {
      case: caseId, virtual: true, expected, decision: result?.decision ?? null, reasonCode: result?.reasonCode ?? null,
      ruleIds: Array.isArray(result?.ruleIds) ? result.ruleIds : [], ready: result?.decision === expected,
    };
  }
  if (caseId === 'burst_read_revocation') {
    // 같은 가명 사용자가 2초 간격으로 121번 조회한 가상 사건(약 4분). 계약상 120건을 넘으면 회수 제안이다.
    const start = Date.now() - 10 * 60 * 1000;
    const events = Array.from({ length: 121 }, (_, i) => ({ at: new Date(start + i * 2000).toISOString(), method: 'GET', identity: { sub: 'check_user' } }));
    const result = detect(events);
    return { case: caseId, virtual: true, expected: 'propose_revocation', action: result?.action ?? null, reasonCode: result?.reasonCode ?? null, ready: result?.action === 'propose_revocation' };
  }
  return null;
}
