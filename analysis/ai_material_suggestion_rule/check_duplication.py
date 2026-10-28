import json
import re
from collections import defaultdict

BASE = "/Users/opay-20260271/code-temp/ai-md/whatsapp_crm_docs/analysis/ai_material_suggestion_rule"
rows = json.load(open(f"{BASE}/ai_material_suggestion_rule.json", encoding="utf-8"))

# Strip the trailing strategy token to recover the logical rule identity
def base_code(code):
    return re.sub(r"_(AI_BACKUP_MATERIAL_GROUP|COST_FIRST)$", "", code)

groups = defaultdict(list)
for r in rows:
    groups[base_code(r["rule_code"])].append(r)

print(f"distinct logical rules: {len(groups)}")
pairs = 0
diff_content, diff_priority, diff_lane = [], [], []
for b, items in sorted(groups.items()):
    if len(items) != 2:
        print(f"  !! {b} has {len(items)} rows")
        continue
    pairs += 1
    items.sort(key=lambda x: x["suggest_type"])
    a, c = items
    if a["rule_content"] != c["rule_content"]:
        diff_content.append(b)
    if a["priority"] != c["priority"]:
        diff_priority.append(b)
    if a["source_lane"] != c["source_lane"]:
        diff_lane.append(b)

print(f"paired logical rules: {pairs}")
print(f"content differs across strategies: {diff_content or 'none'}")
print(f"priority differs across strategies: {diff_priority or 'none'}")
print(f"source_lane differs across strategies: {diff_lane or 'none'}")

print("\n--- logical rule table ---")
print(f"{'base_code':<24}{'type':<12}{'source':<11}{'lane':<14}{'prio':<6}{'zh_len':<7}name")
for b in sorted(groups, key=lambda x: (-groups[x][0]["priority"], x)):
    r = groups[b][0]
    zh = len(json.loads(r["rule_content"])["zh_CN"])
    print(f"{b:<24}{r['rule_type']:<12}{r['rule_source']:<11}{r['source_lane']:<14}{r['priority']:<6}{zh:<7}{r['rule_name']}")

print("\n--- by rule_source, lane breakdown of logical rules ---")
for src in ["BUSINESS", "GENERAL", "AI_SUMMARY"]:
    sub = [groups[b][0] for b in groups if groups[b][0]["rule_source"] == src]
    lanes = defaultdict(int)
    for r in sub:
        lanes[r["source_lane"]] += 1
    print(f"  {src}: n={len(sub)} lanes={dict(lanes)}")
