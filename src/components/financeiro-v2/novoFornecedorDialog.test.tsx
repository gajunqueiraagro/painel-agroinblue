/**
 * FORN-SELETOR-PADRAO-01 fatia 2c, commit 1a — o diálogo do cadastro da casa: os quatro caminhos, no gesto.
 * A fonte é de mentira (sintética); a regra é a de verdade.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { NovoFornecedorDialog } from './NovoFornecedorDialog';
import {
  FRASE_FALHA_AO_CONFERIR, FRASE_FALHA_AO_REATIVAR, FRASE_JA_EXISTE,
  type FonteDoCadastro, type FornecedorDoCadastro,
} from '@/lib/fornecedores/cadastroDaCasa';
import { normalizeFornecedorNome } from '@/lib/financeiro/normalizeFornecedorNome';

const f = (id: string, nome: string, o: Partial<FornecedorDoCadastro> = {}): FornecedorDoCadastro =>
  ({ id, nome, cpf_cnpj: null, fazenda_id: null, ativo: true, created_at: '2026-01-01T00:00:00Z', ...o });

afterEach(() => cleanup());

function montar(base: FornecedorDoCadastro[], o: { reativarFalha?: boolean; lerFalha?: boolean; clienteId?: string | null } = {}) {
  const salvar = vi.fn(async () => {}); const selecionar = vi.fn(); const fechar = vi.fn();
  const reativar = vi.fn(async () => { if (o.reativarFalha) throw new Error('rls'); });
  const fonte: FonteDoCadastro = {
    lerPorNome: async (_c, norm) => { if (o.lerFalha) throw new Error('rede'); return base.filter((x) => normalizeFornecedorNome(x.nome) === norm); },
    lerAtivos: async () => base.filter((x) => x.ativo),
    reativar,
  };
  render(<NovoFornecedorDialog open onClose={fechar} clienteId={o.clienteId === undefined ? 'cli' : o.clienteId} onSave={salvar} onSelecionar={selecionar} fonte={fonte} />);
  const digitar = (nome: string, doc = '') => {
    fireEvent.change(screen.getByPlaceholderText('Nome do fornecedor'), { target: { value: nome } });
    fireEvent.change(screen.getByPlaceholderText('Opcional'), { target: { value: doc } });
  };
  const recado = () => screen.getByTestId('novo-fornecedor-recado');
  return { salvar, selecionar, fechar, reativar, digitar, recado };
}
const salvarClique = () => fireEvent.click(screen.getByText('Salvar Fornecedor'));

describe('NovoFornecedorDialog — não duplica', () => {
  it('nome NOVO: cria pelo hospedeiro, com o nome e o documento digitados — e não seleciona nada', async () => {
    const t = montar([f('a', 'Alfa')]);
    t.digitar('  Novo de Verdade ', ' 123 ');
    salvarClique();
    await waitFor(() => expect(t.salvar).toHaveBeenCalledTimes(1));
    expect(t.salvar).toHaveBeenCalledWith('Novo de Verdade', '123');
    expect(t.selecionar).not.toHaveBeenCalled();
    expect(t.recado().textContent).toBe('');
  });

  it('nome que já existe ATIVO: NÃO cria; seleciona o existente e diz ao lado do botão; o diálogo fica aberto até o Fechar', async () => {
    const existente = f('a', 'João Sêmen');
    const t = montar([existente]);
    t.digitar('joao semen');
    salvarClique();
    await waitFor(() => expect(t.selecionar).toHaveBeenCalledWith(existente));
    expect(t.salvar).not.toHaveBeenCalled();
    expect(t.recado().textContent).toBe(FRASE_JA_EXISTE);
    expect(t.fechar).not.toHaveBeenCalled();
    expect(screen.queryByText('Salvar Fornecedor')).toBeNull();
    fireEvent.click(screen.getByText('Fechar'));
    expect(t.fechar).toHaveBeenCalledTimes(1);
    expect(t.selecionar).toHaveBeenCalledTimes(1);
  });

  it('nome que existe só INATIVO: pergunta; "Não reativar" volta ao formulário sem gravar nem selecionar', async () => {
    const inativo = f('i', 'Beta Boi', { ativo: false });
    const t = montar([inativo]);
    t.digitar('beta boi');
    salvarClique();
    await waitFor(() => expect(t.recado().textContent).toBe('Existe um fornecedor inativo com este nome: Beta Boi.'));
    expect([t.salvar.mock.calls.length, t.selecionar.mock.calls.length, t.reativar.mock.calls.length]).toEqual([0, 0, 0]);
    fireEvent.click(screen.getByText('Não reativar'));
    expect(screen.getByText('Salvar Fornecedor')).toBeTruthy();
    expect(t.recado().textContent).toBe('');
    expect([t.salvar.mock.calls.length, t.selecionar.mock.calls.length, t.reativar.mock.calls.length, t.fechar.mock.calls.length]).toEqual([0, 0, 0, 0]);
  });

  it('INATIVO, "Reativar e selecionar": reativa pela fonte (com o cliente), seleciona o reativado e fecha — sem criar', async () => {
    const inativo = f('i', 'Beta Boi', { ativo: false });
    const t = montar([inativo]);
    t.digitar('Beta Boi');
    salvarClique();
    fireEvent.click(await screen.findByText('Reativar e selecionar'));
    await waitFor(() => expect(t.fechar).toHaveBeenCalledTimes(1));
    expect(t.reativar).toHaveBeenCalledWith('cli', 'i');
    expect(t.selecionar).toHaveBeenCalledWith({ ...inativo, ativo: true });
    expect(t.salvar).not.toHaveBeenCalled();
  });

  it('reativação que falha: a frase ao lado do botão, nada selecionado, o diálogo continua na pergunta', async () => {
    const t = montar([f('i', 'Beta Boi', { ativo: false })], { reativarFalha: true });
    t.digitar('Beta Boi');
    salvarClique();
    fireEvent.click(await screen.findByText('Reativar e selecionar'));
    await waitFor(() => expect(t.recado().textContent).toBe(FRASE_FALHA_AO_REATIVAR));
    expect([t.selecionar.mock.calls.length, t.fechar.mock.calls.length]).toEqual([0, 0]);
    expect(screen.getByText('Não reativar')).toBeTruthy();
  });

  it('DOCUMENTO de outro fornecedor ativo: não cria nem seleciona sozinho; mostra de quem é; "Voltar" desfaz', async () => {
    const dono = f('d', 'Dono do Documento', { cpf_cnpj: '11.222.333/0001-44' });
    const t = montar([dono]);
    t.digitar('Nome Diferente', '11222333000144');
    salvarClique();
    await waitFor(() => expect(t.recado().textContent).toBe('Este CPF/CNPJ já é de Dono do Documento (11.222.333/0001-44).'));
    expect([t.salvar.mock.calls.length, t.selecionar.mock.calls.length]).toEqual([0, 0]);
    fireEvent.click(screen.getByText('Voltar'));
    expect(screen.getByText('Salvar Fornecedor')).toBeTruthy();
    expect([t.salvar.mock.calls.length, t.selecionar.mock.calls.length, t.fechar.mock.calls.length]).toEqual([0, 0, 0]);
  });

  it('DOCUMENTO de outro, "Selecionar …": o dono do documento é o selecionado, e nada é criado', async () => {
    const dono = f('d', 'Dono do Documento', { cpf_cnpj: '11.222.333/0001-44' });
    const t = montar([dono]);
    t.digitar('Nome Diferente', '11.222.333/0001-44');
    salvarClique();
    fireEvent.click(await screen.findByText('Selecionar Dono do Documento'));
    await waitFor(() => expect(t.fechar).toHaveBeenCalledTimes(1));
    expect(t.selecionar).toHaveBeenCalledWith(dono);
    expect(t.salvar).not.toHaveBeenCalled();
  });

  it('falha ao conferir: a frase, e NADA é criado; sem cliente: a frase, e nem consulta', async () => {
    const t = montar([], { lerFalha: true });
    t.digitar('Qualquer');
    salvarClique();
    await waitFor(() => expect(t.recado().textContent).toBe(FRASE_FALHA_AO_CONFERIR));
    expect([t.salvar.mock.calls.length, t.selecionar.mock.calls.length]).toEqual([0, 0]);
    cleanup();
    const s = montar([], { clienteId: null });
    s.digitar('Qualquer');
    salvarClique();
    await waitFor(() => expect(s.recado().textContent).toBe('Selecione o cliente antes de cadastrar o fornecedor.'));
    expect(s.salvar).not.toHaveBeenCalled();
  });

  it('tamanho fixo: o lugar do recado existe vazio, com aviso e com a pergunta, com a mesma classe de altura', async () => {
    const t = montar([f('i', 'Beta Boi', { ativo: false })]);
    const altura = () => t.recado().className.match(/h-\[\d+px\]/)?.[0];
    const vazio = altura();
    expect(vazio).toBe('h-[30px]');
    t.digitar('Beta Boi');
    salvarClique();
    await screen.findByText('Reativar e selecionar');
    expect(altura()).toBe(vazio);
    expect(t.recado().getAttribute('title')).toBe('Existe um fornecedor inativo com este nome: Beta Boi.');
  });
});
