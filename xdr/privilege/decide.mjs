// 권한 가로채기(권한 상승) 보너스 판단 모듈: decide(alert) 하나를 내보낸다.
// 심판은 인터넷 없이 이 파일 한 개만 불러와 경보마다 바로 답을 받는다. 그래서 이 파일은
//  - 다른 파일·패키지를 불러오지 않고, 파일을 읽거나 쓰지 않고, 네트워크·타이머를 쓰지 않고,
//  - 패턴(xdr/privilege/patterns.json과 같은 내용)을 아래 상수로 옮겨 적고, 안에서 혼자 계산해 답한다.
// 순서: 경보에서 규칙 수준·설명·그룹 이름(data.group)·횟수(data.count)만 읽고 →
//       패턴과 맞춰 보고 → 명확하면 block, 애매하면 alert, 정상이면 record로 답한다.
// 확신도 기준: 0.85 이상 block · 0.5 이상 alert · 그 아래 record. 반환은 { action, confidence, reason } 뿐이다.
// 계정 이름과 그룹 이름은 판단에만 쓰고 reason에 옮겨 적지 않는다.

// ---- 패턴(xdr/privilege/patterns.json과 같은 내용) ----
const PATTERNS = Object.freeze({
  admin_group_addition: Object.freeze({
    name: '관리자 그룹 추가', technique: 'T1098.007',
    condition: '평범한 계정이 관리자(Administrators) 그룹에 추가된다. 원격 주소에서 추가되거나, 한 주소에서 여러 계정이 추가되거나, 빠졌던 계정이 곧바로 다시 추가되면 더 뚜렷하다.',
    evidence: 'T1098.007 탐지(AN0865): Administrators 같은 권한 있는 로컬·도메인 그룹에 사용자나 기기 계정을 무단으로 추가하는 일을 탐지한다.',
    source: 'https://attack.mitre.org/techniques/T1098/007/',
  }),
  unfamiliar_admin_command: Object.freeze({
    name: '처음 보는 관리자 명령·권한 전환', technique: 'T1078',
    condition: '처음 보는 주소, 방금 권한을 얻은 평범한 계정, 또는 다른 계정의 권한으로 관리자 명령이 실행되거나 세션 권한이 관리자로 바뀐다.',
    evidence: 'T1078 탐지(AN1543): 정상 계정의 오용을 비정상 로그온 패턴, 평소와 다른 위치·시간의 활동으로 탐지한다.',
    source: 'https://attack.mitre.org/techniques/T1078/',
  }),
  off_hours_privilege_use: Object.freeze({
    name: '업무 시간 밖 권한 사용', technique: 'T1078.003',
    condition: '업무(수업) 시간 밖이라고 드러난 때에 관리자 권한을 쓰거나 관리자 명령을 실행한다.',
    evidence: 'T1078.003 탐지(AN1137): 로컬 계정을 평소와 다르게 쓰는 로그인, 특히 업무 시간 밖의 사용을 탐지한다.',
    source: 'https://attack.mitre.org/techniques/T1078/003/',
  }),
});

// ---- 기준(과제가 정한 확신도 기준 + 연습 경보를 보고 이 모듈이 정한 값, ATT&CK가 정한 값 아님) ----
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;
const CLEAR_LEVEL = 10; // 패턴에 맞고 규칙 수준이 이 이상이면 명확한 공격
const REPEAT_AT = 2; // 횟수(data.count 또는 설명의 계정 N개·N건)가 이 이상이면 여러 번으로 본다
const NORMAL_MAX_LEVEL = 4; // 패턴에 맞지 않고 수준이 이 이하이면 정상
const STRONG_CONFIDENCE = 0.95; // 패턴 둘 이상, 또는 원격 주소·여러 계정·다시 추가
const CLEAR_CONFIDENCE = 0.9; // 패턴 하나
const LOW_LEVEL_MATCH_CONFIDENCE = 0.7; // 패턴에 맞지만 규칙 수준이 낮음
const NEAR_CONFIDENCE = 0.6; // 권한·관리자·그룹 말은 있지만 패턴에 못 미침
const UNKNOWN_CONFIDENCE = 0.5; // 신호는 없지만 규칙 수준이 낮지 않음
const NORMAL_CONFIDENCE = 0.05;

// 설명은 한국어 문장이라 문장 속 말로 신호를 잡는다. 부정·취소·실패를 말하는 문장의 말은 신호로 세지 않는다.
const ADMIN_GROUP_ADD = /관리자 그룹에 (?:추가|들어)|관리자 그룹 추가|다시 관리자로 들어/u;
const ADMIN_GROUP_NAME = /^(?:administrators?|admins?|domain admins|enterprise admins|sudo|sudoers|wheel)$/iu;
const ADMIN_COMMAND = /관리자 명령|권한 명령|관리자 권한으로 바뀌|다른 계정의 권한으로/u;
const UNFAMILIAR = /처음 보는|처음 봅니다|방금 관리자가 된|곧바로|다른 계정의 권한|관리자 권한으로 바뀌/u;
const OFF_HOURS = /(?:수업|업무) 시간 밖|업무처럼 보이지 않는 시각|새벽|심야/u;
const PRIVILEGE_USE = /명령|권한/u;
const STRONG_SIGN = /원격 주소|계정 \d+\s*개|다시/u;
const NEAR_WORDS = /관리자|권한|그룹|명령/u;
const DENIAL = /아닙니다|없습니다|취소|실패/u;

function pick(alert) {
  const level = alert?.rule?.level;
  const text = (value) => (typeof value === 'string' ? value : '');
  const count = alert?.data?.count;
  return {
    level: Number.isInteger(level) ? level : null,
    description: text(alert?.rule?.description),
    group: text(alert?.data?.group),
    count: Number.isInteger(count) && count >= 0 ? count : null,
    timestamp: alert?.timestamp,
  };
}

// 설명에서 가장 큰 "N개/N건/N번" 숫자를 읽는다. 없으면 null.
function readCount(text) {
  const counts = [...text.matchAll(/(\d+)\s*(?:개|건|번)/gu)].map((m) => Number(m[1]));
  return counts.length ? Math.max(...counts) : null;
}

function readSignals(row) {
  // 부정·취소·실패를 말하는 문장을 빼고 남은 문장에서만 신호 말을 찾는다.
  const sentences = row.description.split(/(?<=[.。])\s*/u).filter((s) => s && !DENIAL.test(s));
  const said = (re) => sentences.some((s) => re.test(s));
  const counts = [row.count, readCount(row.description)].filter((value) => value !== null);
  const many = counts.length ? Math.max(...counts) : null;
  // 그룹 이름이 있으면 관리자 그룹일 때만 그룹 추가로 본다. 이름이 없으면 설명만 본다.
  const adminGroup = row.group ? ADMIN_GROUP_NAME.test(row.group) : true;
  return {
    level: row.level,
    groupAdd: said(ADMIN_GROUP_ADD) && adminGroup,
    command: said(ADMIN_COMMAND),
    unfamiliar: said(UNFAMILIAR),
    offHours: said(OFF_HOURS),
    privilegeUse: said(PRIVILEGE_USE),
    strong: said(STRONG_SIGN) || (many !== null && many >= REPEAT_AT),
    near: NEAR_WORDS.test(row.description),
  };
}

function matchPatterns(s) {
  const matched = [];
  if (s.groupAdd) matched.push('admin_group_addition');
  if (s.command && s.unfamiliar) matched.push('unfamiliar_admin_command');
  if (s.offHours && s.privilegeUse) matched.push('off_hours_privilege_use');
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
    const strong = matched.length > 1 || s.strong;
    return answer(strong ? STRONG_CONFIDENCE : CLEAR_CONFIDENCE, `${names} 패턴에 맞음${s.strong ? ' · 원격·여러 계정·반복' : ''}`);
  }

  // 정상: 패턴에 맞지 않고 규칙 수준이 낮다(정상 경보에도 관리 계정·그룹 같은 말은 나오므로 말만으로 올리지 않는다).
  if (s.level === null || s.level <= NORMAL_MAX_LEVEL) return answer(NORMAL_CONFIDENCE, '정상 이벤트 · 권한 가로채기 패턴 신호 없음');

  // 애매: 권한·관리자·그룹 말은 있지만 패턴에 못 미친다(취소된 상승, 관리자 아닌 그룹, 평소 주소의 명령 1건 등).
  if (s.near) {
    const near = /그룹/u.test(row.description) ? PATTERNS.admin_group_addition : PATTERNS.unfamiliar_admin_command;
    return answer(NEAR_CONFIDENCE, `애매 · ${near.name}에 못 미침 · 근거가 약해 alert`);
  }
  return answer(UNKNOWN_CONFIDENCE, '애매 · 패턴 신호는 없지만 규칙 수준이 낮지 않음');
}
