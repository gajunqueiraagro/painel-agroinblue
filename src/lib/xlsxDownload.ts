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

export function triggerXlsxDownload(
  payloadOrRows: XlsxDownloadPayload | Record<string, XlsxCellValue>[],
  legacyFilename?: string
) {
  let payload: XlsxDownloadPayload;
  if (Array.isArray(payloadOrRows)) {
    payload = {
      filename: legacyFilename ?? 'export.xlsx',
      sheets: [{ name: 'Dados', mode: 'json', rows: payloadOrRows }],
    };
  } else {
    payload = payloadOrRows;
  }

  console.log('[XLSX-DIAG] triggerXlsxDownload CHAMADO', { filename: payload.filename, sheetsCount: payload.sheets.length });

  if (!payload.sheets.length) {
    console.error('[XLSX-DIAG] ERRO: Nenhuma aba informada');
    throw new Error('Nenhuma aba informada para exportação.');
  }

  console.log('[XLSX-DIAG] URL do endpoint:', EXPORT_XLSX_URL);

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = EXPORT_XLSX_URL;
  form.style.display = 'none';

  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'payload';
  input.value = JSON.stringify(payload);
  form.appendChild(input);

  console.log('[XLSX-DIAG] Form criado, payload size:', input.value.length, 'bytes');
  console.log('[XLSX-DIAG] Inserindo form no DOM...');
  document.body.appendChild(form);
  console.log('[XLSX-DIAG] Form inserido. Chamando form.submit()...');

  try {
    form.submit();
    console.log('[XLSX-DIAG] form.submit() executado com sucesso');
  } catch (err) {
    console.error('[XLSX-DIAG] ERRO no form.submit():', err);
  }

  requestAnimationFrame(() => {
    form.remove();
    console.log('[XLSX-DIAG] Form removido do DOM');
  });
}
