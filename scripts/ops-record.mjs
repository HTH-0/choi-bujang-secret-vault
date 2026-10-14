// 12단계 제작 2: 1~11단계 정상·금지 요청 표를 만든다. npm run ops:record
// 제출 묶음(npm run bundle)과 같은 src/attack-check.mjs의 점검을 실제 배포에 GET으로 보내고, 행마다
// 단계, 정상/금지, 기대 결과, 실제 API 결과, 요청 ID, 확인 시각, 판정 결과를 ops/ops-record.json에 쓴다.
// 응답 본문, 토큰, 키, 메모 내용은 기록하지 않는다. 보내지 않은 점검은 not_run으로 남기고 통과로 세지 않는다.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runAttackRecords } from '../src/attack-check.mjs';
import { countRows } from '../src/checks.mjs';

const root = resolve(import.meta.dirname, '..');
const secretPattern = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/-]{16,}|\bsb_secret_[A-Za-z0-9_-]{12,}|\bsb_publishable_[A-Za-z0-9_-]{12,}|\bsk-[A-Za-z0-9_-]{20,}|\beyJ[A-Za-z0-9_-]{12,}\.eyJ|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu;

try {
  const config = JSON.parse(readFileSync(join(root, 'aleph.config.json'), 'utf8'));
  const commit = execFileSync('git', ['-C', root, 'rev-parse', '--verify', 'HEAD'], { encoding: 'utf8', timeout: 5000, windowsHide: true }).trim();
  const rows = await runAttackRecords(config);
  const record = {
    schema: 'byteback.ops-record.v1', step: config.step, commit, checkedAt: new Date().toISOString(),
    note: '실제 배포에 GET으로 보낸 점검의 기록입니다. 6~9단계 행은 고정된 가상 입력의 판정 결과이며 실제 사용자 기기나 사건이 아닙니다. not_run은 보내지 않은 점검입니다. 41종 공격 방어는 심판이 판정합니다.',
    counts: countRows(rows),
    rows: rows.map(({ attackId, stage, kind, area, expected, observed, result, requestIds, checkedAt }) => ({ attackId, stage, kind, area, expected, observed, result, requestIds, checkedAt })),
  };
  const text = `${JSON.stringify(record, null, 2)}\n`;
  if (secretPattern.test(text)) throw new Error('기록에 비밀값 또는 연락처로 보이는 내용이 있어 쓰지 않았습니다.');
  mkdirSync(join(root, 'ops'), { recursive: true });
  writeFileSync(join(root, 'ops', 'ops-record.json'), text, 'utf8');
  const c = record.counts;
  process.stdout.write(`점검 기록 생성: ops/ops-record.json\n커밋 ${commit.slice(0, 12)} · 점검 ${c.total}개 · 금지 거부 ${c.blocked} · 정상 허용 ${c.allowed} · 예상과 다름 ${c.unexpected} · 미실행 ${c.notRun}\n`);
  for (const item of record.rows) process.stdout.write(`${String(item.stage).padStart(2)} ${item.kind === 'allow' ? '정상' : '금지'} ${item.result.padEnd(10)} ${item.attackId} | ${item.observed}\n`);
} catch (error) {
  process.stderr.write(`점검 기록 생성 중 첫 오류: ${error.message}\n`);
  process.exitCode = 1;
}
