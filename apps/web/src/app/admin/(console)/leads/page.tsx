import Link from 'next/link';
import { NoAccess } from '@/components/admin/NoAccess';
import { SubNav } from '@/components/admin/ops/SubNav';
import { Pagination } from '@/components/ui';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { LeadSummary } from '@/lib/api/leads-types';
import { leadName } from '@/lib/api/leads-types';
import { sessionApi } from '@/lib/api/server';
import type { PaginationMeta } from '@/lib/api/types';
import { OptOutForm } from './OptOutForm';
import { ConsentPill } from './ConsentPill';
import { CONSENT_LABEL, LEAD_LINKS } from './links';

export const metadata = { title: 'Leads' };

type Search = { q?: string; consent?: string; city?: string; page?: string };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'leads')) return <NoAccess section="leads" />;

  const search = await searchParams;
  const query = new URLSearchParams();
  if (search.q?.trim()) query.set('q', search.q.trim());
  if (search.consent === 'UNKNOWN' || search.consent === 'OPTED_IN' || search.consent === 'OPTED_OUT') {
    query.set('consent', search.consent);
  }
  if (search.city?.trim()) query.set('city', search.city.trim());
  query.set('page', search.page ?? '1');
  query.set('pageSize', '25');

  const { data: leads, meta } = await sessionApi<LeadSummary[], PaginationMeta>(`/admin/leads?${query}`, {
    session: 'admin',
  });
  const hrefFor = (page: number) => {
    const next = new URLSearchParams(query);
    next.set('page', String(page));
    next.delete('pageSize');
    return `/admin/leads?${next}`;
  };

  return (
    <div className="stack">
      <div className="spread">
        <h1>Leads</h1>
        <Link href="/admin/leads/import" className="button">
          Import CSV
        </Link>
      </div>
      <SubNav links={LEAD_LINKS} current="/admin/leads" />
      <p className="muted small">
        A lead is someone we might message. Importing a file does not opt them in. Only opted-in numbers can receive a campaign.
      </p>
      <form className="toolbar" method="get">
        <div className="field">
          <label htmlFor="q">Name, phone, or account</label>
          <input id="q" name="q" defaultValue={search.q ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="city">City</label>
          <input id="city" name="city" defaultValue={search.city ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="consent">Consent</label>
          <select id="consent" name="consent" defaultValue={search.consent ?? ''}>
            <option value="">Any</option>
            {(Object.keys(CONSENT_LABEL) as (keyof typeof CONSENT_LABEL)[]).map((consent) => (
              <option key={consent} value={consent}>
                {CONSENT_LABEL[consent]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit">Filter</button>
      </form>
      <OptOutForm />
      <p className="muted small">{meta.totalItems} leads</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>City</th>
              <th>Product</th>
              <th>Consent</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} data-testid="lead-row">
                <td>
                  <Link href={`/admin/leads/${lead.id}`}>{leadName(lead)}</Link>
                  {lead.accountName ? <div className="muted small">{lead.accountName}</div> : null}
                </td>
                <td>{lead.phone}</td>
                <td>{lead.city ?? '—'}</td>
                <td>{lead.productInterest ?? '—'}</td>
                <td>
                  <ConsentPill consent={lead.consent} />
                </td>
              </tr>
            ))}
            {leads.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No leads match.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <Pagination page={meta.page} totalPages={meta.totalPages} hrefFor={hrefFor} />
    </div>
  );
}
