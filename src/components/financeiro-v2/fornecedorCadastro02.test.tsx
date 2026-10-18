/**
 * FORN-CADASTRO-02 — o cadastro completo de fornecedor: a busca por fantasia e por documento, o XML que completa sem sobrescrever,
 * "O que falta" e a estrutura do modal (5 abas, corpo que não rola, resumo lateral que some abaixo de 760px). Banco de mentira.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

function cadeia() {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'not', 'or', 'order', 'range', 'in', 'is', 'limit', 'single', 'maybeSingle', 'update', 'insert', 'delete']) c[m] = () => c;
  c.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
  return c;
}
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => cadeia(), rpc: async () => ({ data: null, error: null }) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());

import { FornecedorFormDialog } from './FornecedorFormDialog';
import { casaComABusca, montarOpcoes } from '@/lib/fornecedores/fornecedorTexto';
import { VAZIO, completarPeloEmitente, oQueFalta, FORMA_TED, FORMA_PIX } from '@/lib/fornecedores/cadastroDoFornecedor';
import type { EmitenteNFe } from '@/lib/financeiro/nfe/tipos';

const CASA = { id: 'v1', nome: 'LUIZ FERNANDO DA SILVA LTDA', nome_fantasia: 'CASA DO AGRONEGOCIO', cpf_cnpj: '54.442.418/0001-88', ativo: true };
const OUTRO = { id: 'v2', nome: 'Agro Beta', cpf_cnpj: null, ativo: true };

describe('busca: razão social, fantasia e documento (com e sem máscara)', () => {
  const opcoes = montarOpcoes([CASA, OUTRO]);
  const acha = (q: string) => opcoes.filter((o) => casaComABusca(o, q)).map((o) => o.f.id);
  it('acha pela fantasia, sem acento e sem caixa', () => {
    expect(acha('casa do agro')).toEqual(['v1']);
    expect(acha('Agronegócio')).toEqual(['v1']);
  });
  it('acha pela razão social e pelo documento com e sem máscara', () => {
    expect(acha('luiz fernando')).toEqual(['v1']);
    expect(acha('54442418000188')).toEqual(['v1']);
    expect(acha('54.442.418/0001-88')).toEqual(['v1']);
    expect(acha('beta')).toEqual(['v2']);
  });
});

describe('o XML da NF-e completa o cadastro: só campo vazio, nunca sobrescreve', () => {
  const EMIT: EmitenteNFe = {
    documento: '54442418000188', nome: 'LUIZ FERNANDO DA SILVA LTDA', fantasia: 'CASA DO AGRONEGOCIO', ie: '283456789',
    endereco: { logradouro: 'RUA A', numero: '10', complemento: null, bairro: 'CENTRO', municipio: 'CAMPO GRANDE', uf: 'ms', cep: '79000000', telefone: '6733333333' },
  };
  it('fornecedor novo (tudo vazio): grava fantasia, IE, tipo e endereço', () => {
    expect(completarPeloEmitente({}, EMIT)).toEqual({
      nome_fantasia: 'CASA DO AGRONEGOCIO', inscricao_estadual: '283456789', tipo_pessoa: 'PJ', logradouro: 'RUA A', numero: '10', bairro: 'CENTRO',
      municipio: 'CAMPO GRANDE', uf: 'MS', telefone: '6733333333', cep: '79000-000',
    });
  });
  it('fornecedor existente: o que já tem valor NÃO muda; só os vazios entram', () => {
    const p = completarPeloEmitente({ nome_fantasia: 'Casa (digitada)', municipio: 'Dourados', tipo_pessoa: 'PJ', telefone: '' }, EMIT);
    expect(p.nome_fantasia).toBeUndefined();
    expect(p.municipio).toBeUndefined();
    expect(p.tipo_pessoa).toBeUndefined();
    expect(p.telefone).toBe('6733333333');
    expect(p.inscricao_estadual).toBe('283456789');
  });
  it('CPF vira PF; sem fantasia nem endereço, nada inventado', () => {
    expect(completarPeloEmitente({}, { documento: '52998224725', nome: 'X', fantasia: null, ie: null, endereco: null })).toEqual({ tipo_pessoa: 'PF' });
  });
});

describe('"O que falta"', () => {
  it('pessoa de contato; banco/agência/conta quando a forma é TED; chave quando é Pix; CNPJ duplicado', () => {
    const base = { ...VAZIO, nome: 'X', cpf_cnpj: '54.442.418/0001-88' };
    expect(oQueFalta(base, { documentoInvalido: false, duplicadoCom: null }).map((f) => f.texto)).toEqual(['pessoa de contato']);
    expect(oQueFalta({ ...base, contato_nome: 'Fulano', tipo_recebimento: FORMA_TED, banco: '748 · Sicredi' }, { documentoInvalido: false, duplicadoCom: null }))
      .toEqual([{ aba: 'pagamento', texto: 'banco, agência e conta (TED)' }]);
    expect(oQueFalta({ ...base, contato_nome: 'F', tipo_recebimento: FORMA_PIX }, { documentoInvalido: false, duplicadoCom: 'Casa do Agronegocio' }).map((f) => f.texto))
      .toEqual(['CNPJ duplicado (Casa do Agronegocio)', 'chave Pix']);
  });
});

describe('o modal: tamanho fixo, 5 abas, nenhuma rola, resumo lateral com "O que falta"', () => {
  const montar = () => render(<FornecedorFormDialog open onClose={() => {}} editing={null} allFornecedores={[]} fazendas={[]} clienteId="cli" onSaved={() => {}}
    lerCadastro={async () => []} />);
  it('cabeçalho "Novo fornecedor", 5 abas, corpo overflow-hidden e o resumo que some abaixo de 760px', async () => {
    montar();
    expect(screen.getByText('Novo fornecedor')).toBeTruthy();
    expect(screen.getByTestId('cadastro-do-fornecedor').className).toContain('h-[min(400px,calc(100dvh-16px))] w-[min(900px,calc(100vw-16px))]');
    for (const a of ['dados', 'endereco', 'pagamento', 'padroes', 'uso']) expect(screen.getByTestId(`aba-${a}`)).toBeTruthy();
    const corpo = screen.getByTestId('corpo-do-fornecedor');
    expect(corpo.className).toContain('overflow-hidden');
    expect(corpo.className).not.toContain('overflow-y-auto');
    const resumo = screen.getByTestId('resumo-do-fornecedor');
    expect(resumo.className).toContain('w-[272px]');
    expect(resumo.className).toContain('hidden');
    expect(resumo.className).toContain('min-[760px]:flex');
    expect(screen.getByTestId('o-que-falta').textContent).toContain('razão social');
    /* sem rota externa de consulta: nenhum botão "Consultar" */
    expect(screen.queryByText(/Consultar/)).toBeNull();
  });
  it('a pendência da aba acende o ponto laranja; clicar em "O que falta" leva à aba', async () => {
    montar();
    expect(screen.getByTestId('pendencia-endereco')).toBeTruthy();
    expect(screen.queryByTestId('pendencia-padroes')).toBeNull();
    fireEvent.click(screen.getAllByTestId('falta').find((b) => b.textContent?.includes('pessoa de contato'))!);
    await waitFor(() => expect(screen.getByTestId('bloco-contato')).toBeTruthy());
    fireEvent.change(screen.getByTestId('campo-contato'), { target: { value: 'Fulano' } });
    expect(screen.queryByTestId('pendencia-endereco')).toBeNull();
    expect(screen.getByTestId('pares-do-resumo')).toBeTruthy();
  });
});
