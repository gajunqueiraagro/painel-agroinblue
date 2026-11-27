/**
 * FOLHA-TELAS-03 — "Arrastar recibos do contador" na Folha do mês: o PDF passa pelo MESMO leitor da Caixa (`itensDoPdf` → `montarLinhas`
 * por página → `lerFolha`) e abre a MESMA prévia (`FolhaDaCaixaDialog`, `fn_folha_recibos_aplicar`). Nada de leitor nem gravador novo.
 * ⚠ Só o recibo (holerite / 13º): o que não é folha diz por quê e manda para a Caixa de entrada (boleto, nota, extrato do contador).
 */
import { itensDoPdf } from '@/lib/financeiro/nfe/lerNotaPdf';
import { montarLinhas } from '@/lib/oc/leitura/montarLinhas';
import { lerFolha, type FolhaLida } from '@/lib/folha/lerFolha';

export type ReciboLido = { ok: true; folha: FolhaLida; bytes: ArrayBuffer; nome: string } | { ok: false; frase: string };

export const FRASE_NAO_E_PDF = 'O recibo do contador é um PDF. Outros arquivos vão pela Caixa de entrada.';
export const FRASE_NAO_E_RECIBO = 'Este PDF não é um recibo de pagamento que eu saiba ler. Boleto, nota e extrato do contador vão pela Caixa de entrada.';

export async function lerReciboDoArquivo(arquivo: File): Promise<ReciboLido> {
  if (!/\.pdf$/i.test(arquivo.name) && arquivo.type !== 'application/pdf') return { ok: false, frase: FRASE_NAO_E_PDF };
  const bytes = await arquivo.arrayBuffer();
  let paginas: string[][];
  try {
    const lido = await itensDoPdf(bytes.slice(0));
    paginas = lido.paginas.map(p => montarLinhas([p]));
  } catch {
    return { ok: false, frase: 'Não consegui abrir o PDF (com senha ou danificado).' };
  }
  const f = lerFolha(paginas);
  if (f.ok === true) return { ok: true, folha: f.folha, bytes, nome: arquivo.name };
  return { ok: false, frase: f.motivo === 'nao_fecha' ? `Folha que não fecha: ${f.frase} Fale com o consultor.` : FRASE_NAO_E_RECIBO };
}
