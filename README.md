# BYTE BACK 방어전 시작 틀 R5

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 포함된 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

배포가 끝나면 `/`에서 점령된 가상 자료실을 볼 수 있습니다. 시작 틀에서는 `/data.json`에 같은 가상 메모가 공개됩니다. 이 공개 상태를 확인하는 것이 1단계의 출발점입니다. 1단계 접수와 심판 판정은 포털에서 확인합니다.

## 2단계 현황: 자료를 코드 밖으로

- 가상 메모 네 건은 Supabase 테이블 `public.vault_notes`에 있습니다. 만드는 SQL은 [supabase/2-vault-notes.sql](supabase/2-vault-notes.sql)이고, 메모 INSERT는 SQL Editor에서 직접 실행했습니다. 테이블은 RLS를 켰고 `anon`·`authenticated`에는 권한이 없습니다.
- 화면은 `/data.json` 대신 Vercel 서버 함수 [api/notes.js](api/notes.js)의 `/api/notes`를 읽습니다. 함수는 환경변수 `SUPABASE_URL`과 서버 전용 `SUPABASE_SECRET_KEY`를 읽습니다. 두 값은 Vercel 프로젝트 설정의 Environment Variables 입력란에 직접 넣고, 코드·Git·로그·응답에는 넣지 않습니다. 값을 넣은 뒤에는 다시 배포해야 반영됩니다.
- `vercel.json`의 `headers`가 모든 응답에 `X-Content-Type-Options: nosniff`를 붙입니다. 배포 뒤 `curl -I https://배포주소/`로 확인합니다.
- 루트 `data.json`의 `notes`는 비어 있고, 2단계부터 빌드가 `public/data.json`을 만들지 않아 배포된 `/data.json`은 404입니다. 시작 틀의 확인 표시(`sampleMarker`)도 `/aleph.json`에서 뺐습니다. 이 표시는 1단계 공개 자료에만 둡니다.
- `aleph.config.json`의 `step`은 2이고 `repoUrl`·`publicAppUrl`은 실제 저장소와 배포 주소입니다. 빌드(`scripts/build-public.mjs`)와 배포 식별(`scripts/deployment-identity.mjs`)은 `step` 1과 2를 받습니다. `/aleph.json`에도 `step: 2`가 기록됩니다.
- 다시 실행하는 방법: `npm run build -- --local`로 화면 파일을 만들고, `npm run test:r5`로 시험하고, 커밋·push 뒤 배포가 끝나면 `npm run bundle`을 실행합니다. `npm run bundle`은 작업 트리가 깨끗해야 하고 `bundle-notes.json`(커밋하지 않음)이 필요합니다. 실제 배포 주소로 `/data.json`과 `/api/notes`를 요청한 결과만 `src/attack-check.mjs`가 기록하며, 심판의 판정이 아닙니다.

**아직 남은 약점**
- `/api/notes`는 공개 주소입니다. 로그인 확인이 없어 주소를 아는 누구나 가상 메모 네 건을 읽을 수 있습니다. 서버 함수로 옮긴 것은 키를 숨긴 것이지 접근을 막은 것이 아닙니다. 로그인·허용 경로는 3단계 이후에 추가합니다.
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
| 4. 공개 `/api/notes` | 로그인 없이 HTTP 200으로 가상 메모 4건이 읽힘 | 2026-10-06 |
| 5. 옛 커밋 검색 | `312564a`(메모가 있던 첫 커밋)와 `2e7323a`(메모를 지운 커밋)가 나옴 | 2026-10-06 |

기록할 두 가지는 따로 적습니다.
- **검색 결과**: 최신 파일(1번)과 배포된 정적 파일(3번)에서는 메모 문장이 나오지 않았습니다. GitHub 웹 검색(2번)에서도 `0 files`로 결과가 없었습니다. 옛 커밋(5번)에는 메모가 남아 있으므로 과거 노출은 해소되지 않았습니다.
- **공개 API의 남은 약점**: `/api/notes`는 로그인 없이 누구나 메모 4건을 읽을 수 있습니다(4번). 공개(publishable) 키로 `vault_notes`를 직접 요청하면 `42501 permission denied`로 막힙니다. 약점은 서버 함수 주소가 공개라는 점에 있습니다.

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`을 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 이전 제출 묶음 방식의 자리표시자입니다. 1단계에서는 학생이 편집하지 않습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성합니다. `npm run bundle`과 `bundle-notes.json`도 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 가상 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. 저장소의 `src/attack-check.mjs`는 실제 배포가 된 뒤 `/data.json`을 비로그인으로 요청해 공개 가상 메모의 확인 표시를 읽습니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.
