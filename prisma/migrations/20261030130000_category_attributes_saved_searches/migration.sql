ALTER TABLE "Ad" ADD COLUMN "attributes" JSONB;
CREATE INDEX "Ad_attributes_gin_idx" ON "Ad" USING GIN ("attributes" jsonb_path_ops);

CREATE TABLE "SavedSearch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SavedSearch_userId_name_key" ON "SavedSearch"("userId", "name");
CREATE INDEX "SavedSearch_userId_createdAt_idx" ON "SavedSearch"("userId", "createdAt");
ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Category" ("id", "name", "slug", "description", "createdAt", "updatedAt") VALUES
    ('nzk-category-property-v1', 'Property', 'property', 'Homes, rentals and flatmates across New Zealand.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('nzk-category-motor-v1', 'Motor', 'motor', 'Cars, motorcycles, boats and parts.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('nzk-category-jobs-v1', 'Jobs', 'jobs', 'Local roles and flexible work.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('nzk-category-services-v1', 'Services', 'services', 'Trades, repairs and local help.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('nzk-category-electronics-v1', 'Electronics', 'electronics', 'Phones, computers, appliances and technology across New Zealand.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('nzk-category-home-living-v1', 'Home & Living', 'home-living', 'Furniture, household goods and home essentials.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('nzk-category-fashion-v1', 'Fashion', 'fashion', 'Clothing, shoes and accessories.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('nzk-category-sports-hobbies-v1', 'Sports & Hobbies', 'sports-hobbies', 'Sporting goods, instruments, crafts and collectibles.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('nzk-category-pets-v1', 'Pets', 'pets', 'Pet supplies and services for New Zealand families.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('nzk-category-business-industrial-v1', 'Business & Industrial', 'business-industrial', 'Commercial equipment, tools and business supplies.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "Category" ("id", "name", "slug", "parentId", "createdAt", "updatedAt")
SELECT child.id, child.name, child.slug, parent.id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
    ('nzk-motor-cars-v1', 'Cars', 'cars', 'motor'),
    ('nzk-motor-motorcycles-v1', 'Motorcycles', 'motorcycles', 'motor'),
    ('nzk-motor-boats-v1', 'Boats', 'boats', 'motor'),
    ('nzk-motor-parts-v1', 'Parts & Accessories', 'parts-accessories', 'motor'),
    ('nzk-property-sale-v1', 'Sale', 'sale', 'property'),
    ('nzk-property-rent-v1', 'Rent', 'rent', 'property'),
    ('nzk-property-flatmates-v1', 'Flatmates', 'flatmates', 'property'),
    ('nzk-jobs-full-time-v1', 'Full-time', 'full-time', 'jobs'),
    ('nzk-jobs-part-time-v1', 'Part-time', 'part-time', 'jobs'),
    ('nzk-jobs-casual-v1', 'Casual', 'casual', 'jobs'),
    ('nzk-services-trades-v1', 'Trades', 'trades', 'services'),
    ('nzk-services-repairs-v1', 'Repairs', 'repairs', 'services'),
    ('nzk-electronics-phones-v1', 'Phones', 'phones', 'electronics'),
    ('nzk-electronics-computers-v1', 'Computers', 'computers', 'electronics'),
    ('nzk-electronics-appliances-v1', 'Appliances', 'appliances', 'electronics'),
    ('nzk-home-furniture-v1', 'Furniture', 'furniture', 'home-living'),
    ('nzk-home-household-v1', 'Household Items', 'household-items', 'home-living'),
    ('nzk-fashion-clothing-v1', 'Clothing', 'clothing', 'fashion'),
    ('nzk-fashion-shoes-v1', 'Shoes & Accessories', 'shoes-accessories', 'fashion'),
    ('nzk-sports-equipment-v1', 'Sports Equipment', 'sports-equipment', 'sports-hobbies'),
    ('nzk-sports-music-v1', 'Music & Instruments', 'music-instruments', 'sports-hobbies'),
    ('nzk-pets-supplies-v1', 'Pet Supplies', 'pet-supplies', 'pets'),
    ('nzk-pets-services-v1', 'Pet Services', 'pet-services', 'pets'),
    ('nzk-business-tools-v1', 'Tools & Machinery', 'tools-machinery', 'business-industrial'),
    ('nzk-business-equipment-v1', 'Office & Business Equipment', 'office-business-equipment', 'business-industrial')
) AS child(id, name, slug, parent_slug)
JOIN "Category" parent ON parent.slug = child.parent_slug
ON CONFLICT ("slug") DO NOTHING;
