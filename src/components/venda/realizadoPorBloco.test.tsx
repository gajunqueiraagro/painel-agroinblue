/**
 * OC-BOITEL-REALIZADO-UX-01 — o realizado se cobra por FATO, bloco a bloco, e o Aplicar nao grava.
 *
 * ⚠ NASCE DA OC 1f622857 (26/09/2026): o Aplicar do bloco A chamava `oc_salvar_boitel`, o dialogo
 *   fechava antes da resposta, e a recusa — por campos do bloco B e por premissas da projecao
 *   (GMD, rendimento) — chegava num toast no canto, com o estado voltando atras.
 * ⚠ OS FATOS SAO OS SEIS DA TRAVA DO BANCO no cenario 'realizado' (migration 20261027153000), com
 *   os rotulos da tela. As quatro derivacoes e a recusa do banco sao regra de SQL e estao provadas
 *   em `supabase/tests/oc_boitel_realizado_ux_01_test.sql`; este arquivo trava o que a TELA faz.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  BoitelBlocosModais, boitelVazio, faltamDoRealizado, pendenciaDoRealizado,
} from '@/components/venda/BoitelBlocosModais';
import type { BoitelEdicao } from '@/components/venda/BoitelNegociacaoDerivado';

/* A projecao da Vera b58bf556 (110 cab, 104 dias), e o realizado como ele NASCE: copia dela,
   sem nenhum fato do papel. */
const PROJETADO: BoitelEdicao = {
  ...boitelVazio(),
  qtdCabecas: 110, pesoInicial: 408, dias: 104, gmd: 1.5, rendimentoEntrada: 50, rendimento: 55,
  custoDiaria: 18.5, precoVendaArroba: 330,
};
const SEMENTE: BoitelEdicao = { ...PROJETADO };
/* Os seis fatos do papel da b58bf556. */
const FATOS = {
  qtdAbatida: 109, dias: 104, pesoVivoTotalAbate: 62075.5, arrobasTotaisAbate: 2251.67,
  valorTotalDiarias: 214590.48, valorTotalAbate: 813771.01,
};

describe('faltamDoRealizado — so fato conta', () => {
  it('a semente copiada da projecao nao tem fato: bloco A pede quatro, bloco B pede o valor do abate', () => {
    expect(faltamDoRealizado(SEMENTE, 'A').map(f => f.rotulo))
      .toEqual(['Cabeças abatidas', 'Peso vivo', 'Arrobas', 'Diárias']);
    expect(faltamDoRealizado(SEMENTE, 'B').map(f => f.rotulo)).toEqual(['Valor total do abate']);
    /* ⚠ GMD, RENDIMENTO, DIARIA E PRECO DA SEMENTE SAO > 0 e nao preenchem nada: sao premissa. */
    expect(SEMENTE.gmd).toBeGreaterThan(0);
    expect(faltamDoRealizado(SEMENTE)).toHaveLength(5);
  });

  it('com os seis fatos nao falta nada — e ZERO continua faltando (o banco exige > 0)', () => {
    expect(faltamDoRealizado({ ...SEMENTE, ...FATOS })).toEqual([]);
    expect(faltamDoRealizado({ ...SEMENTE, ...FATOS, arrobasTotaisAbate: 0 }).map(f => f.rotulo)).toEqual(['Arrobas']);
    expect(faltamDoRealizado({ ...SEMENTE, ...FATOS, dias: 0 }).map(f => f.rotulo)).toEqual(['Dias confinamento']);
  });

  it('a frase do rodape diz bloco e campo, na ordem da tela; sem pendencia, null', () => {
    expect(pendenciaDoRealizado({ ...SEMENTE, ...FATOS, pesoVivoTotalAbate: undefined, valorTotalAbate: undefined }))
      .toBe('Realizado incompleto — Desempenho e Custos: Peso vivo · Comercialização e Adiantamento: Valor total do abate.');
    expect(pendenciaDoRealizado({ ...SEMENTE, ...FATOS })).toBeNull();
    expect(pendenciaDoRealizado(null)).toBeNull();
  });
});

/* O cartao do realizado ja existe (rascunho semeado); o botao "Editar ..." do cartao REALIZADO e' o
   segundo de cada titulo — o primeiro e' o da projecao. */
function montar(realizado: BoitelEdicao) {
  const onChange = vi.fn();
  const onChangeRealizado = vi.fn();
  render(
    <BoitelBlocosModais valor={PROJETADO} onChange={onChange} cenario="projetado"
      realizado={realizado} onChangeRealizado={onChangeRealizado} onIniciarRealizado={() => Promise.resolve(true)} />,
  );
  return { onChange, onChangeRealizado };
}
const abrirRealizado = (titulo: string) => fireEvent.click(screen.getAllByRole('button', { name: `Editar ${titulo}` })[1]);
const campoPorTitulo = (titulo: string) => {
  const wrapper = screen.getByTitle(titulo).closest('div.min-w-0');
  if (!wrapper) throw new Error(`campo ${titulo} sem wrapper`);
  return wrapper;
};

describe('Aplicar do bloco do realizado', () => {
  it('com pendencia NAO fecha e NAO devolve nada; marca so os campos DESTE bloco e foca o primeiro', () => {
    const { onChangeRealizado } = montar(SEMENTE);
    abrirRealizado('Desempenho e Custos');
    /* antes de tentar, nada vermelho — o dialogo nao acusa quem acabou de abri-lo */
    expect(screen.queryAllByText(/Obrigatório no realizado/)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onChangeRealizado).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
    /* quatro do bloco A — o valor do abate (bloco B) NAO aparece aqui */
    expect(screen.getAllByText(/Obrigatório no realizado/)).toHaveLength(4);
    expect(screen.getByText('Falta Cabeças abatidas, Peso vivo, Arrobas, Diárias.')).toBeTruthy();
    const cab = campoPorTitulo('Cabeças efetivamente abatidas — do papel do frigorífico');
    expect(cab.hasAttribute('data-campo-erro')).toBe(true);
    expect(document.activeElement).toBe(within(cab as HTMLElement).getByRole('textbox'));
  });

  it('a marca e viva: o campo preenchido sai do vermelho sem novo clique', () => {
    montar(SEMENTE);
    abrirRealizado('Desempenho e Custos');
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    const cab = campoPorTitulo('Cabeças efetivamente abatidas — do papel do frigorífico');
    fireEvent.change(within(cab as HTMLElement).getByRole('textbox'), { target: { value: '109' } });
    expect(cab.hasAttribute('data-campo-erro')).toBe(false);
    expect(screen.getAllByText(/Obrigatório no realizado/)).toHaveLength(3);
  });

  it('bloco completo: devolve o rascunho com os fatos e fecha — o bloco B pendente nao o impede', () => {
    const { onChangeRealizado } = montar({ ...SEMENTE, ...FATOS, valorTotalAbate: undefined });
    abrirRealizado('Desempenho e Custos');
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onChangeRealizado).toHaveBeenCalledTimes(1);
    expect(onChangeRealizado.mock.calls[0][0]).toMatchObject({ qtdAbatida: 109, pesoVivoTotalAbate: 62075.5 });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('fato vazio aparece VAZIO, nunca com o numero da projecao nem "R$ 0,00"', () => {
    montar(SEMENTE);
    abrirRealizado('Comercialização e Adiantamento');
    const valor = campoPorTitulo('Valor total do abate (R$) — já líquido de bônus, tributos e descontos do frigorífico');
    expect((within(valor as HTMLElement).getByRole('textbox') as HTMLInputElement).value).toBe('');
    expect(valor.textContent).toContain('*');
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(screen.getAllByText(/Obrigatório no realizado/)).toHaveLength(1);
  });

  it('na PROJECAO nada disso vale: o Aplicar devolve e fecha como sempre', () => {
    const { onChange } = montar(SEMENTE);
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar Desempenho e Custos' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByText(/Obrigatório no realizado/)).toHaveLength(0);
  });
});
