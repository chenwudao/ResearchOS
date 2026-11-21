"""Read the same bundled core Skill files used by the native Web host."""

from pathlib import Path


DIRECTORY = Path(__file__).resolve().parents[2] / "plugins" / "dsh-labweave-workspace" / "research-skills"
WORKFLOWS = DIRECTORY.parents[2] / "skills"
PARADIGMS = frozenset(("goals", "notes", "mindmap", "ideas", "engineering"))


def core(bot):
    paradigm = (bot.get("extension") or {}).get("base") or bot.get("paradigm")
    if paradigm not in PARADIGMS:
        return ""
    return (DIRECTORY / paradigm / "SKILL.md").read_text(encoding="utf-8").strip()
