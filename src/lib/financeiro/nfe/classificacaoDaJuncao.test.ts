/**
 * NOTA-JUNTAR-CLASSIF-01 — o aviso "classificações diferentes" resolve em 1 clique; DA-NOTA ETAPA 2 — o subcentro mostra a atividade.
 */
import { describe, it, expect } from 'vitest';
import { classificacoesParaJuntar, ehRecusaDeClassificacoes, nomeCurtoDaConta } from './classificacaoDaJuncao';

describe('nomeCurtoDaConta', () => {
  it('o caso NJ: a atividade sempre visível, o nome curto antes', () => {
    expect(nomeCurtoDaConta('Manutenção Máquinas Pecuária', 'pecuaria')).toBe('Manut. Máquinas · Pecuária');
    expect(nomeCurtoDaConta('Manutenção Máquinas Agricultura', 'agricultura')).toBe('Manut. Máquinas · Agricultura');
  });
  it('outros: abrevia só o combinado; "Agrícolas" no fim também sai; sem atividade = o nome', () => {
    expect(nomeCurtoDaConta('Investimento em Máquinas e Equipamentos Administrativo', 'administrativo')).toBe('Invest. em Máquinas e Equip. · Administrativo');
    expect(nomeCurtoDaConta('Venda de Máquinas Agrícolas', 'agricultura')).toBe('Venda de Máquinas · Agricultura');
    expect(nomeCurtoDaConta('Sanidade Animal — Vacinas', 'pecuaria')).toBe('Sanidade Animal — Vacinas · Pecuária');
    expect(nomeCurtoDaConta('Dividendos', '')).toBe('Dividendos');
    expect(nomeCurtoDaConta(null, 'pecuaria')).toBe('');
  });
});

describe('classificacoesParaJuntar', () => {
  const p = (id: string, rotulo: string, planoContaId: string | null, safraId: string | null = null) => ({ id, rotulo, planoContaId, safraId });
  it('o caso NJ: 1/2 Agricultura, 2/2 Pecuária → as duas opções, cada uma pela sua parcela (com a safra dela)', () => {
    expect(classificacoesParaJuntar([p('a', '1/2', 'agr', 's-agr'), p('b', '2/2', 'pec', 's-pec')])).toEqual({
      opcoes: [{ planoContaId: 'agr', safraId: 's-agr', rotulo: '1/2' }, { planoContaId: 'pec', safraId: 's-pec', rotulo: '2/2' }], mais: 0 });
  });
  it('uma só classificação = nada a escolher; sem conta numa parcela = diferente, mas não vira opção', () => {
    expect(classificacoesParaJuntar([p('a', '1/2', 'x'), p('b', '2/2', 'x')])).toBeNull();
    expect(classificacoesParaJuntar([p('a', '1/2', 'x'), p('b', '2/2', null)])).toEqual({ opcoes: [{ planoContaId: 'x', safraId: null, rotulo: '1/2' }], mais: 0 });
  });
  it('a 1ª parcela que tem a conta dá o rótulo; acima de 3 contas, o resto se escolhe no Aplicar a todas', () => {
    const r = classificacoesParaJuntar([p('a', '1/5', 'x'), p('b', '2/5', 'y'), p('c', '3/5', 'x'), p('d', '4/5', 'z'), p('e', '5/5', 'w')]);
    expect(r?.opcoes.map((o) => o.rotulo)).toEqual(['1/5', '2/5', '4/5']);
    expect(r?.mais).toBe(1);
  });
  it('a recusa do banco que o aviso resolve', () => {
    expect(ehRecusaDeClassificacoes('Os lançamentos têm classificações diferentes: acerte a classificação antes de juntar.')).toBe(true);
    expect(ehRecusaDeClassificacoes('Os lançamentos são de fazendas diferentes.')).toBe(false);
  });
});
