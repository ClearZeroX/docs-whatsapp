import re


PRODUCTION_MARKERS = (
    "印尼生产",
    "印尼 prod",
    "idn prod",
    "idn-prod",
    "indonesia production",
)


def is_explicit_idn_production_request(text):
    normalized = " ".join(str(text or "").lower().split())
    return any(marker in normalized for marker in PRODUCTION_MARKERS)


def redact_value(field, value):
    name = str(field or "").lower()
    if value is None or name not in {
        "phone", "mobile", "business_phone", "customer_phone", "phone_number", "openid", "open_id"
    } and "phone" not in name and "openid" not in name:
        if "email" not in name:
            return value
    if "email" in name:
        text = str(value)
        if "@" not in text:
            return "***"
        local, domain = text.split("@", 1)
        return (local[:1] if local else "*") + "***@" + domain
    text = str(value)
    if len(text) <= 4:
        return "*" * len(text)
    visible = min(4, len(text) // 2)
    return text[:visible] + "*" * max(0, len(text) - visible - 3) + text[-2:]


def redact_document(document):
    if isinstance(document, dict):
        return {key: redact_document(redact_value(key, value)) for key, value in document.items()}
    if isinstance(document, list):
        return [redact_document(item) for item in document]
    return document

