# 100M+ Contacts CRM - PostgreSQL Operations & Production Scaling Guide

This guide details the operational practices for hosting 100M+ contacts on PostgreSQL with zero downtime, instant query responses, and resilient recovery.

---

## 1. Storage & Partitioning Architecture
- **Partition Key**: `workspace_id`
- **Strategy**: 64-way Hash Partitioning (`crm_contacts_p0` .. `crm_contacts_p63`).
- **Benefit**:
  - Each partition holds ~1.5M rows for 100M total rows.
  - Queries filtered by `workspace_id` automatically execute **partition pruning** (inspecting only 1 partition instead of scanning 100M rows).
  - Vacuuming and indexing operate per-partition without locking the entire dataset.

---

## 2. Recommended PostgreSQL Engine Parameters (`postgresql.conf`)

For a dedicated server with 32GB - 64GB RAM:
```ini
# Memory Configuration
shared_buffers = 16GB                  # 25% of system memory
effective_cache_size = 48GB            # 75% of system memory
maintenance_work_mem = 2GB             # For index rebuilds & VACUUM
work_mem = 64MB                        # For sorting & hash joins per operation

# Checkpointing & Write Ahead Log (WAL)
wal_buffers = 64MB
checkpoint_completion_target = 0.9
max_wal_size = 32GB
min_wal_size = 4GB

# Background Writer & Autovacuum Tuning
autovacuum = on
autovacuum_max_workers = 6
autovacuum_vacuum_scale_factor = 0.05   # Trigger vacuum sooner on partitioned tables
autovacuum_analyze_scale_factor = 0.02
autovacuum_vacuum_cost_limit = 2000

# Slow Query Diagnostics
shared_preload_libraries = 'pg_stat_statements'
pg_stat_statements.track = all
log_min_duration_statement = 250        # Log any query slower than 250ms
```

---

## 3. Connection Pooling with PgBouncer
- Always route application traffic through **PgBouncer** in `pool_mode = transaction`.
- Enables serving 10,000+ concurrent API clients using 50 to 100 actual PostgreSQL backend server connections.
- Node.js connection string should point to PgBouncer:
  `postgresql://postgres:password@pgbouncer-host:6432/crm_production?sslmode=disable`

---

## 4. Backups & Point-in-Time Recovery (PITR)

### A. WAL-G / pgBackRest Setup
Use **pgBackRest** or **WAL-G** targeting AWS S3 / Cloud Storage / MinIO:
1. Daily full base backup:
   ```bash
   pgbackrest --stanza=crm_prod backup --type=full
   ```
2. Continuous WAL archiving:
   ```ini
   archive_mode = on
   archive_command = 'pgbackrest --stanza=crm_prod archive-push %p'
   ```
3. Instant Point-in-Time Recovery (PITR):
   Restore to any exact minute:
   ```bash
   pgbackrest --stanza=crm_prod --target="2026-11-16 14:30:00" restore
   ```

---

## 5. Read Replicas & Read/Write Splitting
- Set up streaming physical replication using `pg_basebackup -R` and standby servers.
- Route heavy background export streaming queries and dynamic segment count computations to Read Replicas (`replica_pool`), keeping the Primary instance unburdened for real-time contact ingestion and updates.

---

## 6. Optional Search Layer (OpenSearch / ClickHouse)
- The codebase defines the `CrmSearchEngine` interface (`backend/src/crm/services/CrmSearchEngine.ts`).
- When scaling beyond 100M contacts with fuzzy full-text across custom fields, enable the `OpenSearchProvider` or `ClickHouseProvider` to offload analytical aggregation and fuzzy text queries.

