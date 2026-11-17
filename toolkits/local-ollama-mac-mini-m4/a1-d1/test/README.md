# 测试说明

## 前置条件

1. `PACS_ASAR_NM` 指向已解包的 DSH `node_modules`（例如 `.../extracted/dsh/node_modules`），否则 `harness.mjs` 会直接报错。
2. 存在隔离 profile `a1d1-isolated`：禁用 `llm-deepseek`、`llm-deepseek-account`、`llm-pi-ai`、`session-title-llm`，默认模型 `mock-local/mock-small`，并挂载 `dsh-mock-provider`、`dsh-local-first-router`、`dsh-a1d1-probe`、`dsh-budget-guard`。
3. 该 profile 的 `logFile` / `ledgerFile` 使用**相对路径**（如 `evidence/e2e/router.jsonl`），因为 e2e 驱动以本目录为 cwd 启动 `dsh`。

## 运行

```bash
node test/run-all.mjs                 # 全部用例 + 汇总
node test/cases/t3-local-first.mjs    # 单个用例
```

## 结构

- `harness.mjs`：从解包 asar 加载真实 Cordis + `LlmRuntime`，仅在本进程内挂插件（无 profile、无网络）。
- `lib/e2e.mjs`：`spawn` 真实 headless `dsh`，收集证据到 `evidence/`。
- `no-network.mjs`：`NODE_OPTIONS=--import` 预载的出网守卫，拦截 net / dns / tls / fetch 并记录后抛错。
- `cases/`：T1–T10。
- `patches/`：按用例叠加的 cordis patch 片段（路径均为相对路径）。
- `workers/`：并发预留用的独立进程。
- `probe-*.mjs`：开发期探针，不属于验收用例。

## 证据

`evidence/<case>/result.json` 为结构化结论；原始 JSONL（含 session / message 标识）在提交前已移除。
