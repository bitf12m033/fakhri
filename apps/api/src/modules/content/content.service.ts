import { Injectable } from '@nestjs/common';
import { Prisma } from '@fakhri/prisma';
import { buildMeta, conflict, invalidInput, normalizePagination, notFound } from '@fakhri/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OUTBOX_EVENTS } from '../../outbox/event-types';
import { OutboxService } from '../../outbox/outbox.service';
import { iso, jsonWrite, readSeo } from '../catalog/catalog.serialize';
import {
  BannerQueryDto,
  CreateBannerDto,
  CreatePageDto,
  ListPagesQueryDto,
  UpdateBannerDto,
  UpdatePageDto,
} from './content.dto';

/**
 * Content pages and banners (REQ-33). Publishing emits CONTENT_UPDATED, which is
 * what will trigger storefront revalidation once there is a storefront (3.8).
 */
@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- pages

  async createPage(dto: CreatePageDto) {
    const existing = await this.prisma.contentPage.findUnique({ where: { slug: dto.slug }, select: { id: true } });
    if (existing) throw conflict('That page slug is already in use', { slug: dto.slug });
    const isPublished = dto.isPublished ?? false;

    const created = await this.prisma.$transaction(async (tx) => {
      const page = await tx.contentPage.create({
        data: {
          slug: dto.slug,
          title: dto.title,
          body: dto.body,
          seo: jsonWrite(dto.seo),
          isPublished,
          publishedAt: isPublished ? new Date() : null,
        },
      });
      if (isPublished) await this.announce(tx, page.id, page.slug);
      await this.audit.log(
        {
          action: 'content.page.create',
          entityType: 'ContentPage',
          entityId: page.id,
          after: { slug: dto.slug, isPublished },
        },
        tx,
      );
      return page;
    });
    return serializePage(created);
  }

  async listPages(query: ListPagesQueryDto) {
    const { skip, take } = normalizePagination(query);
    const where: Prisma.ContentPageWhereInput = {};
    if (query.q) {
      where.OR = [
        { slug: { contains: query.q, mode: 'insensitive' } },
        { title: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.contentPage.count({ where }),
      this.prisma.contentPage.findMany({ where, orderBy: { slug: 'asc' }, skip, take }),
    ]);
    return { items: rows.map(serializePage), meta: buildMeta(total, skip, take) };
  }

  async updatePage(id: string, dto: UpdatePageDto) {
    const existing = await this.prisma.contentPage.findUnique({ where: { id } });
    if (!existing) throw notFound('Page');
    const publishing = dto.isPublished === true && !existing.isPublished;

    const updated = await this.prisma.$transaction(async (tx) => {
      const page = await tx.contentPage.update({
        where: { id },
        data: {
          title: dto.title,
          body: dto.body,
          seo: jsonWrite(dto.seo),
          isPublished: dto.isPublished,
          publishedAt: publishing ? new Date() : undefined,
        },
      });
      // Any change to a live page is worth announcing, including taking it down:
      // a pulled page must stop being served, not linger for a cache window.
      if (existing.isPublished || page.isPublished) {
        await this.announce(tx, page.id, page.slug);
      }
      await this.audit.log(
        {
          action: 'content.page.update',
          entityType: 'ContentPage',
          entityId: id,
          before: { isPublished: existing.isPublished },
          after: { isPublished: page.isPublished },
        },
        tx,
      );
      return page;
    });
    return serializePage(updated);
  }

  async removePage(id: string): Promise<{ id: string }> {
    const existing = await this.prisma.contentPage.findUnique({ where: { id } });
    if (!existing) throw notFound('Page');
    await this.prisma.$transaction(async (tx) => {
      await tx.contentPage.delete({ where: { id } });
      if (existing.isPublished) await this.announce(tx, id, existing.slug);
      await this.audit.log(
        { action: 'content.page.delete', entityType: 'ContentPage', entityId: id, before: { slug: existing.slug } },
        tx,
      );
    });
    return { id };
  }

  /** Published pages only: a draft must not be readable by guessing its slug. */
  async publicPage(slug: string) {
    const page = await this.prisma.contentPage.findFirst({ where: { slug, isPublished: true } });
    if (!page) throw notFound('Page');
    return {
      slug: page.slug,
      title: page.title,
      body: page.body,
      seo: readSeo(page.seo),
      publishedAt: page.publishedAt ? iso(page.publishedAt) : null,
      updatedAt: iso(page.updatedAt),
    };
  }

  // ---------------------------------------------------------------- banners

  async createBanner(dto: CreateBannerDto) {
    this.assertWindow(dto.startsAt, dto.endsAt);
    const created = await this.prisma.$transaction(async (tx) => {
      const banner = await tx.banner.create({
        data: {
          title: dto.title,
          imageUrl: dto.imageUrl,
          linkUrl: dto.linkUrl,
          position: dto.position,
          sortOrder: dto.sortOrder ?? 0,
          isActive: dto.isActive ?? true,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        },
      });
      await this.announceBanner(tx, banner.id, banner.position);
      await this.audit.log(
        {
          action: 'content.banner.create',
          entityType: 'Banner',
          entityId: banner.id,
          after: { position: dto.position, imageUrl: dto.imageUrl },
        },
        tx,
      );
      return banner;
    });
    return serializeBanner(created);
  }

  async listBannersForAdmin() {
    const rows = await this.prisma.banner.findMany({
      orderBy: [{ position: 'asc' }, { sortOrder: 'asc' }],
    });
    return rows.map(serializeBanner);
  }

  async updateBanner(id: string, dto: UpdateBannerDto) {
    const existing = await this.prisma.banner.findUnique({ where: { id } });
    if (!existing) throw notFound('Banner');
    this.assertWindow(
      dto.startsAt ?? existing.startsAt?.toISOString(),
      dto.endsAt ?? existing.endsAt?.toISOString(),
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const banner = await tx.banner.update({
        where: { id },
        data: {
          title: dto.title,
          imageUrl: dto.imageUrl,
          linkUrl: dto.linkUrl,
          position: dto.position,
          sortOrder: dto.sortOrder,
          isActive: dto.isActive,
          startsAt: dto.startsAt === undefined ? undefined : new Date(dto.startsAt),
          endsAt: dto.endsAt === undefined ? undefined : new Date(dto.endsAt),
        },
      });
      await this.announceBanner(tx, id, banner.position);
      await this.audit.log(
        {
          action: 'content.banner.update',
          entityType: 'Banner',
          entityId: id,
          before: { isActive: existing.isActive, position: existing.position },
          after: dto,
        },
        tx,
      );
      return banner;
    });
    return serializeBanner(updated);
  }

  async removeBanner(id: string): Promise<{ id: string }> {
    const existing = await this.prisma.banner.findUnique({ where: { id } });
    if (!existing) throw notFound('Banner');
    await this.prisma.$transaction(async (tx) => {
      await tx.banner.delete({ where: { id } });
      await this.announceBanner(tx, id, existing.position);
      await this.audit.log(
        { action: 'content.banner.delete', entityType: 'Banner', entityId: id, before: { position: existing.position } },
        tx,
      );
    });
    return { id };
  }

  /** Active banners whose schedule window covers now, newest schedule first. */
  async publicBanners(query: BannerQueryDto) {
    const now = new Date();
    const rows = await this.prisma.banner.findMany({
      where: {
        isActive: true,
        ...(query.position ? { position: query.position } : {}),
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: [{ position: 'asc' }, { sortOrder: 'asc' }],
    });
    return rows.map((row) => ({
      title: row.title,
      imageUrl: row.imageUrl,
      linkUrl: row.linkUrl,
      position: row.position,
      sortOrder: row.sortOrder,
    }));
  }

  private assertWindow(startsAt?: string | null, endsAt?: string | null): void {
    if (startsAt && endsAt && new Date(startsAt) > new Date(endsAt)) {
      throw invalidInput('startsAt must not be after endsAt');
    }
  }

  /** No slug: a banner change drops the storefront's `content` tag, which every banner fetch carries. */
  private async announceBanner(tx: Prisma.TransactionClient, bannerId: string, position: string): Promise<void> {
    await this.outbox.enqueue(
      {
        type: OUTBOX_EVENTS.CONTENT_UPDATED,
        aggregateType: 'Banner',
        aggregateId: bannerId,
        payload: { bannerId, position },
      },
      tx,
    );
  }

  private async announce(tx: Prisma.TransactionClient, pageId: string, slug: string): Promise<void> {
    await this.outbox.enqueue(
      {
        type: OUTBOX_EVENTS.CONTENT_UPDATED,
        aggregateType: 'ContentPage',
        aggregateId: pageId,
        payload: { pageId, slug },
      },
      tx,
    );
  }
}

function serializePage(row: {
  id: string;
  slug: string;
  title: string;
  body: string;
  seo: Prisma.JsonValue | null;
  isPublished: boolean;
  publishedAt: Date | null;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    body: row.body,
    seo: readSeo(row.seo),
    isPublished: row.isPublished,
    publishedAt: row.publishedAt ? iso(row.publishedAt) : null,
    updatedAt: iso(row.updatedAt),
  };
}

function serializeBanner(row: {
  id: string;
  title: string | null;
  imageUrl: string;
  linkUrl: string | null;
  position: string;
  sortOrder: number;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}) {
  return {
    id: row.id,
    title: row.title,
    imageUrl: row.imageUrl,
    linkUrl: row.linkUrl,
    position: row.position,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    startsAt: row.startsAt ? iso(row.startsAt) : null,
    endsAt: row.endsAt ? iso(row.endsAt) : null,
  };
}
