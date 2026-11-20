// 小浣熊 chat 转发：OpenAI 兼容 API，注入 Bearer token 后透传（已实测直连可用）
import https from 'node:https';

/**
 * Magpie fetch 接口：接受 OpenAI 兼容 Request，转发到小浣熊 API。
 * session.credentials = {access}
 */
export async function chat(session, input, init = {}) {
  let body;
  try {
    const rawBody = typeof input === 'string' ? (init?.body ?? input) : (input?.body ?? init?.body);
    body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  } catch {
    throw Object.assign(new Error('请求体不是有效 JSON'), { status: 400 });
  }

  const token = session.credentials.access;
  const apiBase = session.apiBase;
  // 注意：不能用 new URL('/chat/completions', apiBase) —— 前导 / 会替换掉 apiBase 的 /api/web/llm/v2 路径
  const url = apiBase.replace(/\/+$/, '') + '/chat/completions';
  const payload = Buffer.from(JSON.stringify(body), 'utf8');

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'Content-Length': String(payload.length),
  };
  if (body.stream) {
    headers['Accept'] = 'text/event-stream';
    headers['Cache-Control'] = 'no-cache';
  }

  // 流式：直接桥接上游 SSE
  if (body.stream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const req = https.request(url, { method: 'POST', headers }, (res) => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            let eb = ''; res.on('data', c => eb += c);
            res.on('end', () => {
              try {
                controller.enqueue(encoder.encode('data: ' + JSON.stringify({ error: { message: `小浣熊上游 HTTP ${res.statusCode}`, type: 'upstream_error', detail: eb.slice(0, 500) } }) + '\n\n'));
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

  // 非流式：收齐后原样返回上游 JSON
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'POST', headers }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve(new Response(buf, { status: res.statusCode, headers: {
          'Content-Type': res.headers['content-type'] || 'application/json',
        }}));
      });
    });
    req.on('error', reject);
    req.write(payload); req.end();
  });
}
