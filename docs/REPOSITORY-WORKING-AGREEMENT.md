# 仓库协作约定｜Repository Working Agreement

版本：1.0｜适用仓库：orange-lee-tech/Artificial-Intelligence

Version: 1.0 | Repository: orange-lee-tech/Artificial-Intelligence

## 1. 默认工作分支｜Default Working Branch

本仓库默认且唯一的日常工作分支为 `main`。今后的日常修改直接在 `main` 上进行，不创建新的功能分支、临时分支或个人分支。
The default and sole day-to-day working branch is `main`. All future routine changes must be made directly on `main`; do not create new feature, temporary, or personal branches.

现有历史分支仅作为历史记录，不代表未来工作流程仍采用分支开发。
Existing historical branches are retained only as historical records and do not imply that branch-based development remains the future workflow.

## 2. 修改前检查｜Pre-change Checks

每次开始修改前，必须读取远程 `main` 的最新提交、目标文件当前内容和相关目录结构。
Before making changes, inspect the latest remote `main` commit, the current contents of target files, and the relevant repository structure.

如果远程 `main` 已发生变化，应以最新版本为基础重新评估修改，不得使用过期快照覆盖新内容。
If remote `main` has changed, reassess the edit against the latest version. Never overwrite newer content using a stale snapshot.

## 3. 直接提交流程｜Direct Commit Workflow

1. 确认目标、影响范围和验收标准。
   Confirm the goal, impact scope, and acceptance criteria.
2. 读取最新 `main` 和相关文件。
   Read the latest `main` and relevant files.
3. 在当前工作状态下完成修改，不创建新分支。
   Make the changes in the current working state without creating a new branch.
4. 审查文件差异、引用路径、格式和必要测试。
   Review file diffs, references, formatting, and required tests.
5. 基于最新 `main` 提交，并使用预期提交 SHA 防止覆盖并发更新。
   Commit against the latest `main`, using the expected commit SHA to prevent overwriting concurrent updates.
6. 重新读取远程文件和提交状态，确认修改已经生效。
   Fetch the remote files and commit status again to verify that the change took effect.

## 4. 并发与冲突｜Concurrency and Conflicts

同一时间尽量保持单一主写入者。并行 Agent 可以承担只读研究、审计或独立任务，但不得无协调地同时写入同一文件或移动同一分支。
Prefer a single primary writer at a time. Parallel agents may perform read-only research, audits, or independent tasks, but must not modify the same files or move the same branch without coordination.

如果提交时发现 `main` 已被其他提交推进，应重新读取最新内容、整合变更并重新审查；不得强制推送。
If another commit advances `main` during an update, fetch the latest content, reconcile the changes, and review again. Never force-push.

## 5. 权限与阻塞处理｜Permissions and Blockers

直接提交不代表可以绕过仓库权限、分支保护、审批或安全策略。
Direct commits do not authorize bypassing repository permissions, branch protection, approval requirements, or security policies.

如果仓库策略不允许直接更新 `main`，应停止写入并向仓库所有者报告限制；不得擅自改回创建分支或绕过保护。
If repository policy blocks direct updates to `main`, stop and report the restriction to the repository owner. Do not independently revert to branch creation or bypass protection.

## 6. 提交与验证｜Commits and Verification

提交信息应简洁描述变更目的，推荐使用 Conventional Commits 风格，例如 `docs(readme): add bilingual repository overview`。
Commit messages should concisely describe the change. Conventional Commits style is recommended, for example: `docs(readme): add bilingual repository overview`.

每次提交后记录提交 SHA、修改文件、执行的检查、未执行的测试和已知限制。
After each commit, record the commit SHA, changed files, checks performed, tests not run, and known limitations.

文件写入成功不等于质量验收通过；只有有证据支持的检查才能标记为已验证。
A successful file write is not the same as quality acceptance; mark checks as verified only when supported by evidence.

## 7. 文档语言规范｜Documentation Language Standard

根目录 `README.md` 及正式面向使用者的说明文档默认采用中英双语，逐段对应，中文在上、英文在下。
The root `README.md` and formal user-facing documentation should default to Chinese and English, translated paragraph by paragraph, with Chinese first and English immediately below.

代码、命令、文件路径、标识符和 API 字段保持原样，不需要翻译；可以在代码块前后添加中文解释，并在需要时补充英文说明。
Code, commands, file paths, identifiers, and API fields must remain unchanged and do not need translation. Chinese explanations may be added around code blocks, with English explanations where appropriate.

表格、图示和清单中的信息也应保持中英对应，避免出现只有中文或只有英文的关键说明。
Information in tables, diagrams, and checklists should also be bilingual; avoid leaving important explanations in only one language.

## 8. 规则优先级｜Rule Priority

本约定与仓库安全策略、平台权限和法律要求冲突时，遵循更高优先级的约束，并明确说明无法执行的部分。
If this agreement conflicts with repository security policies, platform permissions, or legal requirements, follow the higher-priority constraint and clearly explain what cannot be done.
