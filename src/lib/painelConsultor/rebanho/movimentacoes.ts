/**
 * Função pura montarMovimentacoes.
 *
 * Recebe lancPec (mesmo array que useLancamentos retorna,
 * Lancamento[] camelCase de src/types/cattle.ts) e devolve a
 * quebra das movimentações em 4 naturezas para o recorte
 * (ano + mes + viewMode).
 *
 * Filtros aplicados aqui (lancPec já vem com cancelado=false e
 * cenario='realizado' pelo useLancamentos):
 *   - data dentro do recorte:
 *       viewMode='mes'     → data no mês indicado
 *       viewMode='periodo' → data entre Jan e mes inclusivo
 *
 * Mapeamento natureza:
 *   operacional → abate, venda, consumo
 *   patrimonial → compra, nascimento
 *   perdas      → morte
 *   tecnica     → transferencia_saida, transferencia_entrada,
 *                 reclassificacao
 *
 * IMPORTANTE — TRANSFERÊNCIAS EM MODO GLOBAL:
 *   Em modo Global, transferencia_saida e transferencia_entrada
 *   podem representar o mesmo evento espelhado (animais que saem
 *   de uma fazenda e entram em outra do mesmo cliente).
 *   Esta camada NÃO desduplica. Expõe ambos os tipos crus, exatamente
 *   como vêm da base. Quem consome a semantic layer decide como
 *   tratar (típico: descontar uma das pernas, exibir como volume
 *   bruto de movimentação interna, etc).
 *
 * VALOR FINANCEIRO:
 *   valorTotal por tipo = soma de valorTotal de cada lançamento.
 *   Retorna null quando nenhum lançamento do tipo tem valor preenchido.
 *   Na prática só abate, venda e compra populam este campo de forma
 *   confiável. Demais tipos retornam null.
 *
 * Sem query, sem efeito colateral, função pura.
 */
import type { Lancamento, TipoMovimentacao } from '@/types/cattle';
import type {
  Movimentacoes,
  MovimentacaoPorTipo,
  MovimentacaoPorNatureza,
  NaturezaMovimentacao,
} from './types';

const NATUREZA_DE_TIPO: Record<TipoMovimentacao, NaturezaMovimentacao> = {
  abate:                   'operacional',
  venda:                   'operacional',
  consumo:                 'operacional',
  compra:                  'patrimonial',
  nascimento:              'patrimonial',
  morte:                   'perdas',
  transferencia_saida:     'tecnica',
  transferencia_entrada:   'tecnica',
  reclassificacao:         'tecnica',
};

const NATUREZAS_ORDEM: NaturezaMovimentacao[] = [
  'operacional', 'patrimonial', 'perdas', 'tecnica',
];

interface MontarMovimentacoesArgs {
  lancPec:  Lancamento[] | null | undefined;
  ano:      number;
  mes:      number;                   // 1..12
  viewMode: 'mes' | 'periodo';
}

/** Extrai ano (4 dígitos) de data 'YYYY-MM-DD'. null se inválido. */
function extraiAno(data: string): number | null {
  if (!data || data.length < 10) return null;
  const y = parseInt(data.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

/** Extrai mês (1..12) de data 'YYYY-MM-DD'. null se inválido. */
function extraiMes(data: string): number | null {
  if (!data || data.length < 10) return null;
  const m = parseInt(data.slice(5, 7), 10);
  if (!Number.isFinite(m) || m < 1 || m > 12) return null;
  return m;
}

export function montarMovimentacoes({
  lancPec,
  ano,
  mes,
  viewMode,
}: MontarMovimentacoesArgs): Movimentacoes | null {
  if (!lancPec || lancPec.length === 0) return null;
  if (mes < 1 || mes > 12) return null;

  // 1. Filtro de recorte temporal sobre data (cancelado/cenario já vêm
  //    aplicados pelo useLancamentos upstream).
  const filtrados = lancPec.filter((l) => {
    if (!l.data) return false;
    const a = extraiAno(l.data);
    const m = extraiMes(l.data);
    if (a !== ano) return false;
    if (m == null) return false;
    if (viewMode === 'mes') return m === mes;
    return m >= 1 && m <= mes;
  });

  if (filtrados.length === 0) {
    // Recorte vazio — retorna estrutura com 4 naturezas zeradas (não null)
    // para a Leitura Executiva poder iterar com segurança.
    const porNatureza: MovimentacaoPorNatureza[] = NATUREZAS_ORDEM.map((nat) => ({
      natureza: nat, ops: 0, cabecas: 0, pesoTotalKg: 0,
      valorTotal: null, tiposPresentes: [],
    }));
    return {
      porTipo: [],
      porNatureza,
      totais: { ops: 0, cabecas: 0, pesoTotalKg: 0 },
    };
  }

  // 2. Agregação por TIPO.
  interface AcumTipo {
    tipo:          TipoMovimentacao;
    ops:           number;
    cabecas:       number;
    pesoTotalKg:   number;
    valorAcum:     number;
    temAlgumValor: boolean;
  }
  const mapaTipo = new Map<TipoMovimentacao, AcumTipo>();

  for (const l of filtrados) {
    const t = l.tipo as TipoMovimentacao;
    if (!NATUREZA_DE_TIPO[t]) continue; // tipo desconhecido — pular defensivamente

    let acc = mapaTipo.get(t);
    if (!acc) {
      acc = {
        tipo: t, ops: 0, cabecas: 0, pesoTotalKg: 0,
        valorAcum: 0, temAlgumValor: false,
      };
      mapaTipo.set(t, acc);
    }

    acc.ops      += 1;
    acc.cabecas  += Number(l.quantidade) || 0;
    acc.pesoTotalKg += Number(l.pesoTotal) || 0;

    const v = l.valorTotal;
    if (v != null && Number.isFinite(v) && v !== 0) {
      acc.valorAcum     += Number(v);
      acc.temAlgumValor  = true;
    }
  }

  // 3. Materializa porTipo ordenado por ops DESC.
  const porTipo: MovimentacaoPorTipo[] = Array.from(mapaTipo.values())
    .map((a) => ({
      tipo:        a.tipo,
      natureza:    NATUREZA_DE_TIPO[a.tipo],
      ops:         a.ops,
      cabecas:     a.cabecas,
      pesoTotalKg: a.pesoTotalKg,
      valorTotal:  a.temAlgumValor ? a.valorAcum : null,
    }))
    .sort((x, y) => y.ops - x.ops);

  // 4. Agregação por NATUREZA (sempre 4, ordem fixa).
  const porNatureza: MovimentacaoPorNatureza[] = NATUREZAS_ORDEM.map((nat) => {
    const itens = porTipo.filter((p) => p.natureza === nat);
    if (itens.length === 0) {
      return {
        natureza: nat, ops: 0, cabecas: 0, pesoTotalKg: 0,
        valorTotal: null, tiposPresentes: [],
      };
    }
    const ops         = itens.reduce((s, i) => s + i.ops, 0);
    const cabecas     = itens.reduce((s, i) => s + i.cabecas, 0);
    const pesoTotalKg = itens.reduce((s, i) => s + i.pesoTotalKg, 0);

    const valoresNaoNulos = itens
      .map((i) => i.valorTotal)
      .filter((v): v is number => v != null);
    const valorTotal = valoresNaoNulos.length > 0
      ? valoresNaoNulos.reduce((s, v) => s + v, 0)
      : null;

    return {
      natureza: nat, ops, cabecas, pesoTotalKg, valorTotal,
      tiposPresentes: itens.map((i) => i.tipo),
    };
  });

  // 5. Totais gerais (todas naturezas somadas).
  const totais = {
    ops:         porTipo.reduce((s, i) => s + i.ops, 0),
    cabecas:     porTipo.reduce((s, i) => s + i.cabecas, 0),
    pesoTotalKg: porTipo.reduce((s, i) => s + i.pesoTotalKg, 0),
  };

  return { porTipo, porNatureza, totais };
}
