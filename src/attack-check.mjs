// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
//
// 12단계: 한 번의 실행에서 두 가지를 만든다.
//  - runAttackRecords(config): 작전실 표의 행(단계, 정상/금지, 기대 결과, 실제 API 결과, 요청 ID, 확인 시각, 판정 결과).
//  - runAttackChecks(config): 제출 묶음(npm run bundle)이 받는 attackId·expected·observed 세 항목. 위 행에서 그대로 뽑는다.
// 격리 환경 규칙: 요청은 공개 HTTPS 주소로 보내는 GET만 쓴다. 요청마다 alephEvidence { caseId: attackId, requestKey: 요청 ID }를
// 붙여 심판 실행기가 어느 점검의 요청인지 기록하게 한다. 이 값은 헤더나 URL에 넣지 않는다. URL.searchParams는 쓰지 않는다.
// 요청을 보내지 않은 점검은 observed를 「미실행:」으로 시작하고 result를 not_run으로 둔다. 결과를 짐작으로 채우지 않는다.
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

// 점검 한 줄. 요청을 보낼 때마다 요청 ID를 기록한다.
const row = (attackId, stage, kind, area, expected) => ({ attackId, stage, kind, area, expected, observed: '', result: 'not_run', requestIds: [], checkedAt: null });
const notRun = (item, reason) => Object.assign(item, { observed: `미실행: ${reason}`, result: 'not_run' });

// GET 한 번. 응답 본문은 기록하지 않고 상태 코드, JSON 여부, 메모 필드 유무만 돌려준다.
async function probe(item, url, headers = {}) {
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

const judge = (item, ok, observed) => Object.assign(item, {
  observed: observed.slice(0, 300),
  result: ok ? (item.kind === 'allow' ? 'allowed' : 'blocked') : 'unexpected',
});
const failed = (item, r) => notRun(item, `요청이 응답 없이 실패함 (${r.error})`);
const deniedWithoutNotes = (r) => [401, 403, 404, 405].includes(r.status) && !r.hasNotes;

// 1~2단계용 기존 점검(이 단계 숫자에서만 쓴다).
async function earlyChecks(config, app) {
  if (config.step === 1 && (typeof config.sampleMarker !== 'string' || !config.sampleMarker)) {
    throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  }
  if (config.step === 1) {
    const item = row('anonymous_note_read', 1, 'deny', 'access', '비로그인 화면에서 가상 메모를 확인');
    const r = await probe(item, new URL('/data.json', app));
    if (!r.sent) return [failed(item, r)];
    const visible = r.json?.sampleMarker === config.sampleMarker && Array.isArray(r.json?.notes) && r.json.notes.length > 0;
    return [judge(item, true, visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${r.status})`)];
  }
  const items = [];
  const staticItem = row('static_data_json_notes', 2, 'deny', 'access', '정적 /data.json에 가상 메모와 시작 틀 확인 표시가 없음');
  const s = await probe(staticItem, new URL('/data.json', app));
  items.push(s.sent ? judge(staticItem, !Array.isArray(s.json?.notes), `/data.json HTTP ${s.status}`) : failed(staticItem, s));
  const apiItem = row('anonymous_api_notes_read', 2, 'deny', 'access', '비로그인 요청으로 /api/notes의 메모가 보이지 않음 (3단계 이후 목표)');
  const a = await probe(apiItem, new URL('/api/notes', app));
  items.push(a.sent ? judge(apiItem, !a.hasNotes, `비로그인 /api/notes HTTP ${a.status}${a.hasNotes ? ', 메모 필드가 보임' : ''}`) : failed(apiItem, a));
  return items;
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

  // 2단계: 정적 공개 자료
  {
    const item = add(row('static_data_json_notes', 2, 'deny', 'access', '정적 /data.json에 가상 메모가 없음 (404 또는 메모 없음)'));
    const r = await probe(item, new URL('/data.json', app));
    if (!r.sent) failed(item, r);
    else judge(item, !Array.isArray(r.json?.notes), Array.isArray(r.json?.notes) ? `/data.json에서 메모 ${r.json.notes.length}건이 읽힘 (HTTP ${r.status})` : `/data.json을 읽지 못함 (HTTP ${r.status})`);
  }
  // 3단계: 로그인 없는 요청과 위조 토큰
  {
    const item = add(row('anonymous_list_read', 3, 'deny', 'access', '로그인 없는 GET /api/notes가 자료 없이 401로 거부됨'));
    const r = await probe(item, new URL('/api/notes', app));
    if (!r.sent) failed(item, r); else judge(item, r.status === 401 && !r.hasNotes, `GET /api/notes HTTP ${r.status}${r.hasNotes ? ', 메모 필드가 보임' : ''}`);
  }
  {
    const item = add(row('forged_token_list_read', 3, 'deny', 'access', '위조 토큰을 붙인 GET /api/notes가 자료 없이 401로 거부됨'));
    const r = await probe(item, new URL('/api/notes', app), { authorization: `Bearer ${FORGED_TOKEN}` });
    if (!r.sent) failed(item, r); else judge(item, r.status === 401 && !r.hasNotes, `위조 토큰 GET /api/notes HTTP ${r.status}${r.hasNotes ? ', 메모 필드가 보임' : ''}`);
  }
  add(notRun(row('anonymous_write', 3, 'deny', 'access', '로그인 없는 POST·PUT·DELETE /api/notes가 401로 거부됨'),
    '제출 묶음은 GET·HEAD만 보낼 수 있어 쓰기 요청을 보내지 않음. 로컬에서 직접 보내 확인해야 함'));
  // 4단계: 요청이 보낸 신원 값은 믿지 않음
  if (config.step >= 4) {
    const item = add(row('identity_hint_ignored', 4, 'deny', 'access', '쿼리·헤더로 보낸 userId·role이 무시되고 로그인 없는 요청으로 401 거부됨'));
    const q = await probe(item, new URL(`/api/notes?userId=${GHOST_ID}&role=instructor`, app));
    const h = q.sent ? await probe(item, new URL('/api/notes', app), { 'x-user-id': GHOST_ID, 'x-role': 'instructor' }) : q;
    if (!q.sent || !h.sent) failed(item, q.sent ? h : q);
    else judge(item, q.status === 401 && h.status === 401 && !q.hasNotes && !h.hasNotes, `쿼리 신원 HTTP ${q.status} / 헤더 신원 HTTP ${h.status}`);
    add(notRun(row('login_owner_crud', 4, 'allow', 'access', 'A 로그인으로 자기 메모 읽기·추가·수정·삭제가 허용됨'),
      '로그인 토큰이 필요해 이 스크립트가 보내지 않음. 화면에서 직접 확인해야 함'));
    add(notRun(row('login_b_other_note', 4, 'deny', 'access', 'B 로그인으로 A의 메모 읽기·수정·삭제가 404·403으로 거부됨'),
      'A·B 로그인 토큰이 필요해 이 스크립트가 보내지 않음. 두 계정으로 직접 확인해야 함'));
  }
  // 5단계: 원본 자료 주소 직접 요청, 공개 설정
  if (original) {
    const target = `${original.href}?select=id&limit=1`;
    {
      const item = add(row('original_direct_no_key', 5, 'deny', 'access', '키 없는 원본 자료 직접 GET이 401·403으로 거부됨'));
      const r = await probe(item, target);
      if (!r.sent) failed(item, r); else judge(item, r.status === 401 || r.status === 403, `키 없는 원본 GET HTTP ${r.status}${typeof r.json?.code === 'string' ? `, ${r.json.code.slice(0, 20)}` : ''}`);
    }
    {
      const item = add(row('original_direct_anon_read', 5, 'deny', 'access', '공개(anon) 키만으로 원본 자료 직접 GET이 401·403으로 거부됨'));
      const c = await probe(item, new URL('/api/config', app));
      const key = c.sent && typeof c.json?.publishableKey === 'string' && c.json.publishableKey.startsWith('sb_publishable_') ? c.json.publishableKey : null;
      if (!key) notRun(item, `공개 키를 받지 못해 원본 요청을 보내지 않음 (/api/config ${c.sent ? `HTTP ${c.status}` : c.error})`);
      else {
        const r = await probe(item, target, { apikey: key, authorization: `Bearer ${key}` });
        if (!r.sent) failed(item, r); else judge(item, r.status === 401 || r.status === 403, `공개 키 원본 GET HTTP ${r.status}${typeof r.json?.code === 'string' ? `, ${r.json.code.slice(0, 20)}` : ''}`);
      }
    }
    {
      const item = add(row('app_page_no_public_key', 5, 'allow', 'app', '첫 화면이 열리고(200) HTML에 Supabase 공개 키가 없음'));
      const r = await probe(item, new URL('/', app), { accept: 'text/html' });
      if (!r.sent) failed(item, r);
      else judge(item, r.status === 200 && !PUBLIC_KEY.test(r.text), `첫 화면 HTTP ${r.status}, 공개 키 형식 ${PUBLIC_KEY.test(r.text) ? '있음' : '없음'}`);
    }
    {
      const item = add(row('deployed_config_published', 5, 'allow', 'app', '/aleph.json이 열리고 원본 자료 주소와 허용 경로가 설정과 같음'));
      const r = await probe(item, new URL('/aleph.json', app));
      const sameOrigin = r.json?.originalApiUrl === `${original.origin}${original.pathname}`;
      const routes = Array.isArray(r.json?.allowedRoutes) ? r.json.allowedRoutes.length : 0;
      if (!r.sent) failed(item, r);
      else judge(item, r.status === 200 && sameOrigin && routes > 0, `/aleph.json HTTP ${r.status}, 원본 주소 ${sameOrigin ? '같음' : '다름'}, 허용 경로 ${routes}개`);
    }
  }
  // 6~9단계: 판정기·탐지 규칙을 고정된 가상 입력으로 실행한 HTTP 응답 (실제 사용자 기기·사건이 아님)
  const ruleCase = async (attackId, stage, kind, area, expected, minStep = stage) => {
    if (config.step < minStep) return;
    const item = add(row(attackId, stage, kind, area, expected));
    const r = await probe(item, new URL(`/api/checks?case=${attackId}`, app));
    if (!r.sent) return void failed(item, r);
    const got = r.json?.decision ?? r.json?.action ?? '없음';
    judge(item, r.status === 200 && r.json?.ready === true, `가상 입력 HTTP ${r.status}, 결과 ${got}, ready=${r.json?.ready === true}`);
  };
  await ruleCase('registered_device_note_allowed', 6, 'allow', 'decision', '등록 기기의 GET /notes/:id 가상 요청은 allow');
  await ruleCase('unregistered_device_denied', 6, 'deny', 'decision', '미등록 기기의 가상 요청은 deny(device_not_registered)');
  await ruleCase('unusual_access_step_up', 7, 'deny', 'decision', '새벽·처음 보는 네트워크·대량 조회가 겹친 가상 요청은 step_up');
  await ruleCase('other_zone_route_denied', 8, 'deny', 'decision', '다른 구역(notices) 경로의 가상 요청은 deny');
  await ruleCase('burst_read_revocation', 9, 'deny', 'detection', '10분 안에 GET 121건인 가상 사건은 회수 제안(propose_revocation)');
  // 10단계: 복구 경로
  if (config.step >= 10) {
    const item = add(row('restore_without_login', 10, 'deny', 'restore', '로그인 없는 복구 경로 요청이 자료 없이 거부됨(GET은 405, POST는 보내지 않음)'));
    const r = await probe(item, new URL('/api/restore', app));
    if (!r.sent) failed(item, r); else judge(item, deniedWithoutNotes(r), `GET /api/restore HTTP ${r.status}${r.hasNotes ? ', 메모 필드가 보임' : ''}`);
    add(notRun(row('restore_route_one_note', 10, 'allow', 'restore', '본인 메모 한 건이 백업에서 복원되고 다른 사용자의 복원은 404로 거부됨'),
      '로그인 토큰과 POST 요청이 필요해 이 스크립트가 보내지 않음'));
  }
  // 11단계: 기기 승인 상태
  if (config.step >= 11) {
    const item = add(row('device_status_not_approved', 11, 'deny', 'device', '기기 신호가 없거나 위조한 요청에도 서버가 승인 전으로 답함'));
    const plain = await probe(item, new URL('/api/device/status', app));
    const forged = plain.sent ? await probe(item, new URL('/api/device/status', app), { 'x-device-registered': 'true', 'x-approved': '1', cookie: 'device=registered; approved=1' }) : plain;
    if (!plain.sent || !forged.sent) failed(item, plain.sent ? forged : plain);
    else {
      const pending = (r) => r.status === 200 && r.json?.approved === false;
      judge(item, pending(plain) && pending(forged), `신호 없음 HTTP ${plain.status} approved=${plain.json?.approved} / 위조 신호 HTTP ${forged.status} approved=${forged.json?.approved}`);
    }
  }
  // 12단계: 작전실 API
  if (config.step >= 12) {
    const item = add(row('ops_room_api', 12, 'allow', 'app', '작전실 API GET /api/checks가 200으로 점검 기록 수치를 돌려줌'));
    const r = await probe(item, new URL('/api/checks', app));
    if (!r.sent) failed(item, r);
    else judge(item, r.status === 200 && r.json?.schema === 'byteback.checks.v2', `GET /api/checks HTTP ${r.status}, 형식 ${r.json?.schema === 'byteback.checks.v2' ? '맞음' : '다름'}`);
  }
  return items.sort((a, b) => a.stage - b.stage);
}

export async function runAttackChecks(config) {
  const items = await runAttackRecords(config);
  return items.map(({ attackId, expected, observed }) => ({ attackId, expected, observed }));
}
