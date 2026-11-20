// 商汤小浣熊凭证 + 模型目录（跨机器通用 + token 自愈）
// - 路径动态发现：从 USERPROFILE / os.homedir() 推导，不硬编码用户名
// - 实时读取：每次请求重读 auth.json，客户端回写新 token 自动生效
// - 过期预警：解码 JWT exp
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/** 动态推导小浣熊配置目录（跨机器通用） */
export function configDir() {
  const home = process.env.USERPROFILE || process.env.HOME || homedir();
  return join(home, '.office-raccoon', 'agent', 'config');
}

export function authFile() { return join(configDir(), 'auth.json'); }
export function profilesFile() { return join(configDir(), 'model-profiles.json'); }

/** 凭证缓存目录：跟随 LOCALAPPDATA / MAGPIE_CONFIG_DIR，避免硬编码用户 */
export function vaultDir() {
  const base = process.env.MAGPIE_CONFIG_DIR
    || join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'magpie-xiaohuanxiong');
  return join(base, 'vault');
}
const VAULT_FILE = () => join(vaultDir(), 'account.json');

/**
 * 实时读登录态（关键：每次请求都重读，客户端刷新后自动生效）
 * 支持从 model-profiles.json 的 authFile 字段覆盖路径（客户端换目录时也能跟上）
 */
export function readDesktopCredentials() {
  let file = authFile();
  const pf = profilesFile();
  if (existsSync(pf)) {
    try {
      const data = JSON.parse(readFileSync(pf, 'utf8'));
      const first = Object.values(data.profiles || {})[0];
      if (first?.authFile && existsSync(first.authFile)) file = first.authFile;
    } catch {}
  }
  if (!existsSync(file)) throw new Error(`未找到小浣熊登录态 ${file}（请先登录客户端）`);
  const auth = JSON.parse(readFileSync(file, 'utf8'));
  if (!auth.access_token) throw new Error('auth.json 缺少 access_token');
  return {
    access: auth.access_token,
    identity: auth.office_identity || 'personal',
    source: 'desktop',
    authFile: file,
  };
}

/** 解码 JWT exp（不验签，只看过期时间；null=无法解析） */
export function tokenExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch { return null; }
}

/** 距过期小时数；null=无法解析，负数=已过期 */
export function hoursRemaining(token) {
  const exp = tokenExpiry(token);
  return exp == null ? null : (exp * 1000 - Date.now()) / 3600000;
}

export function saveCredentials(creds) {
  mkdirSync(vaultDir(), { recursive: true });
  writeFileSync(VAULT_FILE(), JSON.stringify(creds, null, 2));
}
export function loadCredentials() {
  const f = VAULT_FILE();
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; }
}

/** 从 model-profiles.json 读模型列表（去重 defaultModel） */
export function readModels() {
  const file = profilesFile();
  if (!existsSync(file)) return [];
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const seen = new Set();
  const models = [];
  for (const v of Object.values(data.profiles || {})) {
    const key = v.defaultModel;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    models.push({
      key,
      display_name: key,
      context: v.contextWindow || 256000,
      max_output: v.maxTokens || 63999,
      image: !!v.imageInput,
      apiBase: v.apiBase || API_BASE,
    });
  }
  return models;
}

export const API_BASE = 'https://xiaohuanxiong.com/api/web/llm/v2';
