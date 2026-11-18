"""Persistent display names for the assistant and research feature slots.

The five feature IDs are stable even if their display names change. Feature
renames are intended to be invoked only from the authenticated conversation
tool dispatcher. The dispatcher must derive ``caller_scope`` from its own
fixed session scope, never from tool arguments or an HTTP request body. A scope
string is not a credential and this module alone is not an authorization layer.
"""

from contextlib import closing
from datetime import datetime, timezone
import re

import workspace


DEFAULT_ASSISTANT_NAME = "goat"
DEFAULT_FEATURE_LABELS = {
    "chat": "聊天",
    "feed": "动态",
    "ideas": "点子",
    "goals": "目标",
    "library": "资源库",
}
_PROJECT_ID = re.compile(r"proj_[A-Za-z0-9_-]{1,120}")


def _valid_name(value):
    if not isinstance(value, str):
        raise workspace.WorkspaceError(400, "名称必须是文字。")
    if any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise workspace.WorkspaceError(400, "名称须为 1 至 80 个字符，且不能包含控制字符。")
    value = value.strip()
    if not value or len(value) > 80:
        raise workspace.WorkspaceError(400, "名称须为 1 至 80 个字符，且不能包含控制字符。")
    return value


class NamingStore:
    def __init__(self, connection_factory=None):
        self._connect = connection_factory or workspace.database

    @staticmethod
    def _schema(db):
        db.execute("""CREATE TABLE IF NOT EXISTS labweave_names (
            name_key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )""")
        db.execute("""CREATE TABLE IF NOT EXISTS labweave_feature_labels (
            scope TEXT NOT NULL,
            feature_id TEXT NOT NULL,
            label TEXT NOT NULL,
            PRIMARY KEY (scope, feature_id)
        )""")
        db.execute("""CREATE TABLE IF NOT EXISTS labweave_feature_label_audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            at TEXT NOT NULL,
            caller_scope TEXT NOT NULL,
            target_scope TEXT NOT NULL,
            feature_id TEXT NOT NULL,
            previous_label TEXT NOT NULL,
            label TEXT NOT NULL
        )""")

    @staticmethod
    def _project_exists(db, project_id):
        if not isinstance(project_id, str) or not _PROJECT_ID.fullmatch(project_id):
            raise workspace.WorkspaceError(400, "无效项目标识。")
        if not db.execute("SELECT 1 FROM projects WHERE id=?", (project_id,)).fetchone():
            raise workspace.WorkspaceError(404, "项目不存在。")

    @classmethod
    def _target(cls, db, caller_scope, project_id):
        if caller_scope == "global":
            if project_id is None:
                return "global"
            cls._project_exists(db, project_id)
            return project_id
        cls._project_exists(db, caller_scope)
        if project_id is not None and project_id != caller_scope:
            raise workspace.WorkspaceError(403, "不能修改其他项目或全局功能名称。")
        return caller_scope

    def assistant_name(self):
        with closing(self._connect()) as db, db:
            self._schema(db)
            row = db.execute("SELECT value FROM labweave_names WHERE name_key='assistant'").fetchone()
            return row[0] if row else DEFAULT_ASSISTANT_NAME

    def rename_assistant(self, name):
        name = _valid_name(name)
        with closing(self._connect()) as db, db:
            self._schema(db)
            db.execute("INSERT OR REPLACE INTO labweave_names(name_key,value) VALUES('assistant',?)", (name,))
        return name

    def feature_labels(self, caller_scope, project_id=None):
        with closing(self._connect()) as db, db:
            self._schema(db)
            target = self._target(db, caller_scope, project_id)
            labels = dict(DEFAULT_FEATURE_LABELS)
            for feature_id, label in db.execute(
                "SELECT feature_id,label FROM labweave_feature_labels WHERE scope='global'"
            ):
                if feature_id in labels:
                    labels[feature_id] = label
            if target != "global":
                for feature_id, label in db.execute(
                    "SELECT feature_id,label FROM labweave_feature_labels WHERE scope=?", (target,)
                ):
                    if feature_id in labels:
                        labels[feature_id] = label
            return labels

    def rename_feature_from_conversation(self, caller_scope, feature_id, label, project_id=None):
        """Rename through a trusted conversation dispatcher, never a generic UI endpoint."""
        if not isinstance(feature_id, str) or feature_id not in DEFAULT_FEATURE_LABELS:
            raise workspace.WorkspaceError(400, "未知功能标识。")
        label = _valid_name(label)
        with closing(self._connect()) as db, db:
            self._schema(db)
            db.execute("BEGIN IMMEDIATE")
            target = self._target(db, caller_scope, project_id)
            old = db.execute("SELECT label FROM labweave_feature_labels WHERE scope=? AND feature_id=?",
                             (target, feature_id)).fetchone()
            if old is None and target != "global":
                old = db.execute("SELECT label FROM labweave_feature_labels WHERE scope='global' AND feature_id=?",
                                 (feature_id,)).fetchone()
            previous = old[0] if old else DEFAULT_FEATURE_LABELS[feature_id]
            db.execute("INSERT OR REPLACE INTO labweave_feature_labels(scope,feature_id,label) VALUES(?,?,?)",
                       (target, feature_id, label))
            db.execute("""INSERT INTO labweave_feature_label_audit
                (at,caller_scope,target_scope,feature_id,previous_label,label) VALUES(?,?,?,?,?,?)""",
                       (datetime.now(timezone.utc).isoformat(), caller_scope, target, feature_id, previous, label))
        return {"scope": target, "featureId": feature_id, "label": label}
