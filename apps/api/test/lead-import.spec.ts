import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/modules/leads/csv';
import { planImport } from '../src/modules/leads/lead-import';

const SHEET = [
  'Case Number,Account Name,Phone,Case Status,Case Comment,Product,City,First Name,Last Name,Caller Phone',
  'C-1,Acme,03001234567,Closed,"Install, please",AC,Lahore,Ali,Khan,03007654321',
  'C-2,Acme,0300 1234567,Closed,Follow up,Refrigerator,Karachi,,,',
  'C-3,Other,not-a-phone,Open,Nope,TV,Lahore,No,One,',
].join('\n');

describe('lead import', () => {
  it('keeps commas that sit inside quotes', () => {
    const [header, row] = parseCsv('A,B\n"hello, world",second');
    expect(header).toEqual(['A', 'B']);
    expect(row).toEqual(['hello, world', 'second']);
  });

  it('merges rows that share a phone and reports the bad ones', () => {
    const plan = planImport(SHEET, { leadPhones: new Set(['+923001234567']), customerPhones: new Set(['+923001234567']) });
    expect(plan.report.rows).toBe(3);
    expect(plan.report.validRows).toBe(2);
    expect(plan.report.invalidRows).toBe(1);
    expect(plan.report.issues[0]).toMatchObject({ line: 4 });
    expect(plan.report.uniquePhones).toBe(1);
    expect(plan.report.duplicateRows).toBe(1);
    expect(plan.report.existingLeads).toBe(1);
    expect(plan.report.matchedCustomers).toBe(1);
    expect(plan.report.newLeads).toBe(0);
    expect(plan.leads[0]).toMatchObject({
      phone: '+923001234567',
      firstName: 'Ali',
      city: 'Lahore',
      productInterest: 'AC',
    });
    expect(plan.leads[0].cases.map((item) => item.caseNumber)).toEqual(['C-1', 'C-2']);
    expect(plan.leads[0].cases[0].comment).toBe('Install, please');
  });

  it('uses an explicit column map instead of the header aliases', () => {
    const csv = 'Mobile,Town\n03001234567,Multan';
    const plan = planImport(csv, { leadPhones: new Set(), customerPhones: new Set() }, { Mobile: 'phone', Town: 'city' });
    expect(plan.leads[0]).toMatchObject({ phone: '+923001234567', city: 'Multan' });
    expect(plan.report.newLeads).toBe(1);
  });

  it('recognizes the case-export headers and phone prefix', () => {
    const csv = [
      'Case Number,Contact,Product Group,Caller Phone Number,Locality/District,City',
      'CPK-1,Customer,Home Air Conditioner,3130001509,Chah Miran,Lahore',
      'CPK-2,Customer,Washing Machine,Phone:00923392449255,Johar Town,Lahore',
    ].join('\n');
    const plan = planImport(csv, { leadPhones: new Set(), customerPhones: new Set() });

    expect(plan.report.invalidRows).toBe(0);
    expect(plan.report.recognizedColumns).toEqual([
      'Case Number',
      'Contact',
      'Product Group',
      'Caller Phone Number',
      'Locality/District',
      'City',
    ]);
    expect(plan.leads).toEqual([
      expect.objectContaining({
        phone: '+923130001509',
        productInterest: 'Home Air Conditioner',
        locality: 'Chah Miran',
      }),
      expect.objectContaining({
        phone: '+923392449255',
        productInterest: 'Washing Machine',
        locality: 'Johar Town',
      }),
    ]);
  });
});
