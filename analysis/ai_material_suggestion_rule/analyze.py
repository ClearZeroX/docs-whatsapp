import json
import os
from collections import Counter, defaultdict

BASE = "/Users/opay-20260271/code-temp/ai-md/whatsapp_crm_docs/analysis/ai_material_suggestion_rule"
rows = json.load(open(f"{BASE}/ai_material_suggestion_rule.json", encoding="utf-8"))

print("=== 1. 基本规模 ===")
print("rows:", len(rows))
print("id range:", min(r["id"] for r in rows), "-", max(r["id"] for r in rows))

print("\n=== 2. 枚举字段分布 ===")
for f in ["suggest_type", "rule_type", "rule_source", "source_lane", "material_type",
          "priority", "enabled", "operator", "create_time", "update_time"]:
    c = Counter(str(r[f]) for r in rows)
    print(f"{f}: {dict(sorted(c.items(), key=lambda x: (-x[1], x[0])))}")

print("\n=== 3. suggest_type x rule_type ===")
cross = defaultdict(Counter)
for r in rows:
    cross[r["suggest_type"]][r["rule_type"]] += 1
for k in sorted(cross):
    print(f"  {k}: {dict(cross[k])}  total={sum(cross[k].values())}")

print("\n=== 4. suggest_type x rule_source ===")
cross2 = defaultdict(Counter)
for r in rows:
    cross2[r["suggest_type"]][r["rule_source"]] += 1
for k in sorted(cross2):
    print(f"  {k}: {dict(cross2[k])}")

print("\n=== 5. suggest_type 内 priority 统计 ===")
for st in sorted({r["suggest_type"] for r in rows}):
    ps = sorted(r["priority"] for r in rows if r["suggest_type"] == st)
    print(f"  {st}: n={len(ps)} min={ps[0]} max={ps[-1]} distinct={len(set(ps))} values={ps}")

print("\n=== 6. priority 全局重复 ===")
pc = Counter(r["priority"] for r in rows)
dups = {p: n for p, n in pc.items() if n > 1}
print("  duplicated priorities:", dict(sorted(dups.items())))
for p in sorted(dups, reverse=True):
    print(f"  priority={p}:")
    for r in rows:
        if r["priority"] == p:
            print(f"     id={r['id']} {r['rule_code']} [{r['suggest_type']}] {r['rule_name']}")

print("\n=== 7. rule_code 前缀/后缀结构 ===")
prefix = Counter(r["rule_code"].rsplit("_", 1)[0] for r in rows)
print("  base rule_code (去掉策略后缀):")
for k, v in sorted(prefix.items(), key=lambda x: (-x[1], x[0])):
    print(f"    {k}: {v}")

print("\n=== 8. 同一 base rule_code 是否跨策略复用 ===")
by_base = defaultdict(list)
for r in rows:
    by_base[r["rule_code"].rsplit("_", 1)[0]].append(r)
for base in sorted(by_base):
    items = by_base[base]
    sts = sorted({i["suggest_type"] for i in items})
    contents = {json.dumps(i["rule_content"], sort_keys=True) for i in items}
    names = {i["rule_name"] for i in items}
    prios = sorted({i["priority"] for i in items})
    print(f"  {base}: n={len(items)} strategies={sts} same_content={len(contents)==1} same_name={len(names)==1} priorities={prios}")

print("\n=== 9. rule_content 三语长度 ===")
langs = ["en_US", "zh_CN", "id"]
stats = {l: [] for l in langs}
for r in rows:
    obj = json.loads(r["rule_content"])
    for l in langs:
        stats[l].append(len(obj[l]))
for l in langs:
    v = stats[l]
    print(f"  {l}: n={len(v)} min={min(v)} max={max(v)} avg={sum(v)/len(v):.1f} total={sum(v)}")
print(f"  keys present always: {all(set(json.loads(r['rule_content'])) == set(langs) for r in rows)}")

print("\n=== 10. 每条记录三语长度极差 ===")
for r in sorted(rows, key=lambda x: -max(len(json.loads(x['rule_content'])[l]) for l in langs))[:6]:
    obj = json.loads(r["rule_content"])
    lens = {l: len(obj[l]) for l in langs}
    print(f"  id={r['id']} {r['rule_code']}: {lens}")

print("\n=== 11. source_lane x suggest_type ===")
c3 = defaultdict(Counter)
for r in rows:
    c3[r["source_lane"]][r["suggest_type"]] += 1
for k in sorted(c3):
    print(f"  {k}: {dict(c3[k])}")

print("\n=== 12. 中文文案含关键词命中 ===")
kw = ["OJK", "Rupiah Cepat", "{{1}}", "emoji", "利率", "额度", "分期", "免费", "清真", "竞品"]
for k in kw:
    hit = [r["id"] for r in rows if k in json.loads(r["rule_content"])["zh_CN"]]
    print(f"  '{k}': {len(hit)} 条 -> {hit}")
