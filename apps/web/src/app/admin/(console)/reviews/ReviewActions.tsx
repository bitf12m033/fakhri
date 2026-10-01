'use client';

import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import type { ReviewStatus } from '@/lib/api/admin-ops-types';
import { bff } from '@/lib/api/client';

/** Approve or reject one review; the note goes to the audit log, not the customer. */
export function ReviewActions({ id, status }: { id: string; status: ReviewStatus }) {
  const action = useAction();
  const [note, setNote] = useState('');

  const moderate = (next: 'APPROVED' | 'REJECTED') =>
    void action.run(
      () =>
        bff(`/admin/reviews/${id}`, {
          method: 'PATCH',
          body: { status: next, ...(note.trim() ? { note: note.trim() } : {}) },
        }),
      { success: next === 'APPROVED' ? 'Approved: it is now on the product page.' : 'Rejected.' },
    );

  return (
    <div className="stack" style={{ minWidth: '12rem' }}>
      <div className="field">
        <label htmlFor={`review-note-${id}`} className="small">
          Moderation note (optional)
        </label>
        <input id={`review-note-${id}`} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="row" style={{ gap: '0.4rem' }}>
        {status !== 'APPROVED' ? (
          <button
            type="button"
            className="small"
            disabled={action.pending}
            onClick={() => moderate('APPROVED')}
            data-testid="review-approve"
          >
            Approve
          </button>
        ) : null}
        {status !== 'REJECTED' ? (
          <button
            type="button"
            className="small danger"
            disabled={action.pending}
            onClick={() => moderate('REJECTED')}
            data-testid="review-reject"
          >
            Reject
          </button>
        ) : null}
      </div>
      <FormStatus error={action.error} message={action.message} />
    </div>
  );
}
