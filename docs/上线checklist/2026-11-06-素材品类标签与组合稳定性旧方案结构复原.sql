-- 素材品类、标签与组合稳定性旧方案结构复原脚本
-- Date: 2026-11-06
-- Purpose: Revert the DDL introduced by the original 2026-10-22 checklist.
-- Scope: Test environment structural rollback only.
--
-- This script only removes the old rollout structure. It does not delete
-- business rows, migrate legacy data, or touch the latest material_* tables.
-- Verify the target database before execution.

-- 1. Remove the unique category code index before removing category.code.
ALTER TABLE `category`
  DROP INDEX `uk_category_code`;

-- 2. Remove columns added to category by the old rollout plan.
ALTER TABLE `category`
  DROP COLUMN `code`,
  DROP COLUMN `category_type`,
  DROP COLUMN `source_type`;

-- 3. Remove the tag source column added by the old rollout plan.
ALTER TABLE `tag`
  DROP COLUMN `source_type`;

-- 4. Remove tag relation provenance columns and indexes.
ALTER TABLE `tag_relation`
  DROP INDEX `idx_entity_source`,
  DROP INDEX `idx_extract_log_id`,
  DROP COLUMN `source_type`,
  DROP COLUMN `binding_status`,
  DROP COLUMN `extract_log_id`;

-- 5. Remove the combination category snapshot and its index.
ALTER TABLE `message_material_combination`
  DROP INDEX `idx_material_category_code`,
  DROP COLUMN `material_category_code`;

-- 6. Remove the statistic table created by the original checklist.
DROP TABLE IF EXISTS `material_category_tag_diff_stat`;
