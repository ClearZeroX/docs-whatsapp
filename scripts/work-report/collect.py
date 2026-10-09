#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
只读采集器：从本机 Codex / Trae SOLO CN / git 仓库中提取指定时间窗内的工作痕迹。

安全约定（严格遵守）：
  * 全程只读。绝不写入、修改、删除上述应用的任何文件。
  * Codex 的 sqlite 会先复制到临时目录再打开（因为带 WAL，readonly 打开会失败）。
  * git 相关命令一律带 GIT_OPTIONAL_LOCKS=0，避免刷新 index 造成写入。

用法：
  python3 collect.py --start '2026-10-08 00:00:00' --end '2026-10-09 00:00:00' -o out.json
  python3 collect.py --last-hours 24 -o out.json
"""

import argparse
import datetime as dt
import glob
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile

TZ = dt.timezone(dt.timedelta(hours=8))  # Asia/Shanghai

HOME = os.path.expanduser("~")
CODEX_HOME = os.environ.get("CODEX_HOME", os.path.join(HOME, ".codex"))
TRAE_LOG_GLOBS = [
    os.path.join(HOME, "Library/Application Support/TRAE SOLO CN/logs/*/window*/renderer.log"),
    os.path.join(HOME, "Library/Application Support/Trae CN/logs/*/window*/renderer.log"),
]
REPO_ROOTS = [
    os.path.join(HOME, "code-temp"),
    os.path.join(HOME, "IdeaProjects"),
]

MAX_TEXT = 4000
MAX_CMD = 500


# ---------------------------------------------------------------- helpers
def log(msg):
    print(msg, file=sys.stderr)


def parse_ts(s):
    if s is None:
        return None
    s = s.strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return dt.datetime.strptime(s, fmt).replace(tzinfo=TZ)
        except ValueError:
            pass
    raise SystemExit("无法解析时间: %r" % s)


def iso(ts):
    return ts.astimezone(TZ).strftime("%Y-%m-%d %H:%M:%S")


def clip(s, n):
    if s is None:
        return None
    s = str(s)
    return s if len(s) <= n else s[:n] + "…[截断]"


# ---------------------------------------------------------------- codex
def _copy_sqlite(name, destdir):
    src = os.path.join(CODEX_HOME, name)
    if not os.path.exists(src):
        return None
    base = os.path.basename(name)
    for suffix in ("", "-wal", "-shm"):
        s = src + suffix
        if os.path.exists(s):
            try:
                shutil.copy2(s, os.path.join(destdir, base + suffix))
            except OSError as e:
                log("copy %s 失败: %s" % (s, e))
    return os.path.join(destdir, base)


def _open_ro_copy(path):
    """打开临时副本，返回只读语义的连接。

    踩坑记录：Codex 的 sqlite 是 WAL 模式。用只读 URI（`file:...?mode=ro`）打开时，
    如果随库复制的 `-wal` / `-shm` 不存在（Codex 已 checkpoint 关闭时就是这样），
    SQLite 需要自己创建共享内存文件 → 直接失败：`unable to open database file`。
    实测该错误是必现的，会让整个采集崩溃。

    因此这里改为在**副本**上以普通模式打开：写入只会落在临时目录里的副本上，
    原始文件（~/.codex/**）自始至终没有被打开过，只读纪律不受影响。
    """
    try:
        con = sqlite3.connect(path)
        con.row_factory = sqlite3.Row
        con.execute("SELECT 1 FROM sqlite_master LIMIT 1").fetchone()
        return con
    except sqlite3.Error:
        pass
    # 退路：immutable 只读打开（明确告诉 SQLite 文件不会变，忽略 WAL）
    con = sqlite3.connect("file:%s?immutable=1" % path, uri=True)
    con.row_factory = sqlite3.Row
    return con


def _thread_meta(td):
    """从 state_5.sqlite 取线程元信息（只复制副本后读取）。

    sqlite 失败不应拖垮整次采集：出错就退化成「没有元信息」，只是标题/cwd/分支为空。
    """
    state = _copy_sqlite("state_5.sqlite", td)
    if not state:
        return {}, None
    try:
        con = _open_ro_copy(state)
        try:
            meta = {r["id"]: dict(r) for r in con.execute("SELECT * FROM threads")}
        finally:
            con.close()
        return meta, None
    except sqlite3.Error as e:
        return {}, "读取 state_5.sqlite 失败（已降级为无元信息）: %s" % e


def _rollout_thread_id(path):
    m = re.search(r"-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$",
                  os.path.basename(path))
    return m.group(1) if m else None


def _norm_item(j):
    """把 rollout 里的 CamelCase item 统一成 lowerCamel。"""
    t = j.get("type") or ""
    return t[0].lower() + t[1:] if t else t


def collect_codex(start, end):
    """以 rollout JSONL 为主源（实时追加，含续聊），sqlite 仅提供线程元信息。"""
    out = {"threads": [], "errors": [], "files_scanned": 0}
    with tempfile.TemporaryDirectory(prefix="codex-ro-") as td:
        meta, meta_err = _thread_meta(td)
        if meta_err:
            out["errors"].append(meta_err)

        # 只扫描 mtime 落在窗口内的 rollout（含窗口前几天，防止跨天续写）
        cutoff = start - dt.timedelta(days=2)
        candidates = []
        for p in glob.glob(os.path.join(CODEX_HOME, "sessions", "**", "*.jsonl"), recursive=True):
            try:
                if dt.datetime.fromtimestamp(os.path.getmtime(p), TZ) >= cutoff:
                    candidates.append(p)
            except OSError:
                continue
        out["files_scanned"] = len(candidates)

        by_thread = {}
        for path in candidates:
            tid = _rollout_thread_id(path)
            try:
                fh = open(path, "r", encoding="utf-8", errors="replace")
            except OSError as e:
                out["errors"].append("读取 %s 失败: %s" % (path, e))
                continue
            with fh:
                for line in fh:
                    if not line.startswith("{"):
                        continue
                    try:
                        o = json.loads(line)
                    except ValueError:
                        continue
                    if o.get("type") != "event_msg":
                        continue
                    pl = o.get("payload") or {}
                    if pl.get("type") != "item_completed":
                        continue
                    t_raw = o.get("timestamp")
                    if not t_raw:
                        continue
                    try:
                        ts = dt.datetime.strptime(t_raw[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=dt.timezone.utc).astimezone(TZ)
                    except ValueError:
                        continue
                    if not (start <= ts < end):
                        continue
                    item = pl.get("item") or {}
                    kind = _norm_item(item)
                    if kind == "reasoning":
                        continue
                    by_thread.setdefault(tid or pl.get("thread_id"), []).append((ts, kind, item))

        for tid, items in by_thread.items():
            m = meta.get(tid, {})
            entry = {
                "thread_id": tid,
                "title": m.get("title") or "",
                "cwd": m.get("cwd") or "",
                "git_branch": m.get("git_branch") or "",
                "source": m.get("source") or "",
                "created_at": iso(dt.datetime.fromtimestamp(m["created_at_ms"] / 1000, TZ)) if m.get("created_at_ms") else None,
                "updated_at": iso(dt.datetime.fromtimestamp(m["updated_at_ms"] / 1000, TZ)) if m.get("updated_at_ms") else None,
                "tokens_used_total": m.get("tokens_used"),
                "item_counts": {},
                "first_at": None,
                "last_at": None,
                "user_messages": [],
                "commands": [],
                "file_changes": [],
                "mcp_calls": [],
                "assistant_notes": [],
                "web_search": [],
            }
            for ts, kind, item in sorted(items, key=lambda x: x[0]):
                stamp = iso(ts)
                entry["item_counts"][kind] = entry["item_counts"].get(kind, 0) + 1
                entry["first_at"] = entry["first_at"] or stamp
                entry["last_at"] = stamp

                if kind == "userMessage":
                    txt = "\n".join(c.get("text", "") for c in item.get("content", []) if c.get("type") == "text")
                    entry["user_messages"].append({"at": stamp, "text": clip(txt, MAX_TEXT)})
                elif kind == "commandExecution":
                    entry["commands"].append({
                        "at": stamp,
                        "command": clip(item.get("command"), MAX_CMD),
                        "status": item.get("status"),
                        "cwd": item.get("cwd"),
                    })
                elif kind == "fileChange":
                    paths = item.get("changes") or item.get("paths") or []
                    if isinstance(paths, dict):
                        paths = list(paths.keys())
                    if isinstance(paths, list):
                        norm = []
                        for p in paths:
                            if isinstance(p, dict):
                                norm.append(p.get("path") or p.get("file") or json.dumps(p, ensure_ascii=False)[:120])
                            else:
                                norm.append(str(p))
                        paths = norm
                    entry["file_changes"].append({"at": stamp, "paths": paths[:80]})
                elif kind == "mcpToolCall":
                    entry["mcp_calls"].append({"at": stamp, "tool": item.get("tool") or item.get("name")})
                elif kind == "agentMessage":
                    txt = item.get("text") or item.get("message")
                    if not txt:
                        blocks = item.get("content") or []
                        if isinstance(blocks, list):
                            txt = "\n".join(
                                b.get("text", "") for b in blocks
                                if isinstance(b, dict) and b.get("type", "").lower() == "text"
                            )
                        elif isinstance(blocks, str):
                            txt = blocks
                    if isinstance(txt, list):
                        txt = "\n".join(x.get("text", "") for x in txt if isinstance(x, dict))
                    txt = txt or ""
                    phase = item.get("phase") or "final_answer"
                    if phase == "commentary":
                        # 过程性发言只保留一句，避免报告被刷屏
                        entry.setdefault("assistant_commentary", []).append({"at": stamp, "text": clip(txt, 200)})
                    entry["assistant_notes"].append({"at": stamp, "text": clip(txt, 1500)})
                elif kind == "webSearch":
                    entry["web_search"].append({"at": stamp, "query": item.get("query")})

            if not (entry["user_messages"] or entry["commands"] or entry["file_changes"] or entry["mcp_calls"]):
                continue
            out["threads"].append(entry)

        out["threads"].sort(key=lambda e: e["first_at"] or "")
    return out


# ---------------------------------------------------------------- dsh
DSH_HOME = os.path.expanduser("~/.dsh")
DSH_SESSIONS = os.path.join(DSH_HOME, "sessions")

# 自动化任务自己跑的那次会话，不算「工作内容」。
# 新版本执行器会在提示词里带这个标记；下面几个前缀用于识别加标记之前的历史运行。
AUTOMATION_MARKER = "DSH_AUTOMATION_RUN"
LEGACY_AUTOMATION_PREFIXES = (
    "你是「",  # 工作日报/周报/月报自动化的提示词开头
    "执行每日 AI 行业热点新闻速览",  # 每日 AI 新闻自动化的提示词开头
)


def _zstd_bin():
    """launchd 的 PATH 里没有 /opt/homebrew/bin，所以按候选绝对路径兜底。"""
    for cand in (shutil.which("zstd"), "/opt/homebrew/bin/zstd",
                 "/usr/local/bin/zstd", "/usr/bin/zstd"):
        if cand and os.path.exists(cand):
            return cand
    return None


def _ms_to_dt(ms):
    return dt.datetime.fromtimestamp(ms / 1000.0, dt.timezone.utc).astimezone(TZ)


def _ev_text(ev):
    """从 user/message 的 data.content 里取纯文本。"""
    cs = (ev.get("data") or {}).get("content") or []
    return "\n".join(c.get("text", "") for c in cs if c.get("type") == "text").strip()


def _ev_is_user(ev):
    """区分「真人输入」和 harness 注入。

    DSH 把很多东西也记成 user/message，靠 data.source.kind 区分：
      user=真人；其余是 time-context / runtime-context / skill-catalog /
      tool-jobs（后台任务完成通知）/ compact-checkpoint / model-selection /
      team-message / subagent-settled / agent-instructions 等自动注入。
    实测 238 条 user/message 里只有 72 条是真人输入，不过滤会严重污染报告。
    """
    return ((ev.get("data") or {}).get("source") or {}).get("kind") == "user"


def _ev_assistant_text(data):
    """assistant/message 取正文，丢掉 reasoning（思考过程不是产出）。"""
    cs = ((data or {}).get("message") or {}).get("content") or []
    return "\n".join(c.get("text", "") for c in cs if c.get("type") == "text").strip()


def _ev_args(data):
    try:
        return json.loads((data or {}).get("arguments") or "{}")
    except ValueError:
        return {}


def collect_dsh(start, end):
    """DSH 本地会话记录：~/.dsh/sessions/<项目>/<会话>/session.v4.jsonl.zstd

    两个坑：
    1. 是 zstd 压缩的 JSONL，需要外部 zstd（launchd PATH 里没有 Homebrew，故按绝对路径兜底）。
    2. **续聊/分叉会话会把父会话的历史事件整段重放**（父会话 createdAt 就是子会话最早事件的时刻）。
       直接统计会重复计数，因此只取 `time >= createdAt` 的事件——父会话文件里已经有一份了。
    """
    out = {"sessions": [], "errors": [], "files_scanned": 0,
           "skipped_automation_sessions": [], "zstd": None,
           "inherited_events_skipped": 0}
    z = _zstd_bin()
    if not z:
        out["errors"].append("未找到 zstd 可执行文件，DSH 会话记录无法解压")
        return out
    out["zstd"] = z

    cutoff = start - dt.timedelta(days=2)
    files = []
    for p in sorted(glob.glob(os.path.join(DSH_SESSIONS, "*", "*", "session.v4.jsonl.zstd"))):
        try:
            if dt.datetime.fromtimestamp(os.path.getmtime(p), TZ) >= cutoff:
                files.append(p)
        except OSError:
            continue
    out["files_scanned"] = len(files)

    seen = set()  # 全局唯一 id 去重（user/message 的 id、tool/call 的 callId 都是 UUID）

    for path in files:
        try:
            proc = subprocess.run([z, "-dc", path], capture_output=True, timeout=180)
        except (OSError, subprocess.SubprocessError) as e:
            out["errors"].append("解压 %s 失败: %s" % (path, e))
            continue
        if proc.returncode != 0:
            err = (proc.stderr or b"")[:200].decode("utf-8", "replace")
            out["errors"].append("解压 %s 失败: %s" % (path, err))
            continue

        hdr = None
        events = []
        for raw in proc.stdout.decode("utf-8", "replace").splitlines():
            if not raw.startswith("{"):
                continue
            try:
                o = json.loads(raw)
            except ValueError:
                continue
            if o.get("type") == "session" and hdr is None:
                hdr = o
                continue
            t = o.get("time")
            if isinstance(t, (int, float)):
                events.append((t, o))
        if not hdr:
            continue

        sid = hdr.get("id") or os.path.basename(os.path.dirname(path))
        created = hdr.get("createdAt") or 0

        # 自动化任务自己的运行不算工作
        first_user = ""
        for _t, o in events:
            if o.get("type") == "user/message":
                first_user = _ev_text(o)
                break
        if AUTOMATION_MARKER in first_user or first_user.startswith(LEGACY_AUTOMATION_PREFIXES):
            out["skipped_automation_sessions"].append(
                {"session_id": sid, "started_at": iso(_ms_to_dt(created)) if created else "",
                 "title": clip(first_user, 60)})
            continue

        title = ""
        user_messages, commands, files_touched = [], [], []
        deliverables, notes = [], []
        n_steps = n_calls = inherited = 0

        for t, o in events:
            if created and t < created:
                inherited += 1
                continue
            ts = _ms_to_dt(t)
            if not (start <= ts < end):
                continue
            typ = o.get("type")
            d = o.get("data") or {}

            if typ == "session/title":
                if not title and d.get("title"):
                    title = d["title"]
            elif typ == "user/message":
                if not _ev_is_user(o):
                    continue  # harness 注入，不是人干的事
                fp = "u:" + str(d.get("id"))
                if fp in seen:
                    continue
                seen.add(fp)
                txt = _ev_text(o)
                if txt:
                    user_messages.append({"time": iso(ts), "text": clip(txt, 1200)})
            elif typ == "assistant/message":
                fp = "a:%s:%s:%s" % (sid, d.get("turn"), d.get("step"))
                if fp in seen:
                    continue
                seen.add(fp)
                n_steps += 1
                txt = _ev_assistant_text(d)
                if txt:
                    notes.append({"time": iso(ts), "text": clip(txt, 400)})
            elif typ == "tool/call":
                fp = "c:" + str(d.get("callId"))
                if fp in seen:
                    continue
                seen.add(fp)
                n_calls += 1
                name = d.get("name") or ""
                args = _ev_args(d)
                if name == "bash":
                    commands.append({"time": iso(ts),
                                     "command": clip(args.get("command") or "", 300)})
                elif name in ("write", "edit", "multi_edit"):
                    fpth = args.get("file_path") or args.get("path")
                    if fpth:
                        files_touched.append(fpth)
            elif typ == "deliverables/presented":
                fp = "d:" + str(d.get("callId"))
                if fp in seen:
                    continue
                seen.add(fp)
                for item in (d.get("files") or []):
                    if item.get("path"):
                        deliverables.append({"path": item["path"],
                                             "description": clip(item.get("description") or "", 200)})

        out["inherited_events_skipped"] += inherited
        if not (user_messages or commands or deliverables or notes or files_touched):
            continue  # 本窗口内没有任何活动，不占位

        seen_paths = []
        for p in files_touched:
            if p not in seen_paths:
                seen_paths.append(p)

        cwd = hdr.get("cwd") or ""
        out["sessions"].append({
            "session_id": sid,
            "title": title or (user_messages[0]["text"][:60] if user_messages else ""),
            "cwd": cwd,
            "started_at": iso(_ms_to_dt(created)) if created else (user_messages[0]["time"] if user_messages else ""),
            "parent_session": hdr.get("parentSession") or "",
            "scratch": cwd.startswith(("/tmp/", "/private/tmp/")),
            "user_messages": user_messages,
            "commands": commands,
            "commands_total": len(commands),
            "files_touched": seen_paths,
            "deliverables": deliverables,
            "assistant_notes": notes[-60:],
            "stats": {"steps": n_steps, "tool_calls": n_calls,
                      "user_messages": len(user_messages),
                      "inherited_events_skipped": inherited},
        })

    out["sessions"].sort(key=lambda s: s["started_at"] or "")
    return out


# ---------------------------------------------------------------- trae
TS_RE = re.compile(r"^(?P<ts>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+08:00)")
SID_RE = re.compile(r"\b([0-9a-f]{24})\b")


def _trae_session_meta_from_id(sid):
    try:
        return dt.datetime.fromtimestamp(int(sid[:8], 16), TZ)
    except ValueError:
        return None


def collect_trae(start, end):
    out = {"sessions": [], "events": [], "files": [], "errors": [], "log_files": []}
    files = []
    for g in TRAE_LOG_GLOBS:
        files.extend(glob.glob(g))
    files = [f for f in files if os.path.getsize(f) > 0]
    out["log_files"] = files
    if not files:
        out["errors"].append("未找到 Trae renderer.log")
        return out

    sessions = {}
    events = []
    seen_keys = set()

    line_re = re.compile(r"^(?P<ts>\d{4}-\d{2}-\d{2}T[\d:.]+)\s+\[(?P<lvl>\w+)\]\s+(?P<body>.*)$")
    for path in files:
        try:
            fh = open(path, "r", encoding="utf-8", errors="replace")
        except OSError as e:
            out["errors"].append("读取 %s 失败: %s" % (path, e))
            continue
        with fh:
            for line in fh:
                if "2026-" not in line[:20]:
                    continue
                m = line_re.match(line)
                if not m:
                    continue
                try:
                    ts = dt.datetime.strptime(m.group("ts")[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=TZ)
                except ValueError:
                    continue
                if not (start <= ts < end):
                    continue
                body = m.group("body")

                # 新建会话
                if "session_created" in body:
                    sid = re.search(r'"chat_session_id":"([0-9a-f]{24})"', body)
                    if sid:
                        sid = sid.group(1)
                        s = sessions.setdefault(sid, {"session_id": sid, "created_at": iso(ts)})
                        mm = re.search(r'"mode":"([^"]*)"', body)
                        if mm:
                            s["mode"] = mm.group(1)
                        mo = re.search(r'"origin":"([^"]*)"', body)
                        if mo:
                            s["origin"] = mo.group(1)
                # 会话详情（仓库路径）
                elif "Session fetched:" in body:
                    sid = re.search(r'"chat_session_id":"([0-9a-f]{24})"', body)
                    if sid:
                        s = sessions.setdefault(sid.group(1), {"session_id": sid.group(1), "created_at": iso(ts)})
                        mf = re.search(r'"local_folder":"([^"]*)"', body)
                        if mf:
                            s["workspace"] = mf.group(1)
                        mt = re.search(r'"mode":"([^"]*)"', body)
                        if mt:
                            s["mode"] = mt.group(1)
                        ms = re.search(r'"session_type":"([^"]*)"', body)
                        if ms:
                            s["session_type"] = ms.group(1)
                # 用户发消息（新建并发送）
                elif "createSessionAndSendMessage succeeded" in body:
                    mm = re.search(r"sessionId:\s*([0-9a-f]{24})\s*userMessageId:\s*([0-9a-f]{24})", body)
                    if mm:
                        sid, mid = mm.group(1), mm.group(2)
                        s = sessions.setdefault(sid, {"session_id": sid, "created_at": iso(ts)})
                        s.setdefault("user_message_ids", []).append(mid)
                        s["last_user_message_at"] = iso(ts)
                        events.append({"at": iso(ts), "kind": "user_message_sent", "session": sid})
                # 流开始
                elif "startStream entry" in body:
                    sid = re.search(r'"sessionId":"([0-9a-f]{24})"', body)
                    if sid:
                        events.append({"at": iso(ts), "kind": "stream_started", "session": sid.group(1)})
                # 文件变更统计
                elif "FileChangeAwareness" in body and "diff computed" in body:
                    j = re.search(r"(\{.*\})", body)
                    if j:
                        try:
                            d = json.loads(j.group(1))
                        except ValueError:
                            d = {}
                        out["files"].append({
                            "at": iso(ts),
                            "session": d.get("sessionId"),
                            "project_id": d.get("projectId"),
                            "modified": d.get("modifiedCount"),
                            "deleted": d.get("deletedCount"),
                        })
                # 选中的仓库
                elif "setSelectedRepo:" in body:
                    j = re.search(r"(\{.*\})", body)
                    if j:
                        try:
                            d = json.loads(j.group(1))
                        except ValueError:
                            d = {}
                        events.append({
                            "at": iso(ts),
                            "kind": "repo_selected",
                            "repo": d.get("projectPath"),
                            "branch": d.get("currentBranch"),
                        })
                # 会话状态流转
                elif "Session status changed:" in body:
                    j = re.search(r"(\{.*\})", body)
                    if j:
                        try:
                            d = json.loads(j.group(1))
                        except ValueError:
                            d = {}
                        events.append({
                            "at": iso(ts),
                            "kind": "session_status",
                            "session": d.get("sessionId"),
                            "status": d.get("nextStatus"),
                            "source": d.get("source"),
                        })

    # 用 id 前缀时间补全会话时间（id 前 4 字节 = unix 秒）
    for s in sessions.values():
        t = _trae_session_meta_from_id(s["session_id"])
        if t:
            s["id_time"] = iso(t)
    out["sessions"] = sorted(sessions.values(), key=lambda s: s.get("id_time") or "")
    out["events"] = events
    return out


# ---------------------------------------------------------------- git
def _git(repo, args):
    env = dict(os.environ, GIT_OPTIONAL_LOCKS="0")
    try:
        r = subprocess.run(["git", "-C", repo] + args, capture_output=True, text=True, env=env, timeout=60)
    except (OSError, subprocess.TimeoutExpired):
        return None
    if r.returncode != 0:
        return None
    return r.stdout


def discover_repos():
    """扫描 REPO_ROOTS 下的一级与二级 git 仓库（如 ai-md/whatsapp_crm_docs）。"""
    repos = []
    for root in REPO_ROOTS:
        if not os.path.isdir(root):
            continue
        for name in sorted(os.listdir(root)):
            p = os.path.join(root, name)
            if not os.path.isdir(p):
                continue
            if os.path.isdir(os.path.join(p, ".git")):
                repos.append(p)
                continue
            try:
                for sub in sorted(os.listdir(p)):
                    q = os.path.join(p, sub)
                    if os.path.isdir(os.path.join(q, ".git")):
                        repos.append(q)
            except OSError:
                continue
    return repos


def collect_git(start, end, repos=None):
    out = {"commits": [], "dirty": [], "errors": []}
    repos = repos or discover_repos()
    since = start.strftime("%Y-%m-%d %H:%M:%S")
    until = end.strftime("%Y-%m-%d %H:%M:%S")
    for repo in repos:
        log = _git(repo, ["log", "--all", "--since=%s" % since, "--until=%s" % until,
                          "--pretty=format:%H%x1f%ad%x1f%an%x1f%s", "--date=format:%Y-%m-%d %H:%M:%S"])
        if log:
            for line in log.splitlines():
                parts = line.split("\x1f")
                if len(parts) == 4:
                    out["commits"].append({"repo": repo, "sha": parts[0][:9], "at": parts[1],
                                           "author": parts[2], "subject": parts[3]})
        branch = (_git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]) or "").strip()
        status = _git(repo, ["status", "--short"])
        if status:
            out["dirty"].append({"repo": repo, "branch": branch, "files": status.splitlines()[:80]})
    out["commits"].sort(key=lambda c: c["at"])
    return out


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start")
    ap.add_argument("--end")
    ap.add_argument("--last-hours", type=float)
    ap.add_argument("-o", "--output", required=True)
    ap.add_argument("--repos", nargs="*")
    ap.add_argument("--skip-git", action="store_true")
    a = ap.parse_args()

    if a.last_hours:
        end = dt.datetime.now(TZ)
        start = end - dt.timedelta(hours=a.last_hours)
    else:
        if not a.start:
            raise SystemExit("需要 --start 或 --last-hours")
        start = parse_ts(a.start)
        end = parse_ts(a.end) if a.end else dt.datetime.now(TZ)

    def safe(name, fn, fallback):
        """任一数据源出问题都不应中断整次采集：降级 + 记录错误。"""
        try:
            return fn()
        except Exception as e:  # noqa: BLE001 - 采集器要尽量产出可用的部分结果
            log("!! %s 采集失败（已降级继续）: %s" % (name, e))
            fb = dict(fallback)
            fb.setdefault("errors", [])
            fb["errors"] = list(fb["errors"]) + ["%s 采集失败: %s" % (name, e)]
            return fb

    result = {
        "window": {"start": iso(start), "end": iso(end), "tz": "Asia/Shanghai"},
        "generated_at": iso(dt.datetime.now(TZ)),
        "codex": safe("codex", lambda: collect_codex(start, end),
                      {"threads": [], "errors": [], "files_scanned": 0}),
        "dsh": safe("dsh", lambda: collect_dsh(start, end),
                    {"sessions": [], "errors": [], "files_scanned": 0,
                     "skipped_automation_sessions": []}),
        "trae": safe("trae", lambda: collect_trae(start, end),
                     {"sessions": [], "events": [], "files": [], "errors": []}),
        "git": {"commits": [], "dirty": []} if a.skip_git
               else safe("git", lambda: collect_git(start, end, a.repos),
                         {"commits": [], "dirty": [], "errors": []}),
    }
    with open(a.output, "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False, indent=2)

    c = result["codex"]["threads"]
    t = result["trae"]
    d = result["dsh"]
    log("窗口 %s ~ %s" % (result["window"]["start"], result["window"]["end"]))
    log("Codex 线程 %d，命令 %d" % (len(c), sum(len(x["commands"]) for x in c)))
    log("DSH 会话 %d，命令 %d（跳过自动化自跑会话 %d 个，去重继承事件 %d 条）" % (
        len(d["sessions"]), sum(x["commands_total"] for x in d["sessions"]),
        len(d.get("skipped_automation_sessions") or []),
        d.get("inherited_events_skipped", 0)))
    log("Trae 会话 %d，事件 %d" % (len(t["sessions"]), len(t["events"])))
    log("Git 提交 %d" % len(result["git"]["commits"]))
    log("已写出 %s" % a.output)


if __name__ == "__main__":
    main()
