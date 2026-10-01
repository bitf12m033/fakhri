'use client';

export function PrintButton() {
  return (
    <button type="button" className="small" onClick={() => window.print()}>
      Print
    </button>
  );
}
