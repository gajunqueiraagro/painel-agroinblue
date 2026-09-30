/**
 * O PREFILL DO "DUPLICAR" — PR-FIN-DUPLICAR-ABRE-MODAL-01 (decisão do Gabriel, 30/09).
 *
 * ⚠ DUPLICAR NÃO GRAVA MAIS NADA. Ele abre o `LancamentoV2Dialog` em modo NOVO com os dados do original, e a cópia só
 * existe se o operador salvar. O caminho antigo (`duplicarLancamento`, um `insert` direto) gravava na hora e errava a
 * cópia: não levava o vencimento (a "(Cópia) Vivo Casa" do NJ, 30/09 11:16, sumiu da lista com "Data por: Financeira"),
 * nem a chave do plano, a safra, a cultura e a fase; e levava o pagamento, com o status forçado a previsto.
 *
 * ⚠ ESTA FUNÇÃO É O MAPEAMENTO, e só ele (tipo + mapeamento + hidratação são os três lugares da lição CAMPO-NOS-TRES):
 *   - COPIA: fazenda, competência, VENCIMENTO, valor, tipo, status, descrição (SEM "(Cópia)"), documento e tipo,
 *     fornecedor, a classificação inteira (plano, macro, grupo, centro, subcentro, safra, cultura, fase, atividade),
 *     observação, forma e dados de pagamento, e a conta PELA DIREÇÃO.
 *   - NÃO COPIA: id, `data_pagamento` (só realizado tem pagamento, e a data é a de cada pagamento — a pendência do dialog
 *     cobra no Salvar), origem/importação/extrato, recorrência/parcela/pai, vínculos e auditoria. A cópia é um lançamento
 *     avulso e manual (`criarLancamento` grava `origem_lancamento: 'manual'`).
 *   - `cultura`, `fase` e `escopo_negocio` vão SEMPRE, vazios quando o original não tem: é a chave presente que impede o
 *     dialog de herdar os da sessão.
 */
import type { LancamentoV2 } from '@/hooks/useFinanceiroV2';

export interface PrefillDuplicar {
  fazenda_id?: string;
  conta_bancaria_id?: string;
  conta_destino_id?: string;
  data_competencia?: string;
  data_vencimento?: string;
  valor?: number;
  tipo_operacao?: string;
  status_transacao?: string;
  descricao?: string;
  numero_documento?: string;
  tipo_documento?: string;
  favorecido_id?: string;
  plano_conta_id?: string;
  macro_custo?: string;
  grupo_custo?: string;
  centro_custo?: string;
  subcentro?: string;
  safra_id?: string;
  cultura: string;
  fase: string;
  escopo_negocio: string;
  observacao?: string;
  forma_pagamento?: string;
  dados_pagamento?: string;
}

/** `null` do banco vira ausência (a chave some), para o dialog cair no próprio padrão. */
const ou = (v: string | null | undefined) => (v == null || v === '' ? undefined : v);

export function prefillDeDuplicar(lanc: LancamentoV2): PrefillDuplicar {
  /* ⚠ A CONTA SE LÊ PELA DIREÇÃO (regra da casa): entrada → `conta_destino_id`, saída → `conta_bancaria_id`. O ramo do
     prefill, na entrada, lê `conta_bancaria_id` primeiro — então a entrada manda a conta JÁ resolvida nessa chave. A
     transferência manda as duas como estão (origem e destino). */
  const entrada = lanc.tipo_operacao === '1-Entradas';
  const transferencia = lanc.tipo_operacao === '3-Transferências';
  return {
    fazenda_id: ou(lanc.fazenda_id),
    conta_bancaria_id: ou(entrada ? (lanc.conta_destino_id || lanc.conta_bancaria_id) : lanc.conta_bancaria_id),
    conta_destino_id: transferencia ? ou(lanc.conta_destino_id) : undefined,
    data_competencia: ou(lanc.data_competencia),
    data_vencimento: ou(lanc.data_vencimento),
    valor: lanc.valor,
    tipo_operacao: ou(lanc.tipo_operacao),
    status_transacao: ou(lanc.status_transacao),
    descricao: ou(lanc.descricao),
    numero_documento: ou(lanc.numero_documento),
    tipo_documento: ou(lanc.tipo_documento),
    favorecido_id: ou(lanc.favorecido_id),
    plano_conta_id: ou(lanc.plano_conta_id),
    macro_custo: ou(lanc.macro_custo),
    grupo_custo: ou(lanc.grupo_custo),
    centro_custo: ou(lanc.centro_custo),
    subcentro: ou(lanc.subcentro),
    safra_id: ou(lanc.safra_id),
    cultura: lanc.cultura ?? '',
    fase: lanc.fase ?? '',
    escopo_negocio: lanc.escopo_negocio ?? '',
    observacao: ou(lanc.observacao),
    forma_pagamento: ou(lanc.forma_pagamento),
    dados_pagamento: ou(lanc.dados_pagamento),
  };
}
