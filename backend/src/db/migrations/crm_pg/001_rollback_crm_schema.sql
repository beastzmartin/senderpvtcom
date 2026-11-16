-- ============================================================================
-- 100M+ CONTACTS CRM - POSTGRESQL ROLLBACK MIGRATION
-- Migration: 001_rollback_crm_schema.sql
-- ============================================================================

DROP TABLE IF EXISTS crm_audit_log CASCADE;
DROP TABLE IF EXISTS crm_suppression_list CASCADE;
DROP TABLE IF EXISTS crm_webhook_deliveries CASCADE;
DROP TABLE IF EXISTS crm_webhooks CASCADE;
DROP TABLE IF EXISTS crm_api_usage_logs CASCADE;
DROP TABLE IF EXISTS crm_api_keys CASCADE;
DROP TABLE IF EXISTS crm_jobs CASCADE;
DROP TABLE IF EXISTS crm_exports CASCADE;
DROP TABLE IF EXISTS crm_imports CASCADE;
DROP TABLE IF EXISTS crm_activities CASCADE;
DROP TABLE IF EXISTS crm_custom_field_definitions CASCADE;
DROP TABLE IF EXISTS crm_contact_tags CASCADE;
DROP TABLE IF EXISTS crm_tags CASCADE;
DROP TABLE IF EXISTS crm_list_members CASCADE;
DROP TABLE IF EXISTS crm_lists CASCADE;
DROP TABLE IF EXISTS crm_contacts CASCADE;
DROP TABLE IF EXISTS crm_companies CASCADE;
DROP TABLE IF EXISTS crm_workspace_members CASCADE;
DROP TABLE IF EXISTS crm_workspaces CASCADE;

