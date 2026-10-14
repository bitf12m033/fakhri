'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import { bff } from '@/lib/api/client';
import type { ImportReport } from '@/lib/api/leads-types';

const MAX_BYTES = 2_000_000;

/** Preview a CSV, then save it only when every row is valid. */
export function ImportForm() {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | undefined>();
  const [report, setReport] = useState<ImportReport | null>(null);
  const [saved, setSaved] = useState<ImportReport | null>(null);
  const action = useAction();

  function replaceCsv(next: string, name?: string) {
    setCsv(next);
    setFileName(name);
    setReport(null);
    setSaved(null);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      action.setError('The file is larger than 2 MB. Export a smaller CSV.');
      return;
    }
    replaceCsv(await file.text(), file.name);
  }

  const body = { csv, ...(fileName ? { fileName } : {}) };
  const canSave = Boolean(report && report.validRows > 0);

  return (
    <div className="stack">
      <div className="field">
        <label htmlFor="lead-file">CSV file</label>
        <input
          id="lead-file"
          type="file"
          accept=".csv,text/csv,text/plain"
          data-testid="lead-file"
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
        <span className="hint">Export the spreadsheet as CSV. Excel workbooks are not accepted. Up to 2 MB and 5,000 rows.</span>
      </div>
      <div className="field">
        <label htmlFor="lead-csv">Or paste the CSV</label>
        <textarea
          id="lead-csv"
          rows={12}
          value={csv}
          data-testid="lead-csv"
          onChange={(event) => replaceCsv(event.target.value, fileName)}
          spellCheck={false}
        />
      </div>
      <div className="row">
        <button
          type="button"
          className="secondary"
          data-testid="preview-import"
          disabled={action.pending || csv.trim() === ''}
          onClick={async () => {
            setSaved(null);
            const result = await action.run(() => bff<ImportReport>('/admin/leads/imports/preview', { method: 'POST', body }), {
              refresh: false,
            });
            if (result) setReport(result.data);
          }}
        >
          {action.pending ? 'Working…' : 'Preview'}
        </button>
        <button
          type="button"
          data-testid="save-leads"
          disabled={action.pending || !canSave}
          onClick={async () => {
            const result = await action.run(() => bff<ImportReport>('/admin/leads/imports', { method: 'POST', body }), {
              refresh: false,
            });
            if (result) setSaved(result.data);
          }}
        >
          Save leads
        </button>
      </div>
      {action.error ? <FormStatus error={action.error} /> : null}

      {report ? (
        <div className="panel stack" data-testid="import-report">
          <h2>Preview</h2>
          <p>
            {report.rows} rows, {report.validRows} valid, {report.invalidRows} invalid. {report.newLeads} new{' '}
            {report.newLeads === 1 ? 'lead' : 'leads'}, {report.existingLeads} already on file, {report.matchedCustomers}{' '}
            match a store account.
          </p>
          {report.duplicateRows > 0 ? (
            <p className="small">{report.duplicateRows} extra rows share a phone and will be kept as another case.</p>
          ) : null}
          {report.recognizedColumns.length > 0 ? (
            <p className="small muted">Using columns: {report.recognizedColumns.join(', ')}.</p>
          ) : null}
          {report.ignoredColumns.length > 0 ? (
            <p className="small muted">Ignoring columns: {report.ignoredColumns.join(', ')}.</p>
          ) : null}
          {report.invalidRows > 0 ? (
            <>
              <p>
                These rows have no Pakistani mobile number, so they stay out. The other {report.validRows} can be saved.
              </p>
              <ul>
                {report.issues.map((issue) => (
                  <li key={`${issue.line}-${issue.message}`}>
                    Line {issue.line}: {issue.message}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>Every row is valid. Saving will not change consent.</p>
          )}
        </div>
      ) : null}

      {saved ? (
        <div className="notice ok" role="status" data-testid="import-saved">
          Saved. Created {saved.createdLeads ?? 0}, updated {saved.updatedLeads ?? 0}, linked{' '}
          {saved.linkedCustomers ?? 0} store accounts.{' '}
          <Link href="/admin/leads">Review the leads</Link> and record consent before a campaign.
        </div>
      ) : null}
    </div>
  );
}
