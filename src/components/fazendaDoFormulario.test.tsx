/**
 * TRANSF-FAZENDA-ORIGEM-01 — "Global nao e' fazenda" nos tres formularios que ficaram de fora: Transferencia
 * (saida), Consumo e Evoluir categoria.
 *
 * ⚠ NASCE DE UM PRINT (27/09/2026): Transferencia em Global com "Fazenda Origem: Global" travado e "Origem:
 *   Global" no resumo — o NOME DO FILTRO num campo somente-leitura. O Consumo tinha o seletor so' em Global
 *   (preso na fazenda do filtro fora dele), e a Evoluir categoria nem campo tinha.
 * ⚠ O `LancamentosTab` NAO SE MONTA EM TESTE (nenhum teste da casa o monta). A Transferencia e o Consumo moram
 *   la': as regras sao exercitadas pelas funcoes puras que ele chama (`fazendaDoFormulario`) e a LIGACAO e'
 *   conferida na FONTE, como no ATALHOS-PRODUCAO-01. A Evoluir categoria se monta: `ReclassificacaoFormFields`
 *   e o hook sao testados de verdade, com o payload.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, act, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/hooks/useRebanhoOficial', () => ({ useRebanhoOficial: () => ({ rawCategorias: [] }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import {
  MSG_FAZENDA_OBRIGATORIA, bloqueioDaFazenda, destinoAposTrocarOrigem, destinosDaTransferencia, fazendaSemeada,
} from '@/lib/zoo/fazendaDoFormulario';
import { useReclassificacaoState, ReclassificacaoFormFields } from '@/components/ReclassificacaoForm';
import type { Lancamento } from '@/types/cattle';

const FAZENDAS = [
  { id: 'f-pureza', nome: 'Faz. Pureza' },
  { id: 'f-expedito', nome: 'Faz. Sto. Expedito' },
  { id: 'f-luzia', nome: 'Faz. Sta. Luzia' },
];
const OPCOES = FAZENDAS.map(f => ({ value: f.id, label: f.nome }));

beforeEach(() => {
  sessionStorage.clear();
  /* jsdom nao implementa `scrollIntoView`, que o combobox chama ao destacar a lista. */
  Element.prototype.scrollIntoView = () => {};
});

const fonte = readFileSync(resolve(__dirname, '../pages/LancamentosTab.tsx'), 'utf8');

describe('regras puras (Transferencia, Consumo e Evoluir categoria)', () => {
  it('Global: o campo nasce VAZIO — a sentinela nunca vira valor', () => {
    expect(fazendaSemeada('__global__')).toBe('');
    expect(fazendaSemeada(undefined)).toBe('');
    expect(fazendaSemeada(null)).toBe('');
  });

  it('filtro numa fazenda: o campo nasce com ela', () => {
    expect(fazendaSemeada('f-pureza')).toBe('f-pureza');
  });

  it('Destino da transferencia = todas menos a Origem escolhida (e nao a do filtro)', () => {
    expect(destinosDaTransferencia(FAZENDAS, 'f-expedito').map(f => f.id)).toEqual(['f-pureza', 'f-luzia']);
    // sem Origem escolhida (Global, antes de escolher), nenhuma fica de fora
    expect(destinosDaTransferencia(FAZENDAS, '').map(f => f.id)).toEqual(['f-pureza', 'f-expedito', 'f-luzia']);
  });

  it('trocar a Origem para a mesma fazenda do Destino LIMPA o Destino; para outra, mantem', () => {
    expect(destinoAposTrocarOrigem('Faz. Pureza', 'Faz. Pureza')).toBe('');
    expect(destinoAposTrocarOrigem('Faz. Pureza', 'Faz. Sta. Luzia')).toBe('Faz. Pureza');
    expect(destinoAposTrocarOrigem('', 'Faz. Pureza')).toBe('');
    expect(destinoAposTrocarOrigem('Faz. Pureza', null)).toBe('Faz. Pureza');
  });

  it('Global: com a fazenda escolhida a guarda DEIXA DE RECUSAR; vazia e\' "falta" (campo em vermelho), nunca "global"', () => {
    expect(bloqueioDaFazenda({ isGlobal: true, escolheFazenda: true, fazendaId: 'f-luzia' })).toBeNull();
    expect(bloqueioDaFazenda({ isGlobal: true, escolheFazenda: true, fazendaId: '' })).toBe('falta');
    // a busca sabe achar a recusa antiga: o tipo que NAO escolhe continua barrado em Global
    expect(bloqueioDaFazenda({ isGlobal: true, escolheFazenda: false, fazendaId: '' })).toBe('global');
    expect(bloqueioDaFazenda({ isGlobal: false, escolheFazenda: false, fazendaId: '' })).toBeNull();
  });
});

describe('Transferencia e Consumo — a ligacao no LancamentosTab (lida da fonte)', () => {
  it('a Transferencia (saida) e o Consumo estao na lista de quem ESCOLHE a fazenda', () => {
    const lista = fonte.match(/const TIPOS_COM_SELETOR_DE_FAZENDA: TipoMovimentacao\[\] = \[([^\]]*)\]/);
    expect(lista).not.toBeNull();
    expect(lista?.[1]).toContain("'transferencia_saida'");
    expect(lista?.[1]).toContain("'consumo'");
    expect(lista?.[1]).toContain("'nascimento'"); // a busca sabe achar
  });

  it('a Origem entra na cadeia da fazenda escolhida (payload, guarda, confirmacao e resumo leem dela)', () => {
    expect(fonte).toMatch(/: isTransferenciaSaida \? transfFazendaId/);
    expect(fonte).toMatch(/: isConsumo \? consumoFazendaId/);
  });

  it('o seletor aparece com QUALQUER filtro — o `isGlobal &&` do Consumo saiu', () => {
    expect(fonte).not.toContain('isConsumo && isGlobal ?');
    expect(fonte).toContain('{(isConsumo || isTransferenciaSaida) ? (');
  });

  it('todas as fazendas ativas no seletor, vermelho e com a frase quando vazio', () => {
    const bloco = fonte.slice(fonte.indexOf('<div id="campo-fazenda-lancamento">'), fonte.indexOf('<div id="campo-fazenda-lancamento">') + 1800);
    expect(bloco).toContain('options={opcoesFazendaOC}');
    expect(bloco).toContain("[&_button]:border-destructive");
    expect(bloco).toContain('{MSG_FAZENDA_OBRIGATORIA}');
    expect(MSG_FAZENDA_OBRIGATORIA).toBe('Selecione a fazenda do lançamento.');
  });

  it('nasce do filtro, e NUNCA na edicao: la\' vale a gravada, que o load poe no estado', () => {
    expect(fonte).toMatch(/if \(!isTransferenciaSaida \|\| editingAbateId\) return;\s*setTransfFazendaId\(fazendaSemeada\(fazendaAtual\?\.id\)\);/);
    expect(fonte).toMatch(/if \(!isConsumo \|\| editingAbateId\) return;\s*setConsumoFazendaId\(fazendaSemeada\(fazendaAtual\?\.id\)\);/);
    expect(fonte).toMatch(/setTipo\('transferencia_saida'\);\s*setTransfFazendaId\(l\.fazendaId \?\? ''\);/);
    expect(fonte).toMatch(/setTipo\('consumo'\);\s*setConsumoFazendaId\(l\.fazendaId \?\? ''\);/);
  });

  it('edicao: campo travado com o NOME DA GRAVADA, sem seletor', () => {
    expect(fonte).toMatch(/editingAbateId \? \(\s*<Input value=\{fazendas\.find\(f => f\.id === fazendaEscolhidaId\)\?\.nome \?\? '—'\} readOnly/);
  });

  it('Destino sem a Origem, e a troca de Origem limpa o Destino igual', () => {
    expect(fonte).toContain('destinosDaTransferencia(fazendasOC, transfFazendaId)');
    expect(fonte).toContain('setFazendaDestino(d => destinoAposTrocarOrigem(d,');
  });

  it('resumo, cabecalho e snapshot leem a fazenda ESCOLHIDA, nunca o nome do filtro', () => {
    expect(fonte).toContain('<LinhaResumo rotulo="Origem" valor={fazendaEscolhidaNome ?? \'-\'} quebra />');
    expect(fonte).not.toContain('<LinhaResumo rotulo="Origem" valor={(nomeFazenda || fazendaOrigem)');
    expect(fonte).toContain('fazendaOrigem: fazendaEscolhidaNome ?? \'\',');
    expect(fonte).toMatch(/fazendaNome=\{aba === 'reclassificacao' \? \(fazendasOC\.find\(f => f\.id === reclassFazendaId\)\?\.nome \?\? null\) : fazendaEscolhidaNome\}/);
  });

  it('a guarda do registrar e\' a `bloqueioDaFazenda`, sem toast no campo vazio', () => {
    expect(fonte).toContain('bloqueioDaFazenda({ isGlobal, escolheFazenda, fazendaId: fazendaEscolhidaId })');
    expect(fonte).not.toContain('if (isGlobal && !escolheFazenda) {');
  });
});

describe('Evoluir categoria — o campo de fazenda', () => {
  function montar(valor: string, travada: string | null = null) {
    const onChange = vi.fn();
    function Host() {
      const state = useReclassificacaoState({ onAdicionar: vi.fn(), dataInicial: '2026-05-01', autoSugerir: false, fazendaId: valor, exigeFazenda: true });
      return <ReclassificacaoFormFields state={state} campoFazenda={{ opcoes: OPCOES, valor, onChange, travada }} />;
    }
    render(<Host />);
    return { onChange };
  }

  it('Global: campo vazio, obrigatorio (vermelho e com a frase) e TODAS as fazendas na lista', () => {
    montar('');
    expect(screen.getByText(MSG_FAZENDA_OBRIGATORIA)).toBeTruthy();
    expect(screen.getAllByText(MSG_FAZENDA_OBRIGATORIA)).toHaveLength(1); // a frase de baixo nao repete
    fireEvent.click(screen.getByRole('button', { name: /Selecione a fazenda/i }));
    for (const f of FAZENDAS) expect(screen.getByText(f.nome)).toBeTruthy();
  });

  it('filtro numa fazenda: ja\' vem preenchido e da\' para trocar', () => {
    const { onChange } = montar('f-pureza');
    expect(screen.queryByText(MSG_FAZENDA_OBRIGATORIA)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Faz\. Pureza/ }));
    fireEvent.click(screen.getByText('Faz. Sta. Luzia'));
    expect(onChange).toHaveBeenCalledWith('f-luzia');
  });

  it('edicao: mostra a fazenda GRAVADA, travada, sem seletor', () => {
    montar('f-expedito', 'Faz. Sto. Expedito');
    const campo = screen.getByDisplayValue('Faz. Sto. Expedito') as HTMLInputElement;
    expect(campo.readOnly).toBe(true);
    expect(screen.queryByRole('button', { name: /Selecione a fazenda/i })).toBeNull();
  });

  it('sem fazenda nao grava; com ela, o payload leva a ESCOLHIDA', async () => {
    const recebidos: Omit<Lancamento, 'id'>[] = [];
    const onAdicionar = vi.fn(async (l: Omit<Lancamento, 'id'>) => { recebidos.push(l); return 'novo'; });
    const { result, rerender } = renderHook(
      ({ fazendaId }: { fazendaId: string }) => useReclassificacaoState({
        onAdicionar, dataInicial: '2026-05-01', autoSugerir: false, fazendaId, exigeFazenda: true,
      }),
      { initialProps: { fazendaId: '' } },
    );
    act(() => { result.current.setQuantidade('10'); result.current.setPesoKg('300'); });
    expect(result.current.podeSalvar).toBe(false);
    expect(result.current.motivoBloqueio).toBe(MSG_FAZENDA_OBRIGATORIA);
    await act(async () => { await result.current.handleSubmit(); });
    expect(onAdicionar).not.toHaveBeenCalled();

    rerender({ fazendaId: 'f-luzia' });
    expect(result.current.podeSalvar).toBe(true);
    await act(async () => { await result.current.handleSubmit(); });
    expect(recebidos[0]?.fazendaId).toBe('f-luzia');
  });

  it('sem `exigeFazenda` (Fechamento) nada muda: grava sem fazenda e herda o contexto', async () => {
    const onAdicionar = vi.fn(async () => 'novo');
    const { result } = renderHook(() => useReclassificacaoState({ onAdicionar, dataInicial: '2026-05-01', autoSugerir: false }));
    act(() => { result.current.setQuantidade('10'); result.current.setPesoKg('300'); });
    expect(result.current.podeSalvar).toBe(true);
    await act(async () => { await result.current.handleSubmit(); });
    expect(onAdicionar).toHaveBeenCalledTimes(1);
  });
});
