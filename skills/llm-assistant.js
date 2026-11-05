const PROVIDERS = [
  {
    value: "deepseek",
    label: "DeepSeek",
    url: "https://api.deepseek.com",
    model: "deepseek-flash",
    credential: "deepseekKey"
  },
  {
    value: "openai",
    label: "OpenAI",
    url: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    credential: "openaiKey"
  },
  {
    value: "qwen",
    label: "通义千问 / Qwen",
    url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    credential: "qwenKey"
  }
];

const PURPOSE_IDS = ["short", "polish", "proofread", "tone"];

const STRINGS = {
  en: {
    name: "LLM Assistant",
    provider: "Provider",
    providerDescription: "Only the selected provider's endpoint, model, and key are shown.",
    baseUrl: "Base URL",
    baseUrlDescription: "The /chat/completions path is appended automatically when missing.",
    model: "Model",
    apiKey: "API key",
    apiKeyDescription: "Stored securely by Foxy; the plugin never receives the key.",
    purpose: "Task",
    inputLabel: "Text",
    inputPlaceholder: "Enter the text to process",
    clear: "Clear",
    close: "Close",
    confirm: "Insert",
    send: "Send",
    assistantTitle: "LLM Assistant",
    resultTitle: "Result · %1 · confirm to insert or clear",
    purposeShort: "Answer",
    purposePolish: "Polish",
    purposeProofread: "Proofread",
    purposeTone: "Change tone",
    prefixShort: "Answer the following briefly and accurately. Return only the answer:\n",
    prefixPolish: "Polish the following text while keeping its meaning. Return only the rewritten text:\n",
    prefixProofread: "Fix only the typos and obvious grammar issues in the following text. Return only the corrected text:\n",
    prefixTone: "Rewrite the following text in a more natural and polite tone. Return only the rewritten text:\n",
    missingKey: "Add the %1 API key in the plugin settings first",
    missingConfig: "Complete the %1 service configuration first",
    emptyResult: "The AI returned an empty result",
    requestFailed: "Request failed: %1"
  },
  "zh-CN": {
    name: "LLM 助手",
    provider: "服务商",
    providerDescription: "仅显示所选服务商的地址、模型和密钥。",
    baseUrl: "基础地址",
    baseUrlDescription: "缺少 /chat/completions 路径时会自动补全。",
    model: "模型",
    apiKey: "API 密钥",
    apiKeyDescription: "由 Foxy 加密保存，插件不会拿到密钥内容。",
    purpose: "用途",
    inputLabel: "文本",
    inputPlaceholder: "输入要处理的内容",
    clear: "清空",
    close: "关闭",
    confirm: "确认",
    send: "发送",
    assistantTitle: "LLM 助手",
    resultTitle: "结果 · %1 · 确认上屏或清空",
    purposeShort: "简答",
    purposePolish: "润色",
    purposeProofread: "纠正错别字",
    purposeTone: "调整语气",
    prefixShort: "请简洁准确地回答下面的内容，只返回答案：\n",
    prefixPolish: "请润色下面的文本，保留原意，只返回改写后的文本：\n",
    prefixProofread: "请只纠正下面文本中的错别字和明显语病，保留原意，只返回修正后的文本：\n",
    prefixTone: "请将下面的文本调整为更自然、礼貌的语气，只返回改写后的文本：\n",
    missingKey: "请先在插件设置中填写 %1 的 API 密钥",
    missingConfig: "请先完成 %1 的服务配置",
    emptyResult: "AI 返回了空内容",
    requestFailed: "请求失败：%1"
  },
  "zh-TW": {
    name: "LLM 助手",
    provider: "服務商",
    providerDescription: "僅顯示所選服務商的位址、模型和金鑰。",
    baseUrl: "基礎位址",
    baseUrlDescription: "缺少 /chat/completions 路徑時會自動補上。",
    model: "模型",
    apiKey: "API 金鑰",
    apiKeyDescription: "由 Foxy 加密儲存，外掛不會取得金鑰內容。",
    purpose: "用途",
    inputLabel: "文字",
    inputPlaceholder: "輸入要處理的內容",
    clear: "清除",
    close: "關閉",
    confirm: "確認",
    send: "傳送",
    assistantTitle: "LLM 助手",
    resultTitle: "結果 · %1 · 確認送出或清除",
    purposeShort: "簡答",
    purposePolish: "潤色",
    purposeProofread: "校正錯別字",
    purposeTone: "調整語氣",
    prefixShort: "請簡潔準確地回答下列內容，只回傳答案：\n",
    prefixPolish: "請潤色下列文字，保留原意，只回傳改寫後的文字：\n",
    prefixProofread: "請只校正下列文字中的錯別字和明顯語病，保留原意，只回傳修正後的文字：\n",
    prefixTone: "請將下列文字調整為更自然、禮貌的語氣，只回傳改寫後的文字：\n",
    missingKey: "請先在外掛設定中填寫 %1 的 API 金鑰",
    missingConfig: "請先完成 %1 的服務設定",
    emptyResult: "AI 回傳了空內容",
    requestFailed: "請求失敗：%1"
  }
};

function stringsFor(locale) {
  const tag = String(locale || "en").toLowerCase().replace(/_/g, "-");
  if (tag.includes("hant") || tag.startsWith("zh-tw") || tag.startsWith("zh-hk") || tag.startsWith("zh-mo")) {
    return STRINGS["zh-TW"];
  }
  if (tag.startsWith("zh")) return STRINGS["zh-CN"];
  return STRINGS.en;
}

function format(template, ...values) {
  let output = template;
  values.forEach(value => {
    output = output.replace("%1", value);
  });
  return output;
}

const PURPOSE_KEYS = {
  short: {label: "purposeShort", prefix: "prefixShort"},
  polish: {label: "purposePolish", prefix: "prefixPolish"},
  proofread: {label: "purposeProofread", prefix: "prefixProofread"},
  tone: {label: "purposeTone", prefix: "prefixTone"}
};

function purposeOptions(t) {
  return PURPOSE_IDS.map(value => ({value, label: t[PURPOSE_KEYS[value].label]}));
}

function providerOptions() {
  return PROVIDERS.map(provider => ({value: provider.value, label: provider.label}));
}

function findProvider(value) {
  return PROVIDERS.find(item => item.value === value || item.label === value) || PROVIDERS[0];
}

function findPurpose(value, t) {
  const id = PURPOSE_IDS.find(item => item === value)
    || PURPOSE_IDS.find(item => t[PURPOSE_KEYS[item].label] === value)
    || "short";
  return {id, label: t[PURPOSE_KEYS[id].label], prefix: t[PURPOSE_KEYS[id].prefix]};
}

function availableProviders(configuredSecrets) {
  const secrets = Array.isArray(configuredSecrets) ? configuredSecrets : [];
  return PROVIDERS.filter(provider => secrets.includes(provider.credential));
}

function pickProvider(settings, configuredSecrets) {
  const available = availableProviders(configuredSecrets);
  const preferred = findProvider(settings.defaultProvider);
  return available.find(provider => provider.value === preferred.value) || available[0] || preferred;
}

function urlHost(url) {
  const match = String(url || "").trim().match(/^https?:\/\/([^\/:?#]+)/i);
  return match ? match[1].toLowerCase() : "";
}

function configuredProviderEndpoints(settings) {
  return PROVIDERS.map(provider => ({
    label: provider.label,
    url: endpointUrl(settings[provider.value + "Url"] || provider.url)
  }));
}

async function authorizeConfiguredHosts(settings) {
  if (!foxy.websocket || typeof foxy.websocket.authorize !== "function") return;
  const seen = {};
  for (const provider of configuredProviderEndpoints(settings)) {
    const host = urlHost(provider.url);
    if (!host || seen[host]) continue;
    seen[host] = true;
    try {
      await foxy.websocket.authorize(host);
    } catch (_) {
    }
  }
}

function endpointUrl(base) {
  const url = String(base || "").trim().replace(/\/+$/, "");
  if (!url) return "";
  if (/\/chat\/completions$/.test(url)) return url;
  // OpenAI-compatible base URLs may omit the API version segment.
  if (/\/v\d+(?:[a-z]+)?$/.test(url)) return url + "/chat/completions";
  if (/openai\.com$/.test(url) || /aliyuncs\.com$/.test(url)) {
    return url + "/v1/chat/completions";
  }
  return url + "/chat/completions";
}

let currentProvider = "deepseek";
let lastResult = "";

function dialogSpec(t, title, purposeId, input) {
  return {
    maxWidth: 320,
    maxHeight: 208,
    layout: {
      type: "column",
      gap: 6,
      children: [
        {type: "text", text: title, size: 13, bold: true},
        {
          type: "row",
          gap: 6,
          children: [
            {
              type: "select",
              id: "purpose",
              label: t.purpose,
              options: purposeOptions(t),
              value: purposeId,
              weight: 1,
              height: 36
            },
            {
              type: "select",
              id: "provider",
              label: t.provider,
              options: providerOptions(),
              value: currentProvider,
              weight: 1,
              height: 36
            }
          ]
        },
        {
          type: "input",
          id: "input",
          label: t.inputLabel,
          labelPlacement: "top",
          multiline: true,
          value: input,
          placeholder: t.inputPlaceholder,
          height: 72
        },
        {
          type: "row",
          gap: 6,
          align: "end",
          children: [
            {type: "button", id: "clear", label: t.clear},
            {type: "button", id: "close", label: t.close},
            {type: "button", id: "confirm", label: t.confirm},
            {type: "button", id: "send", label: t.send, style: "filled"}
          ]
        }
      ]
    }
  };
}

foxy.plugin.register({
  id: "llm-assistant",
  name: stringsFor(foxy.locale).name,
  version: "1.1",
  hosts: [
    "api.openai.com",
    "api.deepseek.com",
    "dashscope.aliyuncs.com",
    "maas.qianwenaiapi.com",
    "cn-beijing.maas.qianwenaiapi.com"
  ],
  features: [],
  configure(ui, locale) {
    const t = stringsFor(locale);
    ui.select("defaultProvider", t.provider, providerOptions(), "deepseek", {
      description: t.providerDescription
    });
    PROVIDERS.forEach(provider => {
      const when = {key: "defaultProvider", value: provider.value};
      ui.text(provider.value + "Url", t.baseUrl, provider.url, {
        visibleWhen: when,
        description: t.baseUrlDescription
      });
      ui.text(provider.value + "Model", t.model, provider.model, {visibleWhen: when});
      ui.secret(provider.value + "Key", t.apiKey, {
        visibleWhen: when,
        description: t.apiKeyDescription
      });
    });
  }
});

foxy.app.register({
  id: "llm_assistant",
  label: stringsFor(foxy.locale).name,
  permissions: [
    "editor.read_selection",
    "editor.composition",
    "editor.commit",
    "network.request",
    "credentials.list"
  ],
  async onOpen(context) {
    const t = stringsFor(foxy.locale);
    if (context.event === "dismiss") return {close: true};
    const settings = context.settings || {};
    const configuredSecrets = context.configuredSecrets || [];

    if (context.event === "open") {
      lastResult = "";
      await authorizeConfiguredHosts(settings);
      currentProvider = pickProvider(settings, configuredSecrets).value;
      const selected = await foxy.editor.getSelection();
      return foxy.ui.dialog.show(dialogSpec(t, t.assistantTitle, "short", selected));
    }

    const values = context.values || {};
    const purpose = findPurpose(values.purpose, t);
    const provider = findProvider(values.provider);
    currentProvider = provider.value;

    if (context.event === "clear") {
      lastResult = "";
      await foxy.editor.clearComposition();
      return foxy.ui.dialog.show(dialogSpec(t, t.assistantTitle, purpose.id, ""));
    }
    if (context.event === "close" || context.event === "cancel") {
      lastResult = "";
      await foxy.editor.clearComposition();
      return {close: true};
    }
    if (context.event === "confirm") {
      if (lastResult) {
        await foxy.editor.commit(lastResult);
        lastResult = "";
      }
      return {close: true};
    }
    if (context.event !== "send") return {close: true};

    if (!configuredSecrets.includes(provider.credential)) {
      return foxy.ui.dialog.show(dialogSpec(
        t,
        format(t.missingKey, provider.label),
        purpose.id,
        values.input || ""
      ));
    }
    const url = endpointUrl(settings[provider.value + "Url"] || provider.url);
    const model = settings[provider.value + "Model"] || provider.model;
    if (!url || !model) {
      return foxy.ui.dialog.show(dialogSpec(
        t,
        format(t.missingConfig, provider.label),
        purpose.id,
        values.input || ""
      ));
    }

    try {
      const rawResponse = await foxy.http.request({
        url,
        method: "POST",
        credential: provider.credential,
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            {role: "system", content: purpose.prefix},
            {role: "user", content: values.input || ""}
          ]
        })
      });
      const response = JSON.parse(rawResponse);
      if (!response.ok) {
        throw new Error("HTTP " + response.status + " " + String(response.body || "").slice(0, 160));
      }
      const data = JSON.parse(response.body);
      const result = data.choices && data.choices[0] && data.choices[0].message
        ? String(data.choices[0].message.content || "").trim()
        : "";
      if (!result) throw new Error(t.emptyResult);
      lastResult = result;
      await foxy.editor.setComposition(result);
      return foxy.ui.dialog.show(dialogSpec(
        t,
        format(t.resultTitle, purpose.label),
        purpose.id,
        values.input || ""
      ));
    } catch (error) {
      lastResult = "";
      return foxy.ui.dialog.show(dialogSpec(
        t,
        format(t.requestFailed, String(error.message || error)),
        purpose.id,
        values.input || ""
      ));
    }
  }
});
