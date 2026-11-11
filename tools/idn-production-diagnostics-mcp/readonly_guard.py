import re


MYSQL_FORBIDDEN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL|SET|"
    r"LOAD|HANDLER|LOCK|UNLOCK|RENAME|ANALYZE|OPTIMIZE|REPAIR|FLUSH|KILL)\b",
    re.IGNORECASE,
)
MYSQL_READ_START = re.compile(
    r"^\s*(SELECT\b|EXPLAIN\s+SELECT\b|SHOW\s+(FULL\s+)?COLUMNS\b|SHOW\s+CREATE\s+TABLE\b)",
    re.IGNORECASE,
)
MYSQL_UNSAFE_FRAGMENT = re.compile(
    r"(;|--|#|/\*|\*/|INTO\s+(OUTFILE|DUMPFILE)\b|FOR\s+UPDATE\b|LOCK\s+IN\s+SHARE\s+MODE\b)",
    re.IGNORECASE,
)

MONGO_READ_START = re.compile(r"^\s*db\.[A-Za-z_][A-Za-z0-9_]*\.(find|countDocuments)\s*(?=\()", re.IGNORECASE)
MONGO_SUFFIX_PART = re.compile(
    r"^\s*\.(sort|limit|explain)\s*\(([^()]*)\)",
    re.IGNORECASE,
)
MONGO_UNSAFE = re.compile(
    r"\b(insertOne|insertMany|updateOne|updateMany|replaceOne|deleteOne|deleteMany|"
    r"findOneAndUpdate|findOneAndDelete|bulkWrite|aggregate|drop|rename|createIndex|"
    r"dropIndex|mapReduce|eval)\s*\(|\b(toArray|forEach)\s*\(|\$(where|function|accumulator|out|merge)\b",
    re.IGNORECASE,
)


def assert_read_only_query(instance, query):
    if not isinstance(query, str) or not query.strip():
        raise ValueError("query must be a non-empty string")
    if instance == "10.95.6.3-ob_collection":
        _assert_mysql(query)
        return
    if instance == "10.95.6.240-whatsapp-crm":
        _assert_mongo(query)
        return
    raise ValueError("database instance is not allowed")


def _assert_mysql(query):
    text = query.strip()
    if not MYSQL_READ_START.match(text):
        raise ValueError("only MySQL read-only statements are allowed")
    if MYSQL_FORBIDDEN.search(text):
        raise ValueError("MySQL write statement is not allowed")
    if MYSQL_UNSAFE_FRAGMENT.search(text):
        raise ValueError("unsafe MySQL query fragment is not allowed")


def _assert_mongo(query):
    text = query.strip()
    match = MONGO_READ_START.match(text)
    if not match:
        raise ValueError("only MongoDB find/countDocuments commands are allowed")
    if MONGO_UNSAFE.search(text):
        raise ValueError("unsafe MongoDB command is not allowed")
    start = text.find("(", match.start())
    depth = 0
    end = None
    in_string = False
    escape = False
    for index in range(start, len(text)):
        char = text[index]
        if escape:
            escape = False
            continue
        if char == "\\":
            escape = True
            continue
        if char == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                end = index + 1
                break
    if end is None:
        raise ValueError("MongoDB command is malformed")
    suffix = text[end:]
    seen = set()
    while suffix.strip():
        part = MONGO_SUFFIX_PART.match(suffix)
        if not part:
            raise ValueError("MongoDB command chain is not allowed")
        method = part.group(1).lower()
        if method in seen:
            raise ValueError("MongoDB command chain is not allowed")
        seen.add(method)
        suffix = suffix[part.end():]
