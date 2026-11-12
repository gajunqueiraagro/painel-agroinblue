/** LOTES-03 F1 + LOTE-ETAPAS-01 — o assistente "+ Novo lote" na tela: as 5 etapas até gravar (Atividade → Categoria e sexo → Situação
 *  ou Programa e sistema → Raça e genética → Nome), o código novo ATIV-CAT-RAÇA[-carimbo], o carimbo obrigatório só na parida, o
 *  "Cadastrar nova…" com Desfazer, a validação no campo (nunca no banco) e a edição sem mudança (nada vai ao banco). */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const banco = vi.hoisted(() => ({
  cadastros: [] as Record<string, unknown>[],
  rpc: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => {
  const tabela = (nome: string) => {
    const dado = nome === 'categorias_rebanho'
      ? [{ id: 'r-desf', nome: 'Desmama F', codigo: 'desmama_f' }, { id: 'r-mamf', nome: 'Mamotes F', codigo: 'mamotes_f' },
        { id: 'r-vacas', nome: 'Vacas', codigo: 'vacas' }]
      : banco.cadastros;
    const b: Record<string, unknown> = {};
    const eu = () => b;
    Object.assign(b, { select: eu, eq: eu, order: eu, then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: dado, error: null }).then(ok) });
    return b;
  };
  return { supabase: { from: tabela, rpc: (...a: unknown[]) => banco.rpc(...a) } };
});
const notificar = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useLotesDaFazenda', () => ({ notificarLotesMudaram: notificar }));

import { AssistenteDoLote } from './AssistenteDoLote';
import { trocasDaResposta } from '@/hooks/useCadastrosDoLote';
import type { LoteDaLista } from '@/lib/lotes/tipos';

const c = (id: string, tipo: string, sigla: string | null, nome: string, categorias_rebanho: string[] = []) =>
  ({ id, tipo, sigla, nome, categorias_rebanho, ordem: 10, ativo: true });

beforeEach(() => {
  banco.cadastros = [c('df', 'categoria', 'DF', 'Desmama fêmea', ['r-desf']), c('ne', 'raca', 'NE', 'Nelore'), c('rc', 'atividade', 'RC', 'Recria'),
    c('conf', 'sistema', null, 'Confinamento')];
  banco.rpc.mockReset();
  notificar.mockReset();
  banco.rpc.mockImplementation(async (fn: string) => {
    if (fn === 'fn_lote_salvar') return { data: { id: 'novo', codigo: 'RC-DF-NE', codigo_antigo: null }, error: null };
    if (fn === 'fn_lote_cadastro_salvar') return { data: { id: 'an' }, error: null };
    return { data: null, error: null };
  });
});

const montar = (mais: Partial<Parameters<typeof AssistenteDoLote>[0]> = {}) => {
  const onPronto = vi.fn(); const onFechar = vi.fn();
  render(<AssistenteDoLote open clienteId="cli" fazendaId="faz" fazendaRotulo="PUR" lotesDaFazenda={[]} onPronto={onPronto} onFechar={onFechar} {...mais} />);
  return { onPronto, onFechar };
};
const cartao = async (sigla: string) => {
  const t = await screen.findByText(sigla, { selector: 'span' });
  return t.closest('[data-testid="assistente-cartao"]')!;
};
const avancar = () => fireEvent.click(screen.getByTestId('assistente-avancar'));

describe('AssistenteDoLote', () => {
  it('criar (recria): atividade → categoria → programa e sistema → raça → nome; código RC-DF-NE sem nº; apelido e anotação vão ao banco', async () => {
    const { onPronto } = montar();
    expect(screen.getByTestId('assistente-avancar')).toBeDisabled();
    fireEvent.click(await cartao('RC'));
    expect(screen.getByTestId('assistente-codigo').textContent).toBe('RC-__-__');
    expect(screen.getByTestId('assistente-legenda').textContent).toBe('atividade · categoria · raça · carimbo');
    avancar();
    fireEvent.click(await cartao('DF')); avancar();
    expect(screen.getByTestId('assistente-situacao')).toBeTruthy();
    expect(screen.getByText('Programa e sistema', { selector: 'h2' })).toBeTruthy();
    expect(screen.getByTestId('assistente-avancar')).not.toBeDisabled();              // nada aqui é obrigatório
    fireEvent.click(within(screen.getByTestId('assistente-opcoes-sistema')).getByText('Confinamento'));
    avancar();
    expect(screen.queryByTestId('assistente-mamotes')).toBeNull();                    // fora da cria, sem mamotes
    fireEvent.dblClick(await cartao('NE'));
    expect(screen.getByTestId('assistente-codigo').textContent).toBe('RC-DF-NE');
    fireEvent.change(screen.getByTestId('assistente-nome-campeiro'), { target: { value: 'L05 - DF Nel. SP' } });
    fireEvent.change(screen.getByTestId('assistente-anotacao'), { target: { value: 'veio da 3M' } });
    expect(screen.getByTestId('assistente-nome-codigo').textContent).toBe('RC-DF-NE');
    expect(screen.getByTestId('assistente-avancar').textContent).toBe('Salvar lote');
    avancar();
    await waitFor(() => expect(onPronto).toHaveBeenCalledWith({ id: 'novo', codigo: 'RC-DF-NE', codigoAntigo: null }));
    const salvar = banco.rpc.mock.calls.find(x => x[0] === 'fn_lote_salvar')!;
    expect(salvar[1]).toMatchObject({ p_id: null, p_fazenda: 'faz', p_versao: null, p_simular: false,
      p_campos: { categoria_id: 'df', raca_id: 'ne', atividade_id: 'rc', nome_campeiro: 'L05 - DF Nel. SP', sistema_id: 'conf', anotacao: 'veio da 3M', situacao_cria: '' } });
    expect(salvar[1].p_campos.numero).toBeUndefined();
    expect(banco.rpc).not.toHaveBeenCalledWith('fn_lote_proximo_numero', expect.anything());
    expect(notificar).toHaveBeenCalledWith('faz');
  });

  it('cria parida: categoria filtrada pela atividade; PA pede o carimbo ("Falta o carimbo dos mamotes"); o carimbo entra no código', async () => {
    banco.cadastros = [c('vac', 'categoria', 'VAC', 'Vacas', ['r-vacas']), c('df', 'categoria', 'DF', 'Desmama fêmea', ['r-desf']),
      c('nel', 'raca', 'NEL', 'Nelore'), c('cri', 'atividade', 'CRI', 'Cria'), c('iatf', 'programa', null, 'IATF superprecoce')];
    const { onPronto } = montar();
    fireEvent.click(await cartao('CRI')); avancar();
    await cartao('VAC');
    expect(within(screen.getByTestId('assistente-cartoes')).queryByText('DF')).toBeNull();
    expect(screen.getByTestId('assistente-todas-categorias').textContent).toBe('Mostrar todas (+1)');
    fireEvent.click(await cartao('VAC')); avancar();
    expect(screen.getByText('Situação e programa', { selector: 'h2' })).toBeTruthy();
    /* Chat 12/11 09:20 — o programa do cadastro também na cria */
    fireEvent.click(within(screen.getByTestId('assistente-opcoes-programa')).getByText('IATF superprecoce'));
    fireEvent.click(within(screen.getByTestId('assistente-situacao-cria')).getByText('Parida com bezerro'));
    fireEvent.click(within(screen.getByTestId('assistente-ordem-parto')).getByText('Multípara'));
    avancar();
    fireEvent.click(await cartao('NEL'));
    expect(screen.getByTestId('assistente-avancar')).toBeDisabled();
    expect(screen.getByTestId('assistente-dica').textContent).toBe('Falta o carimbo dos mamotes');
    expect(within(screen.getByTestId('assistente-mamotes-sexo')).getByText('Misto').closest('button')).not.toBeDisabled();
    fireEvent.change(screen.getByTestId('assistente-carimbo'), { target: { value: '7x' } });
    expect(screen.getByTestId('assistente-avancar')).toBeDisabled();
    fireEvent.change(screen.getByTestId('assistente-carimbo'), { target: { value: '7.1' } });
    expect(screen.getByTestId('assistente-codigo').textContent).toBe('CRI-VAC-NEL-7.1');
    fireEvent.click(within(screen.getByTestId('assistente-mamotes-sexo')).getByText('Misto'));
    fireEvent.click(within(screen.getByTestId('assistente-mamotes-cruzamento')).getByText('F1 Angus'));
    avancar();
    const ficha = screen.getByTestId('assistente-ficha');
    expect(ficha.textContent).toContain('Parida com bezerro · Multípara');
    expect(ficha.textContent).toContain('carimbo 7.1 · Misto · F1 Angus');
    expect(ficha.textContent).toContain('IATF superprecoce');
    expect(within(ficha).queryAllByTestId('assistente-completar')).toHaveLength(0);
    avancar();
    await waitFor(() => expect(onPronto).toHaveBeenCalled());
    expect(banco.rpc).toHaveBeenCalledWith('fn_lote_salvar', expect.objectContaining({ p_campos: expect.objectContaining({
      programa_id: 'iatf', situacao_cria: 'PA', ordem_parto: 'MUL', carimbo: '7.1', mamotes_sexo: 'MF', mamotes_cruzamento: 'f1_angus', mamotes_semen: '' }) }));
  });

  it('cria mojada (PR): nunca pede carimbo; os mamotes ficam desligados; a ficha diz "completar" no que falta', async () => {
    banco.cadastros = [c('vac', 'categoria', 'VAC', 'Vacas', ['r-vacas']), c('nel', 'raca', 'NEL', 'Nelore'), c('cri', 'atividade', 'CRI', 'Cria')];
    montar();
    fireEvent.click(await cartao('CRI')); avancar(); fireEvent.click(await cartao('VAC')); avancar();
    fireEvent.click(within(screen.getByTestId('assistente-situacao-cria')).getByText('Prenha (mojada)'));
    avancar(); fireEvent.click(await cartao('NEL'));
    expect(screen.getByTestId('assistente-avancar')).not.toBeDisabled();
    expect(within(screen.getByTestId('assistente-mamotes-sexo')).getByText('Misto').closest('button')).toBeDisabled();
    expect(screen.getByTestId('assistente-codigo').textContent).toBe('CRI-VAC-NEL');
    avancar();
    /* só o programa falta: "completar", nunca trava */
    expect(within(screen.getByTestId('assistente-ficha')).queryAllByTestId('assistente-completar')).toHaveLength(1);
    expect(screen.getByTestId('assistente-avancar')).not.toBeDisabled();
    expect(screen.getByTestId('assistente-ficha').textContent).toContain('sem cria ao pé');
  });

  it('LOTE-ETAPAS-02 (C-LEI-MIX da Vera): carimbo fora de mês.lote trava o Salvar COM o motivo — rodapé laranja, passo 4 marcado, campo na hora', async () => {
    banco.cadastros = [c('lei', 'categoria', 'LEI', 'Leiteiras', ['r-vacas', 'r-mamf']), c('mix', 'raca', 'MIX', 'Mista'), c('cri', 'atividade', 'C', 'Cria')];
    const editar: LoteDaLista = { id: 'lei1', codigo: 'C-LEI-MIX', codigosAntigos: ['CRI-LEI-MIX-01'], nomeCampeiro: null, situacao: 'ativo',
      formadoEm: '2026-11-07', encerradoEm: null, categoriaId: 'lei', racaId: 'mix', atividadeId: 'cri', numero: 1, sistemaId: null, programaId: null,
      destinoId: null, safra: null, carimbo: null, idadeMediaMeses: null, metaPesoKg: null, metaGmdKg: null, metaData: null, versao: 1,
      anoMesDado: null, cabecas: null, pesoMedioKg: null, gmdKg: null, pastos: [], lancamentos: 0, conferir: null, codigoRegra: 'etapas' };
    montar({ editar, lotesDaFazenda: [editar] });
    await cartao('C');
    fireEvent.click(screen.getByTestId('assistente-passo-3'));
    fireEvent.change(await screen.findByTestId('assistente-carimbo'), { target: { value: '07' } });
    expect(screen.getByTestId('assistente-carimbo-nota').textContent).toBe('Carimbo: mês.lote, ex.: 7.1 (julho, 1º lote) ou 7R (ressinc. de julho).');
    expect(screen.getByTestId('assistente-dica').textContent).toBe('Carimbo “07” fora de mês.lote (ex.: 7.1 ou 7R)');
    expect(screen.getByTestId('assistente-avancar')).toBeDisabled();
    /* recusado NO PASSO 4: o trilho também não leva ao Nome */
    expect(screen.getByTestId('assistente-passo-4')).toBeDisabled();
    fireEvent.click(screen.getByTestId('assistente-passo-4'));
    expect(screen.getByText('Raça e genética', { selector: 'h2' })).toBeTruthy();
    expect(within(screen.getByTestId('assistente-passo-3')).getByTestId('assistente-passo-problema').textContent).toBe('!');
    expect(screen.getByTestId('assistente-passo-valor-3').textContent).toBe('carimbo “07” fora de mês.lote · corrigir');
    /* consertado: a trava some, o passo volta ao normal */
    fireEvent.click(screen.getByTestId('assistente-passo-3'));
    fireEvent.change(screen.getByTestId('assistente-carimbo'), { target: { value: '7.1' } });
    expect(screen.queryByTestId('assistente-passo-problema')).toBeNull();
    fireEvent.click(screen.getByTestId('assistente-passo-4'));
    expect(screen.getByTestId('assistente-avancar')).not.toBeDisabled();
  });

  it('cadastrar nova raça: valida no campo sem ir ao banco; grava, escolhe e o Desfazer tira da lista (ativo false)', async () => {
    montar();
    fireEvent.click(await cartao('RC')); avancar(); fireEvent.click(await cartao('DF')); avancar(); avancar();
    fireEvent.click(await screen.findByTestId('assistente-cadastrar-nova'));
    fireEvent.click(screen.getByTestId('assistente-form-ok'));
    expect(screen.getByTestId('assistente-form').textContent).toContain('A sigla precisa de 2 ou 3 letras ou números.');
    expect(banco.rpc).not.toHaveBeenCalledWith('fn_lote_cadastro_salvar', expect.anything());
    fireEvent.change(screen.getByTestId('assistente-form-sigla'), { target: { value: 'an' } });
    fireEvent.change(screen.getByTestId('assistente-form-nome'), { target: { value: 'Angus' } });
    banco.cadastros = [...banco.cadastros, c('an', 'raca', 'AN', 'Angus')];
    fireEvent.click(screen.getByTestId('assistente-form-ok'));
    await waitFor(() => expect(screen.getByTestId('assistente-aviso').textContent).toContain('Raça AN cadastrada e escolhida'));
    expect(banco.rpc).toHaveBeenCalledWith('fn_lote_cadastro_salvar', expect.objectContaining({ p_tipo: 'raca', p_id: null, p_sigla: 'AN', p_nome: 'Angus', p_ativo: true, p_simular: false }));
    await waitFor(() => expect(screen.getByTestId('assistente-codigo').textContent).toBe('RC-DF-AN'));
    fireEvent.click(screen.getByTestId('assistente-desfazer'));
    await waitFor(() => expect(banco.rpc).toHaveBeenCalledWith('fn_lote_cadastro_salvar', expect.objectContaining({ p_id: 'an', p_ativo: false })));
    await waitFor(() => expect(screen.getByTestId('assistente-codigo').textContent).toBe('RC-DF-__'));
  });

  it('editar um lote de antes (ATIV-CAT-RAÇA-NN) sem mudança: o código e a legenda com o nº ficam; nada vai ao banco', async () => {
    const editar: LoteDaLista = { id: 'l5', codigo: 'RC-DF-NE-05', codigosAntigos: [], nomeCampeiro: 'L05', situacao: 'ativo', formadoEm: '2026-09-30',
      encerradoEm: null, categoriaId: 'df', racaId: 'ne', atividadeId: 'rc', numero: 5, sistemaId: null, programaId: null, destinoId: null, safra: null,
      carimbo: null, idadeMediaMeses: null, metaPesoKg: null, metaGmdKg: null, metaData: null, versao: 3, anoMesDado: null, cabecas: 80,
      pesoMedioKg: 320, gmdKg: null, pastos: ['CONF.01'], lancamentos: 1, conferir: null };
    const { onPronto } = montar({ editar, lotesDaFazenda: [editar] });
    await waitFor(() => expect(screen.getByTestId('assistente-codigo').textContent).toBe('RC-DF-NE-05'));
    expect(screen.getByTestId('assistente-legenda').textContent).toBe('atividade · categoria · raça · nº');
    /* em lote existente as etapas se pulam, mas não somem: as 5 no trilho */
    expect([0, 1, 2, 3, 4].map(i => screen.getByTestId(`assistente-passo-${i}`)).every(b => !(b as HTMLButtonElement).disabled)).toBe(true);
    fireEvent.click(screen.getByTestId('assistente-passo-4'));
    expect(screen.getByTestId('assistente-avancar').textContent).toBe('Salvar');
    avancar();
    await waitFor(() => expect(onPronto).toHaveBeenCalledWith({ id: 'l5', codigo: 'RC-DF-NE-05', codigoAntigo: null }));
    expect(banco.rpc).not.toHaveBeenCalledWith('fn_lote_proximo_numero', expect.anything());
    expect(banco.rpc).not.toHaveBeenCalledWith('fn_lote_salvar', expect.anything());
  });

  it('a recusa do banco aparece no aviso do modal (nunca em toast) e o lote não fecha', async () => {
    banco.rpc.mockImplementation(async () => ({ data: null, error: { code: 'P0001', message: 'Já existe o lote RC-DF-NE-01 nesta fazenda.' } }));
    const { onPronto } = montar();
    fireEvent.click(await cartao('RC')); avancar(); fireEvent.click(await cartao('DF')); avancar(); avancar(); fireEvent.click(await cartao('NE')); avancar();
    avancar();
    await waitFor(() => expect(screen.getByTestId('assistente-aviso').textContent).toContain('Já existe o lote RC-DF-NE-01 nesta fazenda.'));
    expect(onPronto).not.toHaveBeenCalled();
  });
  /* LOTES-04 (Gabriel 07/11 17:26) — a sigla em uso se edita: prévia do banco no bloco, Salvar troca e reescreve, Desfazer volta */
  const LOTE_DF: LoteDaLista = { id: 'l5', codigo: 'RC-DF-NE-05', codigosAntigos: [], nomeCampeiro: 'L05', situacao: 'ativo', formadoEm: '2026-09-30',
    encerradoEm: null, categoriaId: 'df', racaId: 'ne', atividadeId: 'rc', numero: 5, sistemaId: null, programaId: null, destinoId: null, safra: null,
    carimbo: null, idadeMediaMeses: null, metaPesoKg: null, metaGmdKg: null, metaData: null, versao: 3, anoMesDado: null, cabecas: 80,
    pesoMedioKg: 320, gmdKg: null, pastos: ['CONF.01'], lancamentos: 1, conferir: null };
  const troca = (sigla: string) => ({ id: 'l5', antes: sigla === 'DF' ? 'RC-DS-NE-05' : 'RC-DF-NE-05', depois: `RC-${sigla}-NE-05` });
  const comTroca = () => banco.rpc.mockImplementation(async (fn: string, a: Record<string, unknown>) => {
    if (fn === 'fn_lote_cadastro_salvar') {
      if (a.p_sigla === 'XX') return { data: null, error: { code: 'P0001', message: 'Código repetido: RC-DF-NE-05 → RC-XX-NE-05. Nada foi gravado.' } };
      return { data: { id: 'df', lotes: [troca(String(a.p_sigla))] }, error: null };
    }
    return { data: null, error: null };
  });
  const editarSiglaDF = async () => {
    fireEvent.click(await screen.findByTestId('assistente-passo-1'));
    const cartaoDF = (await within(await screen.findByTestId('assistente-cartoes')).findByText('DF', { selector: 'span' })).closest('[data-testid="assistente-cartao"]');
    fireEvent.click(within(cartaoDF instanceof HTMLElement ? cartaoDF : document.body).getByTestId('assistente-editar-cadastro'));
    return screen.getByTestId('assistente-form-sigla');
  };

  it('sigla em uso: o campo não trava, a prévia do banco diz quais lotes mudam e Salvar troca a sigla e o código', async () => {
    comTroca();
    montar({ editar: LOTE_DF, lotesDaFazenda: [LOTE_DF] });
    const sigla = await editarSiglaDF();
    expect(sigla).not.toBeDisabled();
    expect(screen.getByTestId('assistente-form').textContent).not.toContain('travada');
    fireEvent.change(sigla, { target: { value: 'ds' } });
    await waitFor(() => expect(screen.getByTestId('assistente-form-previa').textContent).toBe('1 lote muda: RC-DF-NE-05 → RC-DS-NE-05'));
    expect(screen.getByTestId('assistente-form-previa').getAttribute('title')).toBe('1 lote muda: RC-DF-NE-05 → RC-DS-NE-05');
    expect(banco.rpc).toHaveBeenCalledWith('fn_lote_cadastro_salvar', expect.objectContaining({ p_id: 'df', p_sigla: 'DS', p_nome: 'Desmama fêmea', p_simular: true }));
    expect(banco.rpc).not.toHaveBeenCalledWith('fn_lote_cadastro_salvar', expect.objectContaining({ p_simular: false }));
    fireEvent.click(screen.getByTestId('assistente-form-ok'));
    await waitFor(() => expect(screen.getByTestId('assistente-aviso').textContent).toContain('Categoria DS salva · 1 lote mudou de código'));
    expect(banco.rpc).toHaveBeenCalledWith('fn_lote_cadastro_salvar', expect.objectContaining({ p_id: 'df', p_sigla: 'DS', p_simular: false }));
    expect(notificar).toHaveBeenCalledWith('faz');
    expect(screen.getByText('Editar identidade · RC-DS-NE-05')).toBeTruthy();
    /* Desfazer = o mesmo gesto com a sigla de antes: os códigos voltam */
    notificar.mockReset();
    fireEvent.click(screen.getByTestId('assistente-desfazer'));
    await waitFor(() => expect(screen.getByText('Editar identidade · RC-DF-NE-05')).toBeTruthy());
    expect(banco.rpc).toHaveBeenLastCalledWith('fn_lote_cadastro_salvar', expect.objectContaining({ p_id: 'df', p_sigla: 'DF', p_simular: false }));
    expect(notificar).toHaveBeenCalledWith('faz');
  });

  it('sigla em uso: código repetido vem do banco na prévia, no campo da sigla, e nada é gravado', async () => {
    comTroca();
    montar({ editar: LOTE_DF, lotesDaFazenda: [LOTE_DF] });
    fireEvent.change(await editarSiglaDF(), { target: { value: 'XX' } });
    await waitFor(() => expect(screen.getByTestId('assistente-form').textContent).toContain('Código repetido: RC-DF-NE-05 → RC-XX-NE-05. Nada foi gravado.'));
    expect(screen.getByTestId('assistente-form-previa').textContent).toBe('');
    expect(banco.rpc).not.toHaveBeenCalledWith('fn_lote_cadastro_salvar', expect.objectContaining({ p_simular: false }));
  });

  it('trocasDaResposta: só os lotes com id, antes e depois', () => {
    expect(trocasDaResposta({ lotes: [{ id: 'a', antes: 'DES-ANG-CRI-01', depois: 'DF-ANG-CRI-01' }, { id: 'b', antes: 'X' }, null] }))
      .toEqual([{ id: 'a', antes: 'DES-ANG-CRI-01', depois: 'DF-ANG-CRI-01' }]);
    expect(trocasDaResposta({ ok: true })).toEqual([]);
    expect(trocasDaResposta(null)).toEqual([]);
  });
});
