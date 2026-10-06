// 가상 메모를 코드 밖(Supabase)에서 읽는 서버 함수입니다.
// 3단계: 요청의 로그인 토큰을 틀의 src/verify-login.mjs로 검사하고, 통과한 요청에만 자료를 줍니다.
// 브라우저가 보낸 userId·role은 읽지 않습니다. 사용자는 검증된 토큰에서만 얻습니다.
// SUPABASE_URL과 서버 전용 SUPABASE_SECRET_KEY는 Vercel 환경변수에서만 읽고, 응답·로그에 넣지 않습니다.
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from '../src/verify-login.mjs';

let verifier;
function getVerifier(secretKey) {
  verifier ??= createLoginVerifier({ config, supabaseSecretKey: secretKey });
  return verifier;
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const baseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!baseUrl || !secretKey) {
    return response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
  }
  let login;
  try {
    login = await getVerifier(secretKey)(request.headers.authorization);
  } catch {
    return response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
  }
  if (!login) {
    // 토큰이 없거나 검사에 실패하면 자료 없이 거부한다.
    response.setHeader('WWW-Authenticate', 'Bearer');
    return response.status(401).json({ error: 'LOGIN_REQUIRED' });
  }
  try {
    const url = new URL('/rest/v1/vault_notes', baseUrl);
    url.searchParams.set('select', 'title,content');
    url.searchParams.set('order', 'created_at.asc');
    // 새 형식의 비밀 키(sb_...)는 JWT가 아니므로 apikey 헤더로만 보냅니다.
    const headers = { apikey: secretKey };
    if (!secretKey.startsWith('sb_')) headers.Authorization = `Bearer ${secretKey}`;
    const upstream = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) return response.status(502).json({ error: 'UPSTREAM_ERROR' });
    const rows = await upstream.json();
    if (!Array.isArray(rows)) return response.status(502).json({ error: 'UPSTREAM_ERROR' });
    const notes = rows.map(row => ({ title: String(row.title), content: String(row.content) }));
    return response.status(200).json({ notes });
  } catch {
    return response.status(502).json({ error: 'UPSTREAM_ERROR' });
  }
}
