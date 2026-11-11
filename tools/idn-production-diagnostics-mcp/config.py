ENVIRONMENT = "idn-prod"
DBS_BASE_URL = "https://dbs.rupiahcepatweb.com"
DBS_QUERY_PATH = "/query/"
KIBANA_BASE_URL = "https://log.rupiahcepatweb.com"
KIBANA_SEARCH_PATH = "/internal/search/es"
KIBANA_DATA_VIEW = "*whatsapp*"

MYSQL_INSTANCE = "10.95.6.3-ob_collection"
MONGO_INSTANCE = "10.95.6.240-whatsapp-crm"
DATABASE = "whatsapp_crm"
DBS_PAGE_SIZE = 50
MAX_QUERY_LIMIT = 50
IN_BATCH_SIZE = 500

# Production MySQL tables are allowed by default. Keep this list empty until a
# concrete table must be excluded; field validation still comes from live schema.
MYSQL_BLOCKED_TABLES = set()

MONGO_COLLECTION_FIELDS = {
    "message_record": {
        "_id", "task_id", "business_phone", "customer_phone", "template", "template_name",
        "msg_status", "send_time", "relate_extra", "create_time", "update_time",
    },
    "sub_task_data": {"_id", "task_id", "sub_task_id", "message_id", "status", "create_time", "update_time"},
    "sub_task_data_20250731": {"_id", "task_id", "sub_task_id", "message_id", "status", "create_time", "update_time"},
    "business_phone_stats": {"_id", "business_phone", "status", "create_time", "update_time"},
    "message_material": {"_id", "type", "body", "status", "create_time", "update_time"},
    "whatsapp_task_metrics": {"_id", "task_id", "status", "create_time", "update_time"},
}

SENSITIVE_FIELDS = {
    "phone", "mobile", "business_phone", "customer_phone", "phone_number", "email", "openid", "open_id"
}

