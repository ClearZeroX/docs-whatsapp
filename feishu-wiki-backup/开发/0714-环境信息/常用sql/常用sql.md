# 常用sql

```SQL
select * from message_material_group order by id desc limit 10;

select * from message_template tt where tt.material_group_id = 1000166 order by id desc limit 10;

select * from message_template_waba tt where tt.message_template_id = 1050441 order by id desc limit 10;

SELECT material_group_id, COUNT(*) AS cnt
FROM message_template
GROUP BY material_group_id
ORDER BY cnt DESC;

select * from message_material_group  order by id desc limit 10;

select * from message_template_waba order by id desc;

select * from message_template where material_group_id = 1000115 and template_type = 'UTILITY'  order by id desc;
select count(*) from message_template tt;

select * from message_material_combination order by id desc;

select count(*) from message_material_combination where status = 'ACTIVE' order by id desc;

select * from message_template where ever_utility = 1 and template_type != 'UTILITY' order by id desc;

select * from message_template  order by id desc;

select * from message_material_group_lane order by id desc;

select * from message_material_template order by id desc;

select * from task_base  order by id desc;

select * from task_base where lane_code = 'CUSTOMER_NEW' and message_template_id > 0 order by id desc;

select count(*) from task_base where message_template_id > 0 order by id desc;

select * from waba_base order by id desc;
```

## AI备用

```SQL
select * from message_material_group where primary_group_id > 0 and creator not in ('fendy1', 'ridho1') order by id desc;

select primary_group_id from message_material_group where primary_group_id > 0 and creator not in ('fendy1', 'ridho1') order by id desc;

select
  *
from
  message_material_group
where
  id in (
    select
      primary_group_id
    from
      message_material_group
    where
      primary_group_id > 0
      and creator not in ('fendy1', 'ridho1')
  )
order by
  id desc;

select
  count(*)
from
  ai_material_suggestion
where
  material_group_id in (
    select
      primary_group_id
    from
      message_material_group
    where
      primary_group_id > 0
      and creator not in ('fendy1', 'ridho1')
    order by
      id desc
  )
  and ai_material_suggestion.suggest_type = 'AI_BACKUP_MATERIAL_GROUP'
  and status = 2;

  
select
  count(*)
from
  ai_material_suggestion
where
  material_group_id in (
    select
      primary_group_id
    from
      message_material_group
    where
      primary_group_id > 0
      and creator not in ('fendy1', 'ridho1')
    order by
      id desc
  )
  and ai_material_suggestion.suggest_type = 'AI_BACKUP_MATERIAL_GROUP'
  and status IN (1,3,4,5);
```

# mongodb

```SQL
db.message_record.find({ "_id": ObjectId("6a7407efca149917116df8f1") }).count()

db.message_record.find(
    { "customer_phone": "+8618716030179" }
)

db.message_record.find(
    { "customer_phone": "+8618716030179" }
).sort({ "_id": -1 })
```
