# WorkBuddy Adapter Profile

状态：DOCUMENTED｜当前账户实测：NOT_TESTED  
项目优先级：第二批

## 官方机制
腾讯云官方产品文档将 WorkBuddy 定位为 AI 工作台，描述了自然语言任务规划执行、多模态处理、授权目录内的本地文件操作、多任务并行，以及通过项目空间组织多个 Agent。产品页面还介绍专家、Skill、连接器和资料库等扩展方式；企业版和不同产品入口的功能边界仍需按实际账户确认。

## PACS 映射
- Constitution / User Profile：放入可持续访问的个人或项目知识/规则入口。
- C01–C12：按单一职责转化为 Skill 或专家知识，不做一个万能专家。
- W01–W05：作为项目 SOP 或工作流说明，由执行 Agent 组合调用。
- MCP / Connectors：负责连接外部系统与数据；Skill 负责使用方法。
- C07：要求工作结果附来源、文件和验收证据。

## 导入方式
1. 先确认当前 WorkBuddy 版本支持的 Skill/专家导入入口。
2. 将 PACS 公共规则和项目上下文分开管理。
3. 逐个导入高频 Skill，先验证触发和输出，再扩大范围。
4. 对本地文件操作限定授权目录；对外部副作用设置审批。
5. 多 Agent 并行时明确各自写入范围，避免文件冲突。

## 已知限制
- 官方产品介绍不等于当前账户拥有全部功能。
- 当前用户账户、连接器、项目空间和 Skill 导入方式尚未实测。
- 本 Adapter 不假设 WorkBuddy 与 Claude/Trae 共享同一 Skill 文件安装路径。

## 官方来源
- https://cloud.tencent.com/document/product/1831/134384
- https://cloud.tencent.com/product/workbuddy
