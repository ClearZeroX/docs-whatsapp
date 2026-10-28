import json, csv, os, glob

BASE = os.path.dirname(os.path.abspath(__file__))
COLS = ["id","rule_code","rule_name","source_lane","material_type","suggest_type",
        "rule_source","rule_type","rule_content","priority","enabled","operator",
        "create_time","update_time"]

rows = []
for p in sorted(glob.glob(os.path.join(BASE, "part*.json"))):
    with open(p, encoding="utf-8") as f:
        part = json.load(f)
    rows.extend(part)
    print(f"{os.path.basename(p)}: {len(part)} rows")

# Deduplicate by id, keep first occurrence
seen = {}
for r in rows:
    seen.setdefault(r[0], r)
rows = list(seen.values())
rows.sort(key=lambda r: -r[0])

print(f"total unique rows: {len(rows)}")
ids = [r[0] for r in rows]
print(f"id range: {min(ids)} ~ {max(ids)}")
print(f"missing ids in range: {sorted(set(range(min(ids), max(ids)+1)) - set(ids))}")

# Validate column count and rule_content JSON
bad = []
for r in rows:
    if len(r) != len(COLS):
        bad.append((r[0], "col_count", len(r)))
    try:
        obj = json.loads(r[8])
        for lang in ("en_US", "zh_CN", "id"):
            if not obj.get(lang):
                bad.append((r[0], "missing_lang", lang))
    except Exception as e:
        bad.append((r[0], "json_error", str(e)))
print(f"validation issues: {bad}")

with open(os.path.join(BASE, "ai_material_suggestion_rule.csv"), "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f)
    w.writerow(COLS)
    w.writerows(rows)

with open(os.path.join(BASE, "ai_material_suggestion_rule.json"), "w", encoding="utf-8") as f:
    json.dump([dict(zip(COLS, r)) for r in rows], f, ensure_ascii=False, indent=2)

print("written csv + json")

# Quick distribution snapshot
from collections import Counter
for idx, name in [(3,"source_lane"),(4,"material_type"),(5,"suggest_type"),(6,"rule_source"),(7,"rule_type"),(10,"enabled"),(11,"operator")]:
    print(name, dict(Counter(r[idx] for r in rows)))
