-- 10단계: 가상 메모의 비공개 백업 테이블 (학습용)
-- 학생이 검토해 Supabase SQL Editor에서 한 번 실행합니다. 실행하기 전에는 복구 경로(POST /api/restore)가 백업을 찾지 못해 404를 돌려줍니다.
-- 이 파일에는 키도, 메모 문장도, 이메일도 넣지 않습니다. 대상은 새 테이블 public.vault_notes_backup 하나이며 vault_notes는 읽기만 합니다.
-- 브라우저가 쓰는 역할(PUBLIC·anon·authenticated)은 이 테이블을 읽거나 고칠 수 없습니다. 서버 함수만 서버 전용 키(service_role)로 접근합니다.

begin;

create table if not exists public.vault_notes_backup (
  id              uuid primary key,          -- 원본 메모의 id (한 메모에 백업 한 건)
  owner_id        uuid not null,             -- 원본 메모의 소유자
  title           text not null,
  content         text not null,
  -- 제목과 본문으로 만든 SHA-256(16진수 소문자). 서버가 복구할 때 다시 계산해서 백업이 변하지 않았는지 대조합니다.
  -- 계산식: sha256( utf8( 제목 || 줄바꿈(\n) || 본문 ) )
  content_hash    text not null,
  note_created_at timestamptz,               -- 원본 메모가 만들어진 시각
  backed_up_at    timestamptz not null default now()
);

alter table public.vault_notes_backup enable row level security;
revoke all on table public.vault_notes_backup from public, anon, authenticated;

commit;

-- 백업 만들기: 메모가 정상일 때(침해 전에) 실행합니다.
-- on conflict do nothing: 이미 있는 백업은 덮어쓰지 않습니다. 변조된 메모로 좋은 백업이 바뀌는 일을 막습니다.
-- 소유자가 없는 옛 행은 백업하지 않습니다(어느 사용자도 복구할 수 없기 때문입니다).
insert into public.vault_notes_backup (id, owner_id, title, content, content_hash, note_created_at)
select n.id, n.owner_id, n.title, n.content,
       encode(sha256(convert_to(n.title || chr(10) || n.content, 'UTF8')), 'hex'),
       n.created_at
from public.vault_notes n
where n.owner_id is not null
on conflict (id) do nothing;

-- 확인 (읽기만, 각각 따로 실행)
-- 1) 백업 건수와 원본 건수: 소유자가 있는 원본만큼 백업이 있어야 합니다.
-- select (select count(*) from public.vault_notes where owner_id is not null) as 원본_건수,
--        (select count(*) from public.vault_notes_backup) as 백업_건수;
--
-- 2) 백업의 해시가 제목·본문과 맞는지: 틀린 행이 0건이어야 합니다.
-- select count(*) as 해시가_틀린_백업
-- from public.vault_notes_backup
-- where content_hash <> encode(sha256(convert_to(title || chr(10) || content, 'UTF8')), 'hex');
--
-- 3) 두 역할의 실제 권한: anon·authenticated는 비어 있어야 합니다.
-- select r.role,
--        string_agg(p.priv, ', ' order by p.priv)
--          filter (where has_table_privilege(r.role, 'public.vault_notes_backup', p.priv)) as 허용된_권한
-- from (values ('anon'), ('authenticated'), ('service_role')) r(role)
-- cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(priv)
-- group by r.role order by r.role;

-- 되돌리기 (문제가 있을 때만): 백업 테이블을 없앱니다. vault_notes는 건드리지 않습니다.
-- drop table if exists public.vault_notes_backup;
