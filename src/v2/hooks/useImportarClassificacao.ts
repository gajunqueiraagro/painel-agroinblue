// ============================================================================
// useImportarClassificacao — fluxo de importação de Excel de classificação,
// EXTRAÍDO do MesaClassificacaoTab (parse + DE/PARA de conta + populate +
// invalidação). Fonte única reaproveitada pela Mesa antiga e pela Mesa Global.
//
// Escrita: SOMENTE staging (fn_classificacao_populate_staging faz INSERT em
// financeiro_classificacao_staging). NUNCA toca financeiro_lancamentos_v2.
// Sem apply, sem RPC nova, sem edição de Resultado.
// ============================================================================
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  parseExcelClassificacao,
  type ClassificacaoParseResult,
  type ClassificacaoExcelRow,
} from '@/v2/lib/excelPreview/parserClassificacao';
import { useClassificacaoStaging } from '@/v2/hooks/useClassificacaoStaging';
import { resolverContaPorTexto, type ContaResolvivel } from '@/v2/lib/mesa/resolverConta';

export type ContaMapItem = { textoExcel: string; contaId: string | null; ignorar?: boolean };

/**
 * Quem respondeu pela conta — 133g item 8.
 *
 * ⚠ A ORIGEM EXISTE PARA A TELA PODER COLAPSAR O CARD. Sem ela, o diálogo teria de
 * adivinhar se um `contaId` preenchido veio da memória ou do operador, e as duas coisas
 * pedem apresentação diferente: o que a memória resolveu se lê de relance, o que ninguém
 * resolveu ainda pede atenção.
 */
export type OrigemContaResolvida = 'memoria' | 'operador';

export interface ContaDistinta {
  texto: string;
  qtd: number;
  exemplo: ClassificacaoExcelRow;
  /** A data mais antiga entre as linhas desta conta; `null` quando nenhuma tem data. */
  primeiraData: string | null;
  /** A soma dos valores das linhas desta conta. Zero é soma real, não ausência. */
  soma: number;
}

export interface ImportarPopularResult {
  sessaoId: string;
  inseridas: number;
  counts: Record<string, number>;
}

export function useImportarClassificacao(clienteId: string | null | undefined) {
  const qc = useQueryClient();
  // sessaoId=null → a query de staging fica desabilitada; só usamos populate.
  const { populate, isPopulating } = useClassificacaoStaging(null, clienteId);
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null);

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [lote, setLote] = useState<ClassificacaoParseResult | null>(null);
  const [errosParser, setErrosParser] = useState<Array<{ linha: number; motivo: string }>>([]);
  const [parsing, setParsing] = useState(false);
  const [contaMap, setContaMap] = useState<Record<string, ContaMapItem>>({});
  const [origemConta, setOrigemConta] = useState<Record<string, OrigemContaResolvida>>({});

  // Contas distintas do lote (ignora vazio e '-') — idêntico à Mesa antiga.
  const contasDistintas = useMemo<ContaDistinta[]>(() => {
    if (!lote) return [];
    const acc = new Map<string, {
      qtd: number; exemplo: ClassificacaoExcelRow; primeiraData: string | null; soma: number;
    }>();
    for (const r of lote.rows) {
      for (const txt of [r.conta_origem, r.conta_destino]) {
        const t = txt?.trim();
        if (!t || t === '-') continue;
        const cur = acc.get(t);
        /* ⚠ A DATA DE CAIXA VEM PRIMEIRO, e a de competência é o fallback: o cabeçalho do
           card serve para o operador reconhecer o extrato que tem na mão, e o extrato fala
           em pagamento. `null` quando nenhuma das duas existe — traço, nunca uma data
           inventada. */
        const data = r.data_pagamento ?? r.data ?? null;
        const valor = r.valor ?? 0;
        if (cur) {
          cur.qtd++;
          cur.soma += valor;
          if (data && (cur.primeiraData === null || data < cur.primeiraData)) cur.primeiraData = data;
        } else {
          acc.set(t, { qtd: 1, exemplo: r, primeiraData: data, soma: valor });
        }
      }
    }
    return [...acc.entries()].map(([texto, v]) => ({
      texto, qtd: v.qtd, exemplo: v.exemplo, primeiraData: v.primeiraData, soma: v.soma,
    }));
  }, [lote]);

  // Gate: toda conta distinta precisa estar resolvida OU ignorada.
  const todasResolvidasOuIgnoradas = contasDistintas.every((c) => {
    const item = contaMap[c.texto];
    return item?.ignorar || !!item?.contaId;
  });

  function reset() {
    setArquivo(null);
    setLote(null);
    setErrosParser([]);
    setContaMap({});
    setOrigemConta({});
  }

  /**
   * Pré-resolve as contas do lote pela MEMÓRIA do cadastro — 133g item 8.
   *
   * ⚠ SÓ O QUE É CERTO. `resolverContaPorTexto` responde apelido, nome igual e
   * agência+número, e devolve `null` no resto: as camadas de substring viraram sugestão em
   * 133b, depois de resolverem "Cartão Sicredi Lavoura Ag. 0903…" para a conta corrente
   * "Sicredi Lavoura" e mandarem 57 lançamentos de cartão para o lugar errado.
   *
   * ⚠ NUNCA SOBRESCREVE O OPERADOR — mesma doutrina do `mesclarDePara`: quem já respondeu
   * (escolheu uma conta ou mandou ignorar) mantém a resposta, e catálogo que chega depois
   * só preenche o que está vazio.
   *
   * ⚠ IDEMPOTENTE POR CONSTRUÇÃO: sem nada novo a preencher, não chama `setState` — é o que
   * permite chamá-la de um efeito sem laço infinito.
   *
   * @returns quantas contas ficaram resolvidas pela memória nesta chamada.
   */
  function preResolverPelaMemoria(contas: readonly ContaResolvivel[]): number {
    if (contas.length === 0) return 0;
    const novos: Record<string, ContaMapItem> = {};
    const novasOrigens: Record<string, OrigemContaResolvida> = {};
    for (const c of contasDistintas) {
      const jaTem = contaMap[c.texto];
      if (jaTem?.contaId || jaTem?.ignorar) continue;
      const hit = resolverContaPorTexto(c.texto, contas);
      if (!hit) continue;
      novos[c.texto] = { textoExcel: c.texto, contaId: hit.id, ignorar: false };
      novasOrigens[c.texto] = 'memoria';
    }
    const qtd = Object.keys(novos).length;
    if (qtd === 0) return 0;
    setContaMap((prev) => ({ ...prev, ...novos }));
    setOrigemConta((prev) => ({ ...prev, ...novasOrigens }));
    return qtd;
  }

  async function selecionarArquivo(file: File | null): Promise<ClassificacaoParseResult | null> {
    reset();
    if (!file) return null;
    setArquivo(file);
    setParsing(true);
    try {
      const parsed = await parseExcelClassificacao(file);
      setLote(parsed);
      setErrosParser(parsed.erros);
      return parsed;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrosParser([{ linha: 0, motivo: msg }]);
      throw e;
    } finally {
      setParsing(false);
    }
  }

  function resolverConta(texto: string, resolucao: { contaId?: string | null; ignorar?: boolean }) {
    /* Mexeu, é do operador: a pílula "pela memória" some no mesmo gesto em que a escolha
       deixa de ser da memória. */
    setOrigemConta((prev) => ({ ...prev, [texto]: 'operador' }));
    setContaMap((prev) => ({
      ...prev,
      [texto]: {
        textoExcel: texto,
        contaId: resolucao.ignorar ? null : (resolucao.contaId ?? prev[texto]?.contaId ?? null),
        ignorar: resolucao.ignorar ?? false,
      },
    }));
  }

  async function popular(): Promise<ImportarPopularResult | null> {
    if (!lote || !clienteId) return null;
    const novaSessao = crypto.randomUUID();
    // Enriquecer cada row com o UUID resolvido no DE/PARA (idêntico à Mesa antiga);
    // COALESCE no back resolve o restante via fn_classificacao_resolver_conta.
    const rows = lote.rows.map((r) => {
      const o = r.conta_origem?.trim();
      const d = r.conta_destino?.trim();
      const io = o ? contaMap[o] : undefined;
      const id = d ? contaMap[d] : undefined;
      return {
        ...r,
        conta_origem_id: io && !io.ignorar ? io.contaId : null,
        conta_destino_id: id && !id.ignorar ? id.contaId : null,
      };
    });
    const res = await populate({
      sessao_id: novaSessao, rows,
      /* O botão fica em "Populando…" por vários segundos num arquivo de 500 linhas; sem
         contagem, o operador não distingue "trabalhando" de "travado" — e foi assim que a
         falha silenciosa passou por homologação como "o botão não faz nada". */
      onProgresso: (feitas, total) => setProgresso({ feitas, total }),
    });
    setProgresso(null);
    // A nova sessão precisa aparecer no seletor da Mesa (a staging já é invalidada
    // pelo onSuccess de populate; aqui invalidamos a LISTA de sessões).
    qc.invalidateQueries({ queryKey: ['classificacao-sessoes', clienteId] });
    return { sessaoId: novaSessao, inseridas: res.inseridas, counts: res.counts_por_status ?? {} };
  }

  return {
    arquivo, lote, errosParser, parsing,
    contasDistintas, todasResolvidasOuIgnoradas, contaMap, origemConta,
    selecionarArquivo, resolverConta, preResolverPelaMemoria, popular, isPopulating, progresso, reset,
  };
}
