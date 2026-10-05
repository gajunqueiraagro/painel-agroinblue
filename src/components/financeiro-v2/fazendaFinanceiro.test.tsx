/**
 * FIN-FAZENDA-PADRAO-01 — com o filtro Global, o Financeiro nao escolhe a fazenda por ninguem.
 *
 * ⚠ NASCE DA VARREDURA DO TRANSF-FAZENDA-ORIGEM-01: o novo lancamento (`FinanceiroV2Tab`) e a Mesa de classificacao
 *   nasciam com a PRIMEIRA fazenda da lista em Global (`fazOperacionais[0]` / `find` na ordem do banco), e o Modo
 *   rapido gravava o lote inteiro nela sem ter campo de fazenda. A regra: Global nasce VAZIO e obrigatorio, em vermelho
 *   no proprio campo; filtro numa fazenda nasce com ela e troca; edicao mostra a gravada.
 * ⚠ O CAMPO E' O `FazendaSelect` COMPARTILHADO, com a prop nova `obrigatorio`: testado de verdade aqui, inclusive o
 *   Administrativo forcado, que nao pode acusar falta. O Modo rapido se monta; o `LancamentoV2Dialog` e as duas telas
 *   que o abrem sao conferidos na FONTE (a mutacao do `[0]` derruba o caso da tela).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { FazendaSelect } from '@/components/shared/FazendaSelect';
import { ModoRapidoGrid } from '@/components/financeiro-v2/ModoRapidoGrid';
import { MSG_FAZENDA_OBRIGATORIA } from '@/lib/zoo/fazendaDoFormulario';
import type { Fazenda } from '@/contexts/FazendaContext';

const faz = (id: string, nome: string): Fazenda => ({ id, nome } as Fazenda);
const FAZENDAS: Fazenda[] = [
  faz('__global__', 'Global'),
  faz('f-pureza', 'Faz. Pureza'),
  faz('f-luzia', 'Faz. Sta. Luzia'),
  faz('f-adm', 'Administrativo'),
];

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  /* jsdom nao implementa captura de ponteiro, que o Select do Radix usa ao abrir. */
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

const ler = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('FazendaSelect — a prop `obrigatorio`', () => {
  it('vazio e obrigatorio (Global): borda vermelha e a frase embaixo', () => {
    render(<FazendaSelect value="" onChange={vi.fn()} fazendas={FAZENDAS} forcaAdministrativo={false} obrigatorio />);
    expect(screen.getByText(MSG_FAZENDA_OBRIGATORIA)).toBeTruthy();
    expect(screen.getByRole('combobox').className).toContain('border-destructive');
  });

  it('preenchido (filtro numa fazenda): sem frase, e troca', () => {
    const onChange = vi.fn();
    render(<FazendaSelect value="f-pureza" onChange={onChange} fazendas={FAZENDAS} forcaAdministrativo={false} obrigatorio />);
    expect(screen.queryByText(MSG_FAZENDA_OBRIGATORIA)).toBeNull();
    expect(screen.getByRole('combobox').textContent).toContain('Faz. Pureza');
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    // todas as fazendas, sem a sentinela
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['Faz. Pureza', 'Faz. Sta. Luzia', 'Administrativo']);
    fireEvent.click(screen.getByRole('option', { name: 'Faz. Sta. Luzia' }));
    expect(onChange).toHaveBeenCalledWith('f-luzia');
  });

  it('sem a prop, nada muda: vazio continua sem frase nem borda', () => {
    render(<FazendaSelect value="" onChange={vi.fn()} fazendas={FAZENDAS} forcaAdministrativo={false} />);
    expect(screen.queryByText(MSG_FAZENDA_OBRIGATORIA)).toBeNull();
    expect(screen.getByRole('combobox').className).not.toContain('border-destructive');
  });

  it('Administrativo forcado continua: preenche a fazenda Administrativo e NAO acusa falta', () => {
    const onChange = vi.fn();
    render(<FazendaSelect value="" onChange={onChange} fazendas={FAZENDAS} forcaAdministrativo obrigatorio />);
    expect(onChange).toHaveBeenCalledWith('f-adm');
    expect(screen.queryByText(MSG_FAZENDA_OBRIGATORIA)).toBeNull();
  });
});

describe('Modo rapido — o seletor do lote', () => {
  const CONTAS = [{ id: 'c1', fazenda_id: 'f-pureza', nome_conta: 'BB', nome_exibicao: 'BB' }] as never[];

  function montar(fazendaId: string) {
    const onSaveBatch = vi.fn(async () => true);
    render(<ModoRapidoGrid fazendaId={fazendaId} fazendas={FAZENDAS} contas={CONTAS} classificacoes={[]} onSaveBatch={onSaveBatch} onDone={vi.fn()} />);
    const inputs = document.querySelectorAll('input');
    // preenche a 1a linha: competencia (DatePicker) e valor
    const valor = [...inputs].find(i => i.getAttribute('data-col') === '5') as HTMLInputElement | undefined;
    return { onSaveBatch, valor };
  }

  it('Global: o lote nasce SEM fazenda, vermelho com a frase', () => {
    montar('');
    expect(screen.getByText('Fazenda do lote *')).toBeTruthy();
    expect(screen.getByText(MSG_FAZENDA_OBRIGATORIA)).toBeTruthy();
  });

  it('filtro numa fazenda: o lote nasce com ela', () => {
    montar('f-pureza');
    expect(screen.queryByText(MSG_FAZENDA_OBRIGATORIA)).toBeNull();
    expect(document.getElementById('campo-fazenda-lote')?.querySelector('[role="combobox"]')?.textContent).toContain('Faz. Pureza');
  });

  it('a guarda: sem fazenda do lote, nenhuma linha grava — mesmo com a linha preenchida', () => {
    const fonte = ler('./ModoRapidoGrid.tsx');
    const corpo = fonte.slice(fonte.indexOf('const handleSave = useCallback'), fonte.indexOf('const filledCount'));
    // a guarda vem ANTES de qualquer outra coisa do salvar, e as linhas gravam a fazenda do LOTE
    expect(corpo.indexOf('if (!fazendaLote) {')).toBeGreaterThan(-1);
    expect(corpo.indexOf('if (!fazendaLote) {')).toBeLessThan(corpo.indexOf('validate()'));
    expect(corpo.indexOf('if (!fazendaLote) {')).toBeLessThan(corpo.indexOf('onSaveBatch(forms)'));
    expect(corpo).toContain('fazenda_id: fazendaLote,');
    expect(corpo).not.toContain('fazenda_id: fazendaId,');
  });
});

describe('as telas que abrem o novo lancamento e o dialogo (lidas da fonte)', () => {
  const tab = ler('../../pages/FinanceiroV2Tab.tsx');
  const mesa = ler('../../v2/components/mesa/MesaClassificacaoTab.tsx');
  const dialogo = ler('./LancamentoV2Dialog.tsx');

  it('novo lancamento e Modo rapido: "todas" vira VAZIO, nunca a primeira da lista', () => {
    expect(tab).toContain("defaultFazendaId={fazendaId !== '__all__' ? fazendaId : ''}");
    expect(tab).toContain("fazendaId={fazendaId !== '__all__' ? fazendaId : ''}");
    expect(tab).not.toContain(': fazOperacionais[0]?.id');
  });

  it('Mesa: sem codigo do Excel resolvido e em Global, VAZIO — o `find` da primeira saiu', () => {
    expect(mesa).not.toContain("fazendas.find((f) => f.id !== '__global__')?.id");
    expect(mesa).toMatch(/fazendaAtual && fazendaAtual\.id !== '__global__'\s*\?\s*fazendaAtual\.id\s*:\s*''/);
    // o codigo do Excel resolvido continua vencendo, pelo prefill
    expect(dialogo).toContain("setFazendaId(prefill.fazenda_id ?? defaultFazendaId ?? '');");
  });

  it('edicao: o dialogo mostra a fazenda GRAVADA (e a troca que ja existia continua)', () => {
    expect(dialogo).toContain('setFazendaId(lancamento.fazenda_id);');
    expect(dialogo).toMatch(/<FazendaSelect\s+value=\{fazendaId\}\s+onChange=\{setFazendaId\}/);
  });

  it('o campo do dialogo e\' obrigatorio, e a guarda recusa vazio no simples E no parcelado, antes do banco', () => {
    expect(dialogo).toMatch(/label=\{xmlRotTexto\('Fazenda \*', 'fazenda'\)\}[\s\S]{0,400}obrigatorio\s+id="campo-fazenda-financeiro"/);
    /* REC-VALOR-DO-MES-MODAL-01 — o `handleSubmit` ganhou um parâmetro opcional; a âncora é o começo da declaração, e ela
       tem de EXISTIR (sem isso o `slice(-1)` devolveria um caractere e as buscas abaixo falhariam por outro motivo). */
    const inicio = dialogo.indexOf('const handleSubmit = async (');
    expect(inicio).toBeGreaterThan(-1);
    const corpo = dialogo.slice(inicio);
    const guarda = corpo.indexOf('if (!fazendaIdEfetivo) {');
    expect(guarda).toBeGreaterThan(-1);
    // antes do ramo parcelado e antes de montar o form do simples
    expect(guarda).toBeLessThan(corpo.indexOf("formaPagamentoParc === 'parcelada'"));
    expect(guarda).toBeLessThan(corpo.indexOf('const form: LancamentoV2Form = {'));
    // o toast do parcelado saiu
    expect(dialogo).not.toContain("toast.error('Escolha a fazenda')");
  });
});
