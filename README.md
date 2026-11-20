# magpie-xiaohuanxiong

把**商汤小浣熊**（小浣熊办公）桌面客户端里的模型接到 [Magpie](https://github.com/nousresearch/magpie) 网关上，变成 OpenAI 兼容模型，让 Hermes / WorkBuddy / Claude Code / Codex 等 Agent 直接调用。

## 为什么不用 QwenWork 那套

小浣熊**不需要协议逆向**。它的 `box-agent` 本身就是 OpenAI 兼容 API + JWT token：

- API: `https://xiaohuanxiong.com/api/web/llm/v2/chat/completions`
- 认证: Bearer `auth.json.access_token`（明文 JWT，有效期约 24 天）
- 模型目录: `model-profiles.json`（`provider: "openai"`）

已实测：直连 curl + Node https 都返回真实回复，SSE 流式原生支持。

## 可用模型

| 网关模型 id | 说明 |
|---|---|
| `xiaohuanxiong/sn-qwen4-max` | Qwen 4 Max |
| `xiaohuanxiong/sn-kimi-k3` | Kimi K3 |
| `xiaohuanxiong/sn-sensenova-6-8-flash` | SenseNova 6-8 Flash |
| `xiaohuanxiong/sn-glm-5-3-flash` | GLM 5.3 Flash |
| `xiaohuanxiong/raccoon-090dd3` | 小浣熊自有模型 |

经网关实测：非流式 + SSE 流式均返回真实回复。

## 安装

```bash
# 复制到稳定目录
mkdir -p C:/Users/<user>/.magpie-plugins/magpie-xiaohuanxiong/lib
cp index.mjs lib/*.mjs *.json C:/Users/<user>/.magpie-plugins/magpie-xiaohuanxiong/

# 装入 Magpie + 登录
magpie.exe plugin add C:/Users/<user>/.magpie-plugins/magpie-xiaohuanxiong
magpie.exe plugin login xiaohuanxiong

# ⚠️ 改代码/装新插件后必须重启面板
powershell.exe -NoProfile -Command "Get-Process magpie -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep -Seconds 2; Start-Process 'C:/Users/<user>/bin/magpie.exe' -ArgumentList '--app' -WindowStyle Hidden; Start-Sleep -Seconds 8"
```

## 验证

```bash
# 网关模型列表
curl http://127.0.0.1:3425/v1/models | python -c "import sys,json; print([m['id'] for m in json.load(sys.stdin)['data'] if 'xiaohuanxiong' in m['id']])"

# 经网关调用（决定性证据）
curl http://127.0.0.1:3425/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"xiaohuanxiong/sn-qwen4-max","messages":[{"role":"user","content":"Reply: GATEWAY_XH_OK"}],"max_tokens":30}'
```

## 文件

- `index.mjs` — 插件入口（config / auth / provider）
- `lib/auth.mjs` — 从桌面客户端读登录态 + 模型目录
- `lib/chat.mjs` — chat 转发（含流式桥接）
- `lib/models.mjs` — Magpie 模型对象化
- `test_integration.mjs` — 插件集成测试（含流式）

## ⚠️ URL 拼接坑（本机实测）

```js
// ❌ 404 — 前导 / 会把 apiBase 的 /api/web/llm/v2 整个替换掉
new URL('/chat/completions', 'https://xiaohuanxiong.com/api/web/llm/v2')
// ✅ 200
'https://xiaohuanxiong.com/api/web/llm/v2'.replace(/\/+$/, '') + '/chat/completions'
```

## License

MIT