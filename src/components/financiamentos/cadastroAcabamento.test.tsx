/**
 * FIN-FINANC-28 · CADASTRO DE CONTRATO — ACABAMENTO VISUAL (Gabriel 17/10/2026). O corpo cinza com os campos em blocos brancos (o bloco
 * da tela do contrato, reusado), a régua compacta (rótulo 10px sentence case, campo de 28px a 11px), percentual no campo de
 * percentual (nunca "R$"), todo seletor de entidade com busca, e o "O que falta" numa lista só. O diálogo é MONTADO, com o app simulado.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* EDITAR v2: o modo editar usa o hook da edição; na criação ele não é chamado de verdade */
vi.mock('@/hooks/useEdicaoDoContrato', () => ({ useEdicaoDoContrato: () => ({ salvarCabecalho: vi.fn(), editarParcelas: vi.fn(), regerar: vi.fn(), desfazer: vi.fn(), ultimaOperacao: null }) }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'c1', nome: 'Cliente Teste' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));
vi.mock('@/hooks/useFinanciamentoCadastro', () => ({ useFinanciamentoCadastro: () => ({ contas: [], classificacoes: [] }) }));
vi.mock('@/hooks/useContratoDeCredito', () => ({ useContratoDeCredito: () => ({ documentos: [] }) }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
vi.mock('@/components/financeiro-v2/NovoFornecedorDialog', () => ({ NovoFornecedorDialog: () => null }));
/* FIN-CONSORCIO-02 — o consórcio tem modal próprio (provado em `consorcioDialog.test.tsx`); aqui só a porta */
vi.mock('./ConsorcioDialog', () => ({ ConsorcioDialog: () => <div data-testid="consorcio-dialog" /> }));
vi.mock('@/integrations/supabase/client', () => {
  const q = { select: () => q, eq: () => Promise.resolve({ data: [], error: null }) };
  return { supabase: { from: () => q, rpc: () => Promise.resolve({ data: null, error: null }) } };
});

import { CadastroDeContratoDialog } from './CadastroDeContratoDialog';
import { faltaNoResumo, recusaAlemDaLista } from '@/lib/financiamentos/cadastroDoContrato';

const abrir = (natureza: 'financiamento' | 'consorcio') =>
  render(<CadastroDeContratoDialog aberto aoFechar={vi.fn()} prefill={{ natureza }} />);

/** a "foto" do diálogo: cada bloco com os rótulos dele, na ordem */
const foto = () => [...document.querySelectorAll('section[data-testid^="bloco-"]')].map((b) => [
  b.getAttribute('data-testid'),
  [...b.querySelectorAll('div.text-muted-foreground.text-\\[10px\\]')].map((r) => r.textContent),
]);

describe('acabamento do cadastro', () => {
  it('consórcio: o cadastro de contrato entrega ao modal próprio do consórcio (FIN-CONSORCIO-02)', () => {
    abrir('consorcio');
    expect(screen.getByTestId('consorcio-dialog')).toBeTruthy();
    expect(screen.queryByTestId('corpo-do-cadastro')).toBeNull();
  });

  it('financiamento: identificação, valores e datas, pagamento e classificação, garantias; a taxa de juros é percentual', () => {
    abrir('financiamento');
    expect(foto()).toEqual([
      ['bloco-identificacao', ['Descrição *', 'Credor (banco) *', 'Nº do contrato (cédula) *', 'Linha de crédito', 'Atividade *', 'Modalidade *']],
      ['bloco-valores', ['Valor contratado *', 'Data do contrato *', '1º vencimento *']],
      ['bloco-pagamento', ['Fazenda *', 'Conta de captação *', 'Plano · parcela de principal *', 'Plano · juros e encargos *']],
      ['bloco-garantias', ['Garantias', 'Finalidade (texto livre)']],
    ]);
    fireEvent.click(screen.getByText('Condições e cronograma'));
    const cond = screen.getByTestId('bloco-condicoes');
    expect(within(cond).getAllByTestId('campo-percentual')).toHaveLength(1);
  });

  it('nenhum rótulo em maiúsculas ou espaçado; "O que falta" em sentence case', () => {
    abrir('financiamento');
    for (const parte of [screen.getByTestId('corpo-do-cadastro'), screen.getByTestId('resumo-do-cadastro')]) {
      expect(parte.querySelectorAll('[class*="uppercase"], [class*="tracking-"]')).toHaveLength(0);
    }
    expect(within(screen.getByTestId('resumo-do-cadastro')).getByText('O que falta')).toBeTruthy();
  });

  it('o resumo: lista única; "+N" só quando não cabe; a recusa "Informe …" não repete a lista', () => {
    expect(faltaNoResumo(['a', 'b', 'c'])).toEqual({ visiveis: ['a', 'b', 'c'], resto: [] });
    expect(faltaNoResumo(['a', 'b', 'c', 'd', 'e', 'f', 'g']).resto).toEqual([]);
    expect(faltaNoResumo(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'])).toEqual({ visiveis: ['a', 'b', 'c'], resto: ['d', 'e', 'f', 'g', 'h', 'i', 'j', 'k'] });
    expect(recusaAlemDaLista('Informe a carta de crédito, o prazo (1 a 600 meses) e a 1ª parcela.', ['prazo'])).toBeNull();
    expect(recusaAlemDaLista('A soma do principal das parcelas (10) não fecha com o valor contratado (20).', ['prazo'])).toMatch(/A soma/);
    abrir('financiamento');
    expect(screen.getByTestId('o-que-falta').textContent).not.toMatch(/… e mais/);
  });

  it('todo seletor de entidade do diálogo é o da casa com busca (sem Select cru, Fazenda e Conta com busca)', () => {
    const fonte = readFileSync(resolve(__dirname, 'CadastroDeContratoDialog.tsx'), 'utf8');
    expect(fonte).not.toMatch(/<Select[\s>]|<select[\s>]/);
    const usos = (tag: string) => fonte.match(new RegExp(`<${tag}[\\s\\S]*?\\/>`, 'g')) ?? [];
    expect(usos('FazendaSelect')).toHaveLength(1);
    expect(usos('ContaBancariaSelect')).toHaveLength(1);
    for (const u of [...usos('FazendaSelect'), ...usos('ContaBancariaSelect')]) expect(u).toMatch(/\bcomBusca\b/);
    expect(fonte).not.toMatch(/size="compact" \/>\s*\}?\s*<\/Campo>/); // o plano não volta ao gatilho de 20px
  });
});
