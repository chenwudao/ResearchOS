# 科研 Agent 项目堆叠（按 ResearchOS 思路整理）

- Date: 2026-10-23
- 思路锚点：**人定大方向 → agent 拆小问题 → 每个问题强制「基础 + 前沿」文献 → claim 进 evidence-ledger**
- 对齐 P0 skills：`direction-framing` / `rq-decomposition` / `seed-paper-neighborhood` / `foundational-frontier-split` → `evidence-ledger`
- 标注：🟢 可偷（贴我们） / 🟡 可改编 / 🔴 核心 UX 勿抄（自动发论文闭环）

> 本表是「堆叠参考」，不是实现清单。链接以公开页/arXiv/GitHub 为准；未逐条复现实验。

---

## 0. 总览地图（怎么堆）

```
兴趣/约束
  → direction-framing          ← CoQuest / ResearchAgent(问题段) / Elicit clarifying
  → rq-decomposition           ← STORM 多视角提问 / PICO 式收窄
  → seed-paper-neighborhood    ← ResearchRabbit / Connected Papers / OpenAlex / S2
  → foundational-frontier-split← SurveyG 三层图 / Earlier-Later / Prior-Derivative
  → evidence-ledger            ← PaperQA / Scite / CiteME
  → (P1) compare / outline     ← Elicit tables / STORM outline-only
  ✕ 不进核心：AI Scientist 全自动写论文实验闭环
```

---

## A. 方向 / RQ 共创（对人引导）

| 项目 | 一句话 | 链接 | 对我们 |
|------|--------|------|--------|
| **CoQuest** | 人机共创研究问题；广度优先 vs 深度优先 | https://arxiv.org/abs/2310.06155 | 🟢 `direction-framing` / `rq-decomposition` |
| **ResearchAgent** | 种子论文 + Semantic Scholar 图 → 问题/方法/实验；Reviewer agents 迭代 | https://github.com/JinheonBaek/ResearchAgent · https://aclanthology.org/2025.naacl-long.342/ | 🟡 偷「种子锚定 + 独立评审」，勿把「自动出新 idea」当产品核心 |
| **Elicit Research Agent** | 先澄清问题再检索/抽取；可自定义 skills | https://support.elicit.com/en/articles/14756886-elicit-s-research-agent | 🟢 澄清问题 UX |
| **Consensus** | 用完整 RQ 搜证据快照 | https://consensus.app/ | 🟡 作 UI 提示，不作「投票即真理」 |
| **「Can LLMs Generate Novel Research Ideas?」** | 强调 LLM 出题可行性有限 | （见 Agent Lab 相关工作引用） | 🟢 支持「人定方向」原则 |

---

## B. 文献发现 / 引用图 / 基础↔前沿

| 项目 | 一句话 | 链接 | 对我们 |
|------|--------|------|--------|
| **ResearchRabbit** | 种子集合 → Similar / Earlier / Later | https://www.researchrabbit.ai/ | 🟢 双轨时间轴 |
| **Connected Papers** | 单种子相似图；Prior / Derivative | https://www.connectedpapers.com/ | 🟢 `seed-paper-neighborhood` |
| **Litmaps** | 种子地图 + Monitor | https://www.litmaps.com/ | 🟢 前沿监测（P1 Radar） |
| **Semantic Scholar** + Recommendations API | 学术图 / 推荐 / Reader | https://www.semanticscholar.org/ · https://www.semanticscholar.org/product/api | 🟢 检索后端 |
| **OpenAlex** | 开放学术图谱 API | https://docs.openalex.org/ | 🟢 可复现检索 |
| **Google Scholar** Related / Cited by | 人工链式扩展 | https://scholar.google.com/ | 🟡 无官方开放 API |
| **SurveyG** | 综述生成里用 Foundation / Dev / Frontier 三层引用图 | 见 awesome-ai-auto-research 条目 | 🟢 直接贴 `foundational-frontier-split` |
| **OpenResearcher** | RAG + 图遍历文献探索 | EMNLP’24（见汇总表） | 🟡 |
| **PaSa** | 多步迭代 agentic 检索 | arXiv’25 | 🟡 |
| **LitSearch** | 复杂文献检索基准（ML/NLP） | arXiv’24 | 🟡 评测用 |
| **LitLLM** | LLM + 学术库检索 | arXiv’24 | 🟡 |
| **ASReview** | 主动学习加速系统综述筛选 | Nature MI’21 | 🟡 筛选阶段 |

---

## C. Claim–证据 / 科学 QA（进 ledger）

| 项目 | 一句话 | 链接 | 对我们 |
|------|--------|------|--------|
| **PaperQA / PaperQA2** | 全文检索 → 证据 → 带出处回答 | https://arxiv.org/abs/2312.07559 · https://github.com/Future-House/paper-qa | 🟢 `evidence-ledger` |
| **OpenScholar** | 大规模文献 grounded 综合 | Nature’26 / 见汇总 | 🟢 |
| **Scite** Smart Citations | support / contradict / mention | https://scite.ai/ | 🟢 claim 立场 |
| **CiteME** | 主张归因基准 | arXiv’24 | 🟢 质检 |
| **Lune Research** | MCP：全文检索、引用遍历、claim 对原文核验 | 见 awesome-autoresearch | 🟡 |
| **ScienceAI** | 系统综述 / 抽取 / 复现 / 出处追踪 harness | https://github.com/eliaswestonfarber/scienceai/ | 🟡 |
| **Elicit** Extract / Systematic Review | 结构化抽取与纳排 | https://elicit.com/ | 🟢 表格与纳排门 |

---

## D. 综述 / 大纲 Agent（只要大纲，不要假论文）

| 项目 | 一句话 | 链接 | 对我们 |
|------|--------|------|--------|
| **STORM / Co-STORM** | 多视角提问 → 大纲 →（可选）长文；人可共研 | https://storm-project.stanford.edu/research/storm/ · https://arxiv.org/abs/2402.14207 · https://github.com/stanford-oval/storm | 🟢 大纲+提问；长文默认关闭 |
| **AutoSurvey** | 端到端综述草稿 | https://arxiv.org/abs/2406.10252 · https://github.com/AutoSurveys/AutoSurvey | 🟡 抄流水线，不信任终稿 |
| **SurveyForge / SurveyX / SurveyG / IterSurvey / InteractiveSurvey / LiRA / Citegeist / STRUCTSURVEY** | 2025–26 综述生成一族 | 见 https://worldbench.github.io/awesome-ai-auto-research | 🟡 P1 `survey-outline-assist` |
| **ChatPaper** | arXiv 摘要工具 | GitHub | 🟡 |
| **GPT Researcher** | 综合报告生成 | GitHub | 🟡 易空泛，需强制引用 |

---

## E. 端到端「自动科研」——核心 UX 慎用

| 项目 | 一句话 | 链接 | 对我们 |
|------|--------|------|--------|
| **The AI Scientist** (Sakana) | idea→代码→实验→论文→自动审稿循环 | https://sakana.ai/ai-scientist/ · https://arxiv.org/abs/2408.06292 | 🔴 勿作 ResearchOS 主路径 |
| **Agent Laboratory** | 人给 idea；文献→实验→报告；强调 co-pilot | https://agentlaboratory.github.io/ · https://arxiv.org/abs/2501.04227 | 🟡 偷「人是飞行员」；自主发论文非目标 |
| **InternAgent / NovelSeek** | 长程自主科学发现（多领域） | https://github.com/InternScience/InternAgent | 🔴 范围过大 |
| **Virtual Lab** | 多 LLM「科学家」+ 人高层次反馈（生物） | 见 Agent Lab related | 🔴/🟡 领域专用 |
| **ChemCrow / Coscientist** | 化学自主实验 | 相关工作 | 🔴 非我们课程场景 |
| **Agentic Science 综述** | AI for Science → 自主发现总览 | https://arxiv.org/abs/2508.14111 | 🟢 地图阅读 |
| **Agentic AI for Scientific Discovery 综述** | 含文献综述 agent 专章 | https://arxiv.org/html/2503.08979 | 🟢 |

---

## F. Deep Research / 报告型 Agent（可改编为「文献包」）

| 项目 | 一句话 | 链接 | 对我们 |
|------|--------|------|--------|
| **Tongyi DeepResearch** | 深度研究 agent | GitHub’25（汇总表） | 🟡 |
| **DeerFlow / DeepResearch-Agent / AutoAgent / O-Researcher** | 多 agent 深度研究 | 见 awesome-ai-auto-research | 🟡 |
| **CHIME** | 科学文献层级组织 | arXiv’24 | 🟡 |
| **SciSpace** Copilot / Agent | 读论文 / 多工具研究 | https://scispace.com/ | 🟡（站点抓取常 403） |

---

## G. 产品 UI 速查（对标体验）

| 产品 | 偷什么体验 |
|------|------------|
| Elicit | 问题澄清 → 报告/表格/系统综述流程 |
| Consensus | RQ 入口 + 证据卡片 |
| Scite | 引用立场色标 |
| ResearchRabbit / Litmaps | 种子→地图→监控 |
| Connected Papers | Prior vs Derivative 一键 |
| Semantic Reader | 文内引用阅读 |

---

## H. Awesome 清单（继续往下挖）

| 清单 | 链接 |
|------|------|
| **awesome-autoresearch** | https://github.com/AI4Scientist/awesome-autoresearch |
| **AI for Auto-Research roadmap**（大量方法表） | https://worldbench.github.io/awesome-ai-auto-research |
| **Agentic AI for Scientific Discovery survey** | https://arxiv.org/html/2503.08979 |
| **From AI for Science to Agentic Science** | https://arxiv.org/abs/2508.14111 |

---

## I. 建议我们怎么「堆」进 ResearchOS（落地顺序）

1. **现在：** 演示链只用 🟢：`direction-framing` → `rq-decomposition` → `seed-paper-neighborhood` → `foundational-frontier-split` → `evidence-ledger`
2. **后端：** OpenAlex + Semantic Scholar API；邻域标签抄 Connected Papers / ResearchRabbit 语义
3. **质检：** PaperQA 式 locator；Scite/CiteME 式「无出处进 gap」
4. **明确不堆进 MVP：** AI Scientist / InternAgent 全自动发现闭环

---

## J. 和现有文件的关系

- 技能规格：`docs/skill-survey-research-guidance.md`、`docs/skill-survey-direction-papers-20261023.md`
- 缺口：`docs/gap-audit-20261023.md`（rev2）
- 本文件：项目级「堆叠仓库」——后续可按桶继续追加行

*初版由检索 + awesome 表整理；后台还会补一版更全条目。*
