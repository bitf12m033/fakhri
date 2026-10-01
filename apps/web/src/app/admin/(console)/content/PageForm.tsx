'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import type { AdminContentPage } from '@/lib/api/admin-ops-types';
import { bff } from '@/lib/api/client';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function PageForm({ page }: { page?: AdminContentPage }) {
  const router = useRouter();
  const action = useAction();
  const [slug, setSlug] = useState(page?.slug ?? '');
  const [title, setTitle] = useState(page?.title ?? '');
  const [body, setBody] = useState(page?.body ?? '');
  const [seoTitle, setSeoTitle] = useState(page?.seo?.title ?? '');
  const [seoDescription, setSeoDescription] = useState(page?.seo?.description ?? '');
  const [seoKeywords, setSeoKeywords] = useState(page?.seo?.keywords?.join(', ') ?? '');
  const [isPublished, setIsPublished] = useState(false);

  const seo = () => {
    const keywords = seoKeywords
      .split(',')
      .map((keyword) => keyword.trim())
      .filter(Boolean);
    const value = {
      ...(seoTitle.trim() ? { title: seoTitle.trim() } : {}),
      ...(seoDescription.trim() ? { description: seoDescription.trim() } : {}),
      ...(keywords.length ? { keywords } : {}),
    };
    // An emptied SEO block is sent as {} so the old values are dropped.
    return Object.keys(value).length > 0 || page?.seo ? value : undefined;
  };

  return (
    <form
      className="panel stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const seoValue = seo();
        if (seoValue?.keywords && seoValue.keywords.length > 12) {
          action.setError('Use at most 12 SEO keywords.');
          return;
        }
        if (seoValue?.keywords?.some((keyword) => keyword.length > 40)) {
          action.setError('Each SEO keyword must be 40 characters or fewer.');
          return;
        }
        const common = { title: title.trim(), body, ...(seoValue ? { seo: seoValue } : {}) };
        if (page) {
          await action.run(() => bff(`/admin/content/pages/${page.id}`, { method: 'PATCH', body: common }), {
            success: page.isPublished ? 'Saved. The live page updates shortly.' : 'Draft saved.',
          });
          return;
        }
        if (!SLUG.test(slug)) {
          action.setError('Slug must be lowercase letters, numbers and single hyphens, e.g. warranty-policy.');
          return;
        }
        const created = await action.run(
          () =>
            bff<AdminContentPage>('/admin/content/pages', {
              method: 'POST',
              body: { slug, ...common, isPublished },
            }),
          { refresh: false },
        );
        if (created) router.push(`/admin/content/pages/${created.data.id}?created=1`);
      }}
    >
      <FormStatus error={action.error} message={action.message} />
      <div className="form-grid">
        <div className="field">
          <label htmlFor="page-title">Title</label>
          <input
            id="page-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            minLength={2}
            maxLength={160}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="page-slug">Slug</label>
          <input
            id="page-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            disabled={Boolean(page)}
            maxLength={80}
            required
            aria-describedby="page-slug-hint"
          />
          <span className="hint" id="page-slug-hint">
            {page
              ? `Lives at /pages/${page.slug}. A slug cannot be changed after creation.`
              : `The address: /pages/${slug || 'your-slug'}`}
          </span>
        </div>
        <div className="field wide">
          <label htmlFor="page-body">Body</label>
          <textarea
            id="page-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            maxLength={100_000}
            required
            aria-describedby="page-body-hint"
          />
          <span className="hint" id="page-body-hint">
            Plain text. Each blank line starts a new paragraph; no HTML or Markdown formatting is applied.
          </span>
        </div>
      </div>

      <fieldset className="stack">
        <legend>Search engines (optional)</legend>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="page-seo-title">SEO title</label>
            <input id="page-seo-title" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} maxLength={160} />
          </div>
          <div className="field">
            <label htmlFor="page-seo-keywords">Keywords</label>
            <input
              id="page-seo-keywords"
              value={seoKeywords}
              onChange={(e) => setSeoKeywords(e.target.value)}
              aria-describedby="page-seo-keywords-hint"
            />
            <span className="hint" id="page-seo-keywords-hint">
              Comma separated, up to 12.
            </span>
          </div>
          <div className="field wide">
            <label htmlFor="page-seo-description">Meta description</label>
            <textarea
              id="page-seo-description"
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              maxLength={320}
              rows={2}
            />
          </div>
        </div>
      </fieldset>

      {page ? null : (
        <label className="check" htmlFor="page-published">
          <input
            id="page-published"
            type="checkbox"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
          />
          Publish now (otherwise it is saved as a draft)
        </label>
      )}
      <div className="row">
        <button type="submit" disabled={action.pending}>
          {page ? 'Save page' : 'Create page'}
        </button>
      </div>
    </form>
  );
}
