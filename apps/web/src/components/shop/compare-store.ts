'use client';

import { useSyncExternalStore } from 'react';

/**
 * The compare selection (REQ-08: 2 to 4 products) lives in localStorage: it is a
 * browsing aid, not account data, and needs no server round trip.
 */
export const COMPARE_MAX = 4;
const KEY = 'fk_compare';
const EVENT = 'fk-compare-change';

export interface CompareEntry {
  id: string;
  name: string;
}

let cache: { raw: string | null; value: CompareEntry[] } = { raw: null, value: [] };

function read(): CompareEntry[] {
  const raw = window.localStorage.getItem(KEY);
  if (raw === cache.raw) return cache.value;
  let value: CompareEntry[] = [];
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(parsed)) {
      value = parsed
        .filter((entry): entry is CompareEntry => typeof entry?.id === 'string' && typeof entry?.name === 'string')
        .slice(0, COMPARE_MAX);
    }
  } catch {
    value = [];
  }
  cache = { raw, value };
  return value;
}

function write(entries: CompareEntry[]): void {
  window.localStorage.setItem(KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

const EMPTY: CompareEntry[] = [];

export function useCompare() {
  const entries = useSyncExternalStore(subscribe, read, () => EMPTY);
  return {
    entries,
    has: (id: string) => entries.some((entry) => entry.id === id),
    toggle(entry: CompareEntry): boolean {
      const current = read();
      if (current.some((item) => item.id === entry.id)) {
        write(current.filter((item) => item.id !== entry.id));
        return true;
      }
      if (current.length >= COMPARE_MAX) return false;
      write([...current, entry]);
      return true;
    },
    clear: () => write([]),
  };
}
