#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
工作日报 / 周报 / 月报 —— 执行器

链路（与「自动化新闻任务」完全一致）：
  launchd 触发本脚本(带 --mode)
    └─ 计算增量窗口（读水位线 state.json）
    └─ 拉起 DSH 无头模式，注入窗口与产物路径
         └─ 无头 Agent 只读采集 Codex / Trae / git 记录 → 写出 Markdown
    └─ 成功(exit=0)后推进水位线；超时则给产物加 `-执行超时` 后缀

用法：
  /usr/bin/python3 run-work-report.py --mode daily
  /usr/bin/python3 run-work-report.py --mode weekly
  /usr/bin/python3 run-work-report.py --mode monthly
  /usr/bin/python3 run-work-report.py --mode daily --start '2026-10-08 00:00:00' --end '2026-10-09 00:00:00'
  /usr/bin/python3 run-work-report.py --mode daily --dry-run      # 只打印窗口与提示词

环境变量覆盖：
  DSH_WR_TIMEOUT   单次执行超时秒数
  DSH_WR_MODE      等价于 --mode
"""

import argparse
import datetime as dt
import json
import os
import re
import signal
import subprocess
import sys
import time

# ============================== CONFIG ==============================
DSH_CLI = "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
BASE_PATCH = os.path.expanduser("~/.dsh/profiles/desktop/cordis.patch.yml")

# 本文件所在目录（= 本需求的脚本目录）。
# 同目录内的资源一律按它推算，这样整个需求目录可以整体挪动/改名而不必改代码。
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATCH = os.path.join(SCRIPT_DIR, "model.patch.yml")
COLLECT_PY = os.path.join(SCRIPT_DIR, "collect.py")
# 手动重跑时提示用的自身路径
SELF_PATH = os.path.abspath(__file__)

# 工作目录 = 沙箱写入边界。产物必须落在它下面，才能免审批写入。
# 这个是语义配置（不是相对位置），必须写死。
WORKDIR = "/Users/opay-20260271/code-temp/ai-md"
LOG_DIR = os.path.join(WORKDIR, ".dsh-work-report-logs")
STATE_FILE = os.path.join(LOG_DIR, "state.json")
OUT_ROOT = os.path.join(WORKDIR, "whatsapp_crm_docs/summary")

TIMEOUT_SECONDS = int(os.environ.get("DSH_WR_TIMEOUT", "1500"))   # 25 分钟
KILL_GRACE_SECONDS = 15
TIMEOUT_SUFFIX = "-执行超时"

# 只统计本人的代码提交（git author）
AUTHOR = "licun.zha"

MODEL_LABEL = "deepseek-v4.1-flash"

# 写进提示词开头，供采集器识别「这次会话是自动化自己跑的」，从而不计入工作内容。
# 必须与 collect.py 里的 AUTOMATION_MARKER 保持一致。
AUTOMATION_MARKER = "DSH_AUTOMATION_RUN"

# 各模式首次运行时的起始水位线（此后再按上次结束时间增量）
INITIAL_START = {
    "daily": "2026-10-08 00:00:00",
    "weekly": "2026-10-05 00:00:00",   # 本周一
    "monthly": "2026-10-01 00:00:00",  # 本月初
}

MODE_META = {
    "daily": {"title": "工作日报", "subdir": "daily", "state_key": "last_daily_end"},
    "weekly": {"title": "工作周报", "subdir": "weekly", "state_key": "last_weekly_end"},
    "monthly": {"title": "工作月报", "subdir": "monthly", "state_key": "last_monthly_end"},
}
# ====================================================================

TZ = dt.timezone(dt.timedelta(hours=8))


def now():
    return dt.datetime.now(TZ)


def parse_ts(s):
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return dt.datetime.strptime(s, fmt).replace(tzinfo=TZ)
        except ValueError:
            pass
    raise SystemExit("无法解析时间: %r" % s)


def fmt(ts):
    return ts.astimezone(TZ).strftime("%Y-%m-%d %H:%M:%S")


def log(msg):
    line = "[%s] %s" % (now().strftime("%Y-%m-%d %H:%M:%S"), msg)
    print(line, flush=True)
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        with open(os.path.join(LOG_DIR, "run.log"), "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


def load_state():
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def save_state(state):
    os.makedirs(LOG_DIR, exist_ok=True)
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(state, fh, ensure_ascii=False, indent=2)
    os.replace(tmp, STATE_FILE)


def period_start(mode, end):
    """当前周期的起点：日报=当天 00:00，周报=本周一 00:00，月报=本月 1 日 00:00。"""
    e = end.astimezone(TZ)
    if mode == "daily":
        return e.replace(hour=0, minute=0, second=0, microsecond=0)
    if mode == "weekly":
        monday = e - dt.timedelta(days=e.weekday())
        return monday.replace(hour=0, minute=0, second=0, microsecond=0)
    return e.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def ref_day_for(mode, start, end):
    """产物归属日：日报/周报取窗口最后一天，月报取窗口起始月（因为月报在下月 1 号跑）。"""
    if mode == "monthly":
        return start.astimezone(TZ)
    return (end - dt.timedelta(seconds=1)).astimezone(TZ)


def out_path_for(mode, start, end):
    sub = MODE_META[mode]["subdir"]
    d = ref_day_for(mode, start, end).date()
    if mode == "daily":
        # 日报按月子目录存放：summary/daily/2026年10月/2026年10月09日.md
        month = "%d年%02d月" % (d.year, d.month)
        return os.path.join(OUT_ROOT, sub, month, "%s%02d日.md" % (month, d.day))
    if mode == "weekly":
        # 周报按「该 ISO 周的周一~周日」命名：20261005-20261011.md
        # 取整个自然周而不是实际窗口，好处是同周内任何时候重跑都是同一个文件名。
        monday = d - dt.timedelta(days=d.weekday())
        sunday = monday + dt.timedelta(days=6)
        return os.path.join(OUT_ROOT, sub, "%s-%s.md" % (monday.strftime("%Y%m%d"),
                                                         sunday.strftime("%Y%m%d")))
    return os.path.join(OUT_ROOT, sub, "%d年%02d月.md" % (d.year, d.month))


DAILY_NAME_RE = re.compile(r"^(\d{4})年(\d{2})月(\d{2})日\.md$")
WEEKLY_NAME_RE = re.compile(r"^(\d{4})(\d{2})(\d{2})-(\d{4})(\d{2})(\d{2})\.md$")
MONTHLY_NAME_RE = re.compile(r"^(\d{4})年(\d{2})月\.md$")


def _report_ref_date(name):
    """从产物文件名解析它覆盖的日期；解析不了返回 None。

    日报 → 那一天；周报 → 该 ISO 周的周一；月报 → 当月 1 号。
    只用于「排序 / 判断先后 / 落在哪个窗口」，所以取周几不重要，单调即可。
    """
    name = os.path.basename(name)
    m = DAILY_NAME_RE.match(name)
    if m:
        try:
            return dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None
    m = WEEKLY_NAME_RE.match(name)
    if m:
        try:
            return dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None
    m = MONTHLY_NAME_RE.match(name)
    if m:
        try:
            return dt.date(int(m.group(1)), int(m.group(2)), 1)
        except ValueError:
            return None
    return None


def _names(sub):
    """列出某类报告，返回相对 `summary/<sub>/` 的路径（含子目录，如 `2026年10月/x.md`）。

    日报按月子目录存放，所以要往下走一层；周报/月报仍平铺。
    """
    d = os.path.join(OUT_ROOT, sub)
    out = []
    try:
        entries = os.listdir(d)
    except OSError:
        return []
    for e in entries:
        p = os.path.join(d, e)
        if os.path.isdir(p):
            try:
                out += [e + "/" + f for f in os.listdir(p) if f.endswith(".md")]
            except OSError:
                pass
        elif e.endswith(".md"):
            out.append(e)
    return out


def _dated_names(sub):
    """[(覆盖日期, 相对路径)]，按日期升序。

    必须按解析出的日期排序，不能按文件名排：`2026年10月` 字典序会排在 `2026年9月` 前面。
    """
    items = [(d, f) for f in _names(sub) for d in [_report_ref_date(f)] if d]
    items.sort(key=lambda x: (x[0], x[1]))
    return items


def related_reports(mode, start, end, outfile):
    """挑出与本次窗口相关的历史报告，供 Agent 做跨报告关联。"""
    cur_date = _report_ref_date(outfile)
    sd = start.astimezone(TZ).date()
    ed = (end - dt.timedelta(seconds=1)).astimezone(TZ).date()

    def full(sub, f):
        return os.path.join(OUT_ROOT, sub, f)

    def before(sub, n):
        """严格早于本次产物的最近 n 份（按覆盖日期比较，不按文件名）。"""
        if cur_date is None:
            return []
        return [full(sub, f) for d, f in _dated_names(sub) if d < cur_date][-n:]

    def in_win(sub):
        return [full(sub, f) for d, f in _dated_names(sub) if sd <= d <= ed]

    if mode == "daily":
        # 取最近 3 份：上一份用于「承接与延续」逐条对账，更早的用于「思考」找反复出现的模式
        prev = before("daily", 3)
        win = []
    elif mode == "weekly":
        prev = before("weekly", 1)
        win = in_win("daily")[-7:]
    else:
        prev = before("monthly", 1)
        win = in_win("weekly")[-5:] + in_win("daily")[-31:]
    return {"previous": prev, "in_window": win}


def render_related(rel):
    lines = []
    prev = rel["previous"]
    if prev:
        if len(prev) == 1:
            lines.append("**上一份同类报告（必须先读，用于「承接与延续」逐条对账）**：")
            lines += ["- `%s`" % p for p in prev]
        else:
            lines.append("**上一份同类报告（必须先读，用于「承接与延续」逐条对账）**：")
            lines.append("- `%s`" % prev[-1])
            lines.append("")
            lines.append("**更早的报告（读它们的「总结」和「待跟进」两节即可，"
                         "用于「思考」识别反复出现的问题）**：")
            lines += ["- `%s`" % p for p in prev[:-1]]
    else:
        lines.append("**上一份同类报告**：不存在（这是首份）。正文对应位置如实写「无（首份报告）」。")
    if rel["in_window"]:
        lines.append("")
        lines.append("**窗口内的历史日报/周报（必须先读，用于主题归并与跨天关联）**：")
        for p in rel["in_window"]:
            lines.append("- `%s`" % p)
    return "\n".join(lines)


def link_rule(mode):
    if mode == "daily":
        return """6. **跨报告关联（重要）**：动手写之前，先把上面「相关报告」里列出的文件读完。
   - 明细里若某项工作明显是上一份报告的延续，在小标题后标注「（承接 MM-DD）」；
   - 「承接与延续」一节必须**逐条对账**上一份报告「待跟进」里的每一项，给出本窗口内的状态
     （`已闭环 / 进行中 / 无变化`）与依据（提交号 / 命令 / 文档路径）；
   - **不要重复上一份报告已经写完的结论**，只写本窗口内新增的变化。"""
    return """6. **以日报为主线做归并（重要）**：动手写之前，先把上面列出的窗口内日报读完。
   - 它们是本报告的主要事实来源；**同一件事跨多天/多周必须合并成一条，禁止按天/按周流水账**；
   - 采集结果（evidence）用来核对数字、补日报的遗漏、以及裁决日报之间的冲突（有冲突要说明以哪个为准）；
   - 每条主题要标注 `（起止日期）` 并链接到对应的日报文件；
   - 「承接与延续」一节要逐条对账上一份报告的未闭环项。"""


def summary_rule(mode):
    unit = {"daily": "当天", "weekly": "本周", "monthly": "本月"}[mode]
    return """7. **「总结」必须是概括，不是明细的复述（重要）**：它回答的是「%s到底推进了什么」，
   而不是「做了哪些动作」。**禁止把下面明细里的项目原样列一遍**——明细是证据，总结是结论。
   四个小节都要写，没素材就如实写「无」，不要为了凑字数编：
   - **结果盘点**：真正推进或闭环的事项，3–5 条。用**名词短语**收口
     （写「LTO 合丢内容问题闭环」，而不是「改了三行适配逻辑」）。
   - **投入分布**：精力大致花在哪几块、各占几成。依据是各主题的会话数/命令数/提交数/时间跨度，
     粗略即可，但要给出判断依据，不要拍脑袋。
   - **进展与空转**：哪些有实质产出；哪些只是调研、被打断、在等别人、反复返工。
     **空转必须如实写**，否则这一节没有价值。
   - **与预期偏差**：计划做什么、实际做了什么、差在哪。若没有获取到计划信息，写
     「未获取到计划，无法判断偏差」，不要编。""" % unit


def thinking_rule(mode):
    if mode == "daily":
        span = "最近这几份日报"
    else:
        span = "上面列出的窗口内日报/周报"
    return """8. **「思考」要跨报告找模式，不能只看今天（重要）**：这一节分两个小节，都要写。
   - **复盘（给自己看的）**：直白，允许说「这里绕远了 / 这里返工了 / 这里效率低」。
     重点看三件事：① 今天哪些做得好、哪些走了弯路；② **重复劳动**——某类操作是否在 %s
     里反复出现（例如反复手工做同一件验证、反复改同一处配置），这是最有价值的发现；
     ③ 时间黑洞——耗时与产出明显不成比例的事。
   - **建议（给方向看的）**：专业克制，聚焦可执行动作与风险。
     ① 可优化方向（流程/工具/自动化，给出具体改法）；② 风险与隐患（带影响面）；
     ③ 下一步优先级建议。
   **硬要求**：
   - 每条复盘/建议后面必须用括号标注依据（引用具体的日报文件名、提交号、命令或证据字段）；
   - 本节开头写一句「以下为 AI 依据采集数据推断，可能不准确，供参考」；
   - 没有依据的猜测**一律不写**。宁可少写两条，也不要输出听起来合理但没根据的建议。""" % span


def build_prompt(mode, start, end, outfile, evidence):
    meta = MODE_META[mode]
    ref_day = ref_day_for(mode, start, end)
    weekday_cn = "一二三四五六日"[ref_day.weekday()]
    label = ref_day.strftime("%Y-%m-%d") + "（周%s）" % weekday_cn
    gentime = now().strftime("%Y-%m-%d %H:%M")
    head_extra = ("> **生成方式**：DSH 自动化任务 · 模型 `%s` · 只读采集\n"
                  "> **生成时间**：%s\n" % (MODEL_LABEL, gentime))
    rel_block = render_related(related_reports(mode, start, end, outfile))

    if mode == "daily":
        body = """# 工作日报 · {label}

> **统计窗口**：{start} → {end}（Asia/Shanghai）
{head_extra}
## 一、一句话总结
（2–3 句，点出当天主线工作与结果）

## 二、工作总结
### 2.1 结果盘点
### 2.2 投入分布
### 2.3 进展与空转
### 2.4 与预期偏差

## 三、当日概览
- 一张指标表：本人提交次数、Codex 会话数、DSH 会话数、执行命令数、涉及仓库、产出文档数
- 一张时间轴表：按时间列出当天关键节点

## 四、主要工作明细
每个主题一节，按重要性排序。承接上一份报告的工作，小标题后标「（承接 MM-DD）」。
每节写清四件事：
1. **问题现象**（触发这次工作的现象/需求）
2. **根因或结论**
3. **处理动作**（改了哪些文件、加了什么测试、验证了什么）
4. **产出与证据**（提交号 / 文档路径 / 命令）

## 五、代码提交（仅 {author}）
表格：时间 | 仓库 | 提交 | 说明。非本人提交不计入，必要说明可放脚注。

## 六、产出文档
表格：文档 | 说明

## 七、Trae 端记录
写当天 Trae SOLO CN 的会话元数据；若为 0 会话如实说明。必须保留「对话正文加密不可读」的说明。

## 八、DSH 端记录
写当天在 DSH 里的工作。数据源 `evidence.dsh.sessions[]`，每项含 session_id / cwd / started_at /
user_messages（**只有真人输入**，harness 注入已被过滤）/ commands / files_touched /
deliverables / assistant_notes / stats。
- 表格：时间 | 工作目录 | 做了什么事（由 user_messages + deliverables + files_touched 归纳）| 规模（步骤/命令数）
- `scratch=true` 的是 `/tmp` 下的联调冒烟会话，一笔带过或不写
- `deliverables` 里出现的文件是当天真实交付物，应同时列入第六节
- 注意：DSH 会话之间可能互相引用（续聊会重放父会话历史），采集器已按 `time >= createdAt` 去重，
  报告里**不要**把同一个主题因为出现在多个会话里就算成多件事

## 九、承接与延续
逐条对账上一份报告的「待跟进」项，表格：`事项 | 状态（已闭环/进行中/无变化）| 本窗口内的依据`。
只写新增变化。首份报告写「无（首份报告）」。

## 十、待跟进
列出未闭环事项，每条要具体可执行。**需与第九节呼应**，不要遗漏延续中的事项。

## 十一、思考
> 以下为 AI 依据采集数据推断，可能不准确，供参考。
### 11.1 复盘（给自己）
### 11.2 建议（给方向）

## 十二、数据来源与口径
表格 + 口径说明（只读、按作者过滤、Asia/Shanghai 归日）""".format(label=label, author=AUTHOR, start=fmt(start), end=fmt(end), head_extra=head_extra)

    elif mode == "weekly":
        body = """# 工作周报 · {label}

> **统计窗口**：{start} → {end}（Asia/Shanghai）
{head_extra}
## 一、本周一句话总结
## 二、本周总结
### 2.1 结果盘点
### 2.2 投入分布
### 2.3 进展与空转
### 2.4 与预期偏差
## 三、本周概览
指标表（本人提交数、涉及仓库、覆盖天数、主要主题数）+ 按天的时间轴
## 四、本周主线工作
按主题归并，**同一件事跨多天必须合并成一条，禁止按天流水账**。
每条：`（起止日期）` + 目标 / 做了什么 / 当前状态 / 证据 + 对应日报链接
## 五、代码提交汇总（仅 {author}）
表格：日期 | 仓库 | 提交 | 说明
## 六、本周产出文档
## 七、风险与阻塞
## 八、承接与延续
- 上周周报「下周计划 / 未闭环项」的落实情况：逐条给 `已闭环 / 进行中 / 未启动` + 依据
- 本周日报中仍未闭环、需要带入下周的事项
- 首份周报写「无（首份报告）」
## 九、下周计划建议（具体任务层面，基于第八节的未闭环事项推导）
## 十、思考
> 以下为 AI 依据采集数据推断，可能不准确，供参考。
### 10.1 复盘（给自己）
### 10.2 建议（给方向）
## 十一、数据来源与口径
周报的「工具使用」不单独设章节，把 Codex / DSH / Trae 的使用情况合并进指标表与对应主题即可。""".format(label=label, author=AUTHOR, start=fmt(start), end=fmt(end), head_extra=head_extra)

    else:
        body = """# 工作月报 · {label}

> **统计窗口**：{start} → {end}（Asia/Shanghai）
{head_extra}
## 一、本月一句话总结
## 二、本月总结
### 2.1 结果盘点
### 2.2 投入分布
### 2.3 进展与空转
### 2.4 与预期偏差
## 三、本月概览
指标表 + 按周汇总
## 四、本月主要工作线
按项目/主题归并，**同一件事跨多周必须合并成一条，禁止按周流水账**。
每条：`（起止日期）` + 背景 / 关键动作 / 结果 / 证据 + 对应周报/日报链接
## 五、代码提交汇总（仅 {author}）
按周或按模块汇总
## 六、本月产出文档
## 七、数据与规律（可量化的观察）
## 八、问题与改进
## 九、承接与延续
上月月报的未闭环项落实情况 + 本月周报中仍未闭环、需带入下月的事项。首份月报写「无（首份报告）」。
## 十、下月重点建议（具体任务层面，基于第九节的未闭环事项推导）
## 十一、思考
> 以下为 AI 依据采集数据推断，可能不准确，供参考。
### 11.1 复盘（给自己）
### 11.2 建议（给方向）
## 十二、数据来源与口径
月报的「工具使用」不单独设章节，把 Codex / DSH / Trae 的使用情况合并进指标表与对应主题即可。""".format(label=label, author=AUTHOR, start=fmt(start), end=fmt(end), head_extra=head_extra)

    return """<!-- {marker}:work-report -->
你是「{kind}」自动化任务。请严格按下面步骤执行。

## 铁律（必须遵守）
1. **全程只读**：绝不修改、删除 `~/.codex`、`~/.dsh`、`~/Library/Application Support/Codex`、
   `~/Library/Application Support/TRAE SOLO CN`、`~/.trae-cn` 以及用户代码仓库中的任何文件。
   采集器会自己把 sqlite 复制到临时目录再读，你不要手动改动原始文件。
2. **不要编造**：报告里每一条事实都必须来自采集结果、历史报告或你实际跑的命令。取不到就不写，宁可留白。
3. **git 提交只统计本人**（author = `{author}`），其他同事的提交不要计入产出。
4. 时间统一按 **Asia/Shanghai** 归日。
5. **排除自动化自身的日常产物**：本任务与「每日 AI 新闻」任务按点自动生成的东西
   （`summary/**`、`.dsh-work-report-logs/**`、`news/<年月>/*.md` 这类每天自动落盘的文件），
   **不是工作项**。不要写"今天又自动生成了一份日报/新闻"，也不要把「本报告自己的采集/生成」
   写进时间轴。只有当天的确在**改造、调试、排障这套自动化本身**时，才作为工作项写，
   并且要聚焦于"改了什么、为什么改"，而不是"它又跑了一次"。
{link_rule}
{summary_rule}
{thinking_rule}

## 第 1 步：读相关报告
{rel_block}

## 第 2 步：采集
运行下面这条命令（只读采集器，约 1–3 分钟）：

```
/usr/bin/python3 {collect} --start '{start}' --end '{end}' -o {evidence}
```

## 第 3 步：读证据
用 Python 读取 `{evidence}`，它包含：
- `codex.threads[]`：每条会话的 `title / cwd / git_branch / first_at / last_at /
  user_messages[]（用户提问原文）/ assistant_notes[]（AI 最终回答）/
  commands[]（执行的命令）/ file_changes[] / item_counts`
- `dsh.sessions[]`：DSH 本地会话（`session_id / title / cwd / started_at / scratch /
  user_messages[]（**已过滤成真人输入**）/ commands[] / files_touched[] /
  deliverables[]（当天真实交付物）/ assistant_notes[] / stats`）；
  `dsh.skipped_automation_sessions[]` 是自动化任务自跑的会话（已排除，不是工作内容）
- `trae.sessions[] / events[]`：Trae SOLO CN 的会话元数据（正文加密不可读）
- `git.commits[]`：窗口内提交（含 author，请自行按 `{author}` 过滤）
- `window`：本次统计窗口

注意：
- `codex.threads[]` 里标题为 `Guardian review` 的是自动审查子会话，不是用户的工作内容，
  **不要**当成一项工作写进报告。
- `dsh.sessions[]` 里多个会话可能是同一段对话的续聊分叉（`:parent_session` 非空），
  采集器已按 `time >= createdAt` 做了去重；报告里同一主题**只写一次**。

## 第 4 步：写出报告
把报告写到（用 write 工具，先确保父目录存在）：

```
{outfile}
```

报告结构严格用下面这个模板：

{body}

## 第 5 步：自检
写完后确认：
- 文件已存在且非空；
- 没有把 Guardian review 子会话当成工作项；
- 没有把非本人提交算进产出；
- 没有编造采集结果中不存在的内容；
- 没有把自动化自身的日常产物当作工作项；
- 没有把 harness 注入的消息（`<system-reminder>`、`Time sampled while...` 等）当成用户的工作内容；
- 「承接与延续」一节已逐条对账上一份报告，且**没有原样复述**上一份报告的结论；
- 「总结」是概括而非明细复述，且「空转」一项如实写了；
- 「思考」的每条复盘/建议都带了依据，没有无根据的推测。
最后用一句话回复：报告已写入 <路径>。
""".format(kind=MODE_META[mode]["title"], author=AUTHOR, collect=COLLECT_PY,
           start=fmt(start), end=fmt(end), evidence=evidence, outfile=outfile,
           body=body, rel_block=rel_block, link_rule=link_rule(mode),
           summary_rule=summary_rule(mode), thinking_rule=thinking_rule(mode),
           marker=AUTOMATION_MARKER)


def run_dsh(prompt, log_name):
    os.makedirs(LOG_DIR, exist_ok=True)
    out_log = open(os.path.join(LOG_DIR, log_name), "a", encoding="utf-8")
    env = dict(os.environ)
    env["LANG"] = "zh_CN.UTF-8"
    env["PYTHONUNBUFFERED"] = "1"
    cmd = [DSH_CLI, "--profile", "headless",
           "--patch", BASE_PATCH, "--patch", MODEL_PATCH, prompt]
    proc = subprocess.Popen(cmd, cwd=WORKDIR, env=env,
                            stdout=out_log, stderr=subprocess.STDOUT,
                            start_new_session=True)
    deadline = time.time() + TIMEOUT_SECONDS
    killed = False
    while True:
        if proc.poll() is not None:
            break
        if time.time() > deadline:
            killed = True
            log("超时（%ds），发送 SIGTERM 到进程组" % TIMEOUT_SECONDS)
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            except OSError:
                pass
            t0 = time.time()
            while proc.poll() is None and time.time() - t0 < KILL_GRACE_SECONDS:
                time.sleep(0.5)
            if proc.poll() is None:
                log("优雅退出失败，SIGKILL 进程组")
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                except OSError:
                    pass
                proc.wait()
            break
        time.sleep(1)
    out_log.close()
    if killed:
        return 124
    return proc.returncode


def mark_timeout(outfile, started_at, mode):
    """超时后给本次写过的产物加后缀；若没写过则建提示文件。"""
    base, ext = os.path.splitext(outfile)
    target = base + TIMEOUT_SUFFIX + ext
    if os.path.exists(outfile) and os.path.getmtime(outfile) >= started_at:
        os.replace(outfile, target)
        log("产物已标记为超时: %s" % target)
        return
    if os.path.exists(outfile):
        return
    os.makedirs(os.path.dirname(outfile), exist_ok=True)
    with open(target, "w", encoding="utf-8") as fh:
        fh.write("# 本次执行超时\n\n"
                 "本次运行超过 %d 秒被终止，未能写出报告。\n\n"
                 "手动重跑：双击 `%s/重新执行工作日报.command`，或执行\n\n"
                 "```bash\n/usr/bin/python3 %s --mode %s\n```\n"
                 % (TIMEOUT_SECONDS, OUT_ROOT, SELF_PATH, mode))
    log("未写出产物，已建超时提示文件: %s" % target)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["daily", "weekly", "monthly"],
                    default=os.environ.get("DSH_WR_MODE", "daily"))
    ap.add_argument("--start")
    ap.add_argument("--end")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    mode = a.mode
    meta = MODE_META[mode]
    state = load_state()

    end = parse_ts(a.end) if a.end else now()
    explicit_window = bool(a.start or a.end)
    if a.start:
        start = parse_ts(a.start)
    else:
        raw = state.get(meta["state_key"]) or INITIAL_START[mode]
        start = parse_ts(raw)
        # 下限钳制：本次报告至少覆盖到「当前周期」的起点，
        # 这样同一天/同一周内的手动重跑只会把报告写得更全，不会缩水。
        start = min(start, period_start(mode, end))
    if start >= end:
        start = end - dt.timedelta(days=1)

    outfile = out_path_for(mode, start, end)
    # 日报现在落在月子目录里，提前建好，省得 Agent 自己判断父目录
    os.makedirs(os.path.dirname(outfile), exist_ok=True)
    stamp = now().strftime("%Y%m%d-%H%M%S")
    evidence = os.path.join(LOG_DIR, "evidence-%s-%s.json" % (mode, stamp))
    prompt = build_prompt(mode, start, end, outfile, evidence)

    log("=" * 70)
    log("START mode=%s model=%s window=%s ~ %s" % (mode, MODEL_LABEL, fmt(start), fmt(end)))
    log("产物: %s" % outfile)

    if a.dry_run:
        print("\n----- PROMPT -----\n" + prompt)
        log("dry-run 结束")
        return 0

    started_at = time.time()
    code = run_dsh(prompt, "dsh-output.log")

    if code == 124:
        mark_timeout(outfile, started_at, mode)
        log("END mode=%s exit=124（超时）" % mode)
        return 124

    if code != 0:
        log("END mode=%s exit=%s（失败，见 dsh-output.log）" % (mode, code))
        return code

    if not (os.path.exists(outfile) and os.path.getsize(outfile) > 0):
        log("END mode=%s exit=0 但产物缺失: %s" % (mode, outfile))
        return 2

    if explicit_window:
        log("END mode=%s exit=0 产物=%s（显式指定窗口，未推进水位线）" % (mode, outfile))
        return 0

    state[meta["state_key"]] = fmt(end)
    state["last_run_%s" % mode] = fmt(now())
    save_state(state)
    log("水位线已推进 %s = %s" % (meta["state_key"], fmt(end)))
    log("END mode=%s exit=0 产物=%s" % (mode, outfile))
    return 0


if __name__ == "__main__":
    sys.exit(main())
