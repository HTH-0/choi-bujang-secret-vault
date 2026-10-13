// 서비스 하나를 검증한 안전 정책 버전으로 되돌립니다: npm run restore:apply -- <서비스> [--apply --confirm=<확인 문구>]
// 기본은 미리보기이며 아무것도 바꾸지 않습니다. --apply와 맞는 확인 문구가 모두 있어야 지정한 서비스의 파일만 씁니다.
// 다른 서비스의 규칙, 감사 기록(xdr/alerts.log), Git 이력은 읽지도 바꾸지도 않습니다. 커밋·푸시·배포는 하지 않습니다.
import { AUDIT_LOG, SERVICES, applyService, confirmPhrase, describeHeader, describeService, diffService, verifySnapshot } from './restore-lib.mjs';

try {
  const args = process.argv.slice(2);
  const name = args.find((item) => !item.startsWith('--'));
  if (!name || !Object.hasOwn(SERVICES, name)) throw new Error(`되돌릴 서비스를 알려 주세요. 가능한 서비스: ${Object.keys(SERVICES).join(', ')}`);
  const verified = verifySnapshot();
  if (!verified.ok) throw new Error(`${verified.reason}. 아무것도 바꾸지 않았습니다`);
  const item = diffService(name, verified.snapshot);
  const phrase = confirmPhrase(name, verified.info);
  const others = Object.keys(SERVICES).filter((other) => other !== name);
  const lines = ['[복원 절차] 실행 전 확인', ...describeHeader(verified), `되돌릴 서비스: ${name}`, '바뀔 항목:', ...describeService(item),
    `보존: 다른 서비스(${others.join(', ')})의 규칙, 감사 기록(${AUDIT_LOG}), Git 이력은 바뀌지 않습니다.`];
  process.stdout.write(`${lines.join('\n')}\n`);
  if (!item.changed) {
    process.stdout.write('바뀔 항목이 없어 아무것도 하지 않았습니다.\n');
  } else if (!args.includes('--apply')) {
    process.stdout.write(`실행하지 않았습니다. 위 항목을 확인한 뒤 실행하려면:\n  npm run restore:apply -- ${name} --apply --confirm=${phrase}\n`);
  } else if (!args.includes(`--confirm=${phrase}`)) {
    throw new Error(`확인 문구가 맞지 않습니다. 아무것도 바꾸지 않았습니다 (필요한 문구: --confirm=${phrase})`);
  } else {
    const written = applyService(name, verified.snapshot);
    process.stdout.write(`되돌렸습니다. 바뀐 파일: ${written.join(', ')}\n다른 서비스와 감사 기록은 바뀌지 않았음을 확인했습니다. 커밋·푸시·배포는 하지 않았습니다. git diff로 확인한 뒤 직접 커밋하세요.\n`);
  }
} catch (error) {
  process.stderr.write(`복원 절차 중단: ${error.message}\n`);
  process.exitCode = 1;
}
