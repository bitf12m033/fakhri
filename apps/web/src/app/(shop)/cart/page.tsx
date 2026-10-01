import { CartView } from './CartView';

export const metadata = { title: 'Your cart', robots: { index: false } };

export default function CartPage() {
  return (
    <div className="stack">
      <h1>Your cart</h1>
      <CartView />
    </div>
  );
}
