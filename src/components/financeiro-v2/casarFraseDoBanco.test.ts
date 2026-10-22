/**
 * CONC-FRASES-02 — o "Casar com o banco" mostra a FRASE PRONTA do banco (`frase`, com o que travou e o caminho) e so' cai no rotulo
 * antigo por codigo (`MOTIVO_CASAR_LABEL`) se ela faltar. O banco foi provado em `supabase/tests/conc_frases_02_test.sql`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CONC-FRASES-02 — a tela usa a frase do banco', () => {
  it('os 5 pontos que mostram a recusa do Casar com o banco leem `frase` antes do rotulo por codigo', () => {
    const modal = readFileSync('src/components/financeiro-v2/CasarComBancoModal.tsx', 'utf8');
    const espelho = readFileSync('src/components/financeiro-v2/EspelhoConciliacaoTab.tsx', 'utf8');
    expect(modal.match(/r\.frase \?\? MOTIVO_CASAR_LABEL\[r\.motivo \?\? ''\]/g)).toHaveLength(4);
    expect(espelho.match(/res\.frase \?\? MOTIVO_CASAR_LABEL\[res\.motivo \?\? ''\]/g)).toHaveLength(1);
    expect(`${modal}\n${espelho}`).not.toMatch(/\(MOTIVO_CASAR_LABEL\[/);
  });
});
