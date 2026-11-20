// 插件集成测试：config → auth → models → loader.chat（含流式）全链路
import XiaoHuanXiongPlugin from './index.mjs';

const plugin = await XiaoHuanXiongPlugin();
console.log('1) 导出方法:', Object.keys(plugin));

const cfg = {};
await plugin.config(cfg);
const modelIds = Object.keys(cfg.provider?.xiaohuanxiong?.models || {});
console.log('2) config models:', modelIds.length, modelIds.join(', '));
if (!modelIds.includes('sn-qwen4-max')) { console.log('❌ sn-qwen4-max 缺失'); process.exit(1); }
if (modelIds.includes('0')) { console.log('❌ 模型 id 是数组索引'); process.exit(1); }

const method = plugin.auth.methods[0];
const authResult = await method.authorize();
console.log('3) authorize:', authResult.type);
if (authResult.type !== 'success') { console.log('AUTH FAILED:', authResult.error); process.exit(1); }
const auth = { type: 'api', key: authResult.key };

const modelsMap = await plugin.provider.models({ models: cfg.provider.xiaohuanxiong.models }, { auth });
console.log('4) provider.models:', Object.keys(modelsMap).length);

// 非流式
const loader = await plugin.auth.loader(async () => auth);
const body = JSON.stringify({ model: 'sn-qwen4-max', messages: [{ role: 'user', content: 'Reply with exactly: XH_PLUGIN_OK' }], max_tokens: 30 });
console.log('5) loader.chat(非流式) 请求中...');
const res = await loader.fetch('http://x/v1/chat/completions', { method: 'POST', body });
const j = await res.json();
const reply = j.choices?.[0]?.message?.content;
console.log('   status:', res.status, '| model:', j.model, '| reply:', JSON.stringify(reply));
if (!String(reply).includes('XH_PLUGIN_OK')) { console.log('❌ 回复不符'); process.exit(1); }

// 流式
console.log('6) loader.chat(流式) 请求中...');
const streamBody = JSON.stringify({ model: 'sn-qwen4-max', messages: [{ role: 'user', content: 'Reply: XH_STREAM_OK' }], max_tokens: 30, stream: true });
const sres = await loader.fetch('http://x/v1/chat/completions', { method: 'POST', body: streamBody });
const reader = sres.body.getReader();
const dec = new TextDecoder();
let text = '', done = false;
while (!done) {
  const r = await reader.read(); done = r.done;
  if (r.value) for (const line of dec.decode(r.value).split('\n')) {
    if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
    try { const p = JSON.parse(line.slice(6)); const c = p.choices?.[0]?.delta?.content; if (c) text += c; } catch {}
  }
}
console.log('   stream reply:', JSON.stringify(text));
if (!text.includes('XH_STREAM_OK')) { console.log('❌ 流式回复不符'); process.exit(1); }

console.log('\n✅ 插件全链路通过（含流式）');
