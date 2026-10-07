/**
 * O NOME DA PARCELA NA TELA: o nome (que pode cortar) e o "i/N" (que NUNCA corta) — PARC-LIVRES-01 passo 5.
 *
 * ⚠ O "i/N" VEM DO CONTRATO (número da parcela e total), lido do banco por `fn_parcelas_dos_lancamentos` — nunca do texto da
 *   descrição. O texto só é LIDO para não escrever o "i/N" duas vezes: se a descrição já termina (ou começa) com o MESMO
 *   "i/N" do contrato, esse trecho sai do nome — a forma nova ("Manutenção Cercas 2/3"), a antiga ("… - Parcela 2/3") e a do
 *   motor ("Parcela 2/3 …"). "i/N" DIFERENTE do contrato fica no nome como está: a tela não corrige texto.
 * ⚠ A TELA NÃO MONTA DESCRIÇÃO DE PARCELA: quem forma o texto gravado é o banco (`_fn_parcela_descricao`).
 */
export interface ParcelaDoContrato { numero: number; total: number }

const inteiroPositivo = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;

/** `{ lancamento_id: [numero, total] }` → mapa. Entrada torta é ignorada (a linha fica sem "i/N", nunca com um inventado). */
export function lerParcelasDosLancamentos(json: unknown): Map<string, ParcelaDoContrato> {
  const mapa = new Map<string, ParcelaDoContrato>();
  if (!json || typeof json !== 'object' || Array.isArray(json)) return mapa;
  for (const [id, v] of Object.entries(json)) {
    if (!Array.isArray(v) || v.length !== 2) continue;
    const [numero, total] = v;
    if (inteiroPositivo(numero) && inteiroPositivo(total)) mapa.set(id, { numero, total });
  }
  return mapa;
}

export interface NomeEParcela { nome: string; parcela: string | null; inteiro: string }

export function nomeEParcela(descricao: string | null | undefined, p: ParcelaDoContrato | null | undefined): NomeEParcela {
  const texto = (descricao ?? '').trim();
  if (!p) return { nome: texto, parcela: null, inteiro: texto };
  const parcela = `${p.numero}/${p.total}`;
  const iN = `${p.numero}\\s*/\\s*${p.total}`;
  const noFim = new RegExp(`(?:^|\\s)(?:[-–—·]\\s*)?(?:parc(?:ela)?\\.?\\s*)?${iN}$`, 'i');
  const noComeco = new RegExp(`^parc(?:ela)?\\.?\\s*${iN}(?:\\s*[-–—·])?\\s+`, 'i');
  const nome = noFim.test(texto) ? texto.replace(noFim, '').trim() : texto.replace(noComeco, '').trim();
  return { nome, parcela, inteiro: nome ? `${nome} ${parcela}` : parcela };
}
