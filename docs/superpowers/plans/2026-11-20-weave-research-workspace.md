# Weave Research Workspace Implementation Plan

**Goal:** Implement the shared design's five working Bot surfaces and the research loop inside Weave.

**Architecture:** Extend the existing native Web plugin and scoped project service. Reuse the project rails, resource IDs, Bot sessions and execution records. Keep each Bot's chosen paradigm and layout stable.

**Spec:** [Shared design and reference images](https://chatgpt.com/s/t_6b0040d758b08191946b0940a0f638ac), interpreted together with the user's five-Bot discussion and [project constraints](../../../AGENTS.md).

## Global constraints

- Preserve DSH runtime 0.2.2rc2, existing project data, permissions and model configuration.
- Keep AI drafts and hypotheses visibly distinct from confirmed records.
- Scope reads, writes, imports, references and runs to the current project.
- Keep the native shell, themes and shortcuts. Check desktop, narrow and scaled layouts.

## Vertical slices and acceptance

- [x] Goals foundation: persist separate planning dates, display the same records in month/week/day, board and timeline, and calculate progress from actual completion. Verify date changes and completion after reload, invalid dates, scope isolation, and a narrow zoomed window.
- [ ] Goals follow-through: stage milestones, project references and confirmation of AI-generated drafts.
- [ ] Notes: folder and tag organization, document editor and preview, attachments, origin, history, AI-assisted editing and backlinks. Verify uploading a real fixture and attaching it to a note without duplicating the resource.
- [ ] Mind map: accessible expandable research, paper and method nodes, source-qualified relationships, route summaries and literature chronology. Verify a paper can be located in the notes library after saving it.
- [ ] Ideas: source-backed cards, category and follow-up, saved/deferred state, requests for project-context suggestions, and user-confirmed task drafts.
- [ ] Engineering: project, module and file levels, source/import links and file preview; related runs, status, logs, metrics and artifacts. Verify against a real local Python fixture and label historic results as historic.
- [ ] Shared project: real-data overview, recent activity, contextual navigation and scoped references. Verify the complete path from a map source through plans and results to the next task in a disposable project.
- [ ] Record remaining P2 limits accurately. Verify on the pinned runtime without touching the user's real projects or publishing changes.
