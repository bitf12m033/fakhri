-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "searchDocument" TEXT,
ADD COLUMN     "searchVector" tsvector;

-- ============================================================
-- Search support (docs/aidlc/03-schema-design.md §8, increment 3.3)
-- "searchDocument" holds name + brand + category + tags + SKUs + searchable
-- attribute labels/values. It is recomputed by the catalog module inside the
-- same transaction as the mutation that changed it; "searchVector" is written
-- from it in the same statement. Both GIN indexes are below: pg_trgm for
-- substring/typo tolerance, tsvector for full-text ranking (REQ-09).
-- ============================================================

CREATE INDEX "Product_searchVector_idx" ON "Product" USING GIN ("searchVector");
CREATE INDEX "Product_searchDocument_trgm_idx" ON "Product" USING GIN ("searchDocument" gin_trgm_ops);
CREATE INDEX "Product_name_trgm_idx" ON "Product" USING GIN ("name" gin_trgm_ops);

-- Facet support: boolean and text attribute values (option/number already indexed in init).
CREATE INDEX "ProductAttributeValue_attributeId_booleanValue_idx"
  ON "ProductAttributeValue" ("attributeId", "booleanValue");

-- Price facets and sorting read active variants only.
CREATE INDEX "ProductVariant_productId_isActive_price_idx"
  ON "ProductVariant" ("productId", "isActive", "price");

-- One-time backfill of rows created before this migration.
WITH doc AS (
  SELECT p.id,
         concat_ws(' ', p.name, b.name, c.name, array_to_string(p.tags, ' '),
           (SELECT string_agg(DISTINCT v.sku, ' ') FROM "ProductVariant" v WHERE v."productId" = p.id),
           (SELECT string_agg(DISTINCT concat_ws(' ', a.name,
                     coalesce(o.label, pav."textValue", trim_scale(pav."numberValue")::text,
                              CASE WHEN pav."booleanValue" THEN a.name END),
                     a.unit), ' ')
              FROM "ProductAttributeValue" pav
              JOIN "Attribute" a ON a.id = pav."attributeId" AND a."isSearchable"
              LEFT JOIN "AttributeOption" o ON o.id = pav."optionValueId"
              LEFT JOIN "ProductVariant" pv ON pv.id = pav."variantId"
             WHERE pav."productId" = p.id OR pv."productId" = p.id)
         ) AS document
    FROM "Product" p
    JOIN "Brand" b ON b.id = p."brandId"
    JOIN "Category" c ON c.id = p."categoryId"
)
UPDATE "Product" p
   SET "searchDocument" = doc.document,
       "searchVector" = to_tsvector('simple', doc.document)
  FROM doc
 WHERE p.id = doc.id;
