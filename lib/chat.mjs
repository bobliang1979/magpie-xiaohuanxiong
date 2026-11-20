// 小浣熊 chat 转发：OpenAI 兼容 API，注入 Bearer token 后透传
// - 每次请求实时重读 token（客户端回写后自动生效）
// - 非流式遇 401/403 自动刷新 token 重试一次（自愈）
import https from 'node:https';

/** 实时刷新 token：优先用 session.refresh() 回调重读 auth.json */
async function refreshToken(session) {
  if (typeof session.refresh === 'function') {
    try {
      const t = await session.refresh();
      if (t && t !== session.credentials.access) {
        session.credentials.access = t;
        return t;
      }
    } catch {}
  }
  return session.credentials.access;
}

function mkHeaders(token, body, payloadLen) {
  const h = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'Content-Length': String(payloadLen),
  };
  if (body.stream) {
    h['Accept'] = 'text/event-stream';
    h['Cache-Control'] = 'no-cache';
  }
  return h;
}

/**
 * Magpie fetch 接口：接受 OpenAI 兼容 Request，转发到小浣熊 API。
 * session = { credentials:{access}, apiBase, refresh?:()=>string }
 */
export async function chat(session, input, init = {}) {
  let body;
  try {
    const rawBody = typeof input === 'string' ? (init?.body ?? input) : (input?.body ?? init?.body);
    body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  } catch {
    throw Object.assign(new Error('请求体不是有效 JSON'), { status: 400 });
  }

  const apiBase = session.apiBase;
  // 注意：不能用 new URL('/chat/completions', apiBase) —— 前导 / 会替换掉 apiBase 的 /api/web/llm/v2 路径
  const url = apiBase.replace(/\/+$/, '') + '/chat/completions';
  const payload = Buffer.from(JSON.stringify(body), 'utf8');

  // 每次请求前实时刷新 token（自愈核心）
  const token = await refreshToken(session);

  // 流式：直接桥接上游 SSE（用最新 token；SSE 一旦开始无法中途换 token，错误转成事件）
  if (body.stream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const req = https.request(url, { method: 'POST', headers: mkHeaders(token, body, payload.length) }, (res) => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            let eb = ''; res.on('data', c => eb += c);
            res.on('end', () => {
              try {
                const hint = res.statusCode === 401 || res.statusCode === 403
                  ? 'token 已过期，请在小浣熊客户端重新登录（auth.json 会自动更新，插件下次请求自动生效）' : '';
                controller.enqueue(encoder.encode('data: ' + JSON.stringify({ error: { message: `小浣熊上游 HTTP ${res.statusCode}`, type: 'upstream_error', detail: eb.slice(0, 300), hint } }) + '\n\n'));
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
              } catch {}
            });
            return;
          }
          res.on('data', c => { try { controller.enqueue(c); } catch {} });
          res.on('end', () => { try { controller.close(); } catch {} });
        });
        req.on('error', e => {
          try {
            controller.enqueue(encoder.encode('data: ' + JSON.stringify({ error: { message: e.message, type: 'transport' } }) + '\n\n'));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch {}
        });
        req.write(payload); req.end();
      }
    });
    return new Response(stream, { status: 200, headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache', 'Connection': 'keep-alive',
    }});
  }

  // 非流式：封装单次请求，遇 401/403 刷新 token 后重试一次
  const requestOnce = (tok) => new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'POST', headers: mkHeaders(tok, body, payload.length) }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, buf: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.write(payload); req.end();
  });

  let result = await requestOnce(token);
  if ((result.status === 401 || result.status === 403) && typeof session.refresh === 'function') {
    const fresh = await refreshToken(session);
    if (fresh !== token) {
      result = await requestOnce(fresh); // 自愈重试一次
      session.tokenRefreshedAt = Date.now();
    }
  }
  return new Response(result.buf, { status: result.status, headers: {
    'Content-Type': result.headers['content-type'] || 'application/json',
  }});
}
