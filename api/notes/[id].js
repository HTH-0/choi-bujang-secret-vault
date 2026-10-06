// 메모 한 건: 읽기(GET)·수정(PUT)·삭제(DELETE).
// 4단계: 모든 동작에서 DB 행의 owner_id가 서버가 검증한 사용자 ID와 같을 때만 허용한다.
// URL·본문·쿼리의 owner_id/userId는 믿지 않는다. 남의 메모는 없는 메모처럼 404로 답한다.
import {
  guard, isOwner, isUuid, readFields, readJson, rest, toNote, triesToChangeOwner,
} from '../../src/notes-api.mjs';

export default async function handler(request, response) {
  const login = await guard(request, response, ['GET', 'PUT', 'DELETE']);
  if (!login) return;
  const id = request.query?.id;
  // 올바른 UUID가 아니면 조회하지 않고 없는 메모로 취급한다.
  if (!isUuid(id)) return response.status(404).json({ error: 'NOT_FOUND' });
  const lowerId = id.toLowerCase();
  try {
    // 기존 행을 읽어 소유자를 확인한다. 없거나 남의 것이면 같은 404다.
    const found = await rest({ query: { select: 'id,title,content,owner_id', id: `eq.${lowerId}` } });
    if (!found.ok) return response.status(502).json({ error: 'UPSTREAM_ERROR' });
    const existing = await found.json();
    if (!Array.isArray(existing)) return response.status(502).json({ error: 'UPSTREAM_ERROR' });
    if (!existing.length || !isOwner(existing[0], login.userId)) {
      return response.status(404).json({ error: 'NOT_FOUND' });
    }
    if (request.method === 'GET') return response.status(200).json(toNote(existing[0]));

    // 쓰는 요청은 id와 owner_id를 함께 걸어 본인 행에만 적용한다(읽은 뒤 바뀌어도 남의 행은 건드리지 않음).
    const mine = { id: `eq.${lowerId}`, owner_id: `eq.${login.userId}` };
    let upstream;
    if (request.method === 'PUT') {
      const input = readJson(request);
      if (!input) return response.status(400).json({ error: 'BAD_REQUEST' });
      // 본문이 다른 소유자를 가리키면 소유자 변경 시도로 보고 거부한다.
      if (triesToChangeOwner(input, login.userId)) return response.status(403).json({ error: 'FORBIDDEN' });
      const fields = readFields(input, { required: false });
      if (!fields) return response.status(400).json({ error: 'BAD_REQUEST' });
      // 새 행의 소유자도 검증된 본인 ID로 고정한다.
      upstream = await rest({
        method: 'PATCH', query: { select: 'id,title,content,owner_id', ...mine },
        body: { ...fields, owner_id: login.userId }, prefer: 'return=representation',
      });
    } else {
      upstream = await rest({
        method: 'DELETE', query: { select: 'id,owner_id', ...mine }, prefer: 'return=representation',
      });
    }
    if (!upstream.ok) return response.status(502).json({ error: 'UPSTREAM_ERROR' });
    const rows = await upstream.json();
    if (!Array.isArray(rows)) return response.status(502).json({ error: 'UPSTREAM_ERROR' });
    if (!rows.length || !isOwner(rows[0], login.userId)) return response.status(404).json({ error: 'NOT_FOUND' });
    return response.status(200).json(request.method === 'DELETE' ? { id: rows[0].id } : toNote(rows[0]));
  } catch {
    return response.status(502).json({ error: 'UPSTREAM_ERROR' });
  }
}
