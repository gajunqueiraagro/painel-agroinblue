/**
 * L3 (Gabriel 09/11 07:51) — no formato do caso Monterrey set/26 (números do banco, nomes de pasto genéricos): o card do P_02 tem 187 cab
 * (110,4 UA) e o lote também esteve no P_01 ("Também esteve em"). P_02 49,3 ha + P_01 50,2 ha = 99,5 ha → 1,11 UA/ha nos DOIS (o que a
 * `fn_lotacao_do_mes` devolve); antes a tela mostrava 2,24 no P_02 (só a área dele) e nada no P_01. As cabeças ficam UMA vez (no P_02).
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { companheirosDoLote, uaHaDoMes } from './lotacaoDoLote';
import type { LotacaoDoPasto } from './loteNoGrupo';

const doBanco = (pastoId: string, areaHa: number, cabecas: number, ua: number): LotacaoDoPasto =>
  ({ pastoId, grupoId: null, areaHa, cabecas, ua, uaHa: ua / areaHa, recebeDeOutroCard: pastoId === 'p01' });
/* o que a fn_lotacao_do_mes devolveu para set/26 (ensaio por RAISE no proto, 09/11): P_01 55,7 UA · P_02 54,7 UA */
const P01 = doBanco('p01', 50.2, 94.3, 55.7);
const P02 = doBanco('p02', 49.3, 92.7, 54.7);

describe('a lotação do lote em 2 pastos (L3)', () => {
  it('a UA/ha é a do banco — a mesma nos dois pastos (UA do lote ÷ soma das áreas)', () => {
    const uaDoCard = 110.4;
    expect(uaHaDoMes(P02, uaDoCard / 49.3)).toBeCloseTo(1.11, 2);
    expect(uaHaDoMes(P01, null)).toBeCloseTo(1.11, 2);
    expect(uaDoCard / (49.3 + 50.2)).toBeCloseTo(1.11, 2);
  });

  it('sem UA no banco (ou sem a leitura) vale a conta do card', () => {
    expect(uaHaDoMes(undefined, 2.24)).toBe(2.24);
    expect(uaHaDoMes({ ...P01, ua: 0, uaHa: 0 }, null)).toBeNull();
  });

  it('quem divide o lote: o pasto do card + os alocados do mesmo lote; lote só no próprio pasto não marca', () => {
    const com = companheirosDoLote(
      [{ fechamentoId: 'f02', lote: '', pastoId: 'p02' }, { fechamentoId: 'f02', lote: '', pastoId: 'p01' }, { fechamentoId: 'f09', lote: '', pastoId: 'p09' }],
      new Map([['f02', 'p02'], ['f09', 'p09']]));
    expect(com.get('p01')).toEqual(['p02']);
    expect(com.get('p02')).toEqual(['p01']);
    expect(com.has('p09')).toBe(false);
  });
});

describe('as telas leem a regra única', () => {
  it('Mapa do rebanho: as linhas (tela, Excel e PDF) saem da lotação do banco, com a marca "com P_xx"', () => {
    const tela = readFileSync('src/pages/MapaPastosTab.tsx', 'utf8');
    expect(tela).toContain('uaHa: uaHaDoMes(loteDoMes.lotacaoDoMes.get(r.pasto.id), r.uaHa)');
    expect(tela).toContain('return rowsDoMes.map(r => ({ ...r, programa:');
    expect(tela).toMatch(/rows=\{linhas\}/);
    expect(tela).toContain('data-testid="lote-com">com {row.comPastos.join');
  });
  it('Fechamento (popup e card) pela mesma regra; o modal divide pela soma das áreas escolhidas', () => {
    const fech = readFileSync('src/pages/FechamentoTab.tsx', 'utf8');
    expect(fech.match(/uaHaDoLote\(lotacaoDoPasto, resumo\.uaHa\)/g)).toHaveLength(2);
    const modal = readFileSync('src/components/FechamentoPastoDialog.tsx', 'utf8');
    expect(modal).toContain('const areaDaLotacao = areaDoLote ?? pasto.area_produtiva_ha;');
  });
});
