# BYTE BACK 방어전 시작 틀 R5

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 포함된 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

배포가 끝나면 `/`에서 점령된 가상 자료실을 볼 수 있습니다. 시작 틀에서는 `/data.json`에 같은 가상 메모가 공개됩니다. 이 공개 상태를 확인하는 것이 1단계의 출발점입니다. 1단계 접수와 심판 판정은 포털에서 확인합니다.

## 12단계 현황: 탈환 작전실과 설치·실행·중지·복구 안내

이 절은 검사한 커밋을 기준으로 합니다. 검사한 커밋은 제출 묶음(`artifacts/submission.json`)의 `commit` 값이며, 재현할 때 `git rev-parse HEAD`로 확인합니다. 작전실이 보여 주는 점검 기록을 만든 커밋은 `ops/ops-record.json`의 `commit` 값입니다. `aleph.config.json`의 `step`은 12입니다.

### 누가 만들었나: 학생 몫과 제공 엔진

| 출처 | 들어 있는 것 |
|---|---|
| **학생이 만든 것** (이 저장소) | 판정기 [src/decider.mjs](src/decider.mjs), 탐지 규칙 [src/detect.mjs](src/detect.mjs), 접속 앱 화면 [public/](public/), 자료실 서버 함수 [api/](api/)와 [src/notes-api.mjs](src/notes-api.mjs), 작전실 [api/checks.js](api/checks.js)·[src/checks.mjs](src/checks.mjs)·[src/rule-check.mjs](src/rule-check.mjs), 점검 코드 [src/attack-check.mjs](src/attack-check.mjs)와 [scripts/ops-record.mjs](scripts/ops-record.mjs), 복구 도구 `scripts/restore-*.mjs`와 [restore/safe-policy.json](restore/safe-policy.json), DB 설정 [supabase/](supabase/), XDR 판정 `xdr/brute-force/`·`xdr/web-injection/` |
| **제공 엔진: ALEPH SDP 엔진 사용** | 로그인 세션 확인, 기기 등록 확인, 요청을 판정기로 보내고 결과를 집행하는 일, 사건을 탐지기로 전달하고 접속을 회수하는 일, 감사 기록 보관, 심판 판정은 ALEPH SDP 엔진이 맡습니다. **이 저장소에는 엔진 코드가 없고**, 이 README는 엔진의 동작을 구현했다고 쓰지 않습니다. 심판 접수 주소 `judgeIssuer`는 운영 측이 채운 값이며 바꾸지 않았습니다. |

참고: 수업이 준 시작 틀(첫 커밋 `312564a`)의 도구 `src/verify-login.mjs`, `scripts/bundle.mjs`, `scripts/decider-test.mjs`, `scripts/detect-test.mjs`, `scripts/xdr-run.mjs`, `scripts/fixture-7.mjs`, `docs/`, `test/`, `package/`, `xdr/fixtures/`는 학생이 고치지 않았습니다. `api/ai.js`와 `api/threat-intel.js`는 501을 돌려주는 틀 그대로이며 구현하지 않았습니다.

### 학생 판정기 · 탐지 규칙 · 접속 앱 · 자료실

- **판정기**: `decide(request)`가 `allow`, `deny`, `step_up` 중 하나를 돌려줍니다. 규칙 이름은 `starter.deny`, `xdr_bruteforce_block`, `xdr_webinjection_block`, `device_registered`, `step_up_required` 다섯 개입니다. 등록 기기의 `GET /notes/:id`만 허용하고, 복합 이상 접속은 `step_up`, 나머지는 거부합니다. 계약은 [docs/DECIDER_REQUEST.md](docs/DECIDER_REQUEST.md)입니다.
- **탐지 규칙**: 같은 가명 사용자의 `GET`이 10분 안에 120건을 넘으면 그 사용자 한 명에 대해 `propose_revocation`(`burst_read`)을 제안합니다. 제안만 하고 집행하지 않습니다. 사건 형식은 [docs/DETECT_EVENTS.md](docs/DETECT_EVENTS.md)입니다.
- **접속 앱**: 설치형 웹앱입니다. 로그인은 외부 라이브러리 없이 `public/auth-client.js`가 하고 세션은 메모리에만 둡니다. 기기 승인은 서버 응답(`/api/device/status`)으로만 판단하며 지금은 항상 승인 전입니다.
- **자료실**: `/api/notes`, `/api/notes/:id`, `/api/restore`는 서버가 검증한 로그인과 소유자 검사로 보호합니다. 서버 전용 키로만 Supabase 테이블(`vault_notes`, `vault_notes_backup`)에 접근합니다.
- **탈환 작전실**: 화면은 `GET /api/checks` 응답만 보여 줍니다. 수치(전체 점검, 금지 요청 거부, 정상 요청 허용, 기대와 다름, 미실행)와 표는 점검 기록 `ops/ops-record.json`에서 센 값입니다. 판정기·탐지·회수·복구 칸도 같은 기록의 행을 영역별로 센 값입니다. 회수는 집행 경로가 없어 「미실행」입니다. 로그인하면 본인 백업의 건수와 지문(내용 해시로 만든 값)을 더합니다. 성공 문구는 쓰지 않고, 메모 제목과 본문은 응답과 화면에 없습니다. `/api/checks`는 응답과 같은 수치로 서버 기록 한 줄(`"event":"checks"`)을 남깁니다.

### 제작 2: 정상·금지 요청 표를 만드는 절차

1. 배포가 끝난 뒤 `npm run ops:record`를 실행합니다. [src/attack-check.mjs](src/attack-check.mjs)의 점검을 실제 배포 주소에 **GET으로만** 보내고, 결과를 `ops/ops-record.json`에 씁니다.
2. 표의 칸: 단계, 정상/금지, 점검 이름, 기대 결과, 실제 API 결과(심판이 확인할 수 있는 형식만: `HTTP 401`, `HTTP 200; jsonReady=true`, `HTTP 200; jsonArrayLength=0`), 판정(`blocked` 금지 요청이 거부됨 / `allowed` 정상 요청이 허용됨 / `unexpected` 기대와 다름 / `not_run` 보내지 않음), 요청 ID, 확인 시각입니다.
3. 점검 하나에 요청은 한 번만 보냅니다. 요청 ID는 요청마다 새로 만든 UUID입니다. 같은 값을 요청의 `alephEvidence`(`{ caseId: 점검 이름, requestKey: 요청 ID }`)에 실어, 심판 실행기가 어느 점검의 요청인지 기록할 수 있게 합니다. 이 값은 요청 헤더나 URL에 넣지 않습니다.
4. 6~9단계 행은 `GET /api/checks?case=<이름>`이 고정된 가상 입력([src/rule-check.mjs](src/rule-check.mjs))으로 판정기·탐지 규칙을 실행한 HTTP 응답입니다. 실제 사용자 기기, 실제 사건, 실제 회수가 아닙니다.
5. 보내지 않은 점검은 `observed`를 「미실행:」으로 시작하고 판정을 `not_run`으로 둡니다. 통과로 세지 않습니다. 지금 미실행인 것은 두 행입니다: `anonymous_write`(로그인 없는 쓰기 요청, 격리 환경은 GET·HEAD만 허용), `login_required`(A 로그인 본인 메모 CRUD, B 로그인으로 A 메모 접근, 메모 한 건 복원: 로그인과 쓰기 요청 필요).
6. 기록을 확인하고 `ops/ops-record.json`을 커밋합니다. 제출 묶음(`npm run bundle`)은 같은 점검을 다시 실행해 같은 점검 이름과 결과를 냅니다. 작전실 수치는 이 기록에서 셉니다.
7. 마지막 총공세의 41종 공격 방어는 심판이 판정합니다. 이 표는 그 41종 목록이 아니며, 이 표의 결과를 41종 통과로 쓰지 않습니다.

### 재현 순서 (빈 폴더에서 시작)

환경변수와 SQL을 먼저 준비한 뒤 배포를 확인하는 순서입니다. 값은 어디에도 적지 않았습니다.

1. 저장소를 내려받고 Node 버전을 확인합니다. 22 이상이어야 합니다.
   ```
   git clone https://github.com/HTH-0/choi-bujang-secret-vault.git
   cd choi-bujang-secret-vault
   git checkout <검사한 커밋>
   node -v
   ```
2. 설치합니다: `npm install`
3. 로컬 시험을 실행합니다. 모두 가상 요청 연습이며 심판 판정이 아닙니다.

   | 명령 | 정상 결과 | 거부되어야 할 결과 |
   |---|---|---|
   | `npm run decider:test` | 4개 항목이 「통과」로 나옵니다. | 미등록 기기의 가상 요청은 `deny`입니다. |
   | `npm run detect:test` | 6개 항목이 「통과」로 나옵니다. | 정확히 120건, 사용자 분산, 10분 밖으로 흩어진 조회는 제안하지 않습니다. |
   | `npm run checks:test` | 13개 항목이 「통과」로 나옵니다. | 쓰기 메서드 요청 0건, 점검당 요청 2회 이상 0건, 모르는 `case`는 400, 기록이 없으면 수치 없이 미실행입니다. |
   | `npm run test:r5` | 통과 2개, 실패 0개입니다. | 없음 |
   | `node --test test/xdr-run.test.mjs` | 통과 3개입니다. | 없음 |
   | `npm run test:package` | 통과 2개, 실패 1개입니다. | 실패 1개는 이전부터 있던 것으로 `package/baseline-functions.json`에 `api/` 함수가 없기 때문입니다. |
4. 빌드를 확인합니다: `npm run build -- --local`. 「2단계부터는 정적 data.json을 배포하지 않습니다.」가 나오면 정상입니다.
5. Supabase 대시보드의 SQL Editor에서 [supabase/](supabase/)의 SQL을 `2-vault-notes.sql`, `4-vault-notes-rls.sql`, `5-vault-notes-revoke-direct.sql`, `10-vault-notes-backup.sql` 순서로 학생이 직접 검토해 실행합니다.
6. Vercel 프로젝트의 Settings > Environment Variables 입력란에 세 이름을 직접 넣습니다. 값은 Supabase 대시보드에서 복사하며, 이 저장소와 대화에는 적지 않습니다.

   | 이름 | 용도 | 공개 범위 |
   |---|---|---|
   | `SUPABASE_URL` | Supabase 프로젝트 주소 | 서버 |
   | `SUPABASE_PUBLISHABLE_KEY` | 로그인 화면용 공개 키 | `/api/config`로 화면에 내려갑니다. |
   | `SUPABASE_SECRET_KEY` | 서버 전용 키 | **서버에만 둡니다.** 화면, 응답, 로그, Git에 넣지 않습니다. |
7. 변경을 커밋하고 `git push`하면 Vercel이 배포합니다. 배포 주소는 `aleph.config.json`의 `publicAppUrl`입니다.
8. 배포가 끝나면 `npm run ops:record`로 점검 기록을 만들고(위 「제작 2」), 기록을 커밋·푸시합니다.
9. 배포 주소를 브라우저로 열어 「탈환 작전실」을 봅니다.
   - 정상 결과: 수치가 `ops/ops-record.json`의 `counts`와 같고, 표가 기록의 행과 같습니다. 「기대와 다름」은 0입니다.
   - 거부되어야 할 결과: 표의 금지 행(로그인 없는 목록, 위조 토큰, 쿼리 신원, 헤더 신원, 원본 직접 요청 두 가지, 로그인 없는 복구 경로, 기기 신호 없음, 위조 기기 신호)이 모두 「거부됨(실측)」입니다.
   - 로그인한 뒤 「작전실 다시 확인」을 누르면 복구 칸에 본인 백업 건수와 지문이 더해집니다. Vercel Logs의 `"event":"checks"` 줄의 `total`·`blocked`·`allowed`·`unexpected`·`notRun`·`backups`·`fingerprint`가 화면 값과 같아야 합니다.
10. 제출 묶음은 `bundle-notes.json`에 설명을 적고 `npm run bundle`로 만듭니다. 커밋하지 않은 변경이 있으면 멈춥니다. `bundle-notes.json`과 `artifacts/submission.json`은 커밋하지 않습니다.

### 중지

- **로컬**: 이 저장소의 시험, 빌드, 점검 기록은 실행이 끝나면 스스로 종료합니다. 계속 떠 있는 서버 프로세스가 없습니다.
- **자료 접근 막기(코드 근거로만 적음)**: Vercel 환경변수에서 `SUPABASE_SECRET_KEY`를 지우고 다시 배포하면 `src/notes-api.mjs`의 `guard`가 `/api/notes`, `/api/restore`, 토큰을 붙인 `/api/checks`에 500(`SERVER_NOT_CONFIGURED`)으로 답합니다.
- **배포 내리기**: Vercel 프로젝트에서 이전 배포로 되돌리거나(Instant Rollback) 배포를 내립니다. 화면 이름은 Vercel 쪽 변경에 따라 다를 수 있고 제가 실행해 보지 않았습니다.
- **특정 사용자 접속 끊기**: 엔진의 몫입니다. 이 저장소에는 회수 경로가 없고, 엔진의 접속 회수는 연결·시험하지 않았습니다.

### 복구

1. 먼저 무엇이 바뀌었는지 봅니다: `git status`, `git diff`
2. 코드 전체를 검사한 커밋으로 되돌려야 하면 `git checkout <검사한 커밋>`으로 확인한 뒤 새 커밋으로 되돌리고 다시 배포합니다. `git reset --hard`는 쓰지 않습니다.
3. 정책만 확인할 때: 안전 정책 사본([restore/safe-policy.json](restore/safe-policy.json), 커밋 `6e80bf0`에서 만듦)과 현재 정책의 차이를 `npm run restore:preview`로 봅니다. 읽기 전용입니다.
4. 한 서비스만 되돌립니다: `npm run restore:apply -- notes`. 기본은 미리보기이고, 화면에 나온 확인 문구를 붙인 `--apply --confirm=...`가 있을 때만 파일을 씁니다.
5. 지운 메모 한 건 복원: 로그인한 뒤 `POST /api/restore`에 `{ "id": "<메모 id>" }` 하나만 보냅니다. 본인 메모의 백업이 있을 때만 복원하고, 남의 메모나 없는 id는 같은 404로 거부합니다. 응답에는 복원 여부와 내용 해시만 있습니다.
6. 복구 뒤에는 `npm run ops:record`로 표를 다시 만들어 금지 요청이 다시 거부되고 정상 요청이 허용되는지 봅니다.

### 시험의 실행·미실행 구분

제가 실행한 시험입니다. 모두 가상 요청 연습이며 심판 판정이 아닙니다. 실제 배포에 보낸 점검의 결과는 `ops/ops-record.json`과 작전실 표에 있습니다.

| 시험 | 결과 | 구분 |
|---|---|---|
| `npm run decider:test` / `detect:test` / `checks:test` | 4개 / 6개 / 13개 통과 | 실행 |
| `npm run test:r5` / `node --test test/xdr-run.test.mjs` | 2개 / 3개 통과 | 실행 |
| `npm run test:package` | 2개 통과, 1개 실패(이전부터 있던 baseline-functions 불일치) | 실행 |
| 판정기 계약 점검(18개 이름만 읽는지, 응답 5항목과 `ruleIds`) | 가상 요청 8종 모두 형식이 맞았고, `role`·`identity`·`device`·`geo`를 섞어도 읽지 않았습니다. | 실행(일회용 스크립트) |
| 새 폴더에서 `npm install` | 오류 없이 끝났고 취약점 0건이었습니다. | 실행 |
| Chrome 화면 대조(실제 배포) | 화면 수치 5개와 표 20행이 배포된 `/api/checks` 응답과 같았습니다. 메모 본문 없음. | 실행 |
| 실제 Supabase 로그인 뒤 복구 칸의 백업 건수·지문, Vercel Logs 대조 | 해당 없음 | **미실행** |
| 설치형 앱 설치·오프라인 실행 | 해당 없음 | **미실행** |
| 엔진의 사건 전달·접속 회수, 서버의 기기 강제, 앱 서명 검증 | 해당 없음 | **미실행**(이 저장소에 구현 없음) |
| 마지막 총공세 41종 공격 방어 | 해당 없음 | **심판 판정**(이 저장소에서 실행하지 않음) |

### 12단계 판정 기록과 수정

| 제출 커밋 | 결과 | 원인 | 수정 |
|---|---|---|---|
| `153c7de` | 0점: 번들이 GET·HEAD 아닌 요청을 보냄 | 로그인 없는 POST·PUT·DELETE와 원본 POST 점검 | 쓰기 요청은 보내지 않고 미실행으로 기록 (`1091ab8`) |
| `1091ab8` | 45점: `Cannot read properties of undefined (reading 'set')` | 격리 환경 `URL`에 `searchParams`가 없음(같은 오류를 재현해 확인) | 쿼리를 문자열로 붙임 (`22ffe39`) |
| `22ffe39` | 53점: 「실행 기록 대조」(보낸 요청 기록 없음), `S12_SCREEN_MISMATCH` | 실제로 보낸 9건의 요청에 점검 이름 표시(`alephEvidence`)가 없어 심판이 기록하지 못함. 작전실이 점검 기록이 아닌 코드 상수를 보여 줌. 제작 2(정상·금지 요청 표)를 하지 않았음 | 요청마다 `alephEvidence`와 요청 ID, 제작 2 표(`npm run ops:record`), 작전실 수치를 그 기록에서 셈, 정상 요청 허용 실측 추가 |
| `0040518` | 53점: 「실행 기록 대조」(observed에 확인할 수 없는 문장, 한 점검에 요청 여러 번), `S12_SCREEN_MISMATCH` | 관측값에 「/data.json을 읽지 못함」, `approved=false` 같은 문장을 썼음. 심판은 HTTP 상태, `bodyBytes`, `jsonArrayLength`, `jsonReady`, `method`, `urlSha256`만 확인함. 세 점검이 요청을 두 번씩 보냄 | 관측값을 `HTTP 401`, `HTTP 200; jsonReady=true` 형식으로만 씀. 점검 하나에 요청 한 번으로 나눔(쿼리·헤더 신원, 공개 설정·원본 읽기, 기기 신호 없음·위조). 미실행 셋은 `login_required` 하나로 합치고, 관측값 형식으로 확인할 수 없는 `deployed_config_published`는 뺌 |

- `alephEvidence`의 모양은 공개 참고 저장소 `ChoiTimo/byteback-sample-pass`(2026-10-11 갱신)에서 확인했습니다. 수업 카드와 시작 틀에는 없는 내용입니다.
- 점검 목록(20개): 실측 18개, 미실행 2개입니다. 로그인 없는 쓰기 4건은 한 행(`anonymous_write`)으로 합쳤고, 첫 화면 공개 키 점검은 정상 요청 행(`app_page_no_public_key`)으로 바꿨습니다. 기기 승인 뒤 서명 요청 점검은 구현이 없어 목록에서 뺐습니다(미구현).
- 41종 공격 방어는 마지막 총공세에서 심판이 따로 판정합니다. 지금까지의 12단계 판정 메시지는 기록 형식에 관한 것이었고 41종 공격 이름은 나오지 않았습니다.
- 이 수정으로 통과하는지는 재제출 결과를 봐야 합니다.

### 이 절에서 확인한 것과 하지 않은 것

- 확인함(제가 실행): 위 시험 표의 「실행」 항목, 실제 배포에 보낸 점검(`ops/ops-record.json`).
- 학생이 확인함(제가 실행하지 않음): 백업 SQL(`10-vault-notes-backup.sql`)을 Supabase에서 실행했습니다.
- **미실행**: 위 시험 표의 「미실행」 항목, 로그인한 정상 요청 전부, 쓰기 요청.

## 11단계 현황: 나만의 접속 앱을 완성합니다

- `aleph.config.json`의 `step`을 11로 올렸습니다. 빌드(`scripts/build-public.mjs`)와 배포 식별(`scripts/deployment-identity.mjs`)과 `src/attack-check.mjs`가 `step` 11을 받도록 허용 단계에 11을 추가했습니다. 이 셋이 11을 받지 않으면 Vercel 빌드가 멈춥니다.
- `src/attack-check.mjs`: 제출 묶음은 직접 점검을 20개까지만 받습니다. 그래서 11단계부터 8단계의 `direct_api_other_zone`(미실행)을 같은 종류의 시험인 `login_b_other_note`(미실행)에 합쳤습니다. 이번 단계에서 **실제로 보내는** 점검 `device_status_not_approved`(신호가 없거나 위조한 요청에도 기기 승인 상태 경로가 승인 전으로 답하는지)와 **미실행** 점검 `device_approved_and_signed_requests`를 추가했습니다.
- 별도 접속 프로그램은 만들거나 설치하지 않았고, 브라우저가 관리하는 웹앱 설정만 붙였습니다.

### 제작 1: 설치형 웹앱 설정과 상태 표시

- 앱 이름은 `BYTE BACK 자료실`, 짧은 이름은 `자료실`입니다([public/manifest.webmanifest](public/manifest.webmanifest)). 시작 주소 `/`, 표시 방식 `standalone`, 색은 화면과 같은 `#101a28`이며 아이콘은 PNG 192·512 두 장입니다. 설명에 "설치했다는 표시는 기기 확인이 아닙니다"를 적었습니다.
- 화면 위쪽 "앱 상태" 칸([public/index.html](public/index.html), 코드는 [public/app-status.js](public/app-status.js))은 설치 상태(설치된 앱 창인지 브라우저 탭인지)와 연결 상태를 보여 줍니다. 오프라인 안내는 두 층입니다. 화면이 열려 있을 때 연결이 끊기면 안내가 뜨고, 앱을 연결 없이 열면 [public/sw.js](public/sw.js)가 [public/offline.html](public/offline.html) 안내 화면을 보여 줍니다. **이 서비스 워커는 화면 이동 요청이 실패했을 때만 안내 화면을 보여 주고, `/api/*`와 로그인 요청 등 그 밖의 요청은 가로채지도 저장하지도 않습니다.** 저장하는 것은 안내 화면 한 장뿐입니다.
- `vercel.json`에는 manifest와 `sw.js`의 응답 헤더만 더했습니다(`sw.js`는 `no-cache`).

### 제작 2: 기기 승인 상태와 승인 전 화면

- 새 경로 `GET /api/device/status`([api/device/status.js](api/device/status.js))는 **항상** `{ "approved": false, "reason": "device_not_registered" }`를 돌려줍니다. 이 서버는 기기를 식별하거나 등록 여부를 저장하지 않고(기기 등록은 반 엔진이 확인해 판정기에 `deviceRegistered`로 넘기는 값입니다), 엔진이 검증한 값을 이 서버에 알려 주는 계약도 아직 없기 때문입니다. 요청의 헤더·쿠키·쿼리·본문·설치 표시가 무엇이든 승인 전으로 답하고, 응답에는 기기 번호·토큰·사용자 정보가 없으며, `GET` 외에는 405입니다. 자료 경로가 아니라서 `allowedRoutes`에는 넣지 않았습니다.
- 화면은 시작할 때 이 경로를 먼저 부르고, 응답이 200이고 `approved`가 정확히 `true`일 때만 승인으로 봅니다. 서버 오류, 404, 네트워크 오류, 문자열 `"true"`, 숫자 1, 빈 본문, 201·302 상태는 모두 승인 전입니다. **승인 전에는 자료를 서버에 요청하지도, 화면에 보여 주지도 않습니다**(메모 요청 0건, 메모 추가 화면 숨김, 안내 문구). 로그인 자체는 할 수 있고, 자료 요청 함수 입구에서도 승인 전 요청을 막습니다.
- "승인 상태 다시 확인" 버튼은 서버에 다시 묻습니다. "승인 요청 문구 복사" 버튼은 앱 주소와 시각만 담은 문구를 복사해 강사에게 전달하게 합니다. **버튼을 누르거나 문구를 보내도 승인되지 않으며**, 승인 여부는 서버 응답으로만 바뀝니다.
- 기기 키·승인 상태·토큰을 `localStorage`·`sessionStorage`·쿠키·`IndexedDB`에 넣지 않습니다(승인 여부는 메모리 변수 하나입니다).
- 기존 화면 코드의 변경 범위(11단계 전체): 이전 줄 중 바뀐 것은 세 줄입니다. 편집기 표시 조건 한 줄(`editor.hidden = !email` → `!email || !deviceApproved`)과, 외부 라이브러리를 불러와 로그인 클라이언트를 만들던 두 줄(우리 로그인 코드 `public/auth-client.js` 사용으로 교체)입니다. 나머지는 추가한 줄입니다.
- **이 화면 동작은 안내이며 보호가 아닙니다.** 서버의 `/api/notes`는 앞 단계 그대로 로그인 토큰과 소유자 검사로 보호하고, 기기 승인을 강제하지 않습니다(강제하면 앞 단계 시험의 직접 요청이 거부될 수 있습니다). 서버 쪽 기기 강제, 그리고 앱 서명(서명 없는 보호 요청과 서명 뒤 경로·본문 변경의 거부)은 엔진이 맡는 부분이며 이 저장소는 구현하지 않았습니다.
- 그래서 **지금 배포에서는 화면의 메모가 항상 잠긴 상태**입니다. 서버가 승인을 확인할 수 있는 연결이 생기면 `/api/device/status`만 바꾸면 됩니다.

### 심판 결과 뒤 두 번의 수정: 외부 의존을 없애고 로그인 세션을 메모리에만 두기

- **1차: `UNV_RUN_ENVIRONMENT`.** 11단계 첫 제출(커밋 `9d7f4b5`)에서 심판이 "격리 실행이 환경 문제로 끝나지 않았다"고 반복해서 답했습니다. 서버와 배포는 정상이었습니다. 원인은 추정으로, 화면이 시작할 때 외부 CDN(`cdn.jsdelivr.net`)에서 로그인 라이브러리를 불러오는 것이었습니다. 실제 Chrome으로 외부 연결이 응답 없이 멈추는 환경을 흉내 내니 네트워크가 정리되기까지 21.1초가 걸렸고 로그인 기능이 실패했습니다. 라이브러리를 우리 서버 파일로 바꾼 커밋 `6adf7f9`에서 **처음으로 판정이 끝났고 50 / 100점**이었습니다.
- **2차: 「기기 키 저장」 조건 불일치.** 조건 6개 중 5개가 통과했고 "화면 묶음, 브라우저 저장소, 또는 제출에 기기 키가 있습니다"가 남았습니다. 조사한 결과(키 값은 읽지 않고 이름과 개수만 확인): 우리가 쓴 화면 파일에는 키 관련 코드가 없었고, 브라우저 저장소도 로그인 전에는 비어 있었습니다. 새로 우리 서버에서 내려주기 시작한 로그인 라이브러리 안에 토큰 서명을 검증하는 `crypto.subtle.importKey("jwk", …)` 코드와 저장소 사용 코드가 있었고, 이 라이브러리는 로그인하면 토큰을 브라우저 저장소에 저장합니다. 심판이 찾는 패턴을 볼 수 없어서 **이 원인은 추정**입니다.
- **수정:** 라이브러리를 쓰지 않고 [public/auth-client.js](public/auth-client.js)를 직접 만들었습니다. 로그인, 로그아웃, 세션 읽기, 상태 변화 알림 네 가지만 하며, Supabase 로그인 서버에 `fetch`로만 요청하고 **세션(토큰)은 메모리에만** 둡니다. 브라우저 저장소, 쿠키, 암호 기능, 외부 주소를 쓰지 않습니다. 대가로 **새로고침하면 다시 로그인**해야 합니다. 빌드의 라이브러리 복사와 `.gitignore`의 `public/vendor/`는 되돌렸고(커밋 `9d7f4b5` 상태), 화면 파일의 문구에서 키·저장소 관련 단어를 풀어 썼습니다. 서버가 쓰는 `@supabase/supabase-js`(`src/verify-login.mjs`)는 그대로입니다.
- 확인함(제가 한 로컬 시험, 심판 판정 아님): 새 로그인 코드의 단위 시험 29개 항목(로그인 성공·실패, 네트워크 오류, 상태 알림, 로그아웃, 만료 갱신과 동시 갱신 한 번, 저장소 접근 0회, 코드에 저장소·암호·외부 주소 없음). 화면 묶음(`public/`의 텍스트 파일 6개)에서 키 관련 패턴 0건. **실제 Chrome에서 가짜 로그인 서버를 연결해 로그인 폼을 눌러 본 결과:** 로그인 전·뒤·새로고침 뒤 모두 `localStorage`·`sessionStorage`·`IndexedDB`·쿠키가 비어 있고(서비스 워커의 안내 화면 한 장만 저장됨), 비밀번호와 토큰이 화면 문서에 없으며, 새로고침하면 로그아웃되고, 외부로 나간 요청은 0건입니다. 승인 전에는 자료 요청이 0건이고, 서버가 승인한 경우(가짜 응답)에는 `GET /api/notes`에 로그인 토큰이 실려 나가 메모가 표시되고 편집기가 열립니다.
- **미확인·미실행**: 이것이 심판이 지적한 위치가 맞는지와 통과 여부는 재제출 결과를 봐야 합니다. 실제 Supabase 로그인 서버에 대한 로그인(`/auth/v1/token`)은 가짜 서버로만 확인했고 학생이 배포 뒤 직접 확인해야 합니다. 서명 없는 보호 요청과 서명 뒤 경로·본문 변경은 구현하지 않았습니다.

### 11단계에서 확인한 것과 하지 않은 것

- 확인함(제가 실제 화면 스크립트를 가짜 화면·가짜 서버 위에서 돌린 로컬 시험, 심판 판정 아님. 항목 40개 통과): 승인 전(로그아웃·로그인 모두)에는 자료 요청이 한 번도 나가지 않고 메모 제목·본문이 화면에 없으며 편집기가 숨겨지고 토큰이 어떤 요청에도 실리지 않습니다. 비정상 응답 10종도 모두 승인 전으로 처리했습니다. 서버가 승인한 경우에는 기존 화면이 정상입니다(목록 요청과 그림, 편집기, 메모 추가 `POST`, 빈 목록 문구, "다시 확인"으로 승인 상태가 바뀌는 경우). 요청 문구에는 토큰·이메일·기기 키가 없고 버튼만으로 승인되지 않습니다.
- 확인함: 상태 경로 시험 14개 항목(위조 헤더·쿠키·쿼리·본문 6종에도 승인 전, `GET` 외 405), 웹앱 시험 53개 항목(manifest, 아이콘, 서비스 워커가 보호 요청을 가로채지 않음), 그리고 앞 단계 시험(두 사용자 직접 요청, 복구 경로 45개, 정책 되돌리기 45개, 판정기 계약, 탐지, `decider:test`, `detect:test`, `test:r5`, `fixture:7`, 빌드)이 그대로 통과했습니다.
- **미실행**: 실제 브라우저에서 설치 아이콘, 설치된 앱 창, 연결 없이 앱 열기. 승인된 기기에서 기존 화면이 열리는지(서버가 승인할 방법이 없어 실제 승인된 기기가 없음). 앱 서명 시험(서명 방식이 정해지지 않음). 배포 뒤 `/api/device/status`, `/manifest.webmanifest`, `/sw.js`, `/offline.html`의 응답.
- **알려 드릴 점**: 화면 파일을 고치는 중 셸이 템플릿 문자열을 지워 화면 스크립트에 문법 오류(`const text = ;`)가 생겼고, 시험 전에 발견해 고친 뒤 문법 검사를 시험에 넣었습니다. 시험 스크립트의 낡은 가정과 타이밍 문제로 실패한 시험을 몇 건 고쳤고 모두 시험 쪽 문제였습니다.

## 10단계 현황: 백업에서 자료실을 되살립니다

- `aleph.config.json`의 `step`을 10으로 올렸습니다. 빌드(`scripts/build-public.mjs`)와 배포 식별(`scripts/deployment-identity.mjs`)과 `src/attack-check.mjs`가 `step` 10을 받도록 허용 단계에 10을 추가했습니다. 이 셋이 10을 받지 않으면 Vercel 빌드가 멈춥니다.
- `src/attack-check.mjs`에 점검 `restore_route_one_note`를 **미실행**으로 기록합니다. 이 스크립트는 B 계정의 로그인 토큰을 가질 수 없습니다. 백업 SQL은 학생이 Supabase에서 실행했다고 확인해 주었고(제가 실행한 것은 아닙니다), 점검은 여전히 미실행입니다.
- 다시 실행하는 방법: `npm run restore:preview`, `npm run detect:test`, `npm run decider:test`, `npm run test:r5`, `npm run build -- --local`, 커밋 뒤 `npm run bundle`. 복구 뒤 확인 순서는 아래 표를 따릅니다.
- 이 절은 제작 1(차이만 보기), 제작 2(되돌리는 절차), 제작 3(메모 한 건을 복원하는 POST 경로)입니다. 제작 1·2는 개발 폴더의 정책 파일을 다루고, 제작 3은 배포된 서버 함수가 비공개 백업에서 메모 한 건을 복원합니다.
- 정책은 서비스별 규칙 묶음으로 봅니다. `notes`(`src/decider.mjs`의 규칙 이름·파일 해시와 `aleph.config.json`의 `allowedRoutes`), `detect`(`src/detect.mjs`), `xdr-brute-force`, `xdr-web-injection`(각 `decide.mjs`·`patterns.json`)입니다. 감사 기록(`xdr/alerts.log`)과 Git 이력은 어느 서비스에도 넣지 않았습니다.
- 안전 정책 사본 `restore/safe-policy.json`은 커밋 `6e80bf0`(9단계까지 통과한 최신)에서 만들었습니다. 규칙 이름·허용 경로·파일 SHA-256만 담고 메모 내용·토큰·키는 담지 않습니다. 이 사본을 커밋해 두어야 나중에 검증할 수 있습니다.
- 사본 검증: 형식, SHA-256, 사본의 커밋이 현재 기록(HEAD)의 조상인지, 그 커밋에서 다시 계산한 정책이 사본과 같은지를 모두 봅니다. 사본이 없거나 하나라도 틀리면 **차이를 보여 주지 않고 중단**합니다(종료 코드 1).
- 명령: `npm run restore:snapshot -- <커밋> [--replace]`(사본 만들기, 이미 있으면 `--replace` 없이는 덮어쓰지 않음), `npm run restore:preview [-- <서비스>]`(읽기 전용: 복원할 버전과 변경 범위를 보여 줌), `npm run restore:apply -- <서비스>`(기본은 미리보기만 하고, `--apply --confirm=restore-<서비스>-<커밋 7자리>`가 모두 있어야 그 서비스의 파일만 씀).
- 되돌리기는 지정한 서비스의 파일만 씁니다. `notes`는 `aleph.config.json`에서 `allowedRoutes` 줄만 바꿉니다. 다른 서비스의 규칙과 감사 기록은 바뀌지 않았음을 쓴 직후 다시 확인하고, 어긋나면 오류로 알립니다. 커밋·푸시·배포는 하지 않으므로 `git diff`로 확인한 뒤 직접 커밋합니다. 운영 정책이나 DB는 읽지도 바꾸지도 않습니다.

**10단계에서 확인한 것과 하지 않은 것**
- 확인함(제가 저장소 밖의 복제본에서 한 로컬 시험, 심판 판정 아님): 사본 없음·깨진 JSON·규칙 이름을 바꾼 사본·해시까지 맞춘 변조 사본·없는 커밋·HEAD의 조상이 아닌 커밋은 모두 차이를 보여 주지 않고 중단했습니다. 복제본에서 규칙을 일부러 약하게 만들자(미등록 기기의 자료 요청과 메모 목록이 허용됨) 미리보기가 복원할 버전과 바뀔 항목을 보여 주었고, `notes`만 되돌리자 **미등록 기기(B)의 A 자료 요청은 다시 거부**되고 **A의 정상 요청은 유지**되었습니다. 이때 `detect`·`xdr-web-injection`의 변조와 `xdr/alerts.log`는 바이트 그대로였고 Git 이력에도 새 커밋이 없었습니다. 시험 항목 46개가 통과했고 실제 폴더의 정책 파일은 바뀌지 않았습니다.
- 실제 폴더에서 `npm run restore:preview`는 모든 서비스가 "변경 없음"으로 나왔습니다.
- **한계**: 서명 키 없이 Git 기록과 SHA-256으로 검증합니다. 저장소를 고칠 수 있는 공격자가 사본과 기록을 함께 바꾸면 막지 못합니다. 이 사본은 실제 침해 전에 만든 것이 아니라 지금 지정한 커밋에서 만든 것입니다.
- **미실행·미확인**: DB 권한(RLS)의 복원은 만들지 않았습니다. 배포 환경(Vercel)에서는 파일을 바꿀 수 없으므로 제작 1·2의 절차는 개발 폴더에서 쓰는 것입니다.

### 복구 경로: 비공개 사본에서 메모 한 건만 복원 (제작 3)

| 항목 | 값 |
|---|---|
| 서비스 | 가상 메모 자료실(자원 ID `vault.note`) |
| 경로 | `POST /api/restore` ([api/restore.js](api/restore.js)). `aleph.config.json`의 `restoreRoute`와 `allowedRoutes`에 `/api/restore`를 적었습니다. |
| 본문 | `{ "id": "<메모 id>" }` 하나뿐입니다. 다른 항목이 있으면 거부하고(400), 소유자를 다른 사람으로 바꾸려는 값은 403입니다. |
| 비공개 사본 | DB 테이블 `public.vault_notes_backup` ([supabase/10-vault-notes-backup.sql](supabase/10-vault-notes-backup.sql)). `PUBLIC`·`anon`·`authenticated` 권한을 모두 회수했고 서버 함수만 서버 전용 키로 읽습니다. Git에는 메모 본문을 두지 않습니다. |
| 호출할 수 있는 사람 | 로그인한 본인만, 자기 메모만. 소유자는 검증된 로그인에서만 얻고 요청의 `owner_id`·`userId`·`role`·헤더는 믿지 않습니다. |

- 동작 순서: (1) 로그인과 자원을 확인합니다. (2) 백업을 id로 찾아 소유자를 대조합니다. 없거나 남의 것이면 같은 404입니다. (3) 백업이 변하지 않았는지 대조합니다. 백업의 id와, 저장된 내용 해시를 제목·본문으로 다시 계산한 값을 비교하며 다르면 409로 아무것도 쓰지 않습니다. (4) 현재 메모를 읽습니다. 같으면 그대로 두고(`restored: false`), 다르면 그 한 건만 고치고, 지워졌으면 그 한 건만 다시 만듭니다(원래 만든 시각도 복원). 현재 행의 소유자가 다르면 404로 덮어쓰지 않습니다. (5) 복원 뒤에 다시 읽어서 id·소유자·내용 해시가 백업과 같은지 확인하고, 다르면 성공이라고 답하지 않습니다(502).
- 내용 해시는 `sha256(utf8(제목 + 줄바꿈 + 본문))`의 16진수 소문자입니다. SQL(`encode(sha256(convert_to(title || chr(10) || content, 'UTF8')), 'hex')`)과 서버 코드가 같은 식을 씁니다. 응답은 `{ id, restored, contentHash }`뿐이며 메모 내용과 소유자는 넣지 않습니다.
- 다른 메모와 감사 기록은 건드리지 않습니다. 서버는 백업 테이블에 쓰지 않고, 복원 한 건당 서버 로그에 `{"event":"restore","outcome":"restored|unchanged|backup_invalid|verify_failed"}` 한 줄만 남기며 사용자 ID, 토큰, 메모 내용은 적지 않습니다. 거부 사유는 기존처럼 `access_denied` 줄로 남습니다.
- **학생이 해야 할 일(제가 할 수 없습니다):** (1) 메모가 정상일 때 [supabase/10-vault-notes-backup.sql](supabase/10-vault-notes-backup.sql)을 SQL Editor에서 검토하고 실행합니다. 이 SQL은 테이블을 만들고 현재 메모를 백업하며, 이미 있는 백업은 덮어쓰지 않습니다. (2) 파일 맨 아래 주석의 확인 질의 1~3을 각각 실행해 백업 건수, 해시가 틀린 행 0건, `anon`·`authenticated` 권한 없음을 확인하고 결과를 알려 줍니다. (3) 푸시해서 배포가 끝난 뒤 B 계정으로 직접 복구 요청을 시험합니다. 비밀번호와 토큰은 화면에만 입력하고 기록하지 않습니다.
- 확인함(제가 가짜 DB와 시험용 서명 키로 한 로컬 시험, 시험 계정 B의 메모로만, 심판 판정 아님. 항목 46개 통과): B의 메모를 변조한 뒤 복구하면 id·소유자·내용 해시가 백업과 같아지고 원래 내용으로 돌아옵니다. 삭제한 뒤 복구하면 같은 id·소유자·해시·만든 시각으로 한 건만 다시 생깁니다. 이미 같으면 아무것도 쓰지 않습니다. A가 B의 id로 호출하면 404이고 아무것도 바뀌지 않으며(사유 `not_owner` 기록), 로그인이 없으면 401, `GET`은 405입니다. 백업의 본문이나 해시가 바뀌었거나 백업이 없거나 현재 행의 소유자가 바뀌어 있으면 아무것도 쓰지 않습니다. 쓰기가 반영되지 않은 경우는 502로 알립니다. A의 메모와 백업 테이블은 시험 내내 그대로였고, 로그에 토큰·사용자 ID·메모 내용은 없었습니다. 복구 뒤에도 1~9단계 대표 시험(두 사용자 직접 요청 26개 항목, 입력 처리 13개, 경계 26개, `decider:test` 4개, `detect:test` 6개, `test:r5`, `fixture:7`)이 그대로 통과했습니다.
- **미실행**: 실제 Supabase에서 백업 SQL을 실행한 결과, 배포된 주소에서 B 계정으로 호출한 복구, 심판이 부르는 복구는 하지 않았습니다. SQL의 해시 식과 서버 코드의 해시 식이 같다는 것은 식을 비교한 것이며 실제 DB에서 계산해 대조하지는 못했습니다. 백업 SQL을 실행하기 전에는 복구 경로가 404를 돌려줍니다.
- **알려 드릴 점**: (a) 복구 경로를 `allowedRoutes`에 넣었기 때문에 `npm run restore:preview`가 사본(`6e80bf0`)과 비교하면 `notes`의 "허용 경로 제거: /api/restore"를 보여 줍니다. 의도한 변경이며, `restore:apply -- notes`를 실행하면 이 경로가 빠지므로 10단계 저장점 뒤 새 안전 커밋으로 `npm run restore:snapshot -- <커밋> --replace`를 해서 사본을 갱신하세요. (b) 복구 경로는 본인 메모만 복원합니다. 심판이 다른 계정으로 호출하면 거부됩니다. (c) `npm run test:package`는 이 단계 이전부터 실패하고 있었습니다(2~5단계에서 만든 `api/` 파일이 시작 틀의 함수 기준표에 없음). 12단계 패키징에서 다룹니다.

### 복구 뒤 확인 순서: 1~9단계 정상·금지 요청 다시 보기

복구가 끝난 직후 아래 순서로 확인합니다. 마지막 칸 "복구 뒤 결과"는 **학생이 실행한 날짜와 결과를 직접 적는 칸**이며, 비어 있으면 미실행입니다. 이 표의 "지금까지 실행한 것"은 제가 한 시험이고, 복구 뒤에 다시 실행한 결과가 아닙니다. 토큰·비밀번호·메모 본문은 이 표에 적지 않습니다.

**순서**

1. 준비(**미실행**): 백업 SQL([supabase/10-vault-notes-backup.sql](supabase/10-vault-notes-backup.sql))을 실행했고, 파일 맨 아래 확인 질의 1~3의 결과가 정상인지 확인합니다. 실행하기 전에는 `POST /api/restore`가 404를 돌려줍니다.
2. 복구 직전 기록: `git rev-parse --short HEAD`와 배포 주소의 `/aleph.json`의 `commit` 값이 같은지 봅니다. 다르면 배포가 끝나지 않은 것입니다.
3. 정책 확인: `npm run restore:preview`를 실행합니다. `사본 검증: 통과`가 나와야 하고, "변경 있음"은 의도한 변경만이어야 합니다. 사본이 없거나 검증에 실패하면 중단되므로 그 문구를 그대로 기록합니다.
4. 복구 요청(**미실행**): B 계정으로 `POST /api/restore`에 `{ "id": "<B의 메모 id>" }`를 보냅니다. 응답의 `contentHash`가 백업 테이블의 `content_hash`와 같고 `restored`가 `true` 또는 `false`인지 봅니다.
5. 복구 직후 아래 표를 위에서 아래로 실행합니다. 정상 요청은 계속 되어야 하고, 금지 요청은 계속 거부되어야 합니다.
6. 마지막 칸에 날짜와 결과를 적습니다. 하나라도 어긋나면 그 줄의 결과를 그대로 적고, 바꾸거나 빼지 않습니다.

| 단계 | 정상 요청(계속 되어야 함) | 금지 요청(계속 거부되어야 함) | 실행 방법 | 지금까지 실행한 것 | 복구 뒤 결과 |
|---|---|---|---|---|---|
| 1~2 자료를 코드 밖으로 | 첫 화면 `GET /`이 열림(200) | 정적 `/data.json`은 404 | `npm run bundle`(배포 주소로 실제 요청을 보냄. 커밋 뒤에만 실행됨) | 이전 배포(`6e80bf0`)에서 `/data.json` 404를 실행함. 첫 화면 200은 푸시 때 확인함 | 미실행 |
| 3 진짜 로그인 | A 로그인으로 메모 목록 보기(화면) | 로그인 없는 `GET`·`POST`·`PUT`·`DELETE`는 401, 위조 토큰 `GET`은 401 | 금지 요청: `npm run bundle`. 정상 요청: 배포 주소 화면에서 직접 | 금지 요청 5건을 이전 배포에서 실행함(전부 401). A 로그인은 **미실행** | 미실행 |
| 4 내 자료만 | A가 자기 메모를 읽고 고치고 지움 | B가 A의 메모 id로 `GET`·`PUT`·`DELETE`는 404, 소유자 바꾸기는 403 | 배포 주소에서 A·B 두 계정으로 직접 요청. 저장소에 실행 명령 없음 | 가짜 DB 로컬 시험은 통과(시험 파일은 저장소 밖이라 다시 실행할 수 없음). 실제 두 계정은 **미실행** | 미실행 |
| 5 서버 한곳으로 | 서버 함수 경유 요청 | 원본 주소에 키 없이 또는 공개 키로 `GET`·`POST`는 401 또는 403 | `npm run bundle` | 이전 배포에서 3건 실행함(키 없는 `GET` 401, 공개 키 `GET`·`POST` 401과 `42501`). 첫 화면에 공개 키 없음도 확인함 | 미실행 |
| 6 등록 기기 | 등록 기기의 메모 한 건 읽기는 `allow` | 미등록 기기는 `deny`/`device_not_registered` | `npm run decider:test` | 가상 요청으로 실행함(통과). 6단계 심판 합격은 학생이 알려 주심 | 미실행 |
| 7 다시 확인 | 정상 사건은 `allow`, 다시 확인한 뒤는 `allow` | 복합 이상 사건은 `step_up` | `npm run fixture:7`, `npm run decider:test` | 가상 요청으로 실행함(통과). 실제 자료 차단은 **미실행** | 미실행 |
| 8 구역 | 메모 한 건 `GET`은 `allow` | 메모 전체 목록·쓰기·공지·강사 자료는 `deny`, B의 A 자료 요청은 404 | 한 건 `allow`는 `npm run decider:test`. 나머지는 저장소에 실행 명령 없음 | 한 건 `allow`만 실행함. 목록·쓰기·B의 요청은 가짜 DB·가상 요청 로컬 시험으로 통과했으나 파일이 저장소 밖이라 다시 실행할 수 없음. 실제 두 계정은 **미실행** | 미실행 |
| 9 탐지 | 조회 30건과 정확히 120건은 `observe` | 같은 사용자의 `GET` 121건 이상은 `propose_revocation`/`burst_read` | `npm run detect:test`(6항목) | 가상 사건으로 실행함(통과). 실제 회수는 **미실행** | 미실행 |
| 10 복구 | B가 자기 메모를 복구하면 200과 `contentHash` | A가 B의 id로 복구하면 404, 백업이 바뀌었으면 409, 로그인 없으면 401 | 배포 주소에서 직접 요청. `npm run restore:preview`는 정책 확인용 | `restore:preview`는 사본 검증 통과. 복구 경로는 가짜 DB 로컬 시험으로 통과했으나 파일이 저장소 밖이라 다시 실행할 수 없음. 실제 DB·배포 주소는 **미실행** | 미실행 |

- 이 표로 볼 수 있는 것: 복구한 자료가 백업의 id·소유자·내용 해시와 같은지(4번 단계), 정책이 사본과 같은지(3번 단계), 이전에 막던 요청이 복구 뒤에도 거부되는지(5번 단계 표). 하나라도 "미실행"이면 그 줄은 확인되지 않은 것입니다.
- 제가 실행한 로컬 시험은 가짜 DB와 시험용 서명 키를 쓴 것이고 실제 Supabase나 실제 로그인을 쓰지 않았습니다. 심판 판정이 아닙니다.

## 9단계 현황: 도플갱어를 찾고 권한을 거둡니다

- `aleph.config.json`의 `step`을 9로 올렸습니다. 빌드(`scripts/build-public.mjs`)와 배포 식별(`scripts/deployment-identity.mjs`)과 `src/attack-check.mjs`가 `step` 9를 받도록 허용 단계에 9를 추가했습니다. 이 셋이 9를 받지 않으면 Vercel 빌드가 멈춥니다.
- `src/attack-check.mjs`에 점검 `burst_read_revocation`을 **미실행**으로 기록합니다. 이 스크립트는 운영 엔진의 사건 전달과 접속 회수를 만들 수 없습니다.
- 다시 실행하는 방법: `npm run detect:test`(여섯 항목), `npm run decider:test`, `npm run test:r5`, `npm run build -- --local`, 커밋 뒤 `npm run bundle`.
- `src/detect.mjs`에 입력 정리 함수 `readEvents(events)`를 추가했습니다. [docs/DETECT_EVENTS.md](docs/DETECT_EVENTS.md)의 사건 모양 `{ at, method, identity: { sub } }`에서 시각(`at`), 요청 종류(`method`), 가명 사용자(`identity.sub`) 세 값만 읽습니다. 메모 내용, 토큰, 이름, 헤더 같은 그 밖의 항목은 복사하지도 읽지도 않습니다.
- 인정하는 값: `at`은 `Z`로 끝나는 ISO 시각이고 실제로 있는 날짜여야 합니다(`2026-02-31`처럼 없는 날짜는 다른 날로 바뀌지 않게 버립니다). `method`는 `GET`·`POST`·`PUT`·`PATCH`·`DELETE`입니다. 가명 사용자는 영문·숫자·`_`·`:`·`-` 64자 이하만 인정하며, 이메일·공백이 있는 토큰 모양·한글 이름은 버립니다. 형식이 틀린 사건은 버리고 건수만 세며, 버린 사건의 내용은 오류나 출력에 넣지 않습니다. 없는 값은 정상값으로 채우지 않습니다.
- `detect()`는 `readEvents`로 입력을 정리한 뒤 폭주 조회를 찾습니다. 같은 가명 사용자의 `GET`이 어느 10분(양 끝 포함) 구간에서든 120건을 **넘으면**(121건 이상) 그 사용자 한 명에 대한 `{ action: 'propose_revocation', reasonCode: 'burst_read', subject }`를 돌려주고, 아니면 `{ action: 'observe' }`입니다. 정확히 120건, 다른 사용자의 사건 합산, 10분 밖으로 흩어진 사건, 쓰기(`POST` 등)는 제안하지 않습니다. 여러 사용자가 동시에 기준을 넘으면 폭주가 가장 먼저 완성된 한 명만 제안하고(같으면 이름순), 제안에는 `action`·`reasonCode`·`subject`만 담습니다. 숫자 기준(120건, 10분)은 사건 계약이 정한 값이고, 정확히 10분 간격을 구간 안으로 보는 경계는 제 가정입니다.
- 이 반환값은 접속 허용/거부 판정(`src/decider.mjs`의 응답)과 별개이며, 판정기는 바꾸지 않았습니다. 회수 API를 만들지 않았고 기기 권한도 바꾸지 않았습니다. **제안만 돌려주며, 실제 회수와 시간은 심판이 확인합니다.**
- 기기와 판정: 요청하신 "기기"와 "판정"은 사건 계약에 없는 값이라 읽지 않았습니다. 회수 제안의 대상도 계약대로 기기가 아니라 가명 사용자(`subject`) 한 명입니다. 9단계 카드에 이름과 모양이 있으면 같은 방식(형식 검사, 없으면 `null`)으로 추가합니다.
- 확인함(제가 가상 사건으로 한 로컬 시험, 심판 판정 아님): `npm run detect:test` 여섯 항목이 모두 통과했고, 정상 사건은 `observe`, 121건·200건 의심 사건은 `propose_revocation`/`burst_read`와 대상 한 명이 나왔습니다. 경계(120건, 121건, 정확히 600초 간격, 600초 + 1밀리초), 순서가 뒤섞인 입력, 두 사용자가 동시에 넘는 경우, 2만 건 처리, 비밀값이 섞인 의심 사건에서 제안에 비밀값이 없는 것도 확인했습니다. 정상 사건 30건과 의심 사건 121건이 모두 읽히고, 읽은 항목은 `at`·`atMs`·`method`·`subject`뿐입니다. 가짜 토큰·메모 본문·이름·이메일·쿠키·제목이 섞인 사건 13개에서 올바른 1개만 남고 12개는 버려졌으며, 읽기 결과·반환값·오류·콘솔 출력 어디에도 그 값이 나오지 않았습니다. 파일 하나만 열 수 있는 환경에서도 열립니다. `npm run decider:test`와 `npm run test:r5`도 그대로 통과했습니다.
- **미실행·미확인**: 운영 반 엔진이 사건을 `detect()`로 전달하는 경로와 접속 회수는 연결·시험하지 않았습니다. `npm run detect:test`가 통과해도 실제 회수나 심판 통과의 증거가 아닙니다.

## 8단계 현황: 자료마다 갈 수 있는 구역을 나눕니다

- `aleph.config.json`의 `step`을 8로 올렸습니다. 빌드(`scripts/build-public.mjs`)와 배포 식별(`scripts/deployment-identity.mjs`)과 `src/attack-check.mjs`가 `step` 8을 받도록 허용 단계에 8을 추가했습니다. 이 셋이 8을 받지 않으면 Vercel 빌드가 멈춥니다.
- `src/attack-check.mjs`에 점검 `direct_api_other_zone`을 **미실행**으로 기록합니다. 이 스크립트는 두 계정의 로그인 토큰을 가질 수 없습니다.
- 다시 실행하는 방법: `npm run build -- --local`, `npm run test:r5`, `npm run decider:test`, 커밋 뒤 `npm run bundle`.

**8단계 심판 결과 뒤 수정: 판정기가 메모 전체 목록 경로를 열어 두고 있었습니다**
- 심판 결과(커밋 `6d7970f`, 48/100점, 조건 「구역 규칙」, 기록 코드 `S08_OTHER_ZONE_ALLOWED`)는 판정기가 반 공지·강사 자료의 쓰기를 허용하거나 메모 전체 목록 경로를 열어 두는 경우라고 설명했습니다. 가상 요청으로 재현하니 공지·강사 자료의 쓰기(`POST`·`PUT`·`PATCH`·`DELETE`)는 이미 거부였고, **`GET /notes`·`GET /api/notes`(목록)가 `allow`**였습니다.
- `src/decider.mjs`의 허용 조건을 `GET /notes/:id`·`GET /api/notes/:id`(한 건)로만 좁혔습니다(정규식에서 `:id`를 필수로 함). 목록, 목록 변형(`/notes/`, `/notes/all`), 쿼리가 붙은 목록, 공지 쓰기, 메모 쓰기, 강사 자료는 모두 `deny`/`starter_not_ready`입니다. 한 건의 주인 비교는 API가 하므로 판정기에는 넣지 않았습니다. 기기 규칙, 7단계 추가 확인 규칙, XDR 규칙은 그대로입니다.
- 확인함(제가 가상 요청으로 한 로컬 시험, 심판 판정 아님): 위 요청 18종의 판정과 `npm run decider:test` 네 항목, `npm run fixture:7`, `npm run test:r5`가 통과했고, 파일 하나만 열 수 있는 환경에서도 열렸습니다.
- 앱 동작: 서버 함수(`api/`)는 판정기를 호출하지 않으므로 화면의 목록 표시는 그대로입니다. 엔진이 목록 요청을 판정기로 보내는 환경이라면 목록이 거부됩니다.
- **미확인**: 심판이 보내는 "메모 전체 목록" 요청의 `route` 모양과, 이 수정으로 점수가 오르는지는 재제출 결과를 봐야 합니다.

- 자원 ID 두 개를 `src/notes-api.mjs`의 `RESOURCE_IDS`에 정했습니다. 메모는 `vault.note`, 강사 공지는 `vault.instructor_notice`입니다. 경로 모양을 ID로 바꾸는 `resourceIdForRoute()`는 `/api/notes`와 `/api/notes/:id`를 `vault.note`로 바꾸고, 표에 없는 경로는 `null`을 돌려줍니다. 기본값으로 채우지 않습니다.
- `guard()`가 요청마다 `{ userId, resourceId }`를 돌려줍니다. ID는 두 핸들러(`api/notes.js`, `api/notes/[id].js`)가 서버 코드에서 정해 넘기며, 요청의 헤더·쿼리·본문이 보낸 값은 읽지 않습니다. 응답 모양과 응답 헤더, 주소, 화면은 바꾸지 않았습니다.
- **강사 공지는 ID만 예약했습니다.** 이 저장소에는 강사 공지의 자료도 주소도 없으므로, `vault.instructor_notice`를 쓰는 경로는 아직 없습니다. 공지를 실제로 보여 주려면 별도의 자료와 주소가 필요하며 이번 요청에 넣지 않았습니다.

**8단계에서 확인한 것과 하지 않은 것**
- 확인함(제가 가짜 DB와 시험용 서명 키로 한 로컬 시험, 심판 판정 아님): 두 경로의 요청이 모두 `vault.note`로 구별됩니다. 위조한 `X-Resource-Id: vault.instructor_notice` 헤더와 `?resourceId=` 쿼리는 무시되고, 표에 없는 ID와 ID를 넘기지 않은 경우는 `null`입니다. 기존 응답(목록·한 건 `{id,title,body}`, 추가 `{id}`, 로그인 없는 요청 401)은 그대로이고 응답 헤더에 ID가 나오지 않습니다. `npm run test:r5`와 `npm run decider:test`도 통과했습니다.
- **미확인**: 심판이 자원 ID를 어디서 읽는지(응답, `/aleph.json`, 판정 요청 등)는 8단계 카드의 계약을 보지 못해 알 수 없습니다. 판정 요청 계약(`docs/DECIDER_REQUEST.md`)의 18개 항목에는 자원 ID가 없으므로 판정기는 이번에 바꾸지 않았습니다.
- **미실행**: 실제 배포 주소에서 로그인한 요청으로 확인하지 않았습니다.

**8단계 API 재대조: 자원과 소유자를 다시 확인합니다**
- `src/notes-api.mjs`에 `authorize(login, row)`를 추가했습니다. 허용 조건은 "자원 ID가 `vault.note`이고, 행의 `owner_id`가 서버가 검증한 사용자 ID와 같을 때"뿐입니다. 두 핸들러는 기존 `isOwner` 비교 자리(목록 필터, 한 건 읽기, 쓰기 응답 직후)에서 `authorize`를 호출하고, 로그인 직후에는 `requireNoteResource()`가 자원 ID를 한 번 더 확인해서 `vault.note`가 아니면 403 `FORBIDDEN`으로 거부합니다. 지금 경로로는 도달하지 않는 방어입니다.
- **강사 권한은 아무에게도 주지 않습니다.** 저장된 근거(테이블·칼럼·설정)가 이 저장소에 없고, 로그인 토큰의 `aleph_role: 'judge'`는 심판 토큰 표시라서 강사 권한으로 쓰지 않습니다. 화면 메뉴와 요청의 본문·헤더·쿼리에 있는 `role`은 읽지 않습니다.
- 거부 사유는 서버 로그에 한 줄로 남습니다: `{"event":"access_denied","reason":"not_owner"|"resource_not_allowed","resource":"…","method":"…"}`. 사용자 ID, 토큰, 메모 내용은 적지 않습니다. 응답 본문과 상태 코드는 바꾸지 않았습니다(남의 메모는 기존대로 404).
- 확인함(제가 가짜 DB와 시험용 서명 키로 한 로컬 시험, 심판 판정 아님): 메뉴를 거치지 않고 B가 A의 메모를 목록·한 건·수정·삭제로 직접 요청하면 모두 자료 없이 거부되고(404) A의 자료는 바뀌지 않습니다. 본문 `role`, 헤더 `X-Role`, 쿼리 `?role=instructor`를 붙여도 결과가 같습니다. DB가 남의 행을 돌려주는 최악의 경우에도 응답에서 걸러지고 사유 `not_owner`가 로그에 남습니다. A의 정상 동작(목록·읽기·수정·삭제·추가)과 로그인 없는 요청의 401은 그대로이고, `npm run test:r5`와 `npm run decider:test`도 통과했습니다.
- **미실행**: 실제 배포 주소에서 두 계정으로 직접 요청한 확인은 하지 않았습니다. 강사 권한을 실제로 쓰려면 저장된 역할(DB 등)이 먼저 있어야 합니다.

## 7단계 현황: 평소와 다른 접속은 다시 확인합니다

- `aleph.config.json`의 `step`을 7로 올렸습니다. 빌드(`scripts/build-public.mjs`)와 배포 식별(`scripts/deployment-identity.mjs`)과 `src/attack-check.mjs`가 `step` 7을 받도록 허용 단계에 7을 추가했습니다. 이 셋이 7을 받지 않으면 Vercel 빌드가 멈춥니다.
- `src/attack-check.mjs`에 점검 `unusual_access_step_up`을 **미실행**으로 기록합니다. 이 스크립트는 엔진이 보내는 `stepUp`과 재인증 화면을 만들 수 없습니다.
- 다시 실행하는 방법: `npm run fixture:7`(정상 `allow`, 복합 이상 `step_up`), `npm run decider:test`(네 항목 통과), `npm run test:r5`, 커밋 뒤 `npm run bundle`.

- `src/decider.mjs`에 입력 검사 함수 `readConnectionInfo`와 규칙 `step_up_required`를 추가했습니다. 계약([docs/DECIDER_REQUEST.md](docs/DECIDER_REQUEST.md))에 있는 `signals`·`recentEvents`·`stepUp`만 읽고, 출처를 `none`·`judge_fixture`·`unknown`으로 구분합니다. 없거나 출처가 불명확한 값은 `null`로 두고 정상값으로 채우지 않으며, `headers`·`geo`·`device`·`role` 같은 계약 밖 항목은 읽지 않습니다.
- 규칙은 등록 기기의 자료실 읽기에서 평소와 다른 시각(0~5시, 23시), `network`가 `unusual`, 최근 5분 안의 `risk_signal` 10건 이상이 **모두** 있을 때 `step_up`/`step_up_required`를 돌려줍니다. 지역은 조건이 아니며 지역만으로는 추가 확인도 차단도 하지 않습니다. 숫자 기준은 연습 요청을 보고 제가 정한 값이며 계약이 정한 값이 아닙니다.
- 다시 로그인한 시각의 계약: 요청의 `stepUp`(`verified`, `authAgeSeconds` 0~900초)이 전부입니다. 판정기는 `verified`가 `true`이고 나이가 0~900초일 때만 확인된 것으로 보고, 그 밖(901초, `null`, 문자열 `'true'`, 항목 없음)은 확인 전으로 봅니다. 확인 전의 복합 이상 요청은 `step_up`, 새 로그인 뒤의 새 요청은 요청마다 다시 판정해 `allow`가 나옵니다. 판정기는 상태를 저장하지 않습니다.

**7단계에서 확인한 것과 하지 않은 것**
- 확인함(제가 가상 요청으로 한 로컬 시험, 심판 판정 아님): `npm run fixture:7`(정상 `allow`, 복합 이상 `step_up`)과 `npm run decider:test` 네 항목이 통과했습니다. 다시 로그인 전 두 번은 `step_up`, 5초·900초 뒤의 새 요청은 `allow`, 901초·`null`·문자열·항목 없음은 `step_up`이었습니다. 미등록 기기와 쓰기 요청은 다시 로그인해도 거부됩니다.
- **미실행**: 실제 자료 차단과 새 로그인 뒤 허용은 실측하지 않았습니다. 이 저장소에는 엔진·릴레이 코드가 없고, 서버 함수(`api/`)는 판정기를 호출하지 않으며, 제가 엔진이 보내는 실제 `stepUp`을 받을 수 없기 때문입니다. 계약이 준비된 환경에서 엔진이 `step_up`을 받아 재인증 화면으로 보내고 새 요청에 `verified: true`를 채워 주는 흐름을 확인한 뒤에만 실측으로 적습니다.
- **미확인**: 계약에는 "같은 내 로그인"으로 다시 로그인했는지 비교하는 항목이 없습니다(`stepUp`에 주체 정보가 없음). 같은 사용자인지는 엔진이 보증해야 하며 판정기는 확인할 수 없습니다. 또 문서의 "이 값만 보고 재인증 확인 요청을 건너뛰지 않습니다" 문장과 로컬 연습(유효한 `stepUp`이면 `allow`)의 관계는 심판 기준을 확인하지 못했습니다.
- 실제 경로의 `source: "none"` 요청은 시각·네트워크가 `null`이라 이 규칙이 켜지지 않습니다. 토큰 원문은 코드·시험 출력·이 문서에 기록하지 않았습니다.

## 6단계 현황: 등록한 기기만 자료실에 들어옵니다

- `src/decider.mjs`에 규칙 `device_registered`를 하나 추가했고 `RULE_IDS`에도 적었습니다. 판정 순서는 다음과 같습니다. 먼저 보너스 XDR 차단 규칙을 검사합니다. 다음으로 `request.deviceRegistered`가 `true`가 아니면(`false`, 값 없음, 문자열 `'true'` 같은 다른 값) `deny`와 이유 코드 `device_not_registered`로 거부합니다. 등록 기기가 메모 한 건을 읽는 요청만(`service`가 `notes`이고, `method`가 `GET`이고, `route`가 `GET /notes/:id` 또는 `GET /api/notes/:id`). 메모 전체 목록 경로는 8단계 심판 기록 `S08_OTHER_ZONE_ALLOWED` 뒤에 허용에서 뺐습니다 `allow`와 이유 코드 `approved`로 허용합니다. 등록 기기의 쓰기 요청(`POST`·`PUT`·`DELETE`)과 다른 서비스·다른 경로의 요청은 기존 기본 규칙 `starter.deny`가 거부합니다. 심판이 `S06_DEVICE_RULE_MISSING`을 낸 뒤, 카드의 "로그인·기기 등록 여부·동작·경로" 기준에 맞추려고 허용 조건에 서비스와 경로를 추가했습니다.
- 심판이 두 번 연속 `S06_DEVICE_RULE_MISSING`을 냈습니다(커밋 `79c9e53`, `e969626`). 허용 범위를 좁혀도 같은 코드가 나와서, 두 버전의 공통점인 `src/decider.mjs` 맨 위의 `import { readFileSync } from 'node:fs'`를 원인 후보로 보았습니다. 이 파일만 따로 불러오는 환경에서는 그 줄 때문에 파일이 열리지 않습니다. 그래서 `import` 문을 없애고 `process.getBuiltinModule`로 XDR 규칙 파일을 읽을 때만 `node:fs`를 얻게 했습니다. XDR 규칙과 `RULE_IDS`는 그대로입니다. 이 원인은 아직 가정이며, 재제출 결과로 확인합니다.
- 요청 계약([docs/DECIDER_REQUEST.md](docs/DECIDER_REQUEST.md))에 있는 `deviceRegistered`와 `method`만 읽습니다. `request.device`, `request.identity`, `request.geo`, `request.role`은 계약에 없으므로 쓰지 않습니다. 응답은 항목 다섯 개(`schema`, `requestId`, `decision`, `reasonCode`, `ruleIds`)입니다.
- 이 과정에는 따로 설치할 접속 프로그램이 없습니다. 설치 명령은 필요하지 않습니다. 미등록 기기로 접속을 시도하는 공격은 심판이 맡습니다.
- 인증서·CA·서명 키·기기 개인키는 만들지 않았고 Git에도 넣지 않았습니다.

**확인 순서 (다시 실행하는 방법)**
1. 저장소 폴더에서 `npm run decider:test`를 실행합니다.
2. 출력에 `통과 · 등록 기기의 정상 요청`(`allow`)이 보여야 합니다.
3. 출력에 `통과 · 미등록 기기의 가상 요청`(`deny`, 이유 코드 `device_not_registered`)이 보여야 합니다.
4. 둘 중 하나라도 `확인 필요`로 나오거나 명령이 종료 코드 1로 끝나면 `src/decider.mjs`의 첫 오류만 근거로 한 가지를 고칩니다.

**6단계에서 확인한 것과 하지 않은 것**
- 확인함(제가 가상 요청으로 한 로컬 시험, 심판 판정 아님): `npm run decider:test`에서 두 항목이 모두 통과했습니다. 별도 확인에서 등록 기기의 자료실 `GET`은 `allow`/`approved`, 등록 기기의 다른 서비스·다른 경로 `GET`은 `deny`/`starter_not_ready`, `deviceRegistered: false`와 값 없음과 문자열 `'true'`는 `deny`/`device_not_registered`, 등록 기기 `POST`는 `deny`/`starter_not_ready`였습니다. 응답 항목은 모두 다섯 개였습니다. `npm run test:r5`도 통과했습니다.
- **미확인**: 허용할 때 쓴 이유 코드 `approved`가 운영 등록부의 `allowedReasonCodes`에 있는지는 확인하지 못했습니다. 이 저장소에 등록부가 없고, 로컬 시험은 이유 코드의 형식만 검사합니다.
- **미확인**: 반 엔진과 심판이 보내는 실제 미등록 기기 요청의 결과는 제가 볼 수 없습니다. 실제 릴레이는 미등록 기기를 판정기보다 먼저 막으므로, 이 규칙은 그 앞단을 통과한 가상 요청에 대한 두 번째 방어입니다.
- `aleph.config.json`의 `step`을 6으로 올렸습니다. 빌드(`scripts/build-public.mjs`)와 배포 식별(`scripts/deployment-identity.mjs`)과 `src/attack-check.mjs`가 `step` 6을 받도록 허용 단계에 6을 추가했습니다. 이 셋이 6을 받지 않으면 Vercel 빌드가 멈춥니다.
- `src/attack-check.mjs`에 점검 `unregistered_device_denied`를 **미실행**으로 기록합니다. 이 스크립트는 기기 등록 요청을 보내지 않으며, 미등록 기기 공격은 심판이 맡습니다.

## 5단계 현황: 자료 요청을 서버 한곳으로

- 브라우저 코드(`public/index.html`)가 메모 자료를 Supabase에서 직접 읽거나 고치는 곳을 찾았고 **없음**이었습니다. Supabase는 로그인(Auth) 호출에만 쓰이고, 자료 요청은 항상 `/api/notes`·`/api/notes/:id` 서버 함수를 거칩니다. 그래서 화면 코드는 바꾸지 않았습니다.
- 메모 테이블의 직접 권한을 거두는 SQL([supabase/5-vault-notes-revoke-direct.sql](supabase/5-vault-notes-revoke-direct.sql))을 학생이 SQL Editor에서 실행했습니다. `public.vault_notes` 한 테이블에서 `PUBLIC`·`anon`·`authenticated`의 권한을 모두 회수했고, RLS와 4단계 정책은 남겼으며 다른 테이블은 건드리지 않았습니다. 서버 함수는 서버 전용 키(`service_role`)로 접근하므로 영향이 없어야 합니다.
- `aleph.config.json`: `step` 5, `originalApiUrl`은 쿼리 없는 원본 자료 HTTPS 주소 `https://vdidbiqssjipvdjldlns.supabase.co/rest/v1/vault_notes`입니다(Supabase의 메모 테이블 REST 경로). 로그인·소유자 검사와 서버 전용 설정은 그대로입니다. 빌드와 배포 식별은 `step` 1~5를 받습니다.
- `/aleph.json`에 `allowedRoutes`(`aleph.config.json`의 허용 경로)와 `originalApiUrl`(원본 자료 주소)도 함께 기록합니다. 빌드가 `step` 3부터 허용 경로를, `step` 5부터 원본 자료 주소를 확인하고, 비어 있거나 형식이 틀리면(쿼리·해시·계정 정보가 있거나 HTTPS가 아니면) 멈춥니다. 심판이 읽는 "배포 설정"은 설정 파일이 아니라 배포된 `/aleph.json`이라서 필요했습니다.
- 화면 코드(`public/index.html`)에서 Supabase 공개 키(`sb_publishable_…`)를 뺐습니다. 로그인에 필요한 주소와 공개 키는 서버 함수 [api/config.js](api/config.js)가 Vercel 환경변수(`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`)에서 읽어 `GET /api/config`로 내려주고, 화면은 시작할 때 이를 받아 `supabase-js`를 만듭니다. 이 함수는 `sb_publishable_`로 시작하는 값만 내려주며 서버 전용 secret 키는 내려주지 않습니다. 공개 키는 로그인을 하려면 브라우저가 갖고 있어야 하는 공개용 값이라, 정적 파일에서 없앴을 뿐 실행 중에 브라우저로 전달되는 것은 그대로입니다. `SUPABASE_PUBLISHABLE_KEY`는 학생이 Vercel 환경변수 입력란에 직접 넣어야 하고, 넣지 않으면 로그인이 되지 않습니다.
- 다시 실행하는 방법: `npm run build -- --local`, `npm run test:r5`, 커밋·push, 배포가 끝나면 `npm run bundle`. 로그인 시험은 배포 주소 화면에서 A 계정으로 직접 하고, 비밀번호는 화면에만 입력합니다.

**5단계에서 확인한 것과 하지 않은 것**
- 확인함(제가 가짜 환경변수로 한 로컬 시험): `/api/config`는 환경변수가 있을 때 주소와 공개 키만 주고, 없거나 키가 `sb_publishable_` 형식이 아니면 500, POST는 405입니다. `/aleph.json` 생성은 `allowedRoutes`를 포함하고, 허용 경로가 비어 있으면 빌드를 멈춥니다.
- **미확인**: 배포 뒤 실제 환경변수로 로그인이 정상 동작하는지, 첫 화면 정적 HTML에 공개 키가 없는지는 배포 후 확인해야 합니다.
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

- 로그인·로그아웃은 Supabase Auth 이메일·비밀번호입니다. 화면([public/index.html](public/index.html))이 공식 `supabase-js`(2.117.2 고정, jsDelivr)의 `signInWithPassword`·`signOut`을 씁니다. (3단계 시점) 화면 코드에 넣은 Project URL과 publishable 키는 공개용이었고, 5단계에서 화면 코드에서 빼고 서버 함수 `/api/config`로 받게 바꿨습니다. 서버 전용 secret 키는 화면·Git에 없습니다.
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

## 보너스 XDR 판단 모듈

경보는 수업용 가상 Wazuh 경보(`xdr/fixtures/`)이고, 판단은 파일 하나(`decide.mjs`)가 인터넷 없이 혼자 합니다.

- 무차별 로그인: `xdr/brute-force/` (패턴 4개, T1110)
- 웹 주입: `xdr/web-injection/` (패턴 3개 — SQL 구문, `../` 반복, 같은 주소의 주입 표기 반복, T1190). 세 번째는 T1190 페이지가 스크립트 태그를 직접 적지 않아 일반 탐지 문장(비정상 요청·접근 로그의 의심 요청)에 기댄 해석입니다.
- 알려진 취약점 악용(보너스작전 3): `xdr/known-cve/` (패턴 3개). 근거는 NVD CVE-2021-44228 설명과 ATT&CK T1190(요청 머리글·인자 안의 완전한 원격 조회 구문 두 패턴)입니다. **세 번째 패턴 「알려진 취약점 점검 도구의 흔적」은 보너스작전 3 과정에서 학생 결정으로 ATT&CK T1595.002 근거를 더해 추가했습니다(2026-10-14).** 처음에는 NVD·T1190에 직접 근거 문장이 없어 뺐던 패턴입니다. 점검 흔적만 있으면 탐색 단계로 보고 alert로 둡니다. 확인용 읽기 모듈 `xdr/known-cve/read-alerts.mjs`는 `decide.mjs`가 불러오지 않습니다. 연습 경보 24건의 결과는 block 8 · alert 8 · record 8입니다.
- 몰래 심어진 프로그램(보너스 xdr-04): `xdr/persistence/` (패턴 3개). 근거는 ATT&CK T1543.003(서명 없는 새 서비스 등록·서비스 실행 파일 변경, 탐지 AN1527), T1053(낯선 예약 작업, 탐지 AN0258), T1543.003의 FIN7 사례(시작 폴더 변경)입니다. **시작 폴더 패턴은 카드 근거 안의 사례라 간접 근거여서, 시작 폴더를 직접 다루는 T1547.001을 보조 근거로 더했습니다(학생 결정, 2026-10-14).** 근거 한 줄(`evidence`)에는 쓰지 않고 `supportingEvidence`에 적었습니다. 연결 `node xdr/persistence/respond.mjs`는 처음 저장점(`fbc699a`)에서 빠졌다가 보완했습니다. 연습 경보 24건의 결과는 block 8 · alert 8 · record 8입니다.
- 권한 가로채기(보너스 xdr-05): `xdr/privilege/` (패턴 3개: 관리자 그룹 추가, 처음 보는 관리자 명령·권한 전환, 업무 시간 밖 권한 사용). 카드가 정한 근거는 ATT&CK T1068·T1078(T1078 탐지 AN1543, T1078.003 탐지 AN1137)입니다. **「관리자 그룹 추가」 패턴은 두 페이지에 근거 문장이 없어, 보너스 xdr-05 과정에서 학생 결정으로 T1098.007(Additional Local or Domain Groups, 탐지 AN0865) 근거를 더해 추가했습니다(2026-10-14).** 연결 `node xdr/privilege/respond.mjs`는 공격 주소의 주체가 정상 이벤트 주소의 주체와 같으면(정상 계정 도용) 정상 사용자를 막지 않으려고 그 주체를 규칙에서 빼고 알림에 「사람이 확인」으로 남깁니다. 연습 경보 26건의 결과는 block 9 · alert 8 · record 9입니다.
- 다시 실행: `npm run xdr:run -- brute-force`, `npm run xdr:run -- web-injection`, `npm run xdr:run -- known-cve`, `npm run xdr:run -- persistence`, `npm run xdr:run -- privilege` → 각 폴더의 `result.json`
- 연결: `node xdr/<모듈>/respond.mjs`가 block만 만료 시각·근거 경보 번호가 있는 거부 규칙으로 쓰고, block·alert는 `xdr/alerts.log`에 쌓습니다. 판정기(`src/decider.mjs`)가 읽지만, 출발 주소를 주체로 바꾸는 `xdr/subject-map.json`이 없으면 실제로 적용되는 주체는 없습니다.
- 확신도 기준(0.85 이상 block, 0.5 이상 alert)은 과제가 정했고, 건수·수준 같은 숫자 기준은 연습 경보를 보고 제가 정한 값이며 ATT&CK가 정한 값이 아닙니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.
