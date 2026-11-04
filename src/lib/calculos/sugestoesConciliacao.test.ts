/**
 * FECH-AJUSTE-INVENTARIO-01 — o "Ver sugestões" nunca escreve "null" e usa a mesma regra do botão Fechar (lado vazio = 0).
 */
import { describe, expect, it } from 'vitest';
import { diferencaDaLinha, gerarSugestoes, type RowData } from './sugestoesConciliacao';

const catMap = new Map([
  ['mamotes_m', 'Mamotes M'], ['desmama_m', 'Desmama M'], ['garrotes', 'Garrotes'], ['bois', 'Bois'], ['touros', 'Touros'],
  ['mamotes_f', 'Mamotes F'], ['desmama_f', 'Desmama F'], ['novilhas', 'Novilhas'], ['vacas', 'Vacas'],
]);
const linha = (codigo: string, qtdPasto: number | null, qtdSistema: number | null): RowData => ({
  codigo, nome: catMap.get(codigo) ?? codigo, qtdPasto, qtdSistema,
  diferenca: qtdPasto != null && qtdSistema != null ? qtdPasto - qtdSistema : null,
});

describe('gerarSugestoes', () => {
  it('S1 lado vazio conta como 0 (a regra do Fechar) e a frase nunca leva "null"', () => {
    // só no pasto (3 Desmama F contadas, nenhuma no sistema) e só no sistema (2 Novilhas no sistema, nenhuma no pasto)
    const s = gerarSugestoes([linha('desmama_f', 3, null), linha('novilhas', null, 2), linha('vacas', 13, 13)], catMap);
    expect(s.map(x => x.mensagem).join(' | ')).not.toMatch(/null|NaN|undefined/);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ tipo: 'evolucao', acao: { origemCodigo: 'novilhas', destinoCodigo: 'desmama_f', qtd: 2 } });
  });

  it('S2 só um lado, sem vizinho divergente: falta/excesso com o número certo', () => {
    const s = gerarSugestoes([linha('desmama_f', 3, null), linha('touros', null, 4)], catMap);
    expect(s.map(x => x.tipo).sort()).toEqual(['excesso', 'falta']);
    expect(s.find(x => x.tipo === 'falta')?.mensagem).toContain('Desmama F (-3 no sistema)');
    expect(s.find(x => x.tipo === 'excesso')?.mensagem).toContain('Touros (+4 no sistema)');
  });

  it('S3 o caso Sta. Tereza out/26: só Desmama M +41 → uma sugestão genérica, sem evolução', () => {
    const s = gerarSugestoes([
      linha('desmama_m', 320, 279), linha('garrotes', 393, 393), linha('bois', 35, 35), linha('touros', 1, 1),
      linha('mamotes_f', 2, 2), linha('vacas', 13, 13),
    ], catMap);
    expect(s).toHaveLength(1);
    expect(s[0].tipo).toBe('falta');
    expect(s[0].mensagem).toContain('Desmama M (-41 no sistema)');
  });

  it('S4 sem divergência (inclusive os dois lados vazios = 0) → nenhuma sugestão', () => {
    expect(gerarSugestoes([linha('vacas', 13, 13), linha('bois', null, 0), linha('mamotes_m', 0, null)], catMap)).toEqual([]);
  });

  it('S5 diferencaDaLinha respeita a diferença já calculada e completa a nula', () => {
    expect(diferencaDaLinha(linha('vacas', 10, 7))).toBe(3);
    expect(diferencaDaLinha(linha('vacas', null, 7))).toBe(-7);
    expect(diferencaDaLinha(linha('vacas', 5, null))).toBe(5);
  });
});
