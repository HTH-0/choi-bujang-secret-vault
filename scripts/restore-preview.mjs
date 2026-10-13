// 복원 미리보기(읽기 전용): npm run restore:preview [-- <서비스>]
// 검증한 안전 정책 사본과 현재 정책의 차이만 보여 줍니다. 사본이 없거나 검증에 실패하면 차이를 보여 주지 않고 중단합니다.
import { AUDIT_LOG, SERVICES, SNAPSHOT_PATH, describeHeader, describeService, diffService, policyNow, verifySnapshot } from './restore-lib.mjs';

try {
  const only = process.argv.slice(2).find((item) => !item.startsWith('--'));
  if (only && !Object.hasOwn(SERVICES, only)) throw new Error(`알 수 없는 서비스입니다. 가능한 서비스: ${Object.keys(SERVICES).join(', ')}`);
  const verified = verifySnapshot();
  if (!verified.ok) throw new Error(`${verified.reason}. 차이를 보여 주지 않습니다`);
  const now = policyNow();
  const names = only ? [only] : Object.keys(SERVICES);
  const lines = ['[복원 미리보기] 읽기 전용 · 아무것도 바꾸지 않았습니다', ...describeHeader(verified), '변경 범위 (복원하면 달라지는 것):'];
  for (const name of names) lines.push(...describeService(diffService(name, verified.snapshot, now)));
  lines.push(`보존: 감사 기록(${AUDIT_LOG})과 Git 이력은 읽지도 바꾸지도 않으며, ${only ? '선택하지 않은 서비스' : '이 미리보기가 되돌리는 것은 없음'}.`);
  lines.push(`되돌리려면: npm run restore:apply -- <서비스> (사본: ${SNAPSHOT_PATH})`);
  process.stdout.write(`${lines.join('\n')}\n`);
} catch (error) {
  process.stderr.write(`복원 미리보기 중단: ${error.message}\n`);
  process.exitCode = 1;
}
