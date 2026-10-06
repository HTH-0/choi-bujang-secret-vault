// 화면이 로그인(Auth)에 쓰는 공개용 값을 서버에서 내려준다. 정적 화면 코드에는 키를 두지 않는다.
// SUPABASE_URL과 SUPABASE_PUBLISHABLE_KEY는 Vercel 환경변수에서만 읽는다.
// publishable 키(sb_publishable_…)만 내려준다. 서버 전용 secret 키는 절대 내려주지 않는다.
export default function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  let valid = false;
  try { valid = new URL(supabaseUrl).protocol === 'https:'; } catch { /* 설정이 없거나 잘못됨 */ }
  if (!valid || typeof publishableKey !== 'string' || !publishableKey.startsWith('sb_publishable_')) {
    return response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
  }
  return response.status(200).json({ supabaseUrl, publishableKey });
}
