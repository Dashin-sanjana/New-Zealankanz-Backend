import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { PrismaClient, AdStatus, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { Pool } from 'pg';
import {
  parseWordPressDemoManifest,
  type WordPressDemoRecord,
} from '../src/ad/wordpress-demo-manifest';

const SOURCE = 'wordpress-marketplace';

const dbUrl = process.env.DATABASE_URL;
const args = process.argv
  .slice(2)
  .filter((arg, index) => !(index === 0 && arg === '--'));
const operation = args[0] || '--dry-run';
if (
  ![
    '--validate-only',
    '--dry-run',
    '--apply',
    '--rollback',
    '--staging-dry-run',
    '--staging-apply',
    '--production-dry-run',
    '--production-apply',
  ].includes(operation)
)
  throw new Error(
    'Use --validate-only, --dry-run, --apply, --rollback, or a gated staging/production operation.',
  );
const manifestArgument = args.indexOf('--manifest');
const manifestPath =
  (manifestArgument >= 0 ? args[manifestArgument + 1] : undefined) ||
  process.env.WORDPRESS_DEMO_MANIFEST;
if (!manifestPath)
  throw new Error('Provide --manifest <path> or WORDPRESS_DEMO_MANIFEST.');
const sourceRecords = parseWordPressDemoManifest(
  JSON.parse(readFileSync(resolve(manifestPath), 'utf8')) as unknown,
);
if (operation === '--validate-only') {
  console.log(
    JSON.stringify(
      {
        sourceRecords: sourceRecords.length,
        numericPrices: sourceRecords.filter((item) => item.price !== null)
          .length,
        explicitCurrencies: sourceRecords.filter(
          (item) => item.priceCurrency !== null,
        ).length,
        priceTypes: sourceRecords.filter((item) => item.priceType).length,
        locations: sourceRecords.filter((item) => item.location).length,
        mediaReferencesUnverified: sourceRecords.reduce(
          (sum, item) => sum + item.imageReferenceCount,
          0,
        ),
        imagesToImport: 0,
        sellerContactEnabled: 0,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
if (!dbUrl)
  throw new Error('DATABASE_URL is required for database operations.');
const target = new URL(dbUrl);
const localTarget =
  target.hostname === '127.0.0.1' &&
  target.port === '55433' &&
  target.pathname === '/nzk_marketplace_demo';
const productionApply = operation === '--production-apply';
const productionDryRun = operation === '--production-dry-run';
const productionOperation = productionApply || productionDryRun;
const stagingApply = operation === '--staging-apply';
const stagingDryRun = operation === '--staging-dry-run';
const stagingOperation = stagingApply || stagingDryRun;
const updateOnlyApply = productionApply || stagingApply;
const approvedProductionTarget =
  productionOperation &&
  process.env.PRISMA_IMPORT_PRODUCTION_APPROVED === 'yes' &&
  process.env.PRISMA_IMPORT_PRODUCTION_IDENTITY_VERIFIED === 'yes' &&
  process.env.PRISMA_IMPORT_RECOVERY_VERIFIED === 'yes' &&
  process.env.PRISMA_IMPORT_PRODUCTION_PROJECT === 'wispy-mouse-76602888' &&
  process.env.PRISMA_IMPORT_PRODUCTION_BRANCH === 'br-cool-heart-adq4jews' &&
  process.env.PRISMA_IMPORT_RECOVERY_BRANCH === 'br-steep-sunset-adjv2qev' &&
  process.env.PRISMA_IMPORT_PRODUCTION_HOST === target.hostname &&
  target.hostname.endsWith('.neon.tech') &&
  target.pathname === '/neondb';
const approvedStagingTarget =
  stagingOperation &&
  process.env.PRISMA_IMPORT_STAGING_APPROVED === 'yes' &&
  process.env.PRISMA_IMPORT_STAGING_PROJECT === 'wispy-mouse-76602888' &&
  process.env.PRISMA_IMPORT_STAGING_BRANCH === 'br-round-surf-adpw4b3k' &&
  process.env.PRISMA_IMPORT_STAGING_HOST === target.hostname &&
  target.hostname.endsWith('.neon.tech') &&
  target.pathname === '/neondb';
if (productionOperation && !approvedProductionTarget)
  throw new Error(
    'Production import requires verified target identity and recovery branch acknowledgements.',
  );
if (stagingOperation && !approvedStagingTarget)
  throw new Error(
    'Staging operation requires the exact disposable Neon project, branch, and endpoint acknowledgement.',
  );
if (
  !productionOperation &&
  !stagingOperation &&
  (!localTarget || process.env.NODE_ENV === 'production')
)
  throw new Error(
    'Staging imports are restricted to 127.0.0.1:55433/nzk_marketplace_demo.',
  );

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: dbUrl })),
});

async function ensureCategory(
  tx: Prisma.TransactionClient,
  name: string,
  slug: string,
) {
  return tx.category.upsert({
    where: { slug },
    update: {},
    create: { name, slug },
  });
}

async function apply(records: WordPressDemoRecord[]) {
  return prisma.$transaction(
    async (tx) => {
      if (updateOnlyApply) {
        const current = await tx.ad.findMany({
          where: { sourceSystem: SOURCE },
          select: { sourceRecordId: true, demoContent: true },
        });
        const expectedIds = new Set(
          records.map((record) => String(record.sourceId)),
        );
        if (
          current.length !== records.length ||
          current.some(
            (row) =>
              !row.demoContent ||
              !row.sourceRecordId ||
              !expectedIds.has(row.sourceRecordId),
          ) ||
          new Set(current.map((row) => row.sourceRecordId)).size !==
            records.length
        ) {
          throw new Error(
            'Production transaction requires exactly 22 unique existing demo source IDs; no creates are allowed.',
          );
        }
      }
      // Production reconciliation is update-only. It preserves the current owner of
      // each already imported demo record and cannot create users or listings.
      let ownerId: string | undefined;
      if (!updateOnlyApply) {
        const existingOwner = await tx.user.findUnique({
          where: { email: 'demo-content@system.invalid' },
        });
        if (
          existingOwner &&
          (!existingOwner.systemAccount || existingOwner.active)
        )
          throw new Error(
            'Reserved demo owner email is already used by an active or non-demo account.',
          );
        const owner =
          existingOwner ??
          (await tx.user.create({
            data: {
              email: 'demo-content@system.invalid',
              name: 'Marketplace Demo Collection',
              password: await bcrypt.hash(randomBytes(48).toString('hex'), 12),
              active: false,
              emailVerified: false,
              systemAccount: true,
            },
          }));
        ownerId = owner.id;
      }
      const categoryIds = new Map<string, string>();
      for (const { name, slug } of new Map(
        records.map((item) => [
          item.categorySlug,
          { name: item.categoryName, slug: item.categorySlug },
        ]),
      ).values()) {
        const category = await ensureCategory(tx, name, slug);
        categoryIds.set(slug, category.id);
      }
      let imported = 0;
      for (const item of records) {
        const location = item.location
          ? await tx.location.upsert({
              where: {
                slug: item.location
                  .toLocaleLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-|-$/g, ''),
              },
              update: {},
              create: {
                name: item.location,
                slug: item.location
                  .toLocaleLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-|-$/g, ''),
              },
            })
          : null;
        const attributes = {
          _sourceCategories: item.categories,
          _sourceCurrencySymbol: item.currencySymbol,
          _sourcePriceOriginal: item.price,
          _sourcePriceType: item.priceType,
          _sourceDate: item.publishedAt?.toISOString() || null,
        } as Prisma.InputJsonValue;
        const key = {
          sourceSystem_sourceRecordId: {
            sourceSystem: SOURCE,
            sourceRecordId: String(item.sourceId),
          },
        };
        const existingSourceAd = await tx.ad.findUnique({
          where: key,
          select: { id: true, demoContent: true, sourceUrl: true },
        });
        if (existingSourceAd && !existingSourceAd.demoContent)
          throw new Error(
            `Source ID ${item.sourceId} collides with a non-demo listing.`,
          );
        if (existingSourceAd?.sourceUrl) {
          const existingPath = new URL(existingSourceAd.sourceUrl).pathname;
          if (!existingPath.includes(`/ad/${item.slug}/`))
            throw new Error(
              `Source ID ${item.sourceId} has a conflicting source URL.`,
            );
        }
        if (updateOnlyApply && !existingSourceAd)
          throw new Error(
            `Update-only reconciliation cannot create source ID ${item.sourceId}.`,
          );
        const updateData: Prisma.AdUncheckedUpdateInput = {
          title: item.title,
          description: item.description,
          categoryId: categoryIds.get(item.categorySlug)!,
          locationId: location?.id ?? null,
          price: item.price === null ? null : new Prisma.Decimal(item.price),
          priceCurrency: item.priceCurrency,
          priceLabel: item.priceLabel,
          priceType: item.priceType,
          status: AdStatus.APPROVED,
          featured: item.featured,
          demoContent: true,
          sourceUrl: item.sourceUrl,
          attributes,
          ...(item.publishedAt ? { createdAt: item.publishedAt } : {}),
        };
        if (updateOnlyApply) {
          await tx.ad.update({
            where: { id: existingSourceAd!.id },
            data: updateData,
          });
        } else {
          await tx.ad.upsert({
            where: key,
            update: updateData,
            create: {
              title: item.title,
              slug: `${item.slug}-demo`,
              description: item.description,
              categoryId: categoryIds.get(item.categorySlug)!,
              locationId: location?.id ?? null,
              price:
                item.price === null ? null : new Prisma.Decimal(item.price),
              priceCurrency: item.priceCurrency,
              priceLabel: item.priceLabel,
              priceType: item.priceType,
              status: AdStatus.APPROVED,
              featured: item.featured,
              demoContent: true,
              sourceSystem: SOURCE,
              sourceRecordId: String(item.sourceId),
              sourceUrl: item.sourceUrl,
              userId: ownerId!,
              attributes,
              ...(item.publishedAt ? { createdAt: item.publishedAt } : {}),
            },
          });
        }
        // Source media URLs are unverified references. Do not import them or alter
        // any previously stored image references during reconciliation.
        imported++;
      }
      return imported;
    },
    { maxWait: 10000, timeout: 60000 },
  );
}

async function rollback() {
  return prisma.$transaction(async (tx) => {
    const count = await tx.ad.count({
      where: { sourceSystem: SOURCE, demoContent: true },
    });
    await tx.ad.deleteMany({
      where: { sourceSystem: SOURCE, demoContent: true },
    });
    await tx.user.deleteMany({
      where: { email: 'demo-content@system.invalid', systemAccount: true },
    });
    return count;
  });
}

function fieldCoverage(
  records: Array<{
    price: unknown;
    priceCurrency: string | null;
    priceType: string | null;
    locationId?: string | null;
    location?: string | null;
    images?: unknown[];
  }>,
) {
  return {
    numericPrice: records.filter((item) => item.price !== null).length,
    currency: records.filter((item) => item.priceCurrency !== null).length,
    priceType: records.filter((item) => item.priceType !== null).length,
    location: records.filter(
      (item) =>
        (item.locationId !== null && item.locationId !== undefined) ||
        Boolean(item.location),
    ).length,
    images: records.filter((item) => (item.images?.length || 0) > 0).length,
  };
}

async function main() {
  if (operation === '--rollback') {
    console.log(
      `Rollback removed ${await rollback()} source-controlled demo listings.`,
    );
    return;
  }
  const sourceIds = sourceRecords.map((item) => String(item.sourceId));
  const [sourceRows, alreadyImported, nonDemoCount, userCount] =
    await Promise.all([
      prisma.ad.findMany({
        where: { sourceSystem: SOURCE },
        select: {
          id: true,
          sourceRecordId: true,
          demoContent: true,
          price: true,
          priceCurrency: true,
          priceType: true,
          locationId: true,
          images: { select: { id: true } },
        },
      }),
      prisma.ad.count({ where: { sourceSystem: SOURCE, demoContent: true } }),
      prisma.ad.count({ where: { demoContent: false } }),
      prisma.user.count(),
    ]);
  const sourceIdSet = new Set(sourceIds);
  const inScopeRows = sourceRows.filter(
    (item) => item.sourceRecordId && sourceIdSet.has(item.sourceRecordId),
  );
  const bySourceId = new Map<string, (typeof sourceRows)[number]>();
  for (const row of inScopeRows) {
    if (row.sourceRecordId) bySourceId.set(row.sourceRecordId, row);
  }
  const duplicateSourceIds = inScopeRows
    .map((item) => item.sourceRecordId)
    .filter(
      (id, index, all): id is string =>
        Boolean(id) && all.indexOf(id) !== index,
    );
  const missingSourceIds = sourceIds.filter((id) => !bySourceId.has(id));
  const collisions = inScopeRows.filter((item) => !item.demoContent);
  const unexpectedSourceIds = sourceRows
    .filter(
      (item) => !item.sourceRecordId || !sourceIdSet.has(item.sourceRecordId),
    )
    .map((item) => item.sourceRecordId || '(missing source ID)');
  if (
    productionOperation &&
    (productionApply || productionDryRun) &&
    (sourceRows.length !== 22 ||
      inScopeRows.length !== 22 ||
      missingSourceIds.length > 0 ||
      collisions.length > 0 ||
      duplicateSourceIds.length > 0 ||
      unexpectedSourceIds.length > 0)
  )
    throw new Error(
      `Production reconciliation requires exactly 22 matching demo source IDs; found ${inScopeRows.length} matches, ${missingSourceIds.length} missing, ${collisions.length} collisions, ${duplicateSourceIds.length} duplicates, and ${unexpectedSourceIds.length} unexpected source rows.`,
    );

  const beforeCoverage = fieldCoverage(inScopeRows);
  const afterCoverage = fieldCoverage(
    sourceRecords.map((item) => ({
      price: item.price,
      priceCurrency: item.priceCurrency,
      priceType: item.priceType,
      location: item.location,
      images: item.images,
    })),
  );
  console.log(
    JSON.stringify(
      {
        mode: operation,
        target: `${target.hostname}:${target.port}${target.pathname}`,
        sourceRecords: sourceRecords.length,
        alreadyImported,
        nonDemoListingsPreservedByUpdateOnlyMode: nonDemoCount,
        userRecordsPreservedByUpdateOnlyMode: userCount,
        matchingSourceIds: inScopeRows.length,
        missingSourceIds,
        collisions: collisions.length,
        duplicateSourceIds: [...new Set(duplicateSourceIds)],
        unexpectedSourceIds,
        plannedUpdates: inScopeRows.filter((item) => item.demoContent).length,
        plannedCreates: missingSourceIds.length,
        plannedDuplicates: 0,
        planned:
          operation === '--dry-run' ||
          operation === '--production-dry-run' ||
          operation === '--staging-dry-run'
            ? 'no writes'
            : 'source-ID-keyed idempotent upsert',
        fieldCoverage: { before: beforeCoverage, after: afterCoverage },
        summary: {
          featured: sourceRecords.filter((item) => item.featured).length,
          numericPrices: sourceRecords.filter((item) => item.price !== null)
            .length,
          explicitCurrencies: sourceRecords.filter(
            (item) => item.priceCurrency !== null,
          ).length,
          priceTypes: sourceRecords.filter((item) => item.priceType).length,
          locations: sourceRecords.filter((item) => item.location).length,
          mediaReferencesUnverified: sourceRecords.reduce(
            (sum, item) => sum + item.imageReferenceCount,
            0,
          ),
          imagesToImport: 0,
        },
        records: sourceRecords.map((item) => ({
          id: item.sourceId,
          slug: item.slug,
          title: item.title,
          category: item.categoryName,
          images: item.images.length,
          price: item.price,
          priceType: item.priceType,
          currency: item.priceCurrency,
          location: item.location,
        })),
      },
      null,
      2,
    ),
  );
  if (operation === '--apply' || updateOnlyApply)
    console.log(`Imported/updated ${await apply(sourceRecords)} demo records.`);
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Demo import failed.',
    );
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
