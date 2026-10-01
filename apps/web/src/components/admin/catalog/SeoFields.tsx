'use client';

import type { SeoDraft } from './form-values';

/** SEO title/description/keywords; blank everywhere clears the stored SEO block. */
export function SeoFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: SeoDraft;
  onChange: (next: SeoDraft) => void;
}) {
  return (
    <fieldset className="form-grid wide">
      <legend>SEO</legend>
      <div className="field">
        <label htmlFor={`${idPrefix}-seo-title`}>SEO title</label>
        <input
          id={`${idPrefix}-seo-title`}
          value={value.title}
          maxLength={160}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-seo-keywords`}>
          Keywords <span className="hint">comma-separated, up to 12</span>
        </label>
        <input
          id={`${idPrefix}-seo-keywords`}
          value={value.keywords}
          onChange={(e) => onChange({ ...value, keywords: e.target.value })}
        />
      </div>
      <div className="field wide">
        <label htmlFor={`${idPrefix}-seo-description`}>SEO description</label>
        <textarea
          id={`${idPrefix}-seo-description`}
          value={value.description}
          maxLength={320}
          rows={2}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
        />
      </div>
    </fieldset>
  );
}
