// 안전 정책 사본 만들기: npm run restore:snapshot -- <안전한 커밋> [--replace]
// 지정한 커밋의 정책을 계산해 restore/safe-policy.json 한 파일만 씁니다. 이미 사본이 있으면 --replace 없이는 덮어쓰지 않습니다.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SCHEMA, SNAPSHOT_PATH, digestOf, isAncestorOfHead, policyAtCommit, resolveCommit, root, commitInfo } from './restore-lib.mjs';

try {
  const args = process.argv.slice(2);
  const replace = args.includes('--replace');
  const target = args.find((item) => !item.startsWith('--'));
  if (!target) throw new Error('안전한 커밋 번호를 알려 주세요. 예: npm run restore:snapshot -- 6e80bf0');
  const commit = resolveCommit(target);
  if (!isAncestorOfHead(commit)) throw new Error('그 커밋이 현재 기록(HEAD)의 조상이 아닙니다');
  const file = resolve(root, SNAPSHOT_PATH);
  if (existsSync(file) && !replace) throw new Error(`이미 사본이 있습니다 (${SNAPSHOT_PATH}). 정말 바꾸려면 --replace를 붙이세요`);
  const services = policyAtCommit(commit);
  const snapshot = { schema: SCHEMA, commit, services, sha256: digestOf(commit, services) };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  const info = commitInfo(commit);
  process.stdout.write(`사본을 만들었습니다: ${SNAPSHOT_PATH}\n기준 커밋: ${info.short} (${info.date}) ${info.subject}\n서비스 ${Object.keys(services).length}개의 규칙 이름·허용 경로·파일 해시만 담았고, 메모 내용·토큰·키는 담지 않았습니다.\n이 사본을 커밋해 두어야 나중에 검증할 수 있습니다. 이 명령은 정책 파일을 바꾸지 않았습니다.\n`);
} catch (error) {
  process.stderr.write(`사본 만들기 중단: ${error.message}\n`);
  process.exitCode = 1;
}
