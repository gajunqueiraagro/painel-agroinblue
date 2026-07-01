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

export type ContaMapItem = { textoExcel: string; contaId: string | null; ignorar?: boolean };

export interface ContaDistinta {
  texto: string;
  qtd: number;
  exemplo: ClassificacaoExcelRow;
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

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [lote, setLote] = useState<ClassificacaoParseResult | null>(null);
  const [errosParser, setErrosParser] = useState<Array<{ linha: number; motivo: string }>>([]);
  const [parsing, setParsing] = useState(false);
  const [contaMap, setContaMap] = useState<Record<string, ContaMapItem>>({});

  // Contas distintas do lote (ignora vazio e '-') — idêntico à Mesa antiga.
  const contasDistintas = useMemo<ContaDistinta[]>(() => {
    if (!lote) return [];
    const acc = new Map<string, { qtd: number; exemplo: ClassificacaoExcelRow }>();
    for (const r of lote.rows) {
      for (const txt of [r.conta_origem, r.conta_destino]) {
        const t = txt?.trim();
        if (!t || t === '-') continue;
        const cur = acc.get(t);
        if (cur) cur.qtd++;
        else acc.set(t, { qtd: 1, exemplo: r });
      }
    }
    return [...acc.entries()].map(([texto, v]) => ({ texto, qtd: v.qtd, exemplo: v.exemplo }));
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
    const res = await populate({ sessao_id: novaSessao, rows });
    // A nova sessão precisa aparecer no seletor da Mesa (a staging já é invalidada
    // pelo onSuccess de populate; aqui invalidamos a LISTA de sessões).
    qc.invalidateQueries({ queryKey: ['classificacao-sessoes', clienteId] });
    return { sessaoId: novaSessao, inseridas: res.inseridas, counts: res.counts_por_status ?? {} };
  }

  return {
    arquivo, lote, errosParser, parsing,
    contasDistintas, todasResolvidasOuIgnoradas, contaMap,
    selecionarArquivo, resolverConta, popular, isPopulating, reset,
  };
}
