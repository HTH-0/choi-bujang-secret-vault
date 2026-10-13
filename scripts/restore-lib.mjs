// 10단계: 검증한 안전 정책 사본과 현재 정책을 비교하고, 지정한 서비스만 사본 버전으로 되돌리는 공통 함수입니다.
// 서명 키나 인증서를 만들지 않습니다. 사본은 Git 커밋과 SHA-256으로 검증합니다(저장소를 고칠 수 있는 공격자가
// 사본과 기록을 함께 바꾸면 막지 못합니다). 감사 기록(xdr/alerts.log)과 Git 이력은 어느 서비스에도 넣지 않습니다.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const root = resolve(import.meta.dirname, '..');
export const SNAPSHOT_PATH = 'restore/safe-policy.json';
export const SCHEMA = 'aleph.policy.snapshot.v1';
export const AUDIT_LOG = 'xdr/alerts.log';

// 서비스별 정책 파일. 서비스 하나를 되돌릴 때 이 목록의 파일만 바뀝니다.
export const SERVICES = Object.freeze({
  notes: Object.freeze(['src/decider.mjs']),
  detect: Object.freeze(['src/detect.mjs']),
  'xdr-brute-force': Object.freeze(['xdr/brute-force/decide.mjs', 'xdr/brute-force/patterns.json']),
  'xdr-web-injection': Object.freeze(['xdr/web-injection/decide.mjs', 'xdr/web-injection/patterns.json']),
});

const gitText = (...args) => execFileSync('git', ['-C', root, ...args], {
  encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 15000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
}).trim();
const gitBuffer = (...args) => execFileSync('git', ['-C', root, ...args], {
  maxBuffer: 16 * 1024 * 1024, timeout: 15000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
});
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
// 줄바꿈(CRLF/LF) 차이로 해시가 달라지지 않게 맞춘다.
const normalize = (buffer) => buffer.toString('utf8').replace(/\r\n/gu, '\n');

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function parseRuleIds(text) {
  const match = typeof text === 'string' && /export const RULE_IDS = Object\.freeze\(\[([^\]]*)\]\)/u.exec(text);
  return match ? [...match[1].matchAll(/'([^']+)'/gu)].map((item) => item[1]) : null;
}
function parseRoutes(text) {
  try {
    const routes = JSON.parse(text).allowedRoutes;
    return Array.isArray(routes) && routes.every((item) => typeof item === 'string') ? routes : null;
  } catch { return null; }
}

function policyFrom(readText) {
  const services = {};
  for (const [name, files] of Object.entries(SERVICES)) {
    const entry = { files: {} };
    for (const file of files) {
      const text = readText(file);
      entry.files[file] = text === null ? null : sha256(text);
    }
    if (name === 'notes') {
      entry.ruleIds = parseRuleIds(readText('src/decider.mjs'));
      entry.allowedRoutes = parseRoutes(readText('aleph.config.json'));
    }
    services[name] = entry;
  }
  return services;
}

export const policyAtCommit = (commit) => policyFrom((path) => {
  try { return normalize(gitBuffer('show', `${commit}:${path}`)); } catch { return null; }
});
export const policyNow = () => policyFrom((path) => {
  const file = resolve(root, path);
  return existsSync(file) ? normalize(readFileSync(file)) : null;
});
export const digestOf = (commit, services) => sha256(canonical({ commit, services }));

export function commitInfo(commit) {
  const [short, date, subject] = gitText('show', '-s', '--format=%h%n%ci%n%s', commit).split('\n');
  return { short, date: date.slice(0, 16), subject };
}
export function resolveCommit(argument) {
  if (typeof argument !== 'string' || !/^[0-9a-f]{7,40}$/u.test(argument)) throw new Error('커밋 번호 형식이 맞지 않습니다');
  try { return gitText('rev-parse', '--verify', `${argument}^{commit}`); } catch { throw new Error('그런 커밋을 찾을 수 없습니다'); }
}
export function isAncestorOfHead(commit) {
  try { execFileSync('git', ['-C', root, 'merge-base', '--is-ancestor', commit, 'HEAD'], { windowsHide: true, timeout: 15000, stdio: 'ignore' }); return true; } catch { return false; }
}

// 사본 검증. 하나라도 틀리면 { ok: false, reason }이며, 호출한 쪽은 차이를 보여 주지 않고 중단해야 한다.
export function verifySnapshot() {
  const file = resolve(root, SNAPSHOT_PATH);
  if (!existsSync(file)) return { ok: false, reason: `안전 정책 사본이 없습니다 (${SNAPSHOT_PATH})` };
  let snapshot;
  try { snapshot = JSON.parse(readFileSync(file, 'utf8')); } catch { return { ok: false, reason: '사본을 읽을 수 없습니다 (JSON 형식 오류)' }; }
  const keysOk = snapshot !== null && typeof snapshot === 'object' && !Array.isArray(snapshot)
    && Object.keys(snapshot).sort().join() === 'commit,schema,services,sha256';
  if (!keysOk || snapshot.schema !== SCHEMA || !/^[0-9a-f]{40}$/u.test(snapshot.commit)
      || snapshot.services === null || typeof snapshot.services !== 'object'
      || Object.keys(snapshot.services).sort().join() !== Object.keys(SERVICES).sort().join()
      || !/^[0-9a-f]{64}$/u.test(snapshot.sha256)) {
    return { ok: false, reason: '사본 형식이 맞지 않습니다' };
  }
  if (digestOf(snapshot.commit, snapshot.services) !== snapshot.sha256) {
    return { ok: false, reason: '사본의 SHA-256이 맞지 않습니다 (변조 또는 손상)' };
  }
  try { gitText('cat-file', '-e', `${snapshot.commit}^{commit}`); } catch {
    return { ok: false, reason: '사본이 가리키는 커밋을 이 저장소에서 찾을 수 없습니다' };
  }
  if (!isAncestorOfHead(snapshot.commit)) return { ok: false, reason: '사본의 커밋이 현재 기록(HEAD)의 조상이 아닙니다' };
  if (canonical(policyAtCommit(snapshot.commit)) !== canonical(snapshot.services)) {
    return { ok: false, reason: '그 커밋에서 다시 계산한 정책이 사본과 다릅니다' };
  }
  return { ok: true, snapshot, info: commitInfo(snapshot.commit) };
}

const same = (a, b) => canonical(a) === canonical(b);
const listDiff = (now, safe) => ({
  removed: (now ?? []).filter((item) => !(safe ?? []).includes(item)),
  restored: (safe ?? []).filter((item) => !(now ?? []).includes(item)),
});

// 서비스별로 복원하면 달라지는 항목을 계산한다.
export function diffService(name, snapshot, now = policyNow()) {
  const safe = snapshot.services[name];
  const current = now[name];
  const files = Object.keys(safe.files).map((path) => ({
    path, safeHash: safe.files[path], nowHash: current.files[path],
    state: current.files[path] === null ? 'missing' : current.files[path] === safe.files[path] ? 'same' : 'changed',
  }));
  const out = { name, files, rules: null, routes: null };
  if (name === 'notes') {
    out.rules = listDiff(current.ruleIds, safe.ruleIds);
    out.routes = listDiff(current.allowedRoutes, safe.allowedRoutes);
    out.rulesUnreadable = current.ruleIds === null || safe.ruleIds === null;
    out.routesUnreadable = current.allowedRoutes === null || safe.allowedRoutes === null;
  }
  out.changed = files.some((item) => item.state !== 'same')
    || (out.rules && (out.rules.removed.length || out.rules.restored.length))
    || (out.routes && (out.routes.removed.length || out.routes.restored.length)) || false;
  return out;
}

export function describeService(item) {
  const lines = [`  [${item.name}] ${item.changed ? '변경 있음' : '변경 없음'}`];
  for (const file of item.files) {
    if (file.state === 'same') lines.push(`    파일 ${file.path}: 사본과 같음`);
    else if (file.state === 'missing') lines.push(`    파일 ${file.path}: 현재 없음 -> 사본 버전으로 다시 생김`);
    else lines.push(`    파일 ${file.path}: 내용이 사본과 다름 (현재 ${file.nowHash.slice(0, 8)} -> 사본 ${file.safeHash.slice(0, 8)})`);
  }
  if (item.rules) {
    if (item.rulesUnreadable) lines.push('    규칙 이름: 읽지 못해 비교하지 못함');
    for (const rule of item.rules.removed) lines.push(`    규칙 제거: ${rule} (사본에 없음)`);
    for (const rule of item.rules.restored) lines.push(`    규칙 복원: ${rule} (현재 없음)`);
    if (item.routesUnreadable) lines.push('    허용 경로: 읽지 못해 비교하지 못함');
    for (const route of item.routes.removed) lines.push(`    허용 경로 제거: ${route} (사본에 없음)`);
    for (const route of item.routes.restored) lines.push(`    허용 경로 복원: ${route} (현재 없음)`);
  }
  return lines;
}

export function describeHeader(verified) {
  const head = commitInfo('HEAD');
  const dirty = Object.entries(diffAgainst('HEAD')).filter(([, changed]) => changed).map(([name]) => name);
  return [
    `복원할 버전: ${verified.info.short} (${verified.info.date}) ${verified.info.subject}`,
    '사본 검증: 통과 (형식, SHA-256, 커밋이 현재 기록의 조상, 그 커밋에서 다시 계산한 값 일치)',
    `현재 버전: HEAD ${head.short}${dirty.length ? ` · 커밋되지 않은 정책 변경이 있는 서비스: ${dirty.join(', ')}` : ' · 정책 파일에 커밋되지 않은 변경 없음'}`,
  ];
}
function diffAgainst(commit) {
  const base = policyAtCommit(commit); const now = policyNow();
  return Object.fromEntries(Object.keys(SERVICES).map((name) => [name, !same(base[name], now[name])]));
}

export const confirmPhrase = (service, info) => `restore-${service}-${info.short}`;

// 서비스 하나를 사본 버전으로 되돌린다. 먼저 모든 검사를 하고 나서 대상 서비스 파일만 쓴다.
export function applyService(name, snapshot) {
  const before = policyNow();
  const plan = [];
  for (const file of SERVICES[name]) {
    const safeText = normalize(gitBuffer('show', `${snapshot.commit}:${file}`));
    if (sha256(safeText) !== snapshot.services[name].files[file]) throw new Error(`${file}: 사본의 해시와 커밋의 파일이 다릅니다`);
    plan.push({ path: file, text: safeText });
  }
  let configText = null;
  if (name === 'notes') {
    const safeRoutes = snapshot.services.notes.allowedRoutes;
    if (!Array.isArray(safeRoutes)) throw new Error('사본의 허용 경로를 읽을 수 없습니다');
    const raw = readFileSync(resolve(root, 'aleph.config.json'), 'utf8');
    const pattern = /"allowedRoutes":\s*\[[^\]]*\]/gu;
    if ((raw.match(pattern) ?? []).length !== 1) throw new Error('aleph.config.json에서 allowedRoutes 줄을 한 곳으로 찾지 못했습니다');
    configText = raw.replace(pattern, `"allowedRoutes": [${safeRoutes.map((route) => JSON.stringify(route)).join(', ')}]`);
  }
  const writeLike = (path, text) => {
    const file = resolve(root, path);
    const crlf = existsSync(file) && readFileSync(file, 'utf8').includes('\r\n');
    writeFileSync(file, crlf ? text.replace(/\n/gu, '\r\n') : text, 'utf8');
  };
  for (const item of plan) writeLike(item.path, item.text);
  if (configText !== null) writeFileSync(resolve(root, 'aleph.config.json'), configText, 'utf8');
  const after = policyNow();
  if (!same(after[name], snapshot.services[name])) throw new Error('되돌린 뒤 값이 사본과 다릅니다');
  for (const other of Object.keys(SERVICES).filter((item) => item !== name)) {
    if (!same(after[other], before[other])) throw new Error(`다른 서비스(${other})가 바뀌었습니다`);
  }
  return plan.map((item) => item.path).concat(configText !== null ? ['aleph.config.json (allowedRoutes 줄만)'] : []);
}
