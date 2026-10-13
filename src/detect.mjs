// 9단계에서 학생이 채우는 탐지 함수입니다. 이 기본값은 어떤 접속도 회수하지 않습니다.
// 반 엔진이 검증한 사건만 전달해야 하며, 브라우저가 보낸 사용자 번호는 받지 않습니다.

// 9단계 입력 처리: docs/DETECT_EVENTS.md의 사건 모양 { at, method, identity: { sub } }에서 세 값만 읽는다.
// 시각(at), 요청 종류(method), 가명 사용자(identity.sub) 외의 항목(메모 내용, 토큰, 이름, 헤더 등)은 복사하지도 읽지도 않는다.
// 형식이 틀린 사건은 버리고 건수만 센다. 버린 사건의 내용은 오류나 출력에 넣지 않고, 없는 값을 정상값으로 채우지 않는다.
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const SUBJECT = /^[A-Za-z0-9][A-Za-z0-9_:-]{0,63}$/u;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;

export function readEvents(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  const kept = [];
  let dropped = 0;
  for (const item of events) {
    let atMs = typeof item?.at === 'string' && ISO_TIME.test(item.at) ? Date.parse(item.at) : Number.NaN;
    // 2026-02-31처럼 없는 날짜가 다른 날로 바뀌어 읽히지 않게, 다시 문자열로 만든 값이 원래 값과 같은지 확인한다.
    if (Number.isFinite(atMs) && new Date(atMs).toISOString().slice(0, 19) !== item.at.slice(0, 19)) atMs = Number.NaN;
    const method = typeof item?.method === 'string' ? item.method : '';
    const identity = item?.identity;
    const subject = identity !== null && typeof identity === 'object' ? identity.sub : undefined;
    if (!Number.isFinite(atMs) || !METHODS.has(method) || typeof subject !== 'string' || !SUBJECT.test(subject)) {
      dropped += 1;
      continue;
    }
    kept.push(Object.freeze({ at: new Date(atMs).toISOString(), atMs, method, subject }));
  }
  return Object.freeze({ events: Object.freeze(kept), dropped });
}

// 폭주 조회 탐지: 같은 가명 사용자의 GET이 어느 10분(양 끝 포함) 구간에서든 120건을 넘으면(121건 이상) 그 사용자 한 명에 대한
// 회수 제안을 낸다. 정확히 120건, 다른 사용자의 사건 합산, 10분 밖으로 흩어진 사건은 제안하지 않는다. 숫자 기준은 사건 계약이 정한 값이다.
// 이 함수는 제안만 돌려준다. 실제 회수와 시간은 운영 엔진과 심판이 확인하며, 회수 API나 기기 권한은 여기서 바꾸지 않는다.
const WINDOW_MS = 10 * 60 * 1000;
const BURST_OVER = 120;

export function detect(events) {
  const { events: read } = readEvents(events);
  const getsBySubject = new Map();
  for (const item of read) {
    if (item.method !== 'GET') continue;
    if (!getsBySubject.has(item.subject)) getsBySubject.set(item.subject, []);
    getsBySubject.get(item.subject).push(item.atMs);
  }
  // 여러 사용자가 넘으면 폭주가 가장 먼저 완성된 한 명만 제안한다(같으면 이름순).
  let found = null;
  for (const [subject, times] of getsBySubject) {
    if (times.length <= BURST_OVER) continue;
    times.sort((a, b) => a - b);
    for (let i = BURST_OVER; i < times.length; i += 1) {
      if (times[i] - times[i - BURST_OVER] > WINDOW_MS) continue;
      if (!found || times[i] < found.completedAt || (times[i] === found.completedAt && subject < found.subject)) {
        found = { subject, completedAt: times[i] };
      }
      break;
    }
  }
  if (!found) return { action: 'observe' };
  return { action: 'propose_revocation', reasonCode: 'burst_read', subject: found.subject };
}
