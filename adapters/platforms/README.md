# Platform Adapter Profiles

本目录保存各平台的适配配置。公共能力定义在 capabilities/ 和 docs/ 中；本目录只记录平台差异。

每个平台目录建议包含：
- PLATFORM.md：适配目标、配置位置和平台限制。
- mapping.yaml：PACS 能力到平台机制的映射。
- tool-registry.yaml：实际可用工具、权限和证据。
- test-results.md：一致性测试结果。
- known-limitations.md：已知限制和替代方案。

所有新平台初始状态均为 NOT_TESTED。只有实际检查当前账户、当前版本并完成测试后，才可升级状态。
