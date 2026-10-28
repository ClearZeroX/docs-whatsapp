import json

BASE = "/Users/opay-20260271/code-temp/ai-md/whatsapp_crm_docs/analysis/ai_material_suggestion_rule"

# Reference fingerprints computed in the browser context (string length + rolling hash)
ref = {166: (596, 2495780879473), 165: (507, 489513705942), 164: (1031, 7654051510728), 163: (397, 7515411656422),
       162: (548, 7199929824586), 161: (501, 7465906265480), 160: (1066, 601153123166), 159: (1133, 3811964153444),
       158: (1745, 3399516048553), 157: (983, 3294724033259), 156: (419, 3946642726828), 155: (336, 1409916630319),
       154: (517, 6596887343570), 153: (429, 358909591839), 152: (435, 4277046044931), 151: (350, 7235538213384),
       150: (463, 2132071142936), 149: (641, 3578813374675), 148: (657, 4436698600427), 147: (783, 1016555632356),
       146: (916, 5483471095702), 145: (1853, 6791724230582), 144: (386, 8241014215408), 143: (1017, 6200273311253),
       142: (568, 2660654505925), 141: (479, 4979666574759), 140: (1003, 4613382365198), 139: (369, 1024666231084),
       138: (520, 8540259706175), 137: (473, 1614667550695), 136: (1038, 5958204589276), 135: (1105, 6028965277054),
       134: (1717, 2348588232310), 133: (955, 2300861404143), 132: (391, 8752193148760), 131: (308, 5594587587640),
       130: (489, 1139171302967), 129: (401, 750685642276), 128: (407, 3202393391718), 127: (322, 361322987795),
       126: (435, 3324029564898), 125: (613, 567572332827), 124: (629, 545731412375), 123: (755, 7035194919385),
       122: (888, 5933057222907), 121: (1825, 3989774051824), 120: (358, 1715388216749), 119: (989, 1958249776194)}


def fingerprint(row):
    s = "".join(("NULL" if v is None else str(v)) + "|" for v in row)
    # Mirror JS semantics: charCodeAt() iterates UTF-16 code units, not code points
    buf = s.encode("utf-16-le")
    units = [int.from_bytes(buf[i:i + 2], "little") for i in range(0, len(buf), 2)]
    h = 0
    for u in units:
        h = (h * 131 + u) % 9007199254741
    return len(units), h


rows = json.load(open(f"{BASE}/ai_material_suggestion_rule.json", encoding="utf-8"))
mismatch = []
for r in rows:
    arr = [r["id"], r["rule_code"], r["rule_name"], r["source_lane"], r["material_type"], r["suggest_type"],
           r["rule_source"], r["rule_type"], r["rule_content"], r["priority"], r["enabled"], r["operator"],
           r["create_time"], r["update_time"]]
    got = fingerprint(arr)
    exp = ref.get(r["id"])
    if got != exp:
        mismatch.append((r["id"], exp, got))

print(f"checked {len(rows)} rows")
if mismatch:
    for m in mismatch:
        print("MISMATCH", m)
else:
    print("all rows match browser source (length + rolling hash)")
