import { supabase } from '@/integrations/supabase/client';
import type {
  MesaSessaoRow,
  MesaParRow,
} from '@/v2/lib/mesaSessao/types';
import type {
  ExcelLinhaNormalizada,
  LoteExcel,
} from '@/v2/lib/excelPreview/types';
import type {
  ResultadoGeracaoStaging,
  OrigemAprovacaoStaging,
} from './types';

/** Mapeia sinal front → sinal banco (string numérica). */
function mapSinalParaBanco(sinalFront: string | undefined | null): '1' | '-1' | '0' | null {
  if (sinalFront === 'entrada') return '1';
  if (sinalFront === 'saida') return '-1';
  if (sinalFront === 'transferencia') return '-1'; // lado pagador
  return null;
}

/** Mapeia sinal front → tipo_operacao banco (sempre PLURAL). */
function mapSinalParaTipoOperacao(
  sinalFront: string | undefined | null,
): '1-Entradas' | '2-Saídas' | '3-Transferências' | null {
  if (sinalFront === 'entrada') return '1-Entradas';
  if (sinalFront === 'saida') return '2-Saídas';
  if (sinalFront === 'transferencia') return '3-Transferências';
  return null;
}

/** Constrói lookup excelKey → ExcelLinhaNormalizada a partir dos lotes. */
function indexarLinhas(excelLotes: LoteExcel[]): Map<string, ExcelLinhaNormalizada> {
  const m = new Map<string, ExcelLinhaNormalizada>();
  excelLotes.forEach((lote) => {
    lote.linhas.forEach((linha) => {
      const key = `${lote.loteId}:${linha.indiceLinha}`;
      m.set(key, linha);
    });
  });
  return m;
}

/**
 * Gera staging a partir dos pares aprovados/excel_orfao da sessão.
 * Idempotente via UNIQUE (sessao_id, excel_key) — re-execução não duplica.
 *
 * NÃO grava em financeiro_lancamentos_v2 (PR6.2 vai cuidar disso).
 *
 * Cuidados do adendo PR6.1:
 * - Linha sem data_pagamento resolvida → não vira staging, vai pra `erros`
 * - valor sempre via Math.abs (CHECK valor >= 0; sinal carrega natureza)
 * - linhasPorKey indexa pelo snapshot da sessão (sessao.excel_lotes_json)
 */
export async function gerarStagingDaSessao(
  sessao: MesaSessaoRow,
  pares: MesaParRow[],
): Promise<ResultadoGeracaoStaging> {
  // Cast: tabela PR6.1 ainda não está nos tipos gerados.
  const sb = supabase as any;

  const linhasPorKey = indexarLinhas(sessao.excel_lotes_json);

  // Filtra elegíveis: aprovado OU excel_orfao, com aprovacao_json
  const elegiveis = pares.filter(
    (p) =>
      (p.decisao === 'aprovado' || p.decisao === 'excel_orfao')
      && p.aprovacao_json !== null,
  );

  if (elegiveis.length === 0) {
    return { gerados: 0, ja_existentes: 0, total_apos: 0, erros: [] };
  }

  // Conta o que já existe antes (idempotência)
  const antesRes = await sb
    .from('mesa_lancamento_staging')
    .select('staging_id', { count: 'exact', head: true })
    .eq('sessao_id', sessao.id);
  const totalAntes = antesRes.count ?? 0;

  const rowsValidas: Array<Record<string, unknown>> = [];
  const erros: Array<{ excel_key: string; motivo: string }> = [];

  elegiveis.forEach((p) => {
    const linha = linhasPorKey.get(p.excel_key);
    const aprov = p.aprovacao_json;
    if (!aprov) return; // type narrow; já filtrado acima

    const ehOrfao = p.decisao === 'excel_orfao';

    // Resolve data com prioridade: correção/aprov manual > linha Excel pag > linha Excel comp > NADA
    const dataPagamento =
      aprov.dataCompetencia
      ?? linha?.dataPagamento
      ?? linha?.dataCompetencia
      ?? null;

    if (!dataPagamento) {
      erros.push({
        excel_key: p.excel_key,
        motivo: 'Sem data_pagamento — linha Excel sem data e operador não corrigiu',
      });
      return;
    }

    if (!linha) {
      erros.push({
        excel_key: p.excel_key,
        motivo: 'Linha Excel não encontrada no snapshot da sessão',
      });
      return;
    }

    // PR6.1B-6 — valorCentavos vem em CENTAVOS do parser. Math.abs primeiro
    // (garantia anti-negativo do CHECK valor >= 0), depois /100 pra obter reais.
    const valorReais = Math.abs(Number(linha.valorCentavos)) / 100;
    if (!Number.isFinite(valorReais)) {
      erros.push({
        excel_key: p.excel_key,
        motivo: 'Valor inválido na linha Excel',
      });
      return;
    }

    rowsValidas.push({
      sessao_id: sessao.id,
      excel_key: p.excel_key,
      cliente_id: sessao.cliente_id,
      fazenda_id: aprov.fazendaId,
      conta_bancaria_id: ehOrfao ? null : aprov.contaId,
      ano_mes: sessao.ano_mes,
      data_pagamento: dataPagamento,
      data_competencia: aprov.dataCompetencia,
      valor: valorReais,
      sinal: mapSinalParaBanco(linha.sinal),
      tipo_operacao: mapSinalParaTipoOperacao(linha.sinal),
      macro_custo: aprov.macro,
      grupo_custo: aprov.grupo,
      centro_custo: aprov.centro,
      subcentro: aprov.subcentro,
      escopo_negocio: null, // PR6.2 resolve via lookup no plano se necessário
      descricao: aprov.descricao ?? linha.observacao ?? null,
      observacao: null,
      favorecido_id: aprov.fornecedorMarcadoNovo ? null : aprov.fornecedorId,
      favorecido_nome_marcado_novo: aprov.fornecedorMarcadoNovo ? aprov.fornecedorNome : null,
      ofx_extrato_id: ehOrfao ? null : aprov.ofxIdVinculado,
      produto: aprov.produto,
      origem_aprovacao: (ehOrfao ? 'excel_orfao' : aprov.origem_aprovacao) as OrigemAprovacaoStaging,
    });
  });

  if (rowsValidas.length > 0) {
    const res = await sb
      .from('mesa_lancamento_staging')
      .upsert(rowsValidas, {
        onConflict: 'sessao_id,excel_key',
        ignoreDuplicates: true,
      })
      .select('staging_id');

    if (res.error) throw res.error;
  }

  // Conta após
  const aposRes = await sb
    .from('mesa_lancamento_staging')
    .select('staging_id', { count: 'exact', head: true })
    .eq('sessao_id', sessao.id);
  const totalApos = aposRes.count ?? 0;

  const gerados = totalApos - totalAntes;
  const jaExistentes = rowsValidas.length - gerados;

  return {
    gerados,
    ja_existentes: jaExistentes,
    total_apos: totalApos,
    erros,
  };
}
