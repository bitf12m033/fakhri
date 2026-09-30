import { Injectable } from '@nestjs/common';
import { Prisma } from '@fakhri/prisma';
import { PrismaService } from '../../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Maintains `Product.searchDocument` / `Product.searchVector` (increment 3.3).
 *
 * The document is a set-based recompute from the catalog tables, so every entry
 * point below is the same statement with a different WHERE. Callers run it inside
 * the transaction that changed the data, which keeps the index consistent without
 * a queue; the outbox dispatcher can take over when workers land (see
 * docs/aidlc/08-increment-3.3-search-reads.md §Deviations).
 *
 * A stale or missing document degrades gracefully: search still matches `Product.name`
 * through its own trigram index.
 */
@Injectable()
export class SearchDocumentService {
  constructor(private readonly prisma: PrismaService) {}

  async refreshProduct(db: Db, productId: string): Promise<void> {
    await this.run(db, Prisma.sql`p.id = ${productId}`);
  }

  async refreshByBrand(db: Db, brandId: string): Promise<void> {
    await this.run(db, Prisma.sql`p."brandId" = ${brandId}`);
  }

  async refreshByCategory(db: Db, categoryId: string): Promise<void> {
    await this.run(db, Prisma.sql`p."categoryId" = ${categoryId}`);
  }

  /** Full rebuild. Admin-triggered; not part of a request transaction. */
  async refreshAll(): Promise<number> {
    return this.run(this.prisma, Prisma.sql`TRUE`);
  }

  private async run(db: Db, scope: Prisma.Sql): Promise<number> {
    return db.$executeRaw(Prisma.sql`
      WITH doc AS (
        SELECT p.id,
               concat_ws(' ', p.name, b.name, c.name, array_to_string(p.tags, ' '),
                 (SELECT string_agg(DISTINCT v.sku, ' ')
                    FROM "ProductVariant" v
                   WHERE v."productId" = p.id),
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
         WHERE ${scope}
      )
      UPDATE "Product" p
         SET "searchDocument" = doc.document,
             "searchVector" = to_tsvector('simple', doc.document)
        FROM doc
       WHERE p.id = doc.id
    `);
  }
}
