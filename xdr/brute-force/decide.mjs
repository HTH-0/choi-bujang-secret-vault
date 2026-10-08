// 무차별 로그인 공격 보너스 판단 모듈: decide(alert) 하나를 내보낸다.
// 심판은 인터넷 없이 이 파일 한 개만 불러와 경보마다 바로 답을 받는다. 그래서 이 파일은
//  - 다른 파일·패키지를 import하지 않고, 파일을 읽거나 쓰지 않고, 네트워크·타이머를 쓰지 않고,
//  - 패턴(patterns.json과 같은 내용)을 아래 상수로 옮겨 적고, 안에서 혼자 계산해 답한다.
// 순서: 경보에서 다섯 값만 뽑고(비밀값처럼 보이는 값은 가림) → 패턴과 맞춰 보고 →
//       명확하면 block, 정상이면 record, 애매하면 alert(확신도 0.5)로 답한다.
// 확신도 기준: 0.85 이상 block · 0.5 이상 alert · 그 아래 record. 반환은 { action, confidence, reason } 뿐이다.
// 애매한 경보에 Jev(TypeSafe)의 확신도를 받아 덮어쓰는 일은 파일 밖의 respond.mjs가 맡는다(키가 있을 때만).

// ---- 패턴(근거: MITRE ATT&CK T1110, xdr/brute-force/patterns.json과 같은 내용) ----
const PATTERNS = Object.freeze({
  same_source_failure_burst: Object.freeze({
    name: '같은 주소의 로그인 실패 연속', technique: 'T1110.001',
    evidence: 'T1110.001 탐지: 같은 또는 비슷한 계정을 겨냥한 로그인 실패 연속 사건이 하나 이상의 원격 IP에서 시간에 걸쳐 나타나는지 감시한다.',
  }),
  password_spraying_many_accounts: Object.freeze({
    name: '여러 계정에 같은 비밀번호 대입', technique: 'T1110.003',
    evidence: 'T1110.003 탐지: 하나의 비밀번호(또는 소수)로 서로 다른 많은 계정에 인증 실패가 정해진 시간 창 안에 몰리는지, 같은 출발 IP에서 보는지 감시한다.',
  }),
  rotating_usernames_burst: Object.freeze({
    name: '계정 이름을 바꿔 가며 실패가 몰림', technique: 'T1110.004',
    evidence: 'T1110.004 탐지: 한 IP나 세션에서 짧은 시간에 서로 다른 사용자 이름·비밀번호 쌍으로 인증 실패가 몰리고 사용자 이름이 바뀌는지 감시한다.',
  }),
  many_failures_then_success: Object.freeze({
    name: '많은 실패 뒤에 성공', technique: 'T1110',
    evidence: 'T1110 탐지: 의심스러운 사용자·호스트·시간대에서 많은 로그온 실패 뒤에 성공이 이어지는지, 같은 IP나 사용자에서 실패 뒤 성공이 나오는지 감시한다.',
  }),
});

// ---- 기준(과제가 정한 확신도 기준 + 연습 경보를 보고 이 모듈이 정한 값, ATT&CK가 정한 값 아님) ----
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;
const CLEAR_FAILURES = 30; // 이만큼 실패가 쌓이면 시간 창이 없어도 명확한 연속 실패
const BURST_FAILURES = 10; // 짧은 시간 안이라면 이만큼부터 명확
const SHORT_MINUTES = 5; // 이 시간 안이면 짧은 시간
const MANY_ACCOUNTS = 10; // 한 주소가 이만큼 계정에 실패를 넣으면 여러 계정 대입
const ATTACK_CONFIDENCE = 0.95; // 명확한 공격(규칙 수준 10 이상)
const WEAK_ATTACK_CONFIDENCE = 0.9; // 명확하지만 규칙 수준이 그보다 낮음
const NORMAL_CONFIDENCE = 0.05; // 정상 이벤트

// ---- 비밀값처럼 보이는 값은 가린다 ----
const MASK = '[가림]';
const SECRET_LIKE = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/gu,
  /\bBearer\s+\S+/giu,
  /\beyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+){0,2}/gu,
  /\bsb_(?:secret|publishable)_\S+/giu,
  /\bsk-[A-Za-z0-9_-]{16,}/gu,
  /\b(?:password|passwd|pwd|secret|token|api[_-]?key|authorization)\s*[=:]\s*\S+/giu,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu,
  /[A-Za-z0-9+/_-]{32,}={0,2}/gu,
];

function mask(value) {
  if (typeof value !== 'string') return null;
  let text = value;
  for (const pattern of SECRET_LIKE) text = text.replace(pattern, MASK);
  return text;
}

// 경보에서 다섯 값만 뽑는다. 나머지(agent, mitre, accounts 등)는 보지 않는다.
function pick(alert) {
  const level = alert?.rule?.level;
  return {
    timestamp: mask(alert?.timestamp),
    srcip: mask(alert?.data?.srcip),
    level: Number.isInteger(level) ? level : null,
    description: mask(alert?.rule?.description),
  };
}

const number = (text, pattern) => {
  const found = pattern.exec(text);
  return found ? Number(found[1]) : null;
};

// 설명에서 신호를 읽는다. 값이 없으면 null/false.
function readSignals(row) {
  const text = row.description ?? '';
  return {
    level: row.level,
    hasSource: Boolean(row.srcip),
    hasFailure: /실패/u.test(text),
    failures: number(text, /(\d+)\s*건/u),
    minutes: number(text, /(\d+)\s*분/u),
    accounts: number(text, /계정\s*(\d+)\s*개/u),
    manyAccountsText: /여러 계정|서로 다른 계정/u.test(text),
    samePassword: /같은 비밀번호/u.test(text),
    rotating: /계정 이름을 바꿔/u.test(text),
    success: /성공/u.test(text) && !/성공(은|이) 없/u.test(text),
  };
}

// 패턴과 맞춰 본다. 맞은 패턴 id를 구체적인 순서(여러 계정 → 이름 바꿈 → 실패 뒤 성공 → 같은 주소 연속)로 돌려준다.
function matchPatterns(s) {
  const burst = s.failures !== null && (s.failures >= CLEAR_FAILURES
    || (s.failures >= BURST_FAILURES && s.minutes !== null && s.minutes <= SHORT_MINUTES));
  const matched = [];
  // 같은 비밀번호를 여러 계정에 넣었다는 설명은 "실패"라는 말이 없어도 대입 패턴이다. 계정 수만 많을 때는 실패가 있어야 한다.
  if ((s.samePassword && (s.manyAccountsText || (s.accounts ?? 0) >= 5))
      || (s.hasFailure && (s.accounts ?? 0) >= MANY_ACCOUNTS)) matched.push('password_spraying_many_accounts');
  if (s.hasFailure && s.rotating && s.failures !== null && s.failures >= BURST_FAILURES) matched.push('rotating_usernames_burst');
  if (s.hasFailure && s.success && s.failures !== null && s.failures >= CLEAR_FAILURES) matched.push('many_failures_then_success');
  if (s.hasFailure && s.hasSource && burst) matched.push('same_source_failure_burst');
  return matched;
}

function classify(s) {
  if (!s.hasFailure && (s.level === null || s.level <= 4)) return { kind: 'normal' };
  if (s.hasFailure && s.failures !== null && s.failures <= 1 && s.level !== null && s.level <= 3) return { kind: 'normal' };
  const matched = matchPatterns(s);
  // 패턴에는 맞지만 규칙 수준이 너무 낮으면 근거가 엇갈리므로 애매한 것으로 둔다.
  if (matched.length && s.level !== null && s.level >= 5) return { kind: 'clear', matched };
  return { kind: 'ambiguous', matched };
}

const actionFor = (confidence) => (confidence >= BLOCK_AT ? 'block' : confidence >= ALERT_AT ? 'alert' : 'record');
const oneLine = (text) => String(text).replace(/\s+/gu, ' ').trim().slice(0, 140);

export async function decide(alert) {
  const row = pick(alert);
  if (!row.timestamp && !row.description) {
    return { action: 'record', confidence: 0, reason: '형식을 알 수 없는 경보라 기록만 남김' };
  }
  const s = readSignals(row);
  const verdict = classify(s);

  if (verdict.kind === 'normal') {
    return { action: 'record', confidence: NORMAL_CONFIDENCE, reason: oneLine('정상 이벤트 · 로그인 실패 신호가 약함') };
  }
  if (verdict.kind === 'clear') {
    const confidence = s.level >= 10 ? ATTACK_CONFIDENCE : WEAK_ATTACK_CONFIDENCE;
    const pattern = PATTERNS[verdict.matched[0]];
    return {
      action: actionFor(confidence), confidence,
      reason: oneLine(`${pattern.name} 패턴에 맞음${s.failures !== null ? ` · 실패 ${s.failures}건` : ''}`),
    };
  }

  // 애매한 경보: 가까운 패턴 이름을 밝히고, 확신도를 받지 못한 것으로 보아 alert(0.5)로 답한다.
  const near = s.hasFailure && s.success ? 'many_failures_then_success' : s.rotating ? 'rotating_usernames_burst' : 'same_source_failure_burst';
  const hint = `${PATTERNS[near].name}에 못 미침${s.failures !== null ? `(실패 ${s.failures}건)` : ''}`;
  return { action: actionFor(ALERT_AT), confidence: ALERT_AT, reason: oneLine(`애매 · ${hint} · 확신도를 받지 못해 alert`) };
}
