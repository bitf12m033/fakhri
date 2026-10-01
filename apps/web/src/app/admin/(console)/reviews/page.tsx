import Link from 'next/link';
import { NoAccess } from '@/components/admin/NoAccess';
import { Pagination, StatusPill } from '@/components/ui';
import { canAccess, currentAdmin } from '@/lib/admin';
import type { AdminReview, ReviewStatus } from '@/lib/api/admin-ops-types';
import { sessionApi } from '@/lib/api/server';
import type { PaginationMeta } from '@/lib/api/types';
import { dateTime } from '@/lib/format';
import { ReviewActions } from './ReviewActions';

export const metadata = { title: 'Reviews' };

const STATUSES: ReviewStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

type Search = { status?: string; productId?: string; page?: string };

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const admin = (await currentAdmin())!;
  if (!canAccess(admin.role, 'reviews')) return <NoAccess section="reviews" />;

  const search = await searchParams;
  // The queue opens on what needs a decision; "ALL" is the explicit way out.
  const status = search.status === 'ALL' ? null : STATUSES.find((s) => s === search.status) ?? 'PENDING';
  const query = new URLSearchParams();
  if (status) query.set('status', status);
  if (search.productId?.trim()) query.set('productId', search.productId.trim());
  query.set('page', search.page ?? '1');
  query.set('pageSize', '25');

  const { data: reviews, meta } = await sessionApi<AdminReview[], PaginationMeta>(`/admin/reviews?${query}`, {
    session: 'admin',
  });
  const hrefFor = (page: number) => {
    const next = new URLSearchParams(query);
    if (!status) next.set('status', 'ALL');
    next.set('page', String(page));
    next.delete('pageSize');
    return `/admin/reviews?${next}`;
  };

  return (
    <div className="stack">
      <h1>Reviews</h1>
      <form className="toolbar" method="get">
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status ?? 'ALL'}>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value.charAt(0) + value.slice(1).toLowerCase()}
              </option>
            ))}
            <option value="ALL">All</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="productId">Product ID</label>
          <input id="productId" name="productId" defaultValue={search.productId ?? ''} />
        </div>
        <button type="submit">Filter</button>
      </form>

      <p className="muted small">
        {status ? `${meta.totalItems} ${status.toLowerCase()}` : meta.totalItems} reviews, oldest first. Nothing is shown on the storefront
        until it is approved.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Review</th>
              <th>Product</th>
              <th>Submitted</th>
              <th>Status</th>
              <th>Moderate</th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((review) => (
              <tr key={review.id} data-testid="review-row">
                <td style={{ maxWidth: '28rem' }}>
                  <div>
                    <span className="stars" aria-hidden="true">
                      {'★'.repeat(review.rating)}
                      {'☆'.repeat(5 - review.rating)}
                    </span>{' '}
                    <span className="visually-hidden">{review.rating} out of 5</span>
                    {review.title ? <strong>{review.title}</strong> : null}
                  </div>
                  {review.body ? (
                    <p className="small" style={{ margin: '0.25rem 0 0', whiteSpace: 'pre-line' }}>
                      {review.body}
                    </p>
                  ) : (
                    <p className="small muted" style={{ margin: '0.25rem 0 0' }}>
                      No text, rating only.
                    </p>
                  )}
                  {review.isVerifiedPurchase ? (
                    <span className="pill ok" style={{ marginTop: '0.35rem' }}>
                      verified purchase
                    </span>
                  ) : null}
                </td>
                <td>
                  <Link href={`/product/${review.product.slug}`} target="_blank" rel="noopener">
                    {review.product.name}
                  </Link>
                </td>
                <td className="small">{dateTime(review.createdAt)}</td>
                <td>
                  <StatusPill status={review.status} />
                </td>
                <td>
                  <ReviewActions id={review.id} status={review.status} />
                </td>
              </tr>
            ))}
            {reviews.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  {status === 'PENDING' ? 'Nothing waiting for moderation.' : 'No reviews match.'}
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
