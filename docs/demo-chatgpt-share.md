# Weave 科研演示讨论原文

[ChatGPT 分享原页](https://chatgpt.com/s/t_6b0040d758b08191946b0940a0f638ac)

# AI Research Workspace：五个 Bot 完整功能与前端设计方案

我建议把这五个 Bot 设计成一套完整的 **AI 辅助科研工作空间（AI Research Workspace）**，而不是五个独立的聊天机器人。

整个产品的核心是：

**用户负责思考、决策和掌控项目，AI 负责整理知识、辅助构思、理解代码和执行工作。五个模块共享项目上下文，形成持续迭代的工作闭环。**

这份方案分为三个部分：

1. 产品整体架构与统一前端风格。
2. 五个 Bot 的功能、页面布局和交互设计。
3. 跨模块协同机制，以及最后如何用于 2～3 分钟的 Demo。

---

# 一、整体产品设计

## 1. 五个 Bot 的定位

| Bot | 核心定位 | 最重要的用户价值 |
|---|---|---|
| **Mind Map · 思维导图** | 研究知识地图 | 看清领域方向、方法和文献关系 |
| **Notes · 笔记** | 个人知识与资料库 | 沉淀资料、想法和研究历史 |
| **Goals · 目标** | 计划与进度管理 | 自己掌控日程、任务和阶段进度 |
| **Ideas · 点子** | AI 研究构思助手 | 主动发现值得探索的研究方向 |
| **Workbench · 工程台** | 可视化代码工作环境 | 理解代码结构、文件关系及执行结果 |

另外有一个 **主 Agent**，作为项目的统一入口，负责接收需求、调用不同模块的能力、协助跨模块操作。

主 Agent 不应该替用户接管所有工作。

## 2. 整体页面框架

建议采用现代桌面软件常见的三层设计：全局导航、项目工作空间、上下文面板。

<details>
<summary>界面示意源码</summary>

```jsx
<box border radius="2xl" clip gap={0}>
  <box background="#151C2B" theme="dark" padding={3} gap={3}>
    <row align="center" justify="between">
      <row align="center" gap={2}>
        <icon name="orbit" color="#A9B7FF" size="lg"/>
        <text color="#FFFFFF" weight="semibold">Research Workspace</text>
      </row>
      <row align="center" gap={3}>
        <icon name="search" color="#AAB6CA"/>
        <icon name="bell" color="#AAB6CA"/>
        <icon name="settings-2" color="#AAB6CA"/>
      </row>
    </row>
    <box background="#263044" radius="md" padding={3} gap={2}>
      <row align="center" gap={2}>
        <icon name="folder-kanban" color="#ADB9FF"/>
        <text color="#FFFFFF" weight="medium" size="sm">3DCodeBench</text>
        <icon name="chevron-down" color="#9AAACA" size="xs"/>
      </row>
      <text color="#AAB6CA" size="xs">Active Research Project</text>
    </box>
    <grid columns={["106px","1fr","112px"]} gap={2}>
      <grid-item>
        <box background="#202A3C" radius="lg" padding={2} gap={3} height="100%">
          {#each [{i:"message-square",t:"主对话"},{i:"network",t:"思维导图"},{i:"notebook-pen",t:"笔记"},{i:"calendar-days",t:"目标"},{i:"lightbulb",t:"点子"},{i:"blocks",t:"工程台"}] as x,i}
            <row align="center" gap={2}>
              <icon name={x.i} color={i===1?"#B4BBFF":"#B6C1D5"} size="sm"/>
              <text color={i===1?"#FFFFFF":"#B6C1D5"} size="3xs" weight={i===1?"semibold":"normal"}>{x.t}</text>
            </row>
          {/each}
        </box>
      </grid-item>
      <grid-item>
        <box background="#F6F8FC" theme="light" radius="lg" padding={3} gap={3} minHeight="278px">
          <row align="center" justify="between">
            <box gap={1}>
              <text weight="semibold" size="sm">Research Knowledge Map</text>
              <text color="secondary" size="2xs">研究知识与文献关系</text>
            </box>
            <icon name="ellipsis" color="secondary"/>
          </row>
          <box flex="1" justify="center">
            <svg viewBox="0 0 300 170" width="100%" xmlns="http://www.w3.org/2000/svg">
              {#each [{x:150,y:27},{x:57,y:82},{x:239,y:83},{x:99,y:143},{x:229,y:145}] as n,i}
                {#if i>0}<path d={`M150 27 L${n.x} ${n.y}`} stroke="#B8C6E4" strokeWidth="1.5" strokeDasharray="3 3"/>{/if}
              {/each}
              <rect x="103" y="10" width="94" height="34" rx="10" fill="#5269C9"/>
              <text x="150" y="31" fill="white" fontSize="11" textAnchor="middle">Research Topic</text>
              {#each [{x:14,y:68,t:"3D Generation",c:"#DFE8FF"},{x:195,y:69,t:"Scene Editing",c:"#E1F3EA"},{x:52,y:131,t:"Evaluation",c:"#FCE9D9"},{x:183,y:131,t:"Code Methods",c:"#E9DFFD"}] as n}
                <rect x={n.x} y={n.y} width="104" height="27" rx="8" fill={n.c}/>
                <text x={n.x+52} y={n.y+17} textAnchor="middle" fontSize="10" fill="#36445A">{n.t}</text>
              {/each}
            </svg>
          </box>
        </box>
      </grid-item>
      <grid-item>
        <box background="#202A3C" radius="lg" padding={2} gap={3}>
          <text color="#FFFFFF" weight="medium" size="xs">Project Info</text>
          <box gap={1}>
            <text color="#B6C1D5" size="3xs">PAPERS</text>
            <text color="#FFFFFF" weight="medium" size="sm">24</text>
          </box>
          <box gap={1}>
            <text color="#B6C1D5" size="3xs">NOTES</text>
            <text color="#FFFFFF" weight="medium" size="sm">12</text>
          </box>
          <box gap={1}>
            <text color="#B6C1D5" size="3xs">TASKS</text>
            <text color="#FFFFFF" weight="medium" size="sm">8</text>
          </box>
          <text color="#AAB6CA" size="3xs">Illustrative data</text>
        </box>
      </grid-item>
    </grid>
  </box>
</box>
```

</details>
<caption>整体框架示意：导航长期保持一致，不同 Bot 只切换中央工作区和右侧上下文面板。数据为设计示例。</caption>

### 视觉风格推荐

![参考图 1 · www.davidxavila.com](<https://images.openai.com/static-rsc-4/YxF2xCwrsnVf3LUCymj8oQ93Xgj4HzdpmQ2Q-3ly3r_jsmqZ7hLv4GagHuK0UAGd5d0sNEDR61mAXoBJWGmkMR_8AjBMSP7kJt-pyV370FAZ7GOCrYqMQJpxh5NEPTPaIoX1rl0rDgktNDK2D3-73ADxxHWRFJmn4JzzVLRHw6OcStxmg12U3cCLrkX7i27i?purpose=fullsize>)

[图片来源](<https://www.davidxavila.com/en/case-studies/research-management-system>)

![参考图 2 · elephas.app](<https://images.openai.com/static-rsc-4/W5X-jUhl12QI8oY9Ma0oTx_E-J1p-LNE1JMHCJ2F6eCmJC3diD4dya5ewdpCxMQR4Mx0zFS1LsJAV46tbKHJoUu9LApvubcK6zQG_YiEWhLwuGBaAHTxvjP0304q2JJZ4oHnHV1m1_MvDVCPvPOuXiR8fCP50Rl5jjHZznUzB2inzdUDffJh_h1euLhoUoWj?purpose=fullsize>)

[图片来源](<https://elephas.app/blog/obsidian-guide>)

![参考图 3 · dribbble.com](<https://images.openai.com/static-rsc-4/EGK2jjWjWOs_UyWZEnenca69LED0YToap7wn4O-ECYKYg04c20xyLv0y7XQc8GcIg1TSGgrXEf-Yoyoz8WYnpFDLdNnIMmhrsQBvSH6Z7mTkdH46uy1bkLsEFOvKbXk8MoxmKYPPN8rwP5EWcpraF26_J4OInhOAkpvXzcFbXTYTjWH6hkhaoZuAS4i393YO?purpose=fullsize>)

[图片来源](<https://dribbble.com/shots/27125776-Time-Tracking-Analytics-Dashboard-Web-Design>)

![参考图 4 · dribbble.com](<https://images.openai.com/static-rsc-4/QS4QiQhaa2TYpLRgJgPUbUvJuyJMgV4H8uVWg2CdSm5QWv6WplvypavHtMzg7fao2SXUSStX-hb_ASbrFMpR40Qneh7umdHr7qCMGHW5C2HG7FRkoR2pUf3tRSP761CIKEhrZRl97UfTNoY2D8WlvG-x6VpjtU8CwQpvcES0nX5EaEz3icNNWj3mfj0yTuoL?purpose=fullsize>)

[图片来源](<https://dribbble.com/shots/26425677-AI-powered-researching-bento-card-UI>)

![参考图 5 · yiweishen.github.io](<https://images.openai.com/static-rsc-4/9g7Jz18ye18cagdYuuVfNgN-poQJdA_cd7uivPZx9xuE_eIruo7HDinuVwx0BorL0lTdacJHgg33Iwf46f7tYiKxjmqAVhCmkrefTw6_pKFwDn06TIN1HgyAJiPaGLjL0hWvlbScRJbYesmtC-jp_52My8hPNfrjGkoINEr1170JRf7JdKVHPIDA0IuHtSrR?purpose=fullsize>)

[图片来源](<https://yiweishen.github.io/linear-mock/>)

![参考图 6 · www.thinklet.blog](<https://images.openai.com/static-rsc-4/aRIqxvwiNk18R3GhZ7UQ4vrAJgKp6pBb0hxGIeP46NJvqGilheIQtvDhkZ7-TxTfuypg8Y554ioXCnxuWNqe12_cl3Li8Vk6qcj_Yh-eubTGJp-G1xTGenMq85jaOoIwdbWWypkMT5Z0BKGL8V089Xrec0qxvTqMEYEMHht0IkDVRh50Urw0XMPqPK-fljwh?purpose=fullsize>)

[图片来源](<https://www.thinklet.blog/research-with-kosmik>)

![参考图 7 · linear.app](<https://images.openai.com/static-rsc-4/_tWHYwadxlRpwyS1LfvUmIA-Hc68U1X-TZ7EjCxBNeTLL82a1dfWfV-PS_VmN8tB7n3MqcAvrhKDo5bClfDGYZ2IQCZsGUl4GENZuVh7PBmEkX91dLYesqwQGAL4I5Bl9jHZENNkSuZY_CXhYa8UHm_rEP57FGDTGFy0zUXSTmE0MZW38-ZxZ5xpVFe3eiX2?purpose=fullsize>)

[图片来源](<https://linear.app/now/how-we-redesigned-the-linear-ui>)

建议采用 **Linear 的简洁感 + Obsidian 的知识组织方式 + Notion 的内容编辑体验**，而不是传统的全屏聊天式 AI 产品。

视觉规则统一如下：

| 设计元素 | 推荐方案 |
|---|---|
| 主色 | 靛蓝 / 蓝紫色，用于主要操作和选中状态 |
| 背景 | 浅灰白主工作区，深色侧边栏 |
| 字体 | 中文用思源黑体或系统字体，英文用 Inter 风格 |
| 组件 | 轻边框、浅阴影、圆角卡片 |
| 布局 | 尽量大面积留白，避免所有内容塞满屏幕 |
| 动画 | 主要使用平滑展开、节点生长、面板滑入 |
| 图表 | 统一线条粗细与配色，避免过多鲜艳颜色 |

这里有一个特别重要的要求：**五个 Bot 不能有五套完全不同的设计语言。**

可以给每个模块一个识别色，但是按钮、字体、侧边栏、文件卡片、弹窗等应保持一致。

---

# 二、Bot 1：Mind Map — 思维导图

<details>
<summary>界面示意源码</summary>

```jsx
<row align="center" justify="between">
  <title size="lg">核心定位：让用户理解一个研究领域</title>
  <icon name="network" color="secondary" size="xl"/>
</row>
```

</details>

## 功能设计

这个 Bot 的核心不是生成一张普通思维导图，而是创建一个可以持续扩展的 **研究知识网络**。

### 主要功能

**研究方向地图**

用户输入研究主题，AI 将相关知识组织成若干研究主线。例如一个 AI 研究领域可能分为方法研究、模型架构、评测方法、实际应用等。

**文献关系图**

把论文作为节点，展示不同论文之间的关系，包括引用、方法继承、方法比较以及主题关联。应明确区分有文献依据的关系与 AI 推断出的关系。

**研究发展时间线**

可以按年份展示某一方向的关键论文、方法演进及代表性工作。

**主流路线概览**

在图谱下方设置简洁的路线卡片，帮助用户直接理解：

- 这个研究方向主要解决什么问题。
- 目前有哪些代表性方法。
- 还有哪些可以继续探索的问题。

**资料库联动**

点击论文可查看摘要、来源和相关笔记；点击收藏则将论文加入资源库。

## 前端设计

![参考图 8 · thepaperscope.com](<https://images.openai.com/static-rsc-4/fhMuqXrX45ftzy_tcDgRhIDZ-2iv9Z0kPR5y7BEVupEO6RLaHzNZsRHicwxAIKgYx3nZFWCqd4hYJEgmych_2rP6aWGimr_feoiKAPxrhn-fCShZO7lTrbyQMqyvHfRf1J_oabtpF3JGMb5cEChplFy5nG546ev3pyhOooSU52uByPkaNEa3oWJdT-Hcvv0V?purpose=fullsize>)

[图片来源](<https://thepaperscope.com/Features>)

建议采用：

- **左侧 15%：** 研究主线目录与筛选条件。
- **中间 65%：** 可缩放、拖拽、展开和收起的知识图谱。
- **右侧 20%：** 选中节点的论文详情或研究方向介绍。
- **下方可收起区域：** 主流研究路线的文字概览和时间线。

### 最关键的交互

点击研究主线 → 展开论文和子方向 → 点击论文查看详情 → 收藏到资源库。

**Demo 展示重点：** 一张知识图谱从中心向外展开，点击其中一条主线后，该分支被高亮，相关论文和方法清晰呈现。

---

# 三、Bot 2：Notes — 笔记与资料库

<details>
<summary>界面示意源码</summary>

```jsx
<row align="center" justify="between">
  <title size="lg">核心定位：用户自己的长期研究记忆</title>
  <icon name="notebook-pen" color="secondary" size="xl"/>
</row>
```

</details>

这是五个模块中最需要做得像成熟桌面软件的一个。

## 功能设计

**自由笔记编辑**

提供类似 Notion、Obsidian 的笔记编辑体验，包括标题、段落、列表、代码块、数学公式、表格、图片与附件。

**文件夹与标签组织**

用户可以自行建立目录，如文献阅读、实验记录、头脑风暴、会议纪要等。AI 可建议分类，但不强制使用 AI 分类。

**统一资料库**

管理 PDF 论文、图片、Markdown、代码片段等研究资料。支持手动上传，也可以从思维导图收藏文献并导入对应文件。

**双向关联**

一条笔记可以关联多篇文献、某个目标或工程实验。关联关系可以反向查看，方便追溯一项研究想法来自哪里。

**AI 辅助整理**

用户可让 AI 总结文献、提取重点、比较笔记、寻找历史讨论内容。原始笔记默认由用户控制，AI 修改内容应通过明确操作或确认。

## 前端设计

![参考图 9 · forum.obsidian.md](<https://images.openai.com/static-rsc-4/ZZ-F7GfsoDP1Q553OIMfpqjwqgBEI--q-xqmpRN61JFlCTgClewiLRuRhQWARrKmgTkWE0qjV-8agLWR3Ta_SQfpdps7_ImIqJOWeI-aFhXAsLYLD-3-P3KbuEpT2zp0ZxjN4e4JztUkuh_ZXiU1T9flPNhiEjNQ_ntAQWskoecC2wpedWsMgFPk8Kv_Oo3_?purpose=fullsize>)

[图片来源](<https://forum.obsidian.md/t/adhd-friendly-system/12800>)

建议使用经典的三栏笔记布局：

<details>
<summary>界面示意源码</summary>

```jsx
<box border radius="xl" padding={2} gap={2}>
  <grid columns={["25%","49%","1fr"]} gap={2}>
    <grid-item>
      <box background="surface-secondary" radius="md" padding={3} gap={3} height="100%">
        <text size="xs" weight="medium">资料目录</text>
        {#each ["📁 文献阅读","📁 实验记录","📁 研究想法","📁 会议笔记","📄 今日笔记"] as f}
          <text size="2xs">{f}</text>
        {/each}
      </box>
    </grid-item>
    <grid-item>
      <box border radius="md" padding={3} gap={2} minHeight="230px">
        <text weight="semibold" size="sm">研究思路整理</text>
        <text color="secondary" size="3xs">最后编辑：今天</text>
        <divider color="subtle"/>
        <text size="xs" weight="medium">研究问题</text>
        <text size="2xs">记录当前的研究目标、遇到的问题，以及需要进一步验证的想法。</text>
        <box background="surface-secondary" radius="md" padding={2}>
          <text size="2xs" color="secondary">输入 / 以添加内容...</text>
        </box>
      </box>
    </grid-item>
    <grid-item>
      <box background="surface-secondary" radius="md" padding={3} gap={2}>
        <text weight="medium" size="xs">关联内容</text>
        <text size="2xs"><icon name="file-text" inline size="xs"/> 相关论文</text>
        <text size="2xs"><icon name="link" inline size="xs"/> 相关笔记</text>
        <text size="2xs"><icon name="check-square" inline size="xs"/> 关联任务</text>
        <text size="2xs"><icon name="bot" inline size="xs"/> AI 辅助整理</text>
      </box>
    </grid-item>
  </grid>
</box>
```

</details>

### 页面需要特别注意

笔记应该支持全宽编辑模式，不能为了展示 AI 功能而把编辑器压缩得很窄。

AI 助手建议放在右侧可收起面板，通过选中文本或工具栏触发，而不是始终占据很大空间。

**Demo 展示重点：** 从思维导图收藏论文 → 进入笔记资源库 → 新建研究笔记 → 右侧出现关联文献。

---

# 四、Bot 3：Goals — 目标与进度管理

<details>
<summary>界面示意源码</summary>

```jsx
<row align="center" justify="between">
  <title size="lg">核心定位：自己规划、自己掌控进度</title>
  <icon name="calendar-days" color="secondary" size="xl"/>
</row>
```

</details>

这个模块要弱化 AI 的自主安排能力。

**用户决定做什么、什么时候做、什么时候完成，AI 只负责辅助整理。**

## 功能设计

**阶段目标**

用户可以将整个项目拆成不同阶段，每个阶段设置里程碑、任务及预计时间。

**日历与任务安排**

支持月视图、周视图与日视图。用户自行把工作安排到不同日期，拖拽调整任务时间。

**自然语言转换待办**

例如用户输入“下周把这几篇论文看完，然后开始准备实验”，AI 将其拆成待办草稿，由用户确认添加，而不是自动替用户规划所有日程。

**进度可视化**

提供阶段进度条、任务完成比例、项目时间线和历史完成记录。

**与其他模块关联**

可以将一条笔记中的想法转成待办，也能将工程台中的实验链接到某项任务。实验完成后，用户可以直接更新状态。

## 前端设计

![参考图 10 · medium.com](<https://images.openai.com/static-rsc-4/VgwjhI6TU2Ptcgwuehi_ca-G0xBnLbip19BP4PvEzevyiUNZT0A0XkGiLv5RQCNtpiYytcQ7We-GiiH2rsBTRlQ22tlpdPgjXY991AJAY-FnfpviHyVlE8nEbsa05OmNmYqWpuJpIc-1F1udXsKfPEX-Oi6RlPDrYB6-PeUYVv0h_eBeFWrM_F2d51b_cC6S?purpose=fullsize>)

[图片来源](<https://medium.com/%40theymakedesign/web-app-design-ideas-minimalistic-structured-vol-246-d273fd58220d>)

页面采用 **上方进度、中央日历、右侧待办** 的结构。

<details>
<summary>界面示意源码</summary>

```jsx
<box border radius="xl" padding={3} gap={3}>
  <row align="center" justify="between">
    <text weight="semibold" size="sm">Project Progress</text>
    <badge color="secondary">示意</badge>
  </row>
  <grid columns={3} gap={2}>
    {#each [{t:"文献调研",v:100},{t:"方案设计",v:65},{t:"实验验证",v:25}] as p}
      <grid-item>
        <box background="surface-secondary" radius="md" padding={2} gap={2}>
          <text weight="medium" size="xs">{p.t}</text>
          <box background="border" radius="full" height="5px" clip>
            <box background={p.v===100?"#2C9B7A":"#6478CF"} width={`${p.v}%`} height="100%" radius="full"/>
          </box>
          <text color="secondary" size="2xs">{p.v}%</text>
        </box>
      </grid-item>
    {/each}
  </grid>
  {@body const [week,setWeek] = DIL.useState(0)}
  <row align="center" justify="between">
    <text weight="medium" size="xs">本周计划 · 第 {week+1} 周</text>
    <row gap={1}>
      <button size="xs" variant="outline" color="secondary" onClick={()=>setWeek(Math.max(0,week-1))}><icon name="chevron-left"/></button>
      <button size="xs" variant="outline" color="secondary" onClick={()=>setWeek(Math.min(3,week+1))}><icon name="chevron-right"/></button>
    </row>
  </row>
  <grid columns={7} gap={1}>
    {#each ["一","二","三","四","五","六","日"] as d,i}
      <grid-item>
        <box border radius="sm" padding={1} minHeight="65px" gap={2}>
          <text color="secondary" size="2xs" textAlign="center">{d}</text>
          {#if i===1 || i===3 || i===4}
            <box background={i===3?"#E5E9FF":"surface-secondary"} radius="sm" padding={1}>
              <text size="3xs">{(week+i)%2===0?"整理资料":"推进任务"}</text>
            </box>
          {/if}
        </box>
      </grid-item>
    {/each}
  </grid>
  <row align="center" gap={2}>
    <icon name="list-todo" color="secondary"/>
    <text size="xs">待办清单、阶段时间线与日历联动</text>
  </row>
</box>
```

</details>

建议在页面中提供三个主要视图切换：**日历 / 看板 / 时间线**，三个视图使用同一套任务数据。

**Demo 展示重点：** 用户输入一句计划 → 转换成待办 → 手动确认放入日历 → 进度面板显示不同阶段的任务状态。

---

# 五、Bot 4：Ideas — 科研点子与方向探索

<details>
<summary>界面示意源码</summary>

```jsx
<row align="center" justify="between">
  <title size="lg">核心定位：辅助用户寻找新的研究方向</title>
  <icon name="lightbulb" color="secondary" size="xl"/>
</row>
```

</details>

这是五个 Bot 里面最能体现 AI 主动性和科研辅助价值的模块。

但它的目的不是不断产生一些泛泛的灵感，而是**结合当前项目的知识、研究进度和相关文献，给出有依据、可以继续探索的研究思路。**

## 功能设计

### 1. 主动研究建议

根据已有文献、笔记和当前研究状态，提供三种类型的建议：

<details>
<summary>界面示意源码</summary>

```jsx
<box gap={2}>
  <row align="start" gap={2}>
    <box background="surface-secondary" radius="md" padding={2}><icon name="compass"/></box>
    <box flex="1" gap={1}>
      **新方向探索**
      <text size="sm" color="secondary">当前领域有哪些值得关注、但项目尚未深入考虑的方向？</text>
    </box>
  </row>
  <row align="start" gap={2}>
    <box background="surface-secondary" radius="md" padding={2}><icon name="git-compare-arrows"/></box>
    <box flex="1" gap={1}>
      **已有思路延伸**
      <text size="sm" color="secondary">现有研究想法还能如何扩展、组合或形成新的研究假设？</text>
    </box>
  </row>
  <row align="start" gap={2}>
    <box background="surface-secondary" radius="md" padding={2}><icon name="flask-conical"/></box>
    <box flex="1" gap={1}>
      **研究方案建议**
      <text size="sm" color="secondary">某个假设应该怎样初步验证？可以尝试哪些实验或对比？</text>
    </box>
  </row>
</box>
```

</details>

### 2. 文献启发

用户可以关注一些研究主题。系统在获取新文献时，筛选与项目相关的工作，并指出这些论文与已有想法可能存在的联系。

这里应区分“确实来自论文的结论”和“AI 根据论文提出的猜想”。

### 3. 研究想法讨论

用户可以点击某条想法，与 AI 进一步讨论其合理性、潜在创新点、难点、可行性以及已有工作的覆盖情况。

### 4. 灵感收藏与反馈

每张点子卡片都允许用户：

- 收藏到想法库。
- 继续深入讨论。
- 转换成研究待办草稿。
- 忽略或标记暂不考虑。

系统可以参考用户的反馈调整后续建议，但不会直接改变研究目标。

## 前端设计

![参考图 11 · www.readwonders.com](<https://images.openai.com/static-rsc-4/oMXcKTTxAyfJISHjOdc-ClrUY4P4H5_CXokMf5DjcBxGETWNjqzALPC4MQpx-ssoE5DVb3MWTNmgZsU_nHwkusY-Hc9mR3CIkeNvlFOsx-Pao1JG_DOPF2HOnOhOcKNSvzqud47QO56oke3T51eEREDJXD5Lq5WFZJ_kCaTuazQbM12xJ0BX7o34BZuaD1wR?purpose=fullsize>)

[图片来源](<https://www.readwonders.com/corporate-r-and-d-innovation>)

我建议采用类似 **灵感看板 + AI 分析侧栏** 的方式，不要做成全屏聊天界面。

页面布局：

- **顶部：** 研究主题、当前项目关注点、刷新建议入口。
- **中央：** 不同类别的研究点子卡片，以两列或三列布局展示。
- **右侧：** 点击某条点子后，打开详细分析，包含依据、相关论文、可尝试方法。
- **底部或独立标签：** 已收藏想法、历史讨论、暂不考虑的方向。

### 点子卡片设计

<details>
<summary>界面示意源码</summary>

```jsx
<box border radius="xl" padding={3} gap={2}>
  <row justify="between" align="center">
    <badge color="secondary">研究方向探索</badge>
    <icon name="bookmark" color="secondary"/>
  </row>
  <title size="md">从现有研究发现新的切入点</title>
  <text size="sm">结合已有研究笔记、相关论文与当前进度，提出一个可能值得深入分析的研究问题。</text>
  <row gap={2} wrap="wrap">
    <badge color="secondary"><icon name="file-text" inline size="xs"/> 文献依据</badge>
    <badge color="secondary"><icon name="notebook-pen" inline size="xs"/> 相关笔记</badge>
    <badge color="secondary"><icon name="flask-conical" inline size="xs"/> 可验证假设</badge>
  </row>
  <divider color="subtle"/>
  <row align="center" justify="between">
    <text color="secondary" size="xs">AI 建议 · 待用户判断</text>
    <row gap={2}>
      <button size="sm" variant="outline" color="secondary" onClick={()=>GenUI.copy("结合已有研究笔记、相关论文与当前进度，提出一个可能值得深入分析的研究问题。")}>收藏内容</button>
      <button size="sm" onClick={()=>GenUI.issueNewTurn("继续帮我细化科研点子 Bot 的单张建议卡片，包括依据、可行性、相关文献和后续操作。")}>深入探讨</button>
    </row>
  </row>
</box>
```

</details>

实际产品的卡片应该优先呈现具体的研究问题，不要只是“建议你尝试新方法”这种空话。

**Demo 展示重点：** 点子页面出现几张不同方向的建议卡片 → 用户展开其中一条 → 看到研究依据和可尝试方案 → 收藏或转为待办。

---

# 六、Bot 5：Workbench — 可视化工程台

<details>
<summary>界面示意源码</summary>

```jsx
<row align="center" justify="between">
  <title size="lg">核心定位：让复杂代码工程变得可理解</title>
  <icon name="blocks" color="secondary" size="xl"/>
</row>
```

</details>

这个模块和你最初的设想相比，已经有了比较明确的特色。

它不仅能像 Coding Agent 一样编写和运行代码，还能**把整个代码工程自动组织成模块链路，并让用户逐层查看每个模块包含的 Python 文件及具体代码。**

## 1. 核心功能设计

### 功能 A：代码工程结构识别

读取用户的项目目录，分析 `.py` 文件、函数调用、模块导入及其他可识别的依赖关系。

然后将代码整理为几个逻辑模块，例如：

数据输入 → 数据处理 → 核心算法 → 结果评估 → 可视化输出。

这些逻辑模块不必与文件夹一一对应，而是围绕它们共同实现的功能分组。

### 功能 B：模块链路可视化

在画布上用节点和连线展示代码模块之间的调用、依赖或数据传递关系。

默认只显示主要模块，避免整个屏幕被函数与文件节点占满。

用户可以拖动画布、缩放、选中节点、展开分支和筛选关系。

### 功能 C：逐级展开 Python 文件

这是你特别要求的功能。

每个模块节点上显示：

- 模块名称。
- 简短功能说明。
- 包含多少个 Python 文件。
- 与哪些模块存在关系。

点击模块后，可以看到内部的 `.py` 文件列表以及可以确定的文件关系。

再次点击文件，便能在代码编辑器中打开文件。

### 功能 D：可视化代码与文件联动

在工程关系图中选中某个文件时，代码编辑区同步打开它；在文件树中选择文件时，关系图也会高亮对应节点。

这样用户在阅读代码时，不会失去对整体工程结构的理解。

### 功能 E：执行过程与结果可视化

除了代码结构，还可以展示：

- 任务执行步骤和当前状态。
- 日志与异常信息。
- 实验指标的折线图、柱状图等。
- 图片、三维场景及其他程序输出。

不同工程可以使用不同的输出可视化组件，不需要把所有类型塞进同一个界面。

---

## 2. 工程台的前端布局

![参考图 12 · www.l024.net](<https://images.openai.com/static-rsc-4/FEeCWAulPGCgTlos97PJvKtrz6_SjINNsl2wwGghTgwNJIcoQBBfbNocFXyvvhLN4cOK_9_aZyb3TyY3fbiCCzqwDzULXPwQ9-MPk94gjlO5Hky6WZy-C0FWZnenOr01p4LkCwsx8nofDoLOdezGL5lsnsev5t8XaVA3WStWEFd18T-b2MVCti-Rt-bm_G1v?purpose=fullsize>)

[图片来源](<https://www.l024.net/2026/02/gitnexus-ai.html>)

我建议工程台采用四个区域，但**默认仅重点展示其中两个**。

<details>
<summary>界面示意源码</summary>

```jsx
<box border radius="xl" padding={3} gap={2}>
  <row align="center" justify="between">
    <row align="center" gap={2}>
      <icon name="blocks"/>
      **Project Workbench**
    </row>
    <badge color="secondary">布局示意</badge>
  </row>
  <grid columns={["25%","1fr"]} gap={2}>
    <grid-item>
      <box background="surface-secondary" padding={2} radius="md" gap={2} height="100%">
        <text weight="medium" size="xs">项目文件</text>
        {#each ["📁 project","  📁 src","    📄 main.py","    📄 model.py","  📁 scripts","    📄 run.py","  📁 results"] as f}
          <text size="2xs" preserveWhitespace>{f}</text>
        {/each}
      </box>
    </grid-item>
    <grid-item>
      <box border radius="md" padding={3} gap={3} minHeight="205px">
        <row justify="between" align="center">
          <text size="xs" weight="medium">模块依赖关系</text>
          <icon name="maximize-2" size="sm" color="secondary"/>
        </row>
        <svg viewBox="0 0 260 140" width="100%">
          <g fill="none" stroke="#8C9BC6" strokeWidth="2">
            <path d="M130 41 V56 H65 V72"/>
            <path d="M130 56 H195 V72"/>
            <path d="M65 102 V116 H130"/>
            <path d="M195 102 V116 H130"/>
          </g>
          <rect x="79" y="9" width="102" height="32" rx="7" fill="#5A6FCC"/>
          <text x="130" y="29" fill="#FFFFFF" fontSize="11" textAnchor="middle">输入与配置</text>
          <rect x="9" y="72" width="112" height="30" rx="6" fill="#E1E8FB"/>
          <text x="65" y="91" fill="#34466A" fontSize="10" textAnchor="middle">数据处理 · 3 files</text>
          <rect x="139" y="72" width="112" height="30" rx="6" fill="#DBF1E9"/>
          <text x="195" y="91" fill="#34466A" fontSize="10" textAnchor="middle">核心计算 · 5 files</text>
          <rect x="87" y="117" width="86" height="22" rx="5" fill="#F3E5D7"/>
          <text x="130" y="132" fill="#664B39" fontSize="10" textAnchor="middle">结果输出</text>
        </svg>
      </box>
    </grid-item>
  </grid>
  <box background="surface-secondary" padding={2} radius="md">
    <row align="center" justify="between">
      <text weight="medium" size="xs">代码 / 执行结果</text>
      <row gap={2}><icon name="code-2" size="sm"/><icon name="chart-line" size="sm"/><icon name="terminal" size="sm"/></row>
    </row>
  </box>
</box>
```

</details>

实际桌面版我更推荐：左侧保持窄文件树，中间是可视化链路图，右侧根据用户操作展开代码面板，下方运行结果区域可折叠。

## 3. 最重要的三级交互

<details>
<summary>界面示意源码</summary>

```jsx
<box border radius="xl" padding={3} gap={3}>
  {@body const [stage,setStage] = DIL.useState("modules")}
  {@body const [file,setFile] = DIL.useState("process.py")}
  <segmented-control block size="md" value={stage} onChange={setStage} options={[{"label":"① 模块链路","value":"modules"},{"label":"② 内部文件","value":"files"},{"label":"③ 源代码","value":"code"}]}/>
  {#if stage==="modules"}
    <box gap={2}>
      <text weight="medium" size="sm">整体模块链路</text>
      <row align="center" gap={1}>
        {#each [{t:"数据输入",n:"2 files"},{t:"数据处理",n:"3 files"},{t:"核心算法",n:"5 files"}] as m,i}
          {#if i>0}<icon name="arrow-right" color="secondary" size="sm"/>{/if}
          <pressable flex="1" background="surface-secondary" radius="md" border padding={2} align="center" gap={1} onClick={()=>setStage("files")}>
            <icon name="package" size="sm" color="secondary"/>
            <text weight="medium" size="xs">{m.t}</text>
            <text size="3xs" color="secondary">{m.n}</text>
          </pressable>
        {/each}
      </row>
      <text color="secondary" size="xs">点击模块查看内部文件。实际项目中，展示真实模块依赖及文件数量。</text>
    </box>
  {:else if stage==="files"}
    <box gap={2}>
      <row align="center" justify="between">
        <text weight="medium" size="sm">数据处理 / 内部文件</text>
        <button color="secondary" variant="ghost" size="xs" onClick={()=>setStage("modules")}><icon name="arrow-left" size="xs"/> 返回</button>
      </row>
      {#each [{f:"load_data.py",d:"读取输入"},{f:"process.py",d:"转换数据"},{f:"validate.py",d:"检查数据"}] as item}
        <pressable border radius="md" padding={2} onClick={()=>{setFile(item.f);setStage("code")}}>
          <row align="center" gap={2}>
            <icon name="file-code-2" color="secondary"/>
            <box flex="1" gap={0}>
              <text size="sm" weight="medium">{item.f}</text>
              <text color="secondary" size="xs">{item.d}</text>
            </box>
            <icon name="external-link" color="secondary" size="xs"/>
          </row>
        </pressable>
      {/each}
    </box>
  {:else}
    <box gap={2}>
      <row align="center" justify="between">
        <row gap={2} align="center"><icon name="file-code-2"/><text weight="medium" size="sm">{file}</text></row>
        <button color="secondary" variant="ghost" size="xs" onClick={()=>setStage("files")}><icon name="arrow-left" size="xs"/> 返回</button>
      </row>
      <box background="#171E2B" theme="dark" radius="md" padding={3} gap={1}>
        <text color="#8298B5" size="xs" preserveWhitespace>01  # {file}</text>
        <text color="#96BCFF" size="xs" preserveWhitespace>02  def run(data):</text>
        <text color="#D5E0F2" size="xs" preserveWhitespace>03      result = transform(data)</text>
        <text color="#D5E0F2" size="xs" preserveWhitespace>04      return result</text>
      </box>
      <text color="secondary" size="xs">这里只演示交互层级。真实工程台将打开所选择文件的实际代码。</text>
    </box>
  {/if}
</box>
```

</details>

这三个层级应该能够随时切换，而且返回时尽量保持原来的画布位置与文件选中状态。

### 工程台最重要的四条视觉规则

1. 默认只展示关键模块，模块内部文件数量通过小标签显示。
2. 点击模块才展开文件，不自动展开所有依赖。
3. 选中节点时只高亮直接相关的连线，其余连线淡化。
4. 代码内容与执行结果通过标签页或可调节面板切换，避免同时占据太多空间。

这样既有工程结构的可视化效果，又能保持实际开发中的可用性。

**Demo 展示重点：** 完整代码链路 → 点击模块 → 展开 Python 文件 → 点击文件查看代码 → 切换执行结果可视化。

---

# 七、五个 Bot 如何协同？

这一点会直接决定你的产品是“五个工具的集合”，还是一个真正完整的 AI 工作空间。

我建议通过**项目共享数据 + 轻量跨模块操作**实现协同。

## 1. 跨模块关系

| 来源 | 触发操作 | 目标模块 |
|---|---|---|
| 思维导图 | 收藏文献、保存研究路线 | 笔记 / 资料库 |
| 笔记 | 将研究想法转换为待办 | 目标 |
| 笔记 | 根据已有内容寻找研究方向 | 点子 |
| 目标 | 点击关联的实验任务 | 工程台 |
| 点子 | 收藏想法、创建待办草稿 | 笔记 / 目标 |
| 工程台 | 保存代码结果、图表与实验记录 | 笔记 |
| 工程台 | 用户确认任务完成 | 目标 |
| 工程台 | 根据实验结果提出新方向 | 点子 |

这里并不要求每一个 Bot 一直在后台运行。大部分操作可以由用户主动触发，有些内容可以在数据变化时更新。

## 2. 推荐的项目主页

除了五个模块，我建议你有一个 **Project Overview（项目总览）**。

这是你产品前端非常值得增加的一页，因为用户每次打开项目，不一定知道该从哪个 Bot 开始。

<details>
<summary>界面示意源码</summary>

```jsx
<box border radius="xl" padding={3} gap={3}>
  <row align="center" justify="between">
    <box gap={1}>
      <title size="lg">Project Overview</title>
      <text size="xs" color="secondary">Your research, all in one place.</text>
    </box>
    <icon name="ellipsis" color="secondary"/>
  </row>
  <grid columns={2} gap={2}>
    <grid-item>
      <box background="surface-secondary" radius="lg" padding={3} gap={2}>
        <row align="center" gap={2}><icon name="calendar-check"/><text weight="medium" size="sm">当前目标</text></row>
        <text color="secondary" size="xs">查看阶段进度与待办任务</text>
        <box background="#CBD4EA" height="6px" radius="full" clip>
          <box background="#6678CD" height="100%" width="60%" radius="full"/>
        </box>
      </box>
    </grid-item>
    <grid-item>
      <box background="surface-secondary" radius="lg" padding={3} gap={2}>
        <row align="center" gap={2}><icon name="notebook-pen"/><text weight="medium" size="sm">最近笔记</text></row>
        <text color="secondary" size="xs">继续整理近期研究内容</text>
        <icon name="file-text" color="secondary"/>
      </box>
    </grid-item>
    <grid-item>
      <box background="surface-secondary" radius="lg" padding={3} gap={2}>
        <row align="center" gap={2}><icon name="lightbulb"/><text weight="medium" size="sm">研究灵感</text></row>
        <text color="secondary" size="xs">查看值得关注的新思路</text>
        <icon name="sparkles" color="secondary"/>
      </box>
    </grid-item>
    <grid-item>
      <box background="surface-secondary" radius="lg" padding={3} gap={2}>
        <row align="center" gap={2}><icon name="blocks"/><text weight="medium" size="sm">最近工程</text></row>
        <text color="secondary" size="xs">继续代码任务或查看结果</text>
        <icon name="git-branch" color="secondary"/>
      </box>
    </grid-item>
  </grid>
  <box border radius="lg" padding={3} gap={2}>
    <text weight="medium" size="sm">项目活动</text>
    <row align="center" gap={2}><icon name="file-plus" size="sm" color="secondary"/><text size="xs">新增研究笔记</text></row>
    <row align="center" gap={2}><icon name="check-circle" size="sm" color="secondary"/><text size="xs">完成阶段任务</text></row>
    <row align="center" gap={2}><icon name="lightbulb" size="sm" color="secondary"/><text size="xs">收藏一条研究建议</text></row>
  </box>
</box>
```

</details>

<caption>项目总览布局示意，卡片和进度为示例内容。</caption>

这样主对话负责创建项目和协调工作，项目主页负责日常进入项目时的全局浏览，五个模块负责具体操作。

---

# 八、统一前端还需要注意的设计细节

有些设计看起来只是细节，但实际上非常影响整个产品是否精致。

<details>
<summary>界面示意源码</summary>

```jsx
<box gap={3}>
  <row align="start" gap={3}>
    <box background="surface-secondary" padding={2} radius="lg"><icon name="panel-right-close"/></box>
    <box flex="1" gap={1}>
      **1. 右侧 AI 面板默认可收起**

      笔记、目标和工程台不应该长期被 AI 对话框占据屏幕。AI 作为辅助能力，需要时再展开。
    </box>
  </row>
  <divider color="subtle"/>
  <row align="start" gap={3}>
    <box background="surface-secondary" padding={2} radius="lg"><icon name="mouse-pointer-click"/></box>
    <box flex="1" gap={1}>
      **2. AI 的建议与用户的内容要有清晰区别**

      例如 AI 生成的想法、推测的论文关系、计划草稿，使用独立的标签或轻量提示，不要伪装成已经确认的研究事实。
    </box>
  </row>
  <divider color="subtle"/>
  <row align="start" gap={3}>
    <box background="surface-secondary" padding={2} radius="lg"><icon name="panel-top"/></box>
    <box flex="1" gap={1}>
      **3. 每个模块都应该有一个视觉主体**

      思维导图的主体是图谱，笔记是编辑器，目标是日历，点子是建议卡片，工程台是代码关系画布。不要让所有页面都变成同一种卡片仪表盘。
    </box>
  </row>
  <divider color="subtle"/>
  <row align="start" gap={3}>
    <box background="surface-secondary" padding={2} radius="lg"><icon name="link-2"/></box>
    <box flex="1" gap={1}>
      **4. 跨模块跳转必须保留上下文**

      例如从点子进入笔记，应该直接定位相关笔记；从目标打开工程台，应该直接进入对应工程，而不是进入模块首页。
    </box>
  </row>
</box>
```

</details>

---

# 九、哪些功能优先开发？

你现在要做的是 Demo，因此没有必要一次性实现所有功能。

我建议分三层。

| 优先级 | 需要完成的内容 | 目的 |
|---|---|---|
| **P0：Demo 必须有** | 统一项目主页、五个模块的主要界面、基础数据保存、关键跨模块联动、工程台三级展开 | 跑通一套可展示的产品体验 |
| **P1：提升实际可用性** | 真实文献导入、笔记编辑、日历拖拽、研究建议生成、代码关系分析、Python 文件打开 | 让它不只是展示原型 |
| **P2：长期扩展** | 文献持续监测、复杂研究知识图谱、Agent 自主协作、更多编程语言、复杂工程可视化 | 形成更完整的产品能力 |

尤其是工程台，第一阶段建议先做 **Python 项目的静态依赖分析 + 功能模块分组 + 文件打开 + 运行结果展示**。复杂调用关系有时无法仅靠静态分析确定，因此不必一开始承诺能准确还原任何项目的完整执行图。

---

# 十、把这些功能放进最终 Demo

<details>
<summary>界面示意源码</summary>

```jsx
<box gap={2}>
  <row align="center" justify="between">
    <title size="lg">2 分 40 秒展示节奏</title>
    <text color="secondary" size="xs">160 秒</text>
  </row>
  {@body const segments=[{name:"开场与项目创建",s:20,c:"#7985AC"},{name:"思维导图",s:25,c:"#6678D2"},{name:"笔记",s:20,c:"#6E9DBA"},{name:"目标",s:20,c:"#66A28A"},{name:"点子",s:25,c:"#CA9A58"},{name:"工程台",s:35,c:"#8776BC"},{name:"闭环展示",s:15,c:"#5E9B80"}]}
  <box direction="row" height="26px" radius="md" clip gap="2px">
    {#each segments as s}
      <box background={s.c} flex={s.s} align="center" justify="center">
        {#if s.s>=25}<text color="#FFFFFF" size="3xs" weight="medium">{s.s}s</text>{/if}
      </box>
    {/each}
  </box>
  <box gap={2}>
    {#each segments as s,i}
      <row justify="between" align="center">
        <row align="center" gap={2}>
          <box background={s.c} width="9px" height="9px" radius="xs"/>
          <text size="sm">{i+1}. {s.name}</text>
        </row>
        <text color="secondary" size="xs" tabularNums>{s.s} 秒</text>
      </row>
    {/each}
  </box>
</box>
```

</details>

我建议最后保留这样的连贯操作：

**主对话创建项目 → 思维导图探索领域 → 收藏文献进入笔记 → 用户规划阶段任务 → 点子提供研究思路 → 工程台打开代码链路、查看 Python 文件及执行结果 → 结果保存至笔记，并关联到目标。**

这样有完整的产品故事，也不会让 Demo 变成五个互不相关的页面介绍。

## 最终产品定位

你可以把整个系统概括为：

**一个融合知识组织、研究构思、进度管理和可视化编程的 AI 工作空间。**

其中五个模块分别回答五个问题：

- **思维导图：** 这个领域有什么？
- **笔记：** 我已经知道什么、记录了什么？
- **目标：** 我接下来准备做什么、做到哪里了？
- **点子：** 还有哪些方向值得思考？
- **工程台：** 我的代码如何运作、不同文件有什么关系、实际产生了什么结果？

这五个问题共同构成产品逻辑。

**视觉上，每个模块有自己的核心交互；功能上，所有模块共享同一个项目。** 这应该成为后续设计、开发和 Demo 制作时最重要的两条原则。

---

If you want, I can:

- 设计Bot 5：Workbench的功能和界面细节
- 描述跨模块协同机制设计方案
- 规划Demo演示流程与重点场景
