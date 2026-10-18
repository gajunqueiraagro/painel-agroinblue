/**
 * FORN-EDITAR-01 — o cadastro completo (`FornecedorFormDialog`) com o validador e a conferência de repetido, e o lápis do
 * seletor (`FavorecidoSelect`) que o abre em modo edição. Fornecedores SINTÉTICOS; o banco é de mentira.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/* ── banco de mentira: grava o que o UPDATE/INSERT recebeu; qualquer leitura devolve vazio ── */
const gravados: Array<{ tabela: string; op: string; payload: unknown }> = [];
function cadeia(tabela: string) {
  const resposta = { data: [], error: null, count: 0 };
  const c: Record<string, unknown> = {};
  const devolve = () => c;
  for (const m of ['select', 'eq', 'neq', 'not', 'or', 'order', 'range', 'in', 'is', 'limit', 'single', 'maybeSingle']) c[m] = devolve;
  c.update = (payload: unknown) => { gravados.push({ tabela, op: 'update', payload }); return c; };
  c.insert = (payload: unknown) => { gravados.push({ tabela, op: 'insert', payload }); return c; };
  c.delete = devolve;
  c.then = (ok: (r: unknown) => unknown) => Promise.resolve(resposta).then(ok);
  return c;
}
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (t: string) => cadeia(t), rpc: async () => ({ data: null, error: null }) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [{ id: 'faz1', nome: 'Faz Um' }] }) }));

import { FornecedorFormDialog } from './FornecedorFormDialog';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { definirFornecedoresDoLeitor, definirSituacaoDoLeitor } from '@/test/leitorDeFornecedoresFake';
import type { FornecedorParaConferir } from '@/lib/fornecedores/repetidosDoCadastro';
import { MOTIVO_CNPJ_DV } from '@/lib/fornecedores/documentoFiscal';

const base = { fazenda_id: null, ativo: true };
const EDITANDO = { id: 'f1', nome: 'Agro Alfa', cpf_cnpj: null, ...base };

function montar(opcoes: { editing?: typeof EDITANDO | null; cadastro?: FornecedorParaConferir[] } = {}) {
  const lerCadastro = vi.fn(async () => opcoes.cadastro ?? []);
  const onSaved = vi.fn();
  const onMesclar = vi.fn();
  render(
    <FornecedorFormDialog open onClose={() => {}} editing={opcoes.editing === undefined ? EDITANDO : opcoes.editing}
      allFornecedores={[]} fazendas={[]} clienteId="cli" onSaved={onSaved} lerCadastro={lerCadastro} onMesclar={onMesclar} />,
  );
  return { lerCadastro, onSaved, onMesclar };
}
const campoDoc = () => screen.getByPlaceholderText('000.000.000-00 ou 00.000.000/0000-00') as HTMLInputElement;
/* FORN-CADASTRO-02: o botão é "Salvar fornecedor" e só acende depois de a linha inteira ser lida (na edição) */
const botaoSalvar = () => screen.getByRole('button', { name: /^(Salvar fornecedor|Salvar mesmo assim)$/ }) as HTMLButtonElement;
const pronto = () => waitFor(() => expect(botaoSalvar().disabled).toBe(false));
const ultimoPayload = () => gravados.filter((g) => g.tabela === 'financeiro_fornecedores').at(-1)?.payload as Record<string, unknown> | undefined;

beforeEach(() => { gravados.length = 0; });

describe('o campo CPF/CNPJ do cadastro completo', () => {
  it('máscara ao digitar; inválido: motivo escrito no lugar reservado e Salvar desabilitado', async () => {
    montar();
    await pronto();
    fireEvent.change(campoDoc(), { target: { value: '11222333000182' } });
    expect(campoDoc().value).toBe('11.222.333/0001-82');
    expect(screen.getByTestId('cpf-cnpj-recado').textContent).toBe(MOTIVO_CNPJ_DV);
    expect(botaoSalvar().disabled).toBe(true);
    fireEvent.change(campoDoc(), { target: { value: '11222333000181' } });
    expect(screen.getByTestId('cpf-cnpj-recado').textContent).toBe('');
    expect(botaoSalvar().disabled).toBe(false);
  });
  it('o lugar do recado existe sempre, com a mesma altura', () => {
    montar();
    expect(screen.getByTestId('cpf-cnpj-recado').className).toContain('h-[14px]');
    expect(screen.getByTestId('fornecedor-recado').className).toContain('h-[30px]');
  });
  it('gravado fora do padrão: aparece como está, com o aviso; ao salvar grava formatado', async () => {
    const { onSaved } = montar({ editing: { ...EDITANDO, cpf_cnpj: '11222333000181' } });
    expect(campoDoc().value).toBe('11222333000181');
    expect(screen.getByTestId('cpf-cnpj-recado').textContent).toContain('Fora do padrão');
    expect(screen.getByTestId('cpf-cnpj-recado').textContent).toContain('Ao salvar, grava 11.222.333/0001-81.');
    await pronto();
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(ultimoPayload()?.cpf_cnpj).toBe('11.222.333/0001-81');
  });
});

describe('repetido: aviso escrito, o operador decide', () => {
  it('FORN-CADASTRO-02 — CPF/CNPJ de outro fornecedor (inativo também): AVISO escrito na aba com "Mesclar"; o Salvar NÃO bloqueia', async () => {
    const { lerCadastro, onSaved, onMesclar } = montar({
      cadastro: [{ id: 'f1', nome: 'Agro Alfa', cpf_cnpj: '11.222.333/0001-81', ativo: true },
        { id: 'f2', nome: 'Beta Antiga', cpf_cnpj: '11222333000181', ativo: false }],
    });
    await pronto();
    fireEvent.change(campoDoc(), { target: { value: '11222333000181' } });
    await waitFor(() => expect(screen.getByTestId('duplicado-do-documento').textContent).toContain('Este CNPJ também está cadastrado como Beta Antiga (inativo)'));
    expect(screen.getByTestId('mesclar-duplicado')).toBeTruthy();
    expect(screen.getByTestId('o-que-falta').textContent).toContain('CNPJ duplicado (Beta Antiga)');
    expect(screen.getByTestId('pendencia-dados')).toBeTruthy();
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(lerCadastro).toHaveBeenCalledTimes(2);   /* uma ao abrir (o aviso), outra no Salvar (o nome) */
    expect(ultimoPayload()?.cpf_cnpj).toBe('11.222.333/0001-81');
    /* "Mesclar" pede ao hospedeiro a ferramenta já com o par: o que fica (este) e o duplicado */
    fireEvent.click(screen.getByTestId('mesclar-duplicado'));
    expect(onMesclar).toHaveBeenCalledWith('f1', 'f2');
  });
  it('sem duplicado (o próprio não conta): grava direto', async () => {
    const { onSaved } = montar({ cadastro: [{ id: 'f1', nome: 'Agro Alfa', cpf_cnpj: '11.222.333/0001-81', ativo: true }] });
    await pronto();
    fireEvent.change(campoDoc(), { target: { value: '11222333000181' } });
    expect(screen.queryByTestId('duplicado-do-documento')).toBeNull();
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
  it('na edição, nome repetido também avisa', async () => {
    montar({ cadastro: [{ id: 'f9', nome: 'AGRO  ALFA', cpf_cnpj: null, ativo: false }] });
    await pronto();
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(screen.getByTestId('fornecedor-recado').textContent).toBe('Já existe fornecedor com este nome: AGRO  ALFA (inativo).'));
    expect(gravados).toEqual([]);
  });
  it('falha ao conferir: a frase, e nada gravado', async () => {
    render(<FornecedorFormDialog open onClose={() => {}} editing={EDITANDO} allFornecedores={[]} fazendas={[]} clienteId="cli"
      onSaved={() => {}} lerCadastro={async () => { throw new Error('rede'); }} />);
    await pronto();
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(screen.getByTestId('fornecedor-recado').textContent).toContain('Não foi possível conferir'));
    expect(gravados).toEqual([]);
  });
});

describe('o lápis do seletor', () => {
  function Campo({ inicial, linha }: { inicial: string; linha?: boolean }) {
    const [v, setV] = useState(inicial);
    return <FavorecidoSelect value={v} onChange={setV} clienteId="cli" linhaDoDocumento={linha} />;
  }
  beforeEach(() => {
    definirSituacaoDoLeitor({});
    definirFornecedoresDoLeitor([{ id: 'f1', nome: 'Agro Alfa', cpf_cnpj: null, ativo: true }]);
  });
  it('com fornecedor escolhido: o lápis abre o cadastro EXISTENTE em modo edição', async () => {
    render(<Campo inicial="f1" />);
    fireEvent.click(screen.getByTestId('favorecido-lapis'));
    expect(await screen.findByText('Editar fornecedor · Agro Alfa')).toBeTruthy();
    expect((screen.getByPlaceholderText('Razão social') as HTMLInputElement).value).toBe('Agro Alfa');
  });
  it('lugar reservado: existe sem escolha (vazio, mesma classe), e o lápis só aparece com escolha', () => {
    const { unmount } = render(<Campo inicial="" />);
    const lugarVazio = screen.getByTestId('favorecido-lapis-lugar').className;
    expect(screen.queryByTestId('favorecido-lapis')).toBeNull();
    unmount();
    render(<Campo inicial="f1" />);
    expect(screen.getByTestId('favorecido-lapis-lugar').className).toBe(lugarVazio);
    expect(screen.getByTestId('favorecido-lapis')).toBeTruthy();
  });
  it('célula de tabela (linha do documento desligada) e lista do hospedeiro: sem lápis', () => {
    const { unmount } = render(<Campo inicial="f1" linha={false} />);
    expect(screen.queryByTestId('favorecido-lapis-lugar')).toBeNull();
    unmount();
    render(<FavorecidoSelect value="f1" onChange={() => {}} fornecedores={[{ id: 'f1', nome: 'Agro Alfa', ativo: true }]} />);
    expect(screen.queryByTestId('favorecido-lapis-lugar')).toBeNull();
  });
});
