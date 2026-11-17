# 通知模板｜Notification Templates

**状态 / Status:** TEMPLATE ASSETS — NOT CONNECTED / 模板资产 — 尚未接入微信

这些模板用于本地程序直接填充并发送状态消息，无需每次调用 AI 模型。真正节约 Token 的条件是消息内容由结构化事件触发、由本地模板引擎完成渲染，不再发起推理请求。  
Templates are rendered from structured events by local code, without a model call. The saving comes from avoiding inference, not merely shortening the text.

## 文件 / Files

- `TASK_COMPLETED.txt`：任务完成 / Task completion
- `BUDGET_BLOCKED.txt`：云端预算阻断 / Cloud spend blocked
- `DAILY_REPORT.txt`：每日状态摘要 / Daily status digest

## 渲染约束 / Rendering constraints

- 仅允许显式白名单变量 `{{variable}}`，不得执行表达式或模板内代码。/ Allowlisted variable substitution only; no expression or code evaluation.
- 缺少必需变量时拒绝发送并写入错误日志。/ Reject missing required variables and log the error.
- 对用户输入做纯文本转义并设置长度上限，避免伪造通知来源。/ Escape user-origin content and limit lengths to prevent notification spoofing.
- 手机不可访问的本地路径不得冒充下载链接；下载链接必须鉴权、限时。/ Local filesystem paths are not download URLs; links require authorization and expiry.
- 不得在模板变量中包含任何凭据、明文密钥、用户微信 ID 或未授权的敏感信息。/ Never populate templates with credentials, sender IDs, or unauthorized personal data.
- 后续可提供多语言模板，但不要自动发送双语长消息。/ More languages may be added without forcing bilingual long-form notifications.

## 已知限制 / Known limitations

尚未验证现有微信机器人的主动发送、附件、下载链接、身份认证或断线补发能力。/ Existing connector push, attachments, links, identity checks, and recovery have not yet been verified.
