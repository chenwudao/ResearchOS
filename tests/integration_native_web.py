"""Exercise the installed DSH Web, including a restart, against disposable data."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from pypdf import PdfWriter

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "demo/api"))
import native_launcher as launcher
import research_mcp


def _mcp(scope, name, arguments):
    res = research_mcp.dispatch(
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": arguments}},
        scope,
    )["result"]
    assert not res.get("isError"), f"MCP {name} failed: {res}"
    return json.loads(res["content"][0]["text"])


def main():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--model", action="store_true", help="Also send a synthetic project tool request to DeepSeek")
    mode.add_argument("--rightbar-only", action="store_true", help="Check the project chat tool panels without a model")
    mode.add_argument("--workflow-draft-only", action="store_true", help="Check the authenticated draft flow without a model")
    args = parser.parse_args()
    previous = launcher.workspace.DATA
    try:
        with TemporaryDirectory(prefix="labweave-native-e2e-") as tmp:
            root = Path(tmp)
            launcher.workspace.DATA = root / "data"
            pdf = PdfWriter()
            for _ in range(2):
                pdf.add_blank_page(width=400, height=600)
            pdf.write(root / "fixture.pdf")
            with launcher.native_services(0, home=root / "home", configured=args.model, background=False) as (url, _):
                phase = "workflow-draft" if args.workflow_draft_only else "rightbar" if args.rightbar_only else "initial"
                subprocess.run(["node", str(ROOT / "tests/integration_native_web.cjs"), phase, str(root),
                                "model" if args.model else "offline", sys.executable], input=url, text=True, check=True, timeout=300)
            if args.rightbar_only or args.workflow_draft_only:
                return
            # Apply MCP feature lifecycle (create, push, rename, delete) to Research Alpha before restart.
            proof = json.loads((root / "session-proof.json").read_text(encoding="utf-8"))
            alpha_scope = proof["projectA"]
            created = _mcp(alpha_scope, "feature_create", {"label": "实验周报", "hint": "按周汇总实验进展，关键实验对比附可视化图表"})["feature"]
            _mcp(alpha_scope, "feature_push", {"featureId": created["id"], "text": "本周实验进展汇总", "category": "push"})
            chart_svg = (
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 300">'
                '<rect width="640" height="300" rx="16" fill="#f8fafc"/>'
                '<text x="36" y="42" fill="#0f172a" font-size="20" font-weight="600">Ablation Validation Accuracy (%)</text>'
                '<text x="36" y="66" fill="#64748b" font-size="13">3-seed mean across baseline vs reweighted objective</text>'
                '<line x1="64" y1="244" x2="600" y2="244" stroke="#cbd5e1" stroke-width="1.5"/>'
                '<rect x="110" y="136" width="96" height="108" rx="8" fill="#94a3b8"/>'
                '<text x="158" y="124" text-anchor="middle" fill="#334155" font-size="14" font-weight="600">78.4%</text>'
                '<text x="158" y="268" text-anchor="middle" fill="#475569" font-size="13">Baseline</text>'
                '<rect x="272" y="108" width="96" height="136" rx="8" fill="#38bdf8"/>'
                '<text x="320" y="96" text-anchor="middle" fill="#0369a1" font-size="14" font-weight="600">81.1%</text>'
                '<text x="320" y="268" text-anchor="middle" fill="#475569" font-size="13">+Align</text>'
                '<rect x="434" y="84" width="96" height="160" rx="8" fill="#0284c7"/>'
                '<text x="482" y="72" text-anchor="middle" fill="#0c4a6e" font-size="14" font-weight="600">84.6%</text>'
                '<text x="482" y="268" text-anchor="middle" fill="#0f172a" font-size="13" font-weight="600">+Reweight</text>'
                '</svg>'
            )
            _mcp(alpha_scope, "feature_push", {
                "featureId": created["id"],
                "title": "消融实验对比图：Reweight 带来稳定增益",
                "text": "在 3 组随机种子下，+Reweight 方案将验证集准确率由 78.4% 提升至 84.6%，同时收敛波动降低 31%。",
                "caption": "Baseline、+Align 与 +Reweight 验证准确率对比图",
                "imageSvg": chart_svg,
                "category": "push",
            })
            _mcp(alpha_scope, "rename_feature", {"featureId": created["id"], "label": "组会速递"})
            temp_feat = _mcp(alpha_scope, "feature_create", {"label": "临时栏目"})["feature"]
            _mcp(alpha_scope, "feature_delete", {"featureId": temp_feat["id"]})
            with launcher.native_services(0, home=root / "home", configured=args.model, background=False) as (url, _):
                subprocess.run(["node", str(ROOT / "tests/integration_native_web.cjs"), "restart", str(root),
                                "model" if args.model else "offline"], input=url, text=True, check=True, timeout=300)
    finally:
        launcher.workspace.DATA = previous


if __name__ == "__main__":
    main()
