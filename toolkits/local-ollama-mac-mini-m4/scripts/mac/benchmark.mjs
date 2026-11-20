const baseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const model = process.env.OLLAMA_MODEL || "qwen3.5:4b-q4_K_M";
const numCtx = Number(process.env.OLLAMA_NUM_CTX || "8192");
const url = new URL(baseUrl);
if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Loopback URL required.");
const prompts = [
  "请从这句话提取日期、地点和事项，并用一句话输出：2026年11月17日下午，在上海参加项目评审会。",
  "请用不超过80个汉字解释什么是本地知识库，避免夸大其能力。",
  "将以下任务分类为 document、extract 或 summarize，只输出一个英文类别：把会议纪要中的负责人和截止日期整理成表格。"
];
const tagsResponse = await fetch(baseUrl + "/api/tags", { signal: AbortSignal.timeout(5000) });
if (!tagsResponse.ok) throw new Error("Ollama API is not healthy.");
const tags = await tagsResponse.json();
if (!Array.isArray(tags.models) || !tags.models.some((item) => item.name === model)) throw new Error("Model not installed; benchmark will not pull it.");
const rows = [];
for (let i = 0; i < prompts.length; i += 1) {
  const response = await fetch(baseUrl + "/api/chat", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompts[i] }], stream: false, keep_alive: "5m", options: { num_ctx: numCtx, temperature: 0.1 } }),
    signal: AbortSignal.timeout(180000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error("HTTP " + response.status + ": " + text.slice(0, 400));
  const result = JSON.parse(text);
  const count = Number(result.eval_count || 0);
  const duration = Number(result.eval_duration || 0);
  rows.push({
    case: i + 1, prompt_eval_count: result.prompt_eval_count ?? null, eval_count: count,
    load_duration_ns: result.load_duration ?? null, total_duration_ns: result.total_duration ?? null,
    tokens_per_second: duration > 0 ? Number((count * 1e9 / duration).toFixed(2)) : null,
    output_chars: result.message && result.message.content ? result.message.content.length : 0
  });
}
process.stdout.write(JSON.stringify({
  status: "MEASURED_NOT_QUALITY_VERIFIED", model, num_ctx: numCtx, keep_alive: "5m", cases: rows,
  note: "Synthetic prompts only. Host performance metrics; no semantic quality judgement."
}, null, 2) + "\n");
