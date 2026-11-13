import { describe, expect, it } from 'vitest';
import {
  faixaDaLinha, fraseDoAviso, lerPreviaDaLinha, lerTelaDaLinha, opcoesDeLinha, pedidoDaLinha, rotuloDaLinha, formDaLinhaVazio,
  type LinhaDoCadastro,
} from './linhaDeCredito';

const linha = (p: Partial<LinhaDoCadastro>): LinhaDoCadastro => ({
  id: 'l', credorId: null, credorNome: null, numero: null, programa: null, descricao: null, limite: null,
  vigenciaInicio: null, vigenciaFim: null, cancelada: false, ...p,
});

describe('rotuloDaLinha', () => {
  it('nº primeiro, depois o programa (ou a descrição)', () => {
    expect(rotuloDaLinha({ numero: 'PR-1', programa: 'FCO', descricao: 'x' })).toBe('PR-1 · FCO');
    expect(rotuloDaLinha({ numero: null, programa: null, descricao: 'Armazém' })).toBe('Armazém');
    expect(rotuloDaLinha({ numero: '  ', programa: null, descricao: null })).toBe('Linha de crédito');
  });
});

describe('opcoesDeLinha', () => {
  const ls = [
    linha({ id: 'a', numero: 'Z-9', credorId: 'b2', credorNome: 'Banco 2' }),
    linha({ id: 'b', numero: 'A-1', credorId: 'b1', credorNome: 'Banco 1' }),
    linha({ id: 'c', numero: 'B-2', credorId: 'b1', credorNome: 'Banco 1', cancelada: true }),
    linha({ id: 'd', numero: 'M-5', credorId: 'b2', credorNome: 'Banco 2' }),
  ];
  it('só as vivas; as do mesmo banco do contrato primeiro, cada bloco por rótulo', () => {
    expect(opcoesDeLinha(ls, 'b2').map((o) => o.value)).toEqual(['d', 'a', 'b']);
    expect(opcoesDeLinha(ls, null).map((o) => o.value)).toEqual(['b', 'd', 'a']);
  });
  it('o rótulo leva o banco; a cancelada só aparece se for a do contrato, marcada', () => {
    expect(opcoesDeLinha(ls, 'b1')[0].label).toBe('A-1 · Banco 1');
    const comAtual = opcoesDeLinha(ls, 'b1', 'c');
    expect(comAtual.find((o) => o.value === 'c')?.label).toBe('B-2 · Banco 1 (cancelada)');
  });
});

describe('lerTelaDaLinha', () => {
  const resposta = {
    linha: { id: 'L1', credor_id: 'cr', credor: 'Banco BRDE', numero: 'PR-78.179', programa: 'FCO', descricao: null, limite: '7200000', vigencia_inicio: null, vigencia_fim: null },
    contratos: [{ id: 'c1', numero: 'P-012', descricao: 'plano', status: 'ativo', contratado: 1000, liberado: 900, liberado_por_liquidacao: 0, saldo: 900, juros_pagos: 10, credor_diferente: false },
                { semId: true }],
    totais: { contratos: 1, contratado: 1000, liberado: 900, liberado_por_liquidacao: 200, falta_liberar: 7199100, saldo: 900, juros_pagos: 10 },
    avisos: [{ codigo: 'contrato_de_outro_credor' }],
  };
  it('lê números em texto ou número; descarta contrato sem id', () => {
    const t = lerTelaDaLinha(resposta);
    expect(t?.linha.limite).toBe(7200000);
    expect(t?.contratos).toHaveLength(1);
    expect(t?.totais.liberadoPorLiquidacao).toBe(200);
    expect(t?.avisos).toEqual(['contrato_de_outro_credor']);
  });
  it('fora do formato = null (nunca inventa)', () => {
    expect(lerTelaDaLinha(null)).toBeNull();
    expect(lerTelaDaLinha({ linha: { id: 'x' } })).toBeNull();
    expect(lerTelaDaLinha({ ...resposta, totais: { ...resposta.totais, falta_liberar: null } })?.totais.faltaLiberar).toBeNull();
  });
});

describe('pedidoDaLinha', () => {
  it('os 7 campos, texto aparado, vazio = null', () => {
    expect(pedidoDaLinha({ ...formDaLinhaVazio('cr'), numero: ' PR-1 ', limite: 10 })).toEqual({
      credor_id: 'cr', numero: 'PR-1', programa: null, descricao: null, limite: 10, vigencia_inicio: null, vigencia_fim: null,
    });
  });
});

describe('lerPreviaDaLinha', () => {
  it('criação: antes vazio, depois com os campos preenchidos; banco pelo nome', () => {
    const p = lerPreviaDaLinha({ ok: true, simulado: true, id: null, antes: null,
      depois: { credor_id: 'cr', numero: 'PR-1', programa: null, descricao: null, limite: 1000, vigencia_inicio: '2025-10-24', vigencia_fim: null }, avisos: [] },
    (id) => (id === 'cr' ? 'Banco BRDE' : null));
    expect(p?.mudancas).toEqual([
      { campo: 'Banco', antes: null, depois: 'Banco BRDE' },
      { campo: 'Nº da cédula', antes: null, depois: 'PR-1' },
      { campo: 'Limite', antes: null, depois: 'R$ 1.000,00' },
      { campo: 'Início da vigência', antes: null, depois: '24/10/2025' },
    ]);
  });
  it('edição: só o que muda; recusa e avisos em frase', () => {
    const p = lerPreviaDaLinha({ ok: true, antes: { numero: 'A', limite: 10 }, depois: { numero: 'A', limite: 20 }, avisos: [{ codigo: 'contratado_maior_que_limite' }] });
    expect(p?.mudancas).toEqual([{ campo: 'Limite', antes: 'R$ 10,00', depois: 'R$ 20,00' }]);
    expect(p?.avisos).toEqual(['A soma dos contratos da linha passa do limite.']);
    expect(lerPreviaDaLinha({ ok: false, recusa: { frase: 'Escolha o banco (credor) da linha de crédito.' } })?.recusa).toBe('Escolha o banco (credor) da linha de crédito.');
    expect(lerPreviaDaLinha({ nada: 1 })).toBeNull();
  });
});

describe('faixaDaLinha', () => {
  const t = { contratos: 1, contratado: 1000, liberado: 900, liberadoPorLiquidacao: 0, faltaLiberar: 100, saldo: 900, jurosPagos: 10 };
  it('liberado e juros em verde; falta e saldo em vermelho quando > 0', () => {
    expect(faixaDaLinha(t, 1000).map((i) => [i.rotulo, i.tom])).toEqual([
      ['Limite', 'neutro'], ['Liberado', 'verde'], ['Falta liberar', 'vermelho'], ['Saldo devedor', 'vermelho'], ['Juros pagos', 'verde'],
    ]);
  });
  it('sem limite: "—" (dado ausente), nunca zero', () => {
    const f = faixaDaLinha({ ...t, faltaLiberar: null }, null);
    expect(f[0].valor).toBe('—');
    expect(f[2]).toEqual({ rotulo: 'Falta liberar', valor: '—', tom: 'neutro' });
  });
  it('saldo zero não pinta de vermelho', () => {
    expect(faixaDaLinha({ ...t, saldo: 0, faltaLiberar: 0 }, 900)[3].tom).toBe('neutro');
  });
});

describe('fraseDoAviso', () => {
  it('código desconhecido aparece cru (nunca some)', () => {
    expect(fraseDoAviso('novo_aviso')).toBe('novo_aviso');
  });
});
