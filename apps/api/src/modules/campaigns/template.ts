import { invalidInput } from '@fakhri/shared';

/** Tokens a template may fill from the lead. Anything else is rejected. */
export const TEMPLATE_FIELDS = ['firstName', 'productInterest', 'city'] as const;

export type TemplateField = (typeof TEMPLATE_FIELDS)[number];

const FIELD_SET = new Set<string>(TEMPLATE_FIELDS);

export const CAMPAIGN_LIMITS = {
  maxRecipients: 200,
  maxName: 80,
  maxBody: 1024,
} as const;

function placeholders(): RegExp {
  return /\{\{\s*([A-Za-z]+)\s*\}\}/g;
}

export interface TemplateLead {
  firstName?: string | null;
  contactName?: string | null;
  productInterest?: string | null;
  city?: string | null;
}

/** Placeholders must be known, and the body must tell the person they can reply STOP. */
export function assertTemplateBody(body: string): void {
  const names = [...body.matchAll(placeholders())]
    .map((match) => match[1])
    .filter((name): name is string => typeof name === 'string');
  const unknown = names.filter((name) => !FIELD_SET.has(name));
  if (unknown.length > 0) {
    throw invalidInput(`Unknown placeholder {{${unknown[0]}}}. Use firstName, productInterest, or city.`);
  }
  if (!/\bSTOP\b/i.test(body)) {
    throw invalidInput('The template must tell people they can reply STOP');
  }
}

/** Fill the approved body. A missing name, city, or product becomes an empty string. */
export function renderTemplate(body: string, lead: TemplateLead): string {
  const values: Record<TemplateField, string> = {
    firstName: lead.firstName || lead.contactName || '',
    productInterest: lead.productInterest ?? '',
    city: lead.city ?? '',
  };
  return body.replace(placeholders(), (_match, name: string) => values[name as TemplateField] ?? '');
}

/** Placeholder values in the order they appear. The Cloud API fills its template from this list. */
export function templateParameters(body: string, lead: TemplateLead): string[] {
  return [...body.matchAll(placeholders())].map((match) => {
    const token = match[1];
    const value =
      token === 'firstName'
        ? lead.firstName || lead.contactName || ''
        : token === 'productInterest'
          ? (lead.productInterest ?? '')
          : token === 'city'
            ? (lead.city ?? '')
            : '';
    return value || '-';
  });
}
