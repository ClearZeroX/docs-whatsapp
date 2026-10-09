#!/bin/bash
# ============================================================
# 手动重新执行「工作日报 / 周报 / 月报」任务
#
# 用途：定时任务超时（产物出现 "-执行超时" 后缀）或失败时，
#       用这个脚本立刻手动重跑一次。
#
# 用法：
#   ① 在 Finder 里双击本文件（推荐）→ 默认跑「日报」
#   ② 终端执行（可指定模式）：
#        bash 重新执行工作日报.command daily
#        bash 重新执行工作日报.command weekly
#        bash 重新执行工作日报.command monthly
#
# 说明：与定时任务完全同一条链路（同一个执行器、同一个模型、同样的超时）
# ============================================================

RUNNER="/Users/opay-20260271/code-temp/ai-md/whatsapp_crm_docs/scripts/work-report/run.py"
LOG_DIR="/Users/opay-20260271/code-temp/ai-md/.dsh-work-report-logs"
MODE="${1:-daily}"

case "$MODE" in
    daily)   CN="工作日报" ;;
    weekly)  CN="工作周报" ;;
    monthly) CN="工作月报" ;;
    *)       echo "未知模式：$MODE（可选 daily / weekly / monthly）"; read -n 1 -s -r; exit 1 ;;
esac

echo "=========================================="
echo " $CN · 手动重新执行"
echo "=========================================="
echo "执行器：$RUNNER"
echo "模式：$MODE"
echo "超时上限：25 分钟（超时会自动给产物加“-执行超时”后缀）"
echo "开始时间：$(date '+%Y-%m-%d %H:%M:%S')"
echo "------------------------------------------"
echo "运行中，请勿关闭本窗口……"
echo

/usr/bin/python3 "$RUNNER" --mode "$MODE"
code=$?

echo
echo "------------------------------------------"
case "$code" in
    0)
        echo "✅ 执行成功（退出码 0），报告已生成/更新，水位线已推进。"
        echo "   若目录里还留着带“-执行超时”的旧文件，确认新报告没问题后可以手动删除它。"
        ;;
    124)
        echo "⚠️  再次超时（退出码 124），产物已被标记为“-执行超时”。"
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
