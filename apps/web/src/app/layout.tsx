import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'Fakhri — Electronics & Home Appliances in Pakistan',
    template: '%s | Fakhri',
  },
  description:
    'Shop electronics and home appliances online across Pakistan — real specifications, PKR pricing, nation-wide delivery and store pickup.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}