/**
 * O financeiro do Consumo valorado — [OC-PADRAO-01] 114c, decisões do 114c-2/114c-3.
 *
 * ⚠ CONSUMO TEM VALOR E NÃO TEM DINHEIRO. O animal consumido na fazenda sai do rebanho
 * como sairia numa venda — e é assim que ele precisa sair do estoque, pelo VPB. O que não
 * existe é caixa: ninguém pagou. Por isso o lançamento nasce `sem_movimentacao_caixa =
 * true`, sem conta bancária e sem compromisso; ele entra na DRE como receita interna
 * (o plano `Consumo Interno e Doações` tem `compoe_dre = true` e `gera_lcdpr = false`).
 * Antes deste PR o consumo não gerava nada, e o animal saía do rebanho sem sair do
 * resultado.
 *
 * ⚠ `origem_lancamento` É `movimentacao_rebanho`, NÃO `zootecnico`. O envelope 114c-2
 * pediu `'zootecnico'`; medido no banco, esse valor não existe — o vocabulário vigente
 * para lançamento nascido do rebanho é `movimentacao_rebanho`, com 805 linhas, e é o que
 * os filtros, a auditoria e os relatórios conhecem. Um décimo-nono valor inventado aqui
 * seria invisível para todos eles.
 *
 * ⚠ O PLANO É GLOBAL E FIXO: `43aa039a-c339-42df-97ba-0892a450b52e`. Ele é buscado pelo
 * id e conferido, nunca escolhido por nome: "Consumo Interno e Doações" é texto, e texto
 * muda. Se o plano sumir ou for desativado, a função RECUSA e diz — gravar num plano
 * qualquer poria receita interna no lugar errado da DRE.
 *
 * ⚠ ESPELHO DE `gerarFinanceiroCompra`, de propósito: mesma forma de payload, mesma
 * guarda de duplicidade por `movimentacao_rebanho_id`, mesmo `toast` de erro. O que muda
 * é o que TEM de mudar — sinal, caixa e plano.
 */
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CATEGORIAS } from '@/types/cattle';

/** O plano oficial do consumo interno — global, conferido no 114c (06/09). */
export const PLANO_CONSUMO_INTERNO_ID = '43aa039a-c339-42df-97ba-0892a450b52e';

export interface GerarFinanceiroConsumoParams {
  lancamentoId: string;
  clienteId: string;
  fazendaId: string;
  quantidade: number;
  categoria: string;
  /** A data do consumo: vira competência E pagamento (não há prazo sem caixa). */
  data: string;
  /** O total já calculado pela tela (qtd × preço, ou o que o operador digitou). */
  valorTotal: number;
}

export async function gerarFinanceiroConsumo(p: GerarFinanceiroConsumoParams): Promise<boolean> {
  /* ⚠ SEM VALOR, SEM LANÇAMENTO — e isso não é erro. Consumo sem preço de estoque
     informado continua sendo um consumo válido no rebanho; o que não se faz é gravar
     receita de zero, que diria na DRE que o animal não valia nada. */
  if (!(p.valorTotal > 0)) return true;

  const { data: existente } = await supabase
    .from('financeiro_lancamentos_v2')
    .select('id')
    .eq('movimentacao_rebanho_id', p.lancamentoId)
    .eq('cancelado', false)
    .limit(1);
  if (existente && existente.length > 0) {
    toast.error('Já existe lançamento financeiro para este consumo.');
    return false;
  }

  const { data: plano, error: erroPlano } = await supabase
    .from('financeiro_plano_contas')
    .select('id, macro_custo, grupo_custo, centro_custo, subcentro, tipo_operacao, ativo')
    .eq('id', PLANO_CONSUMO_INTERNO_ID)
    .maybeSingle();
  if (erroPlano || !plano || plano.ativo === false) {
    toast.error('O plano "Consumo Interno e Doações" não foi encontrado ou está inativo — o consumo foi registrado sem o financeiro.');
    return false;
  }

  const catLabel = CATEGORIAS.find(c => c.value === p.categoria)?.label || p.categoria;
  /* "Consumo 003 Vacas" — a quantidade com três dígitos, como o envelope pediu: assim a
     lista do financeiro alinha os números e o operador lê a coluna de cima a baixo. */
  const descricao = `Consumo ${String(p.quantidade).padStart(3, '0')} ${catLabel}`;

  const { error } = await supabase.from('financeiro_lancamentos_v2').insert({
    cliente_id: p.clienteId,
    fazenda_id: p.fazendaId,
    /* O sinal vem do PLANO, não de uma constante local: ele é `1-Entradas`, e o consumo
       é receita interna. Ler do plano é o que mantém os dois de acordo se ele mudar. */
    tipo_operacao: plano.tipo_operacao ?? '1-Entradas',
    /* ⚠ `sinal` É TEXTO NO BANCO ('1' / '-1'), não número — conferido em `types.ts` e nas
       82.700 linhas da tabela. `gerarFinanceiroCompra` escreve `-1` numérico e passa
       porque o array dele é `any[]`; aqui o tipo acusou, e o certo é o texto. */
    sinal: (plano.tipo_operacao ?? '1-Entradas').startsWith('1') ? '1' : '-1',
    status_transacao: 'realizado',
    cenario: 'realizado',
    /* ⚠ SEM CAIXA E SEM CONTA — é o par que faz este lançamento não mexer em saldo
       nenhum, e é ele que a guarda do banco (20260906203720) usa para permitir que o
       cancelamento do consumo cancele o financeiro junto. */
    sem_movimentacao_caixa: true,
    conta_bancaria_id: null,
    origem_lancamento: 'movimentacao_rebanho',
    origem_tipo: 'consumo_rebanho',
    movimentacao_rebanho_id: p.lancamentoId,
    data_competencia: p.data,
    data_pagamento: p.data,
    ano_mes: p.data.slice(0, 7),
    valor: p.valorTotal,
    descricao,
    macro_custo: plano.macro_custo,
    grupo_custo: plano.grupo_custo ?? null,
    centro_custo: plano.centro_custo,
    subcentro: plano.subcentro,
    plano_conta_id: plano.id,
  });

  if (error) {
    console.error('[gerarFinanceiroConsumo] falha ao gravar', error);
    toast.error('O consumo foi registrado, mas o lançamento financeiro falhou.');
    return false;
  }
  return true;
}
