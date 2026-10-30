// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.

// ---- 13단계: 로그인 사용자·기기·세션 표시(renderIdentity) ----
// 입력: renderIdentity({ me, devices, sessions }), 각각 { status, mode, data?, error? }.
// 제공 UI가 값이 바뀔 때마다 이 함수를 다시 부르고 반환한 요소로 칸을 통째로 바꾼다.
// 그래서 이 함수는 이전 값을 기억하지 않는다. 오류일 때 옛 사용자 이름이 남을 곳이 없다.
// DOM은 createElement와 textContent로만 만들고 innerHTML은 쓰지 않는다. 상태는 색이 아니라 글자로도 구분한다.
// 기기 보안 상태는 서버가 알려 준 정책 준수 여부를 보여 줄 뿐이며, 악성코드 검사나 치료 기능이 아니다.
const DEVICE_STATUS_TEXT = { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' };
const SESSION_STATUS_TEXT = { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' };
// 정상처럼 보이면 안 되는 상태. 글자 「주의」를 앞에 붙인다.
const ATTENTION_STATUSES = new Set(['noncompliant', 'expired', 'revoked']);
const MODE_TEXT = { demo: '예제 자료', disconnected: '연결 없음', unknown: '확인 불가' };
// 제공 UI도 이 두 오류는 응답을 확인할 수 없는 경우로 본다. 그 밖의 오류는 서버 연결 실패로 보여 준다.
const UNVERIFIED_ERROR_CODES = new Set(['CONTRACT_MISMATCH', 'ENGINE_RESULT_UNVERIFIED']);

function makeNode(tag, { text, className, attrs } = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  if (className) node.className = className;
  for (const [name, value] of Object.entries(attrs ?? {})) node.setAttribute(name, String(value));
  return node;
}

// 상태값을 「한국어 문구(원래 값)」으로 만든다. 표에 없는 값은 확인 불가로 보여 준다.
function statusText(table, value) {
  const known = typeof value === 'string' && Object.hasOwn(table, value);
  const label = known ? table[value] : table.unknown;
  const raw = typeof value === 'string' && value ? value : 'unknown';
  return `${ATTENTION_STATUSES.has(raw) ? '주의 · ' : ''}${label}(${raw})`;
}

const textOf = (value) => (typeof value === 'string' && value.trim() ? value : null);
const nameAndId = (item) => {
  const label = textOf(item?.label);
  const id = textOf(item?.id);
  if (label && id) return `${label} (${id})`;
  return label ?? id ?? '이름 정보 없음';
};

// 각 칸 위에 붙는 모드 안내. loading·error 상태에서도 함께 보여 준다.
function modeNote(resource) {
  const mode = resource?.mode;
  if (typeof mode !== 'string' || !Object.hasOwn(MODE_TEXT, mode)) return null;
  return makeNode('p', { text: MODE_TEXT[mode], className: mode === 'demo' ? 'tag tag-demo' : 'tag', attrs: { 'data-mode': mode } });
}

function errorText(error) {
  const message = textOf(error?.message) ?? '서버가 오류 내용을 보내지 않았습니다.';
  return `${UNVERIFIED_ERROR_CODES.has(error?.code) ? '확인 불가' : '연결 실패'}: ${message}`;
}

// 한 칸(현재 계정·내 기기·내 세션)을 만든다. status가 ok가 아니면 data는 읽지 않는다.
function identityPart(key, title, resource, renderOk) {
  const part = makeNode('div', { attrs: { 'data-part': key, 'data-status': resource?.status ?? 'unknown' } });
  part.append(makeNode('h3', { text: title }));
  const note = modeNote(resource);
  if (note) part.append(note);
  if (resource?.status === 'loading') {
    part.append(makeNode('p', { text: '불러오는 중', className: 'state state-loading', attrs: { role: 'status' } }));
  } else if (resource?.status === 'error') {
    part.append(makeNode('p', { text: errorText(resource.error), className: 'state state-error' }));
  } else if (resource?.status === 'ok') {
    const body = renderOk(resource.data);
    part.append(body ?? makeNode('p', { text: '확인 불가: 응답 형식이 계약과 맞지 않습니다.', className: 'state state-empty' }));
  } else {
    part.append(makeNode('p', { text: '확인 불가: 상태 정보를 받지 못했습니다.', className: 'state state-empty' }));
  }
  return part;
}

function rowList(items) {
  const list = makeNode('dl');
  for (const [label, value, state] of items) {
    list.append(makeNode('dt', { text: label }));
    list.append(makeNode('dd', { text: value, attrs: state ? { 'data-state': state } : {} }));
  }
  return list;
}

function renderMe(data) {
  const { user, device, session } = data ?? {};
  if (!user || !device || !session) return null;
  return rowList([
    ['사용자', nameAndId(user), null],
    ['현재 기기', `${nameAndId(device)} · ${statusText(DEVICE_STATUS_TEXT, device.status)}`, device.status],
    ['현재 세션', `${textOf(session.id) ?? '세션 ID 없음'} · ${statusText(SESSION_STATUS_TEXT, session.status)}`, session.status],
  ]);
}

function renderList(data, emptyText, describe) {
  if (!Array.isArray(data)) return null;
  if (data.length === 0) return makeNode('p', { text: emptyText, className: 'state state-empty' });
  const list = makeNode('ul');
  for (const item of data) list.append(makeNode('li', { text: describe(item), attrs: { 'data-state': item?.status ?? 'unknown' } }));
  return list;
}

function renderIdentityView({ me, devices, sessions } = {}) {
  const root = makeNode('section', { attrs: { 'data-testid': 'student-identity-view', 'aria-label': '로그인 사용자·기기·세션' } });
  root.append(
    identityPart('me', '현재 계정', me, renderMe),
    identityPart('devices', '내 기기', devices, (data) => renderList(data, '표시할 기기가 없습니다.',
      (d) => `${nameAndId(d)} · ${statusText(DEVICE_STATUS_TEXT, d?.status)}`)),
    identityPart('sessions', '내 세션', sessions, (data) => renderList(data, '표시할 세션이 없습니다.',
      (s) => `${textOf(s?.id) ?? '세션 ID 없음'} · ${statusText(SESSION_STATUS_TEXT, s?.status)}`)),
  );
  return root;
}

// ---- 14단계: 업무 앱 접근 요청 결과 표시(renderDecision) ----
// 입력: renderDecision({ status, mode, data?, error?, appId }). status는 idle·loading·ok·error.
// data는 { appId, decision, reason, checkedAt }, decision은 allow·deny·challenge·unknown.
// 판정 줄은 「판정: 허용(allow)」처럼 한국어와 원래 값을 함께 쓴다. unknown·목록에 없는 값·요청 실패는
// 허용이나 정상으로 읽히지 않게 「주의」와 「허용되지 않음」을 글자로 붙인다. 요청 실패는 거부 판정과 구분한다.
// allow는 정책상 허용일 뿐 실제 앱 접속 성공을 보장하지 않고, challenge는 이 앱이 추가 인증을 대신하지 않는다.
const DECISION_TEXT = { allow: '허용', deny: '거부', challenge: '추가 확인 필요', unknown: '확인 불가' };
const DECISION_NOTE = {
  allow: '정책상 접근 허용입니다. 실제 앱 접속 성공을 보장하지 않습니다.',
  deny: '정책상 접근 거부입니다. 이 앱에는 지금 접속할 수 없습니다.',
  challenge: '추가 인증 또는 확인이 필요합니다. 이 앱이 확인 절차를 대신 수행하지 않습니다.',
  unknown: '판정을 확인할 수 없습니다. 허용된 것으로 보지 않습니다.',
};

// 판정 시각: 받은 원래 값과 한국 시각을 함께 적는다. 읽을 수 없으면 그 사실을 적는다.
function decisionTime(value) {
  const raw = textOf(value);
  if (!raw) return '판정 시각 정보 없음';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return `${raw} (시각 형식을 확인할 수 없음)`;
  return `${raw} (한국 시각 ${date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })})`;
}

function decisionView(input) {
  const status = input?.status;
  const data = input?.data;
  const appId = textOf(input?.appId) ?? textOf(data?.appId);
  const root = makeNode('section', { attrs: { 'data-testid': 'student-decision-view', 'data-status': status ?? 'unknown', 'aria-label': '업무 앱 접근 요청 결과' } });
  const note = modeNote(input);
  if (note) root.append(note);
  const line = (text, className, attrs) => {
    const node = makeNode('p', { text, className, attrs });
    root.append(node);
    return node;
  };
  // 관제 화면처럼 판정 결과 줄을 크게 보여 준다. 글자 내용은 바꾸지 않으므로 색에 기대지 않고 글자로 구분된다.
  const emphasize = (node) => { node.style.fontSize = '1.4rem'; node.style.fontWeight = '700'; };

  if (status === 'idle') {
    root.setAttribute('data-decision', 'none');
    line('앱을 골라 접속을 요청하세요.', 'state state-empty', { role: 'status' });
    return root;
  }
  if (status === 'loading') {
    root.setAttribute('data-decision', 'pending');
    line(`판정 확인 중 · 요청한 앱: ${appId ?? '앱 ID 정보 없음'}`, 'state state-loading', { role: 'status' });
    return root;
  }
  if (status === 'error') {
    root.setAttribute('data-decision', 'request-failed');
    const message = textOf(input?.error?.message) ?? '서버가 오류 내용을 보내지 않았습니다.';
    const unverified = UNVERIFIED_ERROR_CODES.has(input?.error?.code);
    line(`주의 · 요청 실패${unverified ? '(응답 확인 불가)' : ''}: ${message}`, 'state state-error');
    line('이것은 거부 판정이 아닙니다. 허용된 것도 아닙니다. 필요하면 앱을 골라 직접 다시 요청하세요.', 'muted');
    if (appId) line(`요청한 앱: ${appId}`);
    return root;
  }
  if (status !== 'ok' || data === null || typeof data !== 'object') {
    root.setAttribute('data-decision', 'unknown');
    line('주의 · 판정: 확인 불가(unknown) · 허용되지 않음', 'state state-empty');
    line(status === 'ok' ? '판정 응답 형식이 계약과 맞지 않습니다.' : '판정 상태 정보를 받지 못했습니다.', 'muted');
    return root;
  }

  const raw = typeof data.decision === 'string' && data.decision ? data.decision : 'unknown';
  const known = Object.hasOwn(DECISION_TEXT, raw) && raw !== 'unknown';
  root.setAttribute('data-decision', known ? raw : 'unknown');
  if (known) {
    emphasize(line(`${raw === 'deny' ? '주의 · ' : ''}판정: ${DECISION_TEXT[raw]}(${raw})`, raw === 'allow' ? 'state state-ok' : raw === 'deny' ? 'state state-error' : 'state state-loading'));
    line(DECISION_NOTE[raw], 'muted');
  } else {
    // unknown과 목록에 없는 값은 모두 확인 불가로 보여 주고, 받은 값이 unknown이 아니면 그 값도 적는다.
    emphasize(line(`주의 · 판정: 확인 불가(unknown) · 허용되지 않음${raw !== 'unknown' ? ` · 받은 값: ${raw}` : ''}`, 'state state-empty'));
    line(DECISION_NOTE.unknown, 'muted');
  }
  if (input?.mode === 'demo') line(`${EXAMPLE_SOURCE}: 설명용 예제 판정이며 실제 판정이 아닙니다.`, 'tag tag-demo', { 'data-example-notice': '' });
  const list = makeNode('dl');
  for (const [label, value] of [
    ['앱', appId ?? '앱 ID 정보 없음'],
    ['판정 이유', textOf(data.reason) ?? '판정 이유 정보 없음'],
    ['판정 시각', decisionTime(data.checkedAt)],
  ]) {
    list.append(makeNode('dt', { text: label }), makeNode('dd', { text: value }));
  }
  root.append(list);
  return root;
}

// ---- 15단계: 접속 기록·XDR 경보 목록과 상세 보기(renderEvents) ----
// 입력: renderEvents({ status, mode, data?, error? }). data는 본인 최근 기록 배열(최대 40건, 제공 UI가 범위를 따로 보여 줌).
// 기록: { id, kind, at, appId, summary, evidence:[{id,text}], rules:[{id,text}], state:{access,session,device}, supportedActions }.
// 받은 배열은 복사해서 at 기준 최신순으로 정렬하고, 필터는 받은 배열 안에서만 거른다. 서버에 다시 묻지 않는다.
// 필터 선택은 view 안에 보관한다(새 자료에 그 값이 없으면 all로 되돌림). 상세 선택은 그릴 때마다 비워서
// 다시 불러오면 옛 상세가 남지 않는다. 실행 가능한 조치 버튼은 만들지 않는다(16단계 미지원 안내는 eventDetail에 있음).
const KIND_TEXT = { access: '접속 기록', xdr: 'XDR 경보' };
const ACCESS_STATE_TEXT = { allowed: '허용됨', denied: '거부됨', unknown: '확인 불가' };
const NO_APP_TEXT = '앱을 확인할 수 없음';
let eventsFormSeq = 0; // 한 화면에 여러 번 그려도 label과 select의 id가 겹치지 않게 한다.

const labelWithRaw = (table, value) => {
  const raw = typeof value === 'string' && value ? value : 'unknown';
  return `${Object.hasOwn(table, raw) ? table[raw] : '확인 불가'}(${raw})`;
};
const appValue = (event) => textOf(event?.appId) ?? '';
const appLabel = (value) => (value === '' ? NO_APP_TEXT : value);
const eventTimeMs = (event) => {
  const ms = Date.parse(event?.at);
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
};
const eventTimeText = (value) => {
  const raw = textOf(value);
  if (!raw) return '시각 정보 없음';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? `${raw} (시각 형식을 확인할 수 없음)` : `${raw} (한국 시각 ${date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })})`;
};

// 필터 세 개: 화면 이름, 기록에서 원래 값을 꺼내는 방법, 선택지 글자.
const EVENT_FILTERS = [
  { key: 'kind', name: '기록 종류', valueOf: (e) => (typeof e?.kind === 'string' ? e.kind : ''), textOf: (v) => labelWithRaw(KIND_TEXT, v) },
  { key: 'app', name: '업무 앱', valueOf: appValue, textOf: appLabel },
  { key: 'access', name: '접속 상태', valueOf: (e) => (typeof e?.state?.access === 'string' ? e.state.access : ''), textOf: (v) => labelWithRaw(ACCESS_STATE_TEXT, v) },
];

function textRows(rows, emptyText) {
  const list = makeNode('ul');
  const valid = Array.isArray(rows) ? rows : [];
  if (valid.length === 0) list.append(makeNode('li', { text: emptyText }));
  for (const row of valid) list.append(makeNode('li', { text: `${textOf(row?.id) ?? 'ID 없음'}: ${typeof row?.text === 'string' ? row.text : '내용 없음'}` }));
  return list;
}

function eventDetail(event) {
  const box = makeNode('div', { attrs: { 'data-student-event-detail': event.id, role: 'region', 'aria-label': `${event.id} 상세` } });
  box.append(makeNode('h4', { text: `${event.id} 상세` }));
  const facts = makeNode('dl');
  for (const [label, value] of [
    ['사건 ID', event.id],
    ['앱', textOf(event.appId) ?? NO_APP_TEXT],
    ['종류', labelWithRaw(KIND_TEXT, event.kind)],
    ['시각', eventTimeText(event.at)],
  ]) facts.append(makeNode('dt', { text: label }), makeNode('dd', { text: value }));
  box.append(facts);
  box.append(makeNode('h5', { text: '근거(evidence)' }), textRows(event.evidence, '근거 없음'));
  box.append(makeNode('h5', { text: '규칙(rules)' }), textRows(event.rules, '규칙 없음'));
  box.append(makeNode('h5', { text: '상태(state)' }));
  const states = makeNode('dl');
  for (const [label, value, state] of [
    ['접속 상태(access)', labelWithRaw(ACCESS_STATE_TEXT, event.state?.access), event.state?.access],
    ['세션 상태(session)', statusText(SESSION_STATUS_TEXT, event.state?.session), event.state?.session],
    ['기기 상태(device)', statusText(DEVICE_STATUS_TEXT, event.state?.device), event.state?.device],
  ]) states.append(makeNode('dt', { text: label }), makeNode('dd', { text: value, attrs: { 'data-state': state ?? 'unknown' } }));
  box.append(states);
  // 16단계: 학생 코드에는 조치 실행 연결이 없으므로 넘겨받은 조치는 모두 「<action> 미지원」 비활성 버튼으로만 보여 준다.
  // supportedActions가 비어 있으면 버튼을 만들지 않는다. 버튼에는 클릭 처리를 붙이지 않으며 어떤 요청도 보내지 않는다.
  const actions = Array.isArray(event.supportedActions) ? event.supportedActions.filter((action) => textOf(action)) : [];
  if (actions.length > 0) {
    box.append(makeNode('h5', { text: '조치(supportedActions)' }));
    const group = makeNode('div', { attrs: { role: 'group', 'aria-label': `${event.id} 미지원 조치` } });
    for (const action of actions) {
      const button = makeNode('button', { text: `${action} 미지원`, attrs: { type: 'button', 'aria-disabled': 'true' } });
      button.disabled = true;
      group.append(button);
    }
    box.append(group, makeNode('p', { text: '아직 지원하지 않는 조치입니다. 조치 실행 연결은 준비 중입니다. 이 버튼은 요청을 보내지 않으며, 조치는 실행되지 않았습니다.', className: 'muted' }));
  }
  return box;
}

// ---- 관제 대시보드 바탕: 기록 추이 ----
// 받은 기록 전체를 한국 시각 날짜별로 센다(필터와 무관). 막대는 글자(■)와 숫자를 함께 쓰며 서버에 다시 묻지 않는다.
// 날짜가 3일보다 적으면 추이라고 부르기 어려우므로 부족하다고 알린다. 없는 날짜는 0으로 채우지 않는다.
const TREND_MAX_DAYS = 14;
const TREND_MIN_DAYS = 3;
const TREND_BAR_MAX = 20;
const kstDateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' });
const trendBar = (count) => `${'■'.repeat(Math.min(count, TREND_BAR_MAX))}${count > TREND_BAR_MAX ? '+' : ''}`;

function trendPart(events, input) {
  const demo = input?.mode === 'demo';
  const part = makeNode('div', { attrs: { 'data-part': 'trend', role: 'region', 'aria-label': '기록 추이' } });
  part.append(makeNode('h3', { text: '기록 추이' }), makeNode('p', { text: demo ? EXAMPLE_SOURCE : '서버 응답', className: demo ? 'tag tag-demo' : 'tag' }));
  const perDay = new Map();
  let undated = 0;
  for (const event of events) {
    const ms = Date.parse(event.at);
    if (!Number.isFinite(ms)) { undated += 1; continue; }
    const day = kstDateFormat.format(new Date(ms));
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  const days = [...perDay.keys()].sort();
  const shownDays = days.slice(-TREND_MAX_DAYS);
  part.append(makeNode('p', { text: `집계 대상: 받은 기록 ${events.length}건 · 날짜가 있는 기록 ${events.length - undated}건(${days.length}일)${undated > 0 ? ` · 시각을 읽을 수 없어 제외한 기록 ${undated}건` : ''}`, attrs: { 'data-trend-summary': '' } }));
  if (days.length < TREND_MIN_DAYS) {
    part.append(makeNode('p', { text: `추이를 만들기에 기록이 부족합니다(받은 기록 ${events.length}건, 날짜 ${days.length}일). 아래 숫자는 받은 기록만 센 값이며 변화의 방향을 뜻하지 않습니다.`, className: 'state state-empty', attrs: { role: 'status' } }));
  }
  part.append(makeNode('h4', { text: `날짜별 건수(한국 시각${days.length > shownDays.length ? `, 최근 ${TREND_MAX_DAYS}일` : ''})` }));
  const byDay = makeNode('ul', { attrs: { 'aria-label': '날짜별 기록 건수' } });
  if (shownDays.length === 0) byDay.append(makeNode('li', { text: '날짜를 읽을 수 있는 기록이 없습니다(확인 불가).' }));
  for (const day of shownDays) {
    const count = perDay.get(day);
    const row = makeNode('li', { attrs: { 'data-trend-day': day } });
    row.append(makeNode('span', { text: `${day} · ${count}건 ` }), makeNode('span', { text: trendBar(count), attrs: { 'aria-hidden': 'true' } }));
    byDay.append(row);
  }
  part.append(byDay, makeNode('h4', { text: '접속 상태 분포' }));
  const counts = { allowed: 0, denied: 0, unknown: 0 };
  for (const event of events) counts[Object.hasOwn(counts, event.state?.access) ? event.state.access : 'unknown'] += 1;
  const dist = makeNode('ul', { attrs: { 'aria-label': '접속 상태 분포' } });
  for (const key of Object.keys(counts)) {
    const row = makeNode('li', { attrs: { 'data-trend-access': key } });
    row.append(makeNode('span', { text: `${labelWithRaw(ACCESS_STATE_TEXT, key)} · ${counts[key]}건 ` }), makeNode('span', { text: trendBar(counts[key]), attrs: { 'aria-hidden': 'true' } }));
    dist.append(row);
  }
  part.append(dist);
  return part;
}

function eventsView(input, filters) {
  const status = input?.status;
  const root = makeNode('section', { attrs: { 'data-testid': 'student-events-view', 'data-status': status ?? 'unknown', 'aria-label': '내 접속 기록과 XDR 경보' } });
  const note = modeNote(input);
  if (note) root.append(note);
  const line = (text, className, attrs) => root.append(makeNode('p', { text, className, attrs }));

  if (status === 'loading') {
    line('기록을 불러오는 중', 'state state-loading', { role: 'status' });
    return root;
  }
  if (status === 'error' || (status === 'ok' && !Array.isArray(input?.data))) {
    // 조회 실패는 빈 목록과 다르게 보여 주고, 이전 목록은 남기지 않는다(이 요소는 매번 새로 만든다).
    const unverified = status === 'ok' || UNVERIFIED_ERROR_CODES.has(input?.error?.code);
    const message = status === 'ok' ? '응답 형식이 계약과 맞지 않습니다.' : (textOf(input?.error?.message) ?? '서버가 오류 내용을 보내지 않았습니다.');
    line(`기록을 불러오지 못했습니다${unverified ? '(확인 불가)' : ''}: ${message}`, 'state state-error');
    line('조회 실패이며 기록이 없다는 뜻이 아닙니다. 이전 목록은 표시하지 않습니다.', 'muted');
    return root;
  }
  if (status !== 'ok') {
    line('기록 상태 정보를 받지 못했습니다(확인 불가).', 'state state-empty');
    return root;
  }
  if (input.data.length === 0) {
    line('표시할 기록이 없습니다.', 'state state-empty', { role: 'status' });
    return root;
  }

  // 받은 배열을 복사해 최신순으로 정렬한다. 원본 배열과 기록 객체는 바꾸지 않는다.
  const events = input.data.filter((e) => e !== null && typeof e === 'object' && textOf(e.id)).slice()
    .sort((a, b) => eventTimeMs(b) - eventTimeMs(a));
  const form = makeNode('div', { attrs: { role: 'group', 'aria-label': '기록 필터' } });
  const selects = {};
  const formId = `student-events-${++eventsFormSeq}`;
  for (const filter of EVENT_FILTERS) {
    const values = [...new Set(events.map(filter.valueOf))];
    if (filters[filter.key] !== 'all' && !values.includes(filters[filter.key])) filters[filter.key] = 'all';
    const selectId = `${formId}-${filter.key}`;
    const select = makeNode('select', { attrs: { id: selectId, name: filter.key, 'data-student-filter': filter.key } });
    select.append(makeNode('option', { text: '전체(all)', attrs: { value: 'all' } }));
    for (const value of values) select.append(makeNode('option', { text: filter.textOf(value), attrs: { value } }));
    select.value = filters[filter.key];
    form.append(makeNode('label', { text: filter.name, attrs: { for: selectId } }), select);
    selects[filter.key] = select;
  }
  const count = makeNode('p', { attrs: { role: 'status', 'aria-live': 'polite', 'data-student-event-count': '' } });
  const list = makeNode('ul', { attrs: { 'aria-label': '기록 목록' } });
  const detail = makeNode('div', { attrs: { id: `${formId}-detail` } });
  root.append(trendPart(events, input), form, count, list, detail);
  let selectedId = null; // 상세 선택. 새로 그릴 때마다 비어 있다.

  const showDetail = () => {
    const event = events.find((e) => e.id === selectedId);
    detail.replaceChildren(...(event ? [eventDetail(event)] : []));
    for (const button of list.querySelectorAll('button[data-student-event-button]')) {
      button.setAttribute('aria-expanded', String(button.getAttribute('data-student-event-button') === selectedId));
    }
  };
  const apply = () => {
    const shown = events.filter((e) => EVENT_FILTERS.every((f) => filters[f.key] === 'all' || f.valueOf(e) === filters[f.key]));
    count.textContent = `표시 ${shown.length}건 / 받은 기록 ${events.length}건`;
    list.replaceChildren();
    if (shown.length === 0) list.append(makeNode('li', { text: '선택한 조건에 맞는 기록이 없습니다. 필터를 전체(all)로 바꾸면 다시 보입니다.', className: 'state state-empty' }));
    for (const event of shown) {
      const row = makeNode('li', { attrs: { 'data-student-event-id': event.id } });
      row.append(
        makeNode('p', { text: `${event.id} · ${eventTimeText(event.at)}` }),
        makeNode('p', { text: `종류: ${labelWithRaw(KIND_TEXT, event.kind)} · 앱: ${textOf(event.appId) ?? NO_APP_TEXT}` }),
        makeNode('p', { text: `요약: ${typeof event.summary === 'string' ? event.summary : '요약 없음'}` }),
        // 목록에서도 상태를 글자로 읽게 한다. 거부된 접속은 「주의」를 붙인다(색만으로 구분하지 않음).
        makeNode('p', {
          text: `상태: ${event.state?.access === 'denied' ? '주의 · ' : ''}접속 ${labelWithRaw(ACCESS_STATE_TEXT, event.state?.access)} · 세션 ${statusText(SESSION_STATUS_TEXT, event.state?.session)} · 기기 ${statusText(DEVICE_STATUS_TEXT, event.state?.device)}`,
          attrs: { 'data-student-event-state': event.state?.access ?? 'unknown' },
        }),
      );
      const button = makeNode('button', { text: `${event.id} 상세`, attrs: { type: 'button', 'data-student-event-button': event.id, 'aria-controls': detail.id, 'aria-expanded': 'false' } });
      button.addEventListener('click', () => { selectedId = selectedId === event.id ? null : event.id; showDetail(); });
      row.append(button);
      list.append(row);
    }
    if (selectedId && !shown.some((e) => e.id === selectedId)) selectedId = null;
    showDetail();
  };
  for (const filter of EVENT_FILTERS) {
    selects[filter.key].addEventListener('change', () => { filters[filter.key] = selects[filter.key].value; apply(); });
  }
  apply();
  return root;
}

// ---- 16단계: 기기·세션·알림·진단 정보 상태 표시(renderStatus) ----
// 입력: renderStatus({ devices, sessions, notifications, diagnostics, mode }).
// devices·sessions·diagnostics는 { status, mode, data?, error? }, notifications는 [{ resource, code, message }].
// 불러오는 중·빈 목록·실패·시간 초과를 서로 다른 문장으로 보여 준다. 다시 시도는 사용자가 버튼을 직접 누를 때만 일어나며
// 이 코드는 어떤 요청도 보내지 않는다(자동 재요청 없음). 제공 UI가 다시 불러올 때마다 이 함수를 다시 부르고 칸을 통째로
// 바꾸므로, 다시 불러와 성공하면 이전 실패 안내는 남지 않는다. 진단 정보는 제공 화면이 조회해 넘긴 값만 쓰고
// /api/diagnostics를 직접 부르지 않는다. 화면과 복사에는 정해진 6개 값만 쓰고 ai 항목 같은 나머지 값은 버린다.
const RESOURCE_TEXT = {
  me: '현재 계정', apps: '업무 앱 목록', events: '보안 기록', devices: '기기 목록', sessions: '현재 세션',
  access: '접속 판정', diagnostics: '진단 정보', vulnerabilities: '설치 패키지 조회',
};
const RELOAD_HINT = '다시 시도는 위쪽 「다시 불러오기」 버튼을 직접 누르세요. 자동으로 다시 요청하지 않습니다.';
const DIAG_RELOAD_HINT = '다시 시도는 도움정보 칸의 「도움정보 불러오기」 버튼을 직접 누르세요. 자동으로 다시 요청하지 않습니다.';
const DIAGNOSTIC_FIELDS = [
  ['requestId', (d) => d.requestId],
  ['component', (d) => d.component],
  ['version', (d) => d.version],
  ['checkedAt', (d) => d.checkedAt],
  ['engine.mode', (d) => d.engine?.mode],
  ['engine.code', (d) => d.engine?.code],
];
const SAFE_CODE = /^[A-Za-z0-9_.-]{1,64}$/;
const isTimeout = (code) => typeof code === 'string' && /TIMEOUT$/.test(code);

// 실패 문장: 무엇을 불러오지 못했는지와 message. 시간 초과는 그 사실이 드러나게 쓴다.
function failureText(objectText, error) {
  const message = textOf(error?.message) ?? '서버가 오류 내용을 보내지 않았습니다.';
  if (isTimeout(error?.code)) return `주의 · 시간 초과: ${objectText} 정해진 시간 안에 받지 못했습니다. ${message}`;
  const kind = UNVERIFIED_ERROR_CODES.has(error?.code) ? '확인 불가' : '연결 실패';
  return `주의 · ${kind}: ${objectText} 불러오지 못했습니다. ${message}`;
}

// 한 칸(기기·세션·진단)을 만든다. status가 ok가 아니면 data는 읽지 않는다.
function statusPart(key, { title, objectText, retryHint, idleText }, resource, renderOk) {
  const part = makeNode('div', { attrs: { 'data-part': key, 'data-status': resource?.status ?? 'unknown' } });
  part.append(makeNode('h3', { text: title }));
  const note = modeNote(resource);
  if (note) part.append(note);
  const status = resource?.status;
  if (status === 'loading') {
    part.append(makeNode('p', { text: `불러오는 중: ${objectText} 불러오고 있습니다.`, className: 'state state-loading', attrs: { role: 'status' } }));
  } else if (status === 'idle' && idleText) {
    part.append(makeNode('p', { text: idleText, className: 'state state-empty' }));
  } else if (status === 'error') {
    part.append(
      makeNode('p', { text: failureText(objectText, resource.error), className: 'state state-error', attrs: { 'data-error-code': SAFE_CODE.test(resource.error?.code ?? '') ? resource.error.code : 'unknown' } }),
      makeNode('p', { text: retryHint, className: 'muted' }),
    );
  } else if (status === 'ok') {
    part.append(renderOk(resource.data) ?? makeNode('p', { text: '확인 불가: 응답 형식이 계약과 맞지 않습니다.', className: 'state state-empty' }));
  } else {
    part.append(makeNode('p', { text: '확인 불가: 상태 정보를 받지 못했습니다.', className: 'state state-empty' }));
  }
  return part;
}

// 빈 목록은 실패와 다른 문장으로 보여 준다.
function statusList(data, emptyText, describe) {
  if (!Array.isArray(data)) return null;
  if (data.length === 0) return makeNode('p', { text: `${emptyText} (빈 목록이며 조회 실패가 아닙니다.)`, className: 'state state-empty', attrs: { role: 'status' } });
  const list = makeNode('ul');
  for (const item of data) list.append(makeNode('li', { text: describe(item), attrs: { 'data-state': item?.status ?? 'unknown' } }));
  return list;
}

// 알림 한 건이 상태 주의인지, 자료 조회 실패인지 구분한다. 제공 화면은 실패 알림의 code에 오류 코드를 넣는다.
function notificationKind({ resource, code }) {
  if (resource === 'devices' && Object.hasOwn(DEVICE_STATUS_TEXT, code)) return 'attention';
  if (resource === 'sessions' && Object.hasOwn(SESSION_STATUS_TEXT, code)) return 'attention';
  if (resource === 'events' && Object.hasOwn(KIND_TEXT, code)) return 'attention';
  return 'failure';
}

function notificationsPart(notifications) {
  const part = makeNode('div', { attrs: { 'data-part': 'notifications' } });
  part.append(makeNode('h3', { text: '알림' }));
  if (!Array.isArray(notifications)) {
    part.append(makeNode('p', { text: '확인 불가: 알림 정보를 받지 못했습니다.', className: 'state state-empty' }));
    return part;
  }
  if (notifications.length === 0) {
    part.append(makeNode('p', { text: '주의할 알림이 없습니다(알림 없음).', className: 'state state-empty', attrs: { role: 'status' } }));
    return part;
  }
  const list = makeNode('ul');
  for (const item of notifications) {
    const resource = typeof item?.resource === 'string' && item.resource ? item.resource : 'unknown';
    const code = typeof item?.code === 'string' && SAFE_CODE.test(item.code) ? item.code : 'unknown';
    const message = textOf(item?.message) ?? '알림 내용 없음';
    const kind = code === item?.code ? notificationKind({ resource, code }) : 'failure';
    const head = kind === 'attention' ? '주의 · 확인 필요' : isTimeout(code) ? '주의 · 시간 초과' : '주의 · 조회 실패';
    const row = makeNode('li', { attrs: { 'data-resource': resource, 'data-code': code } });
    row.append(makeNode('p', { text: `${head} · 자료: ${RESOURCE_TEXT[resource] ?? '확인 불가'}(${resource}) · 코드: ${code}` }));
    row.append(makeNode('p', { text: `내용: ${message}` }));
    if (kind === 'failure') {
      row.append(makeNode('p', { text: `할 일: 서버 연결 상태를 확인한 뒤 ${resource === 'diagnostics' ? '도움정보 칸의 「도움정보 불러오기」' : '위쪽 「다시 불러오기」'} 버튼을 직접 누르세요.`, className: 'muted' }));
    }
    list.append(row);
  }
  part.append(list);
  return part;
}

// 진단 결과에서 정해진 6개 값만 꺼낸다. 문자열이 아닌 값은 쓰지 않는다.
function diagnosticPairs(data) {
  if (data === null || typeof data !== 'object') return null;
  return DIAGNOSTIC_FIELDS.map(([name, read]) => [name, textOf(read(data)) ?? '값 없음']);
}

function diagnosticsPart(resource) {
  const part = statusPart('diagnostics', {
    title: '진단 정보(도움정보)',
    objectText: '진단 정보를',
    retryHint: DIAG_RELOAD_HINT,
    idleText: '진단 정보를 아직 불러오지 않았습니다. 필요하면 도움정보 칸의 「도움정보 불러오기」 버튼을 직접 누르세요.',
  }, resource, (data) => {
    const pairs = diagnosticPairs(data);
    if (!pairs) return null;
    const list = makeNode('dl');
    for (const [name, value] of pairs) list.append(makeNode('dt', { text: name }), makeNode('dd', { text: value }));
    return list;
  });
  const pairs = resource?.status === 'ok' ? diagnosticPairs(resource.data) : null;
  const copyText = pairs ? pairs.map(([name, value]) => `${name}: ${value}`).join('\n') : '';
  part.append(makeNode('p', {
    text: '「도움정보 복사」는 도움을 요청할 때 쓰도록 위의 6개 값(requestId·component·version·checkedAt·engine.mode·engine.code)만 클립보드에 복사합니다. 버튼을 누를 때만 복사하며 어디에도 자동으로 전송하지 않습니다. 비밀번호·토큰·API 키는 넣지 않습니다.',
    className: 'muted',
  }));
  const button = makeNode('button', { text: '도움정보 복사', attrs: { type: 'button' } });
  const result = makeNode('p', { attrs: { role: 'status', 'aria-live': 'polite' } });
  if (!copyText) {
    button.disabled = true;
    result.textContent = '진단 정보를 불러온 뒤에 복사할 수 있습니다.';
  }
  button.addEventListener('click', async () => {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
      result.textContent = '도움정보 6개 값을 클립보드에 복사했습니다. 붙여 넣기 전에 내용을 직접 확인하세요.';
    } catch {
      // 자동 복사를 쓸 수 없으면 같은 내용을 보여 주고 선택해 둔다. 사용자가 Ctrl+C로 복사한다.
      const fallback = makeNode('pre', { text: copyText, attrs: { tabindex: '0' } });
      result.replaceChildren(makeNode('span', { text: '자동 복사를 사용할 수 없습니다. 아래 선택된 내용을 Ctrl+C로 복사하세요.' }), fallback);
      const range = document.createRange();
      range.selectNodeContents(fallback);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      fallback.focus();
    }
  });
  part.append(button, result);
  return part;
}

// ---- 관제 대시보드 바탕: 상태 카드 네 개(기기·세션·알림·진단) ----
// 카드 값은 제공 화면이 넘긴 자료만 센다. 연결이 없거나 실패한 자료는 숫자를 만들지 않고 「확인 불가」로 둔다.
// 출처 글자: 「예시 값」(예제 자료, 실제 조회 결과 아님) · 「서버 응답」 · 「연결 없음」 · 「확인 불가」. 색만으로 구분하지 않는다.
const EXAMPLE_SOURCE = '예시 값(예제 자료, 실제 조회 결과 아님)';

function cardSource(resource) {
  if (resource?.mode === 'demo') return { text: EXAMPLE_SOURCE, kind: 'example' };
  if (resource?.status === 'ok') return { text: '서버 응답', kind: 'server' };
  if (resource?.status === 'error') return UNVERIFIED_ERROR_CODES.has(resource.error?.code) ? { text: '확인 불가', kind: 'unknown' } : { text: '연결 없음', kind: 'none' };
  return { text: '확인 불가', kind: 'unknown' };
}

function dashCard(key, title, source, value, detail) {
  const card = makeNode('div', { className: 'card', attrs: { 'data-card': key, 'data-source': source.kind } });
  const valueNode = makeNode('p', { text: value, attrs: { 'data-card-value': '' } });
  valueNode.style.fontSize = '1.4rem';
  valueNode.style.fontWeight = '700';
  card.append(
    makeNode('h3', { text: title }),
    makeNode('p', { text: source.text, className: source.kind === 'example' ? 'tag tag-demo' : 'tag' }),
    valueNode,
    makeNode('p', { text: detail, className: 'muted' }),
  );
  return card;
}

// 기기·세션 카드: 목록 길이와 상태별 개수. 주의 상태(미충족·만료·철회)는 따로 센다.
function countCard(key, title, resource, unit, goodText, goodStatus) {
  const source = cardSource(resource);
  if (resource?.status === 'loading') return dashCard(key, title, source, '불러오는 중', `${title} 자료를 불러오고 있습니다.`);
  if (resource?.status === 'error') return dashCard(key, title, source, '확인 불가', '조회 실패이며 0개라는 뜻이 아닙니다. 위쪽 「다시 불러오기」 버튼을 직접 누르세요.');
  if (resource?.status !== 'ok' || !Array.isArray(resource.data)) return dashCard(key, title, source, '확인 불가', '상태 정보를 받지 못했습니다.');
  const list = resource.data;
  const good = list.filter((item) => item?.status === goodStatus).length;
  const attention = list.filter((item) => ATTENTION_STATUSES.has(item?.status)).length;
  const unknown = list.length - good - attention;
  return dashCard(key, title, source, `${list.length}${unit}`, list.length === 0
    ? '빈 목록이며 조회 실패가 아닙니다.'
    : `${goodText} ${good} · 주의 ${attention} · 확인 불가 ${unknown}`);
}

function notificationsCard(input) {
  const notifications = input?.notifications;
  const source = input?.mode === 'demo' ? { text: EXAMPLE_SOURCE, kind: 'example' } : { text: '이 화면이 받은 자료로 집계', kind: 'local' };
  if (!Array.isArray(notifications)) return dashCard('notifications', '알림', source, '확인 불가', '알림 정보를 받지 못했습니다.');
  const attention = notifications.filter((item) => notificationKind({ resource: item?.resource, code: item?.code }) === 'attention').length;
  return dashCard('notifications', '알림', source, `${notifications.length}건`, `확인 필요 ${attention} · 조회 실패 ${notifications.length - attention}`);
}

function diagnosticsCard(resource) {
  const source = cardSource(resource);
  const status = resource?.status;
  if (status === 'loading') return dashCard('diagnostics', '진단', source, '불러오는 중', '진단 정보를 불러오고 있습니다.');
  if (status === 'idle') return dashCard('diagnostics', '진단', { text: '아직 불러오지 않음', kind: 'unknown' }, '확인 불가', '도움정보 칸의 「도움정보 불러오기」 버튼을 직접 누르면 표시됩니다.');
  if (status === 'error') return dashCard('diagnostics', '진단', source, '확인 불가', '진단 정보를 불러오지 못했습니다. 아래 진단 칸의 안내를 확인하세요.');
  const pairs = status === 'ok' ? diagnosticPairs(resource.data) : null;
  if (!pairs) return dashCard('diagnostics', '진단', source, '확인 불가', '상태 정보를 받지 못했습니다.');
  const value = (name) => pairs.find(([field]) => field === name)?.[1] ?? '값 없음';
  return dashCard('diagnostics', '진단', source, '응답 확인', `engine.mode: ${value('engine.mode')} · engine.code: ${value('engine.code')}`);
}

function dashboardCards(input) {
  const section = makeNode('section', { attrs: { 'data-part': 'dashboard-cards', 'aria-label': '상태 카드 네 개' } });
  const grid = makeNode('div', { className: 'grid-2' });
  grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(11rem, 1fr))';
  grid.append(
    countCard('devices', '기기', input?.devices, '대', '충족', 'compliant'),
    countCard('sessions', '세션', input?.sessions, '개', '활성', 'active'),
    notificationsCard(input),
    diagnosticsCard(input?.diagnostics),
  );
  section.append(
    grid,
    makeNode('p', { text: '표시 구분: 「예시 값」은 설명용 예제 자료이며 실제 조회 결과가 아닙니다. 「실측」은 이 PC에서 아래 버튼을 눌러 직접 잰 값입니다. 연결이 없으면 숫자를 만들지 않고 「확인 불가」로 둡니다.', className: 'muted', attrs: { 'data-legend': '' } }),
  );
  return section;
}

// ---- 내 PC 실측: 사용자가 버튼을 누를 때만 허용된 GET 5개를 한 번씩 부르고 걸린 시간을 잰다 ----
// 자동 반복·자동 재시도는 없다. 결과는 createStudentView 안의 measure 객체에 보관해, 제공 화면이 칸을 다시 그려도 마지막 측정이 남는다.
const MEASURE_PATHS = ['/api/me', '/api/apps', '/api/events', '/api/devices', '/api/sessions'];
const kstTimeText = (iso) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

// ---- 내 PC 상태: 브라우저가 일반 권한으로 알려 주는 값만 읽는다(관리자 권한·설치·외부 요청 없음) ----
// 제공 기능에는 CPU·메모리·디스크를 읽는 경로가 없다. 학생 코드는 브라우저 안에서만 돌므로 읽을 수 있는 값이 정해져 있다.
// 읽지 못한 값은 숫자를 만들지 않고 「확인 불가」와 이유를 보여 준다. 예시 값은 이 칸에 쓰지 않는다.
const HISTORY_MAX = 10;
const MB = 1048576;
const PC_REASON = {
  cpu: '브라우저는 CPU 사용률을 알려 주지 않습니다. 읽으려면 서버 코드를 고쳐야 하는데 제공 파일은 고치지 않는 원칙이라 읽지 않았습니다.',
  disk: '브라우저는 디스크 남은 공간을 알려 주지 않습니다. 브라우저가 알려 주는 저장소 사용량은 이 사이트의 값이며 디스크 여유 공간이 아닙니다.',
  heap: '이 브라우저는 자바스크립트 메모리 사용량(performance.memory)을 알려 주지 않습니다. Chrome과 Edge에서만 읽힙니다.',
  device: '이 브라우저는 기기 메모리 총량(navigator.deviceMemory)을 알려 주지 않습니다.',
};

function readPcState() {
  const heap = performance.memory?.usedJSHeapSize;
  const device = navigator.deviceMemory;
  return { at: new Date().toISOString(), heapMB: Number.isFinite(heap) ? heap / MB : null, deviceGB: Number.isFinite(device) ? device : null };
}

async function runMeasure(api, measure, onChange) {
  if (measure.running || typeof api?.get !== 'function') return;
  measure.running = true;
  measure.rows = [];
  measure.at = null;
  onChange?.();
  for (const path of MEASURE_PATHS) {
    const start = performance.now();
    let result = null;
    try { result = await api.get(path); } catch { result = null; }
    const ms = performance.now() - start;
    const code = result?.ok === true ? null : (SAFE_CODE.test(result?.error?.code ?? '') ? result.error.code : 'unknown');
    measure.rows.push({ path, ms, ok: result?.ok === true, code });
  }
  measure.running = false;
  measure.at = new Date().toISOString();
  measure.pc = readPcState();
  // 비교용 기록은 이 화면의 메모리에만 둔다. 화면을 새로 열면 사라지고 어디에도 저장하거나 보내지 않는다.
  measure.history.push({ at: measure.at, pc: measure.pc, rows: measure.rows.map((row) => ({ ...row })) });
  if (measure.history.length > HISTORY_MAX) measure.history.shift();
  onChange?.();
  document.querySelector('[data-measure-button]')?.focus();
}

const kstClock = (iso) => new Date(iso).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' });

// 네 줄: CPU 사용률, 메모리(이 탭), 기기 메모리 총량(참고), 디스크 남은 공간. 값마다 단위와 잰 시각을 붙인다.
function pcStateList(pc) {
  const rows = [
    { key: 'cpu', name: 'CPU 사용률', value: null, unit: '%', always: true },
    { key: 'heap', name: '메모리 사용량(이 탭의 자바스크립트, PC 전체 아님)', value: pc?.heapMB ?? null, unit: 'MB', digits: 1 },
    { key: 'device', name: '기기 메모리 총량(브라우저가 알려 준 근사값, 참고)', value: pc?.deviceGB ?? null, unit: 'GB', digits: 0 },
    { key: 'disk', name: '디스크 남은 공간', value: null, unit: 'GB', always: true },
  ];
  const list = makeNode('ul', { attrs: { 'aria-label': '내 PC 상태' } });
  for (const row of rows) {
    let text;
    if (row.value !== null) text = `${row.name}: ${row.value.toFixed(row.digits)} ${row.unit} · 잰 시각 ${kstTimeText(pc.at)}(한국 시각) · 실측(브라우저가 알려 준 값)`;
    else if (row.always || pc) text = `${row.name}: 확인 불가 · 이유: ${PC_REASON[row.key]}`;
    else text = `${row.name}: 아직 측정하지 않음`;
    list.append(makeNode('li', { text, attrs: { 'data-pc': row.key, 'data-available': String(row.value !== null) } }));
  }
  return list;
}

// 직전 측정과 지금 측정을 비교한다. 응답 실패나 읽지 못한 값은 비교하지 않고 그 사실을 적는다.
function comparisonTable(history) {
  const prev = history.at(-2);
  const cur = history.at(-1);
  const items = [
    ...MEASURE_PATHS.map((path) => ({ label: `응답 시간 GET ${path}`, unit: 'ms', miss: '응답 실패', read: (entry) => { const row = entry.rows.find((r) => r.path === path); return row?.ok ? row.ms : null; } })),
    { label: '메모리 사용량(이 탭의 자바스크립트)', unit: 'MB', miss: '확인 불가', read: (entry) => entry.pc?.heapMB ?? null },
  ];
  const table = makeNode('table', { attrs: { 'aria-label': '직전 측정과 지금 측정 비교' } });
  const head = makeNode('thead');
  const headRow = makeNode('tr');
  for (const title of ['항목', `직전(${kstClock(prev.at)})`, `지금(${kstClock(cur.at)})`, '차이', '단위']) headRow.append(makeNode('th', { text: title, attrs: { scope: 'col' } }));
  head.append(headRow);
  const body = makeNode('tbody');
  for (const item of items) {
    const before = item.read(prev);
    const now = item.read(cur);
    let diff = '비교 불가';
    if (before !== null && now !== null) {
      const gap = now - before;
      diff = Math.abs(gap) < 0.05 ? '변화 없음' : `${Math.abs(gap).toFixed(1)} ${gap > 0 ? '증가' : '감소'}`;
    }
    const row = makeNode('tr', { attrs: { 'data-compare': item.label } });
    for (const cell of [item.label, before === null ? item.miss : before.toFixed(1), now === null ? item.miss : now.toFixed(1), diff, item.unit]) row.append(makeNode('td', { text: cell }));
    body.append(row);
  }
  table.append(head, body);
  return table;
}

function measurePart(context) {
  const { measure, canMeasure, start } = context;
  const part = makeNode('div', { attrs: { 'data-part': 'measure', role: 'region', 'aria-label': '내 PC 상태' } });
  part.append(
    makeNode('h3', { text: '내 PC 상태 (실측, 학생 구현)' }),
    makeNode('p', { text: '제공 기능에는 CPU·메모리·디스크 표시가 없어 학생 코드가 직접 읽습니다. 관리자 권한 없이 브라우저가 알려 주는 값만 쓰며, 이 PC에서 버튼을 눌러 잰 실측입니다. 응답 시간은 예제 모드에서는 예제 서버, 연결이 없을 때는 오류 응답까지 걸린 시간입니다. 이 칸에는 예시 값을 쓰지 않습니다.', className: 'muted' }),
    pcStateList(measure.running ? null : measure.pc),
  );
  const button = makeNode('button', { text: measure.running ? '측정 중' : '내 PC 상태 측정', className: 'btn', attrs: { type: 'button', 'data-measure-button': '' } });
  button.disabled = measure.running || !canMeasure;
  button.addEventListener('click', start);
  part.append(button);
  if (!canMeasure) part.append(makeNode('p', { text: '측정 도구를 받지 못해 측정할 수 없습니다(확인 불가).', className: 'state state-empty' }));
  if (measure.running) {
    part.append(makeNode('p', { text: `측정 중: ${measure.rows.length}/${MEASURE_PATHS.length}개 완료`, className: 'state state-loading', attrs: { role: 'status' } }));
  } else if (measure.rows.length === 0) {
    part.append(makeNode('p', { text: '아직 측정하지 않았습니다. 버튼을 누르면 허용된 조회 주소 5개를 한 번씩 부릅니다. 자동으로 반복하지 않습니다.', className: 'state state-empty' }));
  } else {
    const list = makeNode('ul', { attrs: { 'aria-label': '실측 결과' } });
    for (const row of measure.rows) {
      list.append(makeNode('li', { text: `실측 · GET ${row.path} · ${row.ok ? '응답 성공' : `응답 실패(${row.code})`} · ${row.ms.toFixed(1)}ms`, attrs: { 'data-ok': String(row.ok) } }));
    }
    part.append(list, makeNode('p', { text: `측정 시각 ${kstTimeText(measure.at)}(한국 시각) · 1회 측정이며 누를 때마다 값이 달라집니다.`, className: 'muted' }));
    part.append(makeNode('h4', { text: `추이 비교 (측정 ${measure.history.length}회, 최대 ${HISTORY_MAX}회 보관)` }));
    if (measure.history.length < 2) {
      part.append(makeNode('p', { text: '비교하려면 한 번 더 측정하세요. 직전 측정이 없어 아직 비교하지 않습니다.', className: 'state state-empty', attrs: { role: 'status' } }));
    } else {
      part.append(
        comparisonTable(measure.history),
        makeNode('p', { text: '응답 시간은 누를 때마다 조금씩 달라지는 값이며 차이가 곧 문제를 뜻하지 않습니다. 메모리는 이 탭의 값이고 PC 전체 사용량이 아닙니다. 비교 기록은 이 화면의 메모리에만 있고 화면을 새로 열면 사라집니다.', className: 'muted' }),
      );
    }
  }
  return part;
}

// ---- SDP 연결 상태: 회사 시스템(SDP) 연결 여부만 따로 보여 준다. 아래 PC 점검 결과와 섞지 않는다 ----
function sdpState(input) {
  const parts = [input?.devices, input?.sessions].filter((resource) => resource && typeof resource === 'object');
  if (input?.mode === 'demo' || parts.some((resource) => resource.mode === 'demo')) {
    return { kind: 'example', label: '예제 자료(SDP 아님)', detail: '예제 모드입니다. 실제 SDP 서버에 연결된 것이 아니며 이 값은 예시 값입니다.' };
  }
  if (parts.some((resource) => resource.status === 'ok')) return { kind: 'connected', label: 'SDP 연결됨', detail: '서버가 SDP 쪽 자료를 응답했습니다.' };
  if (parts.length > 0 && parts.every((resource) => resource.status === 'loading')) return { kind: 'loading', label: '확인 중', detail: 'SDP 연결 여부를 확인하고 있습니다.' };
  if (parts.some((resource) => resource.mode === 'disconnected' || resource.error?.code === 'ENGINE_NOT_CONNECTED')) {
    return { kind: 'disconnected', label: 'SDP 미연결', detail: 'SDP 연결 설정이 없어 서버가 「연결 없음」으로 응답했습니다(ENGINE_NOT_CONNECTED). PC 점검이 성공해도 SDP가 연결된 것이 아닙니다.' };
  }
  return { kind: 'unknown', label: '확인 불가', detail: 'SDP 연결 여부를 확인할 수 없습니다. 연결된 것으로 보지 않습니다.' };
}

function sdpPart(input) {
  const state = sdpState(input);
  const part = makeNode('div', { className: 'card', attrs: { 'data-part': 'sdp-status', 'data-sdp': state.kind } });
  part.append(
    makeNode('h3', { text: 'SDP 연결 상태(회사 시스템)' }),
    makeNode('p', { text: state.label, className: state.kind === 'example' ? 'tag tag-demo' : 'tag' }),
    makeNode('p', { text: state.detail, className: 'muted' }),
  );
  return part;
}

// ---- 내 PC 점검: 네트워크 구성·방화벽·Windows 기록 건수 ----
// 브라우저는 이 값들을 읽을 수 없다. student/collect-pc-info.ps1(읽기 전용, 일반 권한)이 남긴 파일을 사용자가 직접 골라 불러온다.
// 화면은 파일 내용을 검증해 보여 줄 뿐 OS를 읽거나 설정을 바꾸지 않는다. 건수는 침해·공격 탐지 결과가 아니다.
// 형식이 맞지 않는 항목은 숫자를 만들지 않고 「확인 불가」로 둔다. 이 칸에는 예시 값을 쓰지 않는다.
const PCINFO_SCHEMA = 'hth.pcinfo.v1';
const PCINFO_MAX_BYTES = 100000;
const PCINFO_HISTORY_MAX = 10;
const PCINFO_STALE_MIN = 60;
const PCINFO_REASON = {
  access_denied: '관리자 권한이 필요해 읽지 않았습니다. 권한을 올리거나 설정을 바꾸려 하지 않았습니다.',
  command_failed: '읽기 명령이 실패해 읽지 못했습니다.',
  not_supported: '이 PC에서 지원하지 않는 항목입니다.',
};
const FIREWALL_NAME_TEXT = { Domain: '도메인', Private: '개인', Public: '공용' };
const FIREWALL_INBOUND = ['Block', 'Allow', 'NotConfigured'];
const PCINFO_LOGS = ['System', 'Application'];
let pcFileSeq = 0;
const countOf = (value, max = 1000000) => Number.isSafeInteger(value) && value >= 0 && value <= max;

// 항목 하나를 검증한다. 이상이 있으면 그 항목만 invalid로 두고 다른 항목은 살린다.
function pcSection(raw, build) {
  if (raw === null || typeof raw !== 'object') return { status: 'invalid' };
  if (raw.status === 'unavailable') return Object.hasOwn(PCINFO_REASON, raw.reason) ? { status: 'unavailable', reason: raw.reason } : { status: 'invalid' };
  if (raw.status !== 'ok') return { status: 'invalid' };
  try { return build(raw) ?? { status: 'invalid' }; } catch { return { status: 'invalid' }; }
}

function pcNetwork(raw) {
  return pcSection(raw, (r) => {
    const a = r.adapters;
    if (!a || ![a.total, a.up, a.wired, a.wireless, a.other, r.ipv4Configured, r.gatewayConfigured, r.dnsConfigured].every((v) => countOf(v, 1000))) return null;
    return { status: 'ok', adapters: { total: a.total, up: a.up, wired: a.wired, wireless: a.wireless, other: a.other }, ipv4: r.ipv4Configured, gateway: r.gatewayConfigured, dns: r.dnsConfigured };
  });
}

function pcFirewall(raw) {
  return pcSection(raw, (r) => {
    if (!Array.isArray(r.profiles) || r.profiles.length === 0 || r.profiles.length > 3) return null;
    const names = new Set();
    const profiles = [];
    for (const p of r.profiles) {
      if (!Object.hasOwn(FIREWALL_NAME_TEXT, p?.name) || names.has(p.name) || typeof p.enabled !== 'boolean' || !FIREWALL_INBOUND.includes(p.defaultInbound)) return null;
      names.add(p.name);
      profiles.push({ name: p.name, enabled: p.enabled, defaultInbound: p.defaultInbound });
    }
    return { status: 'ok', profiles };
  });
}

function pcEventLogs(raw, windowHours) {
  if (raw === null || typeof raw !== 'object' || !Array.isArray(raw.logs) || raw.windowHours !== windowHours) return { status: 'invalid' };
  const logs = {};
  for (const name of PCINFO_LOGS) {
    const entry = raw.logs.find((item) => item?.log === name);
    logs[name] = pcSection(entry, (e) => (countOf(e.errors, 10000) && countOf(e.warnings, 10000) ? { status: 'ok', errors: e.errors, warnings: e.warnings, truncated: e.truncated === true } : null));
  }
  return { status: 'ok', logs };
}

function parsePcInfo(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { return { ok: false, reason: 'JSON 형식이 아닙니다.' }; }
  if (raw === null || typeof raw !== 'object' || raw.schema !== PCINFO_SCHEMA) return { ok: false, reason: `schema가 ${PCINFO_SCHEMA}이 아닙니다. 수집 스크립트가 만든 파일을 고르세요.` };
  const ms = typeof raw.collectedAt === 'string' ? Date.parse(raw.collectedAt) : Number.NaN;
  if (!Number.isFinite(ms)) return { ok: false, reason: '잰 시각(collectedAt)을 읽을 수 없습니다.' };
  if (ms > Date.now() + 5 * 60000) return { ok: false, reason: '잰 시각이 지금보다 미래입니다. PC 시계나 파일을 확인하세요.' };
  if (!Number.isSafeInteger(raw.windowHours) || raw.windowHours < 1 || raw.windowHours > 168) return { ok: false, reason: '기록 확인 기간(windowHours)이 올바르지 않습니다.' };
  return {
    ok: true,
    data: { collectedMs: ms, loadedAt: new Date().toISOString(), windowHours: raw.windowHours, network: pcNetwork(raw.network), firewall: pcFirewall(raw.firewall), eventLogs: pcEventLogs(raw.eventLogs, raw.windowHours) },
  };
}

async function loadPcFile(file, pcInfo, onChange) {
  if (!file) return;
  pcInfo.error = null;
  if (file.size > PCINFO_MAX_BYTES) pcInfo.error = `파일이 너무 큽니다(${file.size}바이트, 한도 ${PCINFO_MAX_BYTES}바이트). 수집 스크립트가 만든 파일이 맞는지 확인하세요.`;
  else {
    let text = null;
    try { text = await file.text(); } catch { pcInfo.error = '파일을 읽지 못했습니다.'; }
    if (text !== null) {
      const parsed = parsePcInfo(text);
      if (parsed.ok) {
        pcInfo.history.push(parsed.data);
        if (pcInfo.history.length > PCINFO_HISTORY_MAX) pcInfo.history.shift();
      } else pcInfo.error = parsed.reason;
    }
  }
  onChange?.();
  document.querySelector('[data-pc-file]')?.focus();
}

function pcAge(ms) {
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return minutes > PCINFO_STALE_MIN ? `주의 · 오래된 값, ${minutes}분 전` : `${minutes}분 전`;
}

function pcBlock(key, title, unit, section, lines, collectedMs) {
  const block = makeNode('div', { attrs: { 'data-pc-block': key, 'data-status': section.status } });
  block.append(makeNode('h4', { text: title }), makeNode('p', { text: `불러온 파일 값(실측) · 잰 시각 ${kstTimeText(new Date(collectedMs).toISOString())}(한국 시각, ${pcAge(collectedMs)}) · 단위 ${unit}`, className: 'muted' }));
  const list = makeNode('ul');
  if (section.status === 'ok') for (const line of lines(section)) list.append(makeNode('li', { text: line }));
  else if (section.status === 'unavailable') list.append(makeNode('li', { text: `확인 불가 · 이유: ${PCINFO_REASON[section.reason]}`, className: 'state state-empty' }));
  else list.append(makeNode('li', { text: '확인 불가 · 이유: 파일에서 이 항목의 형식이 맞지 않아 숫자를 만들지 않았습니다.', className: 'state state-empty' }));
  block.append(list);
  return block;
}

function pcCompare(prev, cur) {
  const logCount = (name, field) => (entry) => (entry.eventLogs.status === 'ok' && entry.eventLogs.logs[name].status === 'ok' ? entry.eventLogs.logs[name][field] : null);
  const items = [
    ['System 오류', '건', logCount('System', 'errors')],
    ['System 경고', '건', logCount('System', 'warnings')],
    ['Application 오류', '건', logCount('Application', 'errors')],
    ['Application 경고', '건', logCount('Application', 'warnings')],
    ['연결된 어댑터', '개', (entry) => (entry.network.status === 'ok' ? entry.network.adapters.up : null)],
    ['켜진 방화벽 프로필', '개', (entry) => (entry.firewall.status === 'ok' ? entry.firewall.profiles.filter((p) => p.enabled).length : null)],
  ];
  const sameWindow = prev.windowHours === cur.windowHours;
  const table = makeNode('table', { attrs: { 'aria-label': '직전 PC 점검과 지금 PC 점검 비교' } });
  const head = makeNode('thead');
  const headRow = makeNode('tr');
  for (const title of ['항목', `직전(${kstClock(new Date(prev.collectedMs).toISOString())})`, `지금(${kstClock(new Date(cur.collectedMs).toISOString())})`, '차이', '단위']) headRow.append(makeNode('th', { text: title, attrs: { scope: 'col' } }));
  head.append(headRow);
  const body = makeNode('tbody');
  for (const [label, unit, read] of items) {
    const before = read(prev);
    const now = read(cur);
    let diff = '비교 불가';
    if (sameWindow && before !== null && now !== null) diff = now === before ? '변화 없음' : `${Math.abs(now - before)} ${now > before ? '증가' : '감소'}`;
    const row = makeNode('tr', { attrs: { 'data-pc-compare': label } });
    for (const cell of [label, before === null ? '확인 불가' : before, now === null ? '확인 불가' : now, diff, unit]) row.append(makeNode('td', { text: cell }));
    body.append(row);
  }
  table.append(head, body);
  return table;
}

function pcCheckPart(context) {
  const { pcInfo, onPcFile } = context;
  const part = makeNode('div', { attrs: { 'data-part': 'pc-check', role: 'region', 'aria-label': '내 PC 점검' } });
  part.append(
    makeNode('h3', { text: '내 PC 점검 (읽기 전용, 학생 구현)' }),
    makeNode('p', { text: '이 칸의 건수는 침해나 공격 탐지 결과가 아닙니다. Windows가 남긴 경고·오류 기록의 개수일 뿐입니다. 방화벽과 보안 설정은 읽기만 하며 바꾸지 않습니다. 관리자 권한이 필요한 항목은 바꾸려 하지 않고 「확인 불가」와 이유로 표시합니다. 이 칸에는 예시 값을 쓰지 않습니다.', className: 'muted', attrs: { 'data-pc-notice': '' } }),
    makeNode('p', { text: '값은 브라우저가 직접 읽은 것이 아니라 읽기 전용 수집 스크립트가 일반 권한으로 읽어 파일에 남긴 값을 사용자가 불러온 것입니다. 실제 주소, MAC, 무선 이름, 컴퓨터 이름은 수집하지 않습니다.', className: 'muted' }),
    makeNode('p', { text: '1) on-client 폴더에서 실행: powershell -NoProfile -ExecutionPolicy Bypass -File .\\student\\collect-pc-info.ps1', className: 'muted' }),
    makeNode('p', { text: '2) 아래 「PC 점검 파일 선택」에서 %TEMP%\\hth-pc-info.json 을 고릅니다(파일 선택 창 주소칸에 붙여 넣으세요). 파일을 고를 때만 불러오며 자동으로 읽지 않습니다.', className: 'muted' }),
  );
  const fileId = `student-pc-file-${++pcFileSeq}`;
  const input = makeNode('input', { attrs: { type: 'file', id: fileId, accept: '.json,application/json', 'data-pc-file': '' } });
  input.addEventListener('change', () => onPcFile(input.files?.[0]));
  part.append(makeNode('label', { text: 'PC 점검 파일 선택 ', attrs: { for: fileId } }), input);
  if (pcInfo.error) part.append(makeNode('p', { text: `불러오지 못했습니다(확인 불가): ${pcInfo.error}`, className: 'state state-error', attrs: { role: 'status', 'data-pc-error': '' } }));
  const cur = pcInfo.history.at(-1);
  if (!cur) {
    part.append(makeNode('p', { text: 'PC 점검 파일을 아직 불러오지 않았습니다(확인 불가). 값을 만들어 보여 주지 않습니다.', className: 'state state-empty', attrs: { role: 'status' } }));
    return part;
  }
  part.append(
    pcBlock('network', '네트워크 구성(주소 제외)', '개', cur.network, (n) => [
      `어댑터 ${n.adapters.total}개 중 연결됨 ${n.adapters.up}개 (유선 ${n.adapters.wired}개, 무선 ${n.adapters.wireless}개, 기타 ${n.adapters.other}개)`,
      `연결된 어댑터 중 IPv4 설정 ${n.ipv4}개 · 기본 게이트웨이 설정 ${n.gateway}개 · DNS 설정 ${n.dns}개`,
    ], cur.collectedMs),
    pcBlock('firewall', '방화벽 설정(읽기만 함)', '켜짐·꺼짐', cur.firewall, (f) => [
      ...f.profiles.map((p) => `${FIREWALL_NAME_TEXT[p.name]} 프로필(${p.name}): ${p.enabled ? '켜짐' : '주의 · 꺼짐'} · 기본 인바운드 동작 ${p.defaultInbound}`),
      'NotConfigured는 따로 지정하지 않고 Windows 기본 동작을 따른다는 표시입니다.',
    ], cur.collectedMs),
  );
  const logs = makeNode('div', { attrs: { 'data-pc-block': 'events', 'data-status': cur.eventLogs.status } });
  logs.append(makeNode('h4', { text: `Windows 기록의 경고·오류 건수(최근 ${cur.windowHours}시간)` }), makeNode('p', { text: `불러온 파일 값(실측) · 잰 시각 ${kstTimeText(new Date(cur.collectedMs).toISOString())}(한국 시각, ${pcAge(cur.collectedMs)}) · 단위 건 · 침해나 공격 탐지 결과가 아닙니다`, className: 'muted' }));
  const logList = makeNode('ul');
  for (const name of PCINFO_LOGS) {
    const entry = cur.eventLogs.status === 'ok' ? cur.eventLogs.logs[name] : { status: 'invalid' };
    let text;
    if (entry.status === 'ok') text = `${name}: 오류 ${entry.errors}건 · 경고 ${entry.warnings}건${entry.truncated ? ' (세는 상한 10000건에서 멈춤)' : ''}`;
    else if (entry.status === 'unavailable') text = `${name}: 확인 불가 · 이유: ${PCINFO_REASON[entry.reason]}`;
    else text = `${name}: 확인 불가 · 이유: 파일에서 이 항목의 형식이 맞지 않아 숫자를 만들지 않았습니다.`;
    logList.append(makeNode('li', { text, attrs: { 'data-pc-log': name, 'data-status': entry.status } }));
  }
  logList.append(makeNode('li', { text: 'Security: 확인 불가 · 이유: 관리자 권한이 필요해 읽지 않습니다(바꾸려 하지 않음).', attrs: { 'data-pc-log': 'Security', 'data-status': 'unavailable' } }));
  logs.append(logList);
  part.append(logs, makeNode('h4', { text: `PC 점검 비교 (불러온 파일 ${pcInfo.history.length}개, 최대 ${PCINFO_HISTORY_MAX}개 보관)` }));
  if (pcInfo.history.length < 2) {
    part.append(makeNode('p', { text: '비교하려면 수집 스크립트를 다시 실행해 한 번 더 불러오세요. 직전 점검이 없어 아직 비교하지 않습니다.', className: 'state state-empty', attrs: { role: 'status' } }));
  } else {
    part.append(pcCompare(pcInfo.history.at(-2), cur), makeNode('p', { text: '비교 기록은 이 화면의 메모리에만 있고 화면을 새로 열면 사라집니다. 건수의 차이는 침해나 공격 여부를 뜻하지 않습니다.', className: 'muted' }));
  }
  return part;
}

function statusView(input, measureContext) {
  const root = makeNode('section', { attrs: { 'data-testid': 'student-status-view', 'aria-label': '기기·세션·알림·진단 정보 상태' } });
  const note = modeNote(input);
  if (note) root.append(note);
  root.append(dashboardCards(input), sdpPart(input));
  if (measureContext) root.append(measurePart(measureContext));
  if (measureContext?.pcInfo) root.append(pcCheckPart(measureContext));
  root.append(
    statusPart('devices', { title: '등록 기기', objectText: '기기 목록을', retryHint: RELOAD_HINT }, input?.devices,
      (data) => statusList(data, '등록된 기기가 없음',
        (d) => `${nameAndId(d)} · 상태: ${statusText(DEVICE_STATUS_TEXT, d?.status)}`)),
  );
  const sessions = statusPart('sessions', { title: '현재 세션', objectText: '현재 세션을', retryHint: RELOAD_HINT }, input?.sessions,
    (data) => statusList(data, '현재 연결 없음',
      (s) => `${textOf(s?.id) ?? '세션 ID 없음'} · 상태: ${statusText(SESSION_STATUS_TEXT, s?.status)}`));
  sessions.append(makeNode('p', { text: '세션은 지금 검증된 연결 하나만 표시합니다. 지난 세션 목록이 아닙니다.', className: 'muted' }));
  root.append(sessions, notificationsPart(input?.notifications), diagnosticsPart(input?.diagnostics));
  return root;
}

// ---- 17단계: 앱 내부 AI 연결 상태 표시(renderAiConnection)와 사건 설명 기초(renderExplanation) ----
// 입력: renderAiConnection({ status, mode, data?, error?, checkedAt, explanationAccepted:false }).
// data는 { transportChecked:true, audienceAuthorization:'test'|'verified', modelCount, help }.
// 연결 점검은 모델 목록 응답만 확인한다. 사건 설명을 실행한 것이 아니므로 그렇게 적지 않는다.
// 제공 UI가 상태가 바뀔 때마다 이 함수를 다시 부르고 칸을 통째로 바꾼다. 이전 결과를 기억하지 않으므로
// 다시 점검해 성공하거나 idle로 돌아오면 이전 오류·모델 수가 남지 않는다. 다시 점검은 사용자가 버튼을 직접 누를 때만 한다.
// error.code·message는 제공 UI가 정한 안전한 값만 온다. 화면에는 그 둘만 쓰고 열쇠나 서버 원문은 쓰지 않는다.
const AI_AUTHORIZATION_TEXT = { test: '시험 연결 점검(test)', verified: '앱 권한 확인 후 점검(verified)' };
const AI_AUTHORIZATION_NOTE = {
  test: '시험 연결(transport)의 모델 응답만 확인했습니다. 앱 권한이 확인된 연결은 아닙니다.',
  verified: '점검 시각 기준으로 앱 권한을 확인했고 모델 응답을 받았습니다.',
};
// 제공 화면의 버튼 이름: AI 연결 점검 칸의 「AI 연결 점검」, AI 연결 칸에서 연결 완료 뒤 보이는 「현재 API 연결 점검」.
const AI_CHECK_BUTTONS = '「AI 연결 점검」 버튼이나 AI 연결 칸에 나타나는 「현재 API 연결 점검」 버튼';
const AI_MANUAL_RETRY = `다시 점검은 ${AI_CHECK_BUTTONS}을 직접 누르세요. 자동으로 다시 점검하지 않습니다.`;
// 오류 코드 → 원인 분류와 할 일. 표에 없는 코드는 확인 불가로 본다.
const AI_ERROR_GROUPS = [
  { name: '권한 준비 중', codes: ['ON_AI_PROVISIONING_PENDING'],
    todo: '학생 잘못이 아닙니다. 운영 측의 계정·앱 권한 준비가 끝나야 연결됩니다. 담당자에게 계정 연결과 앱 권한 확인을 요청하세요.' },
  { name: '권한 변경', codes: ['ON_AI_AUTHORIZATION_CHANGED'],
    todo: '점검 도중 권한이 바뀌었습니다. 다시 점검하기 전에 담당자에게 현재 계정 연결과 앱 권한을 확인하세요.' },
  { name: '인증 실패', codes: ['WB_CLCO_AUTH_REQUIRED'],
    todo: '보호 현황의 계정 연결 확인과 AI 연결 절차를 다시 확인하고, 해결되지 않으면 담당자에게 확인하세요. 열쇠를 복사해 붙이지 마세요.' },
  { name: '접근 제한', codes: ['WB_CLCO_ACCESS_BLOCKED'],
    todo: '계정 연결을 다시 확인하고, 담당자에게 학생 앱 이용 권한을 확인하세요.' },
  { name: '사용량·이용 한도', codes: ['WB_CLCO_COHORT_BUDGET_EXHAUSTED', 'WB_CLCO_LIMIT_REACHED'],
    todo: '반 사용량이나 이용 한도에 도달했습니다. 담당자에게 확인하세요.' },
  { name: '이용 시간 아님', codes: ['WB_CLCO_SESSION_CLOSED'],
    todo: '지금은 AI 이용 시간이 아닙니다. 이용 시간을 확인한 뒤 직접 다시 점검하세요.' },
  { name: '요청 제한', codes: ['WB_CLCO_RATE_LIMITED'],
    todo: '요청이 잠시 제한됐습니다. 잠시 뒤 직접 다시 점검하세요.' },
  { name: '시간 초과', codes: ['WB_CLCO_TIMEOUT', 'REQUEST_TIMEOUT', 'ENGINE_TIMEOUT', 'TIMEOUT'],
    todo: '응답이 정해진 시간 안에 오지 않았습니다. 잠시 뒤 직접 다시 점검하세요.' },
  { name: '네트워크 오류', codes: ['NETWORK_ERROR', 'NETWORK'],
    todo: '앱 서버와의 연결을 확인한 뒤 잠시 뒤 직접 다시 점검하세요.' },
  { name: '취소', codes: ['WB_CLCO_CANCELLED', 'CANCELLED', 'REQUEST_CANCELLED'],
    todo: '점검을 취소했습니다. 이전 결과는 현재 결과가 아닙니다. 필요하면 직접 다시 점검하세요.' },
  { name: '쓸 수 있는 모델 없음', codes: ['ON_AI_MODEL_LIST_EMPTY', 'MODEL_NOT_CONFIGURED'],
    todo: '현재 권한으로 쓸 수 있는 모델이 없습니다. 담당자에게 모델 허용 설정 확인을 요청하세요.' },
];
const AI_UNVERIFIED_GROUP = { name: '확인 불가', todo: '연결이나 응답을 확인할 수 없습니다. 연결된 것으로 보지 않습니다. 담당자에게 계정 연결과 앱 권한 확인을 요청하세요.' };

const safeCode = (code) => (typeof code === 'string' && SAFE_CODE.test(code) ? code : 'unknown');
const aiErrorGroup = (code) => AI_ERROR_GROUPS.find((group) => group.codes.includes(code)) ?? AI_UNVERIFIED_GROUP;

function aiConnectionView(input) {
  const status = input?.status;
  const root = makeNode('section', { attrs: { 'data-testid': 'student-ai-connection-view', 'data-status': status ?? 'unknown', 'aria-label': '앱 내부 AI 연결 점검 결과' } });
  const note = modeNote(input);
  if (note) root.append(note);
  const line = (text, className, attrs) => root.append(makeNode('p', { text, className, attrs }));

  if (status === 'idle') {
    line('AI 연결 점검 전', 'state state-empty', { role: 'status' });
    line('아직 점검하지 않았습니다. 설정이 있다는 것만으로 연결이나 이용 권한이 확인된 것은 아닙니다.', 'muted');
    line(`점검은 ${AI_CHECK_BUTTONS}을 직접 누르세요. 자동으로 점검하지 않습니다.`, 'muted');
    return root;
  }
  if (status === 'loading') {
    line('AI 연결 점검 중', 'state state-loading', { role: 'status' });
    line('결과가 오기 전입니다. 점검을 멈추려면 「AI 연결 점검 취소」를 누르세요.', 'muted');
    return root;
  }
  if (status === 'error') {
    const code = safeCode(input?.error?.code);
    const group = aiErrorGroup(code);
    root.setAttribute('data-error-code', code);
    line(`주의 · AI 연결 점검 실패 · 원인: ${group.name}`, 'state state-error');
    line(`오류 코드: ${code} · 내용: ${textOf(input?.error?.message) ?? '오류 내용 없음'}`);
    line(`할 일: ${group.todo}`, 'muted');
    line('연결이 확인되지 않았습니다. 이전 점검 결과(모델 수 등)는 현재 결과가 아닙니다.', 'muted');
    line(AI_MANUAL_RETRY, 'muted');
    return root;
  }
  const data = input?.data;
  const level = data?.audienceAuthorization;
  if (status !== 'ok' || data?.transportChecked !== true || !Object.hasOwn(AI_AUTHORIZATION_TEXT, level) || !Number.isInteger(data?.modelCount)) {
    line(`주의 · AI 연결 점검 결과: 확인 불가 · 연결된 것으로 보지 않습니다.`, 'state state-empty');
    line(status === 'ok' ? '점검 응답 형식이 계약과 맞지 않습니다.' : '점검 상태 정보를 받지 못했습니다.', 'muted');
    return root;
  }
  root.setAttribute('data-authorization', level);
  line(`AI 연결 점검 결과: ${AI_AUTHORIZATION_TEXT[level]}`, level === 'verified' ? 'state state-ok' : 'state state-loading');
  line(AI_AUTHORIZATION_NOTE[level], 'muted');
  const list = makeNode('dl');
  for (const [label, value] of [
    ['응답 모델 수(modelCount)', `${data.modelCount}개`],
    ['점검 시각(checkedAt)', eventTimeText(input.checkedAt)],
    ['사건 설명', '아직 실행하지 않음'],
  ]) list.append(makeNode('dt', { text: label }), makeNode('dd', { text: value }));
  root.append(list);
  line('이 점검은 모델 목록 응답만 확인했습니다. 사건 설명은 아직 실행하지 않았습니다. 사건 설명은 보안 기록에서 따로 요청하고 결과를 확인하세요.', 'muted');
  line(AI_MANUAL_RETRY, 'muted');
  return root;
}

// 입력: renderExplanation({ event, explanation, checkedAt }). explanation은 { status, mode, data?, error? }.
// data는 { summary, evidenceIds, proposals:[{action,evidenceIds,reason}], requiresHumanConfirmation:true, executed:false }.
// 제공 UI가 이미 검사해 맞지 않으면 error로 넘기지만, 학생 코드도 근거 ID·실행 여부·지원 조치를 다시 대조한다.
// 맞지 않는 설명은 쓸 수 없다고 보여 주고 내용은 보여 주지 않는다. 없는 근거 ID를 만들어 맞추지 않는다.
// 이 함수는 이전 설명을 기억하지 않는다. 제공 UI가 칸을 통째로 바꾸므로 다른 기록·다시 불러오기·실패 때 이전 설명과
// 성공 속성(data-student-explanation-event)이 남지 않는다. 성공 속성은 검사를 모두 통과한 설명에만 붙인다. 실행 버튼은 만들지 않는다.
const STATE_NAME_TEXT = { access: '접속', session: '세션', device: '기기' };
const KNOWN_STATE_VALUES = ['allowed', 'denied', 'active', 'expired', 'revoked', 'compliant', 'noncompliant'];
const SECRET_LIKE = /(sk-[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{10,}|bearer\s+[A-Za-z0-9._-]{8,}|(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*\S+|BEGIN [A-Z ]*PRIVATE KEY)/i;
const EXPLANATION_ERROR_REASON = {
  ON_AI_INVALID_INPUT: '근거 부족·입력 오류: 설명에 필요한 사건 근거·규칙을 확인할 수 없어 설명을 요청하지 않았거나 만들 수 없습니다.',
  ON_AI_INVALID_OUTPUT: '근거 불일치·형식 오류: AI 응답의 근거·조치·형식이 이 기록과 맞지 않거나 이미 실행했다는 응답입니다. 이 설명은 쓸 수 없습니다.',
  SUBJECT_SCOPE_UNVERIFIED: '확인 불가: 현재 로그인과 사건·프로젝트의 연결을 확인할 수 없습니다.',
  AI_REQUEST_UNVERIFIED: '확인 불가: AI 연결 또는 응답을 확인할 수 없습니다. 기존 기록을 확인하세요.',
};

// 설명 데이터와 기록을 대조한다. 맞지 않는 까닭 목록을 돌려주고, 비어 있으면 쓸 수 있는 설명이다.
function explanationProblems(event, data) {
  const problems = [];
  const evidence = Array.isArray(event?.evidence) ? event.evidence.filter((row) => textOf(row?.id)) : [];
  const evidenceIds = new Set(evidence.map((row) => row.id));
  if (evidence.length === 0) problems.push('이 기록에 근거가 없어 설명을 쓸 수 없습니다.');
  if (data === null || typeof data !== 'object') return [...problems, '설명 응답 형식을 확인할 수 없습니다.'];
  if (!textOf(data.summary)) problems.push('설명 요약이 없습니다.');
  else if (SECRET_LIKE.test(data.summary)) problems.push('요약에 비밀값처럼 보이는 표기가 있습니다.');
  const cited = Array.isArray(data.evidenceIds) ? data.evidenceIds : null;
  if (!cited || cited.length === 0) problems.push('인용한 근거 ID가 없습니다.');
  else {
    const unknownRefs = cited.filter((ref) => !evidenceIds.has(ref));
    if (unknownRefs.length > 0) problems.push(`이 기록에 없는 근거 ID를 인용했습니다: ${unknownRefs.map((ref) => String(ref)).join(', ')}`);
    if (new Set(cited).size !== cited.length) problems.push('같은 근거 ID를 중복해 인용했습니다.');
    const missing = [...evidenceIds].filter((id) => !cited.includes(id));
    if (missing.length > 0) problems.push(`이 기록의 근거를 빠뜨렸습니다: ${missing.join(', ')}`);
  }
  if (data.executed !== false) problems.push('AI가 이미 실행했다고 답한 설명은 쓸 수 없습니다.');
  if (data.requiresHumanConfirmation !== true) problems.push('사람 확인이 필요하다는 표시가 없습니다.');
  const supported = Array.isArray(event?.supportedActions) ? event.supportedActions : [];
  if (!Array.isArray(data.proposals)) problems.push('제안 목록 형식을 확인할 수 없습니다.');
  else for (const proposal of data.proposals) {
    if (!textOf(proposal?.action) || !supported.includes(proposal.action)) problems.push(`지원하지 않는 조치를 제안했습니다: ${textOf(proposal?.action) ?? '조치 이름 없음'}`);
    else if (!textOf(proposal.reason) || SECRET_LIKE.test(proposal.reason)) problems.push(`제안 이유를 확인할 수 없습니다: ${proposal.action}`);
    else if (!Array.isArray(proposal.evidenceIds) || proposal.evidenceIds.length === 0 || proposal.evidenceIds.some((ref) => !evidenceIds.has(ref))) problems.push(`제안의 근거 ID가 이 기록과 맞지 않습니다: ${proposal.action}`);
  }
  return problems;
}

function explanationView(input) {
  const explanation = input?.explanation;
  const status = explanation?.status;
  const event = input?.event;
  const eventId = textOf(event?.id);
  const root = makeNode('section', { attrs: { 'data-testid': 'student-explanation-view', 'data-status': status ?? 'unknown', 'aria-label': 'AI 사건 설명' } });
  const line = (text, className, attrs) => root.append(makeNode('p', { text, className, attrs }));
  const note = modeNote(explanation);
  if (note) root.append(note);

  if (status === 'error') {
    // event가 null이면 기록 선택 안내를 먼저 보여 주고, 이어서 실패 이유(근거 부족 등)를 보여 준다. 성공 속성은 붙이지 않는다.
    if (!eventId) line('보안 기록에서 기록을 먼저 고르세요', 'state state-empty', { role: 'status' });
    const code = safeCode(explanation?.error?.code);
    const reason = EXPLANATION_ERROR_REASON[code] ?? `${aiErrorGroup(code).name}: ${aiErrorGroup(code).todo}`;
    line(`주의 · AI 설명 실패 · 오류 코드: ${code}`, 'state state-error');
    line(`내용: ${textOf(explanation?.error?.message) ?? '오류 내용 없음'}`);
    line(`이유: ${reason}`);
    line(`${eventId ? `사건 ${eventId}의 ` : ''}기록은 그대로입니다. AI 설명이 실패해도 보안 기록과 업무 앱 판정은 바뀌지 않으며 과제 실패가 아닙니다.`, 'muted');
    return root;
  }
  if (!eventId) {
    line('보안 기록에서 기록을 먼저 고르세요', 'state state-empty', { role: 'status' });
    line('사건 설명은 보안 기록에서 사건을 골라 직접 요청합니다. 기록을 고르기 전에는 설명이 없습니다.', 'muted');
    return root;
  }
  if (status === 'loading') {
    line(`AI 설명 요청 중 · 사건 ID: ${eventId}`, 'state state-loading', { role: 'status' });
    line('설명이 도착하기 전에는 근거와 요약을 표시하지 않습니다.', 'muted');
    return root;
  }
  if (status !== 'ok') {
    line('AI 사건 설명 요청 전', 'state state-empty', { role: 'status' });
    line(`선택한 사건: ${eventId} · 설명을 요청하면 이 자리에 표시됩니다. 자동으로 요청하지 않습니다.`, 'muted');
    return root;
  }

  const data = explanation.data;
  const problems = explanationProblems(event, data);
  if (problems.length > 0) {
    // 맞지 않는 설명: 내용(요약·제안)은 보여 주지 않고 까닭만 보여 준다. 성공 속성은 붙이지 않는다.
    root.setAttribute('data-status', 'rejected');
    line(`주의 · 이 AI 설명은 쓸 수 없습니다(근거가 맞지 않음) · 사건 ID: ${eventId}`, 'state state-error');
    const list = makeNode('ul');
    for (const problem of problems) list.append(makeNode('li', { text: problem }));
    root.append(list);
    line('기록은 그대로입니다. 설명을 만들어 맞추지 않으며 과제 실패가 아닙니다.', 'muted');
    return root;
  }

  root.setAttribute('data-student-explanation-event', eventId);
  line(`사건 ID: ${eventId}`);
  root.append(makeNode('h4', { text: 'AI 설명(참고용)' }));
  line('이 요약은 AI가 이 기록을 읽고 쓴 해석입니다. 사실 판단은 아래 근거 글과 연동 시스템이 알려 준 상태로 하세요.', 'muted');
  line(data.summary);
  line(`설명 시각: ${eventTimeText(input?.checkedAt)}`, 'muted');

  const evidenceText = new Map(event.evidence.map((row) => [row.id, typeof row.text === 'string' ? row.text : '근거 글 없음']));
  root.append(makeNode('h4', { text: '인용한 근거' }));
  const evidenceList = makeNode('ul');
  for (const ref of data.evidenceIds) evidenceList.append(makeNode('li', { text: `${ref} — ${evidenceText.get(ref)}` }));
  root.append(evidenceList);

  root.append(makeNode('h4', { text: '규칙' }));
  const rules = Array.isArray(event.rules) ? event.rules : [];
  const ruleList = makeNode('ul');
  if (rules.length === 0) ruleList.append(makeNode('li', { text: '규칙 없음' }));
  for (const rule of rules) ruleList.append(makeNode('li', { text: `${textOf(rule?.id) ?? 'ID 없음'} — ${typeof rule?.text === 'string' ? rule.text : '규칙 글 없음'}` }));
  root.append(ruleList);

  root.append(makeNode('h4', { text: '확인 불가 상태' }));
  const unknowns = Object.keys(STATE_NAME_TEXT).filter((key) => !KNOWN_STATE_VALUES.includes(event.state?.[key]));
  if (unknowns.length === 0) line('없음', 'muted');
  else {
    const unknownList = makeNode('ul');
    for (const key of unknowns) {
      const raw = textOf(event.state?.[key]);
      unknownList.append(makeNode('li', { text: `${STATE_NAME_TEXT[key]}: 확인 불가(${raw ?? '값 없음'})`, attrs: { 'data-state-key': key } }));
    }
    root.append(unknownList);
    line('확인 불가는 정상이나 안전이 아닙니다. 확인되기 전에는 안전한 것으로 보지 않습니다.', 'muted');
  }

  root.append(makeNode('h4', { text: '조치 제안' }));
  if (data.proposals.length === 0) {
    const noSupport = !Array.isArray(event.supportedActions) || event.supportedActions.length === 0;
    line(noSupport ? '연동 시스템이 지원하는 조치가 없어 제안이 없습니다(정상).' : 'AI가 제안한 조치가 없습니다.', 'muted', { 'data-student-no-proposals': '' });
    line('AI는 아무것도 실행하지 않았습니다.', 'muted');
  } else {
    const proposalList = makeNode('ul');
    for (const proposal of data.proposals) {
      proposalList.append(makeNode('li', { text: `${proposal.action} — ${proposal.reason} (근거 ${proposal.evidenceIds.join(', ')}) · 사람 확인이 필요하며 실행되지 않았습니다.` }));
    }
    root.append(proposalList);
    line('제안은 참고 정보이며 아직 실행되지 않았습니다. 이 칸에는 실행 버튼이 없습니다.', 'muted');
  }
  return root;
}

// ---- 19단계: 보안 조치 요청 상태와 실제 결과 구분(renderAction) ----
// 입력: renderAction({ status, event, actionId, target, receipt, observation, message, confirmationExpiresAt?, error? }).
// status: idle·loading·executing·prepared·pending·succeeded·denied·failed·unknown·error·expired.
// 조치 버튼·POST 요청·확인 티켓은 학생 코드에 없다. 사람 확인과 집행은 제공 화면의 버튼으로 한다(티켓은 학생 함수에 전달되지 않음).
// 서버 접수 응답(ACK)은 효과 확인이 아니다. 「효과 확인」은 status가 succeeded이면서 observation.effectApplied가 true일 때만 쓴다.
// 이 함수는 이전 값을 기억하지 않는다. 제공 UI가 칸을 통째로 바꾸므로 새 입력이 오면 이전 대상·요청·결과가 남지 않는다.
const ACTION_STATUS_TEXT = {
  idle: '아직 미실행(idle)',
  loading: '조치 준비 또는 결과 조회 중(loading)',
  prepared: '준비됨 · 미실행(prepared)',
  executing: '서버에 전달 중(executing)',
  pending: '서버 접수·처리 중(pending)',
  succeeded: '효과 확인(succeeded)',
  denied: '거절(denied)',
  failed: '실패(failed)',
  unknown: '결과 불명(unknown)',
  expired: '확인 기한 지남(expired)',
  error: '요청이 처리되지 않음(error)',
};
// 요청이 있는 상태에서만 사건·요청 속성을 붙인다. idle·loading·error·expired는 현재 요청이 아니다.
const ACTION_BOUND_STATUSES = new Set(['prepared', 'executing', 'pending', 'succeeded', 'denied', 'failed', 'unknown']);
const ACTION_ATTENTION_STATUSES = new Set(['denied', 'failed', 'unknown', 'expired', 'error']);
const ACTION_ID_TEXT = /^[A-Za-z0-9._:-]{1,100}$/;
const actionIdText = (value) => (typeof value === 'string' && ACTION_ID_TEXT.test(value) ? value : null);
const actionVersionText = (value) => (Number.isSafeInteger(value) && value > 0 ? String(value) : null);

function actionView(input) {
  const raw = typeof input?.status === 'string' ? input.status : 'unknown-status';
  const known = Object.hasOwn(ACTION_STATUS_TEXT, raw);
  const eventId = actionIdText(input?.event?.id);
  const actionId = actionIdText(input?.actionId);
  const receipt = input?.receipt !== null && typeof input?.receipt === 'object' ? input.receipt : null;
  const requestId = actionIdText(receipt?.requestId);
  const root = makeNode('section', { attrs: { 'data-testid': 'student-action-view', 'data-status': known ? raw : 'unknown', 'aria-label': '보안 조치 요청 상태' } });
  const line = (text, className, attrs) => root.append(makeNode('p', { text, className, attrs }));

  // 응답이 현재 사건·조치와 맞는지 확인한다. 맞지 않으면 그 응답을 쓰지 않고 결과 불명으로 처리한다.
  const mismatch = receipt !== null && ((receipt.eventId !== undefined && receipt.eventId !== input?.event?.id)
    || (receipt.actionId !== undefined && receipt.actionId !== input?.actionId));
  // succeeded는 효과 관측이 확인된 경우에만 효과 확인으로 본다. 아니면 결과 불명으로 처리한다.
  const observation = input?.observation !== null && typeof input?.observation === 'object' ? input.observation : null;
  const effectConfirmed = raw === 'succeeded' && observation?.effectApplied === true && textOf(observation?.observedAt) !== null;
  let shown = known ? raw : 'unknown';
  if (raw === 'succeeded' && !effectConfirmed) shown = 'unknown';
  if (mismatch && ACTION_BOUND_STATUSES.has(shown)) shown = 'unknown';

  if (shown === 'succeeded') root.setAttribute('data-effect-confirmed', 'true');
  if (ACTION_BOUND_STATUSES.has(shown) && !mismatch && eventId && requestId) {
    root.setAttribute('data-student-action-event', eventId);
    root.setAttribute('data-student-action-request', requestId);
  }

  const attention = ACTION_ATTENTION_STATUSES.has(shown) || !known;
  const headline = !known ? `결과 불명(unknown) · 알 수 없는 상태값: ${actionIdText(input?.status) ?? '값 없음'}` : ACTION_STATUS_TEXT[shown];
  line(`${attention ? '주의 · ' : ''}${headline}`, shown === 'succeeded' ? 'state state-ok' : attention ? 'state state-error' : 'state state-loading', { role: 'status' });

  if (shown === 'idle') {
    line(textOf(input?.message) ?? '조치 제안은 아직 실행되지 않았습니다.', 'muted');
    line('조치 준비 버튼은 연동 시스템이 지원하는 조치가 있는 기록에서만 나타납니다. 지원하는 조치가 없으면 버튼이 나오지 않는 것이 정상입니다.', 'muted');
    return root;
  }
  if (shown === 'loading') {
    line('조치 준비 또는 연동 시스템 결과를 조회하는 중입니다. 아직 결과가 없고 실행된 것으로 보지 않습니다.', 'muted');
  } else if (shown === 'prepared') {
    line('이 조치는 준비만 되었고 실행되지 않았습니다. 아래 대상과 확인 기한을 읽고, 제공 화면의 「대상과 조치를 확인했으며 집행합니다」 버튼을 사람이 직접 눌러야 서버에 전달됩니다. 이 칸에는 버튼이 없습니다.', 'muted');
  } else if (shown === 'executing') {
    line('사람이 확인한 조치를 서버에 전달하는 중입니다. 결과가 아직 없습니다.', 'muted');
  } else if (shown === 'pending') {
    line('서버가 요청을 받아 처리하는 중입니다. 서버가 받았다는 응답(ACK)은 접수 응답일 뿐 효과가 관측된 것이 아닙니다. 결과가 아직 확인되지 않았습니다.', 'muted');
    line('효과는 제공 화면의 「연동 시스템 결과만 재조회」를 직접 눌러 확인하세요.', 'muted');
  } else if (shown === 'succeeded') {
    line('연동 시스템이 효과를 관측한 결과입니다.', 'muted');
  } else if (shown === 'denied' || shown === 'failed') {
    line(`${shown === 'denied' ? '연동 시스템이 조치를 거절했습니다.' : '조치 처리에 실패했습니다.'} ${textOf(input?.message) ?? textOf(input?.error?.message) ?? '서버가 내용을 보내지 않았습니다.'}`);
    line('효과가 적용되었다고 보지 않습니다. 필요하면 근거를 확인하고 담당자와 판단하세요.', 'muted');
  } else if (shown === 'unknown') {
    if (mismatch) line('받은 응답의 사건 또는 조치가 현재 조치와 맞지 않아 그 응답을 쓰지 않습니다.', 'muted');
    else if (raw === 'succeeded') line('성공 응답이 왔지만 효과 관측(effectApplied: true와 관측 시각)이 확인되지 않아 효과가 적용된 것으로 보지 않습니다.', 'muted');
    line('성공으로도 효과 없음으로도 판단하지 않습니다. 이미 서버에 전달됐을 수 있습니다. 제공 화면의 「연동 시스템 결과만 재조회」를 직접 눌러 결과만 확인하세요.', 'muted');
    if (textOf(input?.error?.message)) line(`안내: ${textOf(input.error.message)}`, 'muted');
  } else if (shown === 'expired') {
    line('사람 확인 기한이 지났습니다. 이 조치는 실행되지 않았습니다. 조치를 다시 준비하고 대상을 확인하세요.', 'muted');
  } else if (shown === 'error') {
    const code = safeCode(input?.error?.code);
    line(`오류 코드: ${code} · 내용: ${textOf(input?.error?.message) ?? '오류 내용 없음'}`);
    line('요청이 처리되지 않았습니다. 필요하면 기록에서 조치를 다시 준비하세요.', 'muted');
  }

  // 받은 범위에서만 현재 조치의 값을 보여 준다. 없는 값은 만들지 않는다.
  const rows = [];
  if (eventId) rows.push(['사건 ID', eventId]);
  const evidence = Array.isArray(input?.event?.evidence) ? input.event.evidence.map((row) => actionIdText(row?.id)).filter(Boolean) : [];
  if (evidence.length > 0) rows.push(['근거 ID', evidence.join(', ')]);
  if (actionId) rows.push(['조치(actionId)', actionId]);
  if (input?.target && actionIdText(input.target.id)) rows.push(['대상(target.id)', actionIdText(input.target.id)]);
  if (input?.target && Number.isSafeInteger(input.target.generation)) rows.push(['세대(generation)', String(input.target.generation)]);
  if (requestId) rows.push(['요청 ID(requestId)', requestId]);
  if (actionIdText(receipt?.receiptId)) rows.push(['영수증 ID(receiptId)', receipt.receiptId]);
  if (actionVersionText(receipt?.version)) rows.push(['버전(version)', actionVersionText(receipt.version)]);
  if ((shown === 'prepared' || shown === 'expired') && textOf(input?.confirmationExpiresAt)) rows.push(['확인 기한', eventTimeText(input.confirmationExpiresAt)]);
  if (shown === 'succeeded') {
    rows.push(['관측 시각(observedAt)', eventTimeText(observation.observedAt)], ['effectApplied', 'true']);
  }
  if (rows.length > 0) {
    const list = makeNode('dl');
    for (const [label, value] of rows) list.append(makeNode('dt', { text: label }), makeNode('dd', { text: value }));
    root.append(list);
  }
  if (receipt?.superseded === true) line('이전 조회는 최신 결과를 대신하지 않습니다(superseded).', 'muted');
  return root;
}

// ---- 20단계: 설치 패키지 버전과 알려진 취약점 조회 결과(renderVulnerabilities) ----
// 입력: renderVulnerabilities({ status, mode, data?, error? }). status는 idle·loading·error·ok.
// data.status: complete·partial·not_checked·not_configured·unverifiable. data는 lockfileVersion·lockfileHash·checkedAt·packages 등.
// packages: [{ name, version, status, vulnerabilities:[{id, modified}], source, checkedAt }], status는 known_vulnerabilities·none_found·unverifiable.
// 조회는 사용자가 제공 화면의 버튼을 직접 눌러야 시작한다. 학생 코드에는 요청과 버튼이 없다.
// 이 함수는 이전 값을 기억하지 않는다. 제공 UI가 칸을 통째로 바꾸므로 조회 중·오류·취소 때 이전 표가 남지 않는다.
// 조회 실패·미조회·미설정은 「알려진 항목 없음」이 아니다. 버전은 설치된 정확한 버전만 쓰고 ^1.2.0 같은 범위 표기는 쓰지 않는다.
const VULN_SCAN_TEXT = {
  complete: '모두 조회(complete)',
  partial: '일부 조회 실패(partial)',
  not_checked: '아직 조회 안 함(not_checked)',
  not_configured: '조회 준비 미완료(not_configured)',
  unverifiable: 'lock 파일 확인 불가(unverifiable)',
};
const VULN_SCAN_NOTE = {
  complete: '조회 대상으로 승인된 패키지를 모두 조회했습니다. 조회 대상에서 제외된 패키지는 이 결과에 포함되지 않습니다.',
  partial: '일부 패키지의 조회가 실패했습니다. 조회하지 못한 패키지는 확인 불가로 표시하고, 이미 받은 취약점 ID는 지우지 않고 그대로 표시합니다.',
  not_checked: '조회 대상으로 승인된 공개 패키지가 없어 조회하지 않았습니다. 미조회 상태이며 조회 결과가 아닙니다.',
  not_configured: '조회할 프로젝트가 설정되지 않았습니다. 프로젝트 설정은 운영자가 준비하며 학생이 임의로 바꾸지 않습니다. 조회하지 않은 상태입니다.',
  unverifiable: 'package-lock.json을 확인할 수 없어 설치 패키지 목록을 만들지 못했습니다. 조회하지 않은 상태입니다.',
};
const VULN_ATTENTION_SCANS = new Set(['partial', 'unverifiable']);
const VULN_ERROR_REASON = [
  { codes: ['CANCELLED', 'REQUEST_CANCELLED'], text: '취소: 조회를 멈췄습니다. 조회가 끝나지 않았으므로 결과가 없고, 이전 결과는 현재 결과가 아닙니다.' },
  { codes: ['TIMEOUT', 'REQUEST_TIMEOUT'], text: '시간 초과: 응답이 늦어 중단했습니다. 잠시 뒤 직접 다시 조회하세요.' },
  { codes: ['CONTRACT_MISMATCH'], text: '확인 불가: 응답 형식이 계약과 맞지 않아 결과를 표시하지 않습니다.' },
];
const VULN_RETRY = '다시 조회는 제공 화면의 「설치 패키지 조회」 버튼을 직접 누르세요. 자동으로 다시 조회하지 않습니다.';
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

// 패키지 한 개의 조회 상태 문구. 상태와 취약점 목록이 서로 맞지 않으면 확인 불가로 본다.
function packageStatusLabel(pkg) {
  const count = Array.isArray(pkg.vulnerabilities) ? pkg.vulnerabilities.length : 0;
  if (pkg.status === 'known_vulnerabilities' && count > 0) return '주의 · 알려진 항목 있음(known_vulnerabilities)';
  if (pkg.status === 'none_found' && count === 0) return '알려진 항목 없음(none_found) · 조회한 범위와 시각 기준이며 안전하다는 보장은 아닙니다';
  if (pkg.status === 'unverifiable') return count > 0 ? '주의 · 일부 확인·전체 조회 확인 불가(unverifiable)' : '주의 · 조회 확인 불가(unverifiable)';
  return `주의 · 확인 불가(상태와 취약점 목록이 맞지 않거나 알 수 없는 값: ${textOf(pkg.status) ?? '값 없음'})`;
}

function packageRow(pkg) {
  const name = textOf(pkg?.name);
  const version = textOf(pkg?.version);
  const exact = version !== null && EXACT_VERSION.test(version);
  const attrs = { 'data-package-status': textOf(pkg?.status) ?? 'unknown' };
  if (name) attrs['data-student-package-name'] = name;
  if (exact) attrs['data-student-package-version'] = version;
  const row = makeNode('tr', { attrs });
  const cell = (text) => { const td = makeNode('td', { text }); row.append(td); return td; };
  cell(name ?? '이름 확인 불가');
  cell(exact ? version : '설치 버전 확인 불가(정확한 버전이 아님)');
  cell(packageStatusLabel(pkg ?? {}));
  const findings = Array.isArray(pkg?.vulnerabilities) ? pkg.vulnerabilities.filter((item) => textOf(item?.id)) : [];
  const findingCell = makeNode('td');
  if (findings.length === 0) findingCell.textContent = '표시할 취약점 ID 없음';
  else {
    const list = makeNode('ul');
    for (const item of findings) list.append(makeNode('li', { text: `${item.id} · 수정 시각 ${eventTimeText(item.modified)}` }));
    findingCell.append(list);
  }
  row.append(findingCell);
  cell(textOf(pkg?.source) ?? '출처 확인 불가');
  cell(eventTimeText(pkg?.checkedAt));
  return row;
}

function vulnerabilitiesView(input) {
  const status = input?.status;
  const root = makeNode('section', { attrs: { 'data-testid': 'student-vulnerabilities-view', 'data-status': status ?? 'unknown', 'aria-label': '설치 패키지와 알려진 취약점 조회 결과' } });
  const note = modeNote(input);
  if (note) root.append(note);
  const line = (text, className, attrs) => root.append(makeNode('p', { text, className, attrs }));

  if (status === 'idle') {
    line('조회 전', 'state state-empty', { role: 'status' });
    line('설치 패키지 조회는 제공 화면의 「설치 패키지 조회」 버튼을 직접 눌러야 시작합니다. 자동으로 조회하지 않습니다.', 'muted');
    return root;
  }
  if (status === 'loading') {
    line('조회 중', 'state state-loading', { role: 'status' });
    line('결과가 오기 전입니다. 멈추려면 「패키지 조회 취소」를 누르세요. 이전 결과는 표시하지 않습니다.', 'muted');
    return root;
  }
  if (status === 'error') {
    const code = safeCode(input?.error?.code);
    const reason = VULN_ERROR_REASON.find((item) => item.codes.includes(code))?.text ?? '연결 또는 서비스 실패: 조회 결과를 확인하지 못했습니다.';
    line(`주의 · 조회 실패: ${textOf(input?.error?.message) ?? '서버가 오류 내용을 보내지 않았습니다.'}`, 'state state-error');
    line(`오류 코드: ${code} · 원인: ${reason}`);
    line(`이전 조회 결과를 현재 결과로 보지 않습니다. ${VULN_RETRY}`, 'muted');
    return root;
  }
  const data = input?.data;
  if (status !== 'ok' || data === null || typeof data !== 'object' || !Object.hasOwn(VULN_SCAN_TEXT, data.status)) {
    line('주의 · 조회 결과: 확인 불가 · 이 응답은 조회 결과로 쓰지 않습니다.', 'state state-empty');
    line(status === 'ok' ? '조회 응답 형식이 계약과 맞지 않습니다.' : '조회 상태 정보를 받지 못했습니다.', 'muted');
    return root;
  }

  root.setAttribute('data-scan', data.status);
  line(`${VULN_ATTENTION_SCANS.has(data.status) ? '주의 · ' : ''}전체 조회 상태: ${VULN_SCAN_TEXT[data.status]}`, VULN_ATTENTION_SCANS.has(data.status) ? 'state state-error' : data.status === 'complete' ? 'state state-ok' : 'state state-empty', { role: 'status' });
  line(VULN_SCAN_NOTE[data.status], 'muted');
  // 전달된 값만 표시한다. 없는 값은 만들지 않는다.
  const rows = [];
  if (textOf(data.code)) rows.push(['코드(code)', safeCode(data.code)]);
  if (data.lockfileVersion !== undefined) rows.push(['잠금 파일 버전(lockfileVersion)', String(data.lockfileVersion)]);
  if (textOf(data.lockfileHash)) rows.push(['잠금 파일 해시(lockfileHash)', data.lockfileHash]);
  if (Number.isSafeInteger(data.excluded?.count)) rows.push(['조회 제외', `${data.excluded.count}건`]);
  if (textOf(data.checkedAt)) rows.push(['조회 시각(checkedAt)', eventTimeText(data.checkedAt)]);
  if (rows.length > 0) {
    const list = makeNode('dl');
    for (const [label, value] of rows) list.append(makeNode('dt', { text: label }), makeNode('dd', { text: value }));
    root.append(list);
  }

  const packages = Array.isArray(data.packages) ? data.packages : [];
  if (packages.length === 0) {
    if (data.status === 'complete') line('표시할 패키지 조회 결과가 없습니다.', 'state state-empty');
    return root;
  }
  line('표의 버전은 package-lock.json에 기록되고 설치된 정확한 버전입니다. ^1.2.0 같은 범위 표기가 아닙니다.', 'muted');
  const table = makeNode('table', { attrs: { 'aria-label': '설치 패키지별 알려진 취약점 조회 결과' } });
  const head = makeNode('tr');
  for (const label of ['패키지', '설치 버전', '조회 상태', '취약점 ID · 수정 시각', '출처', '패키지 조회 시각']) head.append(makeNode('th', { text: label, attrs: { scope: 'col' } }));
  const thead = makeNode('thead');
  thead.append(head);
  table.append(thead);
  const body = makeNode('tbody');
  for (const pkg of packages) body.append(packageRow(pkg));
  table.append(body);
  root.append(table);
  line('OSV는 알려진 취약점 데이터베이스입니다. 조회 결과가 없다는 사실만으로 해당 패키지나 앱 전체가 안전하다고 보장할 수 없습니다.', 'muted');
  return root;
}

export function createStudentView({ api, onChange } = {}) {
  const eventFilters = { kind: 'all', app: 'all', access: 'all' };
  const measure = { running: false, rows: [], at: null, pc: null, history: [] };
  const pcInfo = { history: [], error: null };
  const measureContext = { measure, canMeasure: typeof api?.get === 'function', start: () => runMeasure(api, measure, onChange), pcInfo, onPcFile: (file) => loadPcFile(file, pcInfo, onChange) };
  return {
    renderIdentity(input) { return renderIdentityView(input); },
    renderDecision(input) { return decisionView(input); },
    renderEvents(input) { return eventsView(input, eventFilters); },
    renderStatus(input) { return statusView(input, measureContext); },
    renderVulnerabilities(input) { return vulnerabilitiesView(input); },
    renderAiConnection(input) { return aiConnectionView(input); },
    renderExplanation(input) { return explanationView(input); },
    renderAction(input) { return actionView(input); },
  };
}
