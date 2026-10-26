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
  const line = (text, className, attrs) => root.append(makeNode('p', { text, className, attrs }));

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
    line(`${raw === 'deny' ? '주의 · ' : ''}판정: ${DECISION_TEXT[raw]}(${raw})`, raw === 'allow' ? 'state state-ok' : raw === 'deny' ? 'state state-error' : 'state state-loading');
    line(DECISION_NOTE[raw], 'muted');
  } else {
    // unknown과 목록에 없는 값은 모두 확인 불가로 보여 주고, 받은 값이 unknown이 아니면 그 값도 적는다.
    line(`주의 · 판정: 확인 불가(unknown) · 허용되지 않음${raw !== 'unknown' ? ` · 받은 값: ${raw}` : ''}`, 'state state-empty');
    line(DECISION_NOTE.unknown, 'muted');
  }
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
  root.append(form, count, list, detail);
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

function statusView(input) {
  const root = makeNode('section', { attrs: { 'data-testid': 'student-status-view', 'aria-label': '기기·세션·알림·진단 정보 상태' } });
  const note = modeNote(input);
  if (note) root.append(note);
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

export function createStudentView() {
  const eventFilters = { kind: 'all', app: 'all', access: 'all' };
  return {
    renderIdentity(input) { return renderIdentityView(input); },
    renderDecision(input) { return decisionView(input); },
    renderEvents(input) { return eventsView(input, eventFilters); },
    renderStatus(input) { return statusView(input); },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection(input) { return aiConnectionView(input); },
    renderExplanation(input) { return explanationView(input); },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
