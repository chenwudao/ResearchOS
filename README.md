# LabWeave

LabWeave 是以科研项目组织聊天、动态、点子、目标和资源的本地优先科研工作区，由 ResearchOS V3.0 演进而来。产品主线直接基于 DeepSeek Harness（DSH）原生 Web 界面，通过其插件、插槽和已有接口扩展科研能力；LabWeave 管理科研业务和本地数据，DSH 负责原生界面、会话及 Agent 执行。

## 产品主线与当前状态

- 直接把 DSH 现有工作区扩展为科研项目区，复用原生聊天、会话、设置、主题和快捷键；不再规划与 DSH 并行的独立产品前端或 Agent 运行时。
- 顶部新建会话的目标是独立全局助手（默认名 `goat`，可更名）；每个科研项目包含聊天、动态、点子、目标、资源库五项功能。自动化可为全局或指定项目，插件可应用于单个项目或全部项目。
- 当前默认启动入口仍打开既有自建界面，作为功能迁移期间的回退；它不是未来的产品前端。DSH 原生插件与独立预览已实现初步验证，但全局助手路由、项目及会话映射、项目作用域工具和五项功能仍在接入，不能视为正式产品已完成或 Web 会话已隔离。
- 不删除既有界面、项目数据或能力；V3 的科研状态、审批、实验闭环及证据网络将逐项接入 DSH。现有回退界面的使用方式及实现边界见 [V3 使用说明、实现边界与多轮验收](docs/V3科研闭环使用与验收.md)，迁移计划见 [DSH 前端适配路线](docs/DSH前端适配路线.md)。

## 现有回退入口：安装与启动

既有后端与回退入口已验证 Python **3.12.6**、DSH SDK/runtime **0.2.2rc2**、模型 **deepseek-flash**。需要 Git；首次安装需要联网。此入口不依赖独立安装 Node.js，SDK 自带运行程序。DSH 原生插件预览的安装还需要 `pnpm`。

Windows，在仓库根目录执行：

~~~powershell
$env:DEEPSEEK_API_KEY = "你的密钥"
.\start.ps1
~~~

Linux：

~~~bash
export DEEPSEEK_API_KEY="你的密钥"
bash start.sh
~~~

也可使用 Windows 的 `start.ps1` 或 Linux 的 `start.sh`。启动脚本优先使用项目根目录中现有的 `.venv`；首次启动时，Windows 优先通过 Python Launcher 查找 Python 3.12，Linux 优先查找 `python3.12`。启动器自动创建 `.venv` 并安装 `requirements-runtime.txt` 中固定的依赖。之后访问 [本地工作区](http://127.0.0.1:8765)。

密钥可保存在用户本机配置目录：Windows 为 `%LOCALAPPDATA%\LabWeave\deepseek.key`，另支持 `%USERPROFILE%\.labweave\deepseek.key`，以兼容 `%LOCALAPPDATA%` 被应用重定向的情况；Linux 为 `${XDG_CONFIG_HOME:-$HOME/.config}/labweave/deepseek.key`。文件仅填写密钥；这些位置不随项目目录同步或纳入 Git。兼容原有的 `demo/.local/deepseek.key`：读取顺序为非空的 `DEEPSEEK_API_KEY` 环境变量、原有项目密钥文件、本机配置文件，Windows 上最后查找用户目录中的备用文件。若项目目录在同步盘，原有项目密钥文件也可能被同步。仅准备环境可加 --install-only。原有本地工作区首次启动会自动迁移；同源浏览器的旧数据仅在服务器数据库尚未初始化时导入。

## DSH 原生界面隔离预览

预览使用临时 DSH 配置，不替代默认启动入口，不保留预览中的 DSH 设置与会话；连接现有后台时，需要该后台已载入当前代码。插件安装可能较慢，启动时不要关闭窗口。Windows 在项目根目录执行：

~~~powershell
.\.venv\Scripts\python.exe scripts\start_dsh_preview.py --use-existing-backend --use-configured-model
~~~

Linux 对应命令为 `./.venv/bin/python scripts/start_dsh_preview.py --use-existing-backend --use-configured-model`。

该命令复用已运行在 `127.0.0.1:8765` 的后台，并使用已配置的本地 DeepSeek 密钥；若后台尚未运行，可去掉 `--use-existing-backend`，由预览启动并管理后台。按 Enter 结束预览，已复用的后台不会由预览停止。该预览尚不能证明所有 DSH 设置、缩放、项目隔离或科研组件已接入，详见 [插件说明](plugins/dsh-labweave-prototype/README.md)。

## 既有后端与回退界面的功能

下列能力来自已有后端与自建回退界面，不代表它们已经迁入 DSH 原生 Web；具体可用范围和验证状态以对应说明为准。

| 模块 | 使用方式与行为 |
|---|---|
| 科研闭环 | 结构化研究状态、DSH 规划、可编辑协议、预算审批、任务依赖与持久化检查点 |
| 实验执行 | Python JSON/CSV 指标、矩阵并发、重试/暂停/取消/崩溃恢复、环境与输入哈希、日志、配对分析和报告导出 |
| 证据网络 | 连接假设、数据、代码、实验、报告、结论与决策；来源核查、证据状态、人工确认后更新研究状态与记忆 |
| 全局聊天 | 自然语言创建项目、跨项目查询并分发任务；项目工具按项目 ID 操作 |
| 项目助手 | 普通「发送」直接交给 DSH；原生会话持续恢复，自动注入项目背景、目标、动态、资源及记忆 |
| 执行记录 | 查看进度和事件、批准/拒绝本机工具操作、答复澄清问题、取消进程树、继续原会话 |
| 动态 | 关键词订阅 Crossref 论文、Google News、GitHub 仓库；后台每 30 分钟更新，可收藏、转点子、删除/隐藏 |
| 点子 | 新增、编辑、删除、关联论文来源、转目标；开启每日复盘后由 DSH 提出并保存研究建议 |
| 目标 | 截止日期、子任务、前置依赖、完成状态、时间表、可交互关系图；目标直接创建 DSH 任务 |
| 资源 | 本地文件/PDF 导入、HTTPS Git 仓库克隆、逐页文本阅读、下载、项目独立 Python venv；任务文件自动登记 |
| 论文阅读 | 助手读取 PDF 页码并生成方法/章节/局限分析；多篇论文对比报告；DOI 引用关系图和完整引用列表 |
| 科研记忆 | 持久化研究决策与任务结果；搜索、查看、手工补充、删除；后续任务自动读取 |
| 实验跟踪 | 记录并编辑参数、指标、日志、状态、关联任务；对照表比较多次实验；DSH 可调用相同业务工具 |
| 质量评估 | 对已完成任务按完整性、正确性、证据、可复现性评分，保存依据；支持人工及 DSH 评估，明确显示评估来源 |
| 备份恢复 | 界面创建、下载、导入、恢复 ZIP；包含业务数据库、附件、项目代码、Git 元数据和 DSH 会话；恢复前自动创建回滚备份 |
| 使用细节 | 外观、头像、助理设置、持久化历史；独立编辑自动合并，同一内容冲突时保留本机草稿并提示 |

「交给 DSH 执行」用于显式建立待确认任务；普通聊天直接启动任务。工具运行期间如出现授权请求，在「任务与执行记录」中处理。服务重启会将中断任务标记为失败，可从原会话继续；已经终止的进程不会被假装成仍在运行。

资源库提供「论文对比」「论文引用关系」「实验跟踪」「任务质量评估」入口。课题首页提供项目背景和科研记忆入口。

## 本地数据与恢复

- demo/.local/workspace.sqlite3：项目、组件条目、会话索引、任务、记忆、自动化、实验与评估记录；schema 版本 1。
- demo/.local/projects/<project_id>/：资源、代码仓库、实验目录、生成产物。
- demo/.local/dsh-home/：DSH 原生历史，由官方 SDK 创建与恢复，业务代码不改写会话文件。
- demo/backups/：可下载的便携备份，不纳入 Git。

备份/恢复前需完成或取消执行中的任务。恢复会替换对应数据和文件，并保留操作前的回滚 ZIP。密钥、缓存、node_modules 和 .venv 不进入备份；跨机器还原后配置密钥并重新创建环境、安装项目依赖。旧版 experiments 目录也纳入备份。单文件上传上限 25 MiB，导入 ZIP 上限 100 MiB，展开上限 512 MiB。

独立条目的并发修改可合并；两端修改同一字段时不会静默覆盖。本机冲突草稿存于浏览器 localStorage 的 researchos-conflict-draft。

## 验证

离线业务回归：

~~~powershell
.venv/Scripts/python.exe tests/test_local.py
node tests/test_merge.cjs
~~~

真实模型集成测试（使用已配置的 API）：

~~~powershell
.venv/Scripts/python.exe tests/integration_runtime.py
.venv/Scripts/python.exe tests/integration_approval.py
.venv/Scripts/python.exe tests/integration_question.py
.venv/Scripts/python.exe tests/integration_global.py
.venv/Scripts/python.exe tests/integration_v2.py
.venv/Scripts/python.exe tests/research_case.py
~~~

浏览器测试使用 Node.js 24.22.1 和 package-lock.json 固定的 Playwright：

~~~powershell
npm ci
.venv/Scripts/python.exe tests/integration_ui.py
~~~

Windows 默认使用已安装的 Edge。其他系统可安装 Playwright Chromium，设置 PLAYWRIGHT_CHANNEL=chromium。Linux 将上述 Python 路径换成 .venv/bin/python。

真实案例下载 [Transformer 论文](https://arxiv.org/abs/1706.03762)、[LoRA 论文](https://arxiv.org/abs/2106.09685)，导入 [LoRA 官方仓库](https://github.com/microsoft/LoRA)，实际执行参数量实验，验证产物、实验记录、点子、目标、记忆、原会话恢复及质量评估。验收数据留在 demo/.local/acceptance/，不污染用户工作区。

详见 [功能验收与已知边界](docs/dsh-runtime-validation.md)。

## 范围与边界

当前按方案采用本地部署；云端服务和跨设备同步属于后续范围。模型 API 与外部检索需要联网，服务停止时后台订阅也会停止。

PDF 阅读基于可提取文本，未内置扫描件 OCR；引用图依赖 Crossref 提供的参考文献。DSH 评分是有依据的助手评估，不能替代人工科学审查。示例验收执行的是参数量核算，不代表完成了大模型训练或论文结果复现。旧 /p0-chain 示例和 DSH Bridge 保留兼容入口，普通聊天及复盘不再走旧直连模型适配器。
