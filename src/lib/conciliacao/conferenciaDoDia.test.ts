/** P159a — o que a Conferência desenha em cada dia: a ordem (D1), os filtros dos chips e as contagens. Dado sintético. */
import { describe, it, expect } from 'vitest';
import { itensDoDia, contagemDoDia, contagensDaMesa, rotuloDoDia } from './conferenciaDoDia';
import type { DiaConf, Pareado, EspSis, EspCandidato } from './mesaDoDia';
import type { EspOfx } from '@/components/conciliacao/TabelaExtratoDoMes';

const ofx = (id: string, valor: number): EspOfx => ({
  extrato_id: id, data: '2031-10-01', historico: id, documento: null, valor, status: 'conciliado', flag_dup: false, flag_investimento: false,
});
const sis = (id: string, valor: number): EspSis => ({
  lancamento_id: id, data: '2031-10-01', descricao: id, centro: null, subcentro: null, valor_assinado: valor, sinal: null, status: 'sem_vinculo',
});
const par = (id: string, valor: number, diferenca = 0): Pareado => ({
  extrato: ofx(id, valor), filhas: [], grupoId: null, tipoVencedor: null, soma: Math.abs(valor) - diferenca, diferenca, sobreAplicado: false,
});
const cand = (id: string, valor: number): EspCandidato => ({
  lancamento_id: id, data_vencimento: '2031-10-01', competencia: null, valor: Math.abs(valor), valor_assinado: valor, sinal: null,
  descricao: id, centro: null, subcentro: null, status_transacao: 'programado', cenario: 'realizado', cultura: null, numero_documento: null,
  tipo_documento: null, favorecido_id: null, fornecedor: null, safra_codigo: null, safra_descricao: null, vencido: false, ja_conciliado: false,
  sem_conta: false,
});
/* 01/10: casadas −260,95 e +5.000 (parcial, falta 100), sem par do banco −175 e −3,97, lançamento sem par −40.000, interna −10, candidato −99.000 */
const DIA: DiaConf = {
  data: '2031-10-01',
  pareados: [par('p260', -260.95), par('p5000', 5000, 100)],
  paredosN1: [],
  extratosSemPar: [ofx('e175', -175), ofx('e3', -3.97)],
  lancsSemPar: [sis('l40000', -40000)],
  internas: [sis('i10', -10)],
  candidatos: [cand('c99000', -99000)],
  restos: [],
  banco: 0, sistema: 0,
};
const ehParcial = (p: Pareado) => p.diferenca > 0.005;
const ids = (f: 'todos' | 'sem_par' | 'casados', mostrarCandidatos = true) => itensDoDia(DIA, f, { mostrarCandidatos, ehParcial }).map((i) => {
  switch (i.tipo) {
    case 'pareado': return i.p.extrato.extrato_id;
    case 'n1': return i.g.sis.lancamento_id;
    case 'extrato_sem_par': return i.e.extrato_id;
    case 'interna': case 'lanc_sem_par': return i.s.lancamento_id;
    case 'resto': return i.r.sis.lancamento_id;
    case 'candidato': return i.c.lancamento_id;
  }
});

describe('P159a — itensDoDia', () => {
  it('D1: o maior |valor| primeiro, casado e sem par misturados, entrada e saída sem separar; candidatos DEPOIS', () => {
    expect(ids('todos')).toEqual(['l40000', 'p5000', 'p260', 'e175', 'i10', 'e3', 'c99000']);
  });
  it('Sem par: o parcial fica, o casado inteiro sai; candidatos e internas ficam', () => {
    expect(ids('sem_par')).toEqual(['l40000', 'p5000', 'e175', 'i10', 'e3', 'c99000']);
  });
  it('Casados: só o casado (o parcial também é casado)', () => {
    expect(ids('casados')).toEqual(['p5000', 'p260']);
  });
  it('sem candidatos (o modal-fecho), nenhum candidato', () => {
    expect(ids('todos', false)).not.toContain('c99000');
  });
});

describe('P159a — contagens', () => {
  it('do dia: movimentos = linhas do BANCO; sem par = banco + sistema + parcial', () => {
    expect(contagemDoDia(DIA, ehParcial)).toEqual({ movimentos: 4, semPar: 4 });
  });
  it('dos chips: Casados (banco casado, sem o parcial) · Sem par · Todos (+ internas)', () => {
    expect(contagensDaMesa([DIA, DIA], ehParcial)).toEqual({ todos: 12, casados: 2, semPar: 8 });
  });
  it('rótulo do dia com o dia da semana', () => {
    expect(rotuloDoDia('2026-10-01')).toBe('Quinta-feira · 01/10');
    expect(rotuloDoDia(null)).toBe('sem data');
  });
});
