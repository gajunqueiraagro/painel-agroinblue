/**
 * useOperacaoAbate — o detalhe do abate de uma OC, por LOTE e por CENÁRIO.
 *
 * ⚠ ESPELHO DO BOITEL, COM UMA DIFERENÇA ESTRUTURAL: o boitel é UMA linha por
 * operação (`zoo_operacao_boitel`); o abate é UMA POR LOTE (`zoo_operacao_abate`,
 * `UNIQUE(operacao_lote_id, cenario)`). Por isso o payload da RPC é um ARRAY e a
 * gravação dos N lotes acontece numa transação só — salvar lote a lote deixaria a
 * operação num estado que nenhuma tela sabe descrever.
 *
 * ⚠ ESCRITA SÓ PELA RPC. `zoo_operacao_abate` tem UMA policy, de SELECT; sem policy
 * de INSERT/UPDATE o RLS nega por omissão. A leitura por PostgREST funciona e é o
 * que este hook usa. Mesmo desenho de `salvarBoitel`.
 *
 * ⚠ NÃO PASSA POR `useOperacaoComercial.callRpc`, e o motivo é bom: aquele helper é
 * privado ao módulo e usa `(supabase as any).rpc` porque as RPCs antigas não estão
 * no tipo gerado. `oc_salvar_abate` ESTÁ (entrou em `5dc25c58`), então aqui a
 * chamada é tipada e sem cast. O que se reusa de lá é o `OcRpcError` — o erro da
 * família continua sendo um só.
 *
 * ⚠ O LADO DERIVADO NUNCA É GRAVADO. Cada bônus/desconto tem `valor` + `fonte`
 * ('pct' ou 'reais'); o outro lado é derivado na leitura por
 * `buildAbateCalculation`. Gravar os dois criaria duas verdades para o mesmo número
 * e o dia em que discordassem ninguém saberia qual mandava.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { OcRpcError } from '@/hooks/useOperacaoComercial';
import type { Json } from '@/integrations/supabase/types';

export type CenarioAbate = 'projetado' | 'realizado';
/** A unidade em que o operador digitou o número. É ela que manda na leitura. */
export type FonteBonus = 'pct' | 'reais';
/** `outros_descontos` é o único que aceita @ no lugar de %. */
export type FonteOutros = 'reais' | 'arroba';

export interface ValorComFonte<F extends string = FonteBonus> {
  valor: number | null;
  fonte: F | null;
}

/** Uma linha de `zoo_operacao_abate` — o detalhe de UM lote num cenário. */
export interface LinhaAbate {
  operacaoLoteId: string;
  pesoCarcacaKg: number | null;
  rendimentoCarcacaPct: number | null;
  pesoTotalKgNf: number | null;
  precoArroba: number | null;
  bonusPrecoce: ValorComFonte;
  bonusQualidade: ValorComFonte;
  bonusListaTrace: ValorComFonte;
  descontoQualidade: ValorComFonte;
  outrosDescontos: ValorComFonte<FonteOutros>;
  funrural: ValorComFonte;
  valorBaseOverride: number | null;
}

export interface AbateApi {
  /** As linhas do cenário pedido, indexadas por `operacaoLoteId`. */
  linhas: Map<string, LinhaAbate>;
  /** Quais cenários já existem nesta operação — é o que diz se há comparativo. */
  cenarios: CenarioAbate[];
  loading: boolean;
  saving: boolean;
  recarregar: () => Promise<void>;
  /** Grava N lotes numa transação. Devolve a versão nova, ou null se falhou. */
  salvar: (linhas: LinhaAbate[]) => Promise<number | null>;
}

interface Params {
  operacaoId: string | null;
  clienteId: string | null;
  cenario: CenarioAbate;
  /** A versão da OC. O pai é dono único — OC-VERSAO-FONTE-UNICA-01. */
  versao: number | null;
  onVersaoChange?: (v: number) => void;
  enabled: boolean;
}

/** A linha crua como o PostgREST a devolve. */
export interface AbateRow {
  operacao_lote_id: string;
  cenario: string;
  peso_carcaca_kg: number | null;
  rendimento_carcaca_pct: number | null;
  peso_total_kg_nf: number | null;
  preco_arroba: number | null;
  bonus_precoce_valor: number | null;      bonus_precoce_fonte: string | null;
  bonus_qualidade_valor: number | null;    bonus_qualidade_fonte: string | null;
  bonus_lista_trace_valor: number | null;  bonus_lista_trace_fonte: string | null;
  desconto_qualidade_valor: number | null; desconto_qualidade_fonte: string | null;
  outros_descontos_valor: number | null;   outros_descontos_fonte: string | null;
  funrural_valor: number | null;           funrural_fonte: string | null;
  valor_base_override: number | null;
}

const COLUNAS =
  'operacao_lote_id, cenario, peso_carcaca_kg, rendimento_carcaca_pct, peso_total_kg_nf,'
  + ' preco_arroba, bonus_precoce_valor, bonus_precoce_fonte, bonus_qualidade_valor,'
  + ' bonus_qualidade_fonte, bonus_lista_trace_valor, bonus_lista_trace_fonte,'
  + ' desconto_qualidade_valor, desconto_qualidade_fonte, outros_descontos_valor,'
  + ' outros_descontos_fonte, funrural_valor, funrural_fonte, valor_base_override';

const comFonte = (v: number | null, f: string | null): ValorComFonte => ({
  valor: v,
  fonte: f === 'pct' || f === 'reais' ? f : null,
});
const comFonteOutros = (v: number | null, f: string | null): ValorComFonte<FonteOutros> => ({
  valor: v,
  fonte: f === 'reais' || f === 'arroba' ? f : null,
});

export function daLinha(r: AbateRow): LinhaAbate {
  return {
    operacaoLoteId: r.operacao_lote_id,
    pesoCarcacaKg: r.peso_carcaca_kg,
    rendimentoCarcacaPct: r.rendimento_carcaca_pct,
    pesoTotalKgNf: r.peso_total_kg_nf,
    precoArroba: r.preco_arroba,
    bonusPrecoce: comFonte(r.bonus_precoce_valor, r.bonus_precoce_fonte),
    bonusQualidade: comFonte(r.bonus_qualidade_valor, r.bonus_qualidade_fonte),
    bonusListaTrace: comFonte(r.bonus_lista_trace_valor, r.bonus_lista_trace_fonte),
    descontoQualidade: comFonte(r.desconto_qualidade_valor, r.desconto_qualidade_fonte),
    outrosDescontos: comFonteOutros(r.outros_descontos_valor, r.outros_descontos_fonte),
    funrural: comFonte(r.funrural_valor, r.funrural_fonte),
    valorBaseOverride: r.valor_base_override,
  };
}

/**
 * O item do payload da RPC.
 *
 * ⚠ CAMPO AUSENTE É PRESERVADO PELO BANCO, campo `null` é APAGADO. Por isso o
 * montador só inclui o par `{valor, fonte}` quando há valor: mandar
 * `bonus_precoce_valor: null` num salvamento parcial apagaria o bônus que o
 * operador digitou noutra aba.
 */
export function paraPayload(l: LinhaAbate): Record<string, Json | undefined> {
  const p: Record<string, Json | undefined> = { operacao_lote_id: l.operacaoLoteId };
  const num = (chave: string, v: number | null) => { if (v !== null) p[chave] = v; };
  const par = (prefixo: string, v: ValorComFonte<string>) => {
    if (v.valor === null) return;
    p[`${prefixo}_valor`] = v.valor;
    /* ⚠ A FONTE VAI JUNTO SEMPRE. A RPC recusa `_valor` sem `_fonte` — e recusa
       certo: sem a unidade, a leitura não sabe se 3 é três por cento ou três reais. */
    p[`${prefixo}_fonte`] = v.fonte;
  };
  num('peso_carcaca_kg', l.pesoCarcacaKg);
  num('rendimento_carcaca_pct', l.rendimentoCarcacaPct);
  num('peso_total_kg_nf', l.pesoTotalKgNf);
  num('preco_arroba', l.precoArroba);
  num('valor_base_override', l.valorBaseOverride);
  par('bonus_precoce', l.bonusPrecoce);
  par('bonus_qualidade', l.bonusQualidade);
  par('bonus_lista_trace', l.bonusListaTrace);
  par('desconto_qualidade', l.descontoQualidade);
  par('outros_descontos', l.outrosDescontos);
  par('funrural', l.funrural);
  return p;
}

/** O envelope de `oc_salvar_abate`, no formato da família. */
interface AbateEnvelope {
  ok: boolean;
  operacao_id: string;
  versao: number;
  cenario: string;
  lotes_gravados: number;
  abate_ids: string[];
  cenarios: string[];
}

export function useOperacaoAbate({
  operacaoId, clienteId, cenario, versao, onVersaoChange, enabled,
}: Params): AbateApi {
  const [linhas, setLinhas] = useState<Map<string, LinhaAbate>>(new Map());
  const [cenarios, setCenarios] = useState<CenarioAbate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const recarregar = useCallback(async () => {
    if (!operacaoId || !clienteId || !enabled) {
      setLinhas(new Map());
      setCenarios([]);
      return;
    }
    setLoading(true);
    try {
      /* Traz OS DOIS cenários numa consulta: a existência do segundo é o que diz à
         tela se há comparativo, e perguntar duas vezes por isso seria uma ida a mais
         para responder algo que já veio. */
      const { data, error } = await supabase
        .from('zoo_operacao_abate')
        .select(COLUNAS)
        .eq('operacao_id', operacaoId)
        .eq('cliente_id', clienteId);
      if (error) throw error;
      const todas = (data ?? []) as unknown as AbateRow[];
      const doCenario = new Map<string, LinhaAbate>();
      const vistos = new Set<CenarioAbate>();
      for (const r of todas) {
        if (r.cenario === 'projetado' || r.cenario === 'realizado') vistos.add(r.cenario);
        if (r.cenario === cenario) doCenario.set(r.operacao_lote_id, daLinha(r));
      }
      setLinhas(doCenario);
      setCenarios([...vistos].sort());
    } finally {
      setLoading(false);
    }
  }, [operacaoId, clienteId, cenario, enabled]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  const salvar = useCallback(async (novas: LinhaAbate[]): Promise<number | null> => {
    if (!operacaoId || !clienteId || versao === null) return null;
    /* ⚠ ARRAY VAZIO NÃO VAI AO BANCO. A RPC o recusa — salvar nada não é salvar —,
       e gastar uma ida para receber a recusa seria pedir o erro de propósito. */
    if (novas.length === 0) return null;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('oc_salvar_abate', {
        p_operacao_id: operacaoId,
        p_cliente_id: clienteId,
        p_versao_esperada: versao,
        p_cenario: cenario,
        p_lotes: novas.map(paraPayload),
      });
      if (error) throw new OcRpcError(error.message || 'Falha ao salvar o abate.', error.code);
      const env = data as unknown as AbateEnvelope;
      /* ⚠ A VERSÃO VOLTA PARA O PAI, que é o dono único. Guardá-la aqui criaria a
         segunda cópia e a próxima chamada levaria a errada — 40001 sem pista. */
      if (env?.versao != null) onVersaoChange?.(env.versao);
      await recarregar();
      return env?.versao ?? null;
    } finally {
      setSaving(false);
    }
  }, [operacaoId, clienteId, versao, cenario, onVersaoChange, recarregar]);

  return { linhas, cenarios, loading, saving, recarregar, salvar };
}
