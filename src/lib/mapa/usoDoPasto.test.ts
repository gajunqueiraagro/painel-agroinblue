/**
 * MAPA-ATIVIDADE-LAVOURA-01 — o uso do mês (D1), quem é pecuária (a lista da tela, D5) e a família de quem fica de fora (D3).
 */
import { describe, expect, it } from 'vitest';
import { TIPOS_USO_PECUARIA } from '@/lib/pastos/tiposUso';
import { ehUsoPecuaria, familiaForaDaPecuaria, usoDoMes } from './usoDoPasto';

describe('o uso do mês e a família', () => {
  it('D1: o do fechamento; sem ele, o do cadastro', () => {
    expect(usoDoMes('agricultura', 'cria')).toBe('agricultura');
    expect(usoDoMes(null, 'reserva')).toBe('reserva');
    expect(usoDoMes(undefined, undefined)).toBeNull();
  });
  it('D5: pecuária = a lista da tela (tiposUso.ts), inteira; uso desconhecido conta como antes', () => {
    for (const t of [...TIPOS_USO_PECUARIA, null]) expect(ehUsoPecuaria(t)).toBe(true);
    for (const t of ['agricultura', 'eucalipto', 'reserva', 'app', 'benfeitorias', 'divergencia']) expect(ehUsoPecuaria(t)).toBe(false);
  });
  it('a família de cada uso fora da pecuária', () => {
    expect(familiaForaDaPecuaria('agricultura')).toBe('lavoura');
    expect(familiaForaDaPecuaria('eucalipto')).toBe('silvicultura');
    expect(familiaForaDaPecuaria('reserva')).toBe('ambiental');
    expect(familiaForaDaPecuaria('app')).toBe('ambiental');
    expect(familiaForaDaPecuaria('benfeitorias')).toBe('benfeitorias');
    expect(familiaForaDaPecuaria('divergencia')).toBe('outro');
    expect(familiaForaDaPecuaria('vedado')).toBeNull();
  });
});
