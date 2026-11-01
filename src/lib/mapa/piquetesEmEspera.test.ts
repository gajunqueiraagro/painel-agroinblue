/** MAPA-PIQUETES-02 — a espera dos piquetes (só da tela) e a leitura da prévia de `fn_piquetes_concluir`. */
import { describe, expect, it } from 'vitest';
import {
  dataBr, esperaPorPai, haBr, lerPrevia, limparPai, marcarPiquete, mesesDeInicio, motivoParaNaoConcluir, tirarDaEspera,
} from './piquetesEmEspera';

const geo = (id: string, nome: string, o: { tipo?: string; pasto_id?: string | null } = {}) =>
  ({ id, nome_original: nome, tipo: o.tipo ?? 'outra', pasto_id: o.pasto_id ?? null });

describe('a espera', () => {
  it('marca, troca o pai sem duplicar, tira e limpa o pai', () => {
    let e = marcarPiquete([], geo('g1', '1A'), 'r01').espera;
    e = marcarPiquete(e, geo('g2', '1B'), 'r01').espera;
    e = marcarPiquete(e, geo('g1', '1A'), 'r02').espera;          // troca de pai
    expect(e).toEqual([{ geometriaId: 'g2', nome: '1B', paiId: 'r01' }, { geometriaId: 'g1', nome: '1A', paiId: 'r02' }]);
    expect(tirarDaEspera(e, 'g2')).toEqual([{ geometriaId: 'g1', nome: '1A', paiId: 'r02' }]);
    expect(limparPai(e, 'r02')).toEqual([{ geometriaId: 'g2', nome: '1B', paiId: 'r01' }]);
  });
  it('recusa polígono ligado, classificado ou sem nome — e a espera não muda', () => {
    const antes = [{ geometriaId: 'g9', nome: '9A', paiId: 'r09' }];
    const ligado = marcarPiquete(antes, geo('g1', '1A', { pasto_id: 'p1', tipo: 'pasto' }), 'r01');
    expect(ligado.recusa).toMatch(/já está ligado a um pasto/);
    expect(ligado.espera).toEqual(antes);
    expect(marcarPiquete(antes, geo('g1', 'RL', { tipo: 'reserva_legal' }), 'r01').recusa).toMatch(/sem classificação/);
    expect(marcarPiquete(antes, geo('g1', '  '), 'r01').recusa).toMatch(/não tem nome/);
  });
  it('agrupa por pai, em ordem natural de nome (1A, 1B, 10A)', () => {
    const e = [{ geometriaId: 'a', nome: '10A', paiId: 'p' }, { geometriaId: 'b', nome: '1B', paiId: 'p' }, { geometriaId: 'c', nome: '1A', paiId: 'p' }];
    expect(esperaPorPai(e).get('p')?.map((x) => x.nome)).toEqual(['1A', '1B', '10A']);
  });
  it('o Concluir só acende com 2 ou mais', () => {
    expect(motivoParaNaoConcluir([{ geometriaId: 'a', nome: '1A', paiId: 'p' }])).toBe('Marque pelo menos 2 polígonos.');
    expect(motivoParaNaoConcluir([{ geometriaId: 'a', nome: '1A', paiId: 'p' }, { geometriaId: 'b', nome: '1B', paiId: 'p' }])).toBeNull();
  });
});

describe('meses, datas e áreas', () => {
  it('os 4 meses até o atual, virando o ano', () => {
    expect(mesesDeInicio(new Date(2026, 0, 15))).toEqual([
      { valor: '2025-10-01', rotulo: '10/2025' }, { valor: '2025-11-01', rotulo: '11/2025' },
      { valor: '2025-12-01', rotulo: '12/2025' }, { valor: '2026-01-01', rotulo: '01/2026' },
    ]);
  });
  it('data dd/mm/aaaa e área com vírgula', () => {
    expect(dataBr('2026-09-30')).toBe('30/09/2026');
    expect(haBr(1234.5)).toBe('1.234,50');
  });
});

describe('a prévia do banco', () => {
  const real = {   // a prévia real da R_01 (Faz. Sto. Expedito, out/26), como o ensaio de 01/11 a devolveu
    ok: true, simulado: true, mes: '2026-10-01',
    pai: { id: 'r01', nome: 'R_01', area_oficial_ha: 92.6, encerra_em: '2026-09-30' },
    piquetes: [{ geometria_id: 'g1', nome: '1A', area_ha: 23.63 }, { geometria_id: 'g2', nome: '1B', area_ha: 21.69 },
      { geometria_id: 'g3', nome: '1C', area_ha: 22.59 }, { geometria_id: 'g4', nome: '1D', area_ha: 24.99 }],
    soma_ha: 92.9, dif_ha: 0.3, dif_pct: 0.3, grupo: { nome: 'R_01', area_ha: 92.9 }, frase: 'R_01 vira o grupo R_01…',
  };
  it('lê a prévia (números do banco, como vieram)', () => {
    const p = lerPrevia(real);
    expect(p?.piquetes.map((x) => x.areaHa)).toEqual([23.63, 21.69, 22.59, 24.99]);
    expect(p?.somaHa).toBe(92.9);
    expect(p?.pai).toEqual({ id: 'r01', nome: 'R_01', areaOficialHa: 92.6, encerraEm: '2026-09-30' });
    expect(p?.difPct).toBe(0.3);
  });
  it('aceita número que o PostgREST manda como texto', () => {
    expect(lerPrevia({ ...real, soma_ha: '92.90' })?.somaHa).toBe(92.9);
  });
  it('fora do formato = null (nunca prévia vazia): sem ok, gravação no lugar da prévia, piquete sem área', () => {
    expect(lerPrevia(null)).toBeNull();
    expect(lerPrevia({ ...real, simulado: false })).toBeNull();
    expect(lerPrevia({ ...real, piquetes: [{ geometria_id: 'g1', nome: '1A' }] })).toBeNull();
  });
});
