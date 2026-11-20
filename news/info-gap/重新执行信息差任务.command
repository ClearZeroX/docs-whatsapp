#!/bin/bash
# 与 launchd 使用同一执行器；不强行结束已运行实例。
set -u
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)" || exit 1
ROOT_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd -P)" || exit 1
RUNNER="$ROOT_DIR/scripts/info-gap/run.py"

printf '%s\n' '=========================================='
printf '%s\n' ' 信息差轻副业雷达 · 手动运行'
printf '%s\n' '=========================================='
printf '执行器：%s\n' "$RUNNER"
printf '%s\n' '默认超时：15 分钟；失败不会覆盖先前的成功报告。'
printf '开始时间：%s\n\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')"

/usr/bin/python3 -B "$RUNNER"
code=$?

printf '\n%s\n' '------------------------------------------'
case "$code" in
    0) printf '%s\n' '执行成功：报告已校验并发布，请查看本目录下的年份文件夹。' ;;
    124) printf '%s\n' '执行超时：已终止本次任务；失败说明和临时产物已保留。' ;;
    75) printf '%s\n' '已有任务在运行：本次未重复启动，请稍后查看报告。' ;;
    *) printf '执行失败（退出码 %s）：请查看日志，旧成功报告不会被覆盖。\n' "$code" ;;
esac
printf '日志目录：%s\n' "$SCRIPT_DIR/.logs"
printf '报告目录：%s\n' "$SCRIPT_DIR"
if [[ -t 0 && -t 1 ]]; then
    printf '\n按任意键关闭本窗口……'
    read -n 1 -s -r || true
    printf '\n'
fi
exit "$code"
