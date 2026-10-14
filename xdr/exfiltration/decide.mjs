// 자료 빼돌리기(유출) 보너스 판단 모듈: decide(alert) 하나를 내보낸다.
// 심판은 인터넷 없이 이 파일 한 개만 불러와 경보마다 바로 답을 받는다. 그래서 이 파일은
//  - 다른 파일·패키지를 불러오지 않고, 파일을 읽거나 쓰지 않고, 네트워크·타이머를 쓰지 않고,
//  - 패턴(xdr/exfiltration/patterns.json과 같은 내용)을 아래 상수로 옮겨 적고, 안에서 혼자 계산해 답한다.
// 순서: 경보에서 규칙 수준·설명·전송량(data.bytes)·파일 수(data.files)·횟수(data.count)만 읽고 →
//       패턴과 맞춰 보고 → 명확하면 block, 애매하면 alert, 정상이면 record로 답한다.
// 확신도 기준: 0.85 이상 block · 0.5 이상 alert · 그 아래 record. 반환은 { action, confidence, reason } 뿐이다.
// 목적지 주소와 계정 이름은 읽지도 reason에 옮기지도 않는다.

// ---- 패턴(xdr/exfiltration/patterns.json과 같은 내용) ----
const PATTERNS = Object.freeze({
  large_transfer_to_new_destination: Object.freeze({
    name: '처음 보는 목적지로 대용량 전송', technique: 'T1041',
    condition: '처음 보는 목적지, 외부 주소, 또는 평소에 쓰지 않던 포트로 많은 자료가 한 번에 나가거나, 같은 목적지로 큰 전송이 반복된다.',
    evidence: 'T1041 탐지(AN0990): 민감한 자료에 접근한 뒤 드문 외부 목적지로 나가는 통신이나 비정상적인 전송량 비율을 탐지한다.',
    source: 'https://attack.mitre.org/techniques/T1041/',
  }),
  off_hours_archive_exfil: Object.freeze({
    name: '업무 시간 밖 압축 파일 반출', technique: 'T1048',
    condition: '업무(수업) 시간 밖에 자료가 외부로 나가거나, 압축 파일이 처음 보는 주소로 나간다. 둘이 함께 있거나 여러 번 반복되면 더 뚜렷하다.',
    evidence: 'T1048 탐지(AN0367)는 평소와 다른 파일 반출을 업무 시간 밖 활동이나 유난히 큰 전송량으로 탐지하고, 하위 기법 T1048.003 탐지(AN0424)는 압축 도구 실행 뒤 이어지는 외부 연결을 탐지한다.',
    source: 'https://attack.mitre.org/techniques/T1048/',
  }),
});

// ---- 기준(과제가 정한 확신도 기준 + 연습 경보를 보고 이 모듈이 정한 값, ATT&CK가 정한 값 아님) ----
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;
const CLEAR_LEVEL = 10; // 패턴에 맞고 규칙 수준이 이 이상이면 명확한 공격
const LARGE_BYTES = 50 * 1000 * 1000; // 이 이상이면 큰 전송(연습 경보: 명확한 공격 70MB~, 애매한 경보 15MB 이하)
const HUGE_BYTES = 200 * 1000 * 1000; // 이 이상이면 확신도를 더 높게 준다
const REPEAT_AT = 5; // 횟수(data.count 또는 설명의 N번)가 이 이상이면 반복으로 본다
const NORMAL_MAX_LEVEL = 4; // 패턴에 맞지 않고 수준이 이 이하이면 정상
const STRONG_CONFIDENCE = 0.95; // 패턴 둘 다, 반복, 또는 아주 큰 전송
const CLEAR_CONFIDENCE = 0.9; // 패턴 하나
const LOW_LEVEL_MATCH_CONFIDENCE = 0.7; // 패턴에 맞지만 규칙 수준이 낮음
const NEAR_CONFIDENCE = 0.6; // 전송·압축·목적지 말은 있지만 패턴에 못 미침
const UNKNOWN_CONFIDENCE = 0.5; // 신호는 없지만 규칙 수준이 낮지 않음
const NORMAL_CONFIDENCE = 0.05;

// 설명은 한국어 문장이라 문장 속 말로 신호를 잡는다. 부정·실패를 말하는 문장의 말은 신호로 세지 않는다.
const NEW_DESTINATION = /처음 보는|처음 봅니다|외부 주소|평소에 쓰지 않던 포트|명령 통로/u;
const SAME_DESTINATION_REPEAT = /같은 목적지/u;
const OFF_HOURS = /(?:수업|업무) 시간 밖|새벽|심야/u;
const ARCHIVE = /압축 파일|압축한|묶음/u;
const NEAR_WORDS = /전송|나갔|나감|압축|목적지|주소로|복사|올라갔/u;
const DENIAL = /없습니다|아닙니다|실패/u;

function pick(alert) {
  const level = alert?.rule?.level;
  // Wazuh 경보의 data 값은 숫자도 문자열("240000000")로 온다. 숫자 모양의 문자열만 숫자로 읽고, 그 밖은 null로 둔다.
  const number = (value) => {
    const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+(?:\.\d+)?$/u.test(value.trim()) ? Number(value) : Number.NaN;
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  return {
    level: Number.isInteger(level) ? level : null,
    description: typeof alert?.rule?.description === 'string' ? alert.rule.description : '',
    bytes: number(alert?.data?.bytes),
    files: number(alert?.data?.files),
    count: number(alert?.data?.count),
    timestamp: alert?.timestamp,
  };
}

// 설명에서 가장 큰 "N번" 숫자(반복 횟수)를 읽는다. "자료 200건"·"파일 3개" 같은 건수는 반복이 아니라서 세지 않는다. 없으면 null.
function readCount(text) {
  const counts = [...text.matchAll(/(\d+)\s*번/gu)].map((m) => Number(m[1]));
  return counts.length ? Math.max(...counts) : null;
}

function readSignals(row) {
  // 부정·실패를 말하는 문장을 빼고 남은 문장에서만 신호 말을 찾는다.
  const sentences = row.description.split(/(?<=[.。])\s*/u).filter((s) => s && !DENIAL.test(s));
  const said = (re) => sentences.some((s) => re.test(s));
  const repeat = [row.count, readCount(row.description)].filter((value) => value !== null);
  const repeated = repeat.length > 0 && Math.max(...repeat) >= REPEAT_AT;
  return {
    level: row.level,
    large: row.bytes !== null && row.bytes >= LARGE_BYTES,
    huge: row.bytes !== null && row.bytes >= HUGE_BYTES,
    newDestination: said(NEW_DESTINATION),
    sameDestinationRepeat: said(SAME_DESTINATION_REPEAT) && repeated,
    offHours: said(OFF_HOURS),
    archive: said(ARCHIVE),
    repeated,
    near: NEAR_WORDS.test(row.description),
  };
}

function matchPatterns(s) {
  const matched = [];
  if (s.large && (s.newDestination || s.sameDestinationRepeat || s.repeated)) matched.push('large_transfer_to_new_destination');
  if (s.large && (s.offHours || (s.archive && s.newDestination))) matched.push('off_hours_archive_exfil');
  return matched;
}

const actionFor = (confidence) => (confidence >= BLOCK_AT ? 'block' : confidence >= ALERT_AT ? 'alert' : 'record');
const oneLine = (text) => String(text).replace(/\s+/gu, ' ').trim().slice(0, 160);
const answer = (confidence, reason) => ({ action: actionFor(confidence), confidence, reason: oneLine(reason) });

export async function decide(alert) {
  const row = pick(alert);
  if (!row.timestamp && !row.description) return answer(0, '형식을 알 수 없는 경보라 기록만 남김');
  const s = readSignals(row);
  const matched = matchPatterns(s);

  // 명확: 패턴에 맞고 규칙 수준이 충분하다.
  if (matched.length) {
    const names = matched.map((id) => PATTERNS[id].name).join(' + ');
    if (s.level === null || s.level < CLEAR_LEVEL) return answer(LOW_LEVEL_MATCH_CONFIDENCE, `애매 · ${names} 패턴에 맞지만 규칙 수준이 낮음`);
    const strong = matched.length > 1 || s.repeated || s.huge;
    return answer(strong ? STRONG_CONFIDENCE : CLEAR_CONFIDENCE, `${names} 패턴에 맞음${s.repeated ? ' · 반복' : ''}${s.huge ? ' · 아주 큰 전송' : ''}`);
  }

  // 정상: 패턴에 맞지 않고 규칙 수준이 낮다.
  if (s.level === null || s.level <= NORMAL_MAX_LEVEL) return answer(NORMAL_CONFIDENCE, '정상 이벤트 · 자료 빼돌리기 패턴 신호 없음');

  // 애매: 전송·압축·목적지 말은 있지만 패턴에 못 미친다(작은 전송, 1건, 평소 목적지, 압축만, 실패 등).
  if (s.near) {
    const near = /압축/u.test(row.description) ? PATTERNS.off_hours_archive_exfil : PATTERNS.large_transfer_to_new_destination;
    return answer(NEAR_CONFIDENCE, `애매 · ${near.name}에 못 미침 · 전송량·반복 근거가 약해 alert`);
  }
  return answer(UNKNOWN_CONFIDENCE, '애매 · 패턴 신호는 없지만 규칙 수준이 낮지 않음');
}
