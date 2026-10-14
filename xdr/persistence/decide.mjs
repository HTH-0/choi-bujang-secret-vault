// 몰래 심어진 프로그램(지속성) 보너스 판단 모듈: decide(alert) 하나를 내보낸다.
// 심판은 인터넷 없이 이 파일 한 개만 불러와 경보마다 바로 답을 받는다. 그래서 이 파일은
//  - 다른 파일·패키지를 불러오지 않고, 파일을 읽거나 쓰지 않고, 네트워크·타이머를 쓰지 않고,
//  - 패턴(xdr/persistence/patterns.json과 같은 내용)을 아래 상수로 옮겨 적고, 안에서 혼자 계산해 답한다.
// 순서: 경보에서 규칙 수준·설명·실행 파일 경로(data.path)·횟수(data.count)만 읽고 →
//       패턴과 맞춰 보고 → 명확하면 block, 애매하면 alert, 정상이면 record로 답한다.
// 확신도 기준: 0.85 이상 block · 0.5 이상 alert · 그 아래 record. 반환은 { action, confidence, reason } 뿐이다.
// 실행 파일 경로는 판단에만 쓰고 reason에 옮겨 적지 않는다.

// ---- 패턴(xdr/persistence/patterns.json과 같은 내용) ----
const PATTERNS = Object.freeze({
  unsigned_new_service: Object.freeze({
    name: '서명 없는 새 서비스 등록·서비스 실행 파일 변경', technique: 'T1543.003',
    condition: '새 서비스가 등록되거나 기존 서비스의 실행 파일이 바뀌었고, 그 실행 파일이 서명되지 않았거나 임시 폴더처럼 평소와 다른 경로를 가리킨다.',
    evidence: 'T1543.003 탐지(AN1527): Windows 서비스를 만들거나 바꾸는 일과, 서명이 없거나 비정상 경로의 실행 파일로 서비스가 실행되는 것을 탐지한다.',
    source: 'https://attack.mitre.org/techniques/T1543/003/',
  }),
  unfamiliar_scheduled_task: Object.freeze({
    name: '낯선 예약 작업', technique: 'T1053.005',
    condition: '처음 보거나 이름이 임의 문자열인 예약 작업이 임시 폴더처럼 평소와 다른 경로의 프로그램을 실행한다.',
    evidence: 'T1053 탐지(AN0258): schtasks.exe 등으로 예약 작업을 만들거나 바꾼 뒤 그 작업에 묶인 평소와 다른 프로세스가 실행되는 것을 탐지한다.',
    source: 'https://attack.mitre.org/techniques/T1053/',
  }),
  startup_folder_change: Object.freeze({
    name: '시작 폴더 변경', technique: 'T1543.003',
    condition: '사용자 시작 폴더나 시작 프로그램 항목에 평소 목록에 없는 프로그램이 추가되고, 그 프로그램이 평소와 다른 경로에 있거나 다른 지속성 신호와 함께 나타난다.',
    evidence: 'T1543.003 사례: FIN7이 새 Windows 서비스를 만들고 시작 폴더(startup directories)에 넣어 지속성을 얻었다.',
    source: 'https://attack.mitre.org/techniques/T1543/003/',
    supportingEvidence: 'T1547.001: 공격자는 시작 폴더에 프로그램을 넣거나 레지스트리 실행 키로 가리켜 지속성을 얻을 수 있고, 그 프로그램은 사용자가 로그인할 때 실행된다.',
    supportingSource: 'https://attack.mitre.org/techniques/T1547/001/',
  }),
});

// ---- 기준(과제가 정한 확신도 기준 + 연습 경보를 보고 이 모듈이 정한 값, ATT&CK가 정한 값 아님) ----
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;
const CLEAR_LEVEL = 10; // 패턴에 맞고 규칙 수준이 이 이상이면 명확한 공격
const REPEAT_AT = 3; // 횟수(data.count 또는 설명의 N건)가 이 이상이면 반복으로 본다
const NORMAL_MAX_LEVEL = 4; // 패턴에 맞지 않고 수준이 이 이하이면 정상
const STRONG_CONFIDENCE = 0.95; // 패턴 둘 이상, 서명 없음 + 평소와 다른 경로, 또는 반복
const CLEAR_CONFIDENCE = 0.9; // 패턴 하나
const LOW_LEVEL_MATCH_CONFIDENCE = 0.7; // 패턴에 맞지만 규칙 수준이 낮음
const NEAR_CONFIDENCE = 0.6; // 서비스·예약 작업·시작 폴더 말은 있지만 패턴에 못 미침
const UNKNOWN_CONFIDENCE = 0.5; // 신호는 없지만 규칙 수준이 낮지 않음
const NORMAL_CONFIDENCE = 0.05;

// 설명은 한국어 문장이라 문장 속 말로 신호를 잡는다. 부정하는 문장(「서비스 등록은 없습니다」 등)의 말은 신호로 세지 않는다.
const SERVICE_CHANGE = /새 서비스|서비스 등록|서비스가 .*등록됐|서비스 실행 파일이 바뀌/u;
const TASK = /예약 작업/u;
const STARTUP = /시작 폴더|시작 프로그램|시작 항목/u;
const UNSIGNED = /서명 없는|서명이 없/u;
const UNFAMILIAR = /평소 목록에 없는|처음 보는|임의 문자열/u;
const NEAR_WORDS = /서비스|예약 작업|시작 폴더|시작 프로그램|시작 항목|임시 폴더|실행 파일|서명/u;
const DENIAL = /(?:등록은|기록은|구문은) 없습니다|아직 모릅니다|확인되지 않았/u;
// 평소와 다른 경로: 사용자 임시 폴더. 경보에서 본 모양이며 ATT&CK가 정한 폴더는 아니다.
const TEMP_PATH = /[\\/](?:AppData[\\/]Local[\\/])?Temp[\\/]/iu;

function pick(alert) {
  const level = alert?.rule?.level;
  const text = (value) => (typeof value === 'string' ? value : '');
  const count = alert?.data?.count;
  return {
    level: Number.isInteger(level) ? level : null,
    description: text(alert?.rule?.description),
    path: text(alert?.data?.path),
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
  // 부정하는 문장을 빼고 남은 문장에서만 신호 말을 찾는다.
  const sentences = row.description.split(/(?<=[.。])\s*/u).filter((s) => s && !DENIAL.test(s));
  const said = (re) => sentences.some((s) => re.test(s));
  const counts = [row.count, readCount(row.description)].filter((value) => value !== null);
  const repeat = counts.length ? Math.max(...counts) : null;
  return {
    level: row.level,
    service: said(SERVICE_CHANGE),
    task: said(TASK),
    startup: said(STARTUP),
    unsigned: said(UNSIGNED),
    unfamiliar: said(UNFAMILIAR),
    tempPath: TEMP_PATH.test(row.path) || said(/임시 폴더/u),
    near: NEAR_WORDS.test(row.description),
    repeated: repeat !== null && repeat >= REPEAT_AT,
  };
}

function matchPatterns(s) {
  const matched = [];
  if (s.service && (s.unsigned || s.tempPath || s.unfamiliar)) matched.push('unsigned_new_service');
  // 예약 작업: 평소와 다른 경로의 프로그램을 실행하고, 처음 보는·임의 이름이거나 시작 프로그램과 함께 나타난다.
  if (s.task && s.tempPath && (s.unfamiliar || s.startup)) matched.push('unfamiliar_scheduled_task');
  if (s.startup && (s.unfamiliar || s.tempPath || s.task)) matched.push('startup_folder_change');
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
    const strong = matched.length > 1 || (s.unsigned && s.tempPath) || s.repeated;
    return answer(strong ? STRONG_CONFIDENCE : CLEAR_CONFIDENCE, `${names} 패턴에 맞음${s.repeated ? ' · 반복' : ''}`);
  }

  // 정상: 패턴에 맞지 않고 규칙 수준이 낮다(정상 경보에도 서비스·예약 같은 말은 나오므로 말만으로 올리지 않는다).
  if (s.level === null || s.level <= NORMAL_MAX_LEVEL) return answer(NORMAL_CONFIDENCE, '정상 이벤트 · 지속성 패턴 신호 없음');

  // 애매: 서비스·예약 작업·시작 폴더 말은 있지만 패턴에 못 미친다(수업 폴더, 서명 모름, 설명만 변경, 등록 없음 등).
  if (s.near) {
    const near = s.task ? PATTERNS.unfamiliar_scheduled_task : s.startup ? PATTERNS.startup_folder_change : PATTERNS.unsigned_new_service;
    return answer(NEAR_CONFIDENCE, `애매 · ${near.name}에 못 미침 · 근거가 약해 alert`);
  }
  return answer(UNKNOWN_CONFIDENCE, '애매 · 패턴 신호는 없지만 규칙 수준이 낮지 않음');
}
