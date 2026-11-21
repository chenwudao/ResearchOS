# 功能 Bot 与项目执行

Weave 通过 DSH 执行项目中的代码检查、数据分析和实验任务。工程台是其中一种项目 Bot 范式，负责展示可追溯的运行、日志、指标和产物。

## 当前执行路径

1. 在项目主对话说明要运行的工作、已知输入、环境和预期成果。全局助手先把任务转交给用户明确指定的项目。
2. 项目主对话按需要收集确认，登记真实分派。工程台 Bot 以与任务绑定的 DSH 原生子智能体执行，沿用发起会话的权限。直接打开 Bot 对话时，宿主按项目会话配置解析其权限。
3. Bot 使用获准的工具读取项目材料、运行命令或准备交付。在工程台通过 `labweave_experiment_record` 登记真实运行信息和产物。
4. 保存的运行记录出现在工程台画布和详情，交付文件位于项目的 `outputs/`。主对话核对分派结果、记录和文件后汇总。

工程台详情可展示实际运行时长、状态、日志、指标序列和关联文件。已登记的 CSV 或 TSV 产物可生成数值图表，运行中的详情约每三秒刷新。工程台也可以用于软件验证或数据处理。项目主对话的「工具」中提供空间存储与 Git。挂在早期页面上的项目代码沙盒、试跑额度和矩阵执行流程属于 [历史科研实现](V3科研闭环使用与验收.md)。

## 环境、权限和项目边界

| 概念 | 当前职责 |
| --- | --- |
| 服务 `.venv` | 安装并运行 Weave 启动器、业务依赖和打包的 DSH SDK/runtime。 |
| 项目 Python 环境 | 提供任务实际使用的解释器与依赖。代码执行使用选定项目环境或获准的命令。 |
| DSH 权限与审批 | 决定当前 Agent 可执行的操作。只读状态限制写入，工具审批由原生会话收集。 |
| 业务作用域 | 将会话与项目、Bot 和分派绑定。查询运行或打开产物时按真实归属检查。 |
| 系统隔离 | 按实际 DSH 和系统后端的能力执行路径和进程限制。更强的文件读取隔离、网络隔离或资源限制需要符合需求的后端。 |

项目生成文件遵循工作区目录策略。挂载的本机来源目录通过只读资料接口获取。执行时应在记录里写明实际解释器、输入、退出状态、可访问的产物以及结果限制。失败、取消和需要批准确认为各自的状态，已核验的阶段成果可继续回查。

## 当前代码与验证

- [Web 宿主](../plugins/dsh-labweave-workspace/host/native.js)注册项目工具并校验当前会话。[分派](../plugins/dsh-labweave-workspace/host/bot-delegation.js)启动子智能体并处理交付。
- [运行记录](../demo/api/research_records.py)、[Bot 活动](../demo/api/bot_activity.py)和[工作台](../plugins/dsh-labweave-workspace/client/bot-workbench.js)负责运行和产物的保存与读取。
- [SDK 后台任务](../demo/api/tasks.py)和 [SDK 进程](../demo/api/dsh_worker.py)管理通过 SDK 发起的任务、事件、审批及问题。
- [Bot 分派集成测试](../tests/integration_bot_delegation.py)通过固定版 DSH 验证分派、阶段草稿、产物和文件变更。[业务测试](../tests/test_native_web.py)覆盖运行记录与产物的项目隔离。具体运行后端的约束见 [DSH 固定版本的进程隔离说明](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.2/packages/sandbox/sandbox/README.zh.md)。
