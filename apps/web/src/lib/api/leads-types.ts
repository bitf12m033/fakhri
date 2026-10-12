export type LeadConsent = 'UNKNOWN' | 'OPTED_IN' | 'OPTED_OUT';

export interface LeadSummary {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  contactName: string | null;
  accountName: string | null;
  city: string | null;
  locality: string | null;
  zipCode: string | null;
  country: string | null;
  productInterest: string | null;
  consent: LeadConsent;
  consentAt: string | null;
  customerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadCaseRow {
  id: string;
  caseNumber: string | null;
  status: string | null;
  comment: string | null;
  product: string | null;
  priority: string | null;
  owner: string | null;
  createdAt: string;
}

export interface LeadDetail extends LeadSummary {
  cases: LeadCaseRow[];
}

export interface ImportIssue {
  line: number;
  message: string;
}

export interface ImportReport {
  rows: number;
  validRows: number;
  invalidRows: number;
  issues: ImportIssue[];
  uniquePhones: number;
  duplicateRows: number;
  newLeads: number;
  existingLeads: number;
  matchedCustomers: number;
  recognizedColumns: string[];
  ignoredColumns: string[];
  createdLeads?: number;
  updatedLeads?: number;
  linkedCustomers?: number;
  importId?: string;
}

export type TemplateStatus = 'DRAFT' | 'APPROVED';

export interface CampaignTemplate {
  id: string;
  name: string;
  body: string;
  status: TemplateStatus;
  providerTemplateName: string | null;
  language: string;
  createdAt: string;
  updatedAt: string;
}

export type CampaignStatus = 'SENDING' | 'SENT' | 'FAILED';
export type RecipientStatus = 'PENDING' | 'SENT' | 'FAILED';

export interface CampaignSummary {
  id: string;
  name: string;
  templateId: string;
  city: string | null;
  productInterest: string | null;
  status: CampaignStatus;
  recipientCount: number;
  sentCount: number;
  sentAt: string | null;
  createdAt: string;
}

export interface CampaignRecipientRow {
  id: string;
  leadId: string;
  phone: string;
  firstName: string | null;
  status: RecipientStatus;
  sentAt: string | null;
}

export interface CampaignDetail extends CampaignSummary {
  recipients: CampaignRecipientRow[];
}

export interface AudiencePreview {
  templateStatus: TemplateStatus;
  eligible: number;
  excluded: { unknown: number; optedOut: number };
  city: string | null;
  productInterest: string | null;
}

export function leadName(lead: Pick<LeadSummary, 'firstName' | 'lastName' | 'contactName' | 'accountName'>): string {
  const person = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
  return person || lead.contactName || lead.accountName || 'Unnamed';
}
