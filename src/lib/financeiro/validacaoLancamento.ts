export interface ErroValidacaoLancamento {
  campo: string;
  mensagem: string;
}

const MACROS_ENTRADA = new Set(['Receita Operacional', 'Entrada Financeira']);
const MACROS_SAIDA   = new Set([
  'Custeio Produção', 'Saída Financeira', 'Dividendos',
  'Investimento na Fazenda', 'Deduções de Receitas',
  'Investimento em Bovinos',
]);

export function validarLancamento(form: {
  tipo_operacao?: string | null;
  macro_custo?: string | null;
  subcentro?: string | null;
  status_transacao?: string | null;
  origem_lancamento?: string | null;
  origem?: string | null;
}): ErroValidacaoLancamento[] {
  const erros: ErroValidacaoLancamento[] = [];
  const tipo   = form.tipo_operacao?.trim() ?? '';
  const macro  = form.macro_custo?.trim() ?? '';
  const sub    = form.subcentro?.trim() ?? '';
  const status = form.status_transacao?.trim().toLowerCase() ?? '';
  const origem = (form.origem_lancamento ?? form.origem ?? '').trim().toLowerCase();

  // REGRA 1 — Saída precisa de macro
  if (tipo === '2-Saídas' && !macro) {
    erros.push({
      campo: 'macro_custo',
      mensagem: 'Saída sem macro de custo',
    });
  }

  // REGRA 2 — Lançamento realizado precisa de subcentro
  if (status === 'realizado' && !sub) {
    erros.push({
      campo: 'subcentro',
      mensagem: 'Lançamento realizado sem subcentro',
    });
  }

  // REGRA 3 — Consistência macro x tipo_operacao
  if (macro && tipo) {
    const deveSerEntrada = MACROS_ENTRADA.has(macro);
    const deveSerSaida   = MACROS_SAIDA.has(macro);
    if (deveSerEntrada && tipo !== '1-Entradas') {
      erros.push({
        campo: 'tipo_operacao',
        mensagem: 'Inconsistência entre tipo de operação e macro',
      });
    }
    if (deveSerSaida && tipo !== '2-Saídas') {
      erros.push({
        campo: 'tipo_operacao',
        mensagem: 'Inconsistência entre tipo de operação e macro',
      });
    }
  }

  // REGRA 4 — Bloquear Aporte Pessoal em importação incremental
  // Aplica apenas a NOVOS registros via importação automática.
  // Edições manuais (id presente no handleSave) passam normalmente.
  // ATENÇÃO: esta regra será chamada apenas quando id === undefined
  // (inserção nova), não em edições de registros existentes.
  const subLower = sub.toLowerCase();
  if (subLower === 'aporte pessoal' && origem === 'importacao_incremental') {
    erros.push({
      campo: 'subcentro',
      mensagem: 'Classificação genérica (Aporte Pessoal) não permitida',
    });
  }

  return erros;
}
