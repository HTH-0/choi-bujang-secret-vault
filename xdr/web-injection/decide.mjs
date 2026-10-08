// 웹 주입 공격 보너스 판단 모듈: decide(alert) 하나를 내보낸다.
// 심판은 인터넷 없이 이 파일 한 개만 불러와 경보마다 바로 답을 받는다. 그래서 이 파일은
//  - 다른 파일·패키지를 import하지 않고, 파일을 읽거나 쓰지 않고, 네트워크·타이머를 쓰지 않고,
//  - 패턴(patterns.json과 같은 내용)을 아래 상수로 옮겨 적고, 안에서 혼자 계산해 답한다.
// 순서: 경보에서 규칙 수준과 설명만 읽고 → 패턴과 맞춰 보고 →
//       명확하면 block, 애매하면 alert, 정상이면 record로 답한다.
// 확신도 기준: 0.85 이상 block · 0.5 이상 alert · 그 아래 record. 반환은 { action, confidence, reason } 뿐이다.

// ---- 패턴(근거: MITRE ATT&CK T1190, xdr/web-injection/patterns.json과 같은 내용) ----
const PATTERNS = Object.freeze({
  sql_syntax_in_request: Object.freeze({
    name: '요청 인자 안의 SQL 구문', technique: 'T1190',
    evidence: 'T1190 사례: APT41이 외부 공개 앱의 SQL 주입 등을 악용해 최초 침투를 했다(캠페인 C0017).',
  }),
  path_traversal_dotdot_repeat: Object.freeze({
    name: '경로 거슬러 올라가기(../) 반복', technique: 'T1190',
    evidence: 'T1190 사례: APT41이 외부 공개 앱의 디렉터리 순회 취약점을 악용해 최초 침투를 했다(캠페인 C0017).',
  }),
  repeated_injection_marker: Object.freeze({
    name: '같은 주소의 주입 표기 반복', technique: 'T1190',
    evidence: 'T1190 탐지(DET0080): 외부 공개 앱으로 가는 비정상 요청 패턴과 접근 로그의 의심 요청을 감시한다.',
  }),
});

// ---- 기준(과제가 정한 확신도 기준 + 연습 경보를 보고 이 모듈이 정한 값, ATT&CK가 정한 값 아님) ----
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;
const CLEAR_LEVEL = 10; // 규칙 수준이 이 이상이고 패턴에 맞으면 명확한 공격
const STRONG_LEVEL = 11; // 이 이상이면 확신도를 더 높게 준다
const REPEAT_AT = 5; // 설명의 횟수가 이 이상이면 반복으로 본다
const NORMAL_MAX_LEVEL = 4; // 이 이하이고 신호 말이 없으면 정상
const STRONG_CONFIDENCE = 0.95;
const CLEAR_CONFIDENCE = 0.9;
const AMBIGUOUS_CONFIDENCE = 0.5;
const NORMAL_CONFIDENCE = 0.05;

// 설명에서 읽는 말. 경보 설명이 한국어 문장이라 문장 속 말로 신호를 잡는다.
const SQL_WORDS = /SQL|select|데이터베이스 조회/iu;
const PATH_WORDS = /거슬러|경로 이탈|\.\.\//u;
const MARKER_WORDS = /스크립트|명령 구분자|삽입/u; // 스크립트 삽입·명령 구분자 같은 주입 표기
const OTHER_WORDS = /구분 문자|따옴표|주입|표기|표식/u; // 한 번뿐이면 애매한 신호 말
const DENIAL = /아닙니다|없습니다|않았|않습니다/u; // "반복은 없습니다", "공격 표기는 없습니다" 같은 부정

function pick(alert) {
  const level = alert?.rule?.level;
  const description = alert?.rule?.description;
  return {
    level: Number.isInteger(level) ? level : null,
    description: typeof description === 'string' ? description : '',
    timestamp: alert?.timestamp,
  };
}

// 설명에서 가장 큰 "N번/N건" 숫자를 읽는다. 없으면 null.
function readCount(text) {
  const counts = [...text.matchAll(/(\d+)\s*(?:번|건)/gu)].map((m) => Number(m[1]));
  return counts.length ? Math.max(...counts) : null;
}

function readSignals(row) {
  const text = row.description;
  const count = readCount(text);
  return {
    level: row.level,
    sql: SQL_WORDS.test(text),
    path: PATH_WORDS.test(text),
    marker: MARKER_WORDS.test(text),
    other: OTHER_WORDS.test(text),
    denied: DENIAL.test(text),
    count,
    repeated: count !== null && count >= REPEAT_AT && !DENIAL.test(text),
  };
}

function matchPatterns(s) {
  const matched = [];
  if (s.sql && s.repeated) matched.push('sql_syntax_in_request');
  if (s.path && s.repeated) matched.push('path_traversal_dotdot_repeat');
  if (s.marker && s.repeated) matched.push('repeated_injection_marker');
  return matched;
}

const actionFor = (confidence) => (confidence >= BLOCK_AT ? 'block' : confidence >= ALERT_AT ? 'alert' : 'record');
const oneLine = (text) => String(text).replace(/\s+/gu, ' ').trim().slice(0, 140);

export async function decide(alert) {
  const row = pick(alert);
  if (!row.timestamp && !row.description) {
    return { action: 'record', confidence: 0, reason: '형식을 알 수 없는 경보라 기록만 남김' };
  }
  const s = readSignals(row);
  const hasSignal = s.sql || s.path || s.marker || s.other;

  // 정상: 신호 말이 없고 규칙 수준도 낮다.
  if (!hasSignal && (s.level === null || s.level <= NORMAL_MAX_LEVEL)) {
    return { action: 'record', confidence: NORMAL_CONFIDENCE, reason: oneLine('정상 이벤트 · 주입 신호가 약함') };
  }

  // 명확: 패턴에 맞고, 부정하는 말이 없고, 규칙 수준이 충분하다.
  const matched = matchPatterns(s);
  if (matched.length && s.level !== null && s.level >= CLEAR_LEVEL) {
    const confidence = s.level >= STRONG_LEVEL ? STRONG_CONFIDENCE : CLEAR_CONFIDENCE;
    const names = matched.map((id) => PATTERNS[id].name).join(' + ');
    return { action: actionFor(confidence), confidence, reason: oneLine(`${names} 패턴에 맞음 · ${s.count}번 반복`) };
  }

  // 애매: 신호 말이 있거나 수준이 낮지 않은데 패턴에 못 미친다(한 번뿐, 반복 없음, 수업 단어 등).
  const near = s.path || /경로/u.test(row.description) ? PATTERNS.path_traversal_dotdot_repeat
    : s.marker ? PATTERNS.repeated_injection_marker : PATTERNS.sql_syntax_in_request;
  return {
    action: actionFor(AMBIGUOUS_CONFIDENCE), confidence: AMBIGUOUS_CONFIDENCE,
    reason: oneLine(`애매 · ${near.name}에 못 미침${s.count !== null ? `(${s.count}번)` : ''} · 반복·근거가 약해 alert`),
  };
}
