// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
//
// 12단계: 한 번의 실행에서 두 가지를 만든다.
//  - runAttackRecords(config): 작전실 표의 행(단계, 정상/금지, 기대 결과, 실제 API 결과, 요청 ID, 확인 시각, 판정 결과).
//  - runAttackChecks(config): 제출 묶음(npm run bundle)이 받는 attackId·expected·observed 세 항목. 위 행에서 그대로 뽑는다.
// 격리 환경 규칙(심판 메모):
//  - 요청은 공개 HTTPS 주소로 보내는 GET만 쓴다. URL.searchParams는 쓰지 않는다.
//  - 요청마다 alephEvidence { caseId: attackId, requestKey: 요청 ID }를 붙인다. 헤더나 URL에는 넣지 않는다.
//  - 점검 하나에 요청은 한 번만 보낸다.
//  - observed에는 심판이 확인할 수 있는 값만 쓴다: "HTTP 401", "HTTP 200; jsonReady=true", "HTTP 200; jsonArrayLength=0".
//  - 요청을 보내지 않은 점검은 observed를 「미실행:」으로 시작하고 result를 not_run으로 둔다. 결과를 짐작으로 채우지 않는다.
// 판정(result)은 응답 전체로 이 스크립트가 정한 값이며 작전실 표에만 쓴다. 응답 본문은 기록하지 않는다.
import { randomUUID } from 'node:crypto';

const GHOST_ID = '00000000-0000-4000-8000-000000000000';
const FORGED_TOKEN = 'aaa.bbb.ccc';
const PUBLIC_KEY = /sb_publishable_[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/u;
const NOTE_FIELDS = /"(?:content|body|title)"\s*:/u;

function readConfig(config) {
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  return app;
}

// 점검 한 줄. 요청을 보내면 요청 ID를 기록한다.
const row = (attackId, stage, kind, area, expected) => ({ attackId, stage, kind, area, expected, observed: '', result: 'not_run', requestIds: [], checkedAt: null });
const notRun = (item, reason) => Object.assign(item, { observed: `미실행: ${reason}`, result: 'not_run' });

// GET 한 번. 응답 본문은 기록하지 않고 판정에 필요한 값만 돌려준다.
async function probe(item, url, headers = {}) {
  if (item.requestIds.length) throw new Error(`${item.attackId}: 점검 하나에 요청은 한 번만 보냅니다.`);
  const requestId = randomUUID();
  item.requestIds.push(requestId);
  item.checkedAt = new Date().toISOString();
  try {
    const response = await fetch(url, {
      method: 'GET', headers: { accept: 'application/json', ...headers }, redirect: 'error', signal: AbortSignal.timeout(10000),
      alephEvidence: { caseId: item.attackId, requestKey: requestId },
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* JSON이 아닌 응답 */ }
    return { sent: true, status: response.status, json, text, hasNotes: NOTE_FIELDS.test(text) };
  } catch (error) {
    return { sent: false, error: String(error?.name ?? 'Error').slice(0, 40) };
  }
}

// 심판이 확인할 수 있는 형식의 관측값: HTTP 상태, JSON 배열 길이, JSON의 ready 값만.
const observedOf = (r) => `HTTP ${r.status}${Array.isArray(r.json) ? `; jsonArrayLength=${r.json.length}` : ''}${typeof r.json?.ready === 'boolean' ? `; jsonReady=${r.json.ready}` : ''}`;
const judge = (item, r, ok) => Object.assign(item, { observed: observedOf(r), result: ok ? (item.kind === 'allow' ? 'allowed' : 'blocked') : 'unexpected' });
const failed = (item, r) => notRun(item, `요청이 응답 없이 실패함 (${r.error})`);
const measure = async (item, url, headers, ok) => {
  const r = await probe(item, url, headers);
  if (!r.sent) failed(item, r); else judge(item, r, ok(r));
  return r;
};
const deniedWithoutNotes = (r) => [401, 403, 404, 405].includes(r.status) && !r.hasNotes;

// 1~2단계용 기존 점검(이 단계 숫자에서만 쓴다).
async function earlyChecks(config, app) {
  if (config.step === 1 && (typeof config.sampleMarker !== 'string' || !config.sampleMarker)) {
    throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  }
  // 1~2단계의 관측 문구는 그 단계에서 쓰던 문장을 그대로 둔다(제공 틀 시험이 이 문장을 확인한다).
  if (config.step === 1) {
    const item = row('anonymous_note_read', 1, 'deny', 'access', '비로그인 화면에서 가상 메모를 확인');
    const r = await probe(item, new URL('/data.json', app));
    if (!r.sent) return [failed(item, r)];
    const visible = r.json?.sampleMarker === config.sampleMarker && Array.isArray(r.json?.notes) && r.json.notes.length > 0;
    return [Object.assign(item, { result: 'blocked', observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${r.status})` })];
  }
  const staticItem = row('static_data_json_notes', 2, 'deny', 'access', '정적 /data.json에 가상 메모와 시작 틀 확인 표시가 없음');
  const s = await probe(staticItem, new URL('/data.json', app));
  if (!s.sent) failed(staticItem, s);
  else Object.assign(staticItem, { result: Array.isArray(s.json?.notes) ? 'unexpected' : 'blocked', observed: Array.isArray(s.json?.notes) ? `/data.json 메모 ${s.json.notes.length}건 (HTTP ${s.status})` : `/data.json을 읽지 못함 (HTTP ${s.status})` });
  const apiItem = row('anonymous_api_notes_read', 2, 'deny', 'access', '비로그인 요청으로 /api/notes의 메모가 보이지 않음 (3단계 이후 목표)');
  const a = await probe(apiItem, new URL('/api/notes', app));
  if (!a.sent) failed(apiItem, a);
  else Object.assign(apiItem, { result: a.hasNotes ? 'unexpected' : 'blocked', observed: a.hasNotes ? `비로그인 /api/notes 요청에서 메모가 읽힘 (HTTP ${a.status}), 아직 공개 약점` : `비로그인 /api/notes 요청이 메모를 주지 않음 (HTTP ${a.status})` });
  return [staticItem, apiItem];
}

export async function runAttackRecords(config) {
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  const app = readConfig(config);
  if (config.step < 3) return earlyChecks(config, app);
  let original = null;
  if (config.step >= 5) {
    try { original = new URL(config.originalApiUrl); } catch { original = null; }
    if (!original || original.protocol !== 'https:' || original.search || original.hash || original.username || original.password) {
      throw new Error('aleph.config.json의 originalApiUrl에 쿼리 없는 HTTPS 원본 자료 주소를 넣어 주세요.');
    }
  }
  const items = [];
  const add = (item) => { items.push(item); return item; };
  const deny401 = (r) => r.status === 401 && !r.hasNotes;

  // 2단계: 정적 공개 자료
  await measure(add(row('static_data_json_notes', 2, 'deny', 'access', '정적 /data.json에 가상 메모가 없음 (404 또는 메모 없음)')),
    new URL('/data.json', app), {}, (r) => !Array.isArray(r.json?.notes));
  // 3단계: 로그인 없는 요청과 위조 토큰
  await measure(add(row('anonymous_list_read', 3, 'deny', 'access', '로그인 없는 GET /api/notes가 자료 없이 401로 거부됨')),
    new URL('/api/notes', app), {}, deny401);
  await measure(add(row('forged_token_list_read', 3, 'deny', 'access', '위조 토큰을 붙인 GET /api/notes가 자료 없이 401로 거부됨')),
    new URL('/api/notes', app), { authorization: `Bearer ${FORGED_TOKEN}` }, deny401);
  add(notRun(row('anonymous_write', 3, 'deny', 'access', '로그인 없는 POST·PUT·DELETE /api/notes가 401로 거부됨'),
    '제출 묶음은 GET·HEAD만 보낼 수 있어 쓰기 요청을 보내지 않음. 로컬에서 직접 보내 확인해야 함'));
  // 4단계: 요청이 보낸 신원 값은 믿지 않음
  if (config.step >= 4) {
    await measure(add(row('query_identity_ignored', 4, 'deny', 'access', '쿼리로 보낸 userId·role이 무시되고 로그인 없는 요청으로 401 거부됨')),
      new URL(`/api/notes?userId=${GHOST_ID}&role=instructor`, app), {}, deny401);
    await measure(add(row('header_identity_ignored', 4, 'deny', 'access', '헤더로 보낸 사용자 번호·역할이 무시되고 로그인 없는 요청으로 401 거부됨')),
      new URL('/api/notes', app), { 'x-user-id': GHOST_ID, 'x-role': 'instructor' }, deny401);
    add(notRun(row('login_required', 4, 'allow', 'access', 'A 로그인 본인 메모 읽기·추가·수정·삭제 허용, B 로그인의 A 메모 접근 404·403 거부, 본인 메모 한 건 복원'),
      'A·B 로그인 토큰과 쓰기 요청이 필요해 이 스크립트가 보내지 않음. 두 계정으로 화면과 터미널에서 직접 확인해야 함'));
  }
  // 5단계: 원본 자료 주소 직접 요청, 공개 설정, 첫 화면
  if (original) {
    const target = `${original.href}?select=id&limit=1`;
    await measure(add(row('original_direct_no_key', 5, 'deny', 'access', '키 없는 원본 자료 직접 GET이 401·403으로 거부됨')),
      target, {}, (r) => r.status === 401 || r.status === 403);
    const configItem = add(row('public_config_served', 5, 'allow', 'app', '로그인 화면용 공개 설정 GET /api/config가 200으로 열림(서버 전용 키 없음)'));
    const c = await measure(configItem, new URL('/api/config', app), {},
      (r) => r.status === 200 && typeof r.json?.publishableKey === 'string' && !/sb_secret_/u.test(r.text));
    const key = c.sent && typeof c.json?.publishableKey === 'string' && c.json.publishableKey.startsWith('sb_publishable_') ? c.json.publishableKey : null;
    const anonItem = add(row('original_direct_anon_read', 5, 'deny', 'access', '공개(anon) 키만으로 원본 자료 직접 GET이 401·403으로 거부됨'));
    if (!key) notRun(anonItem, '공개 키를 받지 못해 원본 요청을 보내지 않음');
    else await measure(anonItem, target, { apikey: key, authorization: `Bearer ${key}` }, (r) => r.status === 401 || r.status === 403);
    await measure(add(row('app_page_no_public_key', 5, 'allow', 'app', '첫 화면이 열리고(200) HTML에 Supabase 공개 키가 없음')),
      new URL('/', app), { accept: 'text/html' }, (r) => r.status === 200 && !PUBLIC_KEY.test(r.text));
  }
  // 6~9단계: 판정기·탐지 규칙을 고정된 가상 입력으로 실행한 HTTP 응답 (실제 사용자 기기·사건이 아님)
  const ruleCase = async (attackId, stage, kind, area, expected) => {
    if (config.step < stage) return;
    await measure(add(row(attackId, stage, kind, area, expected)), new URL(`/api/checks?case=${attackId}`, app), {},
      (r) => r.status === 200 && r.json?.ready === true);
  };
  await ruleCase('registered_device_note_allowed', 6, 'allow', 'decision', '등록 기기의 GET /notes/:id 가상 요청은 allow (jsonReady=true)');
  await ruleCase('unregistered_device_denied', 6, 'deny', 'decision', '미등록 기기의 가상 요청은 deny (jsonReady=true)');
  await ruleCase('unusual_access_step_up', 7, 'deny', 'decision', '새벽·처음 보는 네트워크·대량 조회가 겹친 가상 요청은 step_up (jsonReady=true)');
  await ruleCase('other_zone_route_denied', 8, 'deny', 'decision', '다른 구역(notices) 경로의 가상 요청은 deny (jsonReady=true)');
  await ruleCase('burst_read_revocation', 9, 'deny', 'detection', '10분 안에 GET 121건인 가상 사건은 회수 제안 (jsonReady=true)');
  // 10단계: 복구 경로
  if (config.step >= 10) {
    await measure(add(row('restore_without_login', 10, 'deny', 'restore', '로그인 없는 복구 경로 요청이 자료 없이 거부됨(GET은 405, POST는 보내지 않음)')),
      new URL('/api/restore', app), {}, deniedWithoutNotes);
  }
  // 11단계: 기기 승인 상태(신호 없음, 위조 신호)
  if (config.step >= 11) {
    const pending = (r) => r.status === 200 && r.json?.approved === false && !r.hasNotes;
    await measure(add(row('device_status_not_approved', 11, 'deny', 'device', '기기 신호가 없는 요청에 서버가 승인 전으로 답함')),
      new URL('/api/device/status', app), {}, pending);
    await measure(add(row('device_status_forged_signal', 11, 'deny', 'device', '위조한 기기 헤더·쿠키를 붙여도 서버가 승인 전으로 답함')),
      new URL('/api/device/status', app), { 'x-device-registered': 'true', 'x-approved': '1', cookie: 'device=registered; approved=1' }, pending);
  }
  // 12단계: 작전실 API
  if (config.step >= 12) {
    await measure(add(row('ops_room_api', 12, 'allow', 'app', '작전실 API GET /api/checks가 200으로 점검 기록 수치를 돌려줌')),
      new URL('/api/checks', app), {}, (r) => r.status === 200 && r.json?.schema === 'byteback.checks.v2');
  }
  return items.sort((a, b) => a.stage - b.stage);
}

export async function runAttackChecks(config) {
  const items = await runAttackRecords(config);
  return items.map(({ attackId, expected, observed }) => ({ attackId, expected, observed }));
}
