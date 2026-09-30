import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '@fakhri/config';
import { NotificationMessage } from './templates';

export interface DeliveryRecord extends NotificationMessage {
  deliveredAt: string;
}

/**
 * Notification delivery (REQ-25). The console adapter is the only one for now —
 * provider adapters (SMS gateway, SMTP, WhatsApp) slot in behind `deliver`
 * without the callers changing.
 *
 * Recent deliveries are kept in memory so development and tests can assert what
 * would have been sent; it is a ring buffer, not a record of truth.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');
  private readonly recent: DeliveryRecord[] = [];
  private static readonly KEEP = 100;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async deliver(messages: readonly NotificationMessage[]): Promise<number> {
    const channel = this.config.get('NOTIFICATIONS_CHANNEL', { infer: true });
    if (channel === 'none' || messages.length === 0) return 0;

    for (const message of messages) {
      this.logger.log(
        `[${message.channel}] to ${redact(message.to)} · ${message.subject} · ${message.body}`,
      );
      this.recent.push({ ...message, deliveredAt: new Date().toISOString() });
    }
    while (this.recent.length > NotificationsService.KEEP) this.recent.shift();
    return messages.length;
  }

  /** Most recent first. Development and test aid only. */
  sent(filter?: { event?: string; to?: string }): DeliveryRecord[] {
    return [...this.recent]
      .reverse()
      .filter((record) => (filter?.event ? record.event === filter.event : true))
      .filter((record) => (filter?.to ? record.to === filter.to : true));
  }
}

/** Phone numbers and emails end up in logs; keep them partly masked. */
function redact(target: string): string {
  if (target.includes('@')) {
    const [name, domain] = target.split('@');
    return `${(name ?? '').slice(0, 2)}***@${domain ?? ''}`;
  }
  return `${target.slice(0, 5)}***${target.slice(-2)}`;
}
