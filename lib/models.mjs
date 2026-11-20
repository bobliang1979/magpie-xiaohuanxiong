// Magpie 模型对象化（契约：必须返回 {id: entry} 对象，不是数组）
// 字段形状对齐 magpie-doubao-work-auth/lib/models.mjs
export function magpieModels(rows, provider = 'xiaohuanxiong', apiBase) {
  return Object.fromEntries(rows.map(row => {
    const id = row.key;
    const entry = {
      id,
      providerID: provider,
      name: row.display_name || row.key,
      api: { id, url: apiBase, npm: '@ai-sdk/openai-compatible' },
      status: 'active',
      headers: {},
      options: {},
      cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
      limit: { context: row.context || 256000, output: row.max_output || 0 },
      capabilities: {
        temperature: false,
        reasoning: false,
        attachment: !!row.image,
        toolcall: true,
        input: { text: true, image: !!row.image, audio: false, video: false, pdf: false },
        output: { text: true, image: false, audio: false, video: false, pdf: false },
        interleaved: false,
      },
      release_date: '',
      variants: {},
    };
    return [id, entry];
  }));
}

export function buildProvider(rows, apiBase) {
  return {
    id: 'xiaohuanxiong',
    name: '商汤小浣熊',
    api: apiBase,
    models: magpieModels(rows, 'xiaohuanxiong', apiBase),
  };
}
