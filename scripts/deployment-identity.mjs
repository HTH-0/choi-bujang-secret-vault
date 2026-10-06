const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u;
const REPO = /^[A-Za-z0-9._-]{1,100}$/u;
const SHA = /^[a-f0-9]{40}$/iu;
const HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/iu;

export function deploymentIdentity(env, config) {
  const owner = env.VERCEL_GIT_REPO_OWNER;
  const repo = env.VERCEL_GIT_REPO_SLUG;
  const commit = env.VERCEL_GIT_COMMIT_SHA;
  const host = env.VERCEL_URL;
  if (env.VERCEL_GIT_PROVIDER !== 'github' || !OWNER.test(owner || '')
      || !REPO.test(repo || '') || repo === '.' || repo === '..'
      || repo.toLowerCase().endsWith('.git') || !SHA.test(commit || '')
      || !HOST.test(host || '') || ![1, 2, 3, 4, 5].includes(config?.step)
      || typeof config.judgeIssuer !== 'string'
      || !/^https:\/\/[a-z0-9-]+\.up\.railway\.app\/defense\/judge$/iu.test(config.judgeIssuer)
      || (config.step === 1 && (typeof config.sampleMarker !== 'string'
        || !/^[A-Z0-9_]{1,80}$/u.test(config.sampleMarker)))) {
    throw new Error('배포 식별 정보를 확인할 수 없습니다. Vercel 시스템 환경변수와 1단계 시작 틀을 확인하세요.');
  }
  // 3단계부터 허용 경로를 /aleph.json에도 기록한다. 경로 문자열만 받고, 비어 있거나 형식이 틀리면 빌드를 멈춘다.
  let allowedRoutes;
  if (config.step >= 3) {
    const routes = config.allowedRoutes;
    if (!Array.isArray(routes) || !routes.length
        || !routes.every((route) => typeof route === 'string' && /^\/[A-Za-z0-9._~/:-]*$/u.test(route))) {
      throw new Error('3단계부터 aleph.config.json의 allowedRoutes에 /로 시작하는 허용 경로가 하나 이상 필요합니다.');
    }
    allowedRoutes = [...routes];
  }
  // 5단계부터 원본 자료 주소도 /aleph.json에 기록한다. 쿼리·해시·계정 정보가 없는 HTTPS 주소만 받는다.
  let originalApiUrl;
  if (config.step >= 5) {
    const raw = config.originalApiUrl;
    let parsed = null;
    try { parsed = new URL(raw); } catch { /* 아래에서 멈춘다 */ }
    if (typeof raw !== 'string' || raw.length > 300 || /[?#\s]/u.test(raw) || !parsed
        || parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error('5단계부터 aleph.config.json의 originalApiUrl에 쿼리 없는 HTTPS 원본 자료 주소가 필요합니다.');
    }
    originalApiUrl = `${parsed.origin}${parsed.pathname}`;
  }
  return {
    schema: 'aleph.defense.deployment.v1',
    step: config.step,
    repoUrl: `https://github.com/${owner.toLowerCase()}/${repo.toLowerCase()}`,
    commit: commit.toLowerCase(),
    publicAppUrl: `https://${host.toLowerCase()}`,
    judgeIssuer: config.judgeIssuer,
    ...(allowedRoutes ? { allowedRoutes } : {}),
    ...(originalApiUrl ? { originalApiUrl } : {}),
    // 시작 틀의 확인 표시는 1단계 공개 자료에만 둔다. 2단계부터 정적 응답에서 뺀다.
    ...(config.step === 1 ? { sampleMarker: config.sampleMarker } : {}),
  };
}
