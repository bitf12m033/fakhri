'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * Header session state: signed in or not, and the cart count. One fetch per page
 * view, shared by every component that asks, and refreshed after cart changes.
 */
export interface SessionState {
  loaded: boolean;
  signedIn: boolean;
  cartCount: number;
}

let state: SessionState = { loaded: false, signedIn: false, cartCount: 0 };
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: SessionState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function reloadSession(): Promise<void> {
  inflight ??= fetch('/bff/session', { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) return;
      const body = (await response.json()) as { data: { signedIn: boolean; cartCount: number } };
      emit({ loaded: true, ...body.data });
    })
    .catch(() => undefined)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Cart responses carry the count already; no need for another round trip. */
export function setCartCount(cartCount: number): void {
  emit({ ...state, cartCount });
}

const SERVER: SessionState = { loaded: false, signedIn: false, cartCount: 0 };

export function useSession(): SessionState {
  const snapshot = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => SERVER,
  );
  useEffect(() => {
    if (!state.loaded) void reloadSession();
  }, []);
  return snapshot;
}
