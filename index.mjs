/**
 * 商汤小浣熊 → Magpie 供应商插件。
 * 把小浣熊订阅里的模型（sn-kimi-k3 / sn-qwen4-max / sn-glm-5-3-flash 等）
 * 变成 magpie 网关上的 OpenAI 兼容模型。
 * 小浣熊的 box-agent 本身就是 OpenAI 兼容 API（/api/web/llm/v2）+ JWT token，
 * 插件只需读登录态并注入 Bearer，无需协议逆向。已实测直连返回真实回复。
 */
import { readDesktopCredentials, loadCredentials, saveCredentials, readModels, API_BASE } from './lib/auth.mjs';
import { magpieModels, buildProvider } from './lib/models.mjs';
import { chat } from './lib/chat.mjs';

export const PROVIDER = 'xiaohuanxiong';

export default async function XiaoHuanXiongPlugin(input = {}) {
  const sessions = new Map();
  let models = readModels();

  function credsFromAuth(auth) {
    if (auth?.key) { try { return JSON.parse(auth.key); } catch {} }
    return loadCredentials() || readDesktopCredentials();
  }

  function sessionFor(auth) {
    const creds = credsFromAuth(auth);
    const key = creds.access?.slice(-12) || 'default';
    let s = sessions.get(key);
    if (!s) {
      s = { credentials: creds, apiBase: API_BASE };
      sessions.set(key, s);
    }
    return s;
  }

  return {
    config: async (cfg) => {
      cfg.provider ??= {};
      cfg.provider[PROVIDER] ??= buildProvider(models, API_BASE);
      cfg.provider[PROVIDER].models ??= magpieModels(models, PROVIDER, API_BASE);
    },

    auth: {
      provider: PROVIDER,
      maxConcurrency: 1,
      methods: [
        {
          type: 'api',
          keyless: true,
          label: '从小浣熊客户端读取登录态',
          placeholder: '本机已登录的商汤小浣熊账号',
          async authorize() {
            try {
              const creds = readDesktopCredentials();
              saveCredentials(creds);
              return {
                type: 'success',
                key: JSON.stringify(creds),
                accountId: creds.identity || 'xiaohuanxiong',
                metadata: { uid: creds.identity, source: 'desktop' },
              };
            } catch (e) {
              return { type: 'failed', error: '读取小浣熊登录态失败：' + String(e.message || e).slice(0, 300) };
            }
          },
        },
      ],

      // 关键：loader.fetch 是 Magpie 唯一的请求拦截点，必须实现
      async loader(getAuth) {
        const auth = await getAuth();
        return {
          baseURL: API_BASE,
          apiKey: '***',
          async fetch(input_, init) {
            return chat(sessionFor(auth), input_, init);
          },
        };
      },

      async usage() {
        return { windows: [], note: '商汤小浣熊（额度以客户端为准，约 12 积分/条）' };
      },
    },

    provider: {
      id: PROVIDER,
      async models(provider, { auth } = {}) {
        if (!auth) return provider.models;
        try {
          models = readModels();
          return magpieModels(models, PROVIDER, API_BASE);
        } catch {
          return provider.models;
        }
      },
    },
  };
}

export const _internal = { PROVIDER, readDesktopCredentials, readModels };
