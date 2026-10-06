-- 5단계: 메모 테이블의 직접 접근 권한 회수 (학습용)
-- 학생이 검토해 Supabase SQL Editor에서 실행한 SQL입니다. 대상은 public.vault_notes 하나입니다.
-- 브라우저가 쓰는 역할(PUBLIC·anon·authenticated)이 이 테이블을 직접 읽거나 고칠 길을 모두 닫습니다.
-- 자료 요청은 서버 함수가 서버 전용 키(service_role)로 한곳에서만 합니다. service_role은 건드리지 않습니다.
-- 이 파일에는 키도, 메모 문장도, 이메일도 넣지 않습니다.

begin;
-- 이 테이블 하나에서만 PUBLIC·anon·authenticated의 직접 권한을 모두 회수
revoke all on table public.vault_notes from public, anon, authenticated;
-- RLS는 켜 둠 (service_role은 RLS를 우회하므로 서버 함수는 영향 없음). 4단계 정책은 남겨 둡니다.
alter table public.vault_notes enable row level security;
commit;

-- 확인 (읽기만, 각각 따로 실행)
-- 1) 두 역할의 실제 권한: anon·authenticated는 비어 있고 service_role은 그대로여야 합니다.
-- select r.role,
--        string_agg(p.priv, ', ' order by p.priv)
--          filter (where has_table_privilege(r.role, 'public.vault_notes', p.priv)) as 허용된_권한
-- from (values ('anon'), ('authenticated'), ('service_role')) r(role)
-- cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(priv)
-- group by r.role order by r.role;
--
-- 2) PUBLIC까지 보는 원본 권한 목록: PUBLIC·anon·authenticated 줄이 없어야 합니다.
-- select coalesce(nullif(a.grantee::regrole::text, '-'), 'PUBLIC') as grantee,
--        string_agg(a.privilege_type, ', ' order by a.privilege_type) as 권한
-- from aclexplode((select relacl from pg_class where oid = 'public.vault_notes'::regclass)) a
-- group by 1 order by 1;
--
-- 3) authenticated의 직접 읽기 거부 시험(읽기만): 'OK: authenticated의 직접 읽기가 거부됨' 오류가 나오면 정상입니다.
-- do $$
-- begin
--   set local role authenticated;
--   begin
--     perform 1 from public.vault_notes limit 1;
--     raise exception '문제: authenticated가 직접 읽을 수 있음';
--   exception when insufficient_privilege then
--     raise exception 'OK: authenticated의 직접 읽기가 거부됨 (permission denied)';
--   end;
-- end $$;

-- 되돌리기 (문제가 있을 때만): 4단계 상태로 돌립니다.
-- begin;
-- grant select, insert, update, delete on table public.vault_notes to authenticated;
-- commit;
