# Changelog

## [0.1.1] - 2026-11-14
### Added
- 官方平台文档核对结果与平台级 Adapter 映射。
- Claude、DeepSeek Harness、Trae、WorkBuddy、豆包的 mapping.yaml 和测试记录。
- 标准 Skill frontmatter：name、description、PACS metadata。
- Python 标准库 Skill 导出脚本，生成 Claude ZIP、Trae 项目 Skill 目录和 DeepSeek Harness 项目 Skill 目录。

### Changed
- Capability Contract 和能力模板升级为跨平台公共元数据格式。
- 平台矩阵区分 DOCUMENTED 与账户级 NOT_TESTED。

### Not tested
- 未在用户实际账户中完成五个平台的 Skill 导入和运行测试。
- Skill 导出脚本尚未在用户本机环境执行。
- DeepSeek Harness 处于 Developer Preview，需固定版本并验证插件组合。

## [0.1.0] - 2026-11-14
### Added
- PACS Constitution、Capability Contract、个人 AI 使用画像和系统架构。
- C01–C12 十二项原子能力与 W01–W05 五条复合工作流。
- Task Envelope / Result Envelope JSON Schema。
- PACS Bootstrap、迁移手册、平台 Adapter Profile、一致性测试和模板。
