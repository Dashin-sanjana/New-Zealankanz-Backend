# Production release and recovery

## Required services

- Vercel backend project `new-zealankanz-backend`, deployed from the backend repository and configured for Node.js 22.
- Neon PostgreSQL project/branch verified in the release record; use a pooled TLS connection for serverless runtime and a direct TLS connection for Prisma migrations when required.
- Vercel frontend project `new-zealankanz-frontend`, with `main` as its production branch.
- SMTP provider and verified sender domain.
- S3-compatible bucket, credentials, and a public CDN/base URL for listing images. Give the API key only PutObject and DeleteObject access to the listing prefix. Configure CDN/bucket read access for listing objects only, allow GET/HEAD, and serve the Vercel origin with the required cross-origin resource policy.

Set backend values from `.env.production.example` in the Vercel backend project's encrypted environment settings, never in Git. Set `VITE_API_BASE_URL` in the frontend Vercel project's production build settings only after the backend is deployed and healthy. Configure exact HTTPS frontend origins in `CORS_ORIGIN` and `PUBLIC_SITE_URL`. The backend requires configured SMTP and S3-compatible object storage in production; do not deploy with placeholder values or local filesystem storage.

## Before each schema release

1. Confirm the target Neon project, branch, database, and role from Neon Console; never copy a production URL into a repository, shell history, or CI log.
2. Create a persistent recovery branch from the target Neon branch and verify its parent, project, database, schema, and pre-change record counts. Use Neon point-in-time recovery or protected encrypted dumps as applicable to the release policy.
3. Compare the live schema with the migration history using a read-only schema diff. Do not run migrate reset, migrate dev, or the seed script against production.
4. Review the SQL in every pending migration for locks, table rewrites, destructive operations, and extension privileges. The current category/search migration adds a nullable JSONB listing-attributes column and GIN index, a user-owned SavedSearch table with a cascading foreign key, and idempotent category inserts. It does not rewrite or delete listing rows. Confirm `pg_trgm` and `jsonb_path_ops` operator support and index build cost against the managed PostgreSQL version and dataset size before applying.
5. Deploy the backend build and run `pnpm prisma:migrate:deploy` with the protected production connection only after recovery and drift review are accepted.

### Read-only production schema inspection

Do not put the production connection string in the repository, command history, CI output, or screenshots. An authorized operator should configure a short-lived, TLS-required, read-only PostgreSQL service profile named `nzk-prod-readonly` in their protected local libpq service file, then run the inspection from a private terminal. Force every SQL session read-only:

```sh
PGOPTIONS='-c default_transaction_read_only=on' psql 'service=nzk-prod-readonly' -X -v ON_ERROR_STOP=1
```

Run `BEGIN READ ONLY;` before the queries below and `ROLLBACK;` at the end. The profile must use a read-only database role; the PGOPTIONS guard is an additional safeguard, not a substitute for that role.

```sql
SELECT current_database(), current_setting('server_version'), current_setting('transaction_read_only');
SELECT extname, extversion FROM pg_extension WHERE extname IN ('pg_trgm');
SELECT table_name, column_name, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
SELECT t.typname AS enum_name, e.enumsortorder, e.enumlabel
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' ORDER BY t.typname, e.enumsortorder;
SELECT c.relname AS table_name, con.conname, con.contype, pg_get_constraintdef(con.oid)
FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' ORDER BY c.relname, con.conname;
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' ORDER BY tablename, indexname;
SELECT to_regclass('public._prisma_migrations') AS prisma_migrations_table;
```

If `_prisma_migrations` exists, inspect only its migration names, `finished_at`, `rolled_back_at`, and `logs`; redact any operational messages before sharing. Do not inspect user rows or copy production data. Save a schema-only dump with no owner/privilege data through the same protected service profile if an independent diff is needed:

```sh
pg_dump --schema-only --no-owner --no-privileges --schema=public 'service=nzk-prod-readonly' > /private/tmp/nzk-production-schema.sql
```

Compare the inspection output and schema-only dump against the baseline and each later migration in timestamp order. Confirm every expected table/column/type/default, enum value, primary/unique/foreign key, index/operator class, extension, parent-child category relationship, and migration ledger entry. Investigate extra or missing objects and duplicate category slugs before deciding anything. Stop on drift; never infer baseline compatibility from a successful application build or from the local test database. This procedure is read-only and does not resolve or apply migrations.

### Existing-database baseline reconciliation

`20261029160000_baseline_main` creates the original tables. It is for an empty database and must not be applied to the populated production database. First inspect production read-only, compare every table, column, enum, constraint, and index with the baseline, and verify the provider backup. If and only if the live schema matches that baseline, record the baseline as already applied with `pnpm prisma:migrate:baseline:resolve`; then apply only the later additive migrations with `pnpm prisma:migrate:deploy`. If the live schema differs, stop and prepare a separately reviewed reconciliation migration. Do not edit production data to make the comparison pass.

Baseline reconciliation is a separate, explicitly approved operator action after independent schema review and backup verification. Do not run the resolve command as part of routine backend startup or deployment automation. If the migration ledger is missing, partial, or inconsistent, stop and reconcile it under database change control before proceeding.

The migration wrapper rejects unapproved remote targets. Production execution requires `PRISMA_PRODUCTION_TARGET` to match the exact `host:port/database`, a non-empty `PRISMA_PRODUCTION_BACKUP_REFERENCE`, and `PRISMA_PRODUCTION_SCHEMA_REVIEWED=yes`. Baseline resolution additionally requires `PRISMA_PRODUCTION_BASELINE_CONFIRMED=yes`. Never put credentials in these values or in logs. The local allowlist is restricted to `nzk_test`, `nzk_demo`, and `nzk_legacy_test`; another local database requires an explicit `PRISMA_LOCAL_MIGRATION_TARGET`.

## Deployment order and smoke tests

Deploy the Vercel backend first, then verify `/api/health`, registration email, login/logout token invalidation, public listing/search, image upload/read/delete, and admin moderation. Deploy the Vercel frontend after the API is healthy. Confirm Vercel reports the expected main commit as Ready and check buyer/seller flows on the production frontend URL.

## Recovery

Prisma migrations in this repository have no automatic down migrations. Prefer a forward corrective migration. For a failed non-destructive release, roll the API back to the prior Vercel deployment while retaining the additive schema. Restore a database only from the verified Neon recovery point under the provider's recovery procedure and after assessing writes made since that point. Restore object storage from its versioning/backup policy if objects are affected.

## Current deployment caveats

- The first baseline migration assumes an empty database; it must not be applied to populated production. The later four migrations, including `20261030130000_category_attributes_saved_searches`, have only been validated in the disposable local database. Their compatibility with the managed production schema cannot be proven without a read-only schema comparison.
- The session-version migration invalidates tokens minted before it was deployed; users will need to sign in again.
- Existing process-local uploads are not moved automatically. Back up and migrate old objects with a separately reviewed script before enabling a new S3 bucket for existing production listings.
- CI validates code and applies migrations only to an ephemeral PostgreSQL service. It does not verify Vercel, Neon, SMTP, or object storage credentials.
