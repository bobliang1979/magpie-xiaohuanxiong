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

// === 新增能力测试 ===
import { _internal } from './index.mjs';
import { readDesktopCredentials, hoursRemaining, configDir } from './lib/auth.mjs';

console.log('\n--- 新能力 ---');
// 7. 动态路径发现（不硬编码用户名）
const dir = configDir();
console.log('7) 动态配置目录:', dir);
if (!dir.includes('.office-raccoon')) { console.log('❌ 路径发现失败'); process.exit(1); }

// 8. 过期预警
const creds = readDesktopCredentials();
const hours = hoursRemaining(creds.access);
console.log('8) token 剩余小时:', hours == null ? 'N/A' : hours.toFixed(1));
if (hours == null || Number.isNaN(hours)) { console.log('❌ 过期解析失败'); process.exit(1); }

// 9. authorize 带 expNote
console.log('9) authorize expNote:', authResult.metadata.expNote || '(none)');
if (authResult.metadata.hoursRemaining == null) { console.log('❌ 缺 hoursRemaining'); process.exit(1); }

// 10. token 自愈：模拟 session.refresh 返回新 token，验证 chat 用了新值
//     构造一个 refresh 始终返回当前 readDesktopCredentials().access 的 session，
//     并故意用过期 token 初始化 —— 应在请求前被 refresh 换成有效 token
const { chat } = await import('./lib/chat.mjs');
const fakeSession = {
  credentials: { access: 'eyJhbGciOiJleHBpcmVkIn0.eyJleHAiOjF9.invalid' }, // 假过期 token
  apiBase: 'https://xiaohuanxiong.com/api/web/llm/v2',
  refresh: () => readDesktopCredentials().access, // 实时读回真 token
};
const healBody = JSON.stringify({ model: 'sn-qwen4-max', messages: [{ role: 'user', content: 'Reply: HEAL_OK' }], max_tokens: 20 });
const healRes = await chat(fakeSession, 'http://x/v1/chat/completions', { method: 'POST', body: healBody });
const healJ = await healRes.json();
const healReply = healJ.choices?.[0]?.message?.content;
console.log('10) token 自愈(假token→实时刷新):', healRes.status, JSON.stringify(healReply));
if (healRes.status !== 200 || !String(healReply).includes('HEAL_OK')) { console.log('❌ 自愈失败(请求前刷新未生效)'); process.exit(1); }

console.log('\n✅ 全部通过（含路径发现 / 过期预警 / token 自愈）');
