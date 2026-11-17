const baseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const model = process.env.OLLAMA_MODEL || "qwen3.5:4b-q4_K_M";
const numCtx = Number(process.env.OLLAMA_NUM_CTX || "8192");
function loopbackOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("OLLAMA_BASE_URL must be an HTTP loopback URL.");
  return url.origin;
}
async function request(origin, path, options = {}) {
  const response = await fetch(origin + path, { ...options, signal: AbortSignal.timeout(180000) });
  const text = await response.text();
  if (!response.ok) throw new Error("HTTP " + response.status + ": " + text.slice(0, 400));
  try { return JSON.parse(text); } catch { throw new Error("Ollama returned invalid JSON."); }
}
try {
  const origin = loopbackOrigin(baseUrl);
  const tags = await request(origin, "/api/tags");
  if (!Array.isArray(tags.models) || !tags.models.some((item) => item.name === model)) throw new Error("Model not installed: " + model + ". This script never pulls models.");
  const schema = { type: "object", properties: { status: { type: "string", enum: ["PASS"] }, message: { type: "string" } }, required: ["status", "message"], additionalProperties: false };
  const result = await request(origin, "/api/chat", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model, messages: [{ role: "user", content: "这是本地部署冒烟测试。只输出符合 JSON Schema 的 JSON。status 必须是 PASS，message 用简体中文说明你正在本机运行。不要调用工具。" }],
      format: schema, stream: false, keep_alive: 0, options: { num_ctx: numCtx, temperature: 0.1 }
    })
  });
  const content = result.message && result.message.content;
  if (typeof content !== "string") throw new Error("Missing message.content.");
  let parsed;
  try { parsed = JSON.parse(content); } catch { throw new Error("Output is not valid JSON: " + content.slice(0, 250)); }
  if (parsed.status !== "PASS" || typeof parsed.message !== "string") throw new Error("Output failed schema assertions.");
  process.stdout.write(JSON.stringify({
    status: "PASS", model: result.model, base_url: origin, num_ctx: numCtx, keep_alive: 0,
    prompt_eval_count: result.prompt_eval_count ?? null, eval_count: result.eval_count ?? null,
    load_duration_ns: result.load_duration ?? null, total_duration_ns: result.total_duration ?? null, response: parsed
  }, null, 2) + "\n");
} catch (error) {
  process.stderr.write("[FAIL] " + (error && error.message ? error.message : String(error)) + "\n");
  process.exitCode = 1;
}
