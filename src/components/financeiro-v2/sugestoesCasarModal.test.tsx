/**
 * PR-CONC-SUGESTOES-CASAR-01 — o modal "Sugestões para casar" e o casar que abre o `CasarComBancoModal` preenchido.
 *
 * ⚠ jsdom NÃO FAZ LAYOUT: "nada cortado" e a largura foram medidos na tela. Aqui se prova a ESTRUTURA — as sete colunas
 *   com as larguras do briefing, os selos (azul tracejado = confere; âmbar = conferir antes), o vencido de mês anterior
 *   em âmbar, as filhas da soma com "↳" e um "casar" só por sugestão — e o valor do banco no campo com "era R$ X".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { sugerirCasamentos, type CandidatoSugestao, type Sugestao } from '@/lib/conciliacao/sugestoesCasamento';

const RPC = vi.hoisted(() => ({ chamadas: [] as { fn: string; args: Record<string, unknown> }[] }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      RPC.chamadas.push({ fn, args });
      return Promise.resolve({ data: { ok: true, no_extrato: 5665, soma: 5665, diferenca: 0 }, error: null });
    },
  },
}));
vi.mock('@/components/conciliacao/CriarLancamentoDaLinha', () => ({ CriarLancamentoDaLinha: () => null }));

import { SugestoesCasarModal } from './SugestoesCasarModal';
import { CasarComBancoModal } from './CasarComBancoModal';

beforeEach(() => { RPC.chamadas = []; });

const c = (p: Partial<CandidatoSugestao> & { lancamento_id: string; valor_assinado: number }): CandidatoSugestao => ({
  data_vencimento: '2026-09-05', competencia: '2026-09-01', descricao: 'Folha de Pagamento', fornecedor: null,
  favorecido_id: null, status_transacao: 'previsto', ja_conciliado: false, ...p,
});
const EXT_RABO = { data: '2026-09-15', historico: 'Pagamento de Boleto - BANCO RABOBANK INTERNATIONAL BRASIL S/', valor: -26127.18 };
const CANDS: CandidatoSugestao[] = [
  c({ lancamento_id: 'princ', valor_assinado: -22719.29, fornecedor: 'Banco Rabobank International Brasil S/A', favorecido_id: 'rabo', data_vencimento: '2026-09-01', descricao: 'Financiamento - principal', status_transacao: 'programado' }),
  c({ lancamento_id: 'juros', valor_assinado: -3407.89, fornecedor: 'Banco Rabobank International Brasil S/A', favorecido_id: 'rabo', data_vencimento: '2026-08-20', descricao: 'Financiamento - juros' }),
  c({ lancamento_id: 'igual', valor_assinado: -26127.18, fornecedor: 'Posto Trevo', data_vencimento: '2026-09-14' }),
];

function abrir(onCasar = vi.fn(), candidatos = CANDS, extrato = EXT_RABO) {
  /* A lista chega pronta, como a Conferência a entrega: o motor roda fora do modal. */
  const sugestoes = sugerirCasamentos(extrato, candidatos);
  render(<SugestoesCasarModal open onClose={() => {}} extrato={extrato} nomeConta="Banco do Brasil" sugestoes={sugestoes} onCasar={onCasar} />);
  return { modal: screen.getByTestId('sugestoes-casar'), onCasar };
}

describe('o modal "Sugestões para casar"', () => {
  it('cabeçalho navy, banco (valor · data · conta) e histórico no topo', () => {
    const { modal } = abrir();
    expect(within(modal).getByText('Sugestões para casar').closest('div')!.className).toContain('bg-primary');
    const topo = within(modal).getByText('banco').parentElement!;
    expect(within(topo).getByText('-26.127,18')).toBeInTheDocument();
    expect(within(topo).getByText(/15\/09 · Banco do Brasil/)).toBeInTheDocument();
    expect(within(modal).getByText(EXT_RABO.historico)).toBeInTheDocument();
  });

  /* decisão 4 (30/09): as larguras saíram do maior texto medido no NJ, e nada corta com "…" — o que passar quebra */
  it('a tabela tem 806px, com as sete colunas medidas no NJ', () => {
    const { modal } = abrir();
    const t = modal.querySelector('table')!;
    expect(t.style.width).toBe('806px');
    expect([...t.querySelectorAll('col')].map((x) => (x as HTMLElement).style.width))
      .toEqual(['40px', '196px', '220px', '160px', '74px', '64px', '52px']);
    expect([...t.querySelectorAll('th')].map((x) => x.textContent)).toEqual(['Venc.', 'Descrição', 'Fornecedor', 'Motivo', 'Valor', 'Status', '']);
    expect(t.className).toContain('text-[9.5px]');
  });

  it('mesmo valor primeiro, azul tracejado; a soma depois, com filhas "↳" e UM "casar"; por último as pistas de nome', () => {
    const { modal } = abrir();
    const linhas = within(modal).getAllByTestId('sugestao');
    /* o Rabobank casa pelo NOME: as duas parcelas também aparecem sozinhas, âmbar, depois da soma exata */
    expect(linhas.map((l) => within(l).getByTestId('sugestao-motivo').textContent)).toEqual([
      'mesmo valor', 'soma de 2 · 26 dias · vencido ago', 'nome · valor diferente', 'nome · valor diferente · vencido ago',
    ]);
    const selo0 = within(linhas[0]).getByTestId('sugestao-motivo');
    expect(selo0.textContent).toBe('mesmo valor');
    expect(selo0.className).toContain('border-dashed');
    expect(selo0.className).toContain('text-[8px]');
    expect(within(linhas[1]).getByTestId('sugestao-motivo').textContent).toBe('soma de 2 · 26 dias · vencido ago');
    expect(within(modal).getAllByTestId('sugestao-filha')).toHaveLength(2);
    expect(within(modal).getAllByText('↳')).toHaveLength(2);
    expect(within(modal).getAllByTestId('sugestao-casar')).toHaveLength(4);
    /* a linha-mãe da soma mostra a soma */
    expect(within(linhas[1]).getByText('-26.127,18')).toBeInTheDocument();
  });

  it('sem reticências: nenhum elemento com truncate/ellipsis; descrição, fornecedor e histórico quebram linha', () => {
    const { modal } = abrir();
    const todos = [modal, ...modal.querySelectorAll('*')];
    expect(todos.filter((el) => /\btruncate\b|text-ellipsis/.test(el.getAttribute('class') ?? ''))).toEqual([]);
    /* a busca sabe achar: ela conta as células de texto livre que quebram */
    const quebram = [...modal.querySelectorAll('td')].filter((td) => td.className.includes('whitespace-normal'));
    expect(quebram.length).toBeGreaterThan(0);
    expect(within(modal).getByText(EXT_RABO.historico).className).toContain('break-words');
    const selo = within(modal).getAllByTestId('sugestao-motivo')[0];
    expect(selo.className).not.toContain('whitespace-nowrap');
  });

  it('vencimento de mês anterior em âmbar negrito; status em texto de 8px com a cor da paleta', () => {
    const { modal } = abrir();
    const filhas = within(modal).getAllByTestId('sugestao-filha');
    const juros = filhas.find((f) => f.textContent?.includes('juros'))!;
    expect(juros.querySelector('td')!.className).toContain('text-amber-600');
    expect(juros.querySelector('td')!.className).toContain('font-semibold');
    const princ = filhas.find((f) => f.textContent?.includes('principal'))!;
    expect(princ.querySelector('td')!.className).not.toContain('text-amber-600');
    const status = within(princ).getByText('Programado');
    expect(status.className).toContain('text-[8px]');
    expect(status.className).toContain('text-[#1d4ed8]');
  });

  it('valor diferente: selo âmbar cheio', () => {
    const { modal } = abrir(vi.fn(), [
      c({ lancamento_id: 'amanda', valor_assinado: -3085, fornecedor: 'Amanda Montes Camargo' }),
    ], { data: '2026-09-04', historico: 'Pix - Agendamento - 04/09 05:35 CAMARGO PROMOCAO DE VENDA', valor: -5665 });
    const selo = within(modal).getByTestId('sugestao-motivo');
    expect(selo.textContent).toBe('nome · valor diferente');
    expect(selo.className).toContain('bg-amber-50');
    expect(selo.className).not.toContain('border-dashed');
  });

  it('sem sugestão, diz "nenhuma sugestão para este movimento"; o rodapé explica a ordem e as cores', () => {
    const { modal } = abrir(vi.fn(), []);
    expect(within(modal).getByText('nenhuma sugestão para este movimento')).toBeInTheDocument();
    expect(within(modal).getByText('ordem: mais provável primeiro · âmbar = conferir antes de casar')).toBeInTheDocument();
  });

  it('"casar" entrega a sugestão inteira (a soma com os dois lançamentos)', () => {
    const { modal, onCasar } = abrir();
    fireEvent.click(within(within(modal).getAllByTestId('sugestao')[1]).getByTestId('sugestao-casar'));
    const s: Sugestao = onCasar.mock.calls[0][0];
    expect(s.tipo).toBe('soma');
    expect(s.lancamentos.map((x) => x.lancamento_id).sort()).toEqual(['juros', 'princ']);
  });
});

describe('casar com valor diferente abre o CasarComBancoModal com o valor do banco', () => {
  const EXT = { extrato_id: 'e-amanda', data: '2026-09-04', historico: 'Pix - Agendamento - 04/09 05:35 CAMARGO PROMOCAO DE VENDA', valor: -5665 };
  it('o campo nasce com 5665,00 e a linha diz "era R$ 3.085,00"; o Conciliar manda esse valor à mesma RPC', async () => {
    render(<CasarComBancoModal open onClose={() => {}} extrato={EXT} contaBancariaId="bb" nomeConta="Banco do Brasil" onConciliado={() => {}}
      iniciais={[{ lancamento_id: 'amanda', descricao: 'Folha de Pagamento', fornecedor: 'Amanda Montes Camargo', valor_assinado: -3085, usarValorDoBanco: true }]} />);
    const campo = screen.getByLabelText('Valor de Folha de Pagamento') as HTMLInputElement;
    expect(campo.value).toBe('5665,00');
    expect(screen.getByTestId('era-valor').textContent).toBe('era R$ 3.085,00');
    /* o "era" ocupa o lugar do botão: com o campo já no valor do banco, o botão não aparece */
    expect(screen.queryByTestId('usar-valor-banco')).toBeNull();
    await waitFor(() => expect(RPC.chamadas.length).toBeGreaterThan(0));
    expect(RPC.chamadas[0]).toMatchObject({ fn: 'fn_espelho_casar', args: { p_simular: true, p_itens: [{ lancamento_id: 'amanda', valor: 5665 }] } });
    /* voltar o campo ao valor antigo tira o "era" — ele só diz o que mudou */
    fireEvent.change(campo, { target: { value: '3085,00' } });
    expect(screen.queryByTestId('era-valor')).toBeNull();
    /* e o botão volta, para quem quiser o valor do banco de novo */
    expect(screen.getByTestId('usar-valor-banco')).toBeInTheDocument();
  });
  it('sem a marca (o caminho de sempre), o campo nasce com o valor do lançamento e não há "era"', () => {
    render(<CasarComBancoModal open onClose={() => {}} extrato={EXT} contaBancariaId="bb" onConciliado={() => {}}
      iniciais={[{ lancamento_id: 'amanda', descricao: 'Folha de Pagamento', valor_assinado: -3085 }]} />);
    expect((screen.getByLabelText('Valor de Folha de Pagamento') as HTMLInputElement).value).toBe('3085,00');
    expect(screen.queryByTestId('era-valor')).toBeNull();
    expect(screen.getByTestId('usar-valor-banco')).toBeInTheDocument();
  });
});
