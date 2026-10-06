// 메모 한 건: 읽기(GET)·수정(PUT)·삭제(DELETE).
// 알려진 허점: 아직 소유자 검사를 하지 않는다. 로그인한 사용자라면 id만 알면 남의 메모도 읽고 고치고 지울 수 있다.
// 4단계에서 owner_id가 로그인 사용자와 같은지 검사해 막는다.
import { guard, isUuid, readFields, readJson, rest, toNote } from '../../src/notes-api.mjs';

export default async function handler(request, response) {
  const login = await guard(request, response, ['GET', 'PUT', 'DELETE']);
  if (!login) return;
  const id = request.query?.id;
  // 올바른 UUID가 아니면 조회하지 않고 없는 메모로 취급한다.
  if (!isUuid(id)) return response.status(404).json({ error: 'NOT_FOUND' });
  const filter = { id: `eq.${id.toLowerCase()}` };
  try {
    let upstream;
    if (request.method === 'GET') {
      upstream = await rest({ query: { select: 'id,title,content', ...filter } });
    } else if (request.method === 'PUT') {
      const input = readJson(request);
      const fields = input && readFields(input, { required: false });
      if (!fields) return response.status(400).json({ error: 'BAD_REQUEST' });
      upstream = await rest({
        method: 'PATCH', query: { select: 'id,title,content', ...filter }, body: fields,
        prefer: 'return=representation',
      });
    } else {
      upstream = await rest({
        method: 'DELETE', query: { select: 'id', ...filter }, prefer: 'return=representation',
      });
    }
    if (!upstream.ok) return response.status(502).json({ error: 'UPSTREAM_ERROR' });
    const rows = await upstream.json();
    if (!Array.isArray(rows)) return response.status(502).json({ error: 'UPSTREAM_ERROR' });
    if (!rows.length) return response.status(404).json({ error: 'NOT_FOUND' });
    return response.status(200).json(request.method === 'DELETE' ? { id: rows[0].id } : toNote(rows[0]));
  } catch {
    return response.status(502).json({ error: 'UPSTREAM_ERROR' });
  }
}
