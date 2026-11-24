/**
 * CARTAO-FATURA-IMPORT-01 — leitor da FATURA do cartão BB Ourocard (PDF com texto), sobre as LINHAS do PDF como a tela já as monta
 * (`montarLinhas`: células juntas por " | ", página por página). Função pura: nada grava.
 * A REGRA DA LEITURA:
 *  - cabeçalho: produto + final ("OUROCARD VISA | Final 3146"), vencimento (a 1ª data dd/mm/aaaa do resumo), fechamento ("Fatura fechada
 *    em"), total ("Total da Fatura"), saldo anterior ("SALDO FATURA ANTERIOR"), titular ("Nome (Cartão 3146)");
 *  - lançamentos: "dd/mm | descrição [| cidade] [| país] | R$ valor", entre "Data | Descrição" e "Total da Fatura"; a linha sem "|" é o
 *    nome da SEÇÃO (Pagamentos/Créditos, Serviços, Transporte, Outros lançamentos, Compras parceladas…); "Página x/y" é ignorada;
 *  - "PARC kk/nn" na descrição = a parcela k de n; a data da linha é a da COMPRA (o ano sai do fechamento: mês depois do fechamento = ano
 *    anterior);
 *  - compra no EXTERIOR: as linhas de baixo ("*** | 2.015.000,00 GUARANI", "equivalente a US$ 343,77", "Cotação do Dólar … R$ 5,3638")
 *    vão para a compra de cima;
 *  - a soma confere: saldo anterior + Σ lançamentos = total da fatura (o que não fecha vira aviso, nunca some).
 */

export type TipoDaLinha = 'compra' | 'pagamento' | 'anuidade' | 'desconto_anuidade' | 'iof' | 'credito';

export interface Exterior { moeda: string; valorOriginal: string; usd: string | null; cotacao: string | null }

export interface LinhaDaFatura {
  ordem: number; secao: string; dataCompra: string; descricao: string; pais: string | null; valorCent: number;
  parcela: { k: number; n: number } | null; exterior: Exterior | null; tipo: TipoDaLinha; titular: string | null; finalCartao: string | null;
}

export interface FaturaLida {
  produto: string | null; finalCartao: string | null; titular: string | null;
  vencimento: string | null; fechamento: string | null; totalCent: number | null; saldoAnteriorCent: number | null;
  linhas: LinhaDaFatura[]; somaConfere: boolean; avisos: string[];
}

const RE_VALOR = /^R\$\s*(-?[\d.]+,\d{2})$/;
const centavos = (s: string): number => {
  const neg = s.trim().startsWith('-');
  const [i, d] = s.replace('-', '').replace(/\./g, '').split(',');
  const v = Number(i) * 100 + Number(d);
  return neg ? -v : v;
};
const iso = (dmy: string) => { const [d, m, a] = dmy.split('/'); return `${a}-${m}-${d}`; };

function tipoDe(descricao: string, secao: string, valorCent: number): TipoDaLinha {
  const d = descricao.toUpperCase();
  if (/^PGTO\b/.test(d)) return 'pagamento';
  if (/DESC\w*\s+AUTOMATICO\s+ANUD/.test(d)) return 'desconto_anuidade';
  if (/\bANUIDADE\b/.test(d)) return 'anuidade';
  if (/^IOF\b/.test(d)) return 'iof';
  if (valorCent < 0 || /PAGAMENTOS\/CR/i.test(secao)) return 'credito';
  return 'compra';
}

/** O ano da compra: a fatura fecha em AAAA-MM; compra com mês depois do mês do fechamento é do ano anterior. */
export function dataDaCompra(ddmm: string, fechamento: string | null): string {
  const [d, m] = ddmm.split('/').map(Number);
  const [fa, fm] = fechamento ? fechamento.split('-').map(Number) : [new Date().getFullYear(), 12];
  const ano = m > fm ? fa - 1 : fa;
  return `${ano}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function lerFaturaOurocard(linhasDoPdf: readonly string[]): FaturaLida {
  const out: FaturaLida = { produto: null, finalCartao: null, titular: null, vencimento: null, fechamento: null, totalCent: null,
    saldoAnteriorCent: null, linhas: [], somaConfere: false, avisos: [] };
  const linhas = linhasDoPdf.map(l => l.trim()).filter(l => l !== '' && !/^Página \d+\/\d+$/.test(l));

  for (const l of linhas) {
    let m = /^(OUROCARD[^|]*?)\s*\|\s*Final\s+(\d{4})$/i.exec(l);
    if (m && out.finalCartao == null) { out.produto = m[1].trim(); out.finalCartao = m[2]; }
    m = /^(\d{2}\/\d{2}\/\d{4})\s*\|/.exec(l);
    if (m && out.vencimento == null) out.vencimento = iso(m[1]);
    m = /^Fatura fechada em\s*\|\s*(\d{2}\/\d{2}\/\d{4})/.exec(l);
    if (m) out.fechamento = iso(m[1]);
    m = /^Total da Fatura\s*\|\s*R\$\s*(-?[\d.]+,\d{2})$/.exec(l);
    if (m) out.totalCent = centavos(m[1]);
    m = /^SALDO FATURA ANTERIOR\s*\|.*R\$\s*(-?[\d.]+,\d{2})$/.exec(l);
    if (m) out.saldoAnteriorCent = centavos(m[1]);
  }

  const ini = linhas.findIndex(l => /^Data\s*\|\s*Descri/.test(l));
  const fim = linhas.findIndex((l, i) => i > ini && /^Total da Fatura\b/.test(l));
  if (ini < 0 || fim < 0) { out.avisos.push('Não achei a tabela "Lançamentos nesta fatura" (o PDF é de outra fatura?).'); return out; }

  /* o titular e o final: "Nome (Cartão 3146)" antes da tabela (adicional = outro nome mais abaixo) */
  let titular: string | null = null; let finalAtual: string | null = out.finalCartao;
  for (let i = 0; i < ini; i++) { const m = /^(.+?)\s*\(Cartão\s+(\d{4})\)$/.exec(linhas[i]); if (m) { titular = m[1]; finalAtual = m[2]; } }
  out.titular = titular;

  let secao = '';
  for (let i = ini + 1; i < fim; i++) {
    const l = linhas[i];
    const tit = /^(.+?)\s*\(Cartão\s+(\d{4})\)$/.exec(l);
    if (tit) { titular = tit[1]; finalAtual = tit[2]; continue; }
    if (/^SALDO FATURA ANTERIOR\b/.test(l)) continue;
    const anterior = out.linhas[out.linhas.length - 1];
    /* o detalhe da compra no exterior, nas linhas de baixo */
    let m = /^\*{3}\s*\|\s*([\d.]+,\d{2})\s+([A-ZÇÃ ]+)$/.exec(l);
    if (m && anterior) { anterior.exterior = { moeda: m[2].trim(), valorOriginal: m[1], usd: null, cotacao: null }; continue; }
    m = /^equivalente a US\$\s*([\d.]+,\d{2})/i.exec(l);
    if (m && anterior?.exterior) { anterior.exterior.usd = m[1]; continue; }
    m = /^Cotação do Dólar.*R\$\s*([\d.]+,\d+)/i.exec(l);
    if (m && anterior?.exterior) { anterior.exterior.cotacao = m[1]; continue; }
    if (!l.includes('|')) { secao = l; continue; }
    const cel = l.split('|').map(c => c.trim()).filter(c => c !== '');
    const data = /^\d{2}\/\d{2}$/.test(cel[0] ?? '') ? cel[0] : null;
    const valor = RE_VALOR.exec(cel[cel.length - 1] ?? '');
    if (!data || !valor) { out.avisos.push(`Linha não lida: "${l}"`); continue; }
    let meio = cel.slice(1, -1);
    let pais: string | null = null;
    if (meio.length > 1 && /^[A-Z]{2}$/.test(meio[meio.length - 1])) { pais = meio[meio.length - 1]; meio = meio.slice(0, -1); }
    const descricao = meio.join(' ').replace(/\s+/g, ' ').trim();
    const valorCent = centavos(valor[1]);
    const p = /\bPARC\s+(\d{1,2})\/(\d{1,2})\b/i.exec(descricao);
    out.linhas.push({ ordem: out.linhas.length + 1, secao, dataCompra: dataDaCompra(data, out.fechamento), descricao, pais, valorCent,
      parcela: p ? { k: Number(p[1]), n: Number(p[2]) } : null, exterior: null, tipo: tipoDe(descricao, secao, valorCent),
      titular, finalCartao: finalAtual });
  }

  for (const x of out.linhas) if (x.pais && x.pais !== 'BR' && !x.exterior) out.avisos.push(`Compra no exterior sem o detalhe da moeda: "${x.descricao}".`);
  const soma = out.linhas.reduce((s, x) => s + x.valorCent, out.saldoAnteriorCent ?? 0);
  out.somaConfere = out.totalCent != null && soma === out.totalCent;
  if (out.totalCent != null && !out.somaConfere) out.avisos.push(`A soma não fecha: saldo anterior + lançamentos = ${soma}, total da fatura = ${out.totalCent} (centavos).`);
  if (!out.finalCartao) out.avisos.push('Não achei o final do cartão.');
  if (!out.vencimento) out.avisos.push('Não achei o vencimento.');
  return out;
}
