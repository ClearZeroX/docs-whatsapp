import json
import os
import re
from collections import defaultdict

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

BASE = "/Users/opay-20260271/code-temp/ai-md/whatsapp_crm_docs/analysis/ai_material_suggestion_rule"
CHART_DIR = os.path.join(BASE, "charts")
os.makedirs(CHART_DIR, exist_ok=True)

plt.rcParams["font.sans-serif"] = ["Arial Unicode MS", "Hiragino Sans GB", "STHeiti"]
plt.rcParams["axes.unicode_minus"] = False

rows = json.load(open(f"{BASE}/ai_material_suggestion_rule.json", encoding="utf-8"))
logical = {}
for r in rows:
    base = re.sub(r"_(AI_BACKUP_MATERIAL_GROUP|COST_FIRST)$", "", r["rule_code"])
    logical.setdefault(base, r)

C_BUS = "#C0392B"
C_GEN = "#2E5C8A"
C_AI = "#C9A227"
SRC_COLOR = {"BUSINESS": C_BUS, "GENERAL": C_GEN, "AI_SUMMARY": C_AI}
SRC_CN = {"BUSINESS": "BUSINESS 业务合规", "GENERAL": "GENERAL 通用技术", "AI_SUMMARY": "AI_SUMMARY 伪装策略"}

items = sorted(logical.values(), key=lambda r: (r["priority"], r["rule_source"]))

fig, ax = plt.subplots(figsize=(10.5, 8.2))
ys = range(len(items))
for y, r in zip(ys, items):
    ax.plot([0, r["priority"]], [y, y], color="#DDE3EA", linewidth=1.4, zorder=1)
    ax.scatter(r["priority"], y, s=120, color=SRC_COLOR[r["rule_source"]],
               edgecolor="white", linewidth=1.4, zorder=3)

ax.set_yticks(list(ys))
ax.set_yticklabels([f"{r['rule_code']}  {r['rule_name'][:22]}" for r in items], fontsize=8)
ax.set_xlim(760, 1030)
ax.set_xlabel("priority（数值越大优先级越高）", fontsize=10)
ax.set_title("规则优先级分层地图（24 条逻辑规则，按来源着色）", fontsize=13.5, fontweight="bold", pad=12)
ax.spines[["top", "right"]].set_visible(False)
ax.grid(axis="x", linestyle=":", alpha=0.45)
ax.set_axisbelow(True)
for p in [800, 850, 900, 940, 950, 1000]:
    ax.axvline(x=p, color="#E8A0A0" if p == 1000 else "#E5E5E5", linewidth=1, linestyle="--", alpha=0.7, zorder=0)
ax.text(1000, len(items) - 0.3, "1000 合规底线簇", ha="center", va="bottom", fontsize=9,
        color=C_BUS, fontweight="bold")

handles = [plt.Line2D([], [], marker="o", linestyle="", markersize=9,
                      markerfacecolor=SRC_COLOR[k], markeredgecolor="white", label=SRC_CN[k])
           for k in ["BUSINESS", "GENERAL", "AI_SUMMARY"]]
ax.legend(handles=handles, frameon=False, fontsize=9, loc="lower right")

fig.tight_layout()
fig.savefig(os.path.join(CHART_DIR, "06_priority_ladder.png"), dpi=160, bbox_inches="tight")
plt.close(fig)
print("written 06_priority_ladder.png")
