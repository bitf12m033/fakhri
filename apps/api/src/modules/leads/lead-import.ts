import { invalidInput } from '@fakhri/shared';
import { normalizePhone } from '../customers/phone';
import { parseCsv } from './csv';

/** Fields an import column may fill. `callerPhone` is used only when `phone` is empty. */
export const LEAD_FIELDS = [
  'phone',
  'callerPhone',
  'firstName',
  'lastName',
  'contactName',
  'accountName',
  'city',
  'locality',
  'zipCode',
  'country',
  'product',
  'caseNumber',
  'caseStatus',
  'caseComment',
  'priority',
  'owner',
] as const;

export type LeadField = (typeof LEAD_FIELDS)[number];

const FIELD_SET = new Set<string>(LEAD_FIELDS);

/** Headers from the case exports marketing already has, matched case-insensitively. */
const HEADER_ALIASES: Record<string, LeadField> = {
  phone: 'phone',
  mobile: 'phone',
  'mobile number': 'phone',
  'contact number': 'phone',
  'caller phone': 'callerPhone',
  callerphone: 'callerPhone',
  'first name': 'firstName',
  firstname: 'firstName',
  'last name': 'lastName',
  lastname: 'lastName',
  contact: 'contactName',
  'contact name': 'contactName',
  'account name': 'accountName',
  account: 'accountName',
  city: 'city',
  locality: 'locality',
  'locality/city': 'locality',
  area: 'locality',
  zip: 'zipCode',
  zipcode: 'zipCode',
  'zip code': 'zipCode',
  'postal code': 'zipCode',
  country: 'country',
  product: 'product',
  'case number': 'caseNumber',
  'case no': 'caseNumber',
  casenumber: 'caseNumber',
  'case status': 'caseStatus',
  'case comment': 'caseComment',
  comment: 'caseComment',
  comments: 'caseComment',
  priority: 'priority',
  owner: 'owner',
  'case owner': 'owner',
};

export const IMPORT_LIMITS = {
  maxBytes: 2_000_000,
  maxRows: 5_000,
  maxComment: 4_000,
  reportedErrors: 50,
} as const;

export interface LeadCaseDraft {
  caseNumber?: string;
  status?: string;
  comment?: string;
  product?: string;
  priority?: string;
  owner?: string;
}

export interface LeadDraft {
  phone: string;
  firstName?: string;
  lastName?: string;
  contactName?: string;
  accountName?: string;
  city?: string;
  locality?: string;
  zipCode?: string;
  country?: string;
  productInterest?: string;
  cases: LeadCaseDraft[];
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
  /** Extra valid rows for a phone already seen earlier in the file. They add a case, not a lead. */
  duplicateRows: number;
  newLeads: number;
  existingLeads: number;
  matchedCustomers: number;
  recognizedColumns: string[];
  ignoredColumns: string[];
}

export interface ImportPlan {
  report: ImportReport;
  leads: LeadDraft[];
}

interface RawRow {
  line: number;
  values: Partial<Record<LeadField, string>>;
}

function headerKey(value: string): string {
  return value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function cell(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Resolve which column is which. An explicit map replaces the aliases entirely,
 * so a file whose "Status" is not a case status can be mapped on purpose.
 */
export function resolveColumns(headers: string[], columns?: Record<string, string>): Map<number, LeadField> {
  const resolved = new Map<number, LeadField>();
  const used = new Map<LeadField, string>();

  headers.forEach((header, index) => {
    const key = headerKey(header);
    if (!key) return;
    const field = columns ? explicitField(header, columns) : HEADER_ALIASES[key];
    if (!field) return;
    const previous = used.get(field);
    if (previous) {
      throw invalidInput(`Columns "${previous}" and "${header.trim()}" both map to ${field}`);
    }
    used.set(field, header.trim());
    resolved.set(index, field);
  });

  if (!used.has('phone') && !used.has('callerPhone')) {
    throw invalidInput('No phone column found. Map a column to phone, or include a Phone or Caller Phone header.');
  }
  return resolved;
}

function explicitField(header: string, columns: Record<string, string>): LeadField | undefined {
  const wanted = headerKey(header);
  for (const [from, to] of Object.entries(columns)) {
    if (headerKey(from) !== wanted) continue;
    if (!FIELD_SET.has(to)) {
      throw invalidInput(`Column "${from}" maps to "${to}", which is not a lead field`);
    }
    return to as LeadField;
  }
  return undefined;
}

export function readLeadRows(csv: string, columns?: Record<string, string>): {
  rows: RawRow[];
  recognizedColumns: string[];
  ignoredColumns: string[];
} {
  if (Buffer.byteLength(csv, 'utf8') > IMPORT_LIMITS.maxBytes) {
    throw invalidInput(`The file is larger than ${IMPORT_LIMITS.maxBytes} bytes`);
  }
  const records = parseCsv(csv);
  const header = records.shift();
  if (!header || header.every((cellValue) => cellValue.trim() === '')) {
    throw invalidInput('The file has no header row');
  }

  const mapping = resolveColumns(header, columns);
  if (records.length > IMPORT_LIMITS.maxRows) {
    throw invalidInput(`The file has more than ${IMPORT_LIMITS.maxRows} rows`);
  }

  const recognized = new Set<string>();
  const ignored: string[] = [];
  header.forEach((name, index) => {
    const label = name.trim();
    if (!label) return;
    if (mapping.has(index)) recognized.add(label);
    else ignored.push(label);
  });

  const rows: RawRow[] = records.map((record, index) => {
    const values: Partial<Record<LeadField, string>> = {};
    mapping.forEach((field, column) => {
      const value = cell(record[column]);
      if (value) values[field] = value;
    });
    return { line: index + 2, values };
  });

  return { rows, recognizedColumns: [...recognized], ignoredColumns: ignored };
}

function phoneOf(values: Partial<Record<LeadField, string>>): { phone?: string; error?: string } {
  const raw = values.phone ?? values.callerPhone;
  if (!raw) return { error: 'Phone is empty' };
  try {
    return { phone: normalizePhone(raw) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Phone is not a Pakistani mobile number' };
  }
}

function keep(current: string | undefined, incoming: string | undefined): string | undefined {
  return current ?? incoming;
}

/**
 * Group valid rows into one draft per phone. Existing lead and customer phones
 * are supplied by the caller so this stays free of the database.
 */
export function planImport(
  csv: string,
  known: { leadPhones: ReadonlySet<string>; customerPhones: ReadonlySet<string> },
  columns?: Record<string, string>,
): ImportPlan {
  const { rows, recognizedColumns, ignoredColumns } = readLeadRows(csv, columns);
  const issues: ImportIssue[] = [];
  const leads = new Map<string, LeadDraft>();
  const caseOwner = new Map<string, string>();
  let validRows = 0;
  let duplicateRows = 0;

  for (const row of rows) {
    const { phone, error } = phoneOf(row.values);
    if (!phone || error) {
      issues.push({ line: row.line, message: error ?? 'Phone is empty' });
      continue;
    }

    const caseNumber = row.values.caseNumber;
    if (caseNumber) {
      const owner = caseOwner.get(caseNumber);
      if (owner && owner !== phone) {
        issues.push({ line: row.line, message: `Case ${caseNumber} is already used by another phone` });
        continue;
      }
      caseOwner.set(caseNumber, phone);
    }

    validRows += 1;
    const existing = leads.get(phone);
    const caseDraft = toCase(row.values);
    if (!existing) {
      leads.set(phone, {
        phone,
        firstName: row.values.firstName,
        lastName: row.values.lastName,
        contactName: row.values.contactName,
        accountName: row.values.accountName,
        city: row.values.city,
        locality: row.values.locality,
        zipCode: row.values.zipCode,
        country: row.values.country,
        productInterest: row.values.product,
        cases: caseDraft ? [caseDraft] : [],
      });
      continue;
    }

    duplicateRows += 1;
    existing.firstName = keep(existing.firstName, row.values.firstName);
    existing.lastName = keep(existing.lastName, row.values.lastName);
    existing.contactName = keep(existing.contactName, row.values.contactName);
    existing.accountName = keep(existing.accountName, row.values.accountName);
    existing.city = keep(existing.city, row.values.city);
    existing.locality = keep(existing.locality, row.values.locality);
    existing.zipCode = keep(existing.zipCode, row.values.zipCode);
    existing.country = keep(existing.country, row.values.country);
    existing.productInterest = keep(existing.productInterest, row.values.product);
    if (caseDraft && !existing.cases.some((item) => item.caseNumber === caseDraft.caseNumber)) {
      existing.cases.push(caseDraft);
    }
  }

  let existingLeads = 0;
  let matchedCustomers = 0;
  for (const phone of leads.keys()) {
    if (known.leadPhones.has(phone)) existingLeads += 1;
    if (known.customerPhones.has(phone)) matchedCustomers += 1;
  }

  return {
    leads: [...leads.values()],
    report: {
      rows: rows.length,
      validRows,
      invalidRows: issues.length,
      issues: issues.slice(0, IMPORT_LIMITS.reportedErrors),
      uniquePhones: leads.size,
      duplicateRows,
      newLeads: leads.size - existingLeads,
      existingLeads,
      matchedCustomers,
      recognizedColumns,
      ignoredColumns,
    },
  };
}

function toCase(values: Partial<Record<LeadField, string>>): LeadCaseDraft | undefined {
  const draft: LeadCaseDraft = {
    caseNumber: values.caseNumber,
    status: values.caseStatus,
    comment: values.caseComment?.slice(0, IMPORT_LIMITS.maxComment),
    product: values.product,
    priority: values.priority,
    owner: values.owner,
  };
  if (!draft.caseNumber && !draft.status && !draft.comment && !draft.product && !draft.priority && !draft.owner) {
    return undefined;
  }
  return draft;
}
