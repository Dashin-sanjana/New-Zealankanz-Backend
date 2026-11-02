import { spawnSync } from 'node:child_process'

const command = process.argv[2]
const commands = {
  dev: ['migrate', 'dev'],
  deploy: ['migrate', 'deploy'],
  'resolve-baseline': ['migrate', 'resolve', '--applied', '20261029160000_baseline_main'],
}

if (!Object.hasOwn(commands, command)) {
  console.error('Choose dev, deploy, or resolve-baseline.')
  process.exit(2)
}

const rawUrl = process.env.DATABASE_URL
if (!rawUrl) {
  console.error('DATABASE_URL is required.')
  process.exit(2)
}

let databaseUrl
try {
  databaseUrl = new URL(rawUrl)
} catch {
  console.error('DATABASE_URL must be a valid PostgreSQL URL.')
  process.exit(2)
}

const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ''))
const target = `${databaseUrl.hostname}:${databaseUrl.port || '5432'}/${databaseName}`
const localHost = ['127.0.0.1', 'localhost', '[::1]'].includes(databaseUrl.hostname)
const localAllowlist = new Set(['nzk_test', 'nzk_demo', 'nzk_legacy_test'])
const acknowledgedLocalTarget = process.env.PRISMA_LOCAL_MIGRATION_TARGET === target
const productionTarget = process.env.PRISMA_PRODUCTION_TARGET === target
const productionChecksPassed = productionTarget
  && Boolean(process.env.PRISMA_PRODUCTION_BACKUP_REFERENCE?.trim())
  && process.env.PRISMA_PRODUCTION_SCHEMA_REVIEWED === 'yes'

if (process.env.NODE_ENV === 'production' && !productionChecksPassed) {
  console.error('Refusing migration in production without an exact target, verified backup reference, and completed read-only schema review.')
  process.exit(2)
}

if (command === 'dev' && (!localHost || process.env.NODE_ENV === 'production')) {
  console.error('migrate dev is limited to local non-production databases. Use the reviewed deploy workflow for remote targets.')
  process.exit(2)
}

if (localHost) {
  if (!localAllowlist.has(databaseName) && !acknowledgedLocalTarget) {
    console.error(`Refusing migration target ${target}; explicitly allow a local development database with PRISMA_LOCAL_MIGRATION_TARGET.`)
    process.exit(2)
  }
} else if (!productionChecksPassed) {
  console.error('Refusing remote database migration. Confirm the exact target, verified backup reference, and completed read-only schema review first.')
  process.exit(2)
}

if (command === 'resolve-baseline'
  && process.env.PRISMA_PRODUCTION_BASELINE_CONFIRMED !== 'yes'
  && !localHost) {
  console.error('Refusing baseline resolution without explicit confirmation that the existing schema matches the baseline.')
  process.exit(2)
}

if (command === 'resolve-baseline' && localHost && process.env.PRISMA_BASELINE_RECONCILIATION_CONFIRMED !== 'yes') {
  console.error('Baseline resolution requires PRISMA_BASELINE_RECONCILIATION_CONFIRMED=yes after checking the isolated schema.')
  process.exit(2)
}

const prismaCommand = process.platform === 'win32' ? 'prisma.cmd' : 'prisma'
const result = spawnSync(prismaCommand, commands[command], { stdio: 'inherit', env: process.env })
if (result.error) {
  console.error(`Could not start Prisma: ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 1)
