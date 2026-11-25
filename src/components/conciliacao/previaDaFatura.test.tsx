/**
 * CARTAO-FATURA-IMPORT-01 (mock aprovado 23/11 13:38, vista 1) — a prévia da fatura no painel do cartão: lê o PDF (linhas SINTÉTICAS
 * injetadas), o que já está no sistema e o histórico; mostra os grupos e a coluna "o que o sistema vai fazer".
 * CARTAO-FATURA-GRAVAR (25/11) — "Gravar N prontas": a prévia do banco (simular), a recusa NA LINHA, "Confirmar gravação", a releitura;
 * "Desfazer gravação" com motivo e prévia. O banco do gravar é a API INJETADA (falsa); nenhuma escrita direta em tabela.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const banco = vi.hoisted(() => ({
  existentes: [] as Record<string, unknown>[], historico: [] as Record<string, unknown>[], falha: false, filtrosDoHistorico: [] as string[], escritas: 0, colunas: [] as string[],
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      let ehHistorico = false;
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'gte', 'lte', 'not', 'limit']) q[m] = () => q;
      q.select = (c: string) => { banco.colunas.push(c); return q; };
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
vi.mock('@/lib/financeiro/planoContasBuilder', async (original) => ({
  planoToClassificacoes: (await original<typeof import('@/lib/financeiro/planoContasBuilder')>()).planoToClassificacoes,
  loadContasDoPlanoDoCliente: async () => [{ id: 'p-comb', cliente_id: null, tipo_operacao: '2-Saídas', macro_custo: 'Custeio', grupo_custo: null,
    centro_custo: 'Veículos', subcentro: 'Combustível', escopo_negocio: null, ativo: true, ordem_exibicao: 1 }],
}));
vi.mock('@/lib/oc/leitura/linhasDoPdf', () => ({ extrairLinhasPdf: async () => ({ linhas: [], paginas: 0, temTexto: false }) }));
vi.mock('@/contexts/FazendaContext', () => ({
  useFazenda: () => ({ fazendas: [{ id: 'faz-a', nome: 'Fazenda Exemplo A' }, { id: 'faz-adm', nome: 'Administrativo' }] }),
}));

import { PreviaDaFatura, cabecalhoDaFatura, FRASE_ESCOLHER, MOTIVO_NENHUMA_PRONTA } from './PreviaDaFatura';
import { FRASE_FALHOU, FRASE_NAO_LI, FRASE_SEM_TEXTO } from '@/hooks/usePreviaDaFatura';
import type { FaturaApi, GravacaoViva } from '@/lib/financeiro/cartao/faturaApi';

/* a API do gravar (falsa): o que cada chamada respondeu e o que recebeu */
const fatura = vi.hoisted(() => ({ viva: null as GravacaoViva | null, gravar: [] as unknown[], desfazer: [] as unknown[] }));
const api: FaturaApi = {
  gravar: vi.fn(async () => ({ ok: true as const, dados: fatura.gravar.shift() })),
  desfazer: vi.fn(async () => ({ ok: true as const, dados: fatura.desfazer.shift() })),
  gravacaoViva: vi.fn(async () => ({ ok: true as const, dados: fatura.viva })),
};

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

const LIDO = '2031-10-01T10:00:00.123456+00:00';
beforeEach(() => {
  banco.falha = false; banco.filtrosDoHistorico = []; banco.escritas = 0; banco.colunas = [];
  banco.existentes = [{ id: 'l1', conta_bancaria_id: 'outro-cartao', data_vencimento: '2031-10-10', data_competencia: '2031-09-10', valor: 90,
    descricao: 'Loja do outro cartao', favorecido_id: null, status_transacao: 'realizado', tipo_operacao: '2-Saídas', plano_conta_id: null, updated_at: LIDO }];
  banco.historico = [
    { id: 'h1', conta_bancaria_id: 'cc', data_vencimento: '2031-05-01', data_competencia: '2031-05-01', valor: 100, descricao: 'abastecer',
      favorecido_id: 'f-posto', status_transacao: 'realizado', tipo_operacao: '2-Saídas', plano_conta_id: 'p-comb', fazenda_id: 'faz-a' },
  ];
  fatura.viva = null; fatura.gravar = []; fatura.desfazer = [];
  vi.mocked(api.gravar).mockClear(); vi.mocked(api.desfazer).mockClear();
});

const montar = (l = linhas(FATURA)) => {
  const aoVoltar = vi.fn();
  render(<div style={{ display: 'grid', gridTemplateRows: '40px 500px 52px', width: 550 }}>
    <PreviaDaFatura clienteId="cli" contaId="este-cartao" arquivo={ARQ} nomeDaConta={nomeDaConta} aoVoltar={aoVoltar} lerLinhas={l} api={api} />
  </div>);
  return { aoVoltar, l };
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
    /* D1: a sugestão traz a conta E a fazenda (a do histórico) */
    expect(within(l).getAllByRole('cell').map((c) => c.textContent)).toEqual(['04/09/2031', 'POSTO TREVO CAMPO GRANDE', 'Combustível · Fazenda Exemplo A', '156,00', 'lançar · sugestão do mesmo estabelecimento (12 m)']);
    expect(screen.getByTestId('fatura-grupo-nova_sugestao').getAttribute('data-ligado')).toBe('sim');
    expect(banco.filtrosDoHistorico[0]).toContain('favorecido_id.in.(f-posto)');
  });

  it('P3 "Gravar N prontas" conta só as PRONTAS (D2): a sem conta/fazenda fica para depois; abrir a prévia NÃO grava nada', async () => {
    montar();
    const b = await screen.findByTestId('fatura-gravar');
    expect(b.textContent).toBe('Gravar 2 prontas');
    expect(b).toBeEnabled();
    expect(screen.getByTestId('fatura-motivo').textContent).toBe('2 prontas · ficam 1 incompleta');
    expect(banco.escritas).toBe(0);
    expect(api.gravar).not.toHaveBeenCalled();
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

  it('P7 o cabeçalho sai da regra pura', () => {
    expect(cabecalhoDaFatura({ produto: null, finalCartao: null, titular: null, vencimento: null, fechamento: null, totalCent: null, saldoAnteriorCent: null,
      linhas: [], somaConfere: false, avisos: [] })).toBe('fechou — · vence — · total R$ —');
  });

  it('P8 o nome da conta chega como função NOVA a cada render: não dispara outra leitura', async () => {
    const ler = vi.fn(linhas(FATURA));
    const { rerender } = render(<PreviaDaFatura clienteId="cli" contaId="este-cartao" arquivo={ARQ} nomeDaConta={(id) => id} aoVoltar={() => {}} lerLinhas={ler} api={api} />);
    await screen.findByTestId('fatura-grupos');
    rerender(<PreviaDaFatura clienteId="cli" contaId="este-cartao" arquivo={ARQ} nomeDaConta={(id) => `${id}!`} aoVoltar={() => {}} lerLinhas={ler} api={api} />);
    await waitFor(() => expect(ler).toHaveBeenCalledTimes(1));
  });
});

describe('CARTAO-FATURA-GRAVAR — gravar e desfazer pela prévia', () => {
  const okSim = (o: Record<string, unknown> = {}) => ({ ok: true, simulado: true, gravacao_id: null, lancar: 1, mover: 1, ajustar: 0, soma: 246, itens: [], ...o });
  const pedidoDa = (i: number) => vi.mocked(api.gravar).mock.calls[i];

  it('G1 Gravar → a PRÉVIA do banco (simular) com as 2 prontas → "Confirmar gravação" grava (não simula) → a fatura é relida', async () => {
    fatura.gravar = [okSim(), okSim({ simulado: false, gravacao_id: 'g1' })];
    const { l } = montar(vi.fn(linhas(FATURA)));
    fireEvent.click(await screen.findByTestId('fatura-gravar'));
    expect((await screen.findByTestId('fatura-confirmar')).textContent).toBe('Confirmar gravação');
    const [cli, conta, fat, itens, simular] = pedidoDa(0);
    expect([cli, conta, simular]).toEqual(['cli', 'este-cartao', true]);
    expect(fat).toMatchObject({ final: '1234', vencimento: '2031-10-16', total: 286, arquivo: 'fatura.pdf' });
    expect(itens).toEqual([
      { ordem: 2, gesto: 'lancar', data_compra: '2031-09-04', descricao: 'POSTO TREVO CAMPO GRANDE', valor: 156, tipo: 'saida', plano_conta_id: 'p-comb', fazenda_id: 'faz-a' },
      { ordem: 3, gesto: 'mover', lancamento_id: 'l1', lido_em: LIDO },
    ]);
    expect(screen.getByTestId('fatura-rodape').textContent).toBe('lança 1 · move 1 · R$ 246,00');
    expect(screen.getByTestId('fatura-motivo').textContent).toBe('prévia do banco · ficam 1 incompleta');
    fireEvent.click(screen.getByTestId('fatura-confirmar'));
    await waitFor(() => expect(screen.getByTestId('fatura-rodape').textContent).toBe('Gravada: lança 1 · move 1 · R$ 246,00'));
    expect(pedidoDa(1)[4]).toBe(false);
    expect(pedidoDa(1)[3]).toEqual(itens);
    await waitFor(() => expect(l).toHaveBeenCalledTimes(2));
    expect(banco.escritas).toBe(0);
    /* o `lido_em` é o `updated_at` LIDO junto (a trava "mudou desde a leitura" do banco) e a fazenda do histórico (D1) */
    expect(banco.colunas[0]).toMatch(/\bupdated_at\b.*\bfazenda_id\b/);
  });

  it('G2 a recusa vem NA LINHA (vermelho, a frase do banco) e a linha sai do pedido; as outras seguem para a confirmação', async () => {
    fatura.gravar = [{ ok: false, simulado: true, recusadas: 1, itens: [{ ordem: 2, recusa: null },
      { ordem: 3, gesto: 'mover', recusa: { motivo: 'realizado', frase: 'Já está realizado: resolva no Editar.' } }] }, okSim({ mover: 0, soma: 156 })];
    montar();
    fireEvent.click(await screen.findByTestId('fatura-gravar'));
    await screen.findByTestId('fatura-confirmar');
    expect(pedidoDa(1)[3]).toEqual([expect.objectContaining({ ordem: 2 })]);
    expect(screen.getByTestId('fatura-motivo').textContent).toBe('prévia do banco · ficam 1 incompleta · 1 recusada');
    fireEvent.click(screen.getByTestId('fatura-grupo-mover'));
    const faz = screen.getByTestId('fatura-linha-faz');
    expect(faz.textContent).toBe('Já está realizado: resolva no Editar.');
    expect(faz.className).toContain('text-destructive');
  });

  it('G3 o erro do banco (frase pronta) fica no rodapé; nada se confirma', async () => {
    vi.mocked(api.gravar).mockResolvedValueOnce({ ok: false, frase: 'A fatura não tem vencimento lido: nada a gravar. Nada foi gravado.' });
    montar();
    fireEvent.click(await screen.findByTestId('fatura-gravar'));
    await waitFor(() => expect(screen.getByTestId('fatura-motivo').textContent).toBe('A fatura não tem vencimento lido: nada a gravar. Nada foi gravado.'));
    expect(screen.queryByTestId('fatura-confirmar')).toBeNull();
    expect(api.gravar).toHaveBeenCalledTimes(1);
  });

  it('G4 a linha a lançar se completa na tabela: clicar nela abre conta e fazenda na faixa; a que falta diz o quê, em vermelho; mover não abre', async () => {
    montar();
    fireEvent.click(await screen.findByTestId('fatura-grupo-nova_classificar'));
    const linha = screen.getByTestId('fatura-linha');
    const conta = within(linha).getByTestId('fatura-linha-conta');
    expect([conta.textContent, conta.className.includes('text-destructive'), linha.getAttribute('data-estado')]).toEqual(['falta conta e fazenda', true, 'falta']);
    expect(screen.getByTestId('fatura-escolha').textContent).toBe(FRASE_ESCOLHER);
    fireEvent.click(linha);
    expect(screen.getByTestId('fatura-escolha-conta')).toBeTruthy();
    expect(screen.getByTestId('fatura-escolha-fazenda')).toBeTruthy();
    fireEvent.click(screen.getByTestId('fatura-grupo-mover'));
    fireEvent.click(screen.getByTestId('fatura-linha'));
    expect(screen.getByTestId('fatura-escolha').textContent).toBe(FRASE_ESCOLHER);
  });

  it('G5 nenhuma pronta: o Gravar apaga com o motivo escrito', async () => {
    montar(linhas(FATURA.filter((x) => !x.includes('POSTO') && !x.includes('OUTRO CARTAO')).map((x) => x.replace('R$ 286,00', 'R$ 40,00'))));
    const b = await screen.findByTestId('fatura-gravar');
    expect([b.textContent, (b as HTMLButtonElement).disabled, b.title]).toEqual(['Gravar 0 prontas', true, MOTIVO_NENHUMA_PRONTA]);
  });

  it('G6 "Desfazer gravação" (a fatura gravada): motivo obrigatório → a prévia ("N voltam · M ficam") → Desfazer → relê', async () => {
    fatura.viva = { id: 'g1', feitaEm: '2031-10-20T13:00:00+00:00' };
    fatura.desfazer = [{ ok: true, simulado: true, voltaram: 2, ficaram: [{ ordem: 3, motivo: 'mudou', frase: 'mudou depois' }] }, { ok: true, simulado: false, voltaram: 2, ficaram: [] }];
    const { l } = montar(vi.fn(linhas(FATURA)));
    expect((await screen.findByTestId('fatura-gravada')).textContent).toBe('gravada em 20/10/2031 · Desfazer gravação');
    fireEvent.click(screen.getByTestId('fatura-desfazer'));
    const prever = screen.getByTestId('fatura-prever-desfazer');
    expect(prever).toBeDisabled();
    fireEvent.change(screen.getByTestId('fatura-motivo-desfazer'), { target: { value: 'fatura errada' } });
    fireEvent.click(prever);
    expect((await screen.findByTestId('fatura-rodape')).textContent).toBe('Desfazer: 2 linhas voltam · 1 fica (mudaram depois)');
    expect(vi.mocked(api.desfazer).mock.calls[0]).toEqual(['g1', 'fatura errada', true]);
    fireEvent.click(screen.getByTestId('fatura-confirmar-desfazer'));
    await waitFor(() => expect(screen.getByTestId('fatura-rodape').textContent).toBe('Desfeita: 2 linhas voltam'));
    expect(vi.mocked(api.desfazer).mock.calls[1]).toEqual(['g1', 'fatura errada', false]);
    await waitFor(() => expect(l).toHaveBeenCalledTimes(2));
  });
});
