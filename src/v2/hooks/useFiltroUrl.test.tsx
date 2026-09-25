/**
 * O FILTRO DA URL NÃO PODE ALIMENTAR O PRÓPRIO RENDER — OC-URL-RAJADA-01.
 *
 * ⚠ NASCE DE UM CLIQUE QUE NÃO ABRIA, e a causa não estava em quem abre. Medido em
 * 25/09/2026, na Central de Operações Comerciais com `?f_ord=data:asc` no endereço: fechar
 * uma OC disparava de 30 a 200 reescritas de URL em ~4 s, e a linha da lista só reaparecia
 * aos 3993 ms. Clicar numa linha dentro dessa janela escrevia `oc_venda`/`oc_id` e a
 * reescrita seguinte os apagava — a tela trocava de seção e o modal nunca montava, sem
 * toast e sem erro no console. Depois da correção: **1 escrita**, linha de volta em 991 ms,
 * e o clique imediato abre.
 *
 * ⚠ A CAUSA ERA IDENTIDADE, NÃO CLOSURE. `ORD.ler` devolve `{col, dir}` — objeto NOVO a
 * cada chamada —, e o hook recalculava o valor em todo render. O `useEffect` que zera a
 * página (`CentralOperacoesComerciais.tsx:626`) lista `ord` nas dependências: identidade
 * nova a cada render = efeito a cada render = escrita na URL = render seguinte. Sem
 * `f_ord`, o valor é o padrão `null`, primitivo e estável, e a rajada não existia — era
 * exatamente essa a diferença entre o endereço que falhava e o que funcionava.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useFiltroUrl } from '@/v2/hooks/useFiltroUrl';

type Ord = { col: string; dir: 'asc' | 'desc' } | null;

/** O codec REAL da Central, copiado para o teste exercitar o caso que quebrou. */
const ORD = {
  ler: (b: string): Ord => {
    const [col, dir] = b.split(':');
    return col && (dir === 'asc' || dir === 'desc') ? { col, dir } : null;
  },
  escrever: (v: Ord) => (v ? `${v.col}:${v.dir}` : ''),
};

const wrapper = ({ children }: { children: ReactNode }) => <BrowserRouter>{children}</BrowserRouter>;

const irPara = (search: string) => window.history.replaceState(null, '', `/${search}`);

afterEach(() => { irPara(''); vi.restoreAllMocks(); });

describe('useFiltroUrl — identidade do valor', () => {
  it('codec que devolve OBJETO mantém a MESMA referência entre renders', () => {
    /* ⚠ É a regra inteira. Referência nova a cada render faz qualquer `useEffect` que
       dependa deste valor rodar sempre — e se o efeito escreve na URL, o laço se fecha. */
    irPara('?f_ord=data:asc');
    const { result, rerender } = renderHook(
      () => useFiltroUrl<Ord>('f_ord', null, ORD.ler, ORD.escrever), { wrapper });

    const primeiro = result.current[0];
    rerender();
    rerender();

    expect(result.current[0]).toEqual({ col: 'data', dir: 'asc' });
    expect(result.current[0]).toBe(primeiro);
  });

  it('o valor MUDA de referência quando o parâmetro muda — o memo não congela o filtro', () => {
    /* ⚠ Sem este caso, um `useMemo` com dependência errada passaria verde e a tela pararia
       de responder ao filtro: trocaríamos um laço por um congelamento. */
    irPara('?f_ord=data:asc');
    const { result, rerender } = renderHook(
      () => useFiltroUrl<Ord>('f_ord', null, ORD.ler, ORD.escrever), { wrapper });
    const antes = result.current[0];

    act(() => { result.current[1]({ col: 'valor', dir: 'desc' }); });
    rerender();

    expect(result.current[0]).not.toBe(antes);
    expect(result.current[0]).toEqual({ col: 'valor', dir: 'desc' });
  });

  it('sem o parâmetro, o padrão sai estável — o caso que NÃO falhava', () => {
    irPara('');
    const { result, rerender } = renderHook(
      () => useFiltroUrl<Ord>('f_ord', null, ORD.ler, ORD.escrever), { wrapper });
    const primeiro = result.current[0];
    rerender();
    expect(result.current[0]).toBe(primeiro);
    expect(result.current[0]).toBeNull();
  });
});

describe('useFiltroUrl — guarda de igualdade', () => {
  it('gravar o valor que JÁ está na URL não navega', () => {
    irPara('?f_ord=data:asc');
    const { result } = renderHook(
      () => useFiltroUrl<Ord>('f_ord', null, ORD.ler, ORD.escrever), { wrapper });
    /* ⚠ O ESPIÃO ENTRA DEPOIS DA MONTAGEM: o react-router chama `replaceState` uma vez ao
       montar, para carimbar o índice do histórico, e contá-la mediria o router, não o hook. */
    const espia = vi.spyOn(window.history, 'replaceState');

    act(() => { result.current[1]({ col: 'data', dir: 'asc' }); });

    expect(espia).not.toHaveBeenCalled();
  });

  it('gravar valor DIFERENTE navega — a guarda não pode emudecer o filtro', () => {
    /* ⚠ Anda junto com o anterior de propósito: afirmar só "não navegou" passaria verde
       numa guarda que bloqueasse TODA escrita, e aí o filtro pararia de funcionar. */
    irPara('?f_ord=data:asc');
    const { result } = renderHook(
      () => useFiltroUrl<Ord>('f_ord', null, ORD.ler, ORD.escrever), { wrapper });
    const espia = vi.spyOn(window.history, 'replaceState');

    act(() => { result.current[1]({ col: 'valor', dir: 'desc' }); });

    expect(espia).toHaveBeenCalled();
  });

  it('voltar ao PADRÃO apaga o parâmetro, e isso é mudança', () => {
    irPara('?f_ord=data:asc');
    const { result } = renderHook(
      () => useFiltroUrl<Ord>('f_ord', null, ORD.ler, ORD.escrever), { wrapper });

    act(() => { result.current[1](null); });

    expect(new URLSearchParams(window.location.search).has('f_ord')).toBe(false);
    expect(result.current[0]).toBeNull();
  });
});
