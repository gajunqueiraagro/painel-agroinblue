/**
 * MAPA-PIQUETE-SUBAREA-01 C1 (corte nov/26) — no formato da Sta. Tereza: Reserva Legal, APP e Corredores e Benfeitorias são área da fazenda
 * desde 11/2026 (fora do fechamento e do mapa de pastos); até 10/2026 seguem como antes (o histórico dos cards). O espelho do banco
 * (`_fn_pasto_e_area_da_fazenda`, 117497).
 */
import { describe, it, expect } from 'vitest';
import { ehAreaDaFazendaNoMes, semAreaDaFazenda } from './areaDaFazenda';
import { pastosDoFechamentoNoMes } from '@/hooks/useLoteDoMes';

const p = (id: string, nome: string, tipo_uso: string) => ({ id, nome, tipo_uso, ativo: true, data_inicio: null, data_fim: null, fazenda_id: 'st' });
const ST = [p('m1', 'Modulo 01', 'cria'), p('rl', 'Reserva Legal', 'reserva'), p('app', 'APP', 'app'), p('cb', 'Corredores e Benfeitorias', 'benfeitorias'),
  p('div', '⚠️ Divergência do Campeiro', 'divergencia'), p('ag', 'Lavoura', 'agricultura')];

describe('área da fazenda (C1)', () => {
  it('reserva, APP e benfeitorias desde nov/26; antes do corte, não; outros usos, nunca', () => {
    expect(ehAreaDaFazendaNoMes('reserva', '2026-11')).toBe(true);
    expect(ehAreaDaFazendaNoMes('app', '2027-03')).toBe(true);
    expect(ehAreaDaFazendaNoMes('benfeitorias', '2026-11')).toBe(true);
    expect(ehAreaDaFazendaNoMes('reserva', '2026-10')).toBe(false);
    expect(ehAreaDaFazendaNoMes('cria', '2026-11')).toBe(false);
    expect(ehAreaDaFazendaNoMes(null, '2026-11')).toBe(false);
  });

  it('o mapa de pastos de nov/26 não leva as áreas; o de out/26 leva (histórico)', () => {
    expect(semAreaDaFazenda(ST, '2026-11').map((x) => x.nome)).toEqual(['Modulo 01', '⚠️ Divergência do Campeiro', 'Lavoura']);
    expect(semAreaDaFazenda(ST, '2026-10')).toHaveLength(6);
  });

  it('a grade do Fechamento de nov/26 (pastosDoFechamentoNoMes) sem Reserva, APP e Corredores; out/26 com elas', () => {
    expect(pastosDoFechamentoNoMes(ST as never, '2026-11').map((x: { nome: string }) => x.nome)).toEqual(['Modulo 01', 'Lavoura', '⚠️ Divergência do Campeiro']);
    expect(pastosDoFechamentoNoMes(ST as never, '2026-10').map((x: { nome: string }) => x.nome)).toContain('Reserva Legal');
  });
});
