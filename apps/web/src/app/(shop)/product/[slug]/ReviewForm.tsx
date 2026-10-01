'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { useSession } from '@/components/shop/session-store';
import { useAction } from '@/components/useAction';
import { bff } from '@/lib/api/client';

/** REQ-17: purchasers only, moderated before it shows. The API enforces both and says why. */
export function ReviewForm({ productId }: { productId: string }) {
  const session = useSession();
  const action = useAction();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [done, setDone] = useState<string | null>(null);

  if (!session.loaded) return null;
  if (!session.signedIn) {
    return (
      <p className="small">
        Bought this? <Link href="/login">Sign in</Link> to write a review.
      </p>
    );
  }
  if (done) return <div className="notice ok" role="status">{done}</div>;
  if (!open) {
    return (
      <div>
        <button type="button" className="secondary" onClick={() => setOpen(true)}>
          Write a review
        </button>
      </div>
    );
  }

  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await action.run(
          () =>
            bff<{ message: string }>('/reviews', {
              body: {
                productId,
                rating,
                ...(title.trim() ? { title: title.trim() } : {}),
                ...(body.trim() ? { body: body.trim() } : {}),
              },
            }),
          { refresh: false },
        );
        if (result) setDone(result.data.message);
      }}
    >
      <fieldset>
        <legend>Your rating</legend>
        <div className="row">
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value} className="check">
              <input type="radio" name="rating" value={value} checked={rating === value} onChange={() => setRating(value)} />
              {value} ★
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="review-title">Title (optional)</label>
        <input id="review-title" maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="review-body">Review (optional)</label>
        <textarea id="review-body" maxLength={2000} value={body} onChange={(event) => setBody(event.target.value)} />
      </div>
      <FormStatus error={action.error} />
      <div className="row">
        <button type="submit" disabled={action.pending}>
          Submit review
        </button>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
