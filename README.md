# LabWeave

LabWeave 把 DeepSeek Harness（DSH）的原生 Web 工作区改成科研项目区。项目、资料和实验记录保存在本机。DSH 提供聊天、历史会话、模型、主题、快捷键和自动化任务。

## 从项目根目录启动

Windows 运行 `.\start.ps1`，Linux 运行 `bash start.sh`。启动器使用项目根目录的 `.venv`，首次安装需要 Python 3.12 和网络。DSH SDK 和运行程序固定为 `0.2.2rc2`。项目自带的两个插件直接安装在本机专属 Web 配置中，默认启动无需另装 Node.js 或 pnpm。

浏览器自动打开已认证的 [本机科研工作区](http://127.0.0.1:8770)。需要在另一台显示器上的浏览器手工打开时，可加 `--no-open`，在本机终端使用当次登录链接。按 Ctrl+C 或从同一项目运行 `--stop` 关闭。只准备 Python 环境可加 `--install-only`。业务端口 8765 在正式模式中用于防止两份服务重复调度任务，DSH 与业务服务之间使用带认证的私有回环连接。

启动时读取已有 DeepSeek 密钥。读取顺序为环境变量 `DEEPSEEK_API_KEY`、兼容位置 `demo/.local/deepseek.key`、用户配置文件。Windows 用户配置为 `%LOCALAPPDATA%\LabWeave\deepseek.key` 或 `%USERPROFILE%\.labweave\deepseek.key`，Linux 为 `${XDG_CONFIG_HOME:-$HOME/.config}/labweave/deepseek.key`。也可以在 DSH 的模型设置中配置。没有模型时仍可整理项目，按原生引导选择「添加 API Key」和「稍后配置」即可。密钥保存在本机。

## 科研工作区

- **全局助手**。左上角 `goat` 直接进入全局助手，继续上次的全局对话。助手使用 DSH 原生消息流和输入框，空白会话提供科研提示。可以在通用设置中更改助手名称。
- **科研项目**。用侧栏科研项目区的加号创建项目。旧版业务库里已有的项目按项目目录关联到原生工作区。项目聊天使用独立的 DSH 会话和业务工具，可以从项目菜单改名。
- **五项功能**。从左侧展开科研项目，可以进入聊天、动态、点子、目标和资源库。聊天下面列出本项目的对话，聊天页可新建对话。其他栏目分别在 DSH 主区域打开。动态可设置订阅，目标可勾选并查看实验与审批，资源库支持导入文件、逐页阅读 PDF 和选择多篇论文进行对比。
- **通过对话改名**。例如在项目中说「把这个项目的点子改叫灵感」。项目工具核验当前 DSH 会话所属的工作区。全局助手可以指定项目，或更改所有项目的默认功能名。
- **自动化与插件**。原生「自动化任务」默认选择全局助手，也可以手工指定某个科研项目。项目助手能安排本项目的任务。「更多 → 创建项目插件」可保存一段科研指令，选择单个或全部项目可见。点击插件会把指令放进该项目的原生聊天草稿，由用户发送。对话工具也能创建和更名这类插件。

本机业务库位于 `demo/.local`。Web 配置、原生历史和设置与旧 SDK 的 `dsh-home` 分开保存。Windows 使用 `%LOCALAPPDATA%\LabWeave\web`，Linux 使用 `${XDG_STATE_HOME:-$HOME/.local/state}/LabWeave/web`，子目录根据本机科研数据路径区分。

## 备份与回退

关闭科研工作区后，运行同一启动脚本并传入 `--backup`，会在 `demo/backups` 生成 ZIP。用 `--restore 备份文件名.zip` 可同时恢复项目数据、原生会话、工作区和自动化记录，启动器会先保留回滚备份。原生会话引用绝对工作目录，含原生会话的备份须在原数据目录还原。本机登录凭据和用户模型配置由本机专属配置保管。

迁移期间，`--legacy` 打开原有科研界面及历史 SDK 任务，地址为 [本机回退入口](http://127.0.0.1:8765)。先关闭当前模式，再启动另一模式。此前的临时插件预览脚本仍可用于隔离开发。详细记录见 [DSH 适配路线](docs/DSH前端适配路线.md) 和 [V3 科研闭环](docs/V3科研闭环使用与验收.md)。

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

DSH 原生端到端验收使用 `tests/integration_native_web.py`，添加 `--model` 会用已配置的 DeepSeek 对测试项目发起真实对话。离线业务回归命令如下。

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
