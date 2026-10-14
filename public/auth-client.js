// 로그인 코드(최소). 화면이 쓰는 네 가지만 합니다: 로그인, 로그아웃, 세션 읽기, 상태 변화 알림.
// 로그인 서버(Supabase Auth)에 fetch로만 요청하고, 로그인 세션(토큰)은 이 파일 안의 변수(메모리)에만 둡니다.
// 브라우저 저장소와 쿠키에는 아무것도 쓰지 않으므로 새로고침하면 다시 로그인해야 합니다. 외부 주소나 암호 기능을 쓰지 않습니다.
// 화면에 넘겨받는 것은 /api/config가 내려 주는 공개용 값(주소와 공개 값) 뿐이며, 서버 전용 비밀값은 어디에도 없습니다.
(function (win) {
  'use strict';

  function createByteBackAuth(options) {
    var base = String((options && options.url) || '').replace(/\/+$/, '');
    var publishable = String((options && options.publishable) || '');
    var session = null; // 메모리에만 둔다
    var listeners = [];
    var refreshing = null;

    function nowSeconds() { return Math.floor(Date.now() / 1000); }
    function emit(event) {
      listeners.slice().forEach(function (fn) { try { fn(event, session); } catch (e) { /* 한 구독자의 오류가 다른 구독자를 막지 않게 한다 */ } });
    }
    function failure(status, body) {
      var code = (body && (body.error_code || body.error)) || 'unexpected_failure';
      var message = (body && (body.msg || body.message || body.error_description)) || '';
      return { code: String(code), message: String(message), status: status };
    }
    async function request(path, init) {
      var headers = Object.assign({ apikey: publishable, 'Content-Type': 'application/json' }, init.headers || {});
      var response = await fetch(base + path, {
        method: 'POST', headers: headers, body: init.body === undefined ? undefined : JSON.stringify(init.body),
        cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10000),
      });
      var body = null;
      try { body = await response.json(); } catch (e) { body = null; }
      return { ok: response.ok, status: response.status, body: body };
    }
    function toSession(body) {
      if (!body || typeof body.access_token !== 'string' || !body.access_token) return null;
      var seconds = Number(body.expires_in);
      return {
        access_token: body.access_token,
        refresh_token: typeof body.refresh_token === 'string' ? body.refresh_token : null,
        expires_at: nowSeconds() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 0),
        user: { email: (body.user && typeof body.user.email === 'string') ? body.user.email : null },
      };
    }

    async function signInWithPassword(credentials) {
      var result;
      try {
        result = await request('/auth/v1/token?grant_type=password', { body: { email: credentials && credentials.email, password: credentials && credentials.password } });
      } catch (e) {
        return { data: { session: null, user: null }, error: { code: 'network_error', message: '로그인 서버에 연결하지 못했습니다.', status: 0 } };
      }
      var next = result.ok ? toSession(result.body) : null;
      if (!next) return { data: { session: null, user: null }, error: failure(result.status, result.body) };
      session = next;
      emit('SIGNED_IN');
      return { data: { session: session, user: session.user }, error: null };
    }

    // 만료가 가까우면 갱신을 한 번 시도한다. 갱신하지 못하면 세션을 지우고 로그아웃으로 알린다.
    async function refresh() {
      if (!session || !session.refresh_token) { session = null; emit('SIGNED_OUT'); return; }
      try {
        var result = await request('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: session.refresh_token } });
        var next = result.ok ? toSession(result.body) : null;
        if (next) { session = next; emit('TOKEN_REFRESHED'); return; }
      } catch (e) { /* 아래에서 세션을 지운다 */ }
      session = null;
      emit('SIGNED_OUT');
    }
    async function getSession() {
      if (session && session.expires_at - 30 <= nowSeconds()) {
        refreshing = refreshing || refresh().finally(function () { refreshing = null; });
        await refreshing;
      }
      return { data: { session: session }, error: null };
    }

    async function signOut() {
      var token = session && session.access_token;
      session = null;
      if (token) {
        try { await request('/auth/v1/logout', { headers: { Authorization: 'Bearer ' + token } }); } catch (e) { /* 서버에 알리지 못해도 이 화면의 세션은 이미 지웠다 */ }
      }
      emit('SIGNED_OUT');
      return { error: null };
    }

    function onAuthStateChange(callback) {
      listeners.push(callback);
      return { data: { subscription: { unsubscribe: function () { listeners = listeners.filter(function (fn) { return fn !== callback; }); } } } };
    }

    return { auth: { signInWithPassword: signInWithPassword, signOut: signOut, getSession: getSession, onAuthStateChange: onAuthStateChange } };
  }

  win.createByteBackAuth = createByteBackAuth;
})(window);
