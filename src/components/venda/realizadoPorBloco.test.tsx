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
import { readFileSync } from 'node:fs';
import {
  BoitelBlocosModais, boitelVazio, faltamDoRealizado, pendenciaDoRealizado, realizadoNaoSalvo,
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
const FRIGORIFICOS = [{ id: 'jbs', nome: 'JBS' }, { id: 'jbs-anastacio', nome: 'JBS - Anastacio' }];
function montar(realizado: BoitelEdicao) {
  const onChange = vi.fn();
  const onChangeRealizado = vi.fn();
  render(
    <BoitelBlocosModais valor={PROJETADO} onChange={onChange} cenario="projetado" frigorificos={FRIGORIFICOS}
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

  it('BOITEL-ABATE-PRODUTOR-01: na B o bloco Comercializacao cobra o Frigorifico; na A, nao', () => {
    montar({ ...SEMENTE, quemAbate: 'produtor', frigorificoId: '' });
    abrirRealizado('Comercialização e Adiantamento');
    expect(screen.getByRole('button', { name: 'Abate em nome do produtor' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(screen.getByText('Falta Frigorífico, Valor total do abate.')).toBeTruthy();
    /* na A o mesmo bloco nao tem campo de frigorifico — so' o valor do abate falta */
    const { onChangeRealizado } = montar({ ...SEMENTE, ...FATOS });
    expect(onChangeRealizado).not.toHaveBeenCalled();
    expect(faltamDoRealizado({ ...SEMENTE, ...FATOS }).map(f => f.rotulo)).toEqual([]);
    expect(faltamDoRealizado({ ...SEMENTE, ...FATOS, quemAbate: 'produtor' }).map(f => f.rotulo)).toEqual(['Frigorífico']);
  });

  it('na PROJECAO nada disso vale: o Aplicar devolve e fecha como sempre', () => {
    const { onChange } = montar(SEMENTE);
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar Desempenho e Custos' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByText(/Obrigatório no realizado/)).toHaveLength(0);
  });
});

/* OC-BOITEL-REALIZADO-UX-01b — fechar a venda so' pergunta com o realizado SUJO. A decisao e'
   `realizadoNaoSalvo`; montar a `LancamentosTab` inteira para clicar no X exigiria a pilha da
   OC toda, entao a ligacao no fechamento e' lida da FONTE (como em atalhosProducao.test). */
describe('aviso ao fechar a venda — realizado nao salvo', () => {
  const GRAVADO: BoitelEdicao = { ...SEMENTE, ...FATOS };

  it('abrir e fechar sem tocar nao avisa: com realizado (o mesmo objeto da carga), sem realizado, e com copia identica', () => {
    expect(realizadoNaoSalvo(GRAVADO, GRAVADO)).toBe(false);
    expect(realizadoNaoSalvo(null, null)).toBe(false);
    expect(realizadoNaoSalvo(null, GRAVADO)).toBe(false);
    /* identidade nao conta, so' o payload: a carga e o enxerto dos lotes criam objetos novos */
    expect(realizadoNaoSalvo({ ...GRAVADO }, GRAVADO)).toBe(false);
  });

  it('sujo avisa: um Aplicar trocou um fato, ou criou o realizado que o banco nao tinha', () => {
    expect(realizadoNaoSalvo({ ...GRAVADO, arrobasTotaisAbate: 2251.68 }, GRAVADO)).toBe(true);
    expect(realizadoNaoSalvo(GRAVADO, null)).toBe(true);
  });

  it('depois do Salvar (salvo = rascunho) nao avisa mais', () => {
    const rascunho = { ...GRAVADO, valorTotalAbate: 813771.02 };
    expect(realizadoNaoSalvo(rascunho, GRAVADO)).toBe(true);
    const salvoDepois = rascunho;           // `setOcBoitelRealSalvo(ocBoitelReal)` no sucesso
    expect(realizadoNaoSalvo(rascunho, salvoDepois)).toBe(false);
  });

  it('o fechamento da venda consulta o realizado sujo ANTES de fechar, e so' + "'" + ' na venda', () => {
    const fonte = readFileSync('src/pages/LancamentosTab.tsx', 'utf8');
    const corpo = fonte.slice(fonte.indexOf('const fecharModalOCComAutosave = useCallback('));
    const bloco = corpo.slice(0, corpo.indexOf('}, ['));
    expect(bloco).toMatch(/if \(modoOCVenda && realizadoSujo\) \{ setFecharRealizadoPendente\(true\); return; \}/);
    /* a pergunta vem ANTES do `fecharModalOC()` — senao o modal fecha e o aviso chega tarde */
    expect(bloco.indexOf('setFecharRealizadoPendente(true)')).toBeLessThan(bloco.indexOf('fecharModalOC();'));
    expect(fonte).toContain('Realizado do boitel não salvo');
    expect(fonte).toContain('>Continuar editando</AlertDialogCancel>');
    expect(fonte).toContain('>Descartar e fechar</AlertDialogAction>');
  });
});

/* BOITEL-ABATE-PRODUTOR-01b — o dialogo de Comercializacao da B, homologado pelo Gabriel na 77d963be (26/09 09:04). */
describe('dialogo Comercializacao — A x B (01b)', () => {
  it('B: o Adiantamento some e "Quem abate" fica na coluna direita; A: os dois paineis', () => {
    montar({ ...SEMENTE, ...FATOS, quemAbate: 'produtor', frigorificoId: 'jbs' });
    abrirRealizado('Comercialização e Adiantamento');
    const dlg = within(screen.getByRole('dialog'));
    expect(dlg.getByText('Quem abate')).toBeTruthy();
    expect(dlg.queryByText('Adiantamento')).toBeNull();
    /* a A, no mesmo dialogo: a busca sabe achar o Adiantamento */
    fireEvent.click(dlg.getByRole('button', { name: 'Boitel abate (acerto líquido)' }));
    expect(dlg.getByText('Adiantamento')).toBeTruthy();
  });

  it('B: rodape Recebido - Pago = Liquido, pago discriminado, e o papel e o BOLETO; A: o rodape de sempre', () => {
    montar({ ...SEMENTE, ...FATOS, quemAbate: 'produtor', frigorificoId: 'jbs' });
    abrirRealizado('Comercialização e Adiantamento');
    const dlg = within(screen.getByRole('dialog'));
    expect(dlg.getByText('(+) Recebido do frigorífico')).toBeTruthy();
    expect(dlg.getByText('(−) Pago ao boitel')).toBeTruthy();
    expect(dlg.getByText(/diárias R\$\s214\.590,48/)).toBeTruthy();
    expect(dlg.getByText('(=) Líquido')).toBeTruthy();
    expect(dlg.getByTitle(/O valor do boleto que o boitel cobrou/)).toBeTruthy();
    expect(dlg.queryByText('= A repassar pelo boitel')).toBeNull();
    fireEvent.click(dlg.getByRole('button', { name: 'Boitel abate (acerto líquido)' }));
    expect(dlg.getByText('= A repassar pelo boitel')).toBeTruthy();
    expect(dlg.getByTitle('O valor que o boitel informou no acerto')).toBeTruthy();
  });

  it('Frigorifico: o seletor do financeiro, com as opcoes SEM o bg-card que as apagava', () => {
    montar({ ...SEMENTE, ...FATOS, quemAbate: 'produtor', frigorificoId: '' });
    abrirRealizado('Comercialização e Adiantamento');
    fireEvent.click(screen.getByRole('combobox'));
    const opcao = screen.getByRole('button', { name: /JBS - Anastacio/ });
    expect(opcao.className).toContain('text-zinc-100');
    expect(opcao.className).not.toContain('bg-card');
  });
});
