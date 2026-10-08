// 무차별 로그인 공격 보너스 연결(이 파일 하나가 맡는다):
//  1) 경보를 decide.mjs에 흘려 판단 결과를 받고,
//  2) 결과 가운데 차단 후보(block)만 ZTNA 판정기의 거부 규칙으로 xdr/block-rules.json에 넣고(만료 시각·근거 경보 번호 포함),
//  3) block·alert 알림을 xdr/alerts.log에 한 줄씩 쌓는다.
// decide.mjs는 판단 결과만 돌려주고 파일 쓰기·판정기 연결은 하지 않는다. 원본 경보는 고치지 않는다.
// 판정기(src/decider.mjs)는 이 규칙 파일을 읽어 요청의 subjectId·at(요청 계약에 있는 값)으로만 거부 여부를 정한다.
// 요청 계약에는 출발 주소가 없어서, 주소가 어느 subjectId인지는 운영 쪽이 주는 대응표 xdr/subject-map.json으로 받는다.
//   { "schema": "aleph.xdr.subject-map.v1", "entries": [ { "sourceIp": "203.0.113.10", "subjectId": "..." } ] }
// 대응표가 없으면 규칙은 만들어져도 판정기가 적용할 대상이 없으므로 알림에 "연결 대기"로 남긴다.
//   node xdr/brute-force/respond.mjs [--ttl=60] [--now=2026-10-07T12:00:00Z]
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from './decide.mjs';
import { extractRow } from './read-alerts.mjs';

export const RULE_ID = 'xdr_bruteforce_block';
export const REASON_CODE = 'xdr_brute_force_block';
const BLOCK_AT = 0.85;
const DEFAULT_TTL_MINUTES = 60;
const MAX_TTL_MINUTES = 24 * 60;
const RULES_SCHEMA = 'aleph.xdr.block-rules.v1';
const MAP_SCHEMA = 'aleph.xdr.subject-map.v1';
const SUBJECT = /^[A-Za-z0-9_.:-]{1,128}$/u;
const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4 = new RegExp(`^${OCTET}\\.${OCTET}\\.${OCTET}\\.${OCTET}$`, 'u');
const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// 정상 사용자를 막지 않으려고 "바깥의 한 주소"만 규칙으로 만든다. 대역·와일드카드·IPv6·내부·루프백 주소는 거절한다.
function isBlockableIp(value) {
  if (typeof value !== 'string' || !IPV4.test(value)) return false;
  const [a, b] = value.split('.').map(Number);
  if (a === 0 || a === 127 || a === 10 || a >= 224) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  return true;
}

function clampTtl(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_TTL_MINUTES;
  return Math.min(Math.max(Math.floor(value), 1), MAX_TTL_MINUTES);
}

const toMs = (value) => (typeof value === 'number' ? value : value instanceof Date ? value.getTime() : Date.parse(value));
const iso = (ms) => new Date(ms).toISOString();
const isActive = (rule, now) => {
  const at = toMs(now);
  const created = Date.parse(rule?.createdAt);
  const expires = Date.parse(rule?.expiresAt);
  return Number.isFinite(at) && Number.isFinite(created) && Number.isFinite(expires) && created <= at && at < expires;
};
// 로그 한 줄에는 줄바꿈과 구분자(|)를 넣지 않는다.
const field = (value) => String(value ?? '-').replace(/[\r\n|]+/gu, ' ').replace(/\s+/gu, ' ').trim() || '-';

async function readJson(path, warn, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') warn(`${label}을(를) 읽지 못해 없는 것으로 봅니다.`);
    return null;
  }
}

// 주소 → 주체 대응표. 형식이 틀린 항목은 버린다.
function readSubjectMap(file) {
  const map = new Map();
  if (file?.schema !== MAP_SCHEMA || !Array.isArray(file.entries)) return map;
  for (const entry of file.entries) {
    if (isBlockableIp(entry?.sourceIp) && typeof entry.subjectId === 'string' && SUBJECT.test(entry.subjectId)) {
      if (!map.has(entry.sourceIp)) map.set(entry.sourceIp, new Set());
      map.get(entry.sourceIp).add(entry.subjectId);
    }
  }
  return map;
}

// items: [{ alertId, srcip, srcuser, action, confidence, reason }]. 차단 후보(block)만 규칙이 된다.
function buildBlockRules(items, { now, ttlMinutes, existing, subjectMap }) {
  const nowMs = toMs(now);
  if (!Number.isFinite(nowMs)) throw new TypeError('now가 올바른 시각이 아닙니다.');
  const ttlMs = clampTtl(ttlMinutes) * 60 * 1000;
  const skipped = [];
  const normalIps = new Set(items.filter((item) => item.action === 'record' && item.srcip).map((item) => item.srcip));
  // 정상 경보의 주소에 대응된 주체는 막지 않는다(정상 사용자를 막는 규칙 금지).
  const normalSubjects = new Set([...normalIps].flatMap((ip) => [...(subjectMap.get(ip) ?? [])]));

  const byIp = new Map();
  for (const rule of existing) {
    if (rule?.match?.sourceIp && isActive(rule, nowMs)) byIp.set(rule.match.sourceIp, structuredClone(rule));
  }
  for (const item of items) {
    if (item.action !== 'block') continue;
    const why = !(typeof item.alertId === 'string' && item.alertId) ? '근거 경보 번호가 없음'
      : !(typeof item.confidence === 'number' && item.confidence >= BLOCK_AT) ? `확신도 ${BLOCK_AT} 미만`
        : !isBlockableIp(item.srcip) ? '막을 수 있는 한 주소가 아님'
          : normalIps.has(item.srcip) ? '같은 주소가 정상 경보에도 나옴'
            : null;
    if (why) { skipped.push({ alertId: item.alertId ?? null, why }); continue; }
    const subjects = [...(subjectMap.get(item.srcip) ?? [])].filter((subject) => !normalSubjects.has(subject));
    const found = byIp.get(item.srcip);
    if (found) {
      if (!found.evidence.alertIds.includes(item.alertId)) found.evidence.alertIds.push(item.alertId);
      found.subjectIds = [...new Set([...(found.subjectIds ?? []), ...subjects])];
      found.confidence = Math.max(found.confidence, item.confidence);
      found.expiresAt = iso(Math.max(Date.parse(found.expiresAt), nowMs + ttlMs));
      continue;
    }
    byIp.set(item.srcip, {
      id: `xdr-bf-${item.srcip}`,
      ruleId: RULE_ID,
      decision: 'deny',
      reasonCode: REASON_CODE,
      match: { sourceIp: item.srcip },
      subjectIds: subjects,
      evidence: { alertIds: [item.alertId], reason: String(item.reason ?? '').replace(/\s+/gu, ' ').trim().slice(0, 140) },
      confidence: item.confidence,
      createdAt: iso(nowMs),
      expiresAt: iso(nowMs + ttlMs),
    });
  }
  return { rules: [...byIp.values()], skipped };
}

export async function respond({ root = defaultRoot, now = new Date(), ttlMinutes, askConfidence, warn = () => {} } = {}) {
  const fixture = JSON.parse(await readFile(join(root, 'xdr', 'fixtures', 'brute-force.json'), 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1' || fixture.moduleKey !== 'brute-force' || !Array.isArray(fixture.alerts)) {
    throw new Error('brute-force 경보 묶음 형식이 아닙니다.');
  }
  // 1) 경보마다 decide 결과를 받는다.
  const items = [];
  for (const alert of fixture.alerts) {
    const row = extractRow(alert);
    const decision = await decide(alert, { askConfidence });
    items.push({
      alertId: typeof alert?.id === 'string' ? alert.id : null,
      srcip: row.srcip, srcuser: row.srcuser,
      action: decision.action, confidence: decision.confidence, reason: decision.reason,
    });
  }

  // 2) 차단 후보만 거부 규칙으로 판정기의 규칙 파일에 넣는다.
  const rulesPath = join(root, 'xdr', 'block-rules.json');
  const logPath = join(root, 'xdr', 'alerts.log');
  const previous = await readJson(rulesPath, warn, '기존 규칙 파일');
  const existing = previous?.schema === RULES_SCHEMA && Array.isArray(previous.rules) ? previous.rules : [];
  const subjectMap = readSubjectMap(await readJson(join(root, 'xdr', 'subject-map.json'), warn, '주소·주체 대응표'));
  const { rules, skipped } = buildBlockRules(items, { now, ttlMinutes, existing, subjectMap });
  await mkdir(join(root, 'xdr'), { recursive: true });
  await writeFile(rulesPath, `${JSON.stringify({ schema: RULES_SCHEMA, moduleKey: 'brute-force', updatedAt: iso(toMs(now)), rules }, null, 2)}\n`, 'utf8');

  // 3) 알림은 block과 alert만 한 줄씩 쌓는다(record는 쌓지 않는다). 시각 | 행동 | 경보 | 주소 | 계정 | 확신도 | 이유 | 조치
  const stamp = iso(toMs(now));
  const skipOf = new Map(skipped.map((entry) => [entry.alertId, entry.why]));
  const ruleOf = new Map(rules.flatMap((rule) => rule.evidence.alertIds.map((id) => [id, rule])));
  const lines = [];
  for (const item of items) {
    if (item.action === 'record') continue;
    const rule = ruleOf.get(item.alertId);
    const note = item.action === 'alert' ? '사람이 확인'
      : !rule ? `규칙 없음(${skipOf.get(item.alertId) ?? '이유 불명'})`
        : rule.subjectIds.length ? `규칙 ${rule.id} 만료 ${rule.expiresAt} · 판정기 적용 주체 ${rule.subjectIds.length}개`
          : `규칙 ${rule.id} 만료 ${rule.expiresAt} · 판정기 연결 대기(주소→주체 대응표 없음)`;
    lines.push([stamp, item.action.toUpperCase(), item.alertId, item.srcip, item.srcuser, item.confidence, item.reason, note].map(field).join(' | '));
  }
  if (lines.length) await appendFile(logPath, `${lines.join('\n')}\n`, 'utf8');

  const counts = { block: 0, alert: 0, record: 0 };
  for (const item of items) counts[item.action] += 1;
  const active = rules.filter((rule) => isActive(rule, now));
  return { total: items.length, counts, ruleCount: active.length, appliedToDecider: active.filter((rule) => rule.subjectIds.length).length, skipped, logged: lines.length, rules };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
    const nowArg = arg('now');
    const now = nowArg ? new Date(nowArg) : new Date();
    if (Number.isNaN(now.getTime())) throw new Error('--now는 올바른 시각이어야 합니다.');
    const result = await respond({ now, ttlMinutes: arg('ttl'), warn: (m) => process.stderr.write(`${m}\n`) });
    process.stdout.write(`경보 ${result.total}건 · block ${result.counts.block} · alert ${result.counts.alert} · record ${result.counts.record}\n`
      + `거부 규칙 ${result.ruleCount}개(만료 ${clampTtl(arg('ttl'))}분) 중 판정기가 적용할 주체가 있는 것 ${result.appliedToDecider}개 · 알림 ${result.logged}줄을 xdr/alerts.log에 추가\n`);
    if (result.ruleCount && !result.appliedToDecider) process.stdout.write('주소→주체 대응표(xdr/subject-map.json)가 없어 판정기는 아직 이 규칙을 적용하지 않습니다.\n');
    if (result.skipped.length) process.stdout.write(`규칙을 만들지 않은 block ${result.skipped.length}건: ${result.skipped.map((s) => `${s.alertId}(${s.why})`).join(', ')}\n`);
  } catch (error) {
    process.stderr.write(`연결 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  }
}
