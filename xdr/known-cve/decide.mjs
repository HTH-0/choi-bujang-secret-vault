// 알려진 취약점 악용 보너스 판단 모듈: decide(alert) 하나를 내보낸다.
// 심판은 인터넷 없이 이 파일 한 개만 불러와 경보마다 바로 답을 받는다. 그래서 이 파일은
//  - 다른 파일·패키지를 불러오지 않고, 파일을 읽거나 쓰지 않고, 네트워크·타이머를 쓰지 않고,
//  - 패턴(xdr/known-cve/patterns.json과 같은 내용)을 아래 상수로 옮겨 적고, 안에서 혼자 계산해 답한다.
// 순서: 경보에서 규칙 수준·설명·요청 머리글(data.useragent)·요청 인자(data.url의 질의 부분)만 읽고 →
//       패턴과 맞춰 보고 → 명확하면 block, 애매하면 alert, 정상이면 record로 답한다.
// 확신도 기준: 0.85 이상 block · 0.5 이상 alert · 그 아래 record. 반환은 { action, confidence, reason } 뿐이다.
// 경보 안의 원격 조회 구문은 문서용 표기이므로 reason에 옮겨 적지 않는다.

// ---- 패턴(xdr/known-cve/patterns.json과 같은 내용) ----
const PATTERNS = Object.freeze({
  jndi_lookup_in_header: Object.freeze({
    name: '요청 머리글 안의 원격 조회 구문', technique: 'T1190',
    condition: '요청 머리글 값에 달러 기호와 여는 중괄호 뒤에 jndi: 가 오고, 원격 프로토콜과 주소가 이어진 뒤 닫는 중괄호로 끝나는 완전한 조회 구문이 들어 있다.',
    evidence: 'CVE-2021-44228: 공격자가 로그 메시지나 그 인자를 제어하면, Log4j2의 메시지 조회 치환이 공격자가 정한 LDAP 등 JNDI 주소에서 코드를 불러와 실행할 수 있다.',
    source: 'https://nvd.nist.gov/vuln/detail/CVE-2021-44228',
  }),
  jndi_lookup_in_param: Object.freeze({
    name: '요청 인자 안의 원격 조회 구문', technique: 'T1190',
    condition: '요청 주소의 인자 부분에 달러 기호와 여는 중괄호 뒤에 jndi: 가 오고, 원격 프로토콜과 주소가 이어진 뒤 닫는 중괄호로 끝나는 완전한 조회 구문이 들어 있다.',
    evidence: 'CVE-2021-44228: Log4j2의 JNDI 기능은 설정·로그 메시지·인자에서 공격자가 정한 LDAP 등 JNDI 주소를 막지 못해, 인자를 제어하는 공격자가 원격 코드를 실행할 수 있다.',
    source: 'https://nvd.nist.gov/vuln/detail/CVE-2021-44228',
  }),
  known_scanner_trace: Object.freeze({
    name: '알려진 취약점 점검 도구의 흔적', technique: 'T1595.002',
    condition: '경보에 알려진 취약점을 찾는 점검(스캐닝) 흔적이 드러난다. 점검 흔적만 있고 완전한 조회 구문이 없으면 탐색 단계로 보고 애매한 경보로 남긴다.',
    evidence: 'T1595.002 사례: Magic Hound가 CVE-2021-44228(Log4j)에 취약한 외부 공개 시스템을 찾으려고 넓게 스캐닝했다.',
    source: 'https://attack.mitre.org/techniques/T1595/002/',
  }),
});

// ---- 기준(과제가 정한 확신도 기준 + 연습 경보를 보고 이 모듈이 정한 값, NVD·ATT&CK가 정한 값 아님) ----
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;
const CLEAR_LEVEL = 10; // 완전한 조회 구문이 있고 규칙 수준이 이 이상이면 명확한 공격
const REPEAT_AT = 4; // 반복 횟수(data.count 또는 설명의 N번)가 이 이상이면 반복으로 본다
const NORMAL_MAX_LEVEL = 4; // 이 이하이고 신호가 없으면 정상
const STRONG_CONFIDENCE = 0.95; // 조회 구문 + (머리글·인자 둘 다, 점검 흔적, 반복 중 하나)
const CLEAR_CONFIDENCE = 0.9; // 조회 구문 하나
const LOW_LEVEL_LOOKUP_CONFIDENCE = 0.7; // 조회 구문은 있지만 규칙 수준이 낮음
const FRAGMENT_CONFIDENCE = 0.6; // 점검 흔적만, 또는 조회 구문의 조각만
const UNKNOWN_CONFIDENCE = 0.5; // 신호는 없지만 규칙 수준이 낮지 않음
const NORMAL_CONFIDENCE = 0.05;

// 완전한 원격 조회 구문: $ { jndi: 프로토콜:// 주소 }
const LOOKUP = /\$\{jndi:[a-z]+:\/\/[^}\s]+\}/iu;
// 조각 신호: 완전한 구문은 아니지만 이 취약점을 떠올리게 하는 글자(patterns.json의 excluded에 적은 애매한 모양)
const FRAGMENT_IN_REQUEST = /cve-\d{4}-\d{4,}|cve|jndi|\$\{|[{}]|lookup|log4j|log-library/iu;
const FRAGMENT_IN_DESCRIPTION = /CVE-\d{4}-\d{4,}|jndi|중괄호|조회 형태|조회 구문|라이브러리|취약점/iu;
const SCANNER_IN_DESCRIPTION = /점검 흔적|점검 도구|스캐닝|스캔/u;

function pick(alert) {
  const level = alert?.rule?.level;
  const text = (value) => (typeof value === 'string' ? value : '');
  const url = text(alert?.data?.url);
  const at = url.indexOf('?');
  const count = alert?.data?.count;
  return {
    level: Number.isInteger(level) ? level : null,
    description: text(alert?.rule?.description),
    header: text(alert?.data?.useragent),
    query: at >= 0 ? url.slice(at + 1) : '',
    path: at >= 0 ? url.slice(0, at) : url,
    count: Number.isInteger(count) && count >= 0 ? count : null,
    timestamp: alert?.timestamp,
  };
}

// 설명에서 가장 큰 "N번/N건" 숫자를 읽는다. 없으면 null.
function readCount(text) {
  const counts = [...text.matchAll(/(\d+)\s*(?:번|건)/gu)].map((m) => Number(m[1]));
  return counts.length ? Math.max(...counts) : null;
}

function readSignals(row) {
  const counts = [row.count, readCount(row.description)].filter((value) => value !== null);
  const repeat = counts.length ? Math.max(...counts) : null;
  const inHeader = LOOKUP.test(row.header);
  const inParam = LOOKUP.test(row.query);
  const request = `${row.path}?${row.query} ${row.header}`;
  return {
    level: row.level,
    inHeader,
    inParam,
    scanner: SCANNER_IN_DESCRIPTION.test(row.description),
    fragment: FRAGMENT_IN_REQUEST.test(request) || FRAGMENT_IN_DESCRIPTION.test(row.description),
    repeated: repeat !== null && repeat >= REPEAT_AT,
  };
}

const actionFor = (confidence) => (confidence >= BLOCK_AT ? 'block' : confidence >= ALERT_AT ? 'alert' : 'record');
const oneLine = (text) => String(text).replace(/\s+/gu, ' ').trim().slice(0, 160);
const answer = (confidence, reason) => ({ action: actionFor(confidence), confidence, reason: oneLine(reason) });

export async function decide(alert) {
  const row = pick(alert);
  if (!row.timestamp && !row.description) return answer(0, '형식을 알 수 없는 경보라 기록만 남김');
  const s = readSignals(row);

  // 명확: 머리글이나 인자에 완전한 조회 구문이 있다.
  const matched = [];
  if (s.inHeader) matched.push('jndi_lookup_in_header');
  if (s.inParam) matched.push('jndi_lookup_in_param');
  if (matched.length) {
    if (s.scanner) matched.push('known_scanner_trace');
    const names = matched.map((id) => PATTERNS[id].name).join(' + ');
    if (s.level === null || s.level < CLEAR_LEVEL) {
      return answer(LOW_LEVEL_LOOKUP_CONFIDENCE, `애매 · ${names} 패턴에 맞지만 규칙 수준이 낮음`);
    }
    const strong = (s.inHeader && s.inParam) || s.scanner || s.repeated;
    return answer(strong ? STRONG_CONFIDENCE : CLEAR_CONFIDENCE, `${names} 패턴에 맞음${s.repeated ? ' · 반복' : ''}`);
  }

  // 애매: 점검 흔적만 있거나, 조회 구문의 조각(CVE 글자, jndi 단어, 잘린 조각, 중괄호, 라이브러리 이름)만 있다.
  if (s.scanner) return answer(FRAGMENT_CONFIDENCE, `애매 · ${PATTERNS.known_scanner_trace.name}만 있고 조회 구문은 없음`);
  if (s.fragment) return answer(FRAGMENT_CONFIDENCE, `애매 · ${PATTERNS.jndi_lookup_in_param.name}에 못 미침(조각만 있음)`);

  // 정상: 신호가 없고 규칙 수준도 낮다. 신호는 없지만 수준이 높으면 확인용으로 alert.
  if (s.level === null || s.level <= NORMAL_MAX_LEVEL) return answer(NORMAL_CONFIDENCE, '정상 이벤트 · 알려진 취약점 악용 신호 없음');
  return answer(UNKNOWN_CONFIDENCE, '애매 · 패턴 신호는 없지만 규칙 수준이 낮지 않음');
}
