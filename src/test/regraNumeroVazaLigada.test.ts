/**
 * P113 — a regra `numero-vaza` do check-ui-cortes vale em TODO cenário com `folgaCelulas`, a régua de saídas da análise da Visão Geral
 * inclusive (a coluna do % foi alargada e o interruptor por cenário saiu). Religar um interruptor, ou pular a regra por nome, derruba este teste.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const fonte = readFileSync(resolve(__dirname, '../../scripts/check-ui-cortes.mjs'), 'utf8');

describe('P113 — numero-vaza ligada em todo cenário', () => {
  it('os achados da folga entram direto, sem filtro por cenário', () => {
    expect(fonte).toContain('if (cen.folgaCelulas) daRolagem.push(...(await p.evaluate(medirFolgaCelulas, cen.folgaCelulas)));');
    expect(fonte).toContain("achados.push({ regra: 'numero-vaza'");
  });

  it('não há interruptor nem aviso de regra desligada', () => {
    expect(fonte).not.toMatch(/Interruptor|desligada neste cen/);
    expect(existsSync(resolve(__dirname, '../../scripts/ui-cortes/regraNumeroVaza.mjs'))).toBe(false);
  });

  it('a régua de saídas da análise segue no gate com a folga medida', () => {
    /* o cenário nasce do mapa da régua (`visao-geral-analise-${n}`), com a folga das tabelas do modal */
    expect(fonte).toContain("['regua-saidas', '&vg_grande=1', '[data-testid^=\"grade-linha-saida:grupo:Custeio\"]', false],");
    expect(fonte).toContain("nome: `visao-geral-analise-${n}`");
  });
});
