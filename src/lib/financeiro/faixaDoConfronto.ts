/**
 * FIN-DOC-SOMA-01 (Gabriel 19/10/2026) — o que a faixa do topo da aba Documentos escreve, a partir do confronto do banco.
 *
 * ⚠ NÃO FAZ CONTA: os números e os vereditos (fecha / falta / passa, confere / difere, a nota repetida) vêm prontos de
 * `fin_documento_confronto`; aqui só se escolhe a frase. Uma frase por assunto, nesta ordem: a nota (o que soma), cada
 * pagamento (boleto, comprovante: conferido à parte, não soma) e cada nota repetida.
 */
import type { Confronto, ConfrontoFiscal, ConfrontoPagamento } from '@/hooks/useLancamentoDocumentos';
import { formatMoeda } from '@/lib/calculos/formatters';

export type TomDaFaixa = 'ok' | 'difere' | 'aviso';
export interface PedacoDaFaixa {
  /** o que foi conferido, com os valores ("Nota fiscal R$ 9.000,00 · parcelas da compra somam R$ 9.000,00") */
  texto: string;
  /** o veredito, na cor do tom ("✓ fecha", "falta R$ 10,00", "cancele uma") */
  veredito: string;
  tom: TomDaFaixa;
  chave: string;
}

export function rotuloFiscal(f: ConfrontoFiscal): string {
  if (f.recibos === f.qtd) return f.qtd === 1 ? 'Recibo' : `${f.qtd} recibos`;
  if (f.recibos === 0) return f.qtd === 1 ? 'Nota fiscal' : `${f.qtd} notas fiscais`;
  return `${f.qtd} documentos fiscais`;
}

/** "falta R$ x" (documentado abaixo da base) / "passa R$ x" (acima) — o sinal é o da diferença do banco. */
function falta(f: ConfrontoFiscal): string {
  return `${f.situacao === 'falta' ? 'falta' : 'passa'} ${formatMoeda(Math.abs(f.diferenca))}`;
}

export function pedacoFiscal(f: ConfrontoFiscal, valorLancamento: number): PedacoDaFaixa {
  const doc = `${rotuloFiscal(f)} ${formatMoeda(f.total)}`;
  const fecha = f.situacao === 'fecha';
  if (f.base === 'contrato') {
    return { chave: 'fiscal', texto: `${doc} · parcelas da compra somam ${formatMoeda(f.baseValor)}`,
      veredito: fecha ? '✓ fecha' : falta(f), tom: fecha ? 'ok' : 'difere' };
  }
  if (f.base === 'grupo') {
    return { chave: 'fiscal', texto: `${doc} · ${f.baseQtd} ${f.baseQtd === 1 ? 'parcela ativa soma' : 'parcelas ativas somam'} ${formatMoeda(f.baseValor)}`,
      veredito: fecha ? '✓ fecha' : falta(f), tom: fecha ? 'ok' : 'difere' };
  }
  if (fecha) return { chave: 'fiscal', texto: doc, veredito: '✓ confere com o lançamento', tom: 'ok' };
  return { chave: 'fiscal', texto: `${doc} · lançamento ${formatMoeda(valorLancamento)}`, veredito: falta(f), tom: 'difere' };
}

export function pedacoPagamento(p: ConfrontoPagamento): PedacoDaFaixa {
  const rotulo = p.especie === 'comprovante' ? 'Comprovante' : 'Boleto';
  return { chave: `pag-${p.documentoId}`, texto: `${rotulo} ${formatMoeda(p.valor)}`,
    veredito: p.confere ? '✓ confere' : `difere ${formatMoeda(Math.abs(p.diferenca))}`, tom: p.confere ? 'ok' : 'difere' };
}

/** Nulo = ainda não se perguntou ao banco (a faixa diz "—"); lista vazia = nada com valor a conferir. */
export function faixaDoConfronto(c: Confronto | null): PedacoDaFaixa[] | null {
  if (!c) return null;
  const pedacos: PedacoDaFaixa[] = [];
  if (c.fiscal) pedacos.push(pedacoFiscal(c.fiscal, c.valorLancamento));
  for (const p of c.pagamentos) pedacos.push(pedacoPagamento(p));
  for (const r of c.repetidas) {
    pedacos.push({ chave: `rep-${r.numero}`, texto: `nota ${r.numero} registrada ${r.vezes} vezes`, veredito: '— cancele uma', tom: 'aviso' });
  }
  return pedacos;
}
