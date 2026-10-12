'use client';

import { useRouter } from 'next/navigation';
import { useState, type ChangeEvent } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import { bff } from '@/lib/api/client';
import type { AudiencePreview, CampaignSummary, CampaignTemplate } from '@/lib/api/leads-types';

/** Pick an approved template and an audience, preview the count, then send. */
export function CampaignForm({ templates }: { templates: CampaignTemplate[] }) {
  const router = useRouter();
  const action = useAction();
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [city, setCity] = useState('');
  const [productInterest, setProductInterest] = useState('');
  const [preview, setPreview] = useState<AudiencePreview | null>(null);

  function audience() {
    const body: Record<string, string> = { templateId };
    if (city.trim()) body.city = city.trim();
    if (productInterest.trim()) body.productInterest = productInterest.trim();
    return body;
  }

  function edit(setter: (value: string) => void) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setter(event.target.value);
      setPreview(null);
    };
  }

  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!name.trim()) {
          action.setError('Name the campaign.');
          return;
        }
        if (!preview || preview.eligible < 1) {
          action.setError('Preview the audience first. A send needs at least one opted-in lead.');
          return;
        }
        if (!window.confirm(`Send this template to ${preview.eligible} opted-in ${preview.eligible === 1 ? 'lead' : 'leads'}?`)) {
          return;
        }
        const created = await action.run(
          () => bff<CampaignSummary>('/admin/campaigns', { method: 'POST', body: { ...audience(), name: name.trim() } }),
          { refresh: false },
        );
        if (created) router.push(`/admin/campaigns/${created.data.id}`);
      }}
    >
      <div className="field">
        <label htmlFor="campaign-name">Name</label>
        <input id="campaign-name" value={name} onChange={edit(setName)} required maxLength={80} />
      </div>
      <div className="field">
        <label htmlFor="campaign-template">Approved template</label>
        <select id="campaign-template" value={templateId} onChange={edit(setTemplateId)} required>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="campaign-city">City (optional)</label>
        <input id="campaign-city" value={city} onChange={edit(setCity)} placeholder="Lahore" />
        <span className="hint">Leave blank to include every city.</span>
      </div>
      <div className="field">
        <label htmlFor="campaign-product">Product interest contains (optional)</label>
        <input id="campaign-product" value={productInterest} onChange={edit(setProductInterest)} placeholder="AC" />
      </div>
      <div className="row">
        <button
          type="button"
          className="secondary"
          data-testid="preview-campaign"
          disabled={action.pending || !templateId}
          onClick={async () => {
            const result = await action.run(
              () => bff<AudiencePreview>('/admin/campaigns/preview', { method: 'POST', body: audience() }),
              { refresh: false },
            );
            if (result) setPreview(result.data);
          }}
        >
          {action.pending ? 'Working…' : 'Preview audience'}
        </button>
        <button type="submit" data-testid="send-campaign" disabled={action.pending || !preview || preview.eligible < 1}>
          Send
        </button>
      </div>
      {action.error ? <FormStatus error={action.error} /> : null}
      {preview ? (
        <div className="panel" data-testid="audience-preview">
          <p style={{ margin: 0 }}>
            {preview.eligible} opted in and ready to receive this.
          </p>
          <p className="muted small" style={{ margin: '0.35rem 0 0' }}>
            Left out: {preview.excluded.unknown} not asked, {preview.excluded.optedOut} opted out.
          </p>
        </div>
      ) : null}
    </form>
  );
}
