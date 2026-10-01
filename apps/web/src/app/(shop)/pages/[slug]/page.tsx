import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Breadcrumb } from '@/components/ui';
import { publicApiOrNull } from '@/lib/api/server';
import { TAGS } from '@/lib/api/tags';
import type { ContentPage } from '@/lib/api/types';
import { day } from '@/lib/format';

type Props = { params: Promise<{ slug: string }> };

export const revalidate = 300;

/** None at build time: each page is rendered on first request, then cached (ISR) until revalidated. */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return [];
}

async function load(slug: string) {
  return publicApiOrNull<ContentPage>(`/pages/${encodeURIComponent(slug)}`, { tags: [TAGS.page(slug), TAGS.content] });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = (await load((await params).slug))?.data;
  if (!page) return { title: 'Page not found' };
  return {
    title: page.seo?.title ?? page.title,
    description: page.seo?.description,
    alternates: { canonical: `/pages/${page.slug}` },
  };
}

/**
 * Content pages (REQ-33). The body is rendered as plain-text paragraphs, never as
 * HTML: the API stores it unsanitised, so treating it as markup would be stored XSS.
 */
export default async function ContentPageView({ params }: Props) {
  const result = await load((await params).slug);
  if (!result) notFound();
  const page = result.data;
  return (
    <article className="panel stack" style={{ maxWidth: 760 }}>
      <Breadcrumb items={[{ href: '/', label: 'Home' }, { label: page.title }]} />
      <h1>{page.title}</h1>
      {page.body.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index} style={{ whiteSpace: 'pre-line' }}>
          {paragraph}
        </p>
      ))}
      <p className="small muted">Last updated {day(page.updatedAt)}</p>
    </article>
  );
}
