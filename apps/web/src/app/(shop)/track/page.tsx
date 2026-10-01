import Link from 'next/link';
import { TrackForm } from './TrackForm';

export const metadata = { title: 'Track your order' };

export default function TrackPage() {
  return (
    <div className="stack" style={{ maxWidth: 520 }}>
      <h1>Track your order</h1>
      <p>
        Use the reference from your confirmation message. Have an account? <Link href="/account/orders">See your orders</Link>.
      </p>
      <TrackForm />
    </div>
  );
}
