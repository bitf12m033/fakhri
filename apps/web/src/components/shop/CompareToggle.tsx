'use client';

import Link from 'next/link';
import { useState } from 'react';
import { COMPARE_MAX, useCompare } from './compare-store';

export function CompareToggle({ id, name }: { id: string; name: string }) {
  const compare = useCompare();
  const [full, setFull] = useState(false);
  const selected = compare.has(id);
  return (
    <label className="check small" title={full ? `Compare up to ${COMPARE_MAX} products` : undefined}>
      <input
        type="checkbox"
        checked={selected}
        onChange={() => setFull(!compare.toggle({ id, name }))}
        aria-describedby={full ? `compare-full-${id}` : undefined}
      />
      Compare
      {full ? (
        <span id={`compare-full-${id}`} className="visually-hidden">
          You can compare up to {COMPARE_MAX} products
        </span>
      ) : null}
    </label>
  );
}

/** Sticky bar that appears once something is selected for comparison. */
export function CompareTray() {
  const compare = useCompare();
  if (compare.entries.length === 0) return null;
  const ids = compare.entries.map((entry) => entry.id).join(',');
  return (
    <div
      className="no-print"
      style={{
        position: 'sticky',
        bottom: 0,
        zIndex: 30,
        background: 'var(--surface)',
        borderTop: '1px solid var(--line)',
        boxShadow: '0 -2px 8px rgb(0 0 0 / 8%)',
      }}
    >
      <div className="container spread" style={{ padding: '0.6rem 1rem' }}>
        <span className="small">
          Comparing {compare.entries.length} of {COMPARE_MAX}:{' '}
          {compare.entries.map((entry) => entry.name).join(', ')}
        </span>
        <span className="row">
          <button type="button" className="secondary small" onClick={compare.clear}>
            Clear
          </button>
          {compare.entries.length >= 2 ? (
            <Link className="button small" href={`/compare?ids=${ids}`}>
              Compare now
            </Link>
          ) : (
            <span className="small muted">Pick at least 2</span>
          )}
        </span>
      </div>
    </div>
  );
}
