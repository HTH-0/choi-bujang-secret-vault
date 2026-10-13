// 앱 상태 표시(읽기 전용)와 오프라인 안내 서비스 워커 등록.
// 이 파일은 로그인·자료 요청 코드와 따로 있으며 /api/*를 호출하지 않고, 기기 키·승인 상태를 만들거나 저장하지 않습니다.
// localStorage·sessionStorage·쿠키에 아무것도 쓰지 않습니다. 기기 승인 칸(#status-device)은 건드리지 않습니다:
// 그 칸은 index.html의 모듈 스크립트가 서버 응답(/api/device/status)으로만 채웁니다.
(function (win, doc) {
  'use strict';

  function installText() {
    var standalone = false;
    try { standalone = Boolean(win.matchMedia && win.matchMedia('(display-mode: standalone)').matches); } catch (e) { standalone = false; }
    if (win.navigator && win.navigator.standalone === true) standalone = true;
    return standalone ? '설치된 앱 창으로 열림 (브라우저가 알려 주는 표시 방식입니다)' : '브라우저 탭으로 열림 (설치하지 않았거나 설치 전입니다)';
  }
  function networkText(online) { return online ? '온라인' : '오프라인'; }

  function render() {
    var online = !(win.navigator && win.navigator.onLine === false);
    var install = doc.getElementById('status-install');
    var network = doc.getElementById('status-network');
    var notice = doc.getElementById('offline-notice');
    if (install) install.textContent = installText();
    if (network) network.textContent = networkText(online);
    if (notice) notice.hidden = online;
  }

  render();
  win.addEventListener('online', render);
  win.addEventListener('offline', render);
  if (win.matchMedia) {
    try { win.matchMedia('(display-mode: standalone)').addEventListener('change', render); } catch (e) { /* 지원하지 않는 브라우저는 건너뛴다 */ }
  }

  // 서비스 워커는 안내 화면만 맡는다(public/sw.js). https 또는 localhost에서만 등록되고, 등록에 실패해도 화면은 그대로 동작한다.
  if (win.navigator && 'serviceWorker' in win.navigator) {
    win.addEventListener('load', function () {
      win.navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () { /* 등록하지 못해도 자료실은 그대로 쓴다 */ });
    });
  }

  // 시험용으로만 노출한다. 값을 바꾸는 길은 없다.
  win.__appStatus = Object.freeze({ installText: installText, networkText: networkText });
})(window, document);
