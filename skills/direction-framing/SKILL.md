---
name: direction-framing
description: >-
  From a vague interest and constraints, propose 2–4 BIG research direction
  cards for the human to pick or merge. Guidance only — does not decide the topic.
---

# Direction framing

Use when the user has an interest area but no locked research agenda, or when
`project-gap-audit` shows missing goal clarity.

## Defaults (ResearchOS)

- **Seed paper:** optional. If the user pastes a DOI/title, anchor cards to that
  neighborhood; otherwise cold-start from interest + constraints. Never block
  on a seed.
- **Human in the loop:** agent proposes; human must select/merge before
  `rq-decomposition`.

## Input

- Raw interest / course brief / lab context
- Constraints: time, compute, data access, teammates
- Optional: seed paper (DOI/title/PDF), prior gap-audit packet

## Output

2–4 **direction cards**, each with:

1. One-sentence direction statement
2. Why it matters now (1–2 lines)
3. Non-goals (what we will not do)
4. Rough success criteria
5. Suggested next skill: `rq-decomposition`

Also emit a short **decision prompt** for the human (pick A/B/C or merge).

## Steps

1. Extract constraints; refuse empty “do AI research” without a domain hook.
2. If seed present, note its subfield; else cluster interest into candidate agendas.
3. Draft 2–4 cards with explicit non-goals.
4. Ask human to pick/merge; write choice into project memory / run-log when available.

## Quality check

- [ ] Each card is restatable in 30 seconds by a peer
- [ ] Non-goals non-empty
- [ ] No fabricated citations (anchors may be keywords or real DOIs only)
- [ ] Human selection recorded before downstream skills run

## Acceptance tests

| ID | Scenario | Expected |
|----|----------|----------|
| DF-1 | Interest only, no seed | ≥2 cards; cold-start allowed |
| DF-2 | Seed DOI given | Cards reference that subfield; still offer alternatives |
| DF-3 | User picks card B | Run-log notes selection; unlocks `rq-decomposition` |
