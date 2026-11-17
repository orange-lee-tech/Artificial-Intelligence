# A1 / D1：Local-first Router、Budget Guard 与 Mock Provider 源码

本目录是 PACS A1 / D1 阶段交付的**真实插件源代码**（此前只提交过验收报告，本目录补齐源文件）。
对应 Issue: #3；交接规范见 `toolkits/local-ollama-mac-mini-m4/handoff/A1-D1-GITHUB-SOURCE-IMPORT.md`。

## 包职责与版本

| 包 | 版本 | 作用 | 生产可用 |
| --- | --- | --- | --- |
| `packages/dsh-local-first-router` | 0.1.0 | 确定性 local-first 选路 + 会话级粘性 + 路由锁 | 是（需评审后接入） |
| `packages/dsh-budget-guard` | 0.1.0 | `next()` 前的原子预算预留、单次/每日上限、`usage` 结算、未知价格 fail closed | 是（需评审后接入） |
| `packages/dsh-mock-provider` | 0.1.0 | 脚本化离线 adapter（ok / timeout / server-error / empty / hang），JSONL 记账 | 否，仅测试 |
| `packages/dsh-a1d1-probe` | 0.1.0 | 测试观测插件，读取 `agent/request-error` 的 payload 形状 | 否，仅测试 |

四个包都是**零依赖 ESM**，不安装任何 npm 依赖；运行时只使用 Node 内置模块。

## 环境要求

- Node.js v22.22.3（本次验证所用版本；代码只用稳定内置 API，未针对其它版本测试）
- DSH 0.2.2-rc.3（`engines.dsh: ^0.2.2-rc.3`）
- 一个已解包的 DSH `app.asar` 目录，用于加载真实的 Cordis 与 `dsh-llm`（测试不下载 DSH）
- 一个隔离 profile（示例见 `examples/profile-package.example.json`），其 `cordis.patch.yml` 禁用全部云端 adapter

## 复现测试

```bash
# 1) 指向本机已解包的 DSH node_modules（不要提交该路径）
export PACS_ASAR_NM=/path/to/extracted-asar/dsh/node_modules

# 2) 在隔离 profile 中启用四个包（cp -R 即可，零依赖），并按其 cordis.patch.yml 禁用云端 adapter
#    测试会以当前工作目录解析 evidence/e2e/*.jsonl 等相对路径

# 3) 运行全部 10 个用例
node test/run-all.mjs
```

`test/run-all.mjs` 逐项打印并汇总到 `evidence/run-all.json` 与 `evidence/run-all.md`；退出码非 0 表示存在非 PASS 项。
单项运行：`node test/cases/t5-retry-sticky.mjs`。

## 已验证范围（Mock / headless / 静态断言）

- 10/10 用例 PASS：插件注册与 `--dump-config`、`agent/inbox/inserted` 早于首次模型请求、LOCAL_FIRST 零云端请求（含 `no-network.mjs` 出网守卫）、不调 `next()` 时零 adapter 出网、本地超时重试保持本地、无预留/未知价格拒绝、单次与每日上限、20 进程并发预留原子性、子代理显式 provider 仍受限、SIGKILL 与 dispose 清理。

## 已知限制 / 未验证项（NOT_TESTED）

- 真实子代理派生：T9 只验证 guard 对 `purpose=subagent` + 子 sessionId 的请求没有豁免，未真的派生代理进程。
- 真实云 provider 计费口径：金额全部来自测试价格表，未接真实账单。
- 真实本地模型运行时：未安装 Ollama、未下载模型、未接任何固定端口；示例中 `qwen3-coder-*` 与 8080 均**不是**默认值。
- 全局预算：guard 只覆盖经过 `llm/stream` 的调用；Web Search、Search/Fetch 及绕过 `ctx.llm` 的第三方插件收费出口不在覆盖范围。

## 目录

| 路径 | 内容 |
| --- | --- |
| `packages/` | 四个插件包（`lib/index.js`、`cordis.patch.yml`、`package.json`） |
| `test/` | harness、headless e2e 驱动、出网守卫、10 个用例、patch 片段、worker |
| `examples/` | 生产接入示例（只含占位符，未执行） |
| `reports/` | 验收报告与交付/配置说明（已脱敏） |
| `evidence/` | 脱敏后的 `result.json` 与 run-all 汇总（原始 JSONL 未提交） |
