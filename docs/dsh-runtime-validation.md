# ResearchOS V2.0 功能验收

验收日期：2026-11-12。依据原始《research agent后续完善计划》和 [后续 V2.0 方案](https://chatgpt.com/s/t_6af55c4763688191bbe7aad84c8a52df)。

## 实现对照

| 要求 | 当前实现 |
|---|---|
| DSH 为唯一主要 Agent Runtime | 官方 SDK 的完整 sdk profile；全局/项目聊天、定时复盘、论文分析和评估均通过独立 SDK 进程运行 |
| 原生会话、事件、恢复、取消 | session ID 持久化；官方 resume_session；事件及结果回传；任务取消终止对应进程树 |
| 工具权限及澄清 | 原生 approval/request 和 user-question 回传到任务界面；用户答复通过 SDK 返回 |
| 项目上下文及工具注册 | 服务端读取背景、栏目、动态、资源、记忆；DSH MCP 插件注册统一 Python 业务工具 |
| 五大组件闭环 | 动态→点子→目标/子任务→DSH；PDF/仓库/环境→执行→产物/记忆 |
| 数据持久化 | SQLite projects/entities/session_links/tasks/memories/project_jobs/research_records；旧 snapshot 自动迁移，schema=1 |
| Paper Reader / Comparison | PDF 页码阅读、助手章节/方法分析、对比任务及 Markdown 产物 |
| Citation Graph | DOI 引用关系 SVG 图、可跳转节点和完整参考文献列表；来源 Crossref |
| Research Memory | 长期记忆查询、增加、删除；任务结果自动记录 |
| Experiment Tracking | 实验参数、指标、状态、日志及任务关联；人工/DSH 共用 API，可编辑删除、横向对照 |
| Research Benchmark | 四维 0–5 分评分、百分制汇总、评估依据及来源；人工记录与 DSH 复核任务 |
| 安装、备份、恢复 | Windows/Linux 共用 Python 启动器、固定依赖、自动备份回滚、文件与原生会话恢复 |

Node.js 只用于浏览器测试，前端没有构建依赖。Python 3.12.6、DSH SDK/runtime 0.2.2rc2、pypdf 6.1.3、deepseek-flash；完整 Python 依赖见 requirements-runtime.txt。开发用 Node 版本见 .node-version，浏览器测试依赖由 package-lock.json 固定。

## 已执行验证

- Windows：真实模型执行、执行事件、跨运行进程恢复历史、取消进程树。
- 原生澄清：真实触发 user-question，提交答案后模型正确复述回答；全局聊天真实创建项目并向该项目写入点子。
- 原生工具审批：实际请求项目外写入，界面对应 API 返回拒绝后确认目标文件未创建。
- 真实 MCP：模型实际调用点子与记忆写入工具；SQLite 验证落库；备份恢复回到原数据，并验证迁移至另一个目录后原生会话仍可继续。
- Linux/WSL Ubuntu、Python 3.12.6：相同固定依赖安装、真实执行、原生会话恢复、取消、MCP 写入与备份恢复。
- 离线业务回归：旧数据迁移不丢消息、目标依赖约束、跨项目记忆隔离、版本冲突、实验 CRUD、等待审批任务的重启恢复。
- 文件恢复回归：数据库与文件同步恢复、移除备份之后新增的文件、保留 Git HEAD、自动生成回滚备份。
- 浏览器：建立项目、显式 DSH 任务、保存结果、点子转目标、刷新恢复；实验记录、质量评分、文件上传阅读、普通聊天及重载。
- 并发合并：独立新增/删除、时间戳合并、同字段冲突检测；真实浏览器注入后台写入后校验两端新增均保留。

测试脚本与运行方法见 README。所有模型测试均需要真实 API 配置，不以固定回答冒充模型结果。

## 真实科研案例

使用 Transformer 和 LoRA 原始论文 PDF、microsoft/LoRA 官方 Git 仓库。DSH 实际读取论文指定页及 README、loralib/layers.py，运行独立环境中的 Python 参数量计算，并写入报告、JSON 指标、实验记录、研究点子、后续目标和长期记忆。随后新运行进程恢复同一会话，再由另一任务读取证据完成质量评估。

实测 d=512、r=8：完整方阵参数量 262144，低秩因子参数量 8192，比值 32。报告明确这是参数量核算，不是训练、精度评测或论文复现。原始论文仅归因于实际读取页码，避免冒充全文验收。

可运行 tests/research_case.py 重现；每次生成独立 demo/.local/acceptance/<run>/acceptance.json 及完整业务数据，用户项目不受影响。

## 多轮检查中的修正

1. SDK 子进程 stdin 增加及时 flush，避免任务启动后等待输入。
2. 完整 profile 接入原生逐工具审批与问题回传；普通聊天、复盘切换至同一执行路径，移除旧直连模型实现。
3. 结果完成状态推迟至 SDK 进程退出之后，避免备份抢在会话持久化之前。
4. 服务重启清理遗留工具审批状态，防止旧审批启动第二个执行进程。
5. Windows Git 克隆启用长路径支持，并向界面返回实际失败原因。
6. 实验目录统一置于项目目录；输出文件自动入库时排除导入资源和虚拟环境。
7. 备份采用 SQLite 一致性快照，恢复替换目录、保留 Git 元数据；恢复失败时回退目录，操作前保留回滚 ZIP。
8. UI 与后台工具同时修改不同条目时三方合并，真正冲突保存草稿；SQLite 读取使用一致性事务。
9. 任务轮询保留日志展开与问题输入，执行中阻止同一聊天重复发送。
10. DSH Session Log 上传通过 session-log-deepseek.enabled=false 关闭，OTel 关闭环境变量同时设置；模型调用仍按任务发送所需上下文。

## 实际边界

- 执行事件以约 1.5 秒轮询展示，完整原生历史保留于 DSH；任务面板只保留最近 150 个事件用于展示。
- PDF 基于文本提取，不含扫描件 OCR。引用图展示已知参考文献，不能承诺每个 DOI 都有完整引用数据。
- 实验跟踪记录实际提供的参数、日志和指标，不自动提供 GPU、数据集或科学结论；评估分数保留依据和评估者，便于人工复核。
- 便携备份不含密钥、虚拟环境与依赖缓存；换机器须重新配置密钥和环境。Git 元数据、资源、产物和原生会话保留。
- 云端部署与跨设备同步按本地优先方案留待后续。
- 相同字段的并发编辑仍需要用户决定取舍；程序不会静默覆盖。

## 上游接口依据

- [官方 Python SDK](https://github.com/deepseek-ai/deepseek-harness/blob/master/python/sdk/README.md)
- [SDK Server](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sdk/server/README.md)
- [Session Log 配置](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/session/session-log-deepseek/README.md)

SDK 本身未提供当前使用方式下的单会话 prompt-cancel 方法，因此采用任务进程隔离，取消时终止该任务运行树。
