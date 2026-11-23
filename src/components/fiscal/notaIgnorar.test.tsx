/**
 * NOTA-IGNORAR-01 (Gabriel 23/11; o caso: compra pessoal de R$ 1,18 da Vera) — dados SINTÉTICOS.
 *   I1 a leitura das ignoradas recusa o que não é do formato; o motivo/quem/quando chega à nota; a aba "Ignoradas" (fora de "Canceladas")
 *   I2 a SUGESTÃO: a nota nova do MESMO emitente de uma ignorada traz a frase; outro emitente não; a própria ignorada não; nunca muda a situação
 *   I3 a tela: "Ignorar" só na nota que pede ação; o modal recusa "Outro" sem texto (nada é pedido ao banco); grava com motivo e texto
 *   I4 "Desfazer" na ignorada chama o desfazer; a recusa do banco aparece como frase
 *   I5 as perguntas que enfeitam a lista saem JÁ (o pedido do supabase só sai no `.then()`) e a falha delas não derruba a lista
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NotasDaReceitaDialog } from './NotasDaReceitaDialog';
import { ABAS_DA_RECEITA, lerIgnoradas, montarLista, type LinhaRecebida } from '@/lib/fiscal/notasDaReceita';
import type { DadosDaReceita } from '@/hooks/useNotasDaReceita';

const chave = (n: number, doc = '12345678000190') => `502611${doc}55001${String(n).padStart(9, '0')}1123456780`;
const linha = (n: number, o: Partial<LinhaRecebida> = {}): LinhaRecebida => ({
  id: `id-${n}`, titularId: 't1', chave: chave(n), situacao: 'xml', emitenteDocumento: '12345678000190', emitenteNome: `Emitente Exemplo ${n}`,
  emissao: `2026-11-${String(10 + n).padStart(2, '0')}`, valorCent: n * 100, notaId: null, recebidoEm: null, eventos: [], temXml: true, ...o,
});
const ignoradas = lerIgnoradas([
  { chave: chave(1), motivo: 'pessoal', em: '2026-11-23T14:52:00Z', por: 'Gabriel', texto: null, emitente_documento: '12345678000190' },
  { chave: chave(9), motivo: 'invalido', em: '2026-11-23T14:52:00Z' },
  { motivo: 'pessoal', em: '2026-11-23T14:52:00Z' },
]);
const lista = () => montarLista([
  linha(1, { situacao: 'ignorado' }), linha(2), linha(3, { situacao: 'resumo' }),
  linha(4, { emitenteDocumento: '99888777000166', chave: chave(4, '99888777000166') }), linha(5, { situacao: 'cancelado_na_sefaz' }),
], new Map([['t1', 'Produtora Exemplo']]), new Set(), new Map(), new Map(), '2026-11-23', [], ignoradas);

describe('NOTA-IGNORAR-01 — a regra', () => {
  it('I1 leitura, motivo na nota e a aba própria', () => {
    expect([...ignoradas.keys()]).toEqual([chave(1)]);
    const l = lista();
    const n1 = l.find((n) => n.id === 'id-1');
    expect(n1?.sit).toBe('ignorada');
    expect(n1?.ignorada).toMatchObject({ motivo: 'pessoal', por: 'Gabriel' });
    const aba = (v: string) => ABAS_DA_RECEITA.find((a) => a.valor === v)?.filtro ?? (() => false);
    expect(l.filter(aba('ignoradas')).map((n) => n.id)).toEqual(['id-1']);
    expect(l.filter(aba('canceladas')).map((n) => n.id)).toEqual(['id-5']);
    expect(l.filter(aba('lancar')).map((n) => n.id)).not.toContain('id-1');
    expect(l.filter(aba('todas'))).toHaveLength(5);
  });
  it('I2 a sugestão: só o mesmo emitente, só quem pede ação, nunca muda a situação', () => {
    const l = lista();
    const por = (id: string) => l.find((n) => n.id === id);
    expect(por('id-2')?.sugestaoIgnorar?.frase).toMatch(/ignorada como "Compra pessoal" em 23\/11\/2026/);
    expect(por('id-2')?.sit).toBe('nova');
    expect(por('id-3')?.sugestaoIgnorar?.motivo).toBe('pessoal');
    expect(por('id-4')?.sugestaoIgnorar).toBeNull();
    expect(por('id-1')?.sugestaoIgnorar).toBeNull();
    expect(por('id-5')?.sugestaoIgnorar).toBeNull();
  });
});

const dados = (): DadosDaReceita => ({ lista: lista(), titulares: [{ id: 't1', nome: 'Produtora Exemplo' }], ultimaBusca: null, proximaBusca: null });
const abrir = (ignorar: { ignorar: ReturnType<typeof vi.fn>; desfazer: ReturnType<typeof vi.fn> }) =>
  render(<NotasDaReceitaDialog clienteNome="Cliente Bancada" dados={dados()} carregando={false} erro={null} aoFechar={() => {}}
    aoLancar={() => {}} aoVincular={async () => null} lerXml={async () => '<nfeProc/>'} abrirDanfe={() => null} mostrarNaAba={async () => {}}
    ignorar={{ ignorar: (n, m, t) => ignorar.ignorar(n.id, m, t), desfazer: (n) => ignorar.desfazer(n.id) }} />);
const linhaDe = (n: number) => screen.getAllByTestId('receita-linha').find((tr) => tr.dataset.chave === (n === 4 ? chave(4, '99888777000166') : chave(n)));

describe('NOTA-IGNORAR-01 — a tela', () => {
  it('I3 Ignorar só onde pede ação; Outro sem texto não grava; grava com motivo e texto', async () => {
    const ignorar = vi.fn(async () => null); const desfazer = vi.fn(async () => null);
    abrir({ ignorar, desfazer });
    const botoes = screen.getAllByTestId('receita-ignorar');
    expect(botoes).toHaveLength(3); /* a 2 (nova), a 3 (resumo) e a 4 (outro emitente); nunca a ignorada nem a cancelada */
    expect(linhaDe(2)?.querySelector('[data-testid="receita-ignorar"]')?.hasAttribute('data-sugerido')).toBe(true);
    expect(linhaDe(4)?.querySelector('[data-testid="receita-ignorar"]')?.hasAttribute('data-sugerido')).toBe(false);
    fireEvent.click(linhaDe(4)?.querySelector('[data-testid="receita-ignorar"]') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Outro' }));
    fireEvent.click(screen.getByTestId('receita-ignorar-gravar'));
    expect(screen.getByTestId('receita-ignorar-erro').textContent).toBe('Em "Outro", escreva o motivo.');
    expect(ignorar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('receita-ignorar-texto'), { target: { value: 'nota de teste do fornecedor' } });
    fireEvent.click(screen.getByTestId('receita-ignorar-gravar'));
    await waitFor(() => expect(ignorar).toHaveBeenCalledWith('id-4', 'outro', 'nota de teste do fornecedor'));
    await waitFor(() => expect(screen.queryByTestId('receita-ignorar-modal')).toBeNull());
    expect(screen.getByTestId('receita-aviso').textContent).toMatch(/ignorada: está na aba "Ignoradas"/);
  });
  it('I3b a sugestão já vem marcada no modal (o operador confirma)', async () => {
    const ignorar = vi.fn(async () => null);
    abrir({ ignorar, desfazer: vi.fn(async () => null) });
    fireEvent.click(linhaDe(2)?.querySelector('[data-testid="receita-ignorar"]') as HTMLElement);
    expect(screen.getByTestId('receita-ignorar-sugestao').textContent).toMatch(/Só sugestão/);
    fireEvent.click(screen.getByTestId('receita-ignorar-gravar'));
    await waitFor(() => expect(ignorar).toHaveBeenCalledWith('id-2', 'pessoal', null));
  });
  it('I4 Desfazer na ignorada; a recusa do banco vira frase', async () => {
    const desfazer = vi.fn(async () => 'Esta nota não está ignorada. Nada foi gravado.');
    abrir({ ignorar: vi.fn(async () => null), desfazer });
    expect(linhaDe(1)?.querySelector('[data-testid="receita-ignorada-motivo"]')?.getAttribute('title')).toMatch(/^Ignorada: Compra pessoal · por Gabriel/);
    fireEvent.click(screen.getByTestId('receita-desfazer-ignorar'));
    await waitFor(() => expect(desfazer).toHaveBeenCalledWith('id-1'));
    await waitFor(() => expect(screen.getByTestId('receita-aviso').textContent).toBe('Esta nota não está ignorada. Nada foi gravado.'));
  });
});

describe('NOTA-IGNORAR-01 — a leitura', () => {
  it('I5 as perguntas que enfeitam saem já e não derrubam a lista', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'hooks', 'useNotasDaReceita.ts'), 'utf8');
    for (const f of ['fn_notas_atributos_fiscais', 'fn_notas_demonstracao_ligacoes', 'fn_notas_receita_ignoradas']) {
      expect(src).toMatch(new RegExp(`Promise\\.resolve\\(db\\(\\)\\.rpc\\('${f}'[^\\n]*\\.catch\\(comoErro\\)`));
    }
  });
});
