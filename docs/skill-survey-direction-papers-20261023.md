# Skill 调研备忘：方向引导 × 基础/前沿论文

- Date: 2026-10-23
- Trigger: 用户强调「灵活实用科研」= 引导出明确大方向与小问题 + 该方向上最基础与最前沿的论文工作
- Purpose: 给后续 ResearchOS skill / 模块设计当参考，不是最终规格

## 1. 用户思想 → 能力拆解

| 用户要的 | 可落地的 skill 能力 | 质检（防瞎编） |
|----------|---------------------|----------------|
| 引导出**大方向** | 从兴趣/约束/现有工作，产出 2–4 条候选方向 + 取舍理由 | 每条方向必须挂 ≥1 条「领域锚点」文献或关键词簇 |
| 拆成**小问题** | 每个方向 → 3–7 个可回答的 RQ（可测、有边界） | RQ 用「对象 × 变量 × 判据」模板；过宽则强制收窄 |
| **最基础**论文 | 高被引 / 综述 / 方法奠基 / 教材级引用核 | 用引用图向内（cited-by 少、被引高、时间早或综述） |
| **最前沿**论文 | 近 1–2 年顶会/预印本、活跃作者线、开放问题 | 用时间窗 + 引用加速度 / arXiv 新作 + 与 RQ 相关度 |
| 灵活实用 | 人在环：选方向、改 RQ、增减纳入标准；可暂停续跑 | 全程写入 project memory + evidence ledger |

## 2. 对标系统 / skill（同类想法）

### A. 问题共创（大方向 → 小问题）

| 参考 | 要点 | 对我们的启发 |
|------|------|--------------|
| [CoQuest](https://arxiv.org/html/2310.06155) | LLM agent 共创 RQ；ReAct；动作含文献发现、假设、收窄、对照已有工作；breadth-first vs depth-first | 单独做 `research-question-cocreate`：先铺开方向再深挖一条；延迟/批次生成反而利于人反思 |
| [ResearchAgent](https://aclanthology.org/2025.naacl-long.342/) (NAACL 2025) | 从核心论文 + 学术图 + 概念实体生成问题/方法/实验；ReviewingAgents 迭代批改 | 「先锚一篇种子论文」比空聊方向更稳；质检用独立 review skill，不要同一模型又写又判 |

### B. 文献两阶段 / 系统综述式 skill

| 参考 | 要点 | 对我们的启发 |
|------|------|--------------|
| [ai-skill-scholar · literature-review](https://github.com/dsebastien/ai-skill-scholar/blob/main/skills/literature-review/SKILL.md) | init → search → screen → fetch → read → synth；会话可暂停；宽网后人工式筛选 | 状态机 + 持久目录；**问题模糊先逼问再 search** |
| [awesome-ai-agent-skills · literature-review](https://github.com/h4vzz/awesome-ai-agent-skills/blob/main/research-and-knowledge/literature-review/SKILL.md) | PICO/范围、检索式、纳排标准、PRISMA 流、主题综合 | 把「基础 vs 前沿」写成两条并行纳入标准，而不是事后贴标签 |
| STORM 式多 persona 综述 skill | 3–5 专家视角轮询检索再综合；强制引用 | 适合「大方向地图」；persona 可固定为：理论奠基 / 系统实现 / 评测与可复现 / 应用场景 |

### C. 基础核 × 前沿沿（引用图思路）

| 做法 | 说明 |
|------|------|
| Citation-inward（基础） | 从候选集取高被引、被多篇前沿共同引用的「共同祖先」；优先 survey / seminal |
| Citation-outward / 时间窗（前沿） | 近 N 年、同 venue 簇、或从基础核向外的高相关新边 |
| 双清单输出 | 每个小问题固定产出：`foundational[]` + `frontier[]` + `bridge[]`（连接二者的近期工作） |
| 工具侧 | OpenAlex / Semantic Scholar / arXiv；图谱类产品思路（Connected Papers 等）可做成 skill 步骤而非必须嵌同一 UI |

### D. 证据与防幻觉（和我们已有 skill 对齐）

| 参考 | 对齐 |
|------|------|
| PaperQA2 类「引用必有出处」 | 接到现有 `evidence-ledger`：每条 claim → source + locator |
| AI4Research / agentic science surveys | 强调 retrieval-grounded + human-in-the-loop；不要一上来做全自动 AI Scientist |
| 开题里的 skill 质检栏 | 每个新 skill 仍要 INPUT / OUTPUT / QUALITY CHECK |

## 3. 建议新增的 ResearchOS skills（草案名）

按用户优先级，建议 **P0 三条主链**，其余后置：

1. **`direction-frame`**（大方向引导）  
   - In: 兴趣一句话、约束（时间/设备/数据）、可选种子论文  
   - Out: 2–4 方向卡片（一句话目标、为何现在做、风险、依赖数据）  
   - QC: 每方向有关键词簇 + ≥1 锚点文献；用户必须点选 1 个才能继续  

2. **`rq-decompose`**（小问题拆解，对齐 CoQuest）  
   - In: 已选方向 + 约束  
   - Out: RQ 表（id / 问题 / 可检验判据 / 依赖 / 优先级）  
   - QC: 禁止纯「研究一下 X」；过宽自动给收窄选项（breadth 一批 / depth 一条）  

3. **`foundational-frontier-brief`**（基础+前沿双清单，核心差异化）  
   - In: 一个 RQ + 时间窗 + 纳排标准  
   - Out: 两表 + 短综合：基础核 / 前沿沿 / 二者之间的 gap；每篇：贡献一句话、与 RQ 关系、locator  
   - QC: 基础与前沿集合交集为空或极小；每篇能打开到 DOI/arXiv；claim 进 `evidence-ledger`  

4. （P1）`lit-screen-synth` — 两阶段综述（scholar skill 那套状态机）  
5. （P1）`idea-critique` — ResearchAgent 式独立评审，专批「问题是否真新、是否可做」  
6. （P2）`pilot-package` — 把开题五件套（brief / compare / ledger / plan / roadmap）串成一次按钮  

## 4. 和当前仓库的关系

| 已有 | 怎么接 |
|------|--------|
| `project-gap-audit` | 把本节 P0 skills 写进下一版 backlog |
| `evidence-ledger` | 双清单里的 claim 一律落 ledger（jaden 正在接 sample 路由） |
| `pilot-eval-design` | 评测题就用「同一 RQ：有无 direction+双清单 skill」三臂对比 |
| `module-spec` / Radar | `foundational-frontier-brief` 可视为 Research Radar 的 v0 切片 |
| 五模块大而全 | **先不要**；先打通「方向 → RQ → 基础/前沿表 → ledger」一条演示链 |

## 5. 设计原则（写进项目共识）

1. **引导，不替用户定题**：agent 出选项与证据，人锁定方向与 RQ。  
2. **基础与前沿必须分栏**：混成「相关论文 20 篇」不算完成。  
3. **先检索再综合**：无 locator 的句子进 gap，不进结论。  
4. **状态可恢复**：每次会话落 `docs/` 或 `demo/output/`，对齐开题的 project memory。  
5. **范围克制**：对标 CoQuest / ResearchAgent / 两阶段 lit-review，而不是端到端 AI Scientist。

## 6. 建议你拍板的点

- P0 是否就定这三条：`direction-frame` / `rq-decompose` / `foundational-frontier-brief`？  
- 「基础」操作定义：更偏高被引核，还是更偏「必读综述 + 方法源头」？  
- 种子输入：是否强制「至少一篇你已读过的论文」再开方向？（ResearchAgent 路径更稳）

> **Naming lock (2026-10-23):** canonical ids are jaden’s `direction-framing` / `question-decomposition` / `foundations-frontier-pack` (see gap-audit §8). Draft names in §3 above are aliases only.
