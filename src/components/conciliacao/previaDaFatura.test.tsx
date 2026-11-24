/**
 * CARTAO-FATURA-IMPORT-01 (mock aprovado 23/11 13:38, vista 1) — a prévia da fatura no painel do cartão: lê o PDF (linhas SINTÉTICAS
 * injetadas), o que já está no sistema e o histórico; mostra os grupos e a coluna "o que o sistema vai fazer"; NADA grava.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const banco = vi.hoisted(() => ({
  existentes: [] as Record<string, unknown>[], historico: [] as Record<string, unknown>[], falha: false, filtrosDoHistorico: [] as string[], escritas: 0,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      let ehHistorico = false;
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'gte', 'lte', 'not', 'limit']) q[m] = () => q;
      q.or = (f: string) => { ehHistorico = true; banco.filtrosDoHistorico.push(f); return q; };
      for (const m of ['insert', 'update', 'delete', 'upsert']) q[m] = () => { banco.escritas += 1; return q; };
      q.then = (ok: (r: unknown) => unknown) => Promise.resolve(banco.falha && !ehHistorico /* só a leitura que COMPARA falha: o histórico não encobre */
        ? { data: null, error: { message: 'falhou' } }
        : { data: ehHistorico ? banco.historico : banco.existentes, error: null }).then(ok);
      return q;
    },
  },
}));
vi.mock('@/hooks/useFornecedoresDoCliente', () => ({
  leitorDeFornecedores: { ler: async () => [{ id: 'f-posto', nome: 'AUTO POSTO TREVO' }] },
}));
vi.mock('@/lib/financeiro/planoContasBuilder', () => ({
  loadContasDoPlanoDoCliente: async () => [{ id: 'p-comb', subcentro: 'Combustível', centro_custo: 'Veículos' }],
}));
vi.mock('@/lib/oc/leitura/linhasDoPdf', () => ({ extrairLinhasPdf: async () => ({ linhas: [], paginas: 0, temTexto: false }) }));

import { PreviaDaFatura, aGravar, cabecalhoDaFatura, MOTIVO_SEM_GRAVAR } from './PreviaDaFatura';
import { FRASE_FALHOU, FRASE_NAO_LI, FRASE_SEM_TEXTO } from '@/hooks/usePreviaDaFatura';

const FATURA = [
  'Fulano de Tal', 'OUROCARD VISA | Final 1234', 'Vencimento', '16/10/2031 | Pagamentos/Créditos | R$ -1.000,00',
  'Fatura fechada em | 05/10/2031', 'Data | Descrição | País | Valor', 'SALDO FATURA ANTERIOR | BR | R$ 1.000,00',
  'Pagamentos/Créditos', '16/09 | PGTO DEBITO CONTA 0001 000000001 200 | BR | R$ -1.000,00',
  'Serviços',
  '04/09 | POSTO TREVO | CAMPO GRANDE | BR | R$ 156,00',
  '10/09 | LOJA DO OUTRO CARTAO | CAMPO GRANDE | BR | R$ 90,00',
  '12/09 | PAPELARIA NOVA | CAMPO GRANDE | BR | R$ 40,00',
  'Total da Fatura | R$ 286,00',
];
const linhas = (l: string[]) => async () => ({ linhas: l, paginas: 1, temTexto: true });
const ARQ = new File(['%PDF'], 'fatura.pdf', { type: 'application/pdf' });
const nomeDaConta = (id: string) => ({ 'outro-cartao': 'Cartão Infinite' }[id] ?? id);

beforeEach(() => {
  banco.falha = false; banco.filtrosDoHistorico = []; banco.escritas = 0;
  banco.existentes = [{ id: 'l1', conta_bancaria_id: 'outro-cartao', data_vencimento: '2031-10-10', data_competencia: '2031-09-10', valor: 90,
    descricao: 'Loja do outro cartao', favorecido_id: null, status_transacao: 'realizado', tipo_operacao: '2-Saídas', plano_conta_id: null }];
  banco.historico = [
    { id: 'h1', conta_bancaria_id: 'cc', data_vencimento: '2031-05-01', data_competencia: '2031-05-01', valor: 100, descricao: 'abastecer',
      favorecido_id: 'f-posto', status_transacao: 'realizado', tipo_operacao: '2-Saídas', plano_conta_id: 'p-comb' },
  ];
});

const montar = (l = linhas(FATURA)) => {
  const aoVoltar = vi.fn();
  render(<div style={{ display: 'grid', gridTemplateRows: '40px 500px 52px', width: 550 }}>
    <PreviaDaFatura clienteId="cli" contaId="este-cartao" arquivo={ARQ} nomeDaConta={nomeDaConta} aoVoltar={aoVoltar} lerLinhas={l} />
  </div>);
  return { aoVoltar };
};

describe('a prévia da fatura no painel do cartão', () => {
  it('P1 os grupos do mock: o pagamento = transferência, a compra no OUTRO cartão = mover, o histórico sugere, o resto classificar', async () => {
    montar();
    await screen.findByTestId('fatura-grupos');
    const n = (g: string) => screen.getByTestId(`fatura-grupo-${g}`).textContent;
    expect([n('pagamento'), n('mover'), n('nova_sugestao'), n('nova_classificar')]).toEqual(['Pagamento 1', 'Mover 1', 'Nova · sugestão 1', 'Nova · classificar 1']);
    expect(screen.getByTestId('fatura-rodape').textContent).toBe('4 linhas: 1 casadas · 1 mover · 0 ajustar · 2 lançar');
    expect(screen.getByTestId('fatura-cabecalho').textContent).toBe('final 1234 · fechou 05/10/2031 · vence 16/10/2031 · total R$ 286,00');
    /* o 1º grupo com linha abre sozinho (a ordem do mock): "Lançado em outro cartão/conta" */
    expect(screen.getByTestId('fatura-grupo-mover').getAttribute('data-ligado')).toBe('sim');
    expect(screen.getByTestId('fatura-linha-faz').textContent).toBe('está em Cartão Infinite venc. 10/10 → mover para este cartão');
  });

  it('P2 clicar no grupo troca a tabela; a sugestão vem do FORNECEDOR do histórico; a data é dd/mm/aaaa', async () => {
    montar();
    fireEvent.click(await screen.findByTestId('fatura-grupo-nova_sugestao'));
    const l = screen.getByTestId('fatura-linha');
    expect(within(l).getAllByRole('cell').map((c) => c.textContent)).toEqual(['04/09/2031', 'POSTO TREVO CAMPO GRANDE', 'Combustível', '156,00', 'lançar · sugestão do mesmo estabelecimento (12 m)']);
    expect(screen.getByTestId('fatura-grupo-nova_sugestao').getAttribute('data-ligado')).toBe('sim');
    expect(banco.filtrosDoHistorico[0]).toContain('favorecido_id.in.(f-posto)');
  });

  it('P3 NADA GRAVA: o "Gravar N com prévia" desabilitado com o motivo escrito; nenhuma escrita no banco', async () => {
    montar();
    const b = await screen.findByTestId('fatura-gravar');
    expect(b.textContent).toBe('Gravar 3 com prévia');
    expect(b).toBeDisabled();
    expect(screen.getByTestId('fatura-motivo').textContent).toBe(MOTIVO_SEM_GRAVAR);
    expect(banco.escritas).toBe(0);
  });

  it('P4 a leitura do sistema FALHOU: a frase e "Tentar de novo" — nunca a lista vazia (que daria tudo "lançar")', async () => {
    banco.falha = true;
    montar();
    expect((await screen.findByTestId('fatura-erro')).textContent).toContain(FRASE_FALHOU);
    expect(screen.queryByTestId('fatura-grupos')).toBeNull();
    banco.falha = false;
    fireEvent.click(screen.getByTestId('fatura-tentar'));
    await screen.findByTestId('fatura-grupos');
  });

  it('P5 PDF sem texto e PDF que não é fatura Ourocard: dizem o porquê; cancelar volta', async () => {
    const a = montar(async () => ({ linhas: [], paginas: 1, temTexto: false }));
    expect((await screen.findByTestId('fatura-nao-li')).textContent).toBe(FRASE_SEM_TEXTO);
    fireEvent.click(screen.getByTestId('fatura-voltar'));
    expect(a.aoVoltar).toHaveBeenCalled();
  });
  it('P6 PDF com texto que não é a fatura', async () => {
    montar(linhas(['Extrato da conta corrente', 'Saldo | R$ 10,00']));
    expect((await screen.findByTestId('fatura-nao-li')).textContent).toBe(FRASE_NAO_LI);
  });

  it('P7 os números do rodapé e do cabeçalho saem das regras puras', () => {
    expect(cabecalhoDaFatura({ produto: null, finalCartao: null, titular: null, vencimento: null, fechamento: null, totalCent: null, saldoAnteriorCent: null,
      linhas: [], somaConfere: false, avisos: [] })).toBe('fechou — · vence — · total R$ —');
    expect(aGravar({ linhas: [], contagem: { ja_lancado: 0, parcela_casa: 0, diferenca: 0, mover: 0, nova_sugestao: 0, nova_classificar: 0, encargos: 0, pagamento: 0 }, rodape: '' })).toBe(0);
  });

  it('P8 o nome da conta chega como função NOVA a cada render: não dispara outra leitura', async () => {
    const ler = vi.fn(linhas(FATURA));
    const { rerender } = render(<PreviaDaFatura clienteId="cli" contaId="este-cartao" arquivo={ARQ} nomeDaConta={(id) => id} aoVoltar={() => {}} lerLinhas={ler} />);
    await screen.findByTestId('fatura-grupos');
    rerender(<PreviaDaFatura clienteId="cli" contaId="este-cartao" arquivo={ARQ} nomeDaConta={(id) => `${id}!`} aoVoltar={() => {}} lerLinhas={ler} />);
    await waitFor(() => expect(ler).toHaveBeenCalledTimes(1));
  });
});
