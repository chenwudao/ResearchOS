"""Explicit, opt-in bindings between LabWeave projects and DSH workspaces.

This module is not wired into the running application.  Callers must supply a
private SQLite path and trusted lookups of both current project existence and
the current DSH workspace path.  In particular, browser-supplied paths are not
an authority for project scope.  This mapping is not itself authentication or
authorization; callers must verify access and re-check at the point of use.
No project directory is created or removed.
"""

from contextlib import closing
import os
from pathlib import Path
import re
import sqlite3
from typing import Callable


class BindingError(ValueError):
    """The requested binding is invalid, conflicting, or no longer valid."""


class WorkspaceBindings:
    def __init__(
        self,
        db_path: Path,
        projects_root: Path,
        project_exists: Callable[[str], bool],
        workspace_path: Callable[[str, str], str | Path | None],
        global_root: Path | None = None,
    ):
        self.db_path = Path(db_path)
        self.projects_root = Path(projects_root)
        self.project_exists = project_exists
        self.workspace_path = workspace_path
        self.global_root = Path(global_root) if global_root is not None else None
        # The parent is intentionally not created: configuring this service is
        # an explicit operation, not a migration of the existing workspace.
        with closing(sqlite3.connect(self.db_path)) as db, db:
            db.execute("""CREATE TABLE IF NOT EXISTS dsh_workspace_bindings_v1 (
                profile TEXT NOT NULL,
                project_id TEXT NOT NULL,
                workspace_id TEXT NOT NULL,
                path_key TEXT NOT NULL,
                PRIMARY KEY (profile, project_id),
                UNIQUE (profile, workspace_id),
                UNIQUE (profile, path_key)
            )""")
            db.execute("""CREATE TABLE IF NOT EXISTS dsh_global_workspace_v1 (
                profile TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                path_key TEXT NOT NULL
            )""")

    @staticmethod
    def _identity(value: str, label: str) -> str:
        if (not isinstance(value, str) or not value or len(value) > 256
                or any(ord(char) < 32 or ord(char) == 127 for char in value)):
            raise BindingError(f"Invalid {label}")
        return value

    def _path_key(self, profile: str, project_id: str, workspace_id: str) -> str:
        self._identity(profile, "profile")
        self._identity(workspace_id, "workspace ID")
        if (not isinstance(project_id, str)
                or not re.fullmatch(r"proj_[A-Za-z0-9_-]{1,120}", project_id)):
            raise BindingError("Invalid project ID")
        if not self.project_exists(project_id):
            raise BindingError("Project does not exist")

        try:
            root = self.projects_root.resolve(strict=True)
            candidate = root / project_id
            if candidate.is_symlink() or candidate.is_junction():
                raise BindingError("Project directory cannot be a link or junction")
            project_dir = candidate.resolve(strict=True)
            reported = self.workspace_path(profile, workspace_id)
            if reported is None:
                raise BindingError("DSH workspace does not exist")
            reported_path = Path(reported)
            if not reported_path.is_absolute():
                raise BindingError("DSH workspace directory must be absolute")
            dsh_dir = reported_path.resolve(strict=True)
        except (OSError, RuntimeError, ValueError) as exc:
            if isinstance(exc, BindingError):
                raise
            raise BindingError("Workspace directory is unavailable") from exc
        if (not root.is_dir() or not project_dir.is_dir() or not dsh_dir.is_dir()
                or not project_dir.is_relative_to(root) or project_dir == root):
            raise BindingError("Project directory is outside the project root")
        expected = os.path.normcase(str(project_dir))
        if (os.path.normcase(str(dsh_dir)) != expected
                or os.path.normcase(os.path.abspath(reported_path)) != expected):
            raise BindingError("DSH workspace does not match the project directory")
        return expected

    def bind(self, profile: str, project_id: str, workspace_id: str) -> None:
        """Create an idempotent binding, refusing implicit remaps or aliases."""
        path_key = self._path_key(profile, project_id, workspace_id)
        with closing(sqlite3.connect(self.db_path)) as db, db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute(
                "SELECT 1 FROM dsh_global_workspace_v1 WHERE profile=? AND workspace_id=?",
                (profile, workspace_id),
            ).fetchone():
                raise BindingError("Workspace is reserved for the global assistant")
            old = db.execute(
                "SELECT workspace_id, path_key FROM dsh_workspace_bindings_v1 "
                "WHERE profile=? AND project_id=?", (profile, project_id),
            ).fetchone()
            if old is not None:
                if old != (workspace_id, path_key):
                    raise BindingError("Project is already bound to another workspace")
                return
            try:
                db.execute(
                    "INSERT INTO dsh_workspace_bindings_v1 VALUES (?, ?, ?, ?)",
                    (profile, project_id, workspace_id, path_key),
                )
            except sqlite3.IntegrityError as exc:
                raise BindingError("Workspace or directory is already bound") from exc

    def project_for_workspace(self, profile: str, workspace_id: str) -> str | None:
        """Resolve only while both trusted sources still agree with the binding."""
        self._identity(profile, "profile")
        self._identity(workspace_id, "workspace ID")
        with closing(sqlite3.connect(self.db_path)) as db:
            row = db.execute(
                "SELECT project_id, path_key FROM dsh_workspace_bindings_v1 "
                "WHERE profile=? AND workspace_id=?", (profile, workspace_id),
            ).fetchone()
        if row is None:
            return None
        project_id, expected = row
        if self._path_key(profile, project_id, workspace_id) != expected:
            raise BindingError("Workspace binding is stale")
        return project_id

    def _global_path_key(self, profile: str, workspace_id: str) -> str:
        self._identity(profile, "profile")
        self._identity(workspace_id, "workspace ID")
        if self.global_root is None:
            raise BindingError("Global workspace is not configured")
        try:
            if not self.global_root.is_absolute():
                raise BindingError("Global directory must be absolute")
            if self.global_root.is_symlink() or self.global_root.is_junction():
                raise BindingError("Global directory cannot be a link or junction")
            global_dir = self.global_root.resolve(strict=True)
            projects_dir = self.projects_root.resolve()
            reported = self.workspace_path(profile, workspace_id)
            if reported is None:
                raise BindingError("DSH workspace does not exist")
            reported_path = Path(reported)
            if not reported_path.is_absolute():
                raise BindingError("DSH workspace directory must be absolute")
            dsh_dir = reported_path.resolve(strict=True)
        except (OSError, RuntimeError, ValueError) as exc:
            if isinstance(exc, BindingError):
                raise
            raise BindingError("Global workspace directory is unavailable") from exc
        if (not global_dir.is_dir() or not dsh_dir.is_dir()
                or global_dir.is_relative_to(projects_dir)
                or projects_dir.is_relative_to(global_dir)):
            raise BindingError("Global workspace must be separate from project directories")
        expected = os.path.normcase(str(global_dir))
        if (os.path.normcase(str(dsh_dir)) != expected
                or os.path.normcase(os.path.abspath(reported_path)) != expected):
            raise BindingError("DSH workspace does not match the global directory")
        return expected

    def bind_global(self, profile: str, workspace_id: str) -> None:
        """Bind the distinct global workspace once; never replace a project binding."""
        path_key = self._global_path_key(profile, workspace_id)
        with closing(sqlite3.connect(self.db_path)) as db, db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute(
                "SELECT 1 FROM dsh_workspace_bindings_v1 WHERE profile=? AND workspace_id=?",
                (profile, workspace_id),
            ).fetchone():
                raise BindingError("Workspace is already bound to a project")
            old = db.execute(
                "SELECT workspace_id, path_key FROM dsh_global_workspace_v1 WHERE profile=?",
                (profile,),
            ).fetchone()
            if old is not None:
                if old != (workspace_id, path_key):
                    raise BindingError("Profile is already bound to another global workspace")
                return
            db.execute("INSERT INTO dsh_global_workspace_v1 VALUES (?, ?, ?)",
                       (profile, workspace_id, path_key))

    def scope_for_workspace(self, profile: str, workspace_id: str) -> dict:
        """Resolve a trusted DSH workspace, failing closed instead of falling back.

        The caller must authenticate the current DSH connection and obtain the
        workspace identity from DSH, not from a browser or model argument.
        """
        self._identity(profile, "profile")
        self._identity(workspace_id, "workspace ID")
        with closing(sqlite3.connect(self.db_path)) as db:
            row = db.execute(
                "SELECT path_key FROM dsh_global_workspace_v1 WHERE profile=? AND workspace_id=?",
                (profile, workspace_id),
            ).fetchone()
        if row is not None:
            if self._global_path_key(profile, workspace_id) != row[0]:
                raise BindingError("Global workspace binding is stale")
            return {"kind": "global"}
        project_id = self.project_for_workspace(profile, workspace_id)
        if project_id is None:
            raise BindingError("Workspace is not bound")
        return {"kind": "project", "projectId": project_id}

    def scope_for_session(
        self,
        profile: str,
        session_id: str,
        session_workspace: Callable[[str, str], str | None],
    ) -> dict:
        """Resolve scope from a trusted per-session DSH lookup.

        This is a building block only: authenticate the DSH peer and authorize
        access to the session before calling. Never use browser or LLM supplied
        workspace/project arguments as the lookup result. A profile-wide MCP
        server is not session isolation; callers must establish that their DSH
        transport actually supplies the authenticated session identity.
        """
        self._identity(profile, "profile")
        self._identity(session_id, "session ID")
        workspace_id = session_workspace(profile, session_id)
        if workspace_id is None:
            raise BindingError("Session has no trusted workspace")
        return self.scope_for_workspace(profile, workspace_id)
