/**
 * OC-VENDA-ENTREGAS-01a-fix — a lixeira do lote abre o dialogo de excluir e ELE FICA ABERTO; o bloqueio de saida ativa
 * aparece no dialogo com a frase do banco.
 *
 * ⚠ O CASO QUE JUSTIFICA O ARQUIVO E' O DO RE-RENDER DO PAI. `NegociacaoOC` era declarada DENTRO de `AbaNegociacaoLotes`:
 *   cada render do pai criava um tipo de componente novo, o React remontava a lista e o estado `excluindoLote` voltava a
 *   null. Medido na 232c05aa: a simulacao mudava `simulando` no `LancamentosTab`, o pai re-renderizava e o dialogo sumia
 *   14 ms depois de abrir — o lote nunca podia ser excluido pela tela. O teste re-renderiza o pai com a MESMA lista e
 *   afirma que o dialogo continua la'.
 * ⚠ A REGRA DO BLOQUEIO MORA NO BANCO (`oc_excluir_lote`, provada em rollback na migration 20261027166200). Aqui a
 *   simulacao e' falsa e o teste trava o que a TELA faz com ela: a frase inline, sem botao de excluir, e a dica da
 *   conciliacao so' quando o bloqueio e' dela.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, renderHook, act } from '@testing-library/react';
import { AbaNegociacaoLotes, type ExclusaoLoteOC } from './AbaNegociacaoLotes';
import { DialogoExcluirLoteOC } from './DialogoExcluirLoteOC';
import type { CompraLotesApi, LoteForm } from '@/hooks/useCompraLotes';
import {
  useExcluirLoteOC, fraseDoErroAoExcluirLote, type ExcluirLoteApi, type SimulacaoExclusao,
} from '@/hooks/useExcluirLoteOC';

/* ABATE-PROJETADO-01a — o banco de mentira devolve o que cada caso pede (o erro do supabase e' um OBJETO, nao um Error). */
const rpcResposta = vi.hoisted(() => ({ atual: { data: null as unknown, error: null as unknown } }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(async () => rpcResposta.atual) },
}));

const LOTE: LoteForm = {
  idLocal: 'loc1', id: 'lote-1', ordem: 1, categoria: 'desmama_m', quantidade: '178', pesoMedioKg: '248,21',
  criterioValor: 'kg', valorInformado: '12,80', observacao: '',
};
const lotesApi: CompraLotesApi = {
  lotes: [LOTE], loading: false, saving: false,
  adicionarLote: () => 'x', editarLote: vi.fn(), removerLote: vi.fn(), salvar: vi.fn(async () => null),
  recarregar: vi.fn(async () => {}), totais: { lotes: 1, animais: 178, pesoTotal: 44181.38, valorNegociado: 565521.66 },
};
const SIM_ADOTADA: SimulacaoExclusao = { ok: false, rol: [], bloqueios: [
  { tipo: 'saida_adotada', descricao: 'Lote desmama_m (ordem 1) tem saida adotada: 19/03/2025 · 178 cab. Desvincule na aba Entrega.' },
] };

function exclusao(sim: SimulacaoExclusao): ExclusaoLoteOC {
  const api: ExcluirLoteApi = { simulando: false, excluindo: false, erro: null, simular: vi.fn(async () => sim), excluir: vi.fn(async () => null) };
  return { api, versao: 17, onExcluido: vi.fn() };
}
const montar = (exc: ExclusaoLoteOC, extra = 0) => (
  <AbaNegociacaoLotes categoria="" categoriasDisponiveis={[{ value: 'desmama_m', label: 'Desmama M' }]}
    quantidadeNum={extra} pesoKgNum={0} darkSelectClass="" modoOC operacaoPronta lotesApi={lotesApi} exclusaoOC={exc} />
);

describe('lixeira do lote da OC', () => {
  it('o dialogo continua aberto quando o PAI re-renderiza (antes ele remontava a lista e sumia)', async () => {
    const exc = exclusao(SIM_ADOTADA);
    const { rerender } = render(montar(exc));
    fireEvent.click(screen.getByLabelText('Remover lote Desmama M'));
    await waitFor(() => expect(screen.getByText('Excluir lote')).toBeTruthy());
    // o pai re-renderiza com outra prop qualquer — o que o `setSimulando` do LancamentosTab fazia
    rerender(montar(exc, 1));
    rerender(montar(exc, 2));
    expect(screen.getByText('Excluir lote')).toBeTruthy();
    expect(exc.api.simular).toHaveBeenCalledWith('lote-1');
  });

  it('saida adotada: a frase do banco no dialogo, sem botao de excluir e sem a dica da conciliacao', async () => {
    render(montar(exclusao(SIM_ADOTADA)));
    fireEvent.click(screen.getByLabelText('Remover lote Desmama M'));
    await waitFor(() => expect(screen.getByText(/tem saida adotada: 19\/03\/2025 · 178 cab\. Desvincule na aba Entrega\./)).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Excluir lote' })).toBeNull();
    expect(screen.queryByText(/Estorne a conciliação do título/)).toBeNull();
  });

  it('titulo conciliado continua mostrando a dica da conciliacao (a busca sabe achar)', async () => {
    render(montar(exclusao({ ok: false, rol: [], bloqueios: [{ tipo: 'conciliado', descricao: 'X tem titulo conciliado; estorne a conciliacao antes' }] })));
    fireEvent.click(screen.getByLabelText('Remover lote Desmama M'));
    await waitFor(() => expect(screen.getByText(/Estorne a conciliação do título/)).toBeTruthy());
  });
});

describe('ABATE-PROJETADO-01a — a mensagem real do banco', () => {
  beforeEach(() => { rpcResposta.atual = { data: null, error: null }; });

  it('o erro do supabase (objeto, nao Error) chega com a mensagem do banco em pt-BR, nao o texto fixo', async () => {
    rpcResposta.atual = { data: null, error: { message: 'Excluir lote exige motivo', code: 'P0001', details: null, hint: null } };
    const { result } = renderHook(() => useExcluirLoteOC('op-1', 'cli-1'));
    await act(async () => { await result.current.excluir('lote-1', 3, 'x'); });
    expect(result.current.erro).toBe('Informe o motivo da exclusão.');
  });

  it('a FK que recusava o DELETE vira frase; texto que o mapa nao conhece passa como veio; sem mensagem, o texto fixo', () => {
    expect(fraseDoErroAoExcluirLote({ message: 'update or delete on table "zoo_operacao_lotes" violates foreign key constraint "zoo_operacao_partes_lote_fk" on table "zoo_operacao_partes"' }, 'R'))
      .toBe('O lote ainda está ligado a outros registros no banco e não foi excluído. Nada foi gravado.');
    expect(fraseDoErroAoExcluirLote({ message: 'Lote vacas (ordem 1) tem saida ativa: 11/04/2031 · 36 cab. Estorne a saida primeiro.' }, 'R'))
      .toBe('Lote vacas (ordem 1) tem saida ativa: 11/04/2031 · 36 cab. Estorne a saida primeiro.');
    expect(fraseDoErroAoExcluirLote(new Error('Conflito de versao (esperada 3, atual 4)'), 'R'))
      .toBe('A operação mudou em outra tela. Feche e abra a operação de novo antes de excluir.');
    expect(fraseDoErroAoExcluirLote({ code: '23503' }, 'Falha ao excluir o lote.')).toBe('Falha ao excluir o lote.');
    expect(fraseDoErroAoExcluirLote(null, 'Falha ao excluir o lote.')).toBe('Falha ao excluir o lote.');
  });

  it('a mensagem aparece DENTRO do dialogo, no lugar ao lado do botao', async () => {
    const sim: SimulacaoExclusao = { ok: true, rol: [{ tipo: 'lote', descricao: 'exclui o lote novilhas · 36 cab', id: 'lote-1' }], bloqueios: [] };
    const api: ExcluirLoteApi = {
      simulando: false, excluindo: false, erro: 'O lote ainda está ligado a outros registros no banco e não foi excluído. Nada foi gravado.',
      simular: vi.fn(async () => sim), excluir: vi.fn(async () => null),
    };
    render(<DialogoExcluirLoteOC api={api} loteId="lote-1" rotulo="Novilhas · 36 cab" versao={10} onFechar={vi.fn()} onExcluido={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('· exclui o lote novilhas · 36 cab')).toBeTruthy());
    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toBe('O lote ainda está ligado a outros registros no banco e não foi excluído. Nada foi gravado.');
    expect(screen.queryByText('Falha ao excluir o lote.')).toBeNull();
  });
});
