'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import { bff } from '@/lib/api/client';
import type { CampaignTemplate } from '@/lib/api/leads-types';

const PLACEHOLDER = /\{\{\s*([A-Za-z]+)\s*\}\}/g;
const ALLOWED = new Set(['firstName', 'productInterest', 'city']);

/** Create a draft. Approving it happens from the template list. */
export function TemplateForm() {
  const router = useRouter();
  const action = useAction();
  const [name, setName] = useState('');
  const [body, setBody] = useState('Hello {{firstName}}, reply STOP to opt out.');
  const [providerTemplateName, setProviderTemplateName] = useState('');
  const [language, setLanguage] = useState('en');

  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        const unknown = [...body.matchAll(PLACEHOLDER)].map((match) => match[1]).find((token) => token && !ALLOWED.has(token));
        if (unknown) {
          action.setError(`Unknown placeholder {{${unknown}}}. Use firstName, productInterest, or city.`);
          return;
        }
        if (!/\bSTOP\b/i.test(body)) {
          action.setError('The template must tell people they can reply STOP.');
          return;
        }
        const providerName = providerTemplateName.trim();
        if (providerName && !/^[a-z0-9_]+$/.test(providerName)) {
          action.setError('The WhatsApp template name uses lowercase letters, numbers, and underscores.');
          return;
        }
        const created = await action.run(
          () =>
            bff<CampaignTemplate>('/admin/campaign-templates', {
              method: 'POST',
              body: {
                name: name.trim(),
                body,
                ...(providerName ? { providerTemplateName: providerName } : {}),
                ...(language.trim() ? { language: language.trim() } : {}),
              },
            }),
          { refresh: false },
        );
        if (created) router.push('/admin/campaign-templates');
      }}
    >
      <div className="field">
        <label htmlFor="template-name">Name</label>
        <input id="template-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
      </div>
      <div className="field">
        <label htmlFor="template-body">Body</label>
        <textarea
          id="template-body"
          rows={6}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          required
          maxLength={1024}
          data-testid="template-body"
        />
        <span className="hint">Placeholders: {'{{firstName}}'}, {'{{productInterest}}'}, {'{{city}}'}. Include the word STOP.</span>
      </div>
      <div className="field">
        <label htmlFor="template-provider">WhatsApp template name</label>
        <input
          id="template-provider"
          value={providerTemplateName}
          onChange={(event) => setProviderTemplateName(event.target.value)}
          maxLength={512}
          placeholder="ac_offer"
          data-testid="template-provider"
        />
        <span className="hint">The approved name in Meta. Leave this blank while delivery stays on the console adapter.</span>
      </div>
      <div className="field">
        <label htmlFor="template-language">Language</label>
        <input
          id="template-language"
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          maxLength={5}
          data-testid="template-language"
        />
      </div>
      <button type="submit" disabled={action.pending} data-testid="create-template">
        {action.pending ? 'Working…' : 'Save draft'}
      </button>
      {action.error ? <FormStatus error={action.error} /> : null}
    </form>
  );
}
