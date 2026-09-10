/**
 * O contrato do endereço — PR-SELETOR-PERIODO-02.
 *
 * ⚠ O QUE ESTES TESTES PROTEGEM É UM LINK JÁ COMPARTILHADO. O formato mudou de
 * `f_ano`/`f_mes` para `f_de`/`f_ate`, e todo endereço no formato antigo tem de continuar
 * abrindo no mesmo recorte — inclusive o `f_mes=0` que significava "o ano inteiro".
 */
import { describe, it, expect } from 'vitest';
import { act, render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { usePeriodoUrl } from './usePeriodoUrl';
import { anoInteiro, mesUnico, type Periodo } from '@/v2/lib/periodo';

function montar(url: string, padrao: Periodo) {
  const visto: { periodo?: Periodo; busca?: string; definir?: (p: Periodo) => void } = {};
  function Sonda() {
    const [periodo, definir] = usePeriodoUrl(padrao);
    visto.periodo = periodo;
    visto.definir = definir;
    visto.busca = useLocation().search;
    return null;
  }
  render(<MemoryRouter initialEntries={[url]}><Sonda /></MemoryRouter>);
  return visto;
}

const PADRAO_MES = mesUnico(2026, 9);

describe('formato novo', () => {
  it('lê `f_de`/`f_ate` como intervalo', () => {
    const v = montar('/x?f_de=2026-02&f_ate=2026-04', PADRAO_MES);
    expect(v.periodo).toEqual({ de: { ano: 2026, mes: 2 }, ate: { ano: 2026, mes: 4 } });
  });

  it('lê intervalo entre anos', () => {
    const v = montar('/x?f_de=2024-01&f_ate=2025-12', PADRAO_MES);
    expect(v.periodo).toEqual({ de: { ano: 2024, mes: 1 }, ate: { ano: 2025, mes: 12 } });
  });

  it('endereço invertido é ordenado na leitura, não filtra zero', () => {
    const v = montar('/x?f_de=2026-09&f_ate=2026-03', PADRAO_MES);
    expect(v.periodo).toEqual({ de: { ano: 2026, mes: 3 }, ate: { ano: 2026, mes: 9 } });
  });

  it('endereço sem período nenhum abre no padrão da tela', () => {
    const v = montar('/x', PADRAO_MES);
    expect(v.periodo).toEqual(PADRAO_MES);
    expect(v.busca).toBe('');
  });

  it('valor corrompido cai no padrão em vez de num mês inexistente', () => {
    expect(montar('/x?f_de=2026-13&f_ate=2026-14', PADRAO_MES).periodo).toEqual(PADRAO_MES);
    expect(montar('/x?f_de=lixo&f_ate=2026-04', PADRAO_MES).periodo).toEqual(PADRAO_MES);
  });
});

describe('formato antigo — o link já compartilhado', () => {
  it('`f_ano`+`f_mes` viram um mês só', () => {
    const v = montar('/x?f_ano=2026&f_mes=3', PADRAO_MES);
    expect(v.periodo).toEqual(mesUnico(2026, 3));
  });

  it('`f_mes=0` era "o ano inteiro" e vira janeiro→dezembro', () => {
    const v = montar('/x?f_ano=2025&f_mes=0', PADRAO_MES);
    expect(v.periodo).toEqual(anoInteiro(2025));
  });

  it('`f_ano` sozinho troca o ANO e preserva o recorte de meses da tela', () => {
    /* ⚠ Três telas só têm seletor de ano e nunca escreveram `f_mes`; lê-las como o ano
       inteiro mudaria o recorte de quem só trocou de ano. */
    const v = montar('/x?f_ano=2024', PADRAO_MES);
    expect(v.periodo).toEqual(mesUnico(2024, 9));

    const vAno = montar('/x?f_ano=2024', anoInteiro(2026));
    expect(vAno.periodo).toEqual(anoInteiro(2024));
  });

  it('o endereço antigo se corrige sozinho, e o novo não sobra com o velho', () => {
    const v = montar('/x?f_ano=2026&f_mes=3', PADRAO_MES);
    expect(v.busca).not.toContain('f_ano');
    expect(v.busca).not.toContain('f_mes=');
    expect(v.busca).toContain('f_de=2026-03');
    expect(v.busca).toContain('f_ate=2026-03');
  });

  it('convertido para o próprio padrão, o endereço fica limpo', () => {
    const v = montar('/x?f_ano=2026&f_mes=9', PADRAO_MES);
    expect(v.busca).toBe('');
  });

  it('o formato novo tem precedência sobre o antigo', () => {
    const v = montar('/x?f_de=2026-05&f_ate=2026-05&f_ano=2020&f_mes=1', PADRAO_MES);
    expect(v.periodo).toEqual(mesUnico(2026, 5));
  });
});

describe('escrita', () => {
  it('grava o intervalo no formato novo', () => {
    const v = montar('/x', PADRAO_MES);
    act(() => v.definir!({ de: { ano: 2026, mes: 2 }, ate: { ano: 2026, mes: 4 } }));
    expect(v.busca).toContain('f_de=2026-02');
    expect(v.busca).toContain('f_ate=2026-04');
    expect(v.periodo).toEqual({ de: { ano: 2026, mes: 2 }, ate: { ano: 2026, mes: 4 } });
  });

  it('voltar ao padrão limpa o endereço — "URL limpa" segue significando "filtro padrão"', () => {
    const v = montar('/x?f_de=2026-02&f_ate=2026-04', PADRAO_MES);
    act(() => v.definir!(PADRAO_MES));
    expect(v.busca).toBe('');
  });

  it('grava ordenado mesmo quando o fim é clicado antes do início', () => {
    const v = montar('/x', PADRAO_MES);
    act(() => v.definir!({ de: { ano: 2026, mes: 9 }, ate: { ano: 2026, mes: 3 } }));
    expect(v.busca).toContain('f_de=2026-03');
    expect(v.busca).toContain('f_ate=2026-09');
  });

  it('não deixa o formato antigo para trás', () => {
    const v = montar('/x?outro=1&f_ano=2020&f_mes=1', PADRAO_MES);
    act(() => v.definir!(mesUnico(2026, 5)));
    expect(v.busca).not.toContain('f_ano');
    expect(v.busca).not.toContain('f_mes');
    expect(v.busca).toContain('outro=1');
  });
});
