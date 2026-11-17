# DSH Provider Extension & Pre-Cloud Routing Audit
# DeepSeek Harness Provider 扩展与云端前路由专项审计指令

**Status:** AUDIT TASK — READ-ONLY / 审计任务 — 只读  
**Target:** DeepSeek Harness Desktop 0.2.2-rc.3 on the Mac mini M4  
**Related specification:** [Model Adapter & Adaptive Router](MODEL-ADAPTER-AND-ADAPTIVE-ROUTER-SPEC.md)

## Mission

Perform one narrowly scoped source audit to determine the safest existing extension point for:
1. a provider-neutral Model Adapter contract;
2. a local Ollama adapter;
3. a deterministic Adaptive Router that can choose local inference **before** the first paid cloud request.

Do not conduct another broad plugin-market survey. Do not implement or deploy anything in this audit.

## Existing evidence to reuse, not repeat

The prior reliable ASAR audit reported:

- DSH baseline: \`0.2.2-rc.3\`.
- Reliable extraction used \`@electron/asar@4.3.2\`; the earlier hand-written ASAR parser produced path/content mismatches and is deprecated. Never use its output.
- Relevant packages include \`dsh-llm\`, \`dsh-llm-deepseek\`, \`dsh-agent\`, \`dsh-agent-loop\`, \`dsh-mcp-client\`, \`dsh-credentials\`, \`dsh-token-meter\`, and \`dsh-api-gateway\`.
- The reported model Messages fetch was \`dsh-llm-deepseek/src/adapter.ts:142\`.
- The reported \`llm/stream\` waterfall covered retry/replay/routing; the agent loop consumed the prepared stream or \`llm.stream\`.
- Web Search had a separate provider request path and must not be assumed covered by a model-only hook.
- Credentials use reference resolution; stored credentials outrank environment fallbacks. Do not inspect or print secret payloads.
- Desktop and headless profile behavior, subagent paths, and MCP egress coverage still require verification.

Treat these as leads from a prior audit, not substitutes for re-reading the relevant extracted source and checking the exact installed host version.

## Required audit questions

### A. Provider registration and adapter contract

Inspect the actual installed source for:

- provider package discovery/registration and lifecycle;
- provider configuration schema and model selection;
- request normalization and model options;
- stream event types, finish/stop/error semantics, usage accounting, and tool-call representation;
- prepared calls, retry, replay, subagent and tool-subagent paths;
- credential-ref resolution and the point at which credentials enter the outbound request;
- whether a third-party plugin can add a provider without editing \`app.asar\` or the protected production patch.

Deliver an evidence table with exact package path, file, line range, observed behavior, and status.

### B. Pre-cloud task ingress

Determine whether DSH exposes a supported plugin hook or event that runs after a user task arrives but **before** the first model/provider request.

Specifically answer:

1. Can a plugin inspect a task envelope before the first paid model request?
2. Can it return a completed local result and short-circuit the cloud request?
3. Can it route to the existing cloud provider only after local rejection/failure?
4. Does this work in both Desktop and headless profiles?
5. Does the hook preserve conversation state, streaming, cancellation, retries, and tool permissions?

Do not confuse a tool/MCP call made by the cloud model with pre-cloud routing. MCP delegation after a cloud request is not local-first.

If no supported pre-cloud hook exists, state that clearly and recommend the smallest PACS-owned task-ingress/scheduler boundary. Do not patch the app bundle to manufacture a hook.

### C. Local adapter options

Compare only these two implementation paths:

1. **MCP stdio bridge:** one local server, one \`infer\` tool, calling Ollama on loopback.
2. **Native DSH provider/plugin:** only if the provider API is genuinely extensible.

For each path, report support for streaming, structured JSON, cancellation, timeouts, model identity, usage metering, errors, tool calls, and profile loading. Identify what is native, what needs an adapter, and what is unverified.

Do not build both paths.

### D. Budget and paid-egress coverage

Trace the actual hooks and exits for:

- model Messages;
- Web Search;
- file upload/storage;
- subagents and retries/replay;
- MCP tools that can access paid external services;
- any additional provider or account-mode path.

Identify whether a Budget Guard can reliably reject a call before any billable bytes leave the host. Unknown cost or unverified egress must remain BLOCKED. Do not change the price table or call a real paid API.

### E. Minimal isolated proof

If all required source and test dependencies already exist, you may design or run a **mock-only** isolated proof that does not call external services:

- mock provider registration or stream interception;
- mock local adapter response;
- verify pre-cloud short-circuit if the hook exists;
- verify no cloud call occurs on local-first success;
- verify no implicit cloud fallback on local failure.

Use an isolated temporary profile/workspace only. If the proof requires installing a dependency, modifying a production profile, changing a protected patch, restarting Desktop, or using a real API, stop and report the blocker instead.

## Constraints

- Read-only production audit. No edits to \`app.asar\`, \`cordis.patch.yml\`, Desktop/headless production profiles, MCP configuration, credentials, model routing, or provider settings.
- No package installation or upgrade. Reuse the existing \`@electron/asar@4.3.2\` audit toolchain if still present.
- No Ollama/model download in this task.
- No production service restart.
- No real cloud requests, paid search, or paid tools.
- Never print API keys, tokens, credential payloads, sender identifiers, or private user data.
- Do not use the deprecated hand-written ASAR extraction scripts.
- Keep the scope to the listed packages and call paths. Do not repeat a general plugin survey.

## Time and reporting discipline

- Work in short batches; report a checkpoint after 5 minutes.
- If no new source evidence is found for 5 consecutive minutes, stop and report the blocker instead of looping.
- Prefer one deterministic batch extraction/grep script over repeated manual file reads.
- Separate static source evidence, isolated mock-test evidence, inference, and unknowns.
- Use only: PASS / PARTIAL / NOT_TESTED / BLOCKED / FAIL.

## Required final deliverable

Create a concise report in the local project audit directory and return:

1. provider registration and normalized request/stream contract;
2. whether a true pre-cloud hook exists;
3. whether MCP alone can implement local-first (expected answer must be evidence-based);
4. comparison of MCP stdio vs native provider path;
5. exact Budget Guard insertion points and uncovered egress;
6. Desktop/headless differences;
7. isolated mock-test results, if safely possible;
8. recommended smallest implementation step;
9. all unresolved risks and evidence references.

Do not implement the adapter or router in this audit. Stop after the report and wait for implementation authorization.
