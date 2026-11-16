// 설정 파일에서 기술과 버전을 읽는 규칙을 확인한다. (파일에 적힌 것만 쓰고, 이름 모를 패키지는 무시)
const test = require('node:test');
const assert = require('node:assert/strict');
const { scanStack } = require('../lib/stack');

const run = (files, texts) => scanStack(files.map(path => ({ path })), async (p) => texts[p] ?? null);
const byName = (r) => Object.fromEntries(r.stack.map(s => [s.name, s]));

test('package.json: 알려진 기술은 선언된 버전과 함께, 모르는 패키지는 무시', async () => {
  const r = await run(['package.json'], { 'package.json': JSON.stringify({ dependencies: { next: '^16.3.6', react: '19.2.8', lodash: '4' }, devDependencies: { typescript: '~5.3.3' }, engines: { node: '>=22' } }) });
  const s = byName(r); assert.equal(s['Next.js'].ver, '16.3.6'); assert.equal(s.React.ver, '19.2.8'); assert.equal(s.TypeScript.ver, '5.3.3');
  assert.ok(!s.lodash); assert.ok(r.notes.includes('Node.js >=22'));
});
test('같은 기술이 여러 파일에 있으면 버전이 있는 쪽을 쓴다', async () => {
  const r = await run(['a/package.json', 'b/package.json'], { 'a/package.json': JSON.stringify({ dependencies: { react: '*' } }), 'b/package.json': JSON.stringify({ dependencies: { react: '^19.2.0' } }) });
  assert.equal(byName(r).React.ver, '19.2.0'); assert.equal(r.stack.filter(s => s.name === 'React').length, 1);
});
test('Prisma 스키마에서 DB 종류와 모델 수, 설정 파일 이름에서 배포·자동화를 읽는다', async () => {
  const r = await run(['prisma/schema.prisma', 'vercel.json', '.github/workflows/a.yml', 'wrangler.toml', 'Dockerfile', 'tests/a.test.js'],
    { 'prisma/schema.prisma': 'datasource db { provider = "postgresql" }\nmodel A {}\nmodel B {}', Dockerfile: 'FROM node:20-alpine\n' });
  const s = byName(r); assert.ok(s.PostgreSQL && s.Vercel && s['GitHub Actions'] && s['Cloudflare Workers'] && s.Docker);
  assert.ok(r.notes.includes('Prisma 모델 2개')); assert.ok(r.notes.includes('Docker 이미지 node:20-alpine')); assert.ok(r.notes.includes('테스트 코드 포함'));
});
test('requirements.txt 의 고정 버전과 pubspec 의 Flutter 를 읽는다', async () => {
  const r = await run(['requirements.txt', 'pubspec.yaml'], { 'requirements.txt': 'fastapi==0.142.2\nuvicorn\nsome-unknown==1.0\n', 'pubspec.yaml': 'environment:\n  sdk: ^3.9.2\ndependencies:\n  flutter:\n    sdk: flutter\n' });
  const s = byName(r); assert.equal(s.FastAPI.ver, '0.142.2'); assert.ok(s.Uvicorn); assert.ok(s.Flutter); assert.ok(r.notes.includes('Dart SDK 3.9.2'));
});
test('읽기에 실패하거나 깨진 파일이 있어도 멈추지 않는다', async () => {
  const r = await run(['package.json', 'requirements.txt'], { 'package.json': '{깨진' });
  assert.deepEqual(r.stack, []);
});
