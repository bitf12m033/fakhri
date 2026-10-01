import { NoAccess } from '@/components/admin/NoAccess';
import { Notice } from '@/components/ui';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { OutboxSummary } from '@/lib/api/admin-ops-types';
import { sessionApi } from '@/lib/api/server';
import { dateTime } from '@/lib/format';
import { DispatchButton } from './DispatchButton';

export const metadata = { title: 'Outbox' };

/** A pending event older than this means the poller is behind or stopped. */
const STALE_MS = 10 * 60_000;

export default async function OutboxPage() {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'outbox')) return <NoAccess section="outbox" />;

  const { data: status } = await sessionApi<OutboxSummary>('/admin/outbox', { session: 'admin' });
  const stale = status.oldestPendingAt !== null && Date.now() - new Date(status.oldestPendingAt).getTime() > STALE_MS;

  return (
    <div className="stack">
      <h1>Outbox</h1>
      <p className="muted" style={{ margin: 0 }}>
        Domain events (order notifications, storefront revalidation…) wait here until the dispatcher delivers them. It
        polls on its own; dispatching by hand drains one batch now.
      </p>

      <div className="stat-grid" data-testid="outbox-stats">
        <div className="stat">
          <div className="muted small">Pending</div>
          <div className="value">{status.pending}</div>
        </div>
        <div className="stat">
          <div className="muted small">Delivered</div>
          <div className="value">{status.published}</div>
        </div>
        <div className="stat">
          <div className="muted small">Failed (gave up)</div>
          <div className="value" style={{ color: status.failed > 0 ? 'var(--danger)' : undefined }}>
            {status.failed}
          </div>
        </div>
        <div className="stat">
          <div className="muted small">Oldest pending</div>
          <div className="value" style={{ fontSize: '1rem' }}>
            {status.oldestPendingAt ? dateTime(status.oldestPendingAt) : '—'}
          </div>
        </div>
      </div>

      {stale ? (
        <Notice tone="warn">
          The oldest pending event has waited more than ten minutes. Check that the dispatcher is running.
        </Notice>
      ) : null}
      {status.failed > 0 ? (
        <Notice tone="warn">
          Failed events have used all their attempts and are not retried automatically; the API logs say why.
        </Notice>
      ) : null}

      <div className="panel">
        <DispatchButton />
      </div>
    </div>
  );
}
