/**
 * FORN-FORMA-PELO-EXTRATO-01 — a tela só LÊ o banco (lote 113520) e marca (dados SINTÉTICOS; o banco é injetado).
 *   F1 a leitura da prévia (torta = nulo), o cadastro hoje e a marcação ao abrir (o diferente vem desmarcado), a frase da chave
 *   F2 o modal: cabeçalho só com a 1ª maiúscula, colunas em px (sem rolagem lateral), a soma da marcação
 *   F3 Gravar: o banco simula, a barra diz o que muda; Confirmar grava (simular=false) e vai ao "Gravado"
 *   F4 Desfazer pede o motivo; com ele chama o banco e diz o que voltou
 *   F5 não leu: a frase e "Tentar de novo"
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FormaPeloExtratoDialog, type FontesDaForma } from './FormaPeloExtratoDialog';
import { fraseDaChave, lerSugestoes, marcadoAoAbrir, noCadastro, somaDaMarcacao } from '@/lib/fornecedores/formaPeloExtrato';

const linha = (o: Record<string, unknown> = {}) => ({ fornecedor_id: 'f1', nome: 'Agropecuária Exemplo Ltda', pagamentos: 14, iguais_pct: 100,
  forma: 'PIX', forma_cadastro: 'PIX', exemplo: 'PAGAMENTO PIX', chave_sugerida: '12.345.678/0001-90', tipo_chave: 'CNPJ', abertos_sem_forma: 9,
  hoje_forma: null, hoje_chave: null, ...o });
const PREVIA = [linha(), linha({ fornecedor_id: 'f2', nome: 'Distribuidora Modelo', forma: 'Boleto', forma_cadastro: 'Boleto', exemplo: 'LIQUIDACAO BOLETO',
  chave_sugerida: null, tipo_chave: null, abertos_sem_forma: 7, hoje_forma: 'Boleto' }),
  linha({ fornecedor_id: 'f3', nome: 'Casa do Produtor Modelo', chave_sugerida: null, tipo_chave: null, abertos_sem_forma: 2, hoje_forma: 'Boleto' })];

describe('FORN-FORMA-PELO-EXTRATO-01 — a lib', () => {
  it('F1 leitura, cadastro hoje, marcação e chave', () => {
    const s = lerSugestoes(PREVIA);
    if (!s) throw new Error('fixture');
    expect(s.map(noCadastro)).toEqual(['em_branco', 'igual', 'diferente']);
    expect(s.map(marcadoAoAbrir)).toEqual([true, true, false]);
    expect(fraseDaChave(s[0])).toBe('CNPJ 12.345.678/0001-90');
    expect(fraseDaChave(s[1])).toBe('—');
    expect(fraseDaChave(s[2])).toBe('o extrato não traz a chave');
    expect(somaDaMarcacao(s, new Set(['f1', 'f2']))).toEqual({ fornecedores: 2, lancamentos: 16 });
    expect(lerSugestoes([linha({ pagamentos: 'x' })])).toBeNull();
    expect(lerSugestoes({})).toBeNull();
  });
});

const fontes = (o: Partial<FontesDaForma> = {}): FontesDaForma => ({
  ler: vi.fn(async () => PREVIA), gravacoes: vi.fn(async () => []),
  gravar: vi.fn(async (_c: string, ids: readonly string[], simular: boolean) => ({ ok: true, simulado: simular, fornecedores: ids.map((id) => ({ id })), lancamentos: 16 })),
  desfazer: vi.fn(async () => ({ ok: true, lancamentos_voltaram: 9, mantidos: [] })), ...o });

describe('FORN-FORMA-PELO-EXTRATO-01 — o modal', () => {
  it('F2 cabeçalho sem caixa alta, colunas em px, a soma', async () => {
    render(<FormaPeloExtratoDialog aberto clienteId="cli" aoFechar={() => {}} fontes={fontes()} />);
    const t = await screen.findByTestId('forma-tabela');
    const ths = Array.from(t.querySelectorAll('th')).map((th) => th.textContent ?? '').filter(Boolean);
    expect(ths).toEqual(['Fornecedor', 'Pagamentos', 'O que o extrato mostra', 'Iguais', 'Forma sugerida', 'Chave PIX sugerida', 'Abertos s/ forma', 'Hoje no cadastro']);
    for (const th of Array.from(t.querySelectorAll('th'))) expect(th.className).not.toMatch(/uppercase/);
    const cols = Array.from(t.querySelectorAll('col')).map((c) => c.getAttribute('style'));
    expect(cols.filter((c) => !c)).toHaveLength(1);   /* só o Fornecedor encolhe */
    expect(t.className).toContain('table-fixed');
    expect(screen.getByTestId('forma-corpo').className).toContain('overflow-x-hidden');
    expect(screen.getByTestId('forma-recado').textContent).toBe('2 fornecedores marcados · 16 lançamentos em aberto recebem a forma');
  });
  it('F3 Gravar simula; Confirmar grava e vai ao Gravado', async () => {
    const f = fontes();
    render(<FormaPeloExtratoDialog aberto clienteId="cli" aoFechar={() => {}} fontes={f} />);
    await screen.findByTestId('forma-tabela');
    fireEvent.click(screen.getByTestId('forma-gravar'));
    await waitFor(() => expect(f.gravar).toHaveBeenCalledWith('cli', ['f1', 'f2'], true));
    expect((await screen.findByTestId('forma-recado')).textContent).toMatch(/Vai gravar 2 cadastros e preencher 16 lançamentos em aberto/);
    expect(screen.getByTestId('forma-gravar').textContent).toBe('Confirmar');
    fireEvent.click(screen.getByTestId('forma-gravar'));
    await waitFor(() => expect(f.gravar).toHaveBeenCalledWith('cli', ['f1', 'f2'], false));
    await waitFor(() => expect(screen.getByTestId('forma-recado').textContent).toMatch(/^Gravado: 2 cadastros com a forma; 16 lançamentos/));
  });
  it('F4 Desfazer pede o motivo', async () => {
    const f = fontes({ gravacoes: vi.fn(async () => [{ id: 'op1', fornecedor_id: 'f1', forma: 'PIX', chave: null, lancamentos: ['a', 'b'], recusados: 0,
      feita_em: '2026-11-24T10:00:00Z', fornecedor: { nome: 'Agropecuária Exemplo Ltda' } }]) });
    render(<FormaPeloExtratoDialog aberto clienteId="cli" aoFechar={() => {}} fontes={f} />);
    await screen.findByTestId('forma-tabela');
    fireEvent.click(screen.getByRole('button', { name: /^2 · Gravado/ }));
    const linha1 = await screen.findByTestId('forma-gravacao');
    fireEvent.click(within(linha1).getByTestId('forma-desfazer'));
    fireEvent.click(screen.getByTestId('forma-desfazer-confirmar'));
    expect(screen.getByTestId('forma-recado').textContent).toBe('Escreva por que desfaz.');
    expect(f.desfazer).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('forma-desfazer-motivo'), { target: { value: 'era boleto' } });
    fireEvent.click(screen.getByTestId('forma-desfazer-confirmar'));
    await waitFor(() => expect(f.desfazer).toHaveBeenCalledWith('op1', 'era boleto', false));
    await waitFor(() => expect(screen.getByTestId('forma-recado').textContent).toMatch(/^Desfeito: o cadastro voltou; 9 lançamentos voltaram/));
  });
  it('F5 não leu: a frase e Tentar de novo', async () => {
    const ler = vi.fn(async () => { throw new Error('rede'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<FormaPeloExtratoDialog aberto clienteId="cli" aoFechar={() => {}} fontes={fontes({ ler })} />);
    expect((await screen.findByTestId('forma-erro')).textContent).toMatch(/Não consegui ler o extrato agora/);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(ler).toHaveBeenCalledTimes(2));
  });
});
