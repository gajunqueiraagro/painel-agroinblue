/**
 * LANÇAMENTO CASADO COM O EXTRATO NÃO SAI DO ESTADO EM QUE O BANCO O PÔS — FIN-CONCILIADO-NAO-REBAIXA-01.
 *
 * Quem recusa é o BANCO (gatilho `trg_guard_lancamento_casado`); "está casado?" tem um dono lá
 * (`fn_lancamento_casado_com_extrato`). Aqui mora o que a TELA precisa: a leitura, a frase, quais campos ficam em leitura e
 * a pergunta "este salvar tiraria o lançamento do estado do banco?" — ESPELHO DECLARADO da condição do gatilho (quem mexer
 * num confere o outro). A frase é escrita pela tela: o P0001 do gatilho não atravessa o `normalizarErro`.
 */
import { supabase } from '@/integrations/supabase/client';

export const FRASE_CASADO_COM_EXTRATO = 'Casado com o extrato — desfaça a conciliação no Espelho para alterar';

/** NOTA-ITENS-CLASSIF-01 (3) (Gabriel 24/11 15:30) — o RODAPÉ do lançamento casado diz o que fica em leitura e que a CLASSIFICAÇÃO muda:
 *  a frase acima (a recusa do salvar) lida sozinha no rodapé parecia travar o lançamento inteiro. */
export const FRASE_CASADO_NO_RODAPE = 'Casado com o extrato: valor, pagamento, conta e status em leitura · a classificação muda';
export const TITLE_CASADO_NO_RODAPE = 'Casado com o extrato: valor, data de pagamento, conta e status ficam como o banco pôs (para mudar, desfaça a conciliação no Espelho). Classificação, fazenda, safra, descrição, fornecedor e documentos se alteram normalmente.';

/** O que a regra olha no lançamento GRAVADO. */
export interface EstadoDoBanco {
  status_transacao?: string | null;
  data_pagamento?: string | null;
  valor?: number | string | null;
  tipo_operacao?: string | null;
  conta_bancaria_id?: string | null;
  conta_destino_id?: string | null;
}

/** "Está casado com o extrato?" — pergunta ao dono, no banco. Sem resposta = `false` (a trava do banco continua valendo). */
export async function consultarCasadoComExtrato(lancamentoId: string): Promise<boolean> {
  try {
    const { data, error } = await (supabase as any).rpc('fn_lancamento_casado_com_extrato', { p_lancamento_id: lancamentoId });
    return !error && data === true;
  } catch {
    return false;
  }
}

const noBanco = (status: string | null | undefined) => status === 'realizado' || status === 'conciliado';
const dia = (d: string | null | undefined) => (d ? d.slice(0, 10) : null);
/** o valor em CENTAVOS: '1122.50' e 1122.5 são o mesmo valor; um centavo (ou o sinal) é diferença — a regra do gatilho é o
 *  `is distinct from` do numeric: texto × número ou zeros à direita nunca são mudança. */
const centavos = (v: number | string | null | undefined) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

export interface CamposTravados { status: boolean; pagamento: boolean; valor: boolean; contaOrigem: boolean; contaDestino: boolean }

export const NADA_TRAVADO: CamposTravados = { status: false, pagamento: false, valor: false, contaOrigem: false, contaDestino: false };

/** Os campos em leitura de um lançamento casado: só o que o gatilho recusa mudar, pelo que está GRAVADO. */
export function camposTravadosDoCasado(casado: boolean, gravado: EstadoDoBanco | null | undefined): CamposTravados {
  if (!casado || !gravado) return NADA_TRAVADO;
  return {
    status: noBanco(gravado.status_transacao),
    pagamento: !!gravado.data_pagamento,
    valor: true,
    contaOrigem: !!gravado.conta_bancaria_id,
    contaDestino: !!gravado.conta_destino_id,
  };
}

/** A conta como o banco a grava (espelho de `trg_00_conta_por_direcao`): entrada mora no destino, saída na origem. */
function contasPelaDirecao(e: EstadoDoBanco): { origem: string | null; destino: string | null } {
  const origem = e.conta_bancaria_id || null;
  const destino = e.conta_destino_id || null;
  const tipo = e.tipo_operacao ?? '';
  if (tipo.startsWith('1-')) return { origem: null, destino: destino ?? origem };
  if (tipo.startsWith('2-')) return { origem: origem ?? destino, destino: null };
  return { origem, destino };
}

/** Este salvar tiraria o lançamento do estado do banco? (a condição do gatilho, sobre o gravado × o que vai ser gravado) */
export function saiDoEstadoDoBanco(gravado: EstadoDoBanco, novo: EstadoDoBanco): boolean {
  if (noBanco(gravado.status_transacao) && !noBanco(novo.status_transacao)) return true;
  if (gravado.data_pagamento && dia(novo.data_pagamento) !== dia(gravado.data_pagamento)) return true;
  if (centavos(novo.valor) !== centavos(gravado.valor)) return true;
  const depois = contasPelaDirecao(novo);
  if (gravado.conta_bancaria_id && depois.origem !== gravado.conta_bancaria_id) return true;
  if (gravado.conta_destino_id && depois.destino !== gravado.conta_destino_id) return true;
  return false;
}
