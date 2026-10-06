// 2단계: 가상 메모를 코드 밖(Supabase)에서 읽는 서버 함수입니다.
// SUPABASE_URL과 서버 전용 SUPABASE_SECRET_KEY는 Vercel 환경변수에서만 읽습니다.
// 키는 응답·로그·브라우저 파일에 넣지 않습니다.
// 약점: 아직 로그인 확인이 없어 이 주소는 누구나 열 수 있습니다. 3단계 이후에 막습니다.
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
