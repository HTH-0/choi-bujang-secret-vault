// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 6단계부터 규칙을 하나씩 추가합니다. 이 기본 응답은 모든 요청을 거부합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['starter.deny', 'xdr_bruteforce_block', 'xdr_webinjection_block', 'device_registered', 'step_up_required']);

// XDR 보너스: 각 respond.mjs가 차단 후보만 규칙 파일에 넣는다(무차별 로그인: xdr/block-rules.json, 웹 주입: xdr/web-injection/block-rules.json).
// node:fs는 파일 맨 위 import가 아니라 규칙 파일을 읽을 때만 얻는다(이 파일만 따로 불러도 열리게 하려는 것).
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
      const { readFileSync } = process.getBuiltinModule('node:fs');
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

// 7단계 입력 검사: 계약(docs/DECIDER_REQUEST.md)에 있는 signals·recentEvents·stepUp만 읽는다.
// headers·geo·device·identity·role 같은 계약 밖 항목은 있어도 읽지 않는다. 없거나 출처가 불명확한 값은 null로 두고 정상값으로 채우지 않는다.
// origin: 'none'(엔진이 접속 신호를 주지 않음), 'judge_fixture'(심판의 가상 사건), 'unknown'(그 밖의 출처). 현재 계약에는 실제 위치 증거로 인정할 출처가 없어 trusted는 항상 false다.
export function readConnectionInfo(request) {
  const signals = request?.signals;
  const source = signals !== null && typeof signals === 'object' ? signals.source : undefined;
  const origin = source === 'none' || source === 'judge_fixture' ? source : 'unknown';
  const label = (value) => (origin === 'judge_fixture' && typeof value === 'string' && value !== 'unknown'
    && /^[a-z][a-z0-9_]{0,31}$/u.test(value) ? value : null);
  const hour = origin === 'judge_fixture' && Number.isInteger(signals.hour) && signals.hour >= 0 && signals.hour <= 23
    ? signals.hour : null;
  const events = Array.isArray(request?.recentEvents) && request.recentEvents.length <= 12 ? request.recentEvents : [];
  const recentEvents = events.filter((item) => item !== null && typeof item === 'object'
    && typeof item.kind === 'string' && /^[a-z][a-z0-9_]{0,31}$/u.test(item.kind)
    && Number.isInteger(item.ageSeconds) && item.ageSeconds >= 0
    && Number.isInteger(item.count) && item.count >= 0)
    .map((item) => ({ kind: item.kind, ageSeconds: item.ageSeconds, count: item.count }));
  const step = request?.stepUp;
  const verified = step !== null && typeof step === 'object' && step.verified === true
    && Number.isInteger(step.authAgeSeconds) && step.authAgeSeconds >= 0 && step.authAgeSeconds <= 900;
  return {
    origin,
    trusted: false,
    region: label(signals?.region),
    network: label(signals?.network),
    hour,
    recentEvents,
    stepUp: { verified, authAgeSeconds: verified ? step.authAgeSeconds : null },
  };
}

// 7단계 복합 이상: 평소와 다른 시각(0~5시, 23시), 처음 보는 네트워크, 최근 5분 안의 대량 조회 사건이 모두 있을 때만 참이다.
// 지역(region)은 조건에 넣지 않는다. 지역 하나로는 추가 확인도 차단도 하지 않는다. 숫자 기준은 연습 요청을 보고 정한 값이며 계약이 정한 값이 아니다.
function complexAnomaly(info) {
  const unusualHour = info.hour !== null && (info.hour < 6 || info.hour >= 23);
  const unusualNetwork = info.network === 'unusual';
  const burstRead = info.recentEvents.some((item) => item.kind === 'risk_signal' && item.count >= 10 && item.ageSeconds <= 300);
  return unusualHour && unusualNetwork && burstRead;
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
  // 6단계: 엔진이 확인한 deviceRegistered가 true일 때만 다음으로 간다. false·값 없음·다른 값은 모두 거부한다.
  if (request?.deviceRegistered !== true) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request?.requestId,
      decision: 'deny',
      reasonCode: 'device_not_registered',
      ruleIds: [RULE_IDS[3]],
    };
  }
  // 등록 기기가 notes 서비스의 메모 한 건(GET /notes/:id)을 읽을 때만 허용한다. 메모 전체 목록 경로는 열지 않는다(한 건의 주인 비교는 API가 한다). 쓰기와 다른 서비스·경로는 아래 기본 거부로 간다.
  if (request.method === 'GET' && request.service === 'notes'
      && typeof request.route === 'string' && /^GET \/(?:api\/)?notes\/:id$/u.test(request.route)) {
    // 7단계: 복합 이상 접속은 다시 확인한 뒤에만 허용한다. 영구 차단이 아니라 추가 확인이다.
    const info = readConnectionInfo(request);
    if (complexAnomaly(info) && !info.stepUp.verified) {
      return {
        schema: 'aleph.decision.v1',
        requestId: request.requestId,
        decision: 'step_up',
        reasonCode: 'step_up_required',
        ruleIds: [RULE_IDS[4]],
      };
    }
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'allow',
      reasonCode: 'approved',
      ruleIds: [RULE_IDS[3]],
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
