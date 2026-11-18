# DSH Web 界面原型

这是一个 DSH 原生界面插件原型：保留 DSH 原生工作区、会话列表、聊天和设置，左上品牌名显示 `leaweave` 和全局助手名称（默认 `goat`），可在原生设置的“通用设置”中更改。当前原生“新建会话”仍会继承当前或最近工作区，尚未实现用户要求的独立全局助手；它也不会把已有 LabWeave 项目数据或科研工具自动注入聊天。旧版工作区仍可通过本机 8765 端口访问，作为迁移回退。

在 Windows、固定 DSH 0.2.2-rc.2 的隔离配置和模拟后端中，已验证助手默认名、通用设置中更名、保存后侧栏同步，以及 900×700 窗口；当前已运行的后端和预览不会自动载入新代码。此前增设的“助手对话”入口已按最新要求移除。浏览器缩放比例、其他版本、操作系统和插件组合尚未验证。隔离启动脚本默认不配置模型密钥；显式传入 `--use-configured-model` 时可使用既有本地 DeepSeek 密钥，预览设置仍不保留。

需要在独立测试配置中复现时，从 LabWeave 项目根目录运行：

```powershell
$env:DSH_HOME = Join-Path $env:TEMP 'labweave-dsh-preview'
$pluginPath = (Resolve-Path 'plugins/dsh-labweave-prototype').Path.Replace('\', '/')
.\.venv\Scripts\dsh.exe plugin --profile web add "file:$pluginPath"
.\.venv\Scripts\dsh.exe web --no-open --port 0
```

按启动器显示的本机链接打开界面，结束时停止该进程。启动链接包含临时凭据，不要分享或提交日志。插件命令需要可用的 `pnpm`；不要将示例中的临时 `DSH_HOME` 替换为已有用户配置，除非确认需要安装到该配置。

此前验证用的项目数据路由已停用；项目作用域接入完成前，插件不注册这些路由。固定版本的另一种自定义宿主路由曾在未携带认证 cookie 时返回内容，即使设置 `auth: 'required'` 也一样；不要通过该路由暴露项目数据。接下来需要将已有科研项目安全地映射到 DSH 工作区和会话，并接入项目范围工具，不能因为界面使用了同一个导航就认为这些能力已实现。接口依据：[DSH Web 插槽](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/slots.md)。
