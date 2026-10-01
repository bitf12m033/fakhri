import { sessionApi } from '@/lib/api/server';
import type { Address } from '@/lib/api/types';
import { AddressBook } from './AddressBook';

export const metadata = { title: 'Addresses' };

export default async function AddressesPage() {
  const { data: addresses } = await sessionApi<Address[]>('/customers/me/addresses', { session: 'customer' });
  return (
    <>
      <h1>Addresses</h1>
      <AddressBook addresses={addresses} />
    </>
  );
}
