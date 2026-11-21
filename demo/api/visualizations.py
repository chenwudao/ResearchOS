"""Validated chart data for saved records and project file previews."""

import csv
from collections import deque
from functools import lru_cache
import io
import math

import workspace


MAX_POINTS = 1000
CHART_TYPES = ("line", "bar", "scatter")
CHART_SCHEMA = {
    "type": "array", "maxItems": 4,
    "items": {
        "type": "object", "required": ["title", "type", "xLabel", "yLabel", "points"],
        "properties": {
            "title": {"type": "string"}, "type": {"type": "string", "enum": list(CHART_TYPES)},
            "xLabel": {"type": "string"}, "yLabel": {"type": "string"},
            "points": {
                "type": "array", "minItems": 1, "maxItems": MAX_POINTS,
                "items": {"type": "object", "required": ["x", "y"], "properties": {
                    "x": {"type": ["number", "string"]}, "y": {"type": "number"},
                }},
            },
        },
    },
}


def numeric(value):
    return type(value) in (int, float) and -1e308 <= value <= 1e308


def validate(charts):
    if not isinstance(charts, list) or len(charts) > 4:
        raise workspace.WorkspaceError(400, "每条记录最多保存 4 张图表。")
    result = []
    for chart in charts:
        if not isinstance(chart, dict) or chart.get("type") not in CHART_TYPES:
            raise workspace.WorkspaceError(400, "请选择折线图、柱状图或散点图。")
        labels = {key: workspace.text(chart.get(key), 120) for key in ("title", "xLabel", "yLabel")}
        points = chart.get("points")
        if not all(labels.values()) or not isinstance(points, list) or not 1 <= len(points) <= MAX_POINTS:
            raise workspace.WorkspaceError(400, "图表需要标题、坐标轴名称及 1–1000 个数据点。")
        clean = []
        for point in points:
            x = point.get("x") if isinstance(point, dict) else None
            y = point.get("y") if isinstance(point, dict) else None
            if isinstance(x, str):
                x = workspace.text(x, 120)
            if not (numeric(x) or isinstance(x, str) and x) or not numeric(y):
                raise workspace.WorkspaceError(400, "图表横坐标需为数字或标签，纵坐标需为有限数值。")
            clean.append({"x": x, "y": y})
        if any(numeric(point["x"]) != numeric(clean[0]["x"]) for point in clean):
            raise workspace.WorkspaceError(400, "一张图表的横坐标须统一使用数值或标签。")
        result.append({**labels, "type": chart["type"], "points": clean})
    return result


def table_charts(text, suffix, truncated):
    if suffix not in (".csv", ".tsv"):
        return []
    if truncated:
        text = text.rpartition("\n")[0]
    reader = csv.reader(io.StringIO(text.lstrip("\ufeff")), delimiter="," if suffix == ".csv" else "\t", strict=True)
    try:
        headers = [workspace.text(name, 120) or f"第 {index + 1} 列" for index, name in enumerate(next(reader, [])[:32])]
        rows = []
        for row in reader:
            if len(rows) >= MAX_POINTS:
                break
            if row and any(cell.strip() for cell in row):
                rows.append(row)
    except csv.Error:
        if not truncated:
            return []
    return _table_charts(headers, rows)


@lru_cache(maxsize=8)
def _recent_table_charts(path, modified, size):
    rows = deque(maxlen=MAX_POINTS)
    count = 0
    delimiter = "," if path.suffix.lower() == ".csv" else "\t"
    with path.open(encoding="utf-8-sig", newline="") as file:
        reader = csv.reader(file, delimiter=delimiter, strict=True)
        headers = [workspace.text(name, 120) or f"第 {index + 1} 列"
                   for index, name in enumerate(next(reader, [])[:32])]
        try:
            for row in reader:
                if row and any(cell.strip() for cell in row):
                    rows.append(row[:32])
                    count += 1
        except csv.Error:
            pass
    return _table_charts(headers, list(rows), offset=count - len(rows))


def recent_table_charts(path):
    if path.suffix.lower() not in (".csv", ".tsv"):
        return []
    try:
        info = path.stat()
        return _recent_table_charts(path, info.st_mtime_ns, info.st_size)
    except (OSError, UnicodeError, csv.Error):
        return []


def _table_charts(headers, rows, offset=0):
    if not headers or not rows:
        return []

    def number(cell):
        try:
            value = float(cell)
            return value if math.isfinite(value) and numeric(value) else None
        except ValueError:
            return None

    columns = [[number(row[index]) if index < len(row) else None for row in rows]
               for index in range(len(headers))]
    first = columns[0]
    first_labels = [workspace.text(row[0], 120) for row in rows]
    index_column = len(headers) > 1 and (headers[0].lower() in {
        "step", "epoch", "iteration", "time", "timestamp", "date", "x", "步骤", "轮次", "时间", "日期",
    } or all(first_labels) and all(value is None for value in first))
    numeric_axis = index_column and all(value is not None for value in first)
    label_axis = index_column and not numeric_axis and all(first_labels) and all(value is None for value in first)
    x_values = first if numeric_axis else first_labels if label_axis else list(range(offset + 1, offset + len(rows) + 1))
    x_label = headers[0] if numeric_axis or label_axis else "数据行"
    return [
        {"title": label, "type": "line", "xLabel": x_label, "yLabel": label,
         "points": [{"x": x, "y": y} for x, y in zip(x_values, values) if y is not None]}
        for index, (label, values) in enumerate(zip(headers, columns))
        if not (index == 0 and (numeric_axis or label_axis))
        and any(value is not None for value in values)
        and all(value is not None or index >= len(row) or not row[index].strip()
                for row, value in zip(rows, values))
    ]
