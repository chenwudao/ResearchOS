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
- [x] Goals decisions: persist milestones and separate suggestions from confirmed dates and progress. Verify the user can accept or discard actual tool-written drafts in the pinned Web client.
- [x] Scoped record references: link a note to a calendar item, navigate to the exact record in either direction, and remove the link without deleting either record. Verify foreign references are rejected.
- [x] Notes workspace: folders, tags, document editor and preview, origin, revision history, attachments and backlinks. The browser integration attaches one CSV to two notes and checks that storage has one original.
- [x] Notes AI editing: compare and accept or dismiss an assistant proposal. Verify user-controlled text, history authorship, and rejection of a proposal against an obsolete revision.
- [x] Mind map: expandable research routes, paper and method nodes, sourced and unverified relationships, route summaries and literature chronology. Verified in the pinned browser workflow, including author edits and round-trip navigation between a paper and its captured note at narrow viewport and 115% zoom.
- [x] Ideas: source-backed cards, three suggestion categories, saved/deferred feedback, requests for project-context suggestions, and user-confirmed task drafts. Verified real scoped tool records, round-trip links from ideas to their draft, and explicit acceptance.
- [x] Engineering: project, module and file levels, static Python imports, source preview with line highlights, historical status, logs, metrics, and artifacts. The disposable project runs a Python fixture and checks the resulting CSV and rotatable OBJ preview before saving its actual results to a notebook.
- [x] Shared project: project overview with real counts, progress, recent records and direct links. The pinned runtime test exercises map → paper capture → project note → idea → accepted goal → actual Python fixture → result note → related goal, including dark theme and narrow window at 115% zoom.
- [x] Record remaining P2 limits. Continuous literature monitoring, a multi-language call graph, and richer 3D formats are follow-on work. The Workbench indexes Python without executing it, resolves static imports where the selected root identifies a unique file, and previews small OBJ geometry. Model-assisted suggestions and live runs use the existing project session and model configuration. Tests use scoped tool records and offline fixtures.

## Verification

- `tests/test_feature_bots.py` validates scoped storage and cross-project rejection, including Python imports in a linked source directory.
- `tests/integration_goal_planner.py` exercises the integrated research workflow in a disposable browser and project, with no model calls.
- `tests/integration_native_web.py --rightbar-only` checks the existing project chat and tools independently.
