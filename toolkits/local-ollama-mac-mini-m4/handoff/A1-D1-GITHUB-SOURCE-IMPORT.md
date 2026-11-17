# A1/D1 插件源码 GitHub 提交交接

**目的：** 把 A1/D1 的真实源代码纳入公开 PACS 仓库。当前收到的是验收报告和配置说明，不是源代码；不能用报告替代源文件。

## 目标

- Repository: orange-lee-tech/Artificial-Intelligence
- Branch: pacs/a1-d1-source-import
- Base: main
- 提交方式：Draft Pull Request；不得直接写入 main。
- 不触碰生产 Desktop Profile。

## 必须提交

从本机 A1/D1 工作区审查并提交：

1. packages/dsh-local-first-router/
2. packages/dsh-budget-guard/
3. packages/dsh-mock-provider/
4. packages/dsh-a1d1-probe/（仅测试探针，明确标注不用于生产）
5. test/（测试驱动、用例、出网守卫、worker）
6. examples/（只含占位符）
7. reports/A1-D1-验收报告.md
8. reports/A1-D1-交付与配置说明.md
9. 顶层 README：包职责、版本、Node 版本、复现命令和已知限制。

测试证据只提交审查和脱敏后的 result.json / 摘要；不要未经审查批量提交原始 JSONL。

## 公开仓库安全检查

排除 API Key、Token、密码、Cookie、私钥、凭据 payload、.env、keyring 导出、TCC 数据库、用户姓名/邮箱/发送者 ID/会话 ID、/Users/<user>/... 私人绝对路径、真实主机名、内网地址、PID、私人文件名、客户数据、未脱敏日志、node_modules、.npmcache、app.asar、完整 ASAR 解包目录、废弃解析器产物、生产 cordis.patch.yml 和生产凭据。

测试路径只用临时目录或相对路径；配置示例只用占位符。

## 验证

- 运行 node test/run-all.mjs。
- 记录 Node 版本、退出码和 PASS/PARTIAL/NOT_TESTED 项。
- 确认无未声明依赖；本次不安装依赖。
- 复核生产 cordis.patch.yml、app.asar、MCP、凭据和服务未修改。
- 不把 T9 受限验证描述成真实子代理派生通过。
- 不把 Mock 结果描述成真实云 API 或真实 Ollama 验收。

创建 Draft PR 后停止，等待维护者审查；禁止自动合并。
