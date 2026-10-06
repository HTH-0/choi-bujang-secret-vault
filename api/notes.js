// 로그인한 사용자의 가상 메모 목록(GET)과 추가(POST).
// 추가할 때 owner_id는 서버가 검증한 사용자 ID로만 채운다. 요청이 보낸 값은 쓰지 않는다.
import { guard, isUuid, readFields, readJson, rest, toNote } from '../src/notes-api.mjs';

export default async function handler(request, response) {
  const login = await guard(request, response, ['GET', 'POST']);
  if (!login) return;
  try {
    if (request.method === 'GET') {
      // 로그인 사용자 본인의 메모만 목록으로 준다.
      const upstream = await rest({
        query: { select: 'id,title,content', owner_id: `eq.${login.userId}`, order: 'created_at.asc' },
      });
      if (!upstream.ok) return response.status(502).json({ error: 'UPSTREAM_ERROR' });
      const rows = await upstream.json();
      if (!Array.isArray(rows)) return response.status(502).json({ error: 'UPSTREAM_ERROR' });
      return response.status(200).json(rows.map(toNote));
    }
    const input = readJson(request);
    const fields = input && readFields(input, { required: true });
    if (!fields || (input.id !== undefined && !isUuid(input.id))) {
      return response.status(400).json({ error: 'BAD_REQUEST' });
    }
    const row = { ...fields, owner_id: login.userId };
    if (input.id !== undefined) row.id = input.id.toLowerCase();
    const upstream = await rest({
      method: 'POST', query: { select: 'id' }, body: row, prefer: 'return=representation',
    });
    if (upstream.status === 409) return response.status(409).json({ error: 'CONFLICT' });
    if (!upstream.ok) return response.status(502).json({ error: 'UPSTREAM_ERROR' });
    const created = await upstream.json();
    if (!Array.isArray(created) || !isUuid(created[0]?.id)) {
      return response.status(502).json({ error: 'UPSTREAM_ERROR' });
    }
    return response.status(201).json({ id: created[0].id });
  } catch {
    return response.status(502).json({ error: 'UPSTREAM_ERROR' });
  }
}
