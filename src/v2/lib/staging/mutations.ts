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
  ErroGeracaoStaging,
  ResultadoGeracaoStaging,
  OrigemAprovacaoStaging,
} from './types';
// PR6.2-M0.5 — helper puro soberano para resolução de conta da linha Excel.
// Sem React/hook/side-effect — dependência inter-lib permitida.
import {
  resolverContaPorTexto,
  type ContaBancariaRow,
} from '@/v2/lib/mesa/resolverConta';

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
 * NÃO grava em financeiro_lancamentos_v2 (PR6.2-M1 fará isso via RPC).
 *
 * Cuidados do adendo PR6.1:
 * - Linha sem data_pagamento OU data_competencia → não vira staging, vai pra `erros` (PR6.2-M0.6).
 * - valor sempre via Math.abs (CHECK valor >= 0; sinal carrega natureza)
 * - linhasPorKey indexa pelo snapshot da sessão (sessao.excel_lotes_json)
 *
 * PR6.2-M0.5 (Cenário 2):
 * - Recebe contasBancarias como parâmetro (não faz fetch interno).
 * - Resolve conta da linha Excel via resolverContaPorTexto soberano (PR6.1D-1).
 * - Persiste 4 metadados de auditoria (conta_texto_excel,
 *   conta_resolvida_id, conta_resolvida_score, conta_resolvida_estrategia).
 * - Linha com texto de Conta mas sem resolução → NÃO gera staging,
 *   agrega em erros (motivo 'Conta Excel não reconhecida').
 * - Linha sem texto de Conta (e não-órfã) → mesmo tratamento (motivo
 *   'Linha Excel sem coluna Conta').
 * - Órfãos seguem a mesma regra (tentam resolver; se falha, agrega erro).
 * - conta_bancaria_id continua = aprov.contaId (decisão humana/IA preservada).
 */
export async function gerarStagingDaSessao(
  sessao: MesaSessaoRow,
  pares: MesaParRow[],
  contasBancarias: readonly ContaBancariaRow[],
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
  const erros: ErroGeracaoStaging[] = [];

  elegiveis.forEach((p) => {
    const linha = linhasPorKey.get(p.excel_key);
    const aprov = p.aprovacao_json;
    if (!aprov) return; // type narrow; já filtrado acima

    const ehOrfao = p.decisao === 'excel_orfao';

    // PR6.2-M0.6 — separar data_pagamento (banco/Excel imutável) de data_competencia
    // (decisão contábil do operador). aprov.dataPagamento foi construído no
    // consolidarFotografia com chain OFX → Excel.Data_Ref → Excel.Data_Competencia.
    // Compat retroativa: pares aprovados antes do M0.6 não têm aprov.dataPagamento
    // no aprovacao_json; nesse caso o staging é rejeitado e o operador precisa
    // re-aprovar o par pra regerar aprovacao_json com a chain nova.
    const dataPagamento = aprov.dataPagamento ?? null;
    const dataCompetencia = aprov.dataCompetencia ?? null;

    if (!dataPagamento) {
      erros.push({
        excel_key: p.excel_key,
        motivo: 'Sem data_pagamento — par sem OFX, linha Excel sem Data_Ref nem Data_Competencia, OU par aprovado antes do PR6.2-M0.6 (re-aprovar)',
      });
      return;
    }
    if (!dataCompetencia) {
      erros.push({
        excel_key: p.excel_key,
        motivo: 'Sem data_competencia — operador precisa preencher no painel direito',
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

    // PR6.2-M0.5 — REGRA SOBERANA: resolver conta da linha Excel via helper
    // puro do PR6.1D-1. Falha vira erro agregado, linha não gera staging.
    // raw.Conta é a fonte primária (texto bruto do Excel); contaTexto é a
    // versão canonicalizada do parser (PR6.1A). Usar raw quando disponível.
    const contaTexto = linha.raw?.Conta ?? linha.contaTexto ?? null;
    const contaResolvida = contaTexto
      ? resolverContaPorTexto(contaTexto, contasBancarias)
      : null;

    if (contaTexto && !contaResolvida) {
      erros.push({
        excel_key: p.excel_key,
        motivo: 'Conta Excel não reconhecida',
        conta_texto_excel: contaTexto,
      });
      return;
    }
    if (!ehOrfao && !contaTexto) {
      erros.push({
        excel_key: p.excel_key,
        motivo: 'Linha Excel sem coluna Conta',
        conta_texto_excel: null,
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
      data_pagamento: dataPagamento,         // PR6.2-M0.6: do aprov, chain OFX→Excel.Data_Ref→Excel.Data_Competencia
      data_competencia: dataCompetencia,     // PR6.2-M0.6: do aprov, inclui correção operador
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
      // PR6.2-M0.5 — auditoria soberana da resolução de conta da linha Excel.
      // conta_bancaria_id acima (decisão humana) pode divergir de
      // conta_resolvida_id (verdade objetiva do Excel). RPC fn_promover_staging
      // (PR6.2-M1) rejeitará a divergência.
      conta_texto_excel: contaTexto,
      conta_resolvida_id: contaResolvida?.id ?? null,
      conta_resolvida_score: contaResolvida?.score ?? null,
      conta_resolvida_estrategia: contaResolvida?.estrategia ?? null,
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
