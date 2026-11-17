/**
 * CONC-PAINEL-CONTA-01 (fatia 1, decisão do Gabriel 17/11 09:57; mock v2 aprovado) — as REGRAS do painel lateral da conta. Puras.
 * ⚠ NADA SE RECALCULA: os 4 passos leem o DONO (`fn_conciliacao_resumo_mes`, a linha da conta + `saldosDaLinha`) — extrato sem par,
 *   sistema sem par, saldos e diferença. O painel só os arruma em passos e LEVA às peças que já existem.
 * ⚠ "outra data" e "casam" (o conferir de 4 números) são da OF-CONFERIR-CASAMENTO-01 (Code 4) e entram na fatia 2.
 */
import type { LinhaResumo, ProprioDono } from '@/lib/conciliacao/resumoDoDono';
import { saldoConfere } from '@/lib/financeiro/conciliacaoCalc';

export type EstadoDoPasso = 'ok' | 'pendente' | 'espera';
export interface PassoDaConta { n: 1 | 2 | 3 | 4; titulo: string; frase: string; estado: EstadoDoPasso }

/** A FONTE da conta (D3 do v1, derivada — nada gravado): ligada ao Open Finance → "Open Finance"; senão o tipo do último arquivo;
 *  senão "sem extrato". `rotulo` é o selo; `detalhe` a frase do cabeçalho do painel. */
export interface FonteDaConta { tipo: 'open_finance' | 'arquivo' | 'sem_extrato'; rotulo: string; detalhe: string }
export interface UltimaImportacao { tipo_arquivo: string | null; saldo_declarado_data: string | null; data_importacao: string | null }

export const ddmmaaaa = (iso: string | null | undefined): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};

export function fonteDaConta(ligadaAoOpenFinance: boolean, ultima: UltimaImportacao | null): FonteDaConta {
  if (ligadaAoOpenFinance) return { tipo: 'open_finance', rotulo: 'Open Finance', detalhe: 'Open Finance · ligada ao banco' };
  if (ultima) {
    const bruto = (ultima.tipo_arquivo ?? '').trim();
    const tipo = bruto.toUpperCase() === 'OPEN_FINANCE' ? 'Open Finance' : bruto ? bruto.toUpperCase() : 'Arquivo';
    const ate = ultima.saldo_declarado_data ? ` até ${ddmmaaaa(ultima.saldo_declarado_data)}` : '';
    return { tipo: 'arquivo', rotulo: `${tipo}${ate}`, detalhe: `${tipo} · último arquivo${ate}` };
  }
  return { tipo: 'sem_extrato', rotulo: 'sem extrato', detalhe: 'sem extrato do banco importado' };
}

/** Os 4 passos do mês da conta, pelo DONO. */
export function passosDaConta(linha: Pick<LinhaResumo, 'tem_extrato' | 'saldo_extrato_data' | 'extratos_sem_par' | 'lancamentos_sem_par'> | null,
  saldos: Pick<ProprioDono, 'saldo_extrato' | 'saldo_sistema' | 'diferenca'>, fonte: FonteDaConta): PassoDaConta[] {
  const temExtrato = !!linha?.tem_extrato;
  const soBanco = linha?.extratos_sem_par.qtde ?? 0;
  const soSistema = linha?.lancamentos_sem_par.qtde ?? 0;
  const dif = saldos.diferenca;
  const saldoOk = saldos.saldo_extrato != null && dif != null && saldoConfere(dif);
  const conferido = temExtrato && soBanco === 0 && soSistema === 0;
  return [
    { n: 1, titulo: 'Trazer extrato', estado: temExtrato ? 'ok' : 'pendente',
      frase: temExtrato ? `extrato do mês até ${ddmmaaaa(linha?.saldo_extrato_data)}`
        : fonte.tipo === 'open_finance' ? 'busque o extrato no banco' : 'importe o OFX ou o PDF do banco' },
    { n: 2, titulo: 'Conferir', estado: !temExtrato ? 'espera' : conferido ? 'ok' : 'pendente',
      frase: !temExtrato ? 'depois do extrato' : `${soBanco} só no banco · ${soSistema} só no sistema` },
    { n: 3, titulo: `Casar lançamentos (${soBanco + soSistema})`, estado: !temExtrato ? 'espera' : soBanco + soSistema === 0 ? 'ok' : 'pendente',
      frase: !temExtrato ? 'depois de conferir' : soBanco + soSistema === 0 ? 'nada sem par' : 'abre a Conferência desta conta, lado a lado' },
    { n: 4, titulo: 'Saldo do banco', estado: saldoOk ? 'ok' : 'pendente',
      frase: fonte.tipo === 'open_finance' ? 'o saldo que o banco informou' : 'informado à mão, com o comprovante' },
  ];
}

/** A coluna Conta de "Saldos por conta" na largura do MAIOR nome (contas, grupos e "Total"), medida na fonte da tabela, mais o recuo e o
 *  padding; com piso e teto. `medir` = a largura em px de um texto (canvas na tela; estimativa no teste). */
export const PISO_DA_CONTA = 110;
export const TETO_DA_CONTA = 240;
export const FOLGA_DA_CONTA = 26;
export function larguraDaConta(nomes: readonly string[], medir: (t: string) => number): number {
  const maior = nomes.reduce((m, n) => Math.max(m, medir(n)), 0);
  return Math.min(TETO_DA_CONTA, Math.max(PISO_DA_CONTA, Math.ceil(maior + FOLGA_DA_CONTA)));
}

/** CONC-PAINEL-CONTA-01 (Gabriel 12:42) — a Conta NA TELA: a do maior nome, mas sem empurrar o Resumo (piso de 260px) para fora — os blocos
 *  − o padding (24) − o vão (8) − o Resumo (260) − a régua − as bordas (2) − a barra de rolagem que EXISTE (medida: 0 sem barra); nunca
 *  abaixo do piso. Sem medida ainda, a do nome. */
export const RESUMO_MINIMO = 260;
export function contaNaTela(larguraDoNome: number, larguraDosBlocos: number | null, regua: number, barra = 0): number {
  /* sem medida ainda (null) ou sem layout (0: o bloco ainda não tem largura) → a do nome */
  if (!larguraDosBlocos) return larguraDoNome;
  return Math.max(PISO_DA_CONTA, Math.min(larguraDoNome, larguraDosBlocos - 24 - 8 - RESUMO_MINIMO - regua - 2 - barra));
}
