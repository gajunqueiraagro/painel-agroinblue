/**
 * FIXTURE REAL — sessão 8d6efeb7 (NJ Pecuária, Imp 03, set/2026), conta Banco do Brasil (3b9afa7a), dia 01/09/2026.
 * PR-CONC-ENRIQUECER-V2-01.
 *
 * ⚠ COPIADO DO BANCO PROTO em 01/10/2026: as 10 linhas da planilha de `vw_classificacao_staging_preview` com pagamento
 *   em 01/09 nesta conta, e os 10 lançamentos realizados da conta no dia (o lado `sistema_completo` de
 *   `fn_extratos_espelhados`, lido direto de `financeiro_lancamentos_v2` porque o canal de leitura não executa a RPC).
 *   Ids encurtados aos 8 primeiros caracteres.
 * ⚠ É O CASO REAL DO ↳: as duas linhas "Telefone · TELEFONICA BRASIL S.A." de 506,51 foram casadas pelo motor com o
 *   MESMO lançamento (8ebd63d4), e o segundo "Vivo Casa" de 506,51 (e7970f00, manual) ficou só no sistema. Lançamentos
 *   iguais são normais na pecuária (CLAUDE.md) — o que o fixture mostra é o par, não uma duplicata.
 * ⚠ O STATUS VEM COMO O BANCO O GRAVA ('ja_aplicado'), e por isso as linhas entram pelo JSON: o tipo `MatchStatus`
 *   declara 5 dos 13 status (dívida registrada em `parteDeAgrupamento`), e o fixture não pode trocar o dado para caber.
 */
import type { ClassificacaoStagingPreviewRow } from '@/v2/hooks/useClassificacaoStaging';
import type { EspelhadosReais, EspSis } from '@/components/financeiro-v2/EspelhoConciliacaoTab';
import { linhaCrua } from './linhaCrua.fixture';

export const CONTA_BB = '3b9afa7a';

const STAGING_JSON = `[
{"staging_id":"6d4f80f7","match_status":"exato","excel_data":"2026-01-01","excel_data_pagamento":"2026-09-01","excel_valor":24000,"excel_tipo_operacao":"2-Saídas","excel_subcentro":"Pró-Labore","excel_fornecedor":"Natalino Cavalli Junior","lanc_id":"f22ec415","lanc_sinal":"-1","lanc_valor":24000,"lanc_tipo_operacao":"2-Saídas","lanc_origem_lancamento":"extrato","lanc_plano_conta_id_atual":"d7602dd8"},
{"staging_id":"7f870649","match_status":"ja_classificado","excel_data":"2026-09-10","excel_data_pagamento":"2026-09-01","excel_valor":2551.95,"excel_tipo_operacao":"2-Saídas","excel_subcentro":"Seguro de vida pessoal","excel_fornecedor":"Banco do Brasil","lanc_id":"4f0cc97c","lanc_sinal":"-1","lanc_valor":2551.95,"lanc_tipo_operacao":"2-Saídas","lanc_origem_lancamento":"recorrencia","lanc_plano_conta_id_atual":"18389da2"},
{"staging_id":"9fd050ed","match_status":"ja_aplicado","excel_data":"2026-09-01","excel_data_pagamento":"2026-09-01","excel_valor":506.51,"excel_tipo_operacao":"2-Saídas","excel_subcentro":"Telefone","excel_fornecedor":"TELEFONICA BRASIL S.A.","lanc_id":"8ebd63d4","lanc_sinal":"-1","lanc_valor":506.51,"lanc_tipo_operacao":"2-Saídas","lanc_origem_lancamento":"extrato","lanc_plano_conta_id_atual":"d7602dd8"},
{"staging_id":"547a04fa","match_status":"ja_aplicado","excel_data":"2026-09-01","excel_data_pagamento":"2026-09-01","excel_valor":506.51,"excel_tipo_operacao":"2-Saídas","excel_subcentro":"Telefone","excel_fornecedor":"TELEFONICA BRASIL S.A.","lanc_id":"8ebd63d4","lanc_sinal":"-1","lanc_valor":506.51,"lanc_tipo_operacao":"2-Saídas","lanc_origem_lancamento":"extrato","lanc_plano_conta_id_atual":"d7602dd8"},
{"staging_id":"8af51a4b","match_status":"ja_aplicado","excel_data":"2026-09-04","excel_data_pagamento":"2026-09-01","excel_valor":480,"excel_tipo_operacao":"2-Saídas","excel_subcentro":"Mão de Obra Permanente / Folha","excel_fornecedor":"Paulo Henrique Pereira","lanc_id":"a8a293f3","lanc_sinal":"-1","lanc_valor":480,"lanc_tipo_operacao":"2-Saídas","lanc_origem_lancamento":"extrato","lanc_plano_conta_id_atual":"3f4c35c3"},
{"staging_id":"06689028","match_status":"ja_aplicado","excel_data":"2026-09-01","excel_data_pagamento":"2026-09-01","excel_valor":260.95,"excel_tipo_operacao":"2-Saídas","excel_subcentro":"Seguro Benfeitorias","excel_fornecedor":"HDI SEGUROS S.A.","lanc_id":"a6df103e","lanc_sinal":"-1","lanc_valor":260.95,"lanc_tipo_operacao":"2-Saídas","lanc_origem_lancamento":"extrato","lanc_plano_conta_id_atual":"073fa7d0"},
{"staging_id":"a1634f08","match_status":"ja_aplicado","excel_data":"2026-09-01","excel_data_pagamento":"2026-09-01","excel_valor":260.32,"excel_tipo_operacao":"2-Saídas","excel_subcentro":"Outros Impostos e Taxas","excel_fornecedor":"DNIT","lanc_id":"6445d9f9","lanc_sinal":"-1","lanc_valor":260.32,"lanc_tipo_operacao":"2-Saídas","lanc_origem_lancamento":"extrato","lanc_plano_conta_id_atual":"1be3bf99"},
{"staging_id":"4e12b947","match_status":"ja_aplicado","excel_data":"2026-09-01","excel_data_pagamento":"2026-09-01","excel_valor":135.92,"excel_tipo_operacao":"2-Saídas","excel_subcentro":"Outros Impostos e Taxas","excel_fornecedor":"Detran - MS","lanc_id":"5c29f6b8","lanc_sinal":"-1","lanc_valor":135.92,"lanc_tipo_operacao":"2-Saídas","lanc_origem_lancamento":"extrato","lanc_plano_conta_id_atual":"a8f17eb5"},
{"staging_id":"f9d0ba02","match_status":"ja_aplicado","excel_data":"2026-05-05","excel_data_pagamento":"2026-09-01","excel_valor":83.75,"excel_tipo_operacao":"2-Saídas","excel_subcentro":"Manutenção Benfeitorias - Produtos","excel_fornecedor":"LINEAGRO PRODUTOS AGROPECUARIOS S.A","lanc_id":"91a4da9a","lanc_sinal":"-1","lanc_valor":83.75,"lanc_tipo_operacao":"2-Saídas","lanc_origem_lancamento":"extrato","lanc_plano_conta_id_atual":"cdf2efa2"},
{"staging_id":"8f962068","match_status":"ja_aplicado","excel_data":"2026-09-01","excel_data_pagamento":"2026-09-01","excel_valor":31.8,"excel_tipo_operacao":"2-Saídas","excel_subcentro":"Escritório","excel_fornecedor":"PAPELARIA FRADELLI LTDA","lanc_id":"ddc348df","lanc_sinal":"-1","lanc_valor":31.8,"lanc_tipo_operacao":"2-Saídas","lanc_origem_lancamento":"extrato","lanc_plano_conta_id_atual":"47764d91"}
]`;

export function stagingBB0109(): ClassificacaoStagingPreviewRow[] {
  const linhas: Array<Partial<ClassificacaoStagingPreviewRow>> = JSON.parse(STAGING_JSON);
  return linhas.map((l) => linhaCrua({
    ...l, sessao_id: '8d6efeb7', conta_filtro_id: CONTA_BB, conta_filtro_nome: 'Banco do Brasil',
    lanc_conta_bancaria_id: CONTA_BB, lanc_conta_bancaria_nome: 'Banco do Brasil',
  }));
}

const sis = (lancamento_id: string, descricao: string, valor_assinado: number, fornecedor: string, origem_lancamento: string, subcentro: string): EspSis => ({
  lancamento_id, data: '2026-09-01', descricao, centro: null, subcentro, valor_assinado, sinal: '-1',
  status: 'conciliado', fornecedor, origem_lancamento,
});

export function espelhoBB0109(): EspelhadosReais {
  return {
    escopo: { cliente_id: 'nj', conta_id: CONTA_BB, ano_mes: '2026-09', nome_conta: 'Banco do Brasil' },
    saldos: { inicial: null, final_oficial: null, periodo_ini: null, periodo_fim: null, extrato_ini: null, extrato_fim: null },
    ofx_completo: [],
    sistema_completo: [
      sis('f22ec415', 'Dividendos Despesas Pessoais', -24000, 'Natalino Cavalli Junior', 'extrato', 'Dividendos Despesas Pessoais'),
      sis('4f0cc97c', 'Seguro de Vida - Ouro Vida', -2551.95, 'Banco do Brasil S.A. (001)', 'recorrencia', 'Benefícios e Premiações Administrativo'),
      sis('8ebd63d4', 'Vivo Casa', -506.51, 'Telefonica Brasil S.A.', 'extrato', 'Dividendos Despesas Pessoais'),
      sis('e7970f00', 'Vivo Casa', -506.51, 'Telefonica Brasil S.A.', 'manual', 'Dividendos Despesas Pessoais'),
      sis('a8a293f3', 'Folha Pagamento', -480, 'Paulo Henrique Pereira', 'extrato', 'Salários e Encargos Pecuária'),
      sis('a6df103e', 'Seguro Escritorio Garças', -260.95, 'HDI SEGUROS S.A.', 'extrato', 'Despesas de Escritório'),
      sis('6445d9f9', 'Outros Impostos e Taxas', -260.32, 'DNIT', 'extrato', 'Taxas e Impostos Fixos Pecuária'),
      sis('5c29f6b8', 'Multas', -135.92, 'Detran MS', 'extrato', 'Seguro e Impostos Veículos Administrativo'),
      sis('91a4da9a', 'Ferramentas x/4', -83.75, 'Lineagro Produtos Agropecuários SA', 'extrato', 'Manutenção de Instalações Pecuária'),
      sis('ddc348df', 'Materiais Escritorio', -31.8, 'PAPELARIA FRADELLI LTDA', 'extrato', 'Materiais de Escritório'),
    ],
    vinculos: [],
    sistema_candidatos: [],
    versao: 'fixture-8d6efeb7', gerado_em: '2026-10-01T00:00:00Z',
  };
}
