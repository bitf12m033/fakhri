'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import type { Suggestions } from '@/lib/api/types';

/** Header search with autocomplete (REQ-09). Suggestions are public, so no BFF session is involved. */
export function SearchBox() {
  const router = useRouter();
  const params = useSearchParams();
  const [term, setTerm] = useState(params.get('q') ?? '');
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const latest = useRef(0);

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setSuggestions(null);
      return;
    }
    const ticket = ++latest.current;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/bff/products/suggest?q=${encodeURIComponent(q)}`);
        if (!response.ok || ticket !== latest.current) return;
        const body = (await response.json()) as { data: Suggestions };
        setSuggestions(body.data);
      } catch {
        // Autocomplete is a nicety; the search itself still works.
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [term]);

  const hasSuggestions =
    suggestions && suggestions.products.length + suggestions.brands.length + suggestions.categories.length > 0;

  return (
    <form
      role="search"
      className="search-form"
      onSubmit={(event) => {
        event.preventDefault();
        setOpen(false);
        const q = term.trim();
        router.push(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <label htmlFor="site-search" className="visually-hidden">
        Search products
      </label>
      <input
        id="site-search"
        type="search"
        name="q"
        placeholder="Search ACs, fridges, TVs…"
        autoComplete="off"
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
        aria-controls={listId}
        aria-expanded={Boolean(open && hasSuggestions)}
        role="combobox"
        aria-autocomplete="list"
      />
      <button type="submit">Search</button>
      {open && hasSuggestions ? (
        <ul className="suggestions" id={listId} role="listbox" aria-label="Suggestions">
          {suggestions.products.map((item) => (
            <li key={`p-${item.slug}`} role="option" aria-selected="false">
              <Link href={`/product/${item.slug}`} onClick={() => setOpen(false)}>
                {item.name} <span className="muted small">· {item.brand}</span>
              </Link>
            </li>
          ))}
          {suggestions.brands.map((item) => (
            <li key={`b-${item.slug}`} role="option" aria-selected="false">
              <Link href={`/brand/${item.slug}`} onClick={() => setOpen(false)}>
                {item.name} <span className="muted small">· brand</span>
              </Link>
            </li>
          ))}
          {suggestions.categories.map((item) => (
            <li key={`c-${item.slug}`} role="option" aria-selected="false">
              <Link href={`/category/${item.slug}`} onClick={() => setOpen(false)}>
                {item.name} <span className="muted small">· category</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
