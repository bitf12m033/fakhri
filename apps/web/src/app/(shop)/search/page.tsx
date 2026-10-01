import type { Metadata } from 'next';
import { Listing } from '@/components/shop/Listing';
import { parseListing, RawSearch } from '@/lib/listing';

type Props = { searchParams: Promise<RawSearch> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = parseListing(await searchParams);
  // Search results are infinite and thin: keep them out of the index, follow the links.
  return { title: q ? `Search: ${q}` : 'All products', robots: { index: false, follow: true } };
}

export default async function SearchPage({ searchParams }: Props) {
  const state = parseListing(await searchParams);
  return (
    <div className="stack">
      <h1>{state.q ? <>Results for “{state.q}”</> : 'All products'}</h1>
      <Listing path="/search" state={state} scope={{}} />
    </div>
  );
}
