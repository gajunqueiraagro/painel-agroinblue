/**
 * MAPA-ATIVIDADE-LAVOURA-01 — a conta do mapa e do Global com SÓ a pecuária do mês (OK do Gabriel 01/11) e a cor/legenda de quem fica de
 * fora (D2/D3). Dado no formato da Pureza set/26: um pasto de cria com animais, um de lavoura (cadastro diz cria, o mês diz agricultura),
 * a reserva sem fechamento (D1: vale o cadastro) e um vedado.
 */
import { describe, expect, it } from 'vitest';
import { montarMapaDoMes, resumoDosPastos, type PastoDoMapa } from './mapaDoMes';
import { COR_FORA_DA_PECUARIA, corDoPasto, legendaDaCamada, type CamadaDoMapa } from './camadasDoMapa';
import { COR_DA_FAIXA, COR_SEM_FECHAMENTO } from './faixasLotacao';

const P: PastoDoMapa[] = [
  { id: 'p1', nome: 'P1', area_produtiva_ha: 100, tipo_uso: 'cria' },
  { id: 'p5a', nome: 'P5A', area_produtiva_ha: 101, tipo_uso: 'cria' },
  { id: 'rl', nome: 'Reserva Legal', area_produtiva_ha: 903.89, tipo_uso: 'reserva' },
  { id: 'v', nome: 'P16', area_produtiva_ha: 50, tipo_uso: 'cria' },
];
const dados = montarMapaDoMes({
  anoMes: '2026-09', vigentes: P, nomeDaCategoria: () => 'Garrote',
  fechamentos: [
    { id: 'f1', pasto_id: 'p1', ano_mes: '2026-09', tipo_uso_mes: 'cria', status: 'fechado' },
    { id: 'f5', pasto_id: 'p5a', ano_mes: '2026-09', tipo_uso_mes: 'agricultura', status: 'fechado' },
    { id: 'fv', pasto_id: 'v', ano_mes: '2026-09', tipo_uso_mes: 'vedado', status: 'fechado' },
  ],
  itens: [{ fechamento_id: 'f1', quantidade: 100, peso_medio_kg: 300, categoria_id: 'c' }],
});
const area = (id: string) => P.find(p => p.id === id)?.area_produtiva_ha;

describe('o resumo conta só a pecuária do mês', () => {
  it('a lavoura (pelo fechamento) e a reserva (pelo cadastro, sem fechamento — D1) saem; o vedado fica', () => {
    expect(dados.get('p5a')).toMatchObject({ usoDoMes: 'agricultura', pecuaria: false });
    expect(dados.get('rl')).toMatchObject({ temFechamento: false, usoDoMes: 'reserva', pecuaria: false });
    expect(dados.get('v')).toMatchObject({ usoDoMes: 'vedado', pecuaria: true });
    const r = resumoDosPastos(P.map(p => p.id), dados, area);
    expect(r.area).toBe(150);
    expect(r.cabecas).toBe(100);
    expect(r.lotacao).toBe(200);
  });
  it('sem nenhum pasto de pecuária: tudo "—"', () => {
    expect(resumoDosPastos(['p5a', 'rl'], dados, area)).toEqual({ cabecas: null, pesoTotalKg: null, pesoMedio: null, lotacao: null, area: null });
  });
});

describe('a cor e a legenda de quem fica fora (D2/D3)', () => {
  const CAMADAS: CamadaDoMapa[] = ['situacao', 'kg_ha', 'atividade', 'cabecas', 'tipo_area'];
  it('a lavoura pinta a cor dela em TODA camada, sem fechamento inclusive — nunca vazio nem "sem dado"', () => {
    for (const c of CAMADAS) {
      expect(corDoPasto(c, { foraDaPecuaria: 'lavoura', temFechamento: true, kgHa: 0, cabecas: 0, faixa: 'vazio', atividade: 'agricultura' })).toBe(COR_FORA_DA_PECUARIA.lavoura);
      expect(corDoPasto(c, { foraDaPecuaria: 'ambiental', temFechamento: false, kgHa: null, cabecas: null, faixa: null, atividade: null })).toBe(COR_FORA_DA_PECUARIA.ambiental);
    }
  });
  it('a cor da lavoura é distinta das faixas (sublotado, ideal) e do vazio/sem dado; as famílias não se repetem', () => {
    const outras = [COR_DA_FAIXA.sublotado, COR_DA_FAIXA.ideal, COR_DA_FAIXA.vazio, COR_DA_FAIXA.carga_alta, COR_SEM_FECHAMENTO];
    expect(outras).not.toContain(COR_FORA_DA_PECUARIA.lavoura);
    expect(outras).not.toContain(COR_FORA_DA_PECUARIA.benfeitorias);
    expect(new Set(Object.values(COR_FORA_DA_PECUARIA)).size).toBe(Object.keys(COR_FORA_DA_PECUARIA).length);
  });
  it('a legenda ganha as famílias presentes antes do "sem fechamento"; no Tipo de área a reserva não se repete', () => {
    const sit = legendaDaCamada('situacao', [], ['ambiental', 'lavoura']).map(i => i.rotulo);
    expect(sit.slice(-3)).toEqual(['Lavoura', 'Reserva legal / APP', 'Sem fechamento no mês']);
    const tipo = legendaDaCamada('tipo_area', [], ['lavoura', 'ambiental']).map(i => i.rotulo);
    expect(tipo.filter(r => r === 'Reserva legal / APP')).toHaveLength(1);
    expect(tipo).toContain('Lavoura');
    expect(legendaDaCamada('kg_ha', [])).toEqual(legendaDaCamada('kg_ha', [], []));
  });
});
