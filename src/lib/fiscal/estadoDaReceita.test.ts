/**
 * NOTAS-RECEITA-CARD-SEMPRE-01 — o estado do card da Receita (mock aprovado 27/11, md5 0ce0487c…): o card nunca some; cada caso cai num
 * dos 5 estados, e o motivo da parada nunca leva segredo.
 */
import { describe, expect, it } from 'vitest';
import { decidirEstado, explicacaoDaParada, fraseDoCard, fraseDoMenu, type EstadoDaReceita } from './estadoDaReceita';

const AGORA = new Date('2026-11-27T12:00:00Z');
const cert = (o: Partial<{ situacao: string; validoAte: string | null; enviadoEm: string | null }> = {}) =>
  ({ situacao: 'ativo', validoAte: '2027-11-25T00:00:00Z', enviadoEm: '2026-11-01T00:00:00Z', ...o });
const base = { carregando: false, certificados: [cert()], controle: [{ ultimaBuscaEm: '2026-11-27T11:30:00Z', naoAntesDe: '2026-11-27T12:30:00Z' }],
  ultimaBusca: { em: '2026-11-27T11:30:00Z', cstat: '137', recusa: null }, pausas: [], notasALancar: 0, agora: AGORA };
const parada = (e: EstadoDaReceita) => (e.tipo === 'parada' ? e.motivo : e.tipo);

describe('decidirEstado', () => {
  it('(a) sem certificado ativo', () => {
    expect(decidirEstado({ ...base, certificados: [] }).tipo).toBe('sem_certificado');
    expect(decidirEstado({ ...base, certificados: [cert({ situacao: 'revogado' })] }).tipo).toBe('sem_certificado');
  });
  it('(b) certificado ok, nada novo', () => {
    const e = decidirEstado(base);
    expect(e.tipo).toBe('sem_novas');
    expect(fraseDoCard(e)).toMatch(/^Nenhuma nota nova da Receita · última busca \d\d\/\d\d \d\d:\d\d$/);
  });
  it('(b′) só nos primeiros 15 min depois do cadastro; depois vira parada', () => {
    const novo = { ...base, controle: [], ultimaBusca: null };
    expect(decidirEstado({ ...novo, certificados: [cert({ enviadoEm: '2026-11-27T11:50:00Z' })] }).tipo).toBe('sem_busca');
    expect(parada(decidirEstado({ ...novo, certificados: [cert({ enviadoEm: '2026-11-27T11:40:00Z' })] }))).toBe('nunca_buscou');
  });
  it('(c) com notas a lançar', () => {
    const e = decidirEstado({ ...base, notasALancar: 12 });
    expect(e.tipo).toBe('com_notas');
    expect(fraseDoMenu(e)?.texto).toBe('12 chegaram da Receita');
  });
  it('(d) vencido, pausa da agenda, 656, cadeia, 3 h sem busca boa', () => {
    expect(parada(decidirEstado({ ...base, certificados: [cert({ validoAte: '2026-11-01T00:00:00Z' })] }))).toBe('vencido');
    expect(parada(decidirEstado({ ...base, pausas: [{ motivo: 'cadeia', desde: '2026-11-27T10:35:00Z', ate: null }] }))).toBe('cadeia');
    expect(parada(decidirEstado({ ...base, pausas: [{ motivo: 'lambda_tempo', desde: '2026-11-27T10:00:00Z', ate: '2026-11-27T16:00:00Z' }] }))).toBe('ponte');
    expect(decidirEstado({ ...base, pausas: [{ motivo: 'lambda_tempo', desde: '2026-11-27T04:00:00Z', ate: '2026-11-27T10:00:00Z' }] }).tipo).toBe('sem_novas');
    const bloqueio = decidirEstado({ ...base, ultimaBusca: { em: '2026-11-27T11:30:00Z', cstat: '656', recusa: null } });
    expect(parada(bloqueio)).toBe('bloqueio');
    expect(bloqueio.tipo === 'parada' && bloqueio.voltaEm).toBe('2026-11-27T12:30:00Z');
    expect(parada(decidirEstado({ ...base, ultimaBusca: { em: '2026-11-27T11:30:00Z', cstat: 'nao_chamou', recusa: 'cadeia' } }))).toBe('cadeia');
    expect(parada(decidirEstado({ ...base, controle: [{ ultimaBuscaEm: '2026-11-27T08:30:00Z', naoAntesDe: null }],
      ultimaBusca: { em: '2026-11-27T08:30:00Z', cstat: '137', recusa: null } }))).toBe('atrasada');
  });
  it('a espera de 1 h do banco não é parada', () => {
    expect(decidirEstado({ ...base, ultimaBusca: { em: '2026-11-27T11:30:00Z', cstat: null, recusa: 'espera' } }).tipo).toBe('sem_novas');
  });
  it('o motivo é em português e sem dígito de documento', () => {
    for (const motivo of ['vencido', 'bloqueio', 'sem_resposta', 'cadeia', 'certificado', 'ponte', 'nunca_buscou', 'atrasada', 'outro'] as const) {
      const x = explicacaoDaParada({ tipo: 'parada', motivo, desde: '2026-11-27T10:00:00Z', voltaEm: null, validoAte: '2027-11-25T00:00:00Z' });
      expect(x.motivo.length).toBeGreaterThan(10);
      expect(`${x.motivo} ${x.fazer}`).not.toMatch(/\d{11}/);
    }
  });
});
