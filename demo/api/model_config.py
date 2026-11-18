"""DSH model provider, credential, and runtime config resolution helpers."""

from hashlib import sha256
import json
import os
from pathlib import Path
import re
import sys

import workspace

PROVIDER_ENV_MAP = {
    "deepseek-official": "DEEPSEEK_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "google": "GEMINI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "moonshotai": "MOONSHOT_API_KEY",
    "moonshotai-cn": "MOONSHOT_API_KEY",
    "groq": "GROQ_API_KEY",
    "xai": "XAI_API_KEY",
    "mistral": "MISTRAL_API_KEY",
    "minimax": "MINIMAX_API_KEY",
    "minimax-cn": "MINIMAX_API_KEY",
    "zai": "ZAI_API_KEY",
    "zai-coding-cn": "ZAI_API_KEY",
    "xiaomi": "XIAOMI_API_KEY",
    "fireworks": "FIREWORKS_API_KEY",
    "together": "TOGETHER_API_KEY",
}

PROVIDER_BASE_URL_ENV = {
    "deepseek-official": "DEEPSEEK_BASE_URL",
    "deepseek": "DEEPSEEK_BASE_URL",
    "openai": "OPENAI_BASE_URL",
    "anthropic": "ANTHROPIC_BASE_URL",
    "google": "GOOGLE_GEMINI_BASE_URL",
}

COMMON_KEY_ENVS = tuple(dict.fromkeys([
    *PROVIDER_ENV_MAP.values(),
    "GOOGLE_API_KEY",
    "MOONSHOTAI_API_KEY",
    "MOONSHOTAI_CN_API_KEY",
    "MINIMAX_CN_API_KEY",
    "DASHSCOPE_API_KEY",
    "QWEN_API_KEY",
    "AZURE_OPENAI_API_KEY",
    "AWS_BEARER_TOKEN_BEDROCK",
]))

COMMON_URL_ENVS = (
    "DEEPSEEK_BASE_URL",
    "OPENAI_BASE_URL",
    "ANTHROPIC_BASE_URL",
    "GOOGLE_GEMINI_BASE_URL",
)

SECRET_KEY_NAME_RE = re.compile(r"^[A-Z][A-Z0-9_]{1,95}$")
PROVIDER_ID_RE = re.compile(r"^[a-z][a-z0-9-]{0,63}$")


def _safe_home():
    try:
        return Path.home()
    except RuntimeError:
        return None


def _safe_local_key_paths():
    try:
        return list(workspace.local_key_paths())
    except RuntimeError:
        return []


def safe_deepseek_key():
    try:
        return workspace.deepseek_key()
    except RuntimeError:
        return os.environ.get("DEEPSEEK_API_KEY", "").strip()


def profile_home(data_dir=None):
    """Return the workspace-scoped DSH Web home matching native_launcher."""
    data = Path(data_dir) if data_dir is not None else workspace.DATA
    identifier = sha256(os.path.normcase(str(data.resolve())).encode()).hexdigest()[:16]
    home = _safe_home()
    if os.name == "nt":
        raw_base = os.environ.get("LOCALAPPDATA") or (str(home / "AppData/Local") if home else "")
    else:
        raw_base = os.environ.get("XDG_STATE_HOME") or (str(home / ".local/state") if home else "")
    base = Path(raw_base) if raw_base else data.resolve()
    return base / "LabWeave" / "web" / identifier


def active_web_home(web_home=None):
    if web_home is not None:
        return Path(web_home)
    configured = os.environ.get("LABWEAVE_DSH_WEB_HOME", "").strip()
    if configured:
        return Path(configured)
    return profile_home()


def derive_key_ref(provider):
    cleaned = re.sub(r"[^A-Z0-9]+", "_", str(provider or "").upper()).strip("_")
    return f"{cleaned}_API_KEY" if cleaned else ""


def is_secret_env_name(name):
    upper = str(name or "").upper()
    return any(token in upper for token in ("KEY", "TOKEN", "SECRET", "AUTH"))


def _strip_yaml_comment(line):
    in_single = False
    in_double = False
    escaped = False
    for idx, ch in enumerate(line):
        if escaped:
            escaped = False
            continue
        if in_double and ch == "\\":
            escaped = True
            continue
        if ch == "'" and not in_double:
            in_single = not in_single
        elif ch == '"' and not in_single:
            in_double = not in_double
        elif ch == "#" and not in_single and not in_double:
            if idx == 0 or line[idx - 1].isspace():
                return line[:idx].rstrip()
    return line.rstrip()


def _parse_yaml_scalar(raw):
    text = raw.strip()
    if not text or text in ("null", "~"):
        return None
    if text == "[]":
        return []
    if text == "{}":
        return {}
    if text == "true":
        return True
    if text == "false":
        return False
    if text.startswith('"') and text.endswith('"') and len(text) >= 2:
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return text[1:-1]
    if text.startswith("'") and text.endswith("'") and len(text) >= 2:
        return text[1:-1].replace("''", "'")
    if re.fullmatch(r"-?[0-9]+", text):
        return int(text)
    if re.fullmatch(r"-?[0-9]+\.[0-9]+", text):
        return float(text)
    return text


def _split_yaml_key_value(content):
    in_single = False
    in_double = False
    escaped = False
    for idx, ch in enumerate(content):
        if escaped:
            escaped = False
            continue
        if in_double and ch == "\\":
            escaped = True
            continue
        if ch == "'" and not in_double:
            in_single = not in_single
        elif ch == '"' and not in_single:
            in_double = not in_double
        elif ch == ":" and not in_single and not in_double:
            nxt = content[idx + 1] if idx + 1 < len(content) else ""
            if nxt == "" or nxt.isspace():
                key = _parse_yaml_scalar(content[:idx])
                rest = content[idx + 1:].strip()
                return (str(key) if key is not None else ""), rest
    return None, None


def parse_simple_yaml(text):
    """Parse indented YAML used by DSH cordis.patch.yml and .credentials.yaml."""
    lines = []
    for raw in str(text or "").splitlines():
        cleaned = _strip_yaml_comment(raw)
        if not cleaned.strip():
            continue
        indent = len(cleaned) - len(cleaned.lstrip(" "))
        lines.append((indent, cleaned.strip()))
    if not lines:
        return None

    def parse_block(index, min_indent):
        indent, content = lines[index]
        if content == "-" or content.startswith("- "):
            items = []
            while index < len(lines):
                cur_indent, cur_text = lines[index]
                if cur_indent < indent:
                    break
                if cur_indent > indent or not (cur_text == "-" or cur_text.startswith("- ")):
                    break
                rest = cur_text[1:].strip()
                index += 1
                if not rest:
                    if index < len(lines) and lines[index][0] > cur_indent:
                        val, index = parse_block(index, cur_indent + 1)
                    else:
                        val = None
                    items.append(val)
                    continue
                key, val_text = _split_yaml_key_value(rest)
                if key is not None:
                    entry = {}
                    child_indent = cur_indent + 2
                    if val_text:
                        entry[key] = _parse_yaml_scalar(val_text)
                    elif index < len(lines) and lines[index][0] >= child_indent:
                        entry[key], index = parse_block(index, child_indent)
                    else:
                        entry[key] = None
                    if index < len(lines) and lines[index][0] >= child_indent and not lines[index][1].startswith("- "):
                        extra, index = parse_block(index, child_indent)
                        if isinstance(extra, dict):
                            entry.update(extra)
                    items.append(entry)
                else:
                    items.append(_parse_yaml_scalar(rest))
            return items, index

        mapping = {}
        while index < len(lines):
            cur_indent, cur_text = lines[index]
            if cur_indent < indent:
                break
            if cur_indent > indent or cur_text == "-" or cur_text.startswith("- "):
                break
            key, val_text = _split_yaml_key_value(cur_text)
            if key is None:
                break
            index += 1
            if val_text:
                mapping[key] = _parse_yaml_scalar(val_text)
            elif index < len(lines) and (
                lines[index][0] > cur_indent
                or (lines[index][0] == cur_indent and (lines[index][1] == "-" or lines[index][1].startswith("- ")))
            ):
                child, index = parse_block(index, cur_indent)
                mapping[key] = child
            else:
                mapping[key] = {}
        return mapping, index

    parsed, _ = parse_block(0, 0)
    return parsed


def parse_env_text(text):
    values = {}
    for raw in str(text or "").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        if not SECRET_KEY_NAME_RE.fullmatch(key):
            continue
        val = val.strip()
        if (val.startswith('"') and val.endswith('"') and len(val) >= 2):
            try:
                val = json.loads(val)
            except json.JSONDecodeError:
                val = val[1:-1]
        elif (val.startswith("'") and val.endswith("'") and len(val) >= 2):
            val = val[1:-1]
        else:
            val = _strip_yaml_comment(val).strip()
        if val:
            values[key] = val
    return values


def _read_yaml_file(path, default):
    try:
        text = Path(path).read_text(encoding="utf-8")
    except FileNotFoundError:
        return default
    parsed = parse_simple_yaml(text)
    return parsed if isinstance(parsed, type(default)) else default


def _read_env_file(path):
    try:
        return parse_env_text(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}


def _user_env_paths():
    paths = [workspace.DATA / ".env"]
    home = _safe_home()
    if sys.platform == "win32":
        raw = os.environ.get("LOCALAPPDATA") or (str(home / "AppData" / "Local") if home else "")
        if raw:
            paths.append(Path(raw) / "LabWeave" / ".env")
        if home is not None:
            paths.append(home / ".labweave" / ".env")
    else:
        raw = os.environ.get("XDG_CONFIG_HOME") or (str(home / ".config") if home else "")
        if raw:
            paths.append(Path(raw) / "labweave" / ".env")
    return paths


def configured_env_vars():
    """Return configured provider env vars from host env, user .env files, and deepseek.key."""
    collected = {}
    for path in reversed(_user_env_paths()):
        for k, v in _read_env_file(path).items():
            if (k in COMMON_KEY_ENVS or k in COMMON_URL_ENVS or k.endswith("_API_KEY")) and v:
                collected[k] = v
    for k in (*COMMON_KEY_ENVS, *COMMON_URL_ENVS):
        val = os.environ.get(k, "").strip()
        if val:
            collected[k] = val
    ds = safe_deepseek_key()
    if ds:
        collected["DEEPSEEK_API_KEY"] = ds
    return collected


def _patch_entry(patches, entry_id):
    for item in patches:
        if isinstance(item, dict) and item.get("id") == entry_id:
            return item
    return None


def _normalize_provider_config(pid, cfg):
    if not isinstance(pid, str) or not PROVIDER_ID_RE.fullmatch(pid) or not isinstance(cfg, dict):
        return None
    out = {}
    if isinstance(cfg.get("displayName"), str) and cfg["displayName"].strip():
        out["displayName"] = cfg["displayName"].strip()[:80]
    api_key_env = cfg.get("apiKeyEnv")
    if isinstance(api_key_env, str) and SECRET_KEY_NAME_RE.fullmatch(api_key_env.strip()):
        out["apiKeyEnv"] = api_key_env.strip()
    if isinstance(cfg.get("api"), str) and cfg["api"].strip():
        out["api"] = cfg["api"].strip()[:64]
    if isinstance(cfg.get("baseURL"), str) and cfg["baseURL"].strip():
        url = cfg["baseURL"].strip()
        if url.startswith(("http://", "https://")):
            out["baseURL"] = url[:1000]
    models = []
    for item in cfg.get("models") or []:
        if isinstance(item, str) and item.strip():
            models.append({"id": item.strip()[:160]})
        elif isinstance(item, dict) and isinstance(item.get("id"), str) and item["id"].strip():
            entry = {"id": item["id"].strip()[:160]}
            if isinstance(item.get("name"), str) and item["name"].strip():
                entry["name"] = item["name"].strip()[:160]
            for cap_key in ("contextWindow", "maxTokens"):
                cap_val = item.get(cap_key)
                if type(cap_val) is int and cap_val > 0:
                    entry[cap_key] = cap_val
            if isinstance(item.get("input"), list):
                cleaned_inputs = [v for v in item["input"] if isinstance(v, str) and v in ("text", "image")]
                if cleaned_inputs:
                    entry["input"] = cleaned_inputs
            if item.get("reasoningEfforts") is None and "reasoningEfforts" in item:
                entry["reasoningEfforts"] = None
            elif isinstance(item.get("reasoningEfforts"), dict):
                efforts = {
                    str(k).strip(): (None if v is None else str(v).strip())
                    for k, v in item["reasoningEfforts"].items()
                    if isinstance(k, str) and k.strip() and (v is None or (isinstance(v, str) and v.strip()))
                }
                if efforts:
                    entry["reasoningEfforts"] = efforts
            models.append(entry)
    if models:
        out["models"] = models
    return out


def _read_dsh_dir_bundle(home_dir):
    home = Path(home_dir)
    if not home.is_dir():
        return {"credentials": {}, "envVars": {}, "providers": {}, "defaultModel": None, "deepseekConfig": {}}
    creds_doc = _read_yaml_file(home / ".credentials.yaml", {})
    refs = creds_doc.get("refs") if isinstance(creds_doc.get("refs"), dict) else {}
    credentials = {
        str(k).strip(): str(v).strip()
        for k, v in refs.items()
        if SECRET_KEY_NAME_RE.fullmatch(str(k).strip()) and isinstance(v, (str, int, float)) and str(v).strip()
    }
    env_vars = _read_env_file(home / ".env")
    providers = {}
    default_model = None
    deepseek_cfg = {}

    patch_candidates = [home / "profiles" / "web" / "cordis.patch.yml"]
    profiles_dir = home / "profiles"
    if profiles_dir.is_dir():
        for child in sorted(profiles_dir.iterdir()):
            candidate = child / "cordis.patch.yml"
            if candidate not in patch_candidates and candidate.is_file():
                patch_candidates.append(candidate)
    if (home / "cordis.patch.yml").is_file():
        patch_candidates.append(home / "cordis.patch.yml")

    for patch_file in patch_candidates:
        entries = _read_yaml_file(patch_file, [])
        if not isinstance(entries, list):
            continue
        pi_ai = _patch_entry(entries, "llm-pi-ai")
        if pi_ai and isinstance(pi_ai.get("config"), dict):
            raw_providers = pi_ai["config"].get("providers") or {}
            if isinstance(raw_providers, dict):
                for pid, cfg in raw_providers.items():
                    if pid not in providers:
                        norm = _normalize_provider_config(pid, cfg)
                        if norm is not None:
                            providers[pid] = norm
        ds = _patch_entry(entries, "llm-deepseek")
        if not deepseek_cfg and ds and isinstance(ds.get("config"), dict):
            deepseek_cfg = dict(ds["config"])
        adm = _patch_entry(entries, "agent-default-model")
        if default_model is None and adm and isinstance(adm.get("config"), dict):
            prov = adm["config"].get("provider")
            mod = adm["config"].get("model")
            if isinstance(prov, str) and prov.strip() and isinstance(mod, str) and mod.strip():
                default_model = {"provider": prov.strip(), "model": mod.strip()}

    return {
        "credentials": credentials,
        "envVars": env_vars,
        "providers": providers,
        "defaultModel": default_model,
        "deepseekConfig": deepseek_cfg,
    }


_BUILTIN_FALLBACK_MODELS = {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-3-5-sonnet-latest",
    "google": "gemini-2.5-flash",
    "openrouter": "openai/gpt-4o-mini",
    "moonshotai": "moonshot-v1-8k",
    "groq": "llama-3.3-70b-versatile",
    "xai": "grok-2-latest",
    "mistral": "mistral-large-latest",
}


def sdk_runtime_config(web_home=None):
    """Build DeepSeekHarness config respecting active DSH Web provider, model, and credentials."""
    home = active_web_home(web_home)
    bundle = _read_dsh_dir_bundle(home)
    host_env = configured_env_vars()
    merged_secrets = {}
    merged_secrets.update(host_env)
    merged_secrets.update(bundle["envVars"])
    merged_secrets.update(bundle["credentials"])

    providers = bundle["providers"]
    default_model = bundle["defaultModel"]

    def _provider_has_key(pid):
        if pid in providers:
            env_name = providers[pid].get("apiKeyEnv") or derive_key_ref(pid)
            return bool(merged_secrets.get(env_name))
        if pid in ("deepseek-official", "deepseek"):
            return bool(merged_secrets.get("DEEPSEEK_API_KEY") or safe_deepseek_key())
        env_name = PROVIDER_ENV_MAP.get(pid) or derive_key_ref(pid)
        if merged_secrets.get(env_name):
            return True
        return pid == "google" and bool(merged_secrets.get("GOOGLE_API_KEY"))

    provider = None
    model = None
    if default_model and _provider_has_key(default_model["provider"]):
        provider = default_model["provider"]
        model = default_model["model"]
    elif merged_secrets.get("DEEPSEEK_API_KEY") or safe_deepseek_key():
        provider = "deepseek-official"
        model = workspace.MODEL
    else:
        for pid, cfg in providers.items():
            if _provider_has_key(pid):
                if cfg.get("models"):
                    provider = pid
                    model = cfg["models"][0]["id"]
                    break
                if pid in _BUILTIN_FALLBACK_MODELS:
                    provider = pid
                    model = _BUILTIN_FALLBACK_MODELS[pid]
                    break
        if provider is None:
            for pid, fallback_id in _BUILTIN_FALLBACK_MODELS.items():
                if _provider_has_key(pid):
                    provider = pid
                    model = fallback_id
                    break
    if not provider and default_model:
        provider = default_model["provider"]
        model = default_model["model"]
    if not provider:
        provider = "deepseek-official"
    if not model:
        model = workspace.MODEL

    extra_patches = []
    if provider in providers:
        extra_patches.append({
            "id": "llm-pi-ai",
            "config": {"providers": {provider: providers[provider]}},
        })
    elif bundle["deepseekConfig"] and provider in ("deepseek-official", "deepseek"):
        extra_patches.append({
            "id": "llm-deepseek",
            "config": bundle["deepseekConfig"],
        })

    env = {"DSH_TELEMETRY_DISABLED": "1"}
    secrets = []

    def add_env(name, value):
        if name and value:
            env[name] = value
            if is_secret_env_name(name):
                secrets.append(value)

    if provider in providers:
        key_ref = providers[provider].get("apiKeyEnv") or derive_key_ref(provider)
        add_env(key_ref, merged_secrets.get(key_ref, ""))
    else:
        key_ref = PROVIDER_ENV_MAP.get(provider) or derive_key_ref(provider)
        add_env(key_ref, merged_secrets.get(key_ref, ""))
        if provider == "google" and not merged_secrets.get("GEMINI_API_KEY") and merged_secrets.get("GOOGLE_API_KEY"):
            add_env("GOOGLE_API_KEY", merged_secrets["GOOGLE_API_KEY"])
        url_env = PROVIDER_BASE_URL_ENV.get(provider)
        if url_env and merged_secrets.get(url_env):
            env[url_env] = merged_secrets[url_env]

    api_key = None
    if provider in ("deepseek-official", "deepseek"):
        api_key = env.get("DEEPSEEK_API_KEY") or safe_deepseek_key()
        if api_key:
            secrets.append(api_key)

    return {
        "provider": provider,
        "model": model,
        "patches": extra_patches,
        "env": env,
        "api_key": api_key,
        "secrets": list(dict.fromkeys(s for s in secrets if s)),
    }
