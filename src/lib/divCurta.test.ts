/** FECH-DIV-CURTA (Gabriel 08/11 09:22) — o card "Divergência do Campeiro" cortava na grade do Fechamento ("Divergênci…"): no card é "⚠ Div.",
 *  com o nome inteiro no title (o mesmo rótulo do Mapa do rebanho). */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DIV_CURTA, isPastoDivergencia } from './classificacaoArea';

describe('o rótulo curto da Divergência do Campeiro', () => {
  it('é "⚠ Div." e só vale para o pasto de divergência', () => {
    expect(DIV_CURTA).toBe('⚠ Div.');
    expect(isPastoDivergencia('divergencia')).toBe(true);
    expect(isPastoDivergencia('cria')).toBe(false);
  });
  it('o card da grade mostra o curto na divergência e o nome inteiro no title', () => {
    const f = readFileSync('src/pages/FechamentoTab.tsx', 'utf8');
    expect(f).toContain('title={p.nome} data-testid="nome-do-card">');
    expect(f).toContain('{isDivergencia ? DIV_CURTA : p.nome}');
  });
});
