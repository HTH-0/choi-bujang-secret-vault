// 무차별 로그인 공격 보너스 판단 모듈: decide(alert) 하나를 내보낸다.
// 1) read-alerts.mjs로 경보에서 다섯 값만 뽑고(비밀값처럼 보이는 값은 가려짐)
// 2) patterns.json의 패턴과 맞춰 보고
// 3) 명확하면 block, 정상이면 record, 애매한 것만 Jev(TypeSafe)에게 물어 확신도(0~1)를 받아 정한다.
//    0.85 이상 block · 0.5 이상 alert · 그 아래 record. Jev가 응답하지 않으면(키 없음·네트워크 없음·오류·지연) alert로 떨어진다.
// 반환은 { action, confidence, reason } 뿐이다. 원본 경보는 고치지 않는다.
import { readFile } from 'node:fs/promises';
import { extractRow } from './read-alerts.mjs';

// 확신도 기준(과제가 정한 값)
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;
// 아래 숫자는 ATT&CK가 정한 값이 아니라, 연습 경보를 보고 이 모듈이 정한 기준이다(patterns.json의 caveat 참고).
const CLEAR_FAILURES = 30; // 이만큼 실패가 쌓이면 시간 창이 없어도 명확한 연속 실패로 본다.
const BURST_FAILURES = 10; // 짧은 시간 안이라면 이만큼부터 명확하다.
const SHORT_MINUTES = 5; // 이 시간 안이면 짧은 시간으로 본다.
const MANY_ACCOUNTS = 10; // 한 주소가 이만큼 계정에 실패를 넣으면 여러 계정 대입으로 본다.
const ATTACK_CONFIDENCE = 0.95; // 명확한 공격(규칙 수준 10 이상)
const WEAK_ATTACK_CONFIDENCE = 0.9; // 명확하지만 규칙 수준이 그보다 낮음
const NORMAL_CONFIDENCE = 0.05; // 정상 이벤트
const ASK_TIMEOUT_MS = 3000;

// Jev(TypeSafe)에게 "이 경보가 실제 무차별 로그인 공격이냐"를 Noul(예/아니오) 질문으로 묻는다.
// 문서: https://docs.typesafe.ai (api.md, primitives/noul.md). 응답의 noul은 0~1이고 1에 가까울수록 "예"다.
// 키는 환경변수 TYPESAFE_API_KEY에서만 읽고, 코드·로그·반환값에 넣지 않는다. 키가 없으면 호출하지 않는다.
const JEV_URL = 'https://api.typesafe.ai/v1/systemone';
const JEV_MODEL = 'jev-latest';
const JEV_QUESTION = 'is_brute_force';
const JEV_INSTRUCTIONS = 'Is this login alert part of a real brute-force attack (repeated failed logins in a short time from one source, '
  + 'password spraying across many accounts, or rotating usernames)? Answer high only for an attack.';
const JEV_CRITERIA = {
  true: 'Many failed logins accumulate quickly from one source, or the same attempt is repeated across many accounts.',
  false: 'A few failed logins by an ordinary user (typo, password change, lockout retry), or a normal event such as a successful login.',
};

async function askJev(payload, timeoutMs) {
  const key = process.env.TYPESAFE_API_KEY;
  if (typeof key !== 'string' || !key.trim()) return null;
  const response = await fetch(JEV_URL, {
    method: 'POST',
    redirect: 'error',
    headers: { Authorization: `Bearer ${key.trim()}`, 'Content-Type': 'application/json' },
    // 보내는 것은 뽑은 다섯 값(비밀값은 가려짐)과 가까운 패턴 이름뿐이다. 원본 경보 전체는 보내지 않는다.
    body: JSON.stringify({
      state: {
        timestamp: payload.row.timestamp, source_ip: payload.row.srcip, account: payload.row.srcuser,
        rule_level: payload.row.level, description: payload.row.description, nearest_pattern: payload.nearPattern,
      },
      model: JEV_MODEL,
      questions: { [JEV_QUESTION]: { type: 'noul', instructions: JEV_INSTRUCTIONS, criteria: JEV_CRITERIA } },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) return null;
  const body = await response.json();
  const answer = body?.answers?.[JEV_QUESTION];
  return answer?.type === 'noul' ? answer.noul : null;
}

const action = (confidence) => (confidence >= BLOCK_AT ? 'block' : confidence >= ALERT_AT ? 'alert' : 'record');

let patternNames;
async function loadPatternNames() {
  if (patternNames) return patternNames;
  patternNames = {};
  try {
    const file = JSON.parse(await readFile(new URL('./patterns.json', import.meta.url), 'utf8'));
    for (const pattern of file.patterns ?? []) patternNames[pattern.id] = pattern.name;
  } catch { /* 읽지 못하면 아래에서 패턴 id를 그대로 쓴다 */ }
  return patternNames;
}

const number = (text, pattern) => {
  const found = pattern.exec(text);
  return found ? Number(found[1]) : null;
};

// 설명에서 신호를 읽는다. 값이 없으면 null/false로 둔다.
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

function classify(row, s) {
  if (!s.hasFailure && (s.level === null || s.level <= 4)) return { kind: 'normal' };
  if (s.hasFailure && s.failures !== null && s.failures <= 1 && s.level !== null && s.level <= 3) return { kind: 'normal' };
  const matched = matchPatterns(s);
  // 패턴에는 맞지만 규칙 수준이 너무 낮으면 근거가 엇갈리므로 애매한 것으로 둔다.
  if (matched.length && s.level !== null && s.level >= 5) return { kind: 'clear', matched };
  return { kind: 'ambiguous', matched };
}

// 바깥에서 확신도를 받는다. 함수가 없거나, 늦거나, 오류가 나거나, 0~1 숫자가 아니면 null(= 응답 없음).
async function askConfidence(ask, payload, timeoutMs) {
  if (typeof ask !== 'function') return null;
  let timer;
  try {
    const answer = await Promise.race([
      Promise.resolve().then(() => ask(payload)),
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); }),
    ]);
    return typeof answer === 'number' && Number.isFinite(answer) && answer >= 0 && answer <= 1 ? answer : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const oneLine = (text) => String(text).replace(/\s+/gu, ' ').trim().slice(0, 140);

// options.askConfidence(payload) → 0~1 숫자를 돌려주는 함수(선택). 넘기지 않으면 애매한 경보는 alert가 된다.
// payload에는 뽑은 다섯 값과 가까운 패턴 이름만 담는다. 원본 경보 전체나 비밀값은 보내지 않는다.
export async function decide(alert, options = {}) {
  const row = extractRow(alert);
  if (!row.timestamp && !row.description) {
    return { action: 'record', confidence: 0, reason: '형식을 알 수 없는 경보라 기록만 남김' };
  }
  const names = await loadPatternNames();
  const nameOf = (id) => names[id] ?? id;
  const s = readSignals(row);
  const verdict = classify(row, s);

  if (verdict.kind === 'normal') {
    return { action: 'record', confidence: NORMAL_CONFIDENCE, reason: oneLine('정상 이벤트 · 로그인 실패 신호가 약함') };
  }
  if (verdict.kind === 'clear') {
    const confidence = s.level >= 10 ? ATTACK_CONFIDENCE : WEAK_ATTACK_CONFIDENCE;
    const id = verdict.matched[0];
    return { action: action(confidence), confidence, reason: oneLine(`${nameOf(id)} 패턴에 맞음${s.failures !== null ? ` · 실패 ${s.failures}건` : ''}`) };
  }

  // 애매한 경보: 가까운 패턴 이름을 정하고, 바깥에서 확신도를 받는다.
  const near = s.hasFailure && s.success ? 'many_failures_then_success' : s.rotating ? 'rotating_usernames_burst' : 'same_source_failure_burst';
  const hint = `${nameOf(near)}에 못 미침${s.failures !== null ? `(실패 ${s.failures}건)` : ''}`;
  const timeoutMs = options.timeoutMs ?? ASK_TIMEOUT_MS;
  // 시험에서는 options.askConfidence로 바꿔 끼울 수 있다. 넘기지 않으면 Jev에게 묻고, 키가 없으면 응답 없음이 된다.
  const ask = options.askConfidence ?? ((payload) => askJev(payload, timeoutMs));
  const asked = await askConfidence(ask, { row, nearPattern: near }, timeoutMs);
  if (asked === null) {
    return { action: 'alert', confidence: ALERT_AT, reason: oneLine(`애매 · ${hint} · 확신도 응답 없음`) };
  }
  return { action: action(asked), confidence: asked, reason: oneLine(`애매 · ${hint} · 받은 확신도 ${asked}`) };
}
