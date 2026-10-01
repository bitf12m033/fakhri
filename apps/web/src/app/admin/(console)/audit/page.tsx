import Link from 'next/link';
import { NoAccess } from '@/components/admin/NoAccess';
import { fromKarachiInput } from '@/components/admin/ops/time';
import { Pagination } from '@/components/ui';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { AuditEntry } from '@/lib/api/admin-ops-types';
import { sessionApi } from '@/lib/api/server';
import type { PaginationMeta } from '@/lib/api/types';
import { dateTime } from '@/lib/format';

export const metadata = { title: 'Audit log' };

const ACTOR_TYPES = ['ADMIN', 'CUSTOMER', 'SYSTEM'] as const;

/** Filters the API accepts (AuditLogQueryDto); from/to arrive as Pakistan wall time. */
const TEXT_FILTERS = ['actorId', 'action', 'entityType', 'entityId'] as const;

type Search = Partial<Record<(typeof TEXT_FILTERS)[number] | 'actorType' | 'from' | 'to' | 'page', string>>;

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'audit')) return <NoAccess section="audit" />;

  const search = await searchParams;
  const filters = new URLSearchParams();
  for (const key of TEXT_FILTERS) {
    const value = search[key]?.trim();
    if (value) filters.set(key, value);
  }
  const actorType = ACTOR_TYPES.find((type) => type === search.actorType);
  if (actorType) filters.set('actorType', actorType);
  const from = fromKarachiInput(search.from);
  const to = fromKarachiInput(search.to);
  if (from) filters.set('from', from);
  if (to) filters.set('to', to);

  const query = new URLSearchParams(filters);
  query.set('page', search.page ?? '1');
  query.set('pageSize', '50');
  const { data: entries, meta } = await sessionApi<AuditEntry[], PaginationMeta>(`/admin/audit-logs?${query}`, {
    session: 'admin',
  });

  // Links keep the form's own values (wall-time dates), not the API's instants.
  const pageQuery = (changes: Record<string, string>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(search)) if (value && key !== 'page') next.set(key, value);
    for (const [key, value] of Object.entries(changes)) next.set(key, value);
    return `/admin/audit?${next}`;
  };

  return (
    <div className="stack">
      <h1>Audit log</h1>
      <form className="toolbar" method="get">
        <div className="field">
          <label htmlFor="action">Action starts with</label>
          <input id="action" name="action" defaultValue={search.action ?? ''} placeholder="e.g. catalog." />
        </div>
        <div className="field">
          <label htmlFor="actorType">Actor type</label>
          <select id="actorType" name="actorType" defaultValue={actorType ?? ''}>
            <option value="">Any</option>
            {ACTOR_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="actorId">Actor ID</label>
          <input id="actorId" name="actorId" defaultValue={search.actorId ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="entityType">Entity type</label>
          <input id="entityType" name="entityType" defaultValue={search.entityType ?? ''} placeholder="e.g. Coupon" />
        </div>
        <div className="field">
          <label htmlFor="entityId">Entity ID</label>
          <input id="entityId" name="entityId" defaultValue={search.entityId ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="from">From (Pakistan time)</label>
          <input id="from" name="from" type="datetime-local" defaultValue={search.from ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="to">To</label>
          <input id="to" name="to" type="datetime-local" defaultValue={search.to ?? ''} />
        </div>
        <button type="submit">Search</button>
        {filters.size > 0 ? (
          <Link href="/admin/audit" className="button secondary">
            Clear
          </Link>
        ) : null}
      </form>

      <p className="muted small">{meta.totalItems.toLocaleString('en-PK')} entries, newest first. The log is append-only.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Actor</th>
              <th>Entity</th>
              <th>IP</th>
              <th>Changes</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} data-testid="audit-row">
                <td className="small" style={{ whiteSpace: 'nowrap' }}>
                  {dateTime(entry.at)}
                </td>
                <td>
                  <code>{entry.action}</code>
                </td>
                <td className="small">
                  {entry.actorType.toLowerCase()}
                  {entry.actorId ? (
                    <>
                      <br />
                      <Link href={pageQuery({ actorId: entry.actorId })} title="Only this actor">
                        {entry.actorId}
                      </Link>
                    </>
                  ) : null}
                </td>
                <td className="small">
                  <Link href={pageQuery({ entityType: entry.entityType })} title="Only this entity type">
                    {entry.entityType}
                  </Link>
                  {entry.entityId ? (
                    <>
                      <br />
                      <Link
                        href={pageQuery({ entityType: entry.entityType, entityId: entry.entityId })}
                        title="Only this record"
                      >
                        {entry.entityId}
                      </Link>
                    </>
                  ) : null}
                </td>
                <td className="small">{entry.ip ?? '—'}</td>
                <td className="small" style={{ minWidth: '14rem' }}>
                  {entry.before == null && entry.after == null ? (
                    <span className="muted">—</span>
                  ) : (
                    <details>
                      <summary>Before and after</summary>
                      <div className="stack" style={{ marginTop: '0.5rem' }}>
                        <div>
                          <strong>Before</strong>
                          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {entry.before == null ? '—' : json(entry.before)}
                          </pre>
                        </div>
                        <div>
                          <strong>After</strong>
                          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {entry.after == null ? '—' : json(entry.after)}
                          </pre>
                        </div>
                      </div>
                    </details>
                  )}
                </td>
              </tr>
            ))}
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No entries match.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <Pagination
        page={meta.page}
        totalPages={meta.totalPages}
        hrefFor={(page) => pageQuery({ page: String(page) })}
      />
    </div>
  );
}
