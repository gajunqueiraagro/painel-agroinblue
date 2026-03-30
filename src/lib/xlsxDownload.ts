export type XlsxCellValue = string | number | boolean | null;
export type XlsxColumn = { wch: number };

export type XlsxSheet = {
  name: string;
  mode?: 'json' | 'aoa';
  rows: Array<Record<string, XlsxCellValue>> | Array<XlsxCellValue[]>;
  cols?: XlsxColumn[];
};

export interface XlsxDownloadPayload {
  filename: string;
  sheets: XlsxSheet[];
}

const EXPORT_XLSX_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-xlsx`;

export function triggerXlsxDownload(payload: XlsxDownloadPayload) {
  if (!payload.sheets.length) {
    throw new Error('Nenhuma aba informada para exportação.');
  }

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = EXPORT_XLSX_URL;
  form.target = '_top';
  form.style.display = 'none';

  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'payload';
  input.value = JSON.stringify(payload);
  form.appendChild(input);

  document.body.appendChild(form);
  form.submit();
  requestAnimationFrame(() => {
    form.remove();
  });
}
