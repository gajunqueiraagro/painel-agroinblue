import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * PR-FIN-DATAS-VENCIMENTO-02B
 *
 * O modal de baixa mantinha um bloco que atualizava `ano_mes` em
 * financeiro_lancamentos_v2 para o mes do pagamento efetivo. Esse bloco era
 * inalcancavel — os dois ids locais eram literalmente `null`, entao o array
 * filtrado era sempre vazio e o `.update()` nunca chegava a ser emitido — e,
 * mesmo que fosse, o trigger 02E o descartaria, porque `ano_mes` deriva de
 * `data_competencia`.
 *
 * Estes testes sao de fonte, nao de runtime, e isso e deliberado: o que
 * precisa ser garantido e a AUSENCIA de uma chamada, e a ausencia de uma
 * chamada num caminho morto nao e observavel por teste de comportamento.
 * O que o modal continua fazendo — baixa, data efetiva de pagamento, valor,
 * status, conta e conciliacao — e verificado logo abaixo pela presenca dos
 * respectivos payloads.
 */
const fonte = readFileSync(
  resolve(__dirname, 'ModalBaixaParcela.tsx'),
  'utf-8',
);

/** Linhas executaveis: descarta comentarios de linha e de bloco. */
function linhasExecutaveis(src: string): string[] {
  const semBloco = src.replace(/\/\*[\s\S]*?\*\//g, '');
  return semBloco
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'));
}

describe('ModalBaixaParcela — ano_mes deixou de ser escrito pelo front', () => {
  const executaveis = linhasExecutaveis(fonte);

  it('nao possui nenhuma referencia executavel a ano_mes', () => {
    const ocorrencias = executaveis.filter((l) => l.includes('ano_mes'));
    expect(ocorrencias).toEqual([]);
  });

  it('nao possui nenhuma referencia executavel a anoMes', () => {
    const ocorrencias = executaveis.filter((l) => /\banoMes\b/.test(l));
    expect(ocorrencias).toEqual([]);
  });

  it('nao emite update de financeiro_lancamentos_v2 carregando ano_mes', () => {
    const alvo = executaveis
      .join('\n')
      .match(/from\('financeiro_lancamentos_v2'\)[\s\S]{0,240}?\.update\(\{[\s\S]{0,240}?\}\)/g);
    for (const trecho of alvo ?? []) {
      expect(trecho).not.toContain('ano_mes');
    }
  });
});

describe('ModalBaixaParcela — o que a baixa continua fazendo', () => {
  const executaveis = linhasExecutaveis(fonte).join('\n');

  it('continua gravando a data efetiva de pagamento na parcela', () => {
    expect(executaveis).toContain("data_pagamento: dataPagamento");
  });

  it('continua marcando a parcela como paga com valores', () => {
    expect(executaveis).toContain("status: 'pago'");
    expect(executaveis).toContain('valor_principal: parcela.valor_principal');
    expect(executaveis).toContain('valor_juros: parcela.valor_juros');
  });

  it('continua exigindo data de pagamento quando o status e pago', () => {
    expect(executaveis).toContain("if (!dataPagamento)");
  });

  it('continua chamando a RPC oficial de reconciliacao com dry_run falso', () => {
    expect(executaveis).toContain("'fn_reconciliar_parcela_financiamento'");
    expect(executaveis).toContain('p_dry_run: false');
  });

  it('continua invalidando as queries de financiamento e financeiro', () => {
    expect(executaveis).toContain("queryKey: ['financiamento-parcelas'");
    expect(executaveis).toContain("queryKey: ['financeiro-lancamentos']");
  });

  it('nao perdeu nenhuma chamada ao banco: as tabelas alvo continuam presentes', () => {
    expect(executaveis).toContain("from('financiamento_parcelas')");
    expect(executaveis).toContain("from('financeiro_lancamentos_v2')");
  });
});

describe('parcelaMirror — o writer morto saiu e o vivo ficou', () => {
  const mirror = readFileSync(
    resolve(__dirname, '../../lib/financiamentos/parcelaMirror.ts'),
    'utf-8',
  );

  it('criarMirrorParcela nao existe mais', () => {
    expect(mirror).not.toContain('export async function criarMirrorParcela');
  });

  it('cancelarLancamentosDoFinanciamento, que tem chamador vivo, permanece', () => {
    expect(mirror).toContain('export async function cancelarLancamentosDoFinanciamento');
  });
});
