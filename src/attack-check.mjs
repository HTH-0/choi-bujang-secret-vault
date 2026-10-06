// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (![1, 2].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
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
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  const response = await fetch(new URL('/data.json', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let marker = false;
  let noteCount = null;
  if (response.ok) {
    try {
      const data = await response.json();
      marker = data?.sampleMarker === config.sampleMarker;
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
    : `/data.json 메모 ${noteCount}건 (HTTP ${response.status})`;
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
    { attackId: 'static_data_json_notes', expected: '정적 /data.json에 가상 메모가 없음', observed: staticObserved },
    { attackId: 'anonymous_api_notes_read', expected: '비로그인 요청으로 /api/notes의 메모가 보이지 않음 (3단계 이후 목표)', observed: apiObserved },
  ];
}
