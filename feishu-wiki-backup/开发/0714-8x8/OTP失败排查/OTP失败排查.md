# OTP失败排查

## mongodb 

OTP失败排查，任务、模板、时间替换，看记录中third_status_extra字段中状态值，8x8打点解析有些问题，告警排除了131026但是8x8实际没有打进去，所以也会报警，后面修复

```Bash
db.message_record.find(
  {
    "task_id": 31,
    "agentName": "EIGHTX802",
    "template.name": "otp_normal_8x80102",
    "msg_status": { "$in": ["request_fail", "request_fail_spam", "failed"] },
    "insert_time": {
      "$gte": ISODate("2026-09-14T16:00:00Z"),
      "$lt":  ISODate("2026-09-15T16:00:00Z")
    }
  }
).sort({ "_id": -1 }).limit(100)
```
