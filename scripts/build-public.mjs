import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deploymentIdentity } from './deployment-identity.mjs';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'data.json');
const output = resolve(root, 'public', 'data.json');
const config = JSON.parse(await readFile(resolve(root, 'aleph.config.json'), 'utf8'));
if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].includes(config.step)) {
  throw new Error('이 단계의 빌드는 아직 정해지지 않았습니다. scripts/build-public.mjs를 확인하세요.');
}
const data = JSON.parse(await readFile(source, 'utf8'));
if (!Array.isArray(data.notes)) {
  throw new Error('실습용 공개 자료 형식을 확인하세요. 실제 학생 자료를 넣으면 안 됩니다.');
}
await mkdir(resolve(root, 'public'), { recursive: true });
// 11단계: 로그인 라이브러리(supabase-js, 설치된 버전 그대로)를 외부 CDN이 아니라 우리 서버의 /vendor/supabase.js로 쓴다.
// 외부 인터넷이 막히거나 멈춘 환경에서도 화면이 끝까지 열리게 하고, 제3자 서버에서 코드를 내려받지 않기 위해서다. 복사하지 못하면 빌드를 멈춘다.
try {
  await mkdir(resolve(root, 'public', 'vendor'), { recursive: true });
  await copyFile(resolve(root, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js'),
    resolve(root, 'public', 'vendor', 'supabase.js'));
} catch {
  throw new Error('로그인 라이브러리(node_modules/@supabase/supabase-js/dist/umd/supabase.js)를 복사하지 못했습니다. npm install을 먼저 실행하세요.');
}
if (config.step === 1) {
  await copyFile(source, output);
  console.log('실습용 공개 자료를 public/data.json에 복사했습니다.');
} else {
  // 2단계부터는 정적 /data.json을 배포하지 않는다(404). 자료는 서버 함수 /api/notes로만 읽는다.
  await rm(output, { force: true });
  console.log('2단계부터는 정적 data.json을 배포하지 않습니다.');
}
if (!process.argv.includes('--local')) {
  const identity = deploymentIdentity(process.env, config);
  await writeFile(resolve(root, 'public', 'aleph.json'),
    `${JSON.stringify(identity, null, 2)}\n`, 'utf8');
  console.log('배포 저장소·커밋·주소를 public/aleph.json에 기록했습니다.');
}
