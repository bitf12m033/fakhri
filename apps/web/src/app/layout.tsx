import type { Metadata, Viewport } from 'next';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Electronics & Home Appliances in Pakistan`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    'Shop electronics and home appliances online across Pakistan — real specifications, PKR pricing, nation-wide delivery and store pickup.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b5f4b',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
