import Link from 'next/link';

export default function NotFound() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', padding: '4rem 1rem', textAlign: 'center' }}>
      <div className="stack">
        <h1>We could not find that page</h1>
        <p>It may have moved, or the product is no longer sold.</p>
        <p>
          <Link href="/" className="button">
            Go to the homepage
          </Link>
        </p>
      </div>
    </main>
  );
}
