"""Real literature/code case; needs network, Git and a configured model key.
Artifacts remain in demo/.local/acceptance/<run>/ for inspection.
No model training or paper reproduction is claimed by this smoke experiment.
"""
import base64
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.request import urlopen
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "demo/api"))
import workspace, tasks, project_service, research_records


def wait(identity):
    deadline = time.monotonic() + 300
    while time.monotonic() < deadline:
        value = tasks.get(identity)
        if value["status"] == "WAITING_APPROVAL" and value.get("pending"):
            pending = value["pending"]
            if pending["kind"] != "approval":
                tasks.cancel({"id": identity})
                raise AssertionError("Unexpected clarification question")
            tasks.respond({"id": identity, "answer": {"outcome": "allowed-once"}})
        if value["status"] in tasks.TERMINAL:
            assert value["status"] == "SUCCEEDED", value.get("error")
            return value
        time.sleep(.5)
    tasks.cancel({"id": identity})
    raise AssertionError("Research case timeout")


def main():
    os.environ["DEEPSEEK_API_KEY"] = workspace.deepseek_key()
    workspace.DATA = ROOT / "demo/.local/acceptance" / uuid4().hex
    workspace.save({"revision": 0, "settings": {}, "state": {
        "version": 2, "mainThread": {"id": "main", "messages": []}, "projects": []}})
    project = project_service.call("project_create", {"name": "Transformer 与 LoRA 参数效率研究"}, "global")
    identity = project["id"]
    project_service.call("project_update", {"description": "分析 Transformer 结构和 LoRA 低秩适配；先完成文献与参数量基线，不进行 GPU 训练。"}, identity)
    papers = []
    cache = ROOT / "demo/.local/paper-cache"
    cache.mkdir(parents=True, exist_ok=True)
    for arxiv, title in (("1706.03762", "Attention Is All You Need"), ("2106.09685", "LoRA")):
        path = cache / (arxiv + ".pdf")
        if not path.exists():
            with urlopen("https://arxiv.org/pdf/" + arxiv, timeout=60) as response:
                path.write_bytes(response.read())
        paper = project_service.upload({"projectId": identity, "name": title+".pdf",
                                        "data": base64.b64encode(path.read_bytes()).decode()})
        assert len(project_service.read_resource(identity, paper["id"])["text"]) > 100
        papers.append(paper)
    print("Two real PDFs imported and read", flush=True)
    repository = project_service.clone({"projectId": identity, "url": "https://github.com/microsoft/LoRA"})
    print("Official LoRA repository cloned", flush=True)
    environment = workspace.create_experiment({"projectId": identity})
    prompt = (
        "完成一次真实的文献与代码分析验收。调用 paper_read 读取下面两篇论文的第一页"
        "（只将结论归因于实际读取页码；不要编造全文实验结论），比较 Transformer 与 LoRA 的研究问题和方法。"
        "使用本机工具读取导入仓库 README.md 和 loralib/layers.py，定位低秩矩阵实现。"
        "创建 outputs，运行一个纯 Python 参数量实验：d=512、r=8，对比方阵完整参数量 d*d 与两个低秩因子 2*d*r，"
        "将真实执行的数值保存 outputs/metrics.json，将论文与代码分析及证据来源保存 outputs/comparison.md。"
        "这是参数量核算，不是模型训练或论文复现，必须在报告中说明。"
        "调用 experiment_record 记录运行参数、metrics、completed 状态和执行日志；"
        "调用 idea_create 写入一个后续研究问题，再调用 goal_create 建立下一步验证目标；"
        "最后调用 memory_write 保存研究决策。必须实际调用工具并写出文件。"
        "\n论文资源："+json.dumps([{"id": p["id"], "title": p["text"]} for p in papers], ensure_ascii=False)+
        "\n仓库相对路径："+repository["path"]+"\n可用实验 Python："+environment["python"])
    task = tasks.create({"projectId": identity, "prompt": prompt})
    tasks.approve({"id": task["id"]})
    result = wait(task["id"])
    root = project_service.folder(identity)
    assert (root / "outputs/comparison.md").is_file()
    metrics = json.loads((root / "outputs/metrics.json").read_text(encoding="utf-8"))
    assert "262144" in json.dumps(metrics) and "8192" in json.dumps(metrics), metrics
    saved = project_service.project(workspace.snapshot(), identity)
    assert saved["rails"]["ideas"] and saved["rails"]["goals"]
    assert any(entry.get("kind") == "output" for entry in saved["rails"]["library"])
    assert research_records.records(identity, "experiment")
    assert project_service.memory_list(identity)
    goal = saved["rails"]["goals"][0]
    next_task = tasks.create({"projectId": identity, "goalId": goal["id"], "resume": task["id"],
                             "prompt": "不要运行工具。仅根据上轮真实实验重复完整矩阵参数量和低秩因子参数量。"})
    tasks.approve({"id": next_task["id"]})
    resumed = wait(next_task["id"])
    assert "262" in resumed["result"] and "8192" in resumed["result"].replace(",", "").replace("，", ""), resumed["result"]
    evaluation = tasks.create({"projectId": identity, "prompt":
        "使用 task_get 阅读任务 "+task["id"]+" 的要求、结果和事件。查看 outputs 文件并使用 experiment_list 检查日志。"
        "用 benchmark_record 为原任务记录 completeness、correctness、evidence、reproducibility 各 0–5 分；"
        "rationale 写具体证据和局限，evaluator=DSH。注意这是参数量核算而不是实际训练复现。"})
    tasks.approve({"id": evaluation["id"]})
    wait(evaluation["id"])
    assert research_records.records(identity, "benchmark")
    report = {"project": identity, "data": str(workspace.DATA), "task": task["id"],
              "papers": [p["id"] for p in papers], "metrics": metrics,
              "checks": ["real PDFs", "official Git repository", "native tools", "venv execution",
                         "artifact registration", "ideas and goals", "persistent memory",
                         "session resume", "experiment tracking", "evidence-backed benchmark"]}
    (workspace.DATA / "acceptance.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=True, indent=2), flush=True)


if __name__ == "__main__":
    main()
