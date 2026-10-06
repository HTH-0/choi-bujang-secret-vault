-- 4단계: 메모 테이블의 최소 권한과 RLS 정책 (학습용)
-- Supabase 대시보드 > SQL Editor에서 학생이 직접 검토해 실행합니다. 대상은 public.vault_notes 하나입니다.
-- 이 파일에는 키도, 메모 문장도, 이메일도 넣지 않습니다.
-- 앱 API는 서버 전용 키(service_role)로 접근하므로 이 SQL과 별개로 코드가 소유자를 검사합니다.
-- 이 정책은 authenticated 역할이 DB에 직접 요청하는 경우의 두 번째 방어선입니다.

begin;

-- 기존 권한을 모두 회수 (PUBLIC 포함)
revoke all on table public.vault_notes from public, anon, authenticated;

-- RLS 켜기
alter table public.vault_notes enable row level security;

-- authenticated에만 네 가지 권한 부여 (anon에는 부여하지 않음)
grant select, insert, update, delete on table public.vault_notes to authenticated;

-- 다시 실행해도 되도록 같은 이름의 정책을 먼저 지움
drop policy if exists vault_notes_select_own on public.vault_notes;
drop policy if exists vault_notes_insert_own on public.vault_notes;
drop policy if exists vault_notes_update_own on public.vault_notes;
drop policy if exists vault_notes_delete_own on public.vault_notes;

-- 읽기·삭제: 기존 행의 소유자가 로그인한 본인일 때만
create policy vault_notes_select_own on public.vault_notes
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy vault_notes_delete_own on public.vault_notes
  for delete to authenticated using ((select auth.uid()) = owner_id);

-- 추가: 새 행의 소유자가 본인일 때만
create policy vault_notes_insert_own on public.vault_notes
  for insert to authenticated with check ((select auth.uid()) = owner_id);

-- 수정: 기존 행도 본인 것이고, 수정한 새 행의 소유자도 본인일 때만
create policy vault_notes_update_own on public.vault_notes
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

commit;

-- 확인 (읽기만, 각각 따로 실행): anon은 비어 있고 authenticated는 DELETE, INSERT, SELECT, UPDATE만 나와야 합니다.
-- select r.role,
--        string_agg(p.priv, ', ' order by p.priv)
--          filter (where has_table_privilege(r.role, 'public.vault_notes', p.priv)) as 허용된_권한
-- from (values ('anon'), ('authenticated')) r(role)
-- cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(priv)
-- group by r.role order by r.role;
--
-- select policyname, cmd, roles, qual, with_check from pg_policies
-- where schemaname = 'public' and tablename = 'vault_notes' order by cmd;

-- 되돌리기 (문제가 있을 때만): 2단계와 같은 상태(공개 키 접근 차단, 서버 전용 키로만 접근)로 돌아갑니다.
-- begin;
-- drop policy if exists vault_notes_select_own on public.vault_notes;
-- drop policy if exists vault_notes_insert_own on public.vault_notes;
-- drop policy if exists vault_notes_update_own on public.vault_notes;
-- drop policy if exists vault_notes_delete_own on public.vault_notes;
-- revoke all on table public.vault_notes from public, anon, authenticated;
-- commit;
