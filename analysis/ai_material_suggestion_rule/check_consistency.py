import json
import re
from collections import defaultdict

BASE = "/Users/opay-20260271/code-temp/ai-md/whatsapp_crm_docs/analysis/ai_material_suggestion_rule"
rows = json.load(open(f"{BASE}/ai_material_suggestion_rule.json", encoding="utf-8"))


def base_code(code):
    return re.sub(r"_(AI_BACKUP_MATERIAL_GROUP|COST_FIRST)$", "", code)


logical = {}
for r in rows:
    logical.setdefault(base_code(r["rule_code"]), r)

print("=== 编号连续性检查 ===")
by_family = defaultdict(set)
for b in logical:
    m = re.match(r"^([A-Z]+_(?:CONS|REDLINE|SUGG))_(\d+)$", b)
    if m:
        by_family[m.group(1)].add(int(m.group(2)))
for fam, nums in sorted(by_family.items()):
    mx = max(nums)
    missing = sorted(set(range(0, mx + 1)) - nums)
    print(f"  {fam}: present={sorted(nums)} missing={missing}")

print("\n=== rule_code 前缀 与 rule_type 不一致 ===")
mismatch = []
for b, r in sorted(logical.items()):
    m = re.match(r"^[A-Z]+_([A-Z]+)_\d+$", b)
    hint = m.group(1)
    expect = {"CONS": "CONSTRAINT", "REDLINE": "RED_LINE", "SUGG": "SUGGESTION"}[hint]
    if expect != r["rule_type"]:
        mismatch.append((b, hint, r["rule_type"], r["rule_name"]))
for m in mismatch:
    print(f"  {m[0]}: 编码前缀={m[1]} 实际 rule_type={m[2]}  「{m[3]}」")
print(f"  合计 {len(mismatch)} 条 / 24 条")

print("\n=== priority 分层（按 rule_source） ===")
by_src = defaultdict(list)
for b, r in logical.items():
    by_src[r["rule_source"]].append((r["priority"], b, r["rule_type"]))
for src in ["BUSINESS", "GENERAL", "AI_SUMMARY"]:
    items = sorted(by_src[src], reverse=True)
    print(f"  {src}: {[p for p, _, _ in items]}")

print("\n=== 同 priority 同策略内冲突 ===")
strat = defaultdict(lambda: defaultdict(list))
for r in rows:
    strat[r["suggest_type"]][r["priority"]].append(base_code(r["rule_code"]))
for s in ["AI_BACKUP_MATERIAL_GROUP", "COST_FIRST"]:
    print(f"  {s}:")
    for p in sorted(strat[s], reverse=True):
        if len(strat[s][p]) > 1:
            print(f"    priority={p} -> {strat[s][p]}")
