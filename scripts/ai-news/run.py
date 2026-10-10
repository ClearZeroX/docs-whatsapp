#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
每日 AI 行业热点新闻速览 —— 定时任务执行器（由 launchd 调用）

【修改配置请只看下面 CONFIG 段】改完保存即生效，不需要重新加载 launchd
（因为 launchd 每次触发都会重新读取本脚本）。
也可以用环境变量临时覆盖：DSH_NEWS_TIMEOUT=600（秒）。
"""

import datetime
import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from zoneinfo import ZoneInfo

# ==================== CONFIG：要改东西，基本只改这一段 ====================

# 单次执行超时（秒）。当前 600 = 10 分钟（按需求设定）。
# 超时后：先 SIGTERM、等待 KILL_GRACE_SECONDS，仍未退出则 SIGKILL 整个进程组；
# 随后把当天文档重命名为 "<名称>-执行超时.md"，脚本以退出码 124 结束。
# 被标记后可手动重跑：双击 news/重新执行新闻任务.command
TIMEOUT_SECONDS = 600

# DSH 无头入口（App 包内文件；若 App 被移动/改名，这里要同步改）
DSH_CLI = "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"

# 使用的 profile 与模型配置补丁（--patch 可叠加，后面覆盖前面）。
# ① 基础层：App 的 provider 配置（Key、baseURL、可用模型列表），你换 provider 后自动跟随。
# ② 模型层：本任务专用，只把 agent-default-model 钉死为下面 NEWS_MODEL 指定的模型，
#    不改动 App 的默认模型。改模型请编辑 NEWS_MODEL_PATCH 指向的那个文件。
DSH_PROFILE = "headless"
DSH_PATCH = "/Users/opay-20260271/.dsh/profiles/desktop/cordis.patch.yml"

# 本文件所在目录（= 本需求的脚本目录）。
# 同目录内的资源一律按它推算，这样整个需求目录可以整体挪动/改名而不必改代码。
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
NEWS_MODEL_PATCH = os.path.join(SCRIPT_DIR, "model.patch.yml")
# 手动重跑时提示用的自身路径
SELF_PATH = os.path.abspath(__file__)
# 仅用于日志与生成文件顶部那行的显示；真正生效的模型在 NEWS_MODEL_PATCH 里
# （provider 是 opay-gateway，由 model.patch.yml 指定）
NEWS_MODEL = "deepseek-v4.1-flash"
# 生成文件顶部「本次使用模型」显示的名称（只显示模型 id，不带 provider 前缀）
NEWS_MODEL_LABEL = NEWS_MODEL

# 工作目录 = 无头会话的写入边界（workspace-write 只允许写此处及系统临时目录）。
# 把它设为 ai-md 后，写 news/ 子目录无需任何审批。
WORKDIR = "/Users/opay-20260271/code-temp/ai-md"

# 日志目录
LOG_DIR = "/Users/opay-20260271/code-temp/ai-md/.dsh-news-logs"

# 产物目录（超时时用于定位当天文档并加后缀）
NEWS_DIR = "/Users/opay-20260271/code-temp/ai-md/whatsapp_crm_docs/news"

# 超时后追加到文件名末尾的后缀（加在 .md 之前）
TIMEOUT_SUFFIX = "-执行超时"

# 判断"今天"所用时区（决定文档日期与改名目标）
TZ_NAME = "Asia/Shanghai"

# SIGTERM 之后等待多久再 SIGKILL
KILL_GRACE_SECONDS = 15

# 任务提示词。改这里即可调整抓取范围、条数、输出路径与格式。
PROMPT = """<!-- DSH_AUTOMATION_RUN:daily-ai-news -->
执行每日 AI 行业热点新闻速览，必须同时覆盖【国内】和【海外】。

一、抓取方式（web_search 工具因缺少搜索凭据不可用，请用 curl 直连抓取）
海外来源：OpenAI / Google / Anthropic / Microsoft / Meta / Mistral 官方博客与新闻页；TechCrunch、The Verge、SiliconANGLE、Axios、Reuters、Bloomberg 等媒体；Google News 英文 RSS：https://news.google.com/rss/search?q=<关键词>&hl=en-US&gl=US&ceid=US%3Aen 。
国内来源（以下 RSS 已实测可用，直接用 curl 抓）：
- IT之家 https://www.ithome.com/rss/
- 量子位 https://www.qbitai.com/feed
- 钛媒体 https://www.tmtpost.com/feed
- 雷锋网 https://www.leiphone.com/feed
- 新浪科技 https://rss.sina.com.cn/tech/rollnews.xml
- Google News 中文 RSS：https://news.google.com/rss/search?q=<关键词>&hl=zh-CN&gl=CN&ceid=CN%3Azh-Hans （关键词可试：大模型、人工智能、AI 融资、AI 监管、国产芯片、具身智能、智能驾驶）
- 政策与标准：国家网信办 https://www.cac.gov.cn/ 、工信部 https://www.miit.gov.cn/ ，以及中国信通院 / TC260 的公开报道。
注意：机器之心、36氪、澎湃新闻的页面是 JS 渲染或返回 403，curl 抓不到，不要在上面浪费时间。

二、内容要求
1. 四类都要覆盖：(a) 重要产品发布或功能更新；(b) 融资事件与行业并购；(c) 技术突破或重要论文；(d) 行业标准与规范（AI 安全框架、数据治理、内容标识与溯源、备案与监管）。
2. 国内与海外都要有：国内条目不少于 3 条，总输出 5-8 条。国内重点跟踪：阿里通义、百度文心、腾讯混元、字节豆包/Seed、DeepSeek、月之暗面 Kimi、智谱、MiniMax、阶跃星辰、商汤、科大讯飞、华为昇腾/盘古、寒武纪、摩尔线程等，以及具身智能（智元、宇树）与智能驾驶（萝卜快跑、小马智行、文远知行）。
3. 每条标题前标注【国内】或【海外】。每条包含：标题、一句话摘要、信息来源（媒体名 + URL）。
4. 务必核对发布日期，只保留当天及前 1-2 天的消息，剔除旧闻与未证实传闻；同一事件不重复计数。
5. 按重要性排序（国内与海外混合排序，不分区），聚焦技术进展与商业动态。结尾写 2-3 句今日趋势点评，兼顾国内与海外。

三、输出
写入文件：/Users/opay-20260271/code-temp/ai-md/whatsapp_crm_docs/news/<当前年月，如 2026年10月>/<当前日期，如 2026年10月10日>.md（月目录不存在则先创建；日期取运行当天）。格式参考同目录下已有的 2026年10月09日.md；第 4 行的覆盖窗口说明请写明"覆盖国内＋海外"。完成后在结果中简要列出当日条目。"""

# ==================== 以下一般不需要改动 ====================

TIMEOUT_SECONDS = int(os.environ.get("DSH_NEWS_TIMEOUT", TIMEOUT_SECONDS))


def log(message: str) -> None:
    stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{stamp}] {message}"
    print(line, flush=True)
    try:
        with open(os.path.join(LOG_DIR, "run.log"), "a", encoding="utf-8") as handle:
            handle.write(line + "\n")
    except OSError:
        pass


def mark_timeout(run_started_at: float) -> str:
    """超时后给当天文档加 -执行超时 后缀；若本次没写出任何文件，则写一个提示文件。

    返回一句说明，写进日志。
    """
    now = datetime.datetime.now(ZoneInfo(TZ_NAME))
    month_dir = Path(NEWS_DIR) / f"{now.year}年{now.month:02d}月"
    base = f"{now.year}年{now.month:02d}月{now.day:02d}日"

    target = month_dir / f"{base}.md"
    if not target.exists() and month_dir.is_dir():
        # 宽松匹配：兼容月/日未补零等命名写法
        loose = sorted(
            path
            for path in month_dir.glob(f"{now.year}年*{now.day:02d}日*.md")
            if not path.stem.endswith(TIMEOUT_SUFFIX)
        )
        if loose:
            target = loose[0]

    # 只改"本次运行写过"的文件，避免把上一次留下的完好文档误标
    if target.exists() and target.stat().st_mtime >= run_started_at:
        if target.stem.endswith(TIMEOUT_SUFFIX):
            return f"already marked: {target.name}"
        marked = target.with_name(f"{target.stem}{TIMEOUT_SUFFIX}{target.suffix}")
        target.replace(marked)
        return f"renamed partial output -> {marked.name}"

    # 本次没有产出文件：写一个提示文件，保证超时在产物目录里可见
    note = month_dir / f"{base}{TIMEOUT_SUFFIX}.md"
    month_dir.mkdir(parents=True, exist_ok=True)
    started = datetime.datetime.fromtimestamp(run_started_at, ZoneInfo(TZ_NAME))
    runner = SELF_PATH
    note.write_text(
        "# 执行超时（本次未产出完整内容）\n\n"
        f"- 运行开始：{started:%Y-%m-%d %H:%M:%S}（{TZ_NAME}）\n"
        f"- 超时上限：{TIMEOUT_SECONDS} 秒\n"
        "- 状态：进程在超时后被终止，未生成完整的新闻速览。\n\n"
        "## 如何手动重跑\n\n"
        "双击 `news/重新执行新闻任务.command`，或在终端执行：\n\n"
        "```bash\n"
        f"/usr/bin/python3 {runner}\n"
        "```\n\n"
        "> 本文件由执行器在超时时自动生成，重跑成功后不会自动删除。\n",
        encoding="utf-8",
    )
    return f"no output file this run; wrote notice -> {note.name}"


def main() -> int:
    os.makedirs(LOG_DIR, exist_ok=True)
    os.chdir(WORKDIR)

    prompt = PROMPT + (
        "\n\n【输出格式要求】在生成文件的最前面、一级标题（# 开头那行）之下，"
        "必须紧跟一行引用块，内容严格为：\n"
        f"> 本次使用模型：{NEWS_MODEL_LABEL}\n"
        "这一行不能缺少、不能改写；文件其余结构与内容按前面的要求正常输出。"
    )

    command = [
        DSH_CLI,
        "--profile", DSH_PROFILE,
        "--patch", DSH_PATCH,
        "--patch", NEWS_MODEL_PATCH,
        prompt,
    ]
    log(f"START timeout={TIMEOUT_SECONDS}s model={NEWS_MODEL_LABEL} cwd={WORKDIR}")
    run_started_at = time.time()

    output_path = os.path.join(LOG_DIR, "dsh-output.log")
    with open(output_path, "a", encoding="utf-8") as output:
        output.write(f"\n===== run at {datetime.datetime.now().isoformat()} =====\n")
        output.flush()
        # start_new_session=True 让子进程自成进程组，超时时可以整组一起杀干净
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
            log(f"TIMEOUT marked: {mark_timeout(run_started_at)}")
            log(f"END exit={code} (killed by timeout)")
            return 124

    log(f"END exit={code}")
    return code


if __name__ == "__main__":
    sys.exit(main())
