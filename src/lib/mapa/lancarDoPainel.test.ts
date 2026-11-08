/** MAPA-LOTES-01 fatia 1 (A) — o botão do painel do pasto no Geo pastos só ABRE o modal do P1; a regra de qual card e quando. */
import { describe, it, expect } from 'vitest';
import { lancarDoPainel, ROTULO_LANCAR, ROTULO_VER } from './lancarDoPainel';
import type { DadosDoPastoNoMes } from './mapaDoMes';

const dados = (fechado: boolean | null, temFechamento = fechado !== null): DadosDoPastoNoMes => ({
  pastoId: 'p1', temFechamento, fechado, cabecas: null, pesoTotalKg: null, pesoMedioKg: null, kgHa: null, faixa: null, atividade: null,
  usoDoMes: null, pecuaria: true, categorias: [], categoriaPrincipalId: null, ultimoFechamento: null, historico: [],
});

describe('lancarDoPainel', () => {
  it('fora da vigência (sem dado do mês): desligado, com o motivo escrito', () => {
    expect(lancarDoPainel({ pastoId: 'p1', dados: null, divisoes: [], mes: '09/26' }))
      .toEqual({ tipo: 'bloqueado', rotulo: ROTULO_LANCAR, motivo: 'Fora da vigência em 09/26' });
  });
  it('card aberto ou sem card no mês: "Lançar no fechamento" no próprio pasto', () => {
    expect(lancarDoPainel({ pastoId: 'p1', dados: dados(false), divisoes: [], mes: '10/26' })).toEqual({ tipo: 'um', rotulo: ROTULO_LANCAR, pastoId: 'p1' });
    expect(lancarDoPainel({ pastoId: 'p1', dados: dados(null), divisoes: [], mes: '10/26' })).toEqual({ tipo: 'um', rotulo: ROTULO_LANCAR, pastoId: 'p1' });
  });
  it('card do mês fechado: "Ver fechamento" (o modal abre só leitura)', () => {
    expect(lancarDoPainel({ pastoId: 'p1', dados: dados(true), divisoes: [], mes: '09/26' })).toEqual({ tipo: 'um', rotulo: ROTULO_VER, pastoId: 'p1' });
  });
  it('unidade com divisões: escolher a divisão (o Fechamento conta por divisão), na ordem recebida', () => {
    const r = lancarDoPainel({ pastoId: 'p10', dados: dados(false), divisoes: [{ pastoId: 'a', nome: 'P10A' }, { pastoId: 'b', nome: 'P10B' }], mes: '10/26' });
    expect(r).toEqual({ tipo: 'divisoes', rotulo: ROTULO_LANCAR, opcoes: [{ pastoId: 'a', nome: 'P10A' }, { pastoId: 'b', nome: 'P10B' }] });
  });
});
