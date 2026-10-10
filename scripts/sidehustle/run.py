#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
个人开发者副业风口 · 周报 —— 定时任务执行器（由 launchd 调用）

【修改配置请只看下面 CONFIG 段】改完保存即生效，不需要重新加载 launchd。
也可以用环境变量临时覆盖：DSH_SIDEHUSTLE_TIMEOUT=900（秒）。
"""

import datetime
import glob
import os
import re
import signal
import subprocess
import sys
import time
from pathlib import Path
from zoneinfo import ZoneInfo

# ==================== CONFIG：要改东西，基本只改这一段 ====================

# 单次执行超时（秒）。当前 900 = 15 分钟（素材比日报多，留得更宽）。
# 超时后：先 SIGTERM、等待 KILL_GRACE_SECONDS，仍未退出则 SIGKILL 整个进程组；
# 随后把当周文档重命名为 "<名称>-执行超时.md"，脚本以退出码 124 结束。
TIMEOUT_SECONDS = 900

# DSH 无头入口（App 包内文件；若 App 被移动/改名，这里要同步改）
DSH_CLI = "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"

# 使用的 profile 与模型配置补丁（--patch 可叠加，后面覆盖前面）。
DSH_PROFILE = "headless"
DSH_PATCH = "/Users/opay-20260271/.dsh/profiles/desktop/cordis.patch.yml"

# 本文件所在目录；同目录内的资源一律按它推算，整个需求目录可整体挪动而不必改代码。
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SIDEHUSTLE_MODEL_PATCH = os.path.join(SCRIPT_DIR, "model.patch.yml")
SELF_PATH = os.path.abspath(__file__)

# 仅用于日志与生成文件顶部那行的显示；真正生效的模型在 model.patch.yml 里
MODEL_LABEL = "deepseek-v4.1-flash"

# 工作目录 = 无头会话的写入边界（workspace-write 只允许写此处及系统临时目录）。
WORKDIR = "/Users/opay-20260271/code-temp/ai-md"

# 日志目录
LOG_DIR = "/Users/opay-20260271/code-temp/ai-md/.dsh-sidehustle-logs"

# 日报目录与周报目录
NEWS_DIR = "/Users/opay-20260271/code-temp/ai-md/whatsapp_crm_docs/news"
SIDEHUSTLE_DIR = os.path.join(NEWS_DIR, "sidehustle")

# 超时后追加到文件名末尾的后缀（加在 .md 之前）
TIMEOUT_SUFFIX = "-执行超时"

# 判断"今天/数据窗口"所用时区
TZ_NAME = "Asia/Shanghai"

# 数据窗口：汇总「截至周二的前 7 天」= [运行日-7天, 运行日-1天]，共 7 天。
WINDOW_DAYS = 7

# SIGTERM 之后等待多久再 SIGKILL
KILL_GRACE_SECONDS = 15

# 单份日报塞进提示词的最大字符数，超长则截断（一般一份约 8KB，不会超）
DAILY_MATERIAL_MAX_CHARS = 9000

# 任务提示词模板。{DAILY_MATERIAL} / {START} / {END} / {OUTPUT_PATH} / {PREV_DIRECTIONS} 由脚本填充。
PROMPT_TEMPLATE = """<!-- DSH_AUTOMATION_RUN:weekly-ai-sidehustle -->
你是资深独立开发副业顾问。根据下方【本周 AI 行业日报素材】与【细粒度信号源】，为一位 8 年经验的 Java 后端工程师，产出一份《个人开发者副业风口与实施方案》周报。

【本周日报素材（宏观方向锚，已按日期贴出；缺的日期说明当天无日报）】
{DAILY_MATERIAL}

【细粒度信号源（微观找点，需你用 curl 现抓，均已实测可用）】
- Hacker News 首页 RSS：https://hnrss.org/frontpage
- GitHub Trending：https://github.com/trending
- Product Hunt RSS：https://www.producthunt.com/feed
- V2EX（中文技术社区，含独立开发/副业讨论）：https://www.v2ex.com/index.xml
- 少数派：https://sspai.com/feed
- Reddit r/SideProject：https://www.reddit.com/r/SideProject/.rss
注意：indiehackers.com（403）、掘金/即刻（SPA）curl 抓不到，不要浪费时间去试。

【已写过的方向（请避开，不要与其中任何一个重复）】
{PREV_DIRECTIONS}

【任务】
结合"宏观方向（日报）+ 微观切入点（细粒度信号）"，精选 3 个当下值得个人开发者做的副业风口，分三档各 1 条：
- A 轻量试水：每周 ≤5 小时、近零成本，能快速上线验证，优先复用已有 Java 能力
- B 稳健副业：每周 5-15 小时、可少量成本，目标月入 2k-1w，愿维护 3-6 个月
- C 产品化：可做成可收费的 SaaS / 工具，接受更长周期与更高投入，奔着副业转主业

【硬性要求】
- 3 个方向彼此不重复；每条标题前标注档位【A】【B】【C】。
- 每个方向按下面固定结构写完整版：
  1. 机会点（一句话概括）
  2. 为什么是现在（挂钩本周日报里的具体热点或细粒度信号，注明来源）
  3. 目标用户 + 具体痛点（"细化的点"，越具体越好）
  4. MVP 范围（核心功能 / 明确砍掉什么）
  5. 技术方案 —— 站在 8 年 Java 视角给选型（Spring Boot / LangChain4j / Quarkus 等）+ 关键模块 + 可复用的现成库/框架
  6. 变现方式（定价 + 渠道）
  7. 投入估算（时间 / 成本）
  8. 风险与壁垒
  9. 第一步行动（本周就能做的一件具体的事）

【输出】
写入文件：{OUTPUT_PATH}（目录不存在则先创建）。
文件格式：
- 一级标题：# 个人开发者副业风口 · 周报（{START}~{END}）
- 一级标题下方紧跟一行引用块：> 本次使用模型：{MODEL_LABEL}
- 再一行引用块说明数据窗口（{START}~{END}）与三档定义的一句话提示
- 正文分三节，每个方向一个大节（## 级别），小标题用 ### 级别
- 结尾写一段「本周机会小结 + 建议优先做哪一个」
内容用中文。完成后在结果里简要列出 3 个方向。"""

# ==================== 以下一般不需要改动 ====================

TIMEOUT_SECONDS = int(os.environ.get("DSH_SIDEHUSTLE_TIMEOUT", TIMEOUT_SECONDS))


def log(message: str) -> None:
    stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{stamp}] {message}"
    print(line, flush=True)
    try:
        with open(os.path.join(LOG_DIR, "run.log"), "a", encoding="utf-8") as handle:
            handle.write(line + "\n")
    except OSError:
        pass


def window_dates():
    """返回 (start, end)，end = 运行日前一天，start = end - (WINDOW_DAYS-1) 天，共 7 天。"""
    tz = ZoneInfo(TZ_NAME)
    today = datetime.datetime.now(tz).date()
    end = today - datetime.timedelta(days=1)
    start = end - datetime.timedelta(days=WINDOW_DAYS - 1)
    return start, end


def output_path(start, end):
    year_dir = Path(SIDEHUSTLE_DIR) / f"{end.year}"
    filename = f"{start:%Y%m%d}-{end:%Y%m%d}.md"
    return year_dir / filename


def find_daily_file(day):
    f = (
        Path(NEWS_DIR)
        / f"{day.year}年{day.month:02d}月"
        / f"{day.year}年{day.month:02d}月{day.day:02d}日.md"
    )
    return f if f.exists() else None


def gather_daily_material(start, end):
    """把窗口内每天的日报正文拼成素材串。"""
    parts = []
    d = start
    while d <= end:
        f = find_daily_file(d)
        if f is None:
            parts.append(f"### {d:%Y-%m-%d}\n（当日无日报）")
        else:
            text = f.read_text(encoding="utf-8")
            if len(text) > DAILY_MATERIAL_MAX_CHARS:
                text = text[:DAILY_MATERIAL_MAX_CHARS] + "\n……（截断）"
            parts.append(f"### {d:%Y-%m-%d}\n{text.strip()}")
        d += datetime.timedelta(days=1)
    return "\n\n".join(parts)


def previous_directions(current: Path):
    """读取上一期周报里的方向标题，用于去重。"""
    try:
        files = sorted(
            Path(SIDEHUSTLE_DIR).glob(f"*/*.md"), key=lambda p: p.name, reverse=True
        )
        for f in files:
            if f.resolve() == current.resolve():
                continue
            if not re.match(r"^\d{8}-\d{8}", f.name):
                continue
            text = f.read_text(encoding="utf-8")
            heads = [ln.strip() for ln in text.splitlines() if ln.startswith("## ")]
            if heads:
                return "\n".join(f"- {h}" for h in heads[:6])
            return "（上一期存在但未能识别方向标题）"
    except OSError:
        pass
    return "（暂无历史周报）"


def mark_timeout(target: Path, run_started_at: float) -> str:
    """超时后给当周文档加 -执行超时 后缀；若本次没写出文件，则写一个提示文件。"""
    if target.exists() and target.stat().st_mtime >= run_started_at:
        if target.stem.endswith(TIMEOUT_SUFFIX):
            return f"already marked: {target.name}"
        marked = target.with_name(f"{target.stem}{TIMEOUT_SUFFIX}{target.suffix}")
        target.replace(marked)
        return f"renamed partial output -> {marked.name}"

    target.parent.mkdir(parents=True, exist_ok=True)
    started = datetime.datetime.fromtimestamp(run_started_at, ZoneInfo(TZ_NAME))
    target.parent.mkdir(parents=True, exist_ok=True)
    note = target.with_name(f"{target.stem}{TIMEOUT_SUFFIX}{target.suffix}")
    note.write_text(
        "# 执行超时（本次未产出完整内容）\n\n"
        f"- 运行开始：{started:%Y-%m-%d %H:%M:%S}（{TZ_NAME}）\n"
        f"- 超时上限：{TIMEOUT_SECONDS} 秒\n"
        "- 状态：进程在超时后被终止，未生成完整的周报。\n\n"
        "## 如何手动重跑\n\n"
        "双击 `news/sidehustle/重新执行副业任务.command`，或在终端执行：\n\n"
        "```bash\n"
        f"/usr/bin/python3 {SELF_PATH}\n"
        "```\n\n"
        "> 本文件由执行器在超时时自动生成，重跑成功后不会自动删除。\n",
        encoding="utf-8",
    )
    return f"no output file this run; wrote notice -> {note.name}"


def main() -> int:
    os.makedirs(LOG_DIR, exist_ok=True)
    os.chdir(WORKDIR)

    start, end = window_dates()
    target = output_path(start, end)
    daily = gather_daily_material(start, end)
    prev = previous_directions(target)

    prompt = PROMPT_TEMPLATE.format(
        DAILY_MATERIAL=daily,
        START=f"{start:%Y-%m-%d}",
        END=f"{end:%Y-%m-%d}",
        OUTPUT_PATH=str(target),
        MODEL_LABEL=MODEL_LABEL,
        PREV_DIRECTIONS=prev,
    )

    command = [
        DSH_CLI,
        "--profile", DSH_PROFILE,
        "--patch", DSH_PATCH,
        "--patch", SIDEHUSTLE_MODEL_PATCH,
        prompt,
    ]
    log(
        f"START timeout={TIMEOUT_SECONDS}s model={MODEL_LABEL} "
        f"window={start:%Y%m%d}-{end:%Y%m%d} -> {target}"
    )
    run_started_at = time.time()

    output_file = os.path.join(LOG_DIR, "dsh-output.log")
    with open(output_file, "a", encoding="utf-8") as output:
        output.write(f"\n===== run at {datetime.datetime.now().isoformat()} =====\n")
        output.flush()
        process = subprocess.Popen(
            command,
            stdout=output,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        try:
            code = process.wait(timeout=TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            log(f"TIMEOUT after {TIMEOUT_SECONDS}s -> SIGTERM")
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                code = process.wait(timeout=KILL_GRACE_SECONDS)
            except subprocess.TimeoutExpired:
                log("still alive -> SIGKILL")
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                code = process.wait()
            log(f"TIMEOUT marked: {mark_timeout(target, run_started_at)}")
            log(f"END exit={code} (killed by timeout)")
            return 124

    log(f"END exit={code}")
    return code


if __name__ == "__main__":
    sys.exit(main())