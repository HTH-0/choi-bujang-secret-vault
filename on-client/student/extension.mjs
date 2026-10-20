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

export function createStudentView() {
  return {
    renderIdentity(input) { return renderIdentityView(input); },
    renderDecision(input) { return decisionView(input); },
    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
