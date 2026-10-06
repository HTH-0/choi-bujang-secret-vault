// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (![1, 2, 3, 4, 5].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
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
  if (config.step === 1 && (typeof config.sampleMarker !== 'string' || !config.sampleMarker)) {
    throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  }
  const response = await fetch(new URL('/data.json', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let marker = false;
  let markerPresent = false;
  let noteCount = null;
  if (response.ok) {
    try {
      const data = await response.json();
      marker = data?.sampleMarker === config.sampleMarker;
      markerPresent = data !== null && typeof data === 'object' && 'sampleMarker' in data;
      if (Array.isArray(data?.notes)) noteCount = data.notes.length;
    } catch {
      // A non-JSON response is a failed check, not a successful deployment.
    }
  }
  if (config.step === 1) {
    const visible = marker && noteCount > 0;
    return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
      observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
  }
  // 2단계: 정적 /data.json에는 메모가 없어야 하고, 서버 함수 /api/notes는 아직 공개다.
  // 메모 본문은 기록하지 않고 상태 코드와 건수만 남긴다.
  const staticObserved = noteCount === null
    ? `/data.json을 읽지 못함 (HTTP ${response.status})`
    : `/data.json 메모 ${noteCount}건, 시작 틀 확인 표시 ${markerPresent ? '있음' : '없음'} (HTTP ${response.status})`;
  if (config.step >= 3 && config.step <= 5) {
    // 3~5단계: 로그인 없는 요청과 위조 토큰 요청이 자료 없이 거부되는지 실제로 보낸다.
    // 본문은 비워 보내므로 거부가 깨져도 자료가 바뀌지 않는다. 응답 본문은 기록하지 않고 상태 코드만 남긴다.
    const ghostId = '00000000-0000-4000-8000-000000000000';
    const status = async (method, path, headers = {}) => {
      const sent = await fetch(new URL(path, app), {
        method, redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: method === 'GET' || method === 'DELETE' ? headers : { 'Content-Type': 'application/json', ...headers },
        body: method === 'POST' || method === 'PUT' ? '{}' : undefined,
      });
      return sent.status;
    };
    const rejected = async (attackId, expected, method, path, headers) => {
      const code = await status(method, path, headers);
      return { attackId, expected, observed: code === 401
        ? `${method} ${path} 요청이 로그인 없이 거부됨 (HTTP 401)`
        : `${method} ${path} 요청이 거부되지 않음 (HTTP ${code})` };
    };
    // 5단계: 원본 자료 주소(originalApiUrl)로 브라우저가 가진 공개(anon) 키만으로 직접 요청한다.
    // 공개 키는 배포된 화면에서 읽는다. 응답 본문은 기록하지 않고 상태 코드와 오류 코드만 남긴다.
    const directChecks = async () => {
      if (config.step < 5) return [];
      let original;
      try { original = new URL(config.originalApiUrl); } catch {
        throw new Error('aleph.config.json의 originalApiUrl에 쿼리 없는 HTTPS 원본 자료 주소를 넣어 주세요.');
      }
      if (original.protocol !== 'https:' || original.search || original.hash || original.username || original.password) {
        throw new Error('aleph.config.json의 originalApiUrl에 쿼리 없는 HTTPS 원본 자료 주소를 넣어 주세요.');
      }
      const page = await fetch(app, { redirect: 'error', signal: AbortSignal.timeout(10000) });
      const anonKey = (await page.text()).match(/sb_publishable_[A-Za-z0-9_-]{10,}/u)?.[0];
      const direct = async (attackId, expected, label, method, headers) => {
        const target = new URL(original);
        if (method === 'GET') { target.searchParams.set('select', 'id'); target.searchParams.set('limit', '1'); }
        let code = null;
        const sent = await fetch(target, {
          method, redirect: 'error', signal: AbortSignal.timeout(10000),
          headers: method === 'POST' ? { 'Content-Type': 'application/json', ...headers } : headers,
          body: method === 'POST' ? '{}' : undefined,
        });
        try { const body = await sent.json(); if (typeof body?.code === 'string') code = body.code; } catch { /* 본문은 기록하지 않는다 */ }
        const denied = sent.status === 401 || sent.status === 403;
        return { attackId, expected, observed: denied
          ? `${label}이(가) 거부됨 (HTTP ${sent.status}${code ? `, ${code}` : ''})`
          : `${label}이(가) 거부되지 않음 (HTTP ${sent.status})` };
      };
      const withKey = anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : null;
      return [
        await direct('original_direct_no_key', '키 없는 원본 직접 요청이 거부됨', '키 없는 원본 GET', 'GET', {}),
        withKey
          ? await direct('original_direct_anon_read', '공개(anon) 키로 원본 직접 읽기가 거부됨', '공개 키 원본 GET', 'GET', withKey)
          : { attackId: 'original_direct_anon_read', expected: '공개(anon) 키로 원본 직접 읽기가 거부됨',
            observed: '미실행: 배포된 화면에서 공개 키를 찾지 못함' },
        withKey
          ? await direct('original_direct_anon_write', '공개(anon) 키로 원본 직접 쓰기가 거부됨', '공개 키 원본 POST', 'POST', withKey)
          : { attackId: 'original_direct_anon_write', expected: '공개(anon) 키로 원본 직접 쓰기가 거부됨',
            observed: '미실행: 배포된 화면에서 공개 키를 찾지 못함' },
      ];
    };
    return [
      { attackId: 'static_data_json_notes', expected: '정적 /data.json에 가상 메모와 시작 틀 확인 표시가 없음', observed: staticObserved },
      await rejected('anonymous_list_read', '로그인 없는 목록 GET이 거부됨', 'GET', '/api/notes'),
      await rejected('anonymous_create', '로그인 없는 POST가 거부됨', 'POST', '/api/notes'),
      await rejected('anonymous_update', '로그인 없는 PUT이 거부됨', 'PUT', `/api/notes/${ghostId}`),
      await rejected('anonymous_delete', '로그인 없는 DELETE가 거부됨', 'DELETE', `/api/notes/${ghostId}`),
      await rejected('forged_token_list_read', '위조 토큰 GET이 거부됨', 'GET', '/api/notes',
        { Authorization: 'Bearer aaa.bbb.ccc' }),
      ...await directChecks(),
      { attackId: 'login_a_crud', expected: 'A 로그인으로 자기 메모 추가·수정·삭제가 됨',
        observed: '미실행: 로그인 토큰이 필요해 이 스크립트가 보내지 않았고, 화면에서 직접 확인해야 함' },
      config.step === 3
        ? { attackId: 'login_b_other_note', expected: 'B가 A의 메모를 읽고 고칠 수 있음 (4단계에서 막을 허점)',
          observed: '미실행: 4단계에서 기록' }
        : { attackId: 'login_b_other_note', expected: 'B 로그인으로 A의 메모 읽기·수정·삭제와 소유자 변경이 거부됨(404·403)',
          observed: '미실행: A·B 로그인 토큰이 필요해 이 스크립트가 보내지 않았고, 배포 뒤 두 계정으로 직접 확인해야 함' },
    ];
  }
  const api = await fetch(new URL('/api/notes', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let apiCount = null;
  if (api.ok) {
    try {
      const data = await api.json();
      if (Array.isArray(data?.notes)) apiCount = data.notes.length;
    } catch {
      // A non-JSON response is recorded as unreadable below.
    }
  }
  const apiObserved = apiCount === null
    ? `비로그인 /api/notes 요청이 메모를 주지 않음 (HTTP ${api.status})`
    : `비로그인 /api/notes 요청에서 메모 ${apiCount}건이 읽힘 (HTTP ${api.status}), 아직 공개 약점`;
  return [
    { attackId: 'static_data_json_notes', expected: '정적 /data.json에 가상 메모와 시작 틀 확인 표시가 없음', observed: staticObserved },
    { attackId: 'anonymous_api_notes_read', expected: '비로그인 요청으로 /api/notes의 메모가 보이지 않음 (3단계 이후 목표)', observed: apiObserved },
  ];
}
