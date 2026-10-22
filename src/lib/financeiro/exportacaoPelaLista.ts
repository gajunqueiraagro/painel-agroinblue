/**
 * FIN-V2-LISTA-FLAG-01 (parte 3) — a exportacao da lista sai da MESMA RPC da tela (`fn_fin_v2_lista_pagina`), pagina a pagina: o
 * arquivo e' o que a tela mostra (filtros, ordem, modo sem caixa), e o lancamento DIVIDIDO (FIN-CLASSIF-DIVIDIDA-01a) sai pela parte:
 *   - filtrado por uma conta (casam N de M partes): uma linha por parte que casa — o valor e a classificacao da PARTE, o total do
 *     lancamento numa coluna e "N de M contas";
 *   - sem filtro de classificacao (casam todas): uma linha, valor cheio, "dividido em M contas".
 * Lancamento sem divisao: a linha como veio.
 *
 * A leitura falha FECHADA como a do conjunto antigo: total que muda entre paginas ou id repetido = `ErroConjuntoObsoleto`; acima do teto
 * = `ErroConjuntoIncompleto`, antes de ler a segunda pagina. Nunca um arquivo parcial.
 */
import type { LancamentoV2 } from '@/hooks/useFinanceiroV2';
import { lerLinhasV2 } from './listaPaginaV2';
import { ErroConjuntoIncompleto, ErroConjuntoObsoleto } from './listaPaginadaV2';

export interface ParteDaLinhaV2 {
  ordem: number; valor: number; percentual?: number | null; plano_conta_id?: string | null;
  macro_custo: string | null; grupo_custo: string | null; centro_custo: string | null; subcentro: string | null;
  escopo_negocio: string | null; safra_id: string | null; cultura?: string | null;
}
export type LinhaDeExportacao = LancamentoV2 & { total_lancamento?: number | null; divisao?: string | null };

/** Pede uma pagina da RPC da lista (so' linhas); devolve a resposta crua. */
export type PedirPaginaDaLista = (pagina: number, porPagina: number) => Promise<unknown>;

/** A RPC aceita 1..500 por pagina (`por_pagina fora de 1..500`): o lote da exportacao e' o maximo dela. */
export const LOTE_EXPORTACAO = 500;
export const TETO_EXPORTACAO = 200_000;

export async function lerListaInteira(pedir: PedirPaginaDaLista,
  opcoes: { porPagina?: number; teto?: number } = {}): Promise<LancamentoV2[]> {
  const porPagina = opcoes.porPagina ?? LOTE_EXPORTACAO;
  const teto = opcoes.teto ?? TETO_EXPORTACAO;
  const vistos = new Set<string>();
  const linhas: LancamentoV2[] = [];
  let total: number | null = null;
  for (let pagina = 0; ; pagina++) {
    const r = lerLinhasV2(await pedir(pagina, porPagina));
    if (!r) throw new Error('Não foi possível ler a lista para exportar. Tente de novo.');
    if (total === null) {
      total = r.total;
      if (total > teto) {
        throw new ErroConjuntoIncompleto(`O conjunto tem ${total} registros e excede o limite de ${teto} desta operação. `
          + 'Nada foi gerado. Estreite o filtro e tente de novo.');
      }
    } else if (r.total !== total) {
      throw new ErroConjuntoObsoleto();
    }
    for (const l of r.linhas) {
      if (vistos.has(l.id)) throw new ErroConjuntoObsoleto();
      vistos.add(l.id);
      linhas.push(l);
    }
    if (linhas.length >= total || r.linhas.length < porPagina) break;
  }
  if (linhas.length !== total) throw new ErroConjuntoObsoleto();
  return linhas;
}

const campo = (l: object, k: string): unknown => Reflect.get(l, k);

/** O lancamento dividido aberto para a exportacao (as regras no topo do arquivo). */
export function abrirDivididasParaExportar(linhas: readonly LancamentoV2[]): LinhaDeExportacao[] {
  const out: LinhaDeExportacao[] = [];
  for (const l of linhas) {
    const total = Number(campo(l, 'partes_total') ?? 0);
    const casadas = Number(campo(l, 'partes_casadas') ?? 0);
    const brutas = campo(l, 'partes');
    const partes = Array.isArray(brutas) ? (brutas as ParteDaLinhaV2[]) : [];
    if (!(total > 1)) { out.push(l); continue; }
    if (casadas >= total || partes.length === 0) {
      out.push({ ...l, total_lancamento: null, divisao: `dividido em ${total} contas` });
      continue;
    }
    const sinal = Math.sign(Number(l.valor)) || 1;
    for (const p of partes) {
      out.push({
        ...l,
        valor: sinal * Number(p.valor),
        macro_custo: p.macro_custo, grupo_custo: p.grupo_custo, centro_custo: p.centro_custo, subcentro: p.subcentro,
        escopo_negocio: p.escopo_negocio, safra_id: p.safra_id,
        total_lancamento: Number(l.valor),
        divisao: `${casadas} de ${total} contas`,
      });
    }
  }
  return out;
}
