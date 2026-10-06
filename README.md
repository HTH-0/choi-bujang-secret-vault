# BYTE BACK 방어전 시작 틀 R5

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 포함된 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

배포가 끝나면 `/`에서 점령된 가상 자료실을 볼 수 있습니다. 시작 틀에서는 `/data.json`에 같은 가상 메모가 공개됩니다. 이 공개 상태를 확인하는 것이 1단계의 출발점입니다. 1단계 접수와 심판 판정은 포털에서 확인합니다.

## 5단계 현황: 자료 요청을 서버 한곳으로

- 브라우저 코드(`public/index.html`)가 메모 자료를 Supabase에서 직접 읽거나 고치는 곳을 찾았고 **없음**이었습니다. Supabase는 로그인(Auth) 호출에만 쓰이고, 자료 요청은 항상 `/api/notes`·`/api/notes/:id` 서버 함수를 거칩니다. 그래서 화면 코드는 바꾸지 않았습니다.
- 메모 테이블의 직접 권한을 거두는 SQL([supabase/5-vault-notes-revoke-direct.sql](supabase/5-vault-notes-revoke-direct.sql))을 학생이 SQL Editor에서 실행했습니다. `public.vault_notes` 한 테이블에서 `PUBLIC`·`anon`·`authenticated`의 권한을 모두 회수했고, RLS와 4단계 정책은 남겼으며 다른 테이블은 건드리지 않았습니다. 서버 함수는 서버 전용 키(`service_role`)로 접근하므로 영향이 없어야 합니다.
- `aleph.config.json`: `step` 5, `originalApiUrl`은 쿼리 없는 원본 자료 HTTPS 주소 `https://vdidbiqssjipvdjldlns.supabase.co/rest/v1/vault_notes`입니다(Supabase의 메모 테이블 REST 경로). 로그인·소유자 검사와 서버 전용 설정은 그대로입니다. 빌드와 배포 식별은 `step` 1~5를 받습니다.
- 다시 실행하는 방법: `npm run build -- --local`, `npm run test:r5`, 커밋·push, 배포가 끝나면 `npm run bundle`. 로그인 시험은 배포 주소 화면에서 A 계정으로 직접 하고, 비밀번호는 화면에만 입력합니다.

**5단계에서 확인한 것과 하지 않은 것**
- 확인함(제가 직접 보낸 요청, 심판 판정 아님): 원본 주소로 키 없이 요청하면 HTTP 401, 공개(anon) 키로 GET은 401 `42501 permission denied`, 공개 키로 POST도 401 `42501`이었습니다. SQL 적용 전에도 anon은 거부됐고, 적용 뒤에도 같습니다.
- 확인함(학생이 SQL Editor에서): 적용 전 표에서 `anon`은 권한이 없고 `authenticated`는 `DELETE, INSERT, SELECT, UPDATE`, `service_role`은 전체였습니다. 적용 SQL이 `Success`였고, `authenticated`의 직접 읽기 거부 시험이 `OK … permission denied`로 나왔습니다.
- 확인함(제가 가짜 DB로 한 로컬 시험): A의 목록 읽기·추가·한 건 읽기·수정·삭제·삭제 뒤 404가 서버 함수에서 되고, B의 A 메모 접근은 404, 로그인 없는 요청은 401입니다. 서버는 항상 서버 전용 키로 DB 한곳에만 요청합니다.
- **미확인**: 적용 뒤의 권한 표(`service_role` 포함)와 `PUBLIC`까지 보는 원본 권한 목록을 학생이 다시 실행해 본 결과는 받지 못했습니다.
- **미확인**: SQL 적용 뒤 실제 A 로그인으로 화면이 계속 정상인지(메모 보기·추가·수정·삭제)는 아직 확인하지 못했습니다. 서버 전용 키는 권한 회수와 별개라 정상이어야 하지만 학생이 확인해야 합니다.
- **미확인**: 심판이 하는 원본 직접 요청(anon 키)의 결과는 제가 볼 수 없습니다. `src/attack-check.mjs`가 보낸 같은 방식의 요청만 기록합니다.

## 4단계 현황: 로그인해도 내 자료만 보이게

> 5단계에서 `authenticated`의 직접 권한도 회수했습니다. 아래 DB 권한 설명은 4단계 시점의 기록입니다.

- 자료 API가 모든 동작에서 DB 행의 `owner_id`와 서버가 검증한 사용자 ID를 비교합니다. 요청 URL·본문·쿼리의 `owner_id`·`userId`는 읽지 않습니다. 코드는 [api/notes.js](api/notes.js), [api/notes/[id].js](api/notes/[id].js), [src/notes-api.mjs](src/notes-api.mjs)입니다. `src/verify-login.mjs`는 고치지 않았습니다.
- 읽기: 목록은 본인 행만 줍니다. 한 건 GET은 본인 것이 아니거나 없으면 같은 404입니다.
- 추가: `owner_id`는 항상 서버가 확인한 사용자 ID로 저장합니다. 본문에 다른 사람의 `owner_id`를 넣어도 무시합니다.
- 수정: 기존 행의 소유자가 본인인지 확인하고, `id`와 `owner_id`를 함께 조건으로 걸어 본인 행에만 적용하며, 새 행의 `owner_id`도 본인 ID로 고정합니다. 본문이 다른 소유자를 가리키면 403으로 거부합니다.
- 삭제: 본인 행만 지웁니다. 남의 메모는 404입니다. 소유자가 없는 옛 행은 누구에게도 보이지 않습니다.
- 응답 모양은 한 건 `{id,title,body}`, 수정 본문 `{title,body}` 그대로입니다. `allowedRoutes`는 `/api/notes`, `/api/notes/:id`이고 메서드(GET·POST, GET·PUT·DELETE)는 경로마다 코드가 정합니다.
- `aleph.config.json`의 `step`은 4입니다. 빌드와 배포 식별은 `step` 1~4를 받습니다.
- 2단계에서 넣은 가상 메모 네 건은 SQL Editor에서 A 계정에 연결했고, B 시험 계정 소유의 시험 메모 한 건을 만들었습니다. 실행 결과(A 4건, B 1건)는 학생이 확인했습니다.
- 다시 실행하는 방법: `npm run build -- --local`, `npm run test:r5`, 커밋·push, 배포가 끝나면 `npm run bundle`. A와 B 두 계정으로 배포 주소 화면에서 직접 로그인해 시험하고, 비밀번호는 화면에만 입력합니다.

**4단계에서 확인한 것과 하지 않은 것**
- 확인함: 가짜 DB와 시험용 서명 키로 한 로컬 시험(A·B 각자 자기 메모 읽기·추가·수정·삭제 유지, 상대 메모 접근 거부, 소유자 변경 거부, 읽은 뒤 소유자가 바뀌는 경우)이 모두 통과했습니다. 심판의 판정이 아닙니다.
- `src/attack-check.mjs`가 보낸 요청은 로그인 없는 GET·POST·PUT·DELETE와 위조 토큰 GET의 401 거부 확인입니다. A·B 로그인으로 보내는 점검은 이 스크립트가 토큰을 가질 수 없어 **미실행**으로 기록합니다.
- 확인함(학생이 배포 주소 화면에서): A로 로그인하면 A의 메모가 보이고 추가·수정·삭제가 되며, B로 로그인하면 B의 시험 메모 한 건만 보였습니다. 실제 Supabase와 실제 로그인 토큰으로 자기 메모 동작과 목록 분리가 맞다는 뜻이고, 제가 직접 본 것은 아닙니다.
- **미확인**: B가 A의 메모 id로 GET·PUT·DELETE를 직접 요청했을 때 404가 나오는지, A가 소유자를 바꾸려는 PUT이 403인지는 실제 토큰으로 시험하지 않았습니다. 로컬 시험(가짜 DB)에서만 통과했습니다.
- 확인함(학생이 SQL Editor에서): DB 권한·RLS를 최소 권한으로 줄이는 SQL([supabase/4-vault-notes-rls.sql](supabase/4-vault-notes-rls.sql))을 실행했습니다. 정책 네 개(SELECT·INSERT·UPDATE·DELETE, 모두 `authenticated` 대상, `auth.uid() = owner_id`)가 조회되었고, `has_table_privilege` 확인에서 `anon`은 권한이 없고 `authenticated`는 `DELETE, INSERT, SELECT, UPDATE`만 있었습니다. 적용 전 표에서는 `authenticated`의 INSERT·DELETE가 `false`였던 것을 학생이 확인했습니다. 정책이 실제로 상대 행을 막는지(`authenticated` 토큰으로 DB에 직접 요청)는 시험하지 않았습니다. API는 서버 전용 키로 DB에 접근하므로 API의 소유자 검사는 이 SQL과 별개로 코드가 맡습니다.

**4단계에서 남은 약점**
- 가입이 열려 있어(`disable_signup: false`) 누구나 계정을 만들면 자료 API를 쓸 수 있습니다. 자기 메모만 볼 수 있지만 계정은 만들 수 있습니다.
- 틀의 로그인 도우미는 심판용 토큰도 통과시킵니다. 도우미를 고치지 않았습니다.
- 남의 메모는 404로 답해 존재 여부를 숨기지만, 소유자 변경 시도는 403이라 자기 메모에서는 구분됩니다.
- 가입이 열려 있어 새 계정도 `authenticated` 역할을 받습니다. RLS 정책은 자기 행만 허용하지만 계정 생성 자체는 막지 않았습니다.
- 옛 공개 커밋과 옛 배포에 이전 메모가 남아 있는 한계는 그대로입니다.

## 3단계 현황: 진짜 로그인

- 로그인·로그아웃은 Supabase Auth 이메일·비밀번호입니다. 화면([public/index.html](public/index.html))이 공식 `supabase-js`(2.117.2 고정, jsDelivr)의 `signInWithPassword`·`signOut`을 씁니다. 화면에 넣은 Project URL과 publishable 키는 공개용입니다. 서버 전용 secret 키는 화면·Git에 없습니다.
- 자료 API는 로그인 토큰을 틀의 `src/verify-login.mjs`로 검사합니다. 토큰이 없거나 검사에 실패하면 자료 없이 401입니다. 사용자는 검증된 토큰에서만 얻고, 요청이 보낸 `userId`·`role`·`owner_id`는 읽지 않습니다. `src/verify-login.mjs`는 고치지 않았습니다.
- 경로: `GET·POST /api/notes`([api/notes.js](api/notes.js)), `GET·PUT·DELETE /api/notes/:id`([api/notes/[id].js](api/notes/[id].js)). 공통 코드는 [src/notes-api.mjs](src/notes-api.mjs)입니다. POST는 `{id?,title,body}`를 받아 `{id}`를 돌려주고, 추가한 메모의 `owner_id`는 서버가 확인한 사용자 ID입니다. 목록 GET은 로그인 사용자 본인의 메모만 줍니다. 지운 뒤 GET은 404입니다.
- `aleph.config.json`: `step` 3, `identityProvider`(Supabase 발급자·대상·공개키 주소, 비밀 키 없음), `allowedRoutes`(`/api/notes`, `/api/notes/:id`)를 적었습니다. 빌드와 배포 식별은 `step` 1~3을 받습니다.
- 다시 실행하는 방법: `npm run build -- --local`, `npm run test:r5`, 커밋·push, 배포가 끝나면 `npm run bundle`. 로그인 시험은 배포 주소 화면에서 A 계정으로 직접 하고, 비밀번호는 화면에만 입력합니다.
- `src/attack-check.mjs`가 보낸 요청(로그인 없는 GET·POST·PUT·DELETE, 위조 토큰 GET)은 401 거부를 확인합니다. A 로그인으로 추가·수정·삭제하는 점검과 B의 타인 메모 접근은 이 스크립트가 보내지 않으므로 **미실행**으로 기록합니다. 심판의 판정이 아닙니다.

**3단계에서 남은 약점 (3단계 시점의 기록)**
- (3단계 시점) 소유자 검사가 없었습니다. 로그인한 B가 `:id`만 알면 A의 메모를 읽고 고치고 지울 수 있었고, 4단계에서 API가 막았습니다. 실제 배포에서의 재현 결과는 기록하지 않았습니다.
- 가입이 열려 있어(`disable_signup: false`) 누구나 계정을 만들면 자료 API를 쓸 수 있습니다.
- 틀의 로그인 도우미는 심판용 토큰도 통과시킵니다. 도우미를 고치지 않았습니다.
- (3단계 시점) 목록은 `owner_id`가 본인인 메모만 주고, 2단계 때 넣은 `owner_id`가 빈 메모 네 건은 나오지 않았습니다. 4단계에서 SQL로 A에 연결했습니다.
- 옛 공개 커밋과 옛 배포에 이전 메모가 남아 있는 한계는 그대로입니다.

## 2단계 현황: 자료를 코드 밖으로

- 가상 메모 네 건은 Supabase 테이블 `public.vault_notes`에 있습니다. 만드는 SQL은 [supabase/2-vault-notes.sql](supabase/2-vault-notes.sql)이고, 메모 INSERT는 SQL Editor에서 직접 실행했습니다. 테이블은 RLS를 켰고 `anon`·`authenticated`에는 권한이 없습니다.
- 화면은 `/data.json` 대신 Vercel 서버 함수 [api/notes.js](api/notes.js)의 `/api/notes`를 읽습니다. 함수는 환경변수 `SUPABASE_URL`과 서버 전용 `SUPABASE_SECRET_KEY`를 읽습니다. 두 값은 Vercel 프로젝트 설정의 Environment Variables 입력란에 직접 넣고, 코드·Git·로그·응답에는 넣지 않습니다. 값을 넣은 뒤에는 다시 배포해야 반영됩니다.
- `vercel.json`의 `headers`가 모든 응답에 `X-Content-Type-Options: nosniff`를 붙입니다. 배포 뒤 `curl -I https://배포주소/`로 확인합니다.
- 루트 `data.json`의 `notes`는 비어 있고, 2단계부터 빌드가 `public/data.json`을 만들지 않아 배포된 `/data.json`은 404입니다. 시작 틀의 확인 표시(`sampleMarker`)도 `/aleph.json`에서 뺐습니다. 이 표시는 1단계 공개 자료에만 둡니다.
- `aleph.config.json`의 `step`은 2이고 `repoUrl`·`publicAppUrl`은 실제 저장소와 배포 주소입니다. 빌드(`scripts/build-public.mjs`)와 배포 식별(`scripts/deployment-identity.mjs`)은 `step` 1과 2를 받습니다. `/aleph.json`에도 `step: 2`가 기록됩니다.
- 다시 실행하는 방법: `npm run build -- --local`로 화면 파일을 만들고, `npm run test:r5`로 시험하고, 커밋·push 뒤 배포가 끝나면 `npm run bundle`을 실행합니다. `npm run bundle`은 작업 트리가 깨끗해야 하고 `bundle-notes.json`(커밋하지 않음)이 필요합니다. 실제 배포 주소로 보낸 요청의 결과만 `src/attack-check.mjs`가 기록하며, 심판의 판정이 아닙니다.

**아직 남은 약점**
- (2단계 시점) `/api/notes`는 공개 주소였고, 로그인 확인이 없어 누구나 가상 메모 네 건을 읽을 수 있었습니다. 3단계에서 로그인 검사를 붙였습니다. 위 3단계 현황을 보세요.
- 옛 공개 커밋과 옛 배포에는 이전 `data.json`의 메모가 남아 있습니다. 과거 노출이 해소됐다고 볼 수 없습니다.

### 가상 메모 문장 검색 확인 절차

검색어는 정규식 `실습용 가[상]`입니다. 대괄호를 쓰는 이유는 이 README 자신이 검색에 걸리지 않게 하기 위해서입니다. 아래 결과는 학생이 직접 실행한 뒤 기록합니다. 실행하지 않은 칸은 **미실행**으로 남깁니다.

1. **GitHub 최신 파일(로컬 커밋 기준)**: `git grep -n "실습용 가[상]" HEAD`
   - 기대: 2단계 저장점 커밋 이후에는 결과가 없습니다. 커밋 전에는 이전 커밋의 `data.json`, `public/data.json`이 나옵니다.
2. **GitHub 웹의 최신 파일**: 저장소 화면의 검색(`/`)에 `/실습용 가[상]/`를 입력합니다. 기본 브랜치의 현재 파일만 검색됩니다.
   - 기대: 결과 없음.
3. **현재 배포 파일**: `curl -s https://배포주소/data.json`, `curl -s https://배포주소/`
   - 기대: `/data.json`은 404이거나 `notes`가 빈 배열이고, `/` 응답(HTML)에도 메모 문장이 없습니다. 카드는 브라우저가 `/api/notes`를 읽어 그립니다.
4. **공개 API**: `curl -s https://배포주소/api/notes`
   - 이 주소는 로그인 없이 가상 메모 네 건을 돌려주는 것이 정상입니다. 아직 막지 않은 약점이므로 결과에 "공개됨"이라고 기록합니다.
5. **옛 기록(해소 여부 점검)**: `git log --pickaxe-regex -S"실습용 가[상]" --oneline`
   - 이전 커밋이 나오면 과거 공개 흔적이 남아 있다는 뜻입니다. 옛 공개 커밋과 옛 배포가 남는 한 과거 노출은 해소됐다고 쓰지 않습니다.

| 점검 | 결과 | 날짜 |
|---|---|---|
| 1. 로컬 HEAD 검색 | 결과 없음 (`origin/main` 최신 파일 기준, 커밋 `d54f14c`) | 2026-10-06 |
| 2. GitHub 웹 검색 | 결과 없음 (`repo:HTH-0/choi-bujang-secret-vault /실습용 가[상]/`, 0 files) | 2026-10-06 |
| 3. 배포된 `/data.json`·`/` | `/data.json`은 404(2단계부터 배포하지 않음), `/`의 HTML에도 메모 문장 없음 | 2026-10-06 |
| 4. 공개 `/api/notes` | (2단계 시점 기록) 로그인 없이 HTTP 200으로 가상 메모 4건이 읽힘. 3단계 이후에는 401이어야 하며 다시 확인해야 함 | 2026-10-06 |
| 5. 옛 커밋 검색 | `312564a`(메모가 있던 첫 커밋)와 `2e7323a`(메모를 지운 커밋)가 나옴 | 2026-10-06 |

기록할 두 가지는 따로 적습니다.
- **검색 결과**: 최신 파일(1번)과 배포된 정적 파일(3번)에서는 메모 문장이 나오지 않았습니다. GitHub 웹 검색(2번)에서도 `0 files`로 결과가 없었습니다. 옛 커밋(5번)에는 메모가 남아 있으므로 과거 노출은 해소되지 않았습니다.
- **공개 API의 남은 약점**: `/api/notes`는 로그인 없이 누구나 메모 4건을 읽을 수 있습니다(4번). 공개(publishable) 키로 `vault_notes`를 직접 요청하면 `42501 permission denied`로 막힙니다. 약점은 서버 함수 주소가 공개라는 점에 있습니다.

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`을 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 시작 틀에서는 자리표시자입니다. 1단계에서는 학생이 편집하지 않습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성하며, 지금은 실제 저장소와 배포 주소가 들어 있습니다. `npm run bundle`과 `bundle-notes.json`도 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 가상 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. 저장소의 `src/attack-check.mjs`는 실제 배포가 된 뒤 현재 단계의 요청을 비로그인으로 보냅니다. 1단계에서는 `/data.json`의 확인 표시를 읽고, 3단계에서는 로그인 없는 자료 요청이 거부되는지 봅니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.
