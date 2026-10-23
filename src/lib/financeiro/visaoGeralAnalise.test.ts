/**
 * PR 4 — a NAVEGAÇÃO do modal de análise (nunca soma: só escolhe os caminhos que o banco devolveu).
 *   N1 abre na aba e no nível clicados (raiz: foco na raiz; grupo: aba e foco no grupo)
 *   N2 esquerda escolhe o foco (o item do gráfico volta ao foco); direita escolhe o item e, clicada de novo, volta ao foco
 *   N3 ‹ › anda entre os irmãos do item, dando a volta; sem item escolhido, o FOCO anda — e no 1º nível a aba anda junto
 *   N4 o caminho do gráfico: raiz e grupo trocam a aba; abaixo, o nível vira o foco; "abrir" desce até o subcentro e para
 *   N5 a régua: a marca na razão do banco, dentro de 0–100, e nada sem meta
 */
import { describe, it, expect } from 'vitest';
import {
  andarEntreIrmaos, descer, escolherNaDireita, escolherNaEsquerda, estadoInicialAnalise, irParaAba, irParaCaminho, posicaoNaRegua,
} from '@/lib/financeiro/visaoGeralAnalise';

const base = estadoInicialAnalise('saida', null, '2026-09');

describe('navegação do modal de análise', () => {
  it('N1 abre na aba clicada', () => {
    expect(base).toMatchObject({ aba: null, foco: [], grafico: null, criterio: 'mes', unidade: 'rs', am: '2026-09' });
    expect(estadoInicialAnalise('saida', 'Custeio', '2026-09')).toMatchObject({ aba: 'Custeio', foco: ['Custeio'], grafico: null });
  });
  it('N2 esquerda = foco; direita = item, de novo = volta ao foco', () => {
    const a = escolherNaEsquerda({ ...base, grafico: ['Juros'] }, ['Custeio']);
    expect(a).toMatchObject({ foco: ['Custeio'], grafico: null });
    const b = escolherNaDireita(a, ['Custeio', 'pecuaria']);
    expect(b.grafico).toEqual(['Custeio', 'pecuaria']);
    expect(escolherNaDireita(b, ['Custeio', 'pecuaria']).grafico).toBeNull();
  });
  it('N3 ‹ › entre irmãos, com volta; o foco anda e a aba vai junto no 1º nível', () => {
    const irm = [['Custeio', 'pecuaria'], ['Custeio', 'agricultura'], ['Custeio', null]];
    const e = { ...base, aba: 'Custeio', foco: ['Custeio'], grafico: ['Custeio', 'agricultura'] };
    expect(andarEntreIrmaos(e, irm, 1).grafico).toEqual(['Custeio', null]);
    expect(andarEntreIrmaos(e, irm, -1).grafico).toEqual(['Custeio', 'pecuaria']);
    expect(andarEntreIrmaos({ ...e, grafico: ['Custeio', null] }, irm, 1).grafico).toEqual(['Custeio', 'pecuaria']);
    /* sem item: o foco anda */
    const f = { ...base, aba: 'Custeio', foco: ['Custeio', 'pecuaria'], grafico: null };
    expect(andarEntreIrmaos(f, irm, 1)).toMatchObject({ aba: 'Custeio', foco: ['Custeio', 'agricultura'] });
    /* foco = o grupo da aba: andar troca a aba */
    const g = { ...base, aba: 'Custeio', foco: ['Custeio'], grafico: null };
    expect(andarEntreIrmaos(g, [['Custeio'], ['Juros']], 1)).toMatchObject({ aba: 'Juros', foco: ['Juros'], grafico: null });
    /* na raiz, o foco anda sem trocar a aba */
    expect(andarEntreIrmaos({ ...base, foco: ['Custeio'] }, [['Custeio'], ['Juros']], 1)).toMatchObject({ aba: null, foco: ['Juros'] });
    expect(andarEntreIrmaos(e, [['Custeio', 'pecuaria']], 1)).toBe(e);
  });
  it('N4 caminho e "abrir"', () => {
    const e = { ...base, aba: 'Custeio', foco: ['Custeio', 'pecuaria', 'Nutrição'], grafico: ['Custeio', 'pecuaria', 'Nutrição', 'Sal'] };
    expect(irParaCaminho(e, [])).toMatchObject({ aba: null, foco: [], grafico: null });
    expect(irParaCaminho(e, ['Custeio'])).toMatchObject({ aba: 'Custeio', foco: ['Custeio'], grafico: null });
    expect(irParaCaminho(e, ['Custeio', 'pecuaria'])).toMatchObject({ aba: 'Custeio', foco: ['Custeio', 'pecuaria'], grafico: null });
    expect(descer(e, ['Custeio', 'pecuaria', 'Nutrição'])).toMatchObject({ foco: ['Custeio', 'pecuaria', 'Nutrição'], grafico: null });
    expect(descer(e, ['Custeio', 'pecuaria', 'Nutrição', 'Sal'])).toBe(e);
    expect(irParaAba(e, 'Juros')).toMatchObject({ aba: 'Juros', foco: ['Juros'], grafico: null, criterio: 'mes' });
  });
  it('N5 régua', () => {
    expect(posicaoNaRegua('saida', null)).toBeNull();
    expect(posicaoNaRegua('saida', 0.45)).toBeCloseTo(18);
    expect(posicaoNaRegua('saida', 1)).toBeCloseTo(54);
    expect(posicaoNaRegua('saida', 9)).toBe(100);
    expect(posicaoNaRegua('entrada', 1)).toBeCloseTo(54);
    expect(posicaoNaRegua('entrada', 0.2)).toBe(100);
    expect(posicaoNaRegua('entrada', 3)).toBe(0);
  });
});
