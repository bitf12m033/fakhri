import { describe, expect, it } from 'vitest';
import { assertTemplateBody, renderTemplate, templateParameters } from '../src/modules/campaigns/template';

const BODY = 'Hello {{firstName}}, the {{productInterest}} in {{ city }} is ready. Reply STOP to opt out.';

describe('campaign template', () => {
  it('fills the lead into the approved body', () => {
    expect(renderTemplate(BODY, { firstName: 'Sana', productInterest: 'AC', city: 'Lahore' })).toBe(
      'Hello Sana, the AC in Lahore is ready. Reply STOP to opt out.',
    );
  });

  it('uses the contact name when the first name is empty', () => {
    expect(renderTemplate('Hi {{firstName}}. Reply STOP', { contactName: 'Sana' })).toBe('Hi Sana. Reply STOP');
  });

  it('rejects a body that does not mention STOP', () => {
    expect(() => assertTemplateBody('Hello {{firstName}}')).toThrow(/STOP/);
  });

  it('rejects a placeholder the send cannot fill', () => {
    expect(() => assertTemplateBody('Hello {{phone}}. Reply STOP')).toThrow(/phone/);
  });

  it('lists Cloud API parameters in placeholder order and fills blanks with a dash', () => {
    expect(templateParameters(BODY, { firstName: 'Sana', city: 'Lahore' })).toEqual(['Sana', '-', 'Lahore']);
  });
});
