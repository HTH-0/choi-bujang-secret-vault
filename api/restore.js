// 10단계: 비공개 가상 메모 백업(vault_notes_backup)에서 지정한 메모 한 건만 복원한다. POST /api/restore, 본문은 { "id": "<메모 id>" } 하나뿐이다.
// 소유자는 서버가 검증한 로그인에서만 얻고, 본문·헤더·쿼리의 owner_id·userId·role은 믿지 않는다. 본인 메모만 복원할 수 있다.
// 복원 전에 백업의 ID·소유자·내용 해시를 다시 대조하고, 복원 뒤에 다시 읽어서 같은지 확인한다. 다른 메모와 로그는 건드리지 않는다.
import {
  auditRestore, authorize, contentHash, denyReason, guard, isUuid, readJson, requireNoteResource, resourceIdForRoute, rest,
  triesToChangeOwner,
} from '../src/notes-api.mjs';

const COLUMNS = 'id,owner_id,title,content,content_hash,note_created_at';
const NOTE_COLUMNS = 'id,title,content,owner_id';

export default async function handler(request, response) {
  const login = await guard(request, response, ['POST'], resourceIdForRoute('/api/restore'));
  if (!login) return;
  if (!requireNoteResource(login, request, response)) return;
  const input = readJson(request);
  if (!input) return response.status(400).json({ error: 'BAD_REQUEST' });
  // 소유자를 다른 사람으로 바꾸려는 값이 있으면 거부하고, 그 밖의 항목이 있어도 거부한다(본문은 id 하나뿐).
  if (triesToChangeOwner(input, login.userId)) return response.status(403).json({ error: 'FORBIDDEN' });
  if (Object.keys(input).some((key) => key !== 'id')) return response.status(400).json({ error: 'BAD_REQUEST' });
  // 올바른 UUID가 아니면 조회하지 않고 없는 메모로 취급한다.
  if (!isUuid(input.id)) return response.status(404).json({ error: 'NOT_FOUND' });
  const id = input.id.toLowerCase();
  try {
    // 1) 백업을 id로 찾고 소유자를 대조한다. 없거나 남의 것이면 같은 404다.
    const found = await rest({ table: 'vault_notes_backup', query: { select: COLUMNS, id: `eq.${id}` } });
    if (!found.ok) return response.status(502).json({ error: 'UPSTREAM_ERROR' });
    const backups = await found.json();
    if (!Array.isArray(backups)) return response.status(502).json({ error: 'UPSTREAM_ERROR' });
    const backup = backups[0];
    if (!backup) return response.status(404).json({ error: 'NOT_FOUND' });
    const verdict = authorize(login, backup);
    if (!verdict.ok) {
      denyReason(verdict.reason, login, request);
      return response.status(404).json({ error: 'NOT_FOUND' });
    }
    // 2) 백업이 변하지 않았는지 대조한다: ID, 저장된 해시와 다시 계산한 해시.
    const hash = typeof backup.title === 'string' && typeof backup.content === 'string' ? contentHash(backup.title, backup.content) : null;
    if (hash === null || backup.content_hash !== hash || String(backup.id).toLowerCase() !== id) {
      auditRestore('backup_invalid', login);
      return response.status(409).json({ error: 'BACKUP_INVALID' });
    }
    // 3) 현재 행을 읽는다. 있으면 소유자를 대조하고, 같으면 그대로 두고, 다르면 이 한 건만 고친다. 없으면 이 한 건만 다시 만든다.
    const currentResponse = await rest({ query: { select: NOTE_COLUMNS, id: `eq.${id}` } });
    if (!currentResponse.ok) return response.status(502).json({ error: 'UPSTREAM_ERROR' });
    const currentRows = await currentResponse.json();
    if (!Array.isArray(currentRows)) return response.status(502).json({ error: 'UPSTREAM_ERROR' });
    const current = currentRows[0];
    let restored = false;
    if (current) {
      const currentVerdict = authorize(login, current);
      if (!currentVerdict.ok) {
        denyReason(currentVerdict.reason, login, request);
        return response.status(404).json({ error: 'NOT_FOUND' });
      }
      if (contentHash(current.title, current.content) !== hash) {
        const patched = await rest({
          method: 'PATCH', query: { select: NOTE_COLUMNS, id: `eq.${id}`, owner_id: `eq.${login.userId}` },
          body: { title: backup.title, content: backup.content }, prefer: 'return=representation',
        });
        if (!patched.ok) return response.status(502).json({ error: 'UPSTREAM_ERROR' });
        const patchedRows = await patched.json();
        if (!Array.isArray(patchedRows) || !patchedRows.length) return response.status(409).json({ error: 'CONFLICT' });
        restored = true;
      }
    } else {
      const row = { id, owner_id: login.userId, title: backup.title, content: backup.content };
      if (typeof backup.note_created_at === 'string') row.created_at = backup.note_created_at;
      const inserted = await rest({ method: 'POST', query: { select: 'id' }, body: row, prefer: 'return=representation' });
      if (inserted.status === 409) return response.status(409).json({ error: 'CONFLICT' });
      if (!inserted.ok) return response.status(502).json({ error: 'UPSTREAM_ERROR' });
      restored = true;
    }
    // 4) 다시 읽어서 ID·소유자·내용 해시가 백업과 같은지 확인한다. 다르면 성공이라고 답하지 않는다.
    const verifyResponse = await rest({ query: { select: NOTE_COLUMNS, id: `eq.${id}` } });
    const verifyRows = verifyResponse.ok ? await verifyResponse.json() : null;
    const after = Array.isArray(verifyRows) ? verifyRows[0] : null;
    if (!after || String(after.id).toLowerCase() !== id || !authorize(login, after).ok
        || contentHash(after.title, after.content) !== hash) {
      auditRestore('verify_failed', login);
      return response.status(502).json({ error: 'RESTORE_VERIFY_FAILED' });
    }
    auditRestore(restored ? 'restored' : 'unchanged', login);
    // 응답에는 메모 내용도 소유자도 넣지 않는다. 복원 여부와 내용 해시만 돌려준다.
    return response.status(200).json({ id, restored, contentHash: hash });
  } catch {
    return response.status(502).json({ error: 'UPSTREAM_ERROR' });
  }
}
