// 자료 API(/api/notes, /api/notes/:id)가 같이 쓰는 부분입니다.
// 로그인 확인은 틀의 src/verify-login.mjs가 합니다. 요청이 보낸 userId·role·owner_id는 읽지 않고,
// 사용자는 검증된 토큰에서만 얻습니다. SUPABASE_URL과 서버 전용 SUPABASE_SECRET_KEY는 환경변수에서만 읽고
// 응답·로그에 넣지 않습니다.
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from './verify-login.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
export const isUuid = (value) => typeof value === 'string' && UUID.test(value);
export const TITLE_MAX = 200;
export const BODY_MAX = 5000;

// 8단계: 요청이 닿는 자원을 가리키는 ID. 서버 코드가 경로(핸들러)로만 정하고, 헤더·쿼리·본문이 보낸 값은 읽지 않는다.
// instructorNotice는 ID만 예약했다. 강사 공지의 자료와 주소는 아직 없으므로 이 ID를 쓰는 경로가 없다.
export const RESOURCE_IDS = Object.freeze({ note: 'vault.note', instructorNotice: 'vault.instructor_notice' });
const ROUTE_RESOURCES = Object.freeze({ '/api/notes': RESOURCE_IDS.note, '/api/notes/:id': RESOURCE_IDS.note });
// 허용 경로 모양(aleph.config.json의 allowedRoutes)을 자원 ID로 바꾼다. 표에 없는 경로는 null이며 기본값으로 채우지 않는다.
export const resourceIdForRoute = (route) => (typeof route === 'string' && Object.hasOwn(ROUTE_RESOURCES, route)
  ? ROUTE_RESOURCES[route] : null);

let verifier;
const getVerifier = (secretKey) => {
  verifier ??= createLoginVerifier({ config, supabaseSecretKey: secretKey });
  return verifier;
};

// 메서드·환경변수·로그인을 검사한다. 통과하면 { userId, resourceId }, 아니면 응답을 이미 보내고 null.
// resourceId는 호출한 핸들러가 RESOURCE_IDS에서 넘긴 값이다. 표에 없는 값이면 null로 둔다.
export async function guard(request, response, allowedMethods, resourceId = null) {
  response.setHeader('Cache-Control', 'no-store');
  if (!allowedMethods.includes(request.method)) {
    response.setHeader('Allow', allowedMethods.join(', '));
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return null;
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
    return null;
  }
  let login;
  try {
    login = await getVerifier(process.env.SUPABASE_SECRET_KEY)(request.headers.authorization);
  } catch {
    response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
    return null;
  }
  if (!login) {
    // 토큰이 없거나 검사에 실패하면 자료 없이 거부한다.
    response.setHeader('WWW-Authenticate', 'Bearer');
    response.status(401).json({ error: 'LOGIN_REQUIRED' });
    return null;
  }
  return { userId: login.userId, resourceId: Object.values(RESOURCE_IDS).includes(resourceId) ? resourceId : null };
}

// vault_notes 테이블 요청. 새 형식의 비밀 키(sb_...)는 JWT가 아니므로 apikey 헤더로만 보낸다.
export function rest({ method = 'GET', query = {}, body, prefer } = {}) {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const url = new URL('/rest/v1/vault_notes', process.env.SUPABASE_URL);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const headers = { apikey: secretKey };
  if (!secretKey.startsWith('sb_')) headers.Authorization = `Bearer ${secretKey}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  return fetch(url, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
}

// 테이블의 content 칸이 API에서는 body다.
export const toNote = (row) => ({ id: row.id, title: row.title, body: row.content });

// 소유자 검사: DB 행의 owner_id가 검증된 사용자 ID와 같은지만 본다. 요청이 보낸 값은 쓰지 않는다.
export const isOwner = (row, userId) => typeof row?.owner_id === 'string'
  && typeof userId === 'string' && row.owner_id.toLowerCase() === userId.toLowerCase();

// 8단계: 자원과 소유자를 다시 대조한다. 허용은 "자원이 vault.note이고 행의 owner_id가 검증된 사용자 ID와 같을 때"뿐이다.
// 강사 권한은 저장된 근거(테이블·설정)가 없어 아무에게도 주지 않는다. 화면 메뉴, 요청 본문·헤더·쿼리의 role은 읽지 않는다.
export function authorize(login, row) {
  if (login?.resourceId !== RESOURCE_IDS.note) return { ok: false, reason: 'resource_not_allowed' };
  if (!isOwner(row, login.userId)) return { ok: false, reason: 'not_owner' };
  return { ok: true };
}

// 거부 사유를 서버 로그에 한 줄로 남긴다. 사유 코드·자원 ID·메서드만 적고 사용자 ID, 토큰, 메모 내용은 적지 않는다.
export function denyReason(reason, login, request) {
  console.warn(JSON.stringify({ event: 'access_denied', reason, resource: login?.resourceId ?? null, method: request?.method ?? null }));
}

// 로그인 직후 자원 확인. vault.note가 아니면 자료 없이 403으로 거부한다.
export function requireNoteResource(login, request, response) {
  if (login?.resourceId === RESOURCE_IDS.note) return true;
  denyReason('resource_not_allowed', login, request);
  response.status(403).json({ error: 'FORBIDDEN' });
  return false;
}

// 본문이 소유자를 바꾸려는 값을 담고 있는지(본인 ID와 다른 값). 수정 요청에서 거부하는 데 쓴다.
const OWNER_KEYS = ['owner_id', 'ownerId', 'userId', 'user_id'];
export const triesToChangeOwner = (input, userId) => OWNER_KEYS.some((key) => key in input
  && !(typeof input[key] === 'string' && input[key].toLowerCase() === userId.toLowerCase()));

export function readJson(request) {
  let value = request.body;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

// title·body 검사. 값이 있으면 문자열이어야 하고 길이 제한을 지킨다. 문제가 있으면 null.
export function readFields(input, { required }) {
  const fields = {};
  if (input.title !== undefined) {
    if (typeof input.title !== 'string') return null;
    const title = input.title.trim();
    if (!title || title.length > TITLE_MAX) return null;
    fields.title = title;
  } else if (required) return null;
  if (input.body !== undefined) {
    if (typeof input.body !== 'string' || input.body.length > BODY_MAX) return null;
    fields.content = input.body;
  } else if (required) return null;
  return Object.keys(fields).length ? fields : null;
}
