/**
 * DADOS PARA PAGAMENTO, A PARTIR DO CADASTRO DO FORNECEDOR — FIN-PIX-CADASTRO-MODAL-01 (Gabriel, 04/10/2026).
 *
 * ⚠ O CADASTRO MANDA ENQUANTO O LANÇAMENTO NÃO ESTÁ PAGO. O modal copiava o Pix do fornecedor para o lançamento só quando a
 *   forma ou o fornecedor MUDAVAM; lançamento que já nascia com forma PIX (recorrência, parcelamento, OC, importação) abria
 *   vazio, e a cópia gravada ficava velha quando o cadastro mudava — pagar na chave antiga é o pior defeito desta tela.
 *   Agora o bloco é LIDO do cadastro a cada abertura, sem cópia; `financeiro_lancamentos_v2.dados_pagamento` vira o campo da
 *   EXCEÇÃO ("usar outros dados só neste lançamento").
 *
 * ⚠ DUAS SAÍDAS DO MESMO DADO, e as duas moram aqui:
 *   (a) `linhasDoCadastro` — o que o bloco desenha, linha a linha, com o que cada botão copia;
 *   (b) `textoDoCadastro`  — o TEXTO no formato que o modal gravava ("PIX | Tipo: …\nChave: …\nFavorecido: …"), BYTE A BYTE o
 *       do antigo `buildDadosPagamento`. É ele que decide se uma cópia já gravada é "igual ao cadastro" (segue o cadastro)
 *       ou "dados próprios deste lançamento" (`modoDosDados`). Mudar um caractere aqui transforma toda cópia antiga em exceção.
 *
 * ⚠ O `ContratoDialog` TEM OUTRA MONTAGEM (sem Favorecido, banco em qualquer forma) e NÃO usa esta lib — frente própria
 *   (FIN-CONTRATO-DADOS-PGTO-01). Lançamento gerado por contrato cai em "dados próprios", de propósito.
 */
import type { FornecedorV2 } from '@/hooks/useFinanceiroV2';

export type CadastroDePagamento = Pick<FornecedorV2,
  'nome' | 'tipo_recebimento' | 'pix_tipo_chave' | 'pix_chave' | 'banco' | 'agencia' | 'conta' | 'tipo_conta'
  | 'cpf_cnpj_pagamento' | 'nome_favorecido' | 'observacao_pagamento'>;

/** O cadastro do fornecedor diz "Transferência Bancária"; a lista do lançamento (`FORMAS_PAGAMENTO_V2`) diz "Transferência". */
const TRANSFERENCIA_DO_CADASTRO = 'Transferência Bancária';
const TRANSFERENCIA = 'Transferência';
const PIX = 'PIX';

/** A forma como o LANÇAMENTO a escreve. Só a transferência tem dois nomes; o resto passa como veio. */
export function normalizarFormaDoCadastro(tipo: string | null | undefined): string {
  if (!tipo) return '';
  return tipo === TRANSFERENCIA_DO_CADASTRO ? TRANSFERENCIA : tipo;
}

/**
 * A forma que vale para MOSTRAR: a do lançamento; sem ela, a preferida do cadastro. ⚠ Só exibição — quem chama NÃO grava a
 * preferida no lançamento (decisão 4 do Gabriel): o select segue em "Nenhuma".
 */
export function formaEfetiva(formaDoLancamento: string | null | undefined, f: Pick<CadastroDePagamento, 'tipo_recebimento'> | null | undefined): string {
  return normalizarFormaDoCadastro(formaDoLancamento) || normalizarFormaDoCadastro(f?.tipo_recebimento);
}

const ehTransferencia = (forma: string) => forma === TRANSFERENCIA || forma === TRANSFERENCIA_DO_CADASTRO;

/**
 * O texto no formato gravado — o corpo do antigo `buildDadosPagamento`, sem tirar nem pôr.
 * ⚠ Com forma PIX a chave sai sempre que existir, qualquer que seja o `tipo_recebimento` do cadastro (decisão 5).
 * ⚠ A observação do cadastro entra no fim em QUALQUER forma — era assim, e a comparação depende disso.
 */
export function textoDoCadastro(f: CadastroDePagamento, metodo?: string): string {
  const tipo = metodo || f.tipo_recebimento || '';
  const lines: string[] = [];
  if (tipo === PIX && f.pix_chave) {
    lines.push(`PIX | Tipo: ${f.pix_tipo_chave || '-'}`);
    lines.push(`Chave: ${f.pix_chave}`);
    if (f.nome_favorecido) lines.push(`Favorecido: ${f.nome_favorecido}`);
  } else if (ehTransferencia(tipo)) {
    if (f.banco) lines.push(`Banco: ${f.banco}`);
    if (f.agencia) lines.push(`Agência: ${f.agencia}`);
    if (f.conta) lines.push(`Conta: ${f.conta}`);
    if (f.tipo_conta) lines.push(`Tipo: ${f.tipo_conta}`);
    if (f.cpf_cnpj_pagamento) lines.push(`CPF/CNPJ: ${f.cpf_cnpj_pagamento}`);
    if (f.nome_favorecido) lines.push(`Favorecido: ${f.nome_favorecido}`);
  }
  if (f.observacao_pagamento) lines.push(f.observacao_pagamento);
  return lines.join('\n');
}

/** O valor como o banco aceita num campo de Pix: "3192,00" — sem R$ e sem ponto de milhar. */
export function valorParaCopiar(valor: number): string {
  return Math.abs(valor).toFixed(2).replace('.', ',');
}

export interface LinhaDePagamento {
  rotulo: string;
  valor: string;
  /** O que o botão copia; ausente = a linha não tem botão. */
  copia?: string;
  /** O botão principal do bloco (a chave do Pix). */
  principal?: boolean;
  /** A mensagem do toast ao copiar. */
  aviso?: string;
}

export type BlocoDoCadastro =
  /** Há dado no cadastro para a forma: o bloco. */
  | { tipo: 'dados'; titulo: 'PIX' | 'Transferência'; linhas: LinhaDePagamento[]; observacao: string | null }
  /** A forma pede dado de cadastro e o fornecedor não tem: o aviso âmbar com o atalho. */
  | { tipo: 'falta'; falta: 'pix' | 'banco' }
  /** Sem fornecedor, ou forma que não tem dado de cadastro (Boleto, Cartão, Débito, Dinheiro, Outro, nenhuma). */
  | { tipo: 'nada' };

const temBanco = (f: CadastroDePagamento) => !!(f.banco || f.agencia || f.conta);

/**
 * O que o bloco desenha para (fornecedor, forma efetiva, valor do lançamento).
 * ⚠ "Favorecido" cai no NOME do fornecedor quando o cadastro não tem `nome_favorecido`: é o nome que o banco mostra na
 *   confirmação, e a linha existe para o operador conferir. O TEXTO gravado continua só com o `nome_favorecido`.
 */
export function linhasDoCadastro(f: CadastroDePagamento | null | undefined, forma: string, valor: number, valorFormatado: string): BlocoDoCadastro {
  if (!f) return { tipo: 'nada' };
  const favorecido = f.nome_favorecido || f.nome;
  const linhaValor: LinhaDePagamento = { rotulo: 'Valor', valor: valorFormatado, copia: valorParaCopiar(valor), aviso: 'Copiado' };
  if (forma === PIX) {
    if (!f.pix_chave) return { tipo: 'falta', falta: 'pix' };
    return {
      tipo: 'dados', titulo: 'PIX', observacao: f.observacao_pagamento || null,
      linhas: [
        { rotulo: 'Tipo da chave', valor: f.pix_tipo_chave || '-' },
        { rotulo: 'Chave', valor: f.pix_chave, copia: f.pix_chave, principal: true, aviso: 'Chave PIX copiada' },
        { rotulo: 'Favorecido', valor: favorecido, copia: favorecido, aviso: 'Copiado' },
        linhaValor,
      ],
    };
  }
  if (ehTransferencia(forma)) {
    if (!temBanco(f)) return { tipo: 'falta', falta: 'banco' };
    const agenciaConta = [f.agencia || '—', f.conta || '—'].join(' / ') + (f.tipo_conta ? ` · ${f.tipo_conta}` : '');
    return {
      tipo: 'dados', titulo: 'Transferência', observacao: f.observacao_pagamento || null,
      linhas: [
        { rotulo: 'Banco', valor: f.banco || '—' },
        { rotulo: 'Agência / Conta', valor: agenciaConta, copia: agenciaConta, aviso: 'Copiado' },
        { rotulo: 'CPF/CNPJ', valor: f.cpf_cnpj_pagamento || '—', ...(f.cpf_cnpj_pagamento ? { copia: f.cpf_cnpj_pagamento, aviso: 'Copiado' } : {}) },
        { rotulo: 'Favorecido', valor: favorecido, copia: favorecido, aviso: 'Copiado' },
        linhaValor,
      ],
    };
  }
  return { tipo: 'nada' };
}

/**
 * CADASTRO OU PRÓPRIO — a decisão 3 do Gabriel, em tempo de tela, sem backfill.
 *   · realizado: com texto gravado é o que foi usado (histórico) — 'proprio'; sem texto, o cadastro ("cadastro atual").
 *   · não realizado: texto vazio OU igual ao que o cadastro monta hoje para a forma efetiva — 'cadastro'; diferente — 'proprio'.
 * ⚠ SEM FORNECEDOR NA LISTA o texto do cadastro é vazio, então qualquer texto gravado é 'proprio' — nunca se joga fora um
 *   texto por não ter com o que comparar.
 */
export function modoDosDados(a: { realizado: boolean; textoGravado: string; textoDoCadastro: string }): 'cadastro' | 'proprio' {
  const gravado = a.textoGravado.trim();
  if (!gravado) return 'cadastro';
  if (a.realizado) return 'proprio';
  return gravado === a.textoDoCadastro.trim() ? 'cadastro' : 'proprio';
}
