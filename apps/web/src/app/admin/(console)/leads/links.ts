export const LEAD_LINKS = [
  { href: '/admin/leads', label: 'Leads' },
  { href: '/admin/leads/import', label: 'Import' },
];

export const CONSENT_LABEL: Record<'UNKNOWN' | 'OPTED_IN' | 'OPTED_OUT', string> = {
  UNKNOWN: 'Not asked',
  OPTED_IN: 'Opted in',
  OPTED_OUT: 'Opted out',
};
