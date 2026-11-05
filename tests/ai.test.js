// AI 제목은 선택 기능이다: 키가 없거나 근거가 없으면 호출하지 않고 null 을 돌려줘야 한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-aitest-'));
fs.mkdirSync(path.join(tmp, 'data'));
process.env.PORTFOLIO_HOME = tmp; delete process.env.SCHOOL_GATEWAY_API_KEY;
const ai = require('../lib/ai');

test('키가 없으면 사용할 수 없고 null 이다', async () => {
  assert.equal(ai.available(), false);
  assert.equal(await ai.suggestTitle({ name: 'x', readme: 'a'.repeat(500), langs: {}, deps: [] }), null);
});
test('근거(README·설명)가 거의 없으면 호출하지 않는다', async () => {
  process.env.SCHOOL_GATEWAY_API_KEY = 'test-key';
  const origFetch = global.fetch; let called = false; global.fetch = async () => { called = true; throw new Error('호출되면 안 됨'); };
  try { assert.equal(await ai.suggestTitle({ name: 'x', readme: '', description: '', langs: {}, deps: [] }), null); assert.equal(called, false); }
  finally { global.fetch = origFetch; delete process.env.SCHOOL_GATEWAY_API_KEY; }
});
test('응답에서 제목 한 줄만 꺼내고 따옴표·마침표를 지운다', async () => {
  process.env.SCHOOL_GATEWAY_API_KEY = 'test-key';
  const origFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ content: [{ type: 'thinking' }, { type: 'text', text: '"강의자료를 바꿔 주는 확장."\n설명' }] }) });
  try { assert.equal(await ai.suggestTitle({ name: 'x', readme: 'a'.repeat(100), langs: {}, deps: [] }), '강의자료를 바꿔 주는 확장'); }
  finally { global.fetch = origFetch; delete process.env.SCHOOL_GATEWAY_API_KEY; }
});
