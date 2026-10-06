-- 2단계: 자료를 코드 밖으로 옮깁니다 (학습용 Supabase 테이블)
-- Supabase 대시보드 > SQL Editor에서 한 번 실행합니다.
-- 이 파일에는 키도, 메모 문장도 넣지 않습니다. 메모 INSERT는 SQL Editor에서 직접 실행합니다.

create table if not exists public.vault_notes (
  id         uuid primary key default gen_random_uuid(),
  -- 3단계 로그인 이후 소유자를 연결할 칸입니다. 지금은 auth.users 외래키를 걸지 않습니다.
  owner_id   uuid,
  title      text not null,
  content    text not null,
  created_at timestamptz not null default now()
);

-- RLS를 켭니다. 정책(policy)을 만들지 않으므로 anon·authenticated는 행을 읽을 수 없습니다.
alter table public.vault_notes enable row level security;

-- 테이블 권한도 anon·authenticated에서 회수합니다. 서버 전용 키(service_role)만 접근합니다.
revoke all on table public.vault_notes from anon, authenticated;
