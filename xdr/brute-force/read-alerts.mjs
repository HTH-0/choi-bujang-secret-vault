// 무차별 로그인 공격 보너스: Wazuh 모양 경보(xdr/fixtures/brute-force.json)를 읽어
// 시각·출발 주소·계정·규칙 수준·설명만 한 경보당 한 줄로 뽑는 읽기 전용 모듈입니다.
// 원본 경보는 읽기만 하고 고치지 않습니다. 다른 필드(agent, mitre, data.accounts, count 등)는 뽑지 않습니다.
// 비밀값처럼 보이는 값(토큰·키·비밀번호 대입 등)은 출력하지 않고 [가림]으로 바꿉니다.
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_KEY = 'brute-force';
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

// 문자열 안의 비밀값처럼 보이는 부분을 가린다. 가린 횟수도 함께 돌려준다(값은 돌려주지 않는다).
export function maskSecrets(value) {
  if (typeof value !== 'string') return { text: value ?? null, masked: 0 };
  let text = value;
  let masked = 0;
  for (const pattern of SECRET_LIKE) {
    text = text.replace(pattern, () => { masked += 1; return MASK; });
  }
  return { text, masked };
}

const clean = (value, tally) => {
  const { text, masked } = maskSecrets(value);
  tally.masked += masked;
  return text;
};

// 경보 한 건에서 다섯 값만 뽑는다. 값이 없으면 null로 두어 줄 수가 경보 수와 같게 유지한다.
export function extractRow(alert, tally = { masked: 0 }) {
  const level = alert?.rule?.level;
  return {
    timestamp: clean(alert?.timestamp, tally),
    srcip: clean(alert?.data?.srcip, tally),
    srcuser: clean(alert?.data?.srcuser, tally),
    level: Number.isInteger(level) ? level : null,
    description: clean(alert?.rule?.description, tally),
  };
}

export function formatRow(row) {
  const cell = (value) => (value === null || value === undefined || value === '' ? '-' : String(value));
  return [row.timestamp, row.srcip, row.srcuser, row.level, row.description].map(cell).join(' | ');
}

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// root는 저장소 루트, fixturePath는 시험용으로 다른 경보 파일을 읽을 때만 쓴다.
export async function readAlerts({ root = defaultRoot, fixturePath } = {}) {
  const path = fixturePath ?? join(root, 'xdr', 'fixtures', `${MODULE_KEY}.json`);
  const fixture = JSON.parse(await readFile(path, 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1' || fixture.moduleKey !== MODULE_KEY || !Array.isArray(fixture.alerts)) {
    throw new Error('brute-force 경보 묶음 형식이 아닙니다.');
  }
  const tally = { masked: 0 };
  const rows = fixture.alerts.map((alert) => extractRow(alert, tally));
  return { alertCount: fixture.alerts.length, rows, maskedCount: tally.masked };
}

// 직접 실행하면 한 줄씩 출력하고 경보 건수와 뽑은 줄 수가 같은지 알려 준다.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { alertCount, rows, maskedCount } = await readAlerts();
    if (process.argv.includes('--json')) {
      process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    } else {
      process.stdout.write('시각 | 출발 주소 | 계정 | 규칙 수준 | 설명\n');
      for (const row of rows) process.stdout.write(`${formatRow(row)}\n`);
    }
    const same = alertCount === rows.length;
    process.stderr.write(`경보 ${alertCount}건 · 뽑은 줄 ${rows.length}줄 · ${same ? '일치' : '불일치'}`
      + `${maskedCount ? ` · 비밀값처럼 보여 가린 값 ${maskedCount}개` : ''}\n`);
    if (!same) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`경보 읽기 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  }
}
