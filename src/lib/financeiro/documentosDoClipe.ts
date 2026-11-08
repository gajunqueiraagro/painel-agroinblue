/**
 * OS DOCUMENTOS DE UM LANÇAMENTO PARA O CLIPE DA LISTA — DOC-ANEXO-E-IMPORT-01 F2 (D1/D2 do mock `ui-validar/doc-anexo-mock.html`).
 * Lidos NO CLIQUE (a página da lista não muda; a contagem do clipe vem da leitura por cliente que já existe), da MESMA fonte e com a
 * MESMA regra da aba Documentos: a `vw_lancamento_documentos` (os dele e os ligados a ele), `daLinha` e `linhasDosDocumentos`
 * (PDF + XML da mesma nota = 1 linha). Falhar NUNCA vira lista vazia (P146): volta a frase.
 */
import { supabase } from '@/integrations/supabase/client';
import { daLinha } from '@/hooks/useLancamentoDocumentos';
import { linhasDosDocumentos, type LinhaDeDocumento } from '@/lib/financeiro/notaDosDocumentos';
import type { Consulta } from '@/lib/financeiro/nfeConsultas';

export const FRASE_CLIPE_NAO_LEU = 'Não consegui ler os documentos deste lançamento. Tente de novo.';

export async function lerLinhasDoClipe(clienteId: string, lancamentoId: string): Promise<Consulta<LinhaDeDocumento[]>> {
  const { data, error } = await supabase.from('vw_lancamento_documentos')
    .select('*').eq('lancamento_id', lancamentoId).eq('cliente_id', clienteId)
    .order('uploaded_em', { ascending: false });
  if (error) { console.error('clipe: ler os documentos', error); return { ok: false, motivo: FRASE_CLIPE_NAO_LEU }; }
  return { ok: true, valor: linhasDosDocumentos((data ?? []).map(daLinha).filter((d) => !d.cancelado)) };
}
