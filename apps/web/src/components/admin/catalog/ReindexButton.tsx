'use client';

import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import { bff } from '@/lib/api/client';

/** Full search rebuild: the escape hatch after bulk imports; normal edits keep the index current. */
export function ReindexButton() {
  const action = useAction();
  const [count, setCount] = useState<number | null>(null);

  const reindex = async () => {
    setCount(null);
    const result = await action.run(() => bff<{ products: number }>('/admin/search/reindex', { method: 'POST', body: {} }), {
      refresh: false,
    });
    if (result) setCount(result.data.products);
  };

  return (
    <div className="row">
      <button type="button" className="secondary small" disabled={action.pending} onClick={() => void reindex()}>
        {action.pending ? 'Reindexing…' : 'Reindex search'}
      </button>
      <FormStatus
        error={action.error}
        message={count === null ? null : `Search index rebuilt for ${count} ${count === 1 ? 'product' : 'products'}.`}
      />
    </div>
  );
}
