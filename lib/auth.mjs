// 商汤小浣熊凭证 + 模型目录
// token 明文存在 ~/.office-raccoon/agent/config/auth.json；模型在 model-profiles.json
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const AUTH_FILE = 'C:/Users/10074/.office-raccoon/agent/config/auth.json';
const PROFILES_FILE = 'C:/Users/10074/.office-raccoon/agent/config/model-profiles.json';
const VAULT_DIR = 'C:/Users/10074/AppData/Local/magpie-xiaohuanxiong/vault';
const VAULT_FILE = join(VAULT_DIR, 'account.json');

/** 从桌面客户端读凭证（已实测 token 有效，24 天有效期） */
export function readDesktopCredentials() {
  if (!existsSync(AUTH_FILE)) throw new Error('未找到小浣熊登录态 auth.json');
  const auth = JSON.parse(readFileSync(AUTH_FILE, 'utf8'));
  if (!auth.access_token) throw new Error('auth.json 缺少 access_token');
  return {
    access: auth.access_token,
    identity: auth.office_identity || 'personal',
    source: 'desktop',
  };
}

export function saveCredentials(creds) {
  mkdirSync(VAULT_DIR, { recursive: true });
  writeFileSync(VAULT_FILE, JSON.stringify(creds, null, 2));
}
export function loadCredentials() {
  if (!existsSync(VAULT_FILE)) return null;
  try { return JSON.parse(readFileSync(VAULT_FILE, 'utf8')); } catch { return null; }
}

/** 从 model-profiles.json 读模型列表（去重 defaultModel） */
export function readModels() {
  if (!existsSync(PROFILES_FILE)) return [];
  const data = JSON.parse(readFileSync(PROFILES_FILE, 'utf8'));
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
      apiBase: v.apiBase || 'https://xiaohuanxiong.com/api/web/llm/v2',
    });
  }
  return models;
}

export const API_BASE = 'https://xiaohuanxiong.com/api/web/llm/v2';
