import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '@fakhri/config';
import {
  CampaignRecipientStatus,
  CampaignStatus,
  CampaignTemplateStatus,
  LeadConsent,
  Prisma,
} from '@fakhri/prisma';
import { buildMeta, conflict, invalidInput, normalizePagination, notFound } from '@fakhri/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { currentActor } from '../../common/actor-context';
import { NotificationMessage } from '../notifications/templates';
import { NotificationsService } from '../notifications/notifications.service';
import { AudienceDto, CreateTemplateDto, ListCampaignsQueryDto, SendCampaignDto } from './campaigns.dto';
import { assertTemplateBody, CAMPAIGN_LIMITS, renderTemplate, templateParameters } from './template';

const templateSelect = {
  id: true,
  name: true,
  body: true,
  status: true,
  providerTemplateName: true,
  language: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CampaignTemplateSelect;

const leadFields = {
  id: true,
  phone: true,
  firstName: true,
  contactName: true,
  city: true,
  productInterest: true,
} satisfies Prisma.LeadSelect;

type AudienceLead = Prisma.LeadGetPayload<{ select: typeof leadFields }>;

/**
 * WhatsApp campaigns (increment 3.10). A send includes only opted-in leads.
 * The console adapter is the default. The Cloud API is used when the channel
 * is whatsapp and the template has a provider template name.
 */
@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async createTemplate(dto: CreateTemplateDto) {
    assertTemplateBody(dto.body);
    const template = await this.prisma.campaignTemplate.create({
      data: {
        name: dto.name.trim(),
        body: dto.body,
        providerTemplateName: dto.providerTemplateName?.trim() || null,
        language: dto.language?.trim() || 'en',
        createdById: actorId(),
      },
      select: templateSelect,
    });
    return serializeTemplate(template);
  }

  async listTemplates(query: ListCampaignsQueryDto) {
    const { skip, take } = normalizePagination(query);
    const [items, totalItems] = await Promise.all([
      this.prisma.campaignTemplate.findMany({ select: templateSelect, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.campaignTemplate.count(),
    ]);
    return { items: items.map(serializeTemplate), meta: buildMeta(totalItems, skip, take) };
  }

  async approveTemplate(id: string) {
    const template = await this.prisma.campaignTemplate.findUnique({ where: { id }, select: templateSelect });
    if (!template) throw notFound('Campaign template');
    assertTemplateBody(template.body);
    if (template.status === CampaignTemplateStatus.APPROVED) return serializeTemplate(template);
    const approved = await this.prisma.campaignTemplate.update({
      where: { id },
      data: { status: CampaignTemplateStatus.APPROVED },
      select: templateSelect,
    });
    await this.audit.log({
      action: 'campaigns.template.approve',
      entityType: 'CampaignTemplate',
      entityId: id,
      after: { name: approved.name },
    });
    return serializeTemplate(approved);
  }

  /** Audience size for an approved or draft template. Writes nothing. */
  async preview(dto: AudienceDto) {
    const template = await this.prisma.campaignTemplate.findUnique({
      where: { id: dto.templateId },
      select: { status: true },
    });
    if (!template) throw notFound('Campaign template');
    const groups = await this.prisma.lead.groupBy({
      by: ['consent'],
      where: this.audienceWhere(dto),
      _count: { _all: true },
    });
    const count = (consent: LeadConsent) => groups.find((row) => row.consent === consent)?._count._all ?? 0;
    return {
      templateStatus: template.status,
      eligible: count(LeadConsent.OPTED_IN),
      excluded: { unknown: count(LeadConsent.UNKNOWN), optedOut: count(LeadConsent.OPTED_OUT) },
      city: blankToNull(dto.city),
      productInterest: blankToNull(dto.productInterest),
    };
  }

  async send(dto: SendCampaignDto) {
    const channel = this.config.get('NOTIFICATIONS_CHANNEL', { infer: true });
    if (channel === 'none') throw conflict('Campaign delivery is turned off');
    const template = await this.prisma.campaignTemplate.findUnique({ where: { id: dto.templateId } });
    if (!template) throw notFound('Campaign template');
    if (template.status !== CampaignTemplateStatus.APPROVED) {
      throw invalidInput('Approve the template before sending');
    }
    if (channel === 'whatsapp' && !template.providerTemplateName) {
      throw invalidInput('Set the WhatsApp template name before sending on the Cloud API');
    }

    const eligible = await this.prisma.lead.findMany({
      where: { ...this.audienceWhere(dto), consent: LeadConsent.OPTED_IN },
      select: leadFields,
      orderBy: { createdAt: 'asc' },
      take: CAMPAIGN_LIMITS.maxRecipients + 1,
    });
    if (eligible.length === 0) throw invalidInput('No opted-in leads match this audience');
    if (eligible.length > CAMPAIGN_LIMITS.maxRecipients) {
      throw invalidInput(`A send is limited to ${CAMPAIGN_LIMITS.maxRecipients} opted-in leads. Narrow the audience.`);
    }

    const campaign = await this.prisma.campaign.create({
      data: {
        name: dto.name.trim(),
        templateId: template.id,
        city: blankToNull(dto.city),
        productInterest: blankToNull(dto.productInterest),
        status: CampaignStatus.SENDING,
        recipientCount: eligible.length,
        createdById: actorId(),
        recipients: {
          create: eligible.map((lead) => ({ leadId: lead.id, status: CampaignRecipientStatus.PENDING })),
        },
      },
    });

    let sentCount = 0;
    let failed = 0;
    try {
      for (const lead of eligible) {
        const delivered = await this.notifications.deliver(this.messages(template, [lead]));
        if (delivered === 1) {
          await this.markOne(campaign.id, lead.id, CampaignRecipientStatus.SENT);
          sentCount += 1;
        } else {
          await this.markOne(campaign.id, lead.id, CampaignRecipientStatus.FAILED);
          failed += 1;
        }
      }
      if (failed > 0) throw conflict('Campaign delivery stopped before every recipient was sent');
    } catch (error) {
      await this.prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: CampaignStatus.FAILED, sentCount },
      });
      throw error;
    }

    const finished = await this.prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: CampaignStatus.SENT, sentCount, sentAt: new Date() },
    });
    await this.audit.log({
      action: 'campaigns.send',
      entityType: 'Campaign',
      entityId: finished.id,
      after: {
        templateId: template.id,
        city: finished.city,
        productInterest: finished.productInterest,
        recipientCount: finished.recipientCount,
        sentCount,
      },
    });
    return serializeCampaign(finished);
  }

  async list(query: ListCampaignsQueryDto) {
    const { skip, take } = normalizePagination(query);
    const [items, totalItems] = await Promise.all([
      this.prisma.campaign.findMany({ orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.campaign.count(),
    ]);
    return { items: items.map(serializeCampaign), meta: buildMeta(totalItems, skip, take) };
  }

  async get(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        recipients: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            status: true,
            sentAt: true,
            lead: { select: { id: true, phone: true, firstName: true } },
          },
        },
      },
    });
    if (!campaign) throw notFound('Campaign');
    const { recipients, ...rest } = campaign;
    return {
      ...serializeCampaign(rest),
      recipients: recipients.map((item) => ({
        id: item.id,
        leadId: item.lead.id,
        phone: item.lead.phone,
        firstName: item.lead.firstName,
        status: item.status,
        sentAt: item.sentAt?.toISOString() ?? null,
      })),
    };
  }

  private audienceWhere(dto: AudienceDto): Prisma.LeadWhereInput {
    const where: Prisma.LeadWhereInput = {};
    const city = dto.city?.trim();
    const product = dto.productInterest?.trim();
    if (city) where.city = { equals: city, mode: 'insensitive' };
    if (product) where.productInterest = { contains: product, mode: 'insensitive' };
    return where;
  }

  private messages(
    template: { name: string; body: string; providerTemplateName: string | null; language: string },
    leads: AudienceLead[],
  ): NotificationMessage[] {
    return leads.map((lead) => ({
      channel: 'WHATSAPP',
      to: lead.phone,
      subject: template.name,
      body: renderTemplate(template.body, lead),
      event: 'CAMPAIGN_MESSAGE',
      ...(template.providerTemplateName
        ? {
            whatsapp: {
              templateName: template.providerTemplateName,
              language: template.language,
              bodyParameters: templateParameters(template.body, lead),
            },
          }
        : {}),
    }));
  }

  private async markOne(campaignId: string, leadId: string, status: CampaignRecipientStatus): Promise<void> {
    await this.prisma.campaignRecipient.updateMany({
      where: { campaignId, leadId },
      data: { status, sentAt: status === CampaignRecipientStatus.SENT ? new Date() : null },
    });
  }
}

function actorId(): string | undefined {
  const actor = currentActor();
  return actor?.principal?.type === 'ADMIN' ? actor.principal.id : undefined;
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function serializeTemplate<T extends { createdAt: Date; updatedAt: Date }>(template: T) {
  return { ...template, createdAt: template.createdAt.toISOString(), updatedAt: template.updatedAt.toISOString() };
}

function serializeCampaign<T extends { createdAt: Date; sentAt?: Date | null }>(campaign: T) {
  return {
    ...campaign,
    createdAt: campaign.createdAt.toISOString(),
    sentAt: campaign.sentAt ? campaign.sentAt.toISOString() : null,
  };
}
