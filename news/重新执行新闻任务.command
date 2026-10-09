#!/bin/bash
# ============================================================
# 手动重新执行「每日 AI 行业新闻」任务
#
# 用途：定时任务超时（文档出现 "-执行超时" 后缀）或失败时，
#       用这个脚本立刻手动重跑一次。
#
# 用法：
#   ① 在 Finder 里双击本文件（推荐）
#   ② 终端执行：/Users/opay-20260271/code-temp/ai-md/whatsapp_crm_docs/news/重新执行新闻任务.command
#
# 说明：与定时任务完全同一条链路（同一个执行器、同一个模型、同样的 10 分钟超时）
# ============================================================

RUNNER="/Users/opay-20260271/code-temp/ai-md/scripts/run-daily-ai-news.py"
LOG_DIR="/Users/opay-20260271/code-temp/ai-md/.dsh-news-logs"

echo "=========================================="
echo " 每日 AI 新闻 · 手动重新执行"
echo "=========================================="
echo "执行器：$RUNNER"
echo "超时上限：10 分钟（超时会自动给文档加“-执行超时”后缀）"
echo "开始时间：$(date '+%Y-%m-%d %H:%M:%S')"
echo "------------------------------------------"
echo "运行中，请勿关闭本窗口……"
echo

/usr/bin/python3 "$RUNNER"
code=$?

echo
echo "------------------------------------------"
case "$code" in
    0)
        echo "✅ 执行成功（退出码 0），当天文档已生成/更新。"
        echo "   若目录里还留着带“-执行超时”的旧文件，确认新文档没问题后可以手动删除它。"
        ;;
    124)
        echo "⚠️  再次超时（退出码 124），文档已被标记为“-执行超时”。"
        echo "   可再次运行本脚本重试；若反复超时，考虑调大超时时间："
        echo "   编辑 $RUNNER 里的 TIMEOUT_SECONDS"
        ;;
    *)
        echo "❌ 执行失败（退出码 $code）。"
        echo "   常见原因：模型凭据失效、网络不通、App 被移动。"
        ;;
esac

echo
echo "详细日志："
echo "  $LOG_DIR/run.log          （每次运行的开始/结束/退出码）"
echo "  $LOG_DIR/dsh-output.log   （本次完整输出）"
echo
echo "按任意键关闭本窗口……"
read -n 1 -s -r
echo
