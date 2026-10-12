export const CAMPAIGN_LINKS = [
  { href: '/admin/campaigns', label: 'Campaigns' },
  { href: '/admin/campaigns/new', label: 'New campaign' },
  { href: '/admin/campaign-templates', label: 'Templates' },
];

export const CAMPAIGN_STATUS: Record<'SENDING' | 'SENT' | 'FAILED', string> = {
  SENDING: 'Sending',
  SENT: 'Sent',
  FAILED: 'Failed',
};

export const RECIPIENT_STATUS: Record<'PENDING' | 'SENT' | 'FAILED', string> = {
  PENDING: 'Waiting',
  SENT: 'Sent',
  FAILED: 'Failed',
};
