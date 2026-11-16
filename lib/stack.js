// 저장소의 설정 파일(package.json, requirements.txt, pubspec.yaml, Dockerfile, schema.prisma …)에서
// "어떤 기술을 어떤 버전으로 썼는지"를 읽는다. 추측하지 않고 파일에 적힌 것만 쓴다. (버전은 선언된 값 기준)

// 패키지명 -> [표시 이름, 분류]. null 이면 이력서에 쓰지 않는 것.
const JS = {
  react: ['React', 'Frontend'], next: ['Next.js', 'Frontend'], vue: ['Vue', 'Frontend'], svelte: ['Svelte', 'Frontend'], 'react-router-dom': ['React Router', 'Frontend'],
  tailwindcss: ['Tailwind CSS', 'Frontend'], 'framer-motion': ['Framer Motion', 'Frontend'], three: ['Three.js', 'Frontend'], '@react-three/fiber': ['React Three Fiber', 'Frontend'],
  phaser: ['Phaser', 'Frontend'], zustand: ['Zustand', 'Frontend'], axios: ['Axios', 'Frontend'], recharts: ['Recharts', 'Frontend'],
  vite: ['Vite', 'Build'], esbuild: ['esbuild', 'Build'], typescript: ['TypeScript', 'Language'],
  '@nestjs/core': ['NestJS', 'Backend'], express: ['Express', 'Backend'], 'socket.io': ['Socket.IO', 'Backend'], passport: ['Passport', 'Backend'], jsonwebtoken: ['JWT', 'Backend'],
  '@nestjs/swagger': ['Swagger', 'Backend'], 'swagger-ui-express': ['Swagger', 'Backend'], 'web-push': ['Web Push', 'Backend'], sharp: ['sharp', 'Backend'],
  prisma: ['Prisma', 'Database'], '@supabase/supabase-js': ['Supabase', 'Database'], openai: ['OpenAI SDK', 'AI'], '@google/generative-ai': ['Gemini SDK', 'AI'],
  ioredis: ['Redis', 'Database'], helmet: ['Helmet', 'Backend'], nodemailer: ['Nodemailer', 'Backend'], bcrypt: ['bcrypt', 'Backend'], 'class-validator': ['class-validator', 'Backend'],
  '@nestjs/jwt': ['JWT', 'Backend'], '@nestjs/schedule': ['NestJS Schedule', 'Backend'], '@nestjs/throttler': ['Throttler', 'Backend'], multer: ['Multer', 'Backend'], 'pdf-parse': ['pdf-parse', 'Backend'],
  exifr: ['exifr', 'Backend'], 'lucide-react': ['lucide-react', 'Frontend'], '@vercel/analytics': ['Vercel Analytics', 'Infra'], '@vercel/speed-insights': ['Vercel Speed Insights', 'Infra'],
  wrangler: ['Wrangler', 'Infra'], '@aws-sdk/client-s3': ['AWS S3 SDK', 'Infra'], vitest: ['Vitest', 'Test'], playwright: ['Playwright', 'Test'], jest: ['Jest', 'Test'],
};
const PY = { fastapi: ['FastAPI', 'Backend'], uvicorn: ['Uvicorn', 'Backend'], flask: ['Flask', 'Backend'], django: ['Django', 'Backend'], openai: ['OpenAI SDK', 'AI'],
  pillow: ['Pillow', 'Backend'], numpy: ['NumPy', 'Backend'], 'opencv-python-headless': ['OpenCV', 'Backend'], 'opencv-python': ['OpenCV', 'Backend'], pymupdf: ['PyMuPDF', 'Backend'], fonttools: ['fontTools', 'Backend'], 'imageio-ffmpeg': ['FFmpeg', 'Backend'] };
const DB = { postgresql: 'PostgreSQL', mysql: 'MySQL', sqlite: 'SQLite', mongodb: 'MongoDB' };
const cleanVer = (v) => { const s = String(v || '').replace(/^[\^~>=<\s]+/, '').trim(); return /^\d/.test(s) ? s : ''; };     // "*", "latest", "workspace:*" 같은 값은 버전이 아니다

// files: [{ path, size }], fetchText(path) -> Promise<string|null>
async function scanStack(files, fetchText) {
  const paths = files.map(f => f.path).filter(p => !/node_modules\//.test(p));
  const found = new Map(), notes = new Set();
  const add = (name, cat, ver) => { const cur = found.get(name); if (!cur || (!cur.ver && ver)) found.set(name, { name, cat, ver: ver || '' }); };

  for (const f of paths.filter(p => /(^|\/)package\.json$/.test(p)).slice(0, 5)) {
    let j; try { j = JSON.parse(await fetchText(f) || 'null'); } catch { j = null; } if (!j) continue;
    for (const [d, v] of Object.entries({ ...j.dependencies, ...j.devDependencies })) if (JS[d]) add(JS[d][0], JS[d][1], cleanVer(v));
    if (j.engines && j.engines.node) notes.add('Node.js ' + j.engines.node);
  }
  for (const f of paths.filter(p => /(^|\/)requirements\.txt$/.test(p)).slice(0, 2)) {
    for (const l of (await fetchText(f) || '').split('\n')) {
      const m = /^([A-Za-z0-9_.-]+)\s*(?:==|>=|~=)\s*([\d.]+)?/.exec(l.trim()) || /^([A-Za-z0-9_.-]+)\s*$/.exec(l.trim());
      const k = m && m[1].toLowerCase(); if (k && PY[k]) add(PY[k][0], PY[k][1], m[2] || '');
    }
  }
  for (const f of paths.filter(p => /(^|\/)pubspec\.yaml$/.test(p)).slice(0, 1)) {
    const t = await fetchText(f) || '';
    if (/flutter:\s*\n\s+sdk/.test(t)) add('Flutter', 'Frontend', '');
    const sdk = /sdk:\s*["']?\^?([\d.]+)/.exec(t); if (sdk) notes.add('Dart SDK ' + sdk[1]);
  }
  for (const f of paths.filter(p => /(^|\/)Dockerfile$/.test(p)).slice(0, 2)) {
    const m = /^FROM\s+(\S+)/mi.exec(await fetchText(f) || ''); if (m) notes.add('Docker 이미지 ' + m[1]);
  }
  for (const f of paths.filter(p => /build\.gradle(\.kts)?$/.test(p)).slice(0, 3)) {
    const m = /kotlin\(["']android["']\)\s*version\s*["']([\d.]+)|org\.jetbrains\.kotlin\.android["']\s*version\s*["']([\d.]+)/.exec(await fetchText(f) || '');
    if (m) add('Kotlin', 'Language', m[1] || m[2]);
  }
  const prisma = paths.find(p => /schema\.prisma$/.test(p));
  if (prisma) {
    const t = await fetchText(prisma) || '', db = /provider\s*=\s*"(postgresql|mysql|sqlite|mongodb)"/.exec(t);
    if (db) add(DB[db[1]], 'Database', '');
    const n = (t.match(/^model\s+\w+/gm) || []).length; if (n) notes.add(`Prisma 모델 ${n}개`);
  }
  if (paths.some(p => /(^|\/)wrangler\.(toml|jsonc?)$/.test(p))) add('Cloudflare Workers', 'Infra', '');
  if (paths.some(p => /(^|\/)vercel\.json$/.test(p))) add('Vercel', 'Infra', '');
  if (paths.some(p => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p))) add('GitHub Actions', 'Infra', '');
  if (paths.some(p => /(^|\/)Dockerfile$/.test(p))) add('Docker', 'Infra', '');
  if (paths.some(p => /(^|\/)manifest\.(webmanifest|json)$/.test(p)) && paths.some(p => /(^|\/)(sw|service-worker)[^/]*\.js$/.test(p))) add('PWA', 'Frontend', '');
  if (paths.some(p => /(\.|\/)(test|spec)\.(js|ts|tsx|py)$|(^|\/)tests?\//.test(p))) notes.add('테스트 코드 포함');
  return { stack: [...found.values()], notes: [...notes] };
}
module.exports = { scanStack, cleanVer };
