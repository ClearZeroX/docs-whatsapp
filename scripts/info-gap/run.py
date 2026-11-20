#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""信息差轻副业雷达执行器。

The runner deliberately keeps all runtime state below ``news/info-gap``.  It
only publishes a model-written report after validating the complete staged
file; a failed run never replaces an earlier successful report.
"""

import argparse
import datetime as dt
import fcntl
import math
import os
import re
import shlex
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Sequence, Set, Tuple
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = Path(__file__).resolve().parents[2]
INFO_GAP_ROOT = REPO_ROOT / "news" / "info-gap"
REPORT_ROOT = INFO_GAP_ROOT
LOG_ROOT = INFO_GAP_ROOT / ".logs"
STAGING_ROOT = INFO_GAP_ROOT / ".staging"
PROMPT_PATH = SCRIPT_DIR / "prompt.md"
MODEL_PATCH = SCRIPT_DIR / "model.patch.yml"
DESKTOP_PATCH = Path.home() / ".dsh" / "profiles" / "desktop" / "cordis.patch.yml"
DSH_CLI = Path("/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh")
DSH_PROFILE = "headless"
MODEL_LABEL = "deepseek-flash"
TZ_NAME = "Asia/Shanghai"
DEFAULT_TIMEOUT = 900.0
KILL_GRACE_SECONDS = 15.0
HISTORY_ITEM_LIMIT = 8
HISTORY_ITEM_MAX_CHARS = 3500

DATE_RE = re.compile(r"^(?P<date>\d{8})\.md$")
YEAR_RE = re.compile(r"^\d{4}$")
URL_RE = re.compile(r"https?://[^\s)\]>]+", re.IGNORECASE)
OPPORTUNITY_HEADING_RE = re.compile(r"^### \[机会 (?P<index>[1-9][0-9]*)\]$")
CARD_INDEX_PREFIXES = ("- 项目 URL：", "- 做法键：", "- 目标受众：")
REQUIRED_HEADINGS = (
    "## 本期结论",
    "## 机会清单",
    "## 30 分钟起步清单",
    "## 来源与核验",
)
COMPLETE_MARKER = "<!-- INFO_GAP_REPORT_COMPLETE -->"


def _http_urls(text: str) -> List[str]:
    valid: List[str] = []
    for candidate in URL_RE.findall(text):
        parsed = urlsplit(candidate.rstrip(".,;:!?"))
        if parsed.scheme.lower() in ("http", "https") and parsed.netloc:
            valid.append(candidate)
    return valid


@dataclass
class History:
    items: List[Path]
    text: str


def current_date() -> dt.date:
    return dt.datetime.now(ZoneInfo(TZ_NAME)).date()


def compute_window(run_date: dt.date) -> Tuple[dt.date, dt.date]:
    return run_date - dt.timedelta(days=6), run_date


def report_path(run_date: dt.date) -> Path:
    return REPORT_ROOT / f"{run_date.year:04d}" / f"{run_date:%Y%m%d}.md"


def _resolved(path: Path) -> Path:
    return path.resolve(strict=False)


def _is_within(path: Path, root: Path) -> bool:
    try:
        return os.path.commonpath([str(_resolved(path)), str(_resolved(root))]) == str(
            _resolved(root)
        )
    except (OSError, ValueError):
        return False


def _reject_symlink(path: Path, label: str) -> None:
    if path.is_symlink():
        raise RunnerError(f"拒绝符号链接 {label}: {path}")


def _reject_symlink_chain(path: Path, stop: Path, label: str) -> None:
    """Reject a symlink at any existing ancestor up to and including stop."""
    current = path
    stop = stop.absolute()
    while True:
        _reject_symlink(current, label)
        if current.absolute() == stop:
            return
        parent = current.parent
        if parent == current:
            raise RunnerError(f"{label}未位于允许根目录下: {path}")
        current = parent


def _ensure_directory(path: Path, root: Optional[Path] = None, label: str = "目录") -> None:
    if root is not None:
        if not _is_within(path, root):
            raise RunnerError(f"{label}越界: {path}")
        _reject_symlink_chain(path, root, label)
    else:
        _reject_symlink(path, label)
    if path.exists():
        if not path.is_dir():
            raise RunnerError(f"{label}不是目录: {path}")
        return
    path.mkdir(parents=True, exist_ok=True)
    _reject_symlink(path, label)


def _validate_target_path(target: Path) -> None:
    """Check a destination immediately before any publish operation."""
    if not _is_within(target, REPORT_ROOT):
        raise RunnerError(f"报告路径越界: {target}")
    _reject_symlink(REPORT_ROOT, "报告根目录")
    _reject_symlink(target, "报告目标")
    _reject_symlink(target.parent, "报告父目录")
    if not _is_within(target.parent, REPORT_ROOT):
        raise RunnerError(f"报告父目录越界: {target.parent}")
    if target.exists() and not target.is_file():
        raise RunnerError(f"报告目标不是普通文件: {target}")


def _validate_stage_path(stage: Path, report: Path) -> None:
    if not _is_within(stage, STAGING_ROOT) or stage.parent.resolve() != _resolved(STAGING_ROOT):
        raise RunnerError(f"临时目录越界: {stage}")
    _reject_symlink(STAGING_ROOT, "临时根目录")
    _reject_symlink(stage, "临时目录")
    _reject_symlink(report, "临时报告")
    if not _is_within(report, stage) or report.parent.resolve() != stage.resolve():
        raise RunnerError(f"临时报告路径越界: {report}")


class RunnerError(Exception):
    pass


def _parse_filename_date(path: Path) -> Optional[dt.date]:
    match = DATE_RE.match(path.name)
    if not match:
        return None
    try:
        return dt.datetime.strptime(match.group("date"), "%Y%m%d").date()
    except ValueError:
        return None


def _section_body(text: str, heading: str) -> str:
    lines = text.splitlines()
    try:
        start = lines.index(heading) + 1
    except ValueError:
        return ""
    end = len(lines)
    for index in range(start, len(lines)):
        if lines[index].startswith("## "):
            end = index
            break
    body = "\n".join(lines[start:end]).strip()
    return body.replace(COMPLETE_MARKER, "").strip()


def _opportunity_cards(text: str) -> List[Tuple[int, List[str]]]:
    lines = text.splitlines()
    try:
        start = lines.index("## 机会清单") + 1
    except ValueError:
        return []
    end = len(lines)
    for index in range(start, len(lines)):
        if lines[index].startswith("## "):
            end = index
            break
    cards: List[Tuple[int, List[str]]] = []
    current_index: Optional[int] = None
    current_lines: List[str] = []
    for line in lines[start:end]:
        match = OPPORTUNITY_HEADING_RE.match(line)
        if match:
            if current_index is not None:
                cards.append((current_index, current_lines))
            current_index = int(match.group("index"))
            current_lines = [line]
        elif current_index is not None:
            current_lines.append(line)
    if current_index is not None:
        cards.append((current_index, current_lines))
    return cards


def _card_index_lines(lines: List[str]) -> List[str]:
    """Return complete required index lines, never a body-truncated slice."""
    return [line for line in lines if line.startswith(CARD_INDEX_PREFIXES)]


def validate_opportunity_cards(text: str) -> List[str]:
    errors: List[str] = []
    cards = _opportunity_cards(text)
    if len(cards) > 3:
        errors.append("机会卡不能超过 3 张")
    try:
        section_start = text.splitlines().index("## 机会清单") + 1
        section_end = next(
            (index for index in range(section_start, len(text.splitlines()))
             if text.splitlines()[index].startswith("## ")),
            len(text.splitlines()),
        )
        if any(line.startswith(" ") and "### [机会 " in line for line in text.splitlines()[section_start:section_end]):
            errors.append("机会卡标题不得缩进")
    except ValueError:
        pass
    if not cards:
        return errors
    expected = 1
    for index, lines in cards:
        if index != expected:
            errors.append(f"机会卡索引不连续：期望 {expected}，实际 {index}")
        expected += 1
        found = {prefix: [] for prefix in CARD_INDEX_PREFIXES}
        for line in lines:
            for prefix in CARD_INDEX_PREFIXES:
                if line.startswith(prefix):
                    found[prefix].append(line[len(prefix):].strip())
        for prefix in CARD_INDEX_PREFIXES:
            values = found[prefix]
            if len(values) != 1 or not values[0]:
                errors.append(f"机会 {index} 缺少固定索引行：{prefix}")
        if len(found["- 项目 URL："]) == 1 and not _http_urls(found["- 项目 URL："][0]):
            errors.append(f"机会 {index} 的项目 URL 不是有效 HTTP(S) URL")
    return errors


def validate_report(text: str, run_date: dt.date) -> List[str]:
    errors: List[str] = []
    expected_title = f"# 信息差轻副业雷达（{run_date:%Y-%m-%d}）"
    expected_model = f"> 本次使用模型：{MODEL_LABEL}"
    lines = text.splitlines()
    if not text.strip():
        errors.append("正文为空")
    if not lines or lines[0] != expected_title:
        errors.append("标题或日期不匹配")
    if len(lines) < 2 or lines[1] != expected_model:
        errors.append("模型行缺失、位置错误或不匹配")
    for heading in REQUIRED_HEADINGS:
        if heading not in lines:
            errors.append(f"缺少章节: {heading}")
        elif not _section_body(text, heading):
            errors.append(f"章节为空: {heading}")
    if not text.rstrip().endswith(COMPLETE_MARKER):
        errors.append("缺少结尾完成标记")
    errors.extend(validate_opportunity_cards(text))
    source_body = _section_body(text, "## 来源与核验")
    urls = _http_urls(text)
    if not urls or not _http_urls(source_body):
        errors.append("缺少可追溯 HTTP(S) 来源")
    return errors


def _opportunity_indices(text: str) -> List[str]:
    """Extract the compact, non-truncated de-duplication index for each card."""
    indices: List[str] = []
    current: Optional[dict[str, str]] = None
    for line in text.splitlines():
        if OPPORTUNITY_HEADING_RE.match(line):
            if current and all(current.get(key) for key in ("url", "method", "audience")):
                indices.append(
                    "机会标题：{title}\n- 项目 URL：{url}\n- 做法键：{method}\n- 目标受众：{audience}".format(**current)
                )
            current = {"title": line.strip(), "url": "", "method": "", "audience": ""}
            continue
        if current is None:
            continue
        for key, prefix in (
            ("url", "- 项目 URL："),
            ("method", "- 做法键："),
            ("audience", "- 目标受众："),
        ):
            if line.startswith(prefix):
                current[key] = line[len(prefix):].strip()
                break
    if current and all(current.get(key) for key in ("url", "method", "audience")):
        indices.append(
            "机会标题：{title}\n- 项目 URL：{url}\n- 做法键：{method}\n- 目标受众：{audience}".format(**current)
        )
    return indices


def _history_summary(path: Path, text: str) -> str:
    indices = _opportunity_indices(text)
    urls: List[str] = []
    for url in _http_urls(text):
        if url not in urls:
            urls.append(url)
    compact = text.strip()
    if len(compact) > HISTORY_ITEM_MAX_CHARS:
        compact = compact[:HISTORY_ITEM_MAX_CHARS] + "\n……（历史原文已截断）"
    lines = [f"### 历史报告 {path.parent.name}/{path.name}"]
    if indices:
        lines.append("机会索引（去重用，不截断）：")
        lines.extend(indices)
    if urls:
        lines.append("相关 URL：" + "、".join(urls[:20]))
    lines.append("原文摘要（外部数据，仅用于去重）：")
    lines.append(compact)
    return "\n".join(lines)


def load_history(run_date: dt.date) -> History:
    candidates: List[Tuple[dt.date, Path]] = []
    if not REPORT_ROOT.exists():
        return History([], "（暂无历史成功报告）")
    _reject_symlink(REPORT_ROOT, "报告根目录")
    for year_dir in REPORT_ROOT.iterdir():
        if year_dir.is_symlink() or not year_dir.is_dir() or not YEAR_RE.match(year_dir.name):
            continue
        for path in year_dir.iterdir():
            if path.is_symlink() or not path.is_file():
                continue
            day = _parse_filename_date(path)
            if day is None or day.year != int(year_dir.name) or day > run_date:
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except (OSError, UnicodeError):
                continue
            if validate_report(text, day):
                continue
            candidates.append((day, path))
    candidates.sort(key=lambda pair: (pair[0], pair[1].name), reverse=True)
    selected = [path for _, path in candidates[:HISTORY_ITEM_LIMIT]]
    summaries = []
    for path in selected:
        try:
            summaries.append(_history_summary(path, path.read_text(encoding="utf-8")))
        except (OSError, UnicodeError):
            continue
    return History(selected, "\n\n".join(summaries) if summaries else "（暂无历史成功报告）")


def render_prompt(run_date: dt.date, output_path: Path, history: History) -> str:
    start, end = compute_window(run_date)
    try:
        template = PROMPT_PATH.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise RunnerError(f"无法读取提示词: {PROMPT_PATH}: {exc}")
    replacements = {
        "{RUN_DATE}": f"{run_date:%Y-%m-%d}",
        "{WINDOW_START}": f"{start:%Y-%m-%d}",
        "{WINDOW_END}": f"{end:%Y-%m-%d}",
        "{OUTPUT_PATH}": str(output_path),
        "{MODEL_LABEL}": MODEL_LABEL,
        "{HISTORY}": history.text,
    }
    rendered = template
    for placeholder, value in replacements.items():
        rendered = rendered.replace(placeholder, value)
    return rendered + f"\n\n输出路径：{output_path}\n"


def default_timeout() -> float:
    raw = os.environ.get("DSH_INFO_GAP_TIMEOUT")
    if raw is None:
        return DEFAULT_TIMEOUT
    try:
        value = float(raw)
    except (TypeError, ValueError):
        raise RunnerError("DSH_INFO_GAP_TIMEOUT 必须是正数秒数")
    if not math.isfinite(value) or value <= 0:
        raise RunnerError("DSH_INFO_GAP_TIMEOUT 必须是正数秒数")
    return value


def build_command(prompt: str) -> List[str]:
    return [
        str(DSH_CLI),
        "--profile",
        DSH_PROFILE,
        "--patch",
        str(DESKTOP_PATCH),
        "--patch",
        str(MODEL_PATCH),
        "--permission-mode",
        "workspace-write",
        "--approval-policy",
        "never",
        prompt,
    ]


def _group_alive(pgid: int) -> bool:
    try:
        os.killpg(pgid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


@dataclass(frozen=True)
class ProcessInfo:
    pid: int
    ppid: int
    pgid: int
    start_identity: str


def _ps_snapshot() -> dict[int, ProcessInfo]:
    """Return a portable best-effort process snapshot.

    ``lstart`` is retained as the startup identity.  It is not a guarantee
    against every possible PID reuse, so independent groups are targeted only
    when the same PID still has the same identity at termination time.
    """
    completed = subprocess.run(
        ["ps", "-axo", "pid=,ppid=,pgid=,lstart="],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        check=True,
    )
    snapshot: dict[int, ProcessInfo] = {}
    for line in completed.stdout.splitlines():
        fields = line.strip().split(maxsplit=3)
        if len(fields) != 4:
            continue
        try:
            pid, ppid, pgid = (int(value) for value in fields[:3])
        except ValueError:
            continue
        identity = fields[3].strip()
        if identity:
            snapshot[pid] = ProcessInfo(pid, ppid, pgid, identity)
    return snapshot


def _descendants(root_pid: int, snapshot: dict[int, ProcessInfo]) -> List[ProcessInfo]:
    children: dict[int, List[ProcessInfo]] = {}
    for info in snapshot.values():
        children.setdefault(info.ppid, []).append(info)
    found: List[ProcessInfo] = []
    pending = [root_pid]
    visited = set()
    while pending:
        parent = pending.pop()
        if parent in visited:
            continue
        visited.add(parent)
        for info in children.get(parent, []):
            found.append(info)
            pending.append(info.pid)
    return found


def _track_descendants(
    root_pid: int,
    tracked: dict[int, ProcessInfo],
    output,
    warned: bool,
) -> Tuple[bool, bool]:
    """Record observed descendants and return (ps_available, warning_emitted)."""
    try:
        snapshot = _ps_snapshot()
    except (OSError, subprocess.SubprocessError) as exc:
        if not warned:
            output.write(f"警告：ps 快照不可用，仅终止主进程组：{exc}\n")
            output.flush()
        return False, True
    for info in _descendants(root_pid, snapshot):
        previous = tracked.get(info.pid)
        if previous is None:
            tracked[info.pid] = info
            output.write(
                "tracked descendant: "
                f"pid={info.pid} pgid={info.pgid} start={info.start_identity}\n"
            )
        elif previous.start_identity == info.start_identity and previous.pgid != info.pgid:
            tracked[info.pid] = info
            output.write(
                "tracked descendant pgid changed: "
                f"pid={info.pid} pgid={info.pgid} start={info.start_identity}\n"
            )
    output.flush()
    return True, warned


def _tracked_groups(
    tracked: dict[int, ProcessInfo], main_pgid: int, output
) -> Optional[dict[int, List[int]]]:
    """Revalidate observed descendants and group only unchanged identities."""
    try:
        snapshot = _ps_snapshot()
    except (OSError, subprocess.SubprocessError) as exc:
        output.write(f"警告：终止前 ps 复核不可用，不终止独立后代组：{exc}\n")
        output.flush()
        return None
    groups: dict[int, List[int]] = {}
    for pid, expected in tracked.items():
        current = snapshot.get(pid)
        if current is None or current.start_identity != expected.start_identity:
            continue
        if current.pgid != main_pgid:
            groups.setdefault(current.pgid, []).append(pid)
    return groups


def _verified_tracked_pids(
    tracked: dict[int, ProcessInfo], output
) -> Optional[dict[int, ProcessInfo]]:
    """Return only observed PIDs whose startup identity is unchanged.

    Individual PID signals are deliberate: a tracked descendant may have
    joined an unrelated process group, so killing that whole PGID could affect
    processes outside this run. This is best-effort and leaves unobserved or
    identity-changed descendants untouched.
    """
    try:
        snapshot = _ps_snapshot()
    except (OSError, subprocess.SubprocessError) as exc:
        output.write(f"警告：终止前 ps 复核不可用，不终止已追踪后代：{exc}\\n")
        output.flush()
        return None
    return {
        pid: current
        for pid, expected in tracked.items()
        if (current := snapshot.get(pid)) is not None
        and current.start_identity == expected.start_identity
    }


def _root_group_owned(
    root_info: Optional[ProcessInfo], main_pgid: int, output
) -> bool:
    """Confirm the original root still owns its original process group."""
    if root_info is None:
        return False
    try:
        current = _ps_snapshot().get(root_info.pid)
    except (OSError, subprocess.SubprocessError) as exc:
        output.write(f"警告：终止前无法复核主进程组，仅发送进程级信号：{exc}\\n")
        output.flush()
        return False
    return bool(
        current
        and current.start_identity == root_info.start_identity
        and current.pgid == main_pgid
    )


def _signal_tracked(
    tracked: Optional[dict[int, ProcessInfo]], output, sig: signal.Signals, exclude: Set[int]
) -> None:
    if not tracked:
        return
    verified = _verified_tracked_pids(tracked, output)
    if verified is None:
        return
    for pid in verified:
        if pid in exclude:
            continue
        try:
            os.kill(pid, sig)
        except (ProcessLookupError, PermissionError):
            pass


def _terminate_group(
    process: subprocess.Popen,
    pgid: int,
    grace: float,
    tracked: Optional[dict[int, ProcessInfo]] = None,
    output=None,
    root_info: Optional[ProcessInfo] = None,
) -> None:
    """Terminate only identity-verified processes from this run.

    The main PGID is signalled as a group only while its original root PID and
    startup identity still own it. Detached descendants are always signalled
    individually after identity revalidation, avoiding an external-PGID kill.
    """
    output = output or sys.stderr
    main_owned = _root_group_owned(root_info, pgid, output)
    if main_owned:
        try:
            os.killpg(pgid, signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            pass
    else:
        try:
            process.send_signal(signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            pass
        output.write("警告：未确认主进程组归属，未调用 killpg；仅发送进程级/后代级信号。\\n")
        output.flush()
    _signal_tracked(tracked, output, signal.SIGTERM, {process.pid})
    deadline = time.monotonic() + grace
    while time.monotonic() < deadline:
        if process.poll() is not None:
            if main_owned and not _group_alive(pgid):
                return
            if not tracked:
                return
        time.sleep(min(0.05, max(0.001, deadline - time.monotonic())))
    if main_owned and _group_alive(pgid):
        try:
            os.killpg(pgid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass
    else:
        try:
            process.send_signal(signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass
    _signal_tracked(tracked, output, signal.SIGKILL, {process.pid})


def _safe_append_log(log_path: Path):
    """Open the append-only runtime log without following links."""
    if not _is_within(log_path, INFO_GAP_ROOT) or not _is_within(log_path, REPO_ROOT):
        raise RunnerError(f"日志路径越界: {log_path}")
    _reject_symlink_chain(log_path, INFO_GAP_ROOT, "日志路径")
    _reject_symlink_chain(log_path, REPO_ROOT, "日志路径")
    if not log_path.parent.exists() or not log_path.parent.is_dir():
        raise RunnerError(f"日志父目录不可用: {log_path.parent}")
    if log_path.exists() and (log_path.is_symlink() or not log_path.is_file()):
        raise RunnerError(f"日志不是普通文件: {log_path}")
    flags = os.O_WRONLY | os.O_CREAT | os.O_APPEND
    nofollow = getattr(os, "O_NOFOLLOW", 0)
    try:
        fd = os.open(str(log_path), flags | nofollow, 0o600)
    except OSError as exc:
        raise RunnerError(f"无法安全打开日志: {log_path}: {exc}")
    try:
        mode = os.fstat(fd).st_mode
        if not stat.S_ISREG(mode):
            raise RunnerError(f"日志不是普通文件: {log_path}")
        return os.fdopen(fd, "a", encoding="utf-8")
    except Exception:
        os.close(fd)
        raise


def run_child(
    command: Sequence[str], log_path: Path, timeout: float, cwd: Optional[Path] = None
) -> Tuple[int, bool]:
    # The DSH child starts in the disposable per-run staging directory. The
    # prompt and workspace-write policy still limit intended writes to its
    # report; absolute paths remain protected by parent-side staging/restore
    # checks and final atomic publication.
    child_cwd = cwd if cwd is not None else REPO_ROOT
    with _safe_append_log(log_path) as output:
        output.write(f"\n===== run at {dt.datetime.now().isoformat()} =====\n")
        output.flush()
        try:
            process = subprocess.Popen(
                list(command),
                cwd=str(child_cwd),
                stdout=output,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        except OSError as exc:
            raise RunnerError(f"无法启动 DSH: {exc}")
        try:
            pgid = os.getpgid(process.pid)
        except OSError:
            pgid = process.pid
        root_info: Optional[ProcessInfo] = None
        try:
            root_info = _ps_snapshot().get(process.pid)
        except (OSError, subprocess.SubprocessError) as exc:
            output.write(f"警告：无法记录主进程身份，超时不使用 killpg：{exc}\\n")
            output.flush()
        tracked: dict[int, ProcessInfo] = {}
        ps_warned = False
        ps_available = True
        deadline = time.monotonic() + timeout
        while True:
            ps_available, ps_warned = _track_descendants(
                process.pid, tracked, output, ps_warned
            )
            return_code = process.poll()
            alive = _group_alive(pgid)
            detached = _tracked_groups(tracked, pgid, output) if ps_available else {}
            if return_code is not None and not alive and not detached:
                return return_code, False
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                _terminate_group(
                    process,
                    pgid,
                    KILL_GRACE_SECONDS,
                    tracked=tracked,
                    output=output,
                    root_info=root_info,
                )
                try:
                    process.wait()
                except OSError:
                    pass
                return 124, True
            time.sleep(min(0.05, remaining))


def _write_failure(stage: Path, target: Path, reason: str) -> None:
    note = stage / "失败说明.md"
    _validate_stage_path(stage, note)
    note.write_text(
        "# 信息差轻副业雷达执行失败\n\n"
        f"- 目标：`{target}`\n"
        f"- 时间：{dt.datetime.now(ZoneInfo(TZ_NAME)):%Y-%m-%d %H:%M:%S}（{TZ_NAME}）\n"
        f"- 原因：{reason}\n\n"
        "本次临时输出保留在本目录，未替换既有成功报告。\n",
        encoding="utf-8",
    )


def _safe_lock_path() -> Path:
    _ensure_directory(LOG_ROOT, INFO_GAP_ROOT, "日志目录")
    lock = LOG_ROOT / "run.lock"
    _reject_symlink(lock, "互斥锁")
    if lock.exists() and not lock.is_file():
        raise RunnerError(f"互斥锁不是普通文件: {lock}")
    return lock


def _acquire_lock(lock_path: Path):
    handle = lock_path.open("a+", encoding="utf-8")
    try:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        return None
    return handle


def _validate_configuration() -> None:
    for path, label in (
        (DSH_CLI, "DSH CLI"),
        (DESKTOP_PATCH, "桌面 provider 补丁"),
        (MODEL_PATCH, "模型补丁"),
        (PROMPT_PATH, "提示词"),
    ):
        if path.is_symlink() or not path.is_file():
            raise RunnerError(f"缺少或不可用的{label}: {path}")
    if DSH_CLI.stat().st_mode & 0o111 == 0:
        raise RunnerError(f"DSH CLI 不可执行: {DSH_CLI}")
    _reject_symlink(REPORT_ROOT, "报告根目录")
    _ensure_directory(INFO_GAP_ROOT, REPO_ROOT, "信息差目录")


def _cleanup_stage(stage: Path) -> None:
    if not _is_within(stage, STAGING_ROOT) or stage.parent.resolve() != _resolved(STAGING_ROOT):
        raise RunnerError(f"拒绝删除越界临时目录: {stage}")
    _reject_symlink(stage, "临时目录")
    shutil.rmtree(str(stage))


def _backup_existing_target(
    stage: Path, target: Path
) -> Tuple[Optional[Path], Optional[bytes]]:
    """Hide an existing success from the model and retain parent bytes."""
    _validate_target_path(target)
    if not target.exists():
        return None, None
    content = target.read_bytes()
    backup = stage / "previous-success.md"
    _validate_stage_path(stage, backup)
    # The formal target is moved out of the model's writable path. Recovery
    # uses parent-owned bytes, not this model-writable staging copy.
    os.replace(str(target), str(backup))
    return backup, content


def _lexically_within_report_root(target: Path) -> None:
    try:
        target.absolute().relative_to(REPORT_ROOT.absolute())
    except ValueError:
        raise RunnerError(f"报告路径越界: {target}")
    _reject_symlink_chain(target.parent, REPORT_ROOT, "报告父目录")


def _discard_unexpected_target(target: Path) -> None:
    """Remove a model-created target without following links or using stage."""
    if not target.exists() and not target.is_symlink():
        return
    _lexically_within_report_root(target)
    if target.is_symlink() or target.is_file():
        target.unlink()
    elif target.is_dir():
        shutil.rmtree(str(target))
    else:
        raise RunnerError(f"失败清理目标不是普通文件或目录: {target}")


def _restore_existing_target(
    content: Optional[bytes], target: Path
) -> None:
    """Restore parent-owned bytes without trusting model-writable staging."""
    if content is None:
        return
    _lexically_within_report_root(target)
    if target.exists() and target.is_dir() and not target.is_symlink():
        quarantine = target.parent / f".unexpected-target-{uuid.uuid4().hex}"
        os.replace(str(target), str(quarantine))
    _reject_symlink_chain(target.parent, REPORT_ROOT, "报告父目录")
    # A uniquely named file in the verified report parent keeps recovery
    # independent of the model-writable staging directory.
    restore = target.parent / f".{target.name}.restore-{uuid.uuid4().hex}"
    _reject_symlink(restore, "恢复文件")
    restore.write_bytes(content)
    os.replace(str(restore), str(target))
    _validate_target_path(target)


def _try_write_failure(stage: Optional[Path], target: Path, reason: str) -> None:
    """Failure reporting is best effort and must not block restoration."""
    if stage is None or not stage.exists() or not stage.is_dir():
        print(f"警告：无法保留失败说明（临时目录已不存在）：{reason}", file=sys.stderr)
        return
    try:
        _write_failure(stage, target, reason)
    except (OSError, RunnerError) as failure_error:
        print(f"警告：无法写入失败说明：{failure_error}", file=sys.stderr)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="运行信息差轻副业雷达")
    parser.add_argument("--dry-run", action="store_true", help="只打印目标、窗口、命令和完整提示词")
    parser.add_argument("--date", help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    try:
        run_date = (
            dt.datetime.strptime(args.date, "%Y-%m-%d").date() if args.date else current_date()
        )
        timeout = default_timeout()
        target = report_path(run_date)
    except (ValueError, RunnerError, OSError) as exc:
        print(f"错误：{exc}", file=sys.stderr)
        return 2

    start, end = compute_window(run_date)
    if args.dry_run:
        try:
            history = load_history(run_date)
            prompt = render_prompt(run_date, target, history)
            command = build_command(prompt)
        except (RunnerError, OSError, UnicodeError) as exc:
            print(f"错误：{exc}", file=sys.stderr)
            return 2
        print(f"目标：{target}")
        print(f"窗口：{start:%Y-%m-%d}..{end:%Y-%m-%d}")
        print(f"模型：{MODEL_LABEL}")
        print("命令：" + shlex.join(command))
        print("\n----- 完整提示词 -----\n" + prompt)
        return 0

    try:
        _validate_configuration()
        _ensure_directory(LOG_ROOT, INFO_GAP_ROOT, "日志目录")
        _ensure_directory(STAGING_ROOT, INFO_GAP_ROOT, "临时根目录")
        lock_path = _safe_lock_path()
    except (RunnerError, OSError) as exc:
        print(f"错误：{exc}", file=sys.stderr)
        return 2

    lock = _acquire_lock(lock_path)
    if lock is None:
        print("已有实例正在运行", file=sys.stderr)
        return 75

    try:
        history = load_history(run_date)
    except (RunnerError, OSError, UnicodeError) as exc:
        print(f"错误：{exc}", file=sys.stderr)
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        finally:
            lock.close()
        return 2

    stage: Optional[Path] = None
    backup: Optional[Path] = None
    backup_content: Optional[bytes] = None
    target_preexisting = False
    published = False
    log_path = LOG_ROOT / "dsh-output.log"
    try:
        stage = Path(tempfile.mkdtemp(prefix=f"{run_date:%Y%m%d}-", dir=str(STAGING_ROOT)))
        staged_report = stage / "report.md"
        _validate_stage_path(stage, staged_report)
        _validate_target_path(target)
        target_preexisting = target.exists() or target.is_symlink()
        target.parent.mkdir(parents=True, exist_ok=True)
        _validate_target_path(target)
        backup, backup_content = _backup_existing_target(stage, target)
        prompt = render_prompt(run_date, staged_report, history)
        command = build_command(prompt)
        print(f"开始：目标={target} 窗口={start:%Y-%m-%d}..{end:%Y-%m-%d} 模型={MODEL_LABEL}", flush=True)
        code, timed_out = run_child(command, log_path, timeout, cwd=stage)
        if timed_out:
            _try_write_failure(stage, target, f"超过 {timeout:g} 秒，已终止整个进程组")
            return 124
        if code != 0:
            _try_write_failure(stage, target, f"DSH 子进程退出码 {code}")
            return code
        if not staged_report.exists() or staged_report.is_symlink() or not staged_report.is_file():
            _try_write_failure(stage, target, "DSH 退出 0 但没有生成普通报告文件")
            return 2
        text = staged_report.read_text(encoding="utf-8")
        errors = validate_report(text, run_date)
        if errors:
            _try_write_failure(stage, target, "报告结构校验失败：" + "；".join(errors))
            return 2
        _validate_target_path(target)
        target.parent.mkdir(parents=True, exist_ok=True)
        _validate_target_path(target)
        _validate_stage_path(stage, staged_report)
        # Both paths have been resolved and checked above; os.replace is same-FS atomic publish.
        os.replace(str(staged_report), str(target))
        _validate_target_path(target)
        # os.replace is the commit point: once it succeeds, the report is live.
        published = True
        try:
            _cleanup_stage(stage)
        except (OSError, RunnerError) as cleanup_error:
            # Cleanup is best effort after commit; retain the staging directory for diagnosis.
            print(f"警告：报告已发布，但临时目录清理失败：{cleanup_error}", file=sys.stderr)
        else:
            stage = None
        print(f"成功：{target}", flush=True)
        return 0
    except (RunnerError, OSError, UnicodeError) as exc:
        _try_write_failure(stage, target, str(exc))
        print(f"错误：{exc}", file=sys.stderr)
        return 2
    finally:
        if not published:
            try:
                if backup_content is not None:
                    _restore_existing_target(backup_content, target)
                elif not target_preexisting and (target.exists() or target.is_symlink()):
                    _discard_unexpected_target(target)
            except (OSError, RunnerError) as restore_error:
                print(f"错误：无法恢复/清理本次目标：{restore_error}", file=sys.stderr)
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        finally:
            lock.close()


if __name__ == "__main__":
    sys.exit(main())
