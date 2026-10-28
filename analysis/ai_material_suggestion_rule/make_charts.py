import json
import os
from collections import Counter, defaultdict

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

BASE = "/Users/opay-20260271/code-temp/ai-md/whatsapp_crm_docs/analysis/ai_material_suggestion_rule"
CHART_DIR = os.path.join(BASE, "charts")
os.makedirs(CHART_DIR, exist_ok=True)

plt.rcParams["font.sans-serif"] = ["Arial Unicode MS", "Hiragino Sans GB", "STHeiti"]
plt.rcParams["axes.unicode_minus"] = False

rows = json.load(open(f"{BASE}/ai_material_suggestion_rule.json", encoding="utf-8"))

STRATS = ["AI_BACKUP_MATERIAL_GROUP", "COST_FIRST"]
STRAT_CN = {"AI_BACKUP_MATERIAL_GROUP": "AI_BACKUP\n_MATERIAL_GROUP", "COST_FIRST": "COST_FIRST"}
TYPE_CN = {"SUGGESTION": "SUGGESTION\n(建议)", "CONSTRAINT": "CONSTRAINT\n(约束)", "RED_LINE": "RED_LINE\n(红线)"}
SRC_CN = {"BUSINESS": "BUSINESS\n(业务合规)", "GENERAL": "GENERAL\n(通用)", "AI_SUMMARY": "AI_SUMMARY\n(伪装策略)"}

C_BLUE = "#2E5C8A"
C_ORANGE = "#D97B29"
C_GREEN = "#3C8C6A"
C_RED = "#B33A3A"
C_GREY = "#8A8F98"
C_AMBER = "#C9A227"


def bar_panel(ax, data, colors, title, ylabel="规则条数"):
    labels = list(data.keys())
    vals = list(data.values())
    bars = ax.bar(range(len(labels)), vals, color=[colors[i % len(colors)] for i in range(len(labels))],
                  width=0.6, edgecolor="white", linewidth=1.2)
    ax.set_xticks(range(len(labels)))
    ax.set_xticklabels(labels, fontsize=9)
    ax.set_title(title, fontsize=12, fontweight="bold", pad=10)
    ax.set_ylabel(ylabel, fontsize=9)
    ax.set_ylim(0, max(vals) * 1.22)
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(axis="y", linestyle=":", alpha=0.45)
    ax.set_axisbelow(True)
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, v + max(vals) * 0.03, str(v),
                ha="center", va="bottom", fontsize=10, fontweight="bold", color="#333")


# ---------- Chart 1: rule_type / rule_source / source_lane distributions ----------
fig, axes = plt.subplots(1, 3, figsize=(15, 4.6))

rt = Counter(r["rule_type"] for r in rows)
bar_panel(axes[0], {TYPE_CN[k]: rt[k] for k in ["RED_LINE", "CONSTRAINT", "SUGGESTION"]},
          [C_RED, C_BLUE, C_GREEN], "规则类型分布 (rule_type)")

rs = Counter(r["rule_source"] for r in rows)
bar_panel(axes[1], {SRC_CN[k]: rs[k] for k in ["BUSINESS", "GENERAL", "AI_SUMMARY"]},
          [C_ORANGE, C_GREY, C_AMBER], "规则来源分布 (rule_source)")

sl = Counter(r["source_lane"] for r in rows)
bar_panel(axes[2], {"ALL\n(全场景)": sl["ALL"], "CUSTOMER_NEW\n(新客)": sl["CUSTOMER_NEW"]},
          [C_BLUE, C_ORANGE], "生效场景分布 (source_lane)")

fig.suptitle("ai_material_suggestion_rule 字段分布概览（48 条规则）", fontsize=14, fontweight="bold", y=1.02)
fig.tight_layout()
fig.savefig(os.path.join(CHART_DIR, "01_field_distribution.png"), dpi=160, bbox_inches="tight")
plt.close(fig)

# ---------- Chart 2: strategy x rule_type stacked ----------
fig, ax = plt.subplots(figsize=(8.6, 5))
cross = defaultdict(Counter)
for r in rows:
    cross[r["suggest_type"]][r["rule_type"]] += 1

order = ["RED_LINE", "CONSTRAINT", "SUGGESTION"]
colors = {"RED_LINE": C_RED, "CONSTRAINT": C_BLUE, "SUGGESTION": C_GREEN}
bottom = [0] * len(STRATS)
for t in order:
    vals = [cross[s][t] for s in STRATS]
    ax.bar([STRAT_CN[s] for s in STRATS], vals, bottom=bottom, label=TYPE_CN[t].replace("\n", " "),
           color=colors[t], width=0.5, edgecolor="white", linewidth=1.5)
    for i, (v, b) in enumerate(zip(vals, bottom)):
        if v:
            ax.text(i, b + v / 2, str(v), ha="center", va="center", color="white",
                    fontsize=11, fontweight="bold")
    bottom = [b + v for b, v in zip(bottom, vals)]

ax.set_title("两套策略的规则类型结构完全一致（各 24 条）", fontsize=13, fontweight="bold", pad=12)
ax.set_ylabel("规则条数", fontsize=10)
ax.set_ylim(0, 30)
ax.spines[["top", "right"]].set_visible(False)
ax.grid(axis="y", linestyle=":", alpha=0.45)
ax.set_axisbelow(True)
ax.legend(frameon=False, fontsize=9, loc="upper right")
fig.tight_layout()
fig.savefig(os.path.join(CHART_DIR, "02_strategy_rule_type.png"), dpi=160, bbox_inches="tight")
plt.close(fig)

# ---------- Chart 3: priority distribution ----------
fig, ax = plt.subplots(figsize=(11, 5.2))
pc = Counter(r["priority"] for r in rows)
prios = sorted(pc)
vals = [pc[p] for p in prios]
colors = []
for p in prios:
    if p == 1000:
        colors.append(C_RED)
    elif p >= 940:
        colors.append(C_ORANGE)
    elif p >= 840:
        colors.append(C_BLUE)
    else:
        colors.append(C_GREY)

bars = ax.bar(range(len(prios)), vals, color=colors, width=0.68, edgecolor="white", linewidth=1)
ax.set_xticks(range(len(prios)))
ax.set_xticklabels([str(p) for p in prios], fontsize=9, rotation=0)
ax.set_title("优先级取值分布：1000 承接全部 OJK 硬约束，长尾集中在 799–950",
             fontsize=13, fontweight="bold", pad=12)
ax.set_xlabel("priority 取值", fontsize=10)
ax.set_ylabel("规则条数", fontsize=10)
ax.set_ylim(0, max(vals) * 1.25)
ax.spines[["top", "right"]].set_visible(False)
ax.grid(axis="y", linestyle=":", alpha=0.45)
ax.set_axisbelow(True)
for b, v in zip(bars, vals):
    ax.text(b.get_x() + b.get_width() / 2, v + 0.5, str(v), ha="center", va="bottom",
            fontsize=9, fontweight="bold", color="#333")
ax.axhline(y=0, color="#ccc", linewidth=0.8)
fig.tight_layout()
fig.savefig(os.path.join(CHART_DIR, "03_priority_distribution.png"), dpi=160, bbox_inches="tight")
plt.close(fig)

# ---------- Chart 4: multilingual content length ----------
fig, ax = plt.subplots(figsize=(8.6, 5.2))
langs = ["en_US", "zh_CN", "id"]
lang_label = {"en_US": "en_US (英文)", "zh_CN": "zh_CN (中文)", "id": "id (印尼语)"}
lang_color = {"en_US": C_BLUE, "zh_CN": C_RED, "id": C_GREEN}

totals = []
avgs = []
for l in langs:
    lens = [len(json.loads(r["rule_content"])[l]) for r in rows]
    totals.append(sum(lens))
    avgs.append(sum(lens) / len(lens))

bars = ax.bar([lang_label[l] for l in langs], totals, color=[lang_color[l] for l in langs],
              width=0.5, edgecolor="white", linewidth=1.4)
for b, t, a in zip(bars, totals, avgs):
    ax.text(b.get_x() + b.get_width() / 2, t + max(totals) * 0.02,
            f"{t:,} 字符\n均 {a:.0f}", ha="center", va="bottom", fontsize=10, fontweight="bold", color="#333")
ax.set_title("三语文案总量对比：中文表达更紧凑（合计 3,550 vs 英文 11,042）",
             fontsize=12.5, fontweight="bold", pad=12)
ax.set_ylabel("三语文案字符总数", fontsize=10)
ax.set_ylim(0, max(totals) * 1.22)
ax.spines[["top", "right"]].set_visible(False)
ax.grid(axis="y", linestyle=":", alpha=0.45)
ax.set_axisbelow(True)
fig.tight_layout()
fig.savefig(os.path.join(CHART_DIR, "04_multilang_length.png"), dpi=160, bbox_inches="tight")
plt.close(fig)

# ---------- Chart 5: top longest rules by zh_CN length ----------
fig, ax = plt.subplots(figsize=(10.5, 6))
zh = sorted(rows, key=lambda r: len(json.loads(r["rule_content"])["zh_CN"]))
zh = zh[-12:]
names = [f"{r['rule_code']}\n{r['rule_name'][:20]}" for r in zh]
vals = [len(json.loads(r["rule_content"])["zh_CN"]) for r in zh]
colors = [C_RED if r["rule_type"] == "RED_LINE" else (C_BLUE if r["rule_type"] == "CONSTRAINT" else C_GREEN)
          for r in zh]
bars = ax.barh(range(len(zh)), vals, color=colors, height=0.62, edgecolor="white", linewidth=1)
ax.set_yticks(range(len(zh)))
ax.set_yticklabels(names, fontsize=7.5)
ax.set_xlabel("中文文案字符数", fontsize=10)
ax.set_title("中文文案最长的 12 条规则（越靠上越长）", fontsize=13, fontweight="bold", pad=12)
ax.set_xlim(0, max(vals) * 1.16)
ax.spines[["top", "right"]].set_visible(False)
ax.grid(axis="x", linestyle=":", alpha=0.45)
ax.set_axisbelow(True)
for b, v in zip(bars, vals):
    ax.text(v + max(vals) * 0.01, b.get_y() + b.get_height() / 2, str(v),
            va="center", fontsize=8.5, fontweight="bold", color="#333")
fig.tight_layout()
fig.savefig(os.path.join(CHART_DIR, "05_top_long_rules.png"), dpi=160, bbox_inches="tight")
plt.close(fig)

print("charts written to", CHART_DIR)
for f in sorted(os.listdir(CHART_DIR)):
    print(" ", f, os.path.getsize(os.path.join(CHART_DIR, f)), "bytes")
