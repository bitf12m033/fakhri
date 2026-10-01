import { CheckoutForm } from './CheckoutForm';

export const metadata = { title: 'Checkout', robots: { index: false } };

export default function CheckoutPage() {
  return (
    <div className="stack">
      <h1>Checkout</h1>
      <CheckoutForm />
    </div>
  );
}
