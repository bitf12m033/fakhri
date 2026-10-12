import { CONSENT_LABEL } from './links';

export function ConsentPill({ consent }: { consent: keyof typeof CONSENT_LABEL }) {
  const tone = consent === 'OPTED_IN' ? ' ok' : consent === 'OPTED_OUT' ? ' danger' : ' warn';
  return <span className={`pill${tone}`}>{CONSENT_LABEL[consent]}</span>;
}
