/**
 * P163 v4 (o mock aprovado pelo Gabriel 29/10 06:43) — a PRÉVIA "O que a nota muda em cada parcela": UMA LINHA POR PARCELA, toda célula que pode
 * mudar é um campo; a 1ª linha "Para todas" aplica a coluna inteira; a coluna opcional (fornecedor, fazenda, conta, subcentro, safra) só aparece
 * quando muda ou difere entre as parcelas. A grade desenha o que o BANCO (falso aqui) devolve e manda ao banco SÓ o que a pessoa deixou.
 * Dados SINTÉTICOS.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { Consulta } from '@/lib/financeiro/nfeConsultas';
import type { AlvoDaPrevia, ResultadoCompletar, ValoresParaTodas } from '@/lib/financeiro/nfe/notaCompletar';

/* o "hoje" de cada parcela no banco falso: a l1 é conciliada (🔒 conta, valor, vencimento), a l2 programada. A conta da l2 está VAZIA (a 4/4 da
   Alta Paulista); o fornecedor é o mesmo nas duas; a fazenda DIFERE (z1 × z2). */
const HOJE: Record<string, Record<string, unknown>> = {
  l1: { descricao: 'Cercas', numero_documento: 'NF 1', data_competencia: '2031-05-02', favorecido_id: 'f1', fazenda_id: 'z1', conta_bancaria_id: 'c0',
    plano_conta_id: 'p0', safra_id: 's0', valor: 632, data_vencimento: '2031-06-20' },
  l2: { descricao: 'Cercas', numero_documento: 'NF 1', data_competencia: '2031-05-02', favorecido_id: 'f1', fazenda_id: 'z2', conta_bancaria_id: null,
    plano_conta_id: 'p0', safra_id: 's0', valor: 632, data_vencimento: '2031-07-20' },
};
const NOMES: Record<string, string> = { f1: 'Fornecedor sintetico', z1: 'Fazenda Um', z2: 'Fazenda Dois', c0: 'Banco sintetico', c1: 'Banco da nota', p0: 'Manutenção', s0: 'Safra 30/31' };
const estado = vi.hoisted(() => ({ hoje: {} as Record<string, Record<string, unknown>>, nomes: {} as Record<string, string> }));
const banco = vi.hoisted(() => ({
  completarComANota: vi.fn(async (_c: string, pedido: readonly Record<string, unknown>[], _o: { juntar: boolean; chave: string | null; simular: boolean; valorNotaCent?: number | null })
    : Promise<Consulta<ResultadoCompletar>> => ({ ok: true, valor: { ok: true, recusas: [], operacao: null, financiamentoId: null,
      efeitoDre: [{ mesDe: '2031-05', subcentroDe: 'Manutenção', mesPara: '2031-06', subcentroPara: 'Manutenção', valor: 1264, lancamentos: 2 }],
      linhas: pedido.map((p) => {
        const id = String(p.id);
        const pago = id === 'l1';
        const campos: Record<string, { hoje: unknown; fica: unknown; muda: boolean; hojeNome: string | null; ficaNome: string | null; cadeado: string | null }> = {};
        for (const [k, h] of Object.entries(estado.hoje[id])) {
          const cad = pago && (k === 'conta_bancaria_id' || k === 'valor' || k === 'data_vencimento') ? 'conciliada: conta, valor e vencimento não mudam' : null;
          const fica = cad ? h : k in p ? p[k] : h;
          campos[k] = { hoje: h, fica, muda: fica !== h, hojeNome: estado.nomes[String(h)] ?? null, ficaNome: estado.nomes[String(fica)] ?? null, cadeado: cad };
        }
        return { id, descricao: 'Cercas', situacao: pago ? 'conciliada' : 'programada', parcelaN: null, campos };
      }) } })),
}));
vi.mock('@/lib/financeiro/nfeConsultas', () => banco);
import { PreviaCompletar } from './PreviaCompletar';

const ALVOS: AlvoDaPrevia[] = [{ id: 'l1', programada: false, notaValorCent: 63200, notaVencimento: '2031-06-20', pagamento: '2031-06-20', descricaoHoje: 'Cercas' },
  { id: 'l2', programada: true, notaValorCent: 63200, notaVencimento: '2031-07-20', pagamento: null, descricaoHoje: 'Cercas' }];
/* o "para todas": o fornecedor É o de hoje (não muda); a conta da nota (c1); o subcentro É o de hoje */
const TODAS: ValoresParaTodas = { descricaoBase: 'Cercas sintetico', favorecidoId: 'f1', fazendaId: null, contaId: 'c1', planoContaId: 'p0',
  numeroDocumento: 'NF 1', competencia: '2031-06-02', safraId: null };

function abrir(onConfirmar = vi.fn(async (_p: Record<string, unknown>[]): Promise<string | null> => null)) {
  render(<PreviaCompletar open onFechar={() => {}} clienteId="cli" alvos={ALVOS} rotulos={{ l1: '1/2', l2: '2/2' }} todasIniciais={TODAS}
    atualizarNaoPagas={false} juntar={false} chave="k" onConfirmar={onConfirmar} cabecalho="NF 000.000.001 · Fornecedor sintetico · R$ 1.264,00" />);
  return onConfirmar;
}
const ultimoPedido = () => banco.completarComANota.mock.calls[banco.completarComANota.mock.calls.length - 1][1];
const linha = (id: string): HTMLElement => {
  const l = screen.getAllByTestId('previa-linha').find((x) => x.getAttribute('data-alvo') === id);
  if (!l) throw new Error(`sem a linha ${id}`);
  return l;
};
const naColuna = (id: string, c: string): HTMLElement => {
  const td = linha(id).querySelector<HTMLElement>(`[data-coluna="${c}"]`);
  if (!td) throw new Error(`sem a coluna ${c} na ${id}`);
  return td;
};
const cabecalhos = () => [...screen.getByTestId('previa-tabela').querySelectorAll('th')].map((th) => th.textContent?.trim());
const conferido = () => waitFor(() => expect(screen.getByTestId('previa-gravar')).toBeEnabled());
const valorDe = (el: HTMLElement) => within(el).getByRole<HTMLInputElement>('textbox').value;

beforeEach(() => {
  banco.completarComANota.mockClear();
  estado.hoje = { l1: { ...HOJE.l1 }, l2: { ...HOJE.l2 } };
  estado.nomes = { ...NOMES };
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

describe('P163 v4 — uma linha por parcela, na ordem da casa', () => {
  it('as colunas: Parc. · Comp. · Venc. · Pgto. · Descrição · Nº · [as opcionais que mudam ou diferem] · Valor · Status; o cabeçalho numa linha', async () => {
    abrir();
    await conferido();
    /* a fazenda DIFERE (z1 × z2) e a conta da nota mudaria a da l2 (vazia hoje): aparecem; fornecedor, subcentro e safra iguais: não */
    expect(cabecalhos()).toEqual(['Parc.', 'Comp.', 'Venc.', 'Pgto.', 'Descrição', 'Nº documento', 'Fazenda', 'Conta', 'Valor', 'Status']);
    expect(screen.getByTestId('previa-iguais').textContent).toBe('Fornecedor, subcentro, safra: iguais em todas, não mudam');
    expect(screen.getByRole('dialog').textContent).toContain('O que a nota muda em cada parcela · NF 000.000.001 · Fornecedor sintetico · R$ 1.264,00');
    expect(screen.getByTestId('previa-dre').textContent).toBe('DRE: R$ 1.264,00 passam de 05/2031 para 06/2031');
    expect(screen.getByTestId('previa-rodape-frase').textContent).toContain('nada é gravado antes de você clicar');
    /* de início: Comp., Descrição e Nº marcados; as opcionais não */
    expect(['competencia', 'descricao', 'documento', 'fazenda', 'conta'].map((c) => screen.getByTestId(`previa-coluna-${c}`).getAttribute('data-state')))
      .toEqual(['checked', 'unchecked', 'checked', 'unchecked', 'unchecked']);   // URGENTE 29/10 — a Descrição vem desmarcada
    expect(banco.completarComANota.mock.calls.every((c) => c[2].simular)).toBe(true);
  });
  it('campo igual em todas e que não muda: SEM coluna; o mesmo campo diferente numa parcela: a coluna aparece', async () => {
    estado.hoje.l2 = { ...HOJE.l2, fazenda_id: 'z1' };
    abrir();
    await conferido();
    expect(cabecalhos()).not.toContain('Fazenda');
    expect(screen.getByTestId('previa-iguais').textContent).toContain('fazenda');
  });
  it('a célula que vai mudar: azul com o valor NOVO e o de hoje no title — sem riscado, sem "→"; 🔒 da conciliada em Valor e Vencimento', async () => {
    abrir();
    await conferido();
    const desc = within(naColuna('l1', 'descricao')).getByTestId('previa-muda');
    expect(desc.getAttribute('title')).toBe('hoje: Cercas');
    expect(valorDe(desc)).toBe('Cercas 1/2');   // URGENTE 29/10 — desmarcada: a de hoje + "i/N", nunca a base da nota
    expect(screen.getByTestId('previa-tabela').textContent).not.toContain('→');
    expect(screen.getByTestId('previa-tabela').querySelector('s')).toBeNull();
    expect(within(naColuna('l1', 'valor')).getByTestId('previa-cadeado').textContent).toBe('632,00');
    expect(within(naColuna('l1', 'vencimento')).getByTestId('previa-cadeado').textContent).toBe('20/06/2031');
    /* a programada: Venc. e Valor são campos */
    expect(within(naColuna('l2', 'valor')).getByRole('textbox')).toBeTruthy();
    expect(within(naColuna('l2', 'competencia')).getByTestId('previa-muda')).toBeTruthy();
  });
  it('editar a célula muda SÓ aquela parcela (a descrição da 2/2; a 1/2 segue com a "para todas")', async () => {
    abrir();
    await conferido();
    fireEvent.change(within(naColuna('l2', 'descricao')).getByRole('textbox'), { target: { value: 'Mourões da cerca' } });
    await waitFor(() => expect(ultimoPedido().find((p) => p.id === 'l2')?.descricao).toBe('Mourões da cerca'));
    expect(ultimoPedido().find((p) => p.id === 'l1')?.descricao).toBe('Cercas 1/2');
    /* o valor da programada editado só nela */
    fireEvent.change(within(naColuna('l2', 'valor')).getByRole('textbox'), { target: { value: '640,00' } });
    await waitFor(() => expect(ultimoPedido().find((p) => p.id === 'l2')?.valor).toBe(640));
    expect('valor' in (ultimoPedido().find((p) => p.id === 'l1') ?? {})).toBe(false);
  });
  it('"Para todas" muda a coluna INTEIRA (e marca a caixinha); a célula editada antes volta ao valor para todas', async () => {
    abrir();
    await conferido();
    fireEvent.change(within(naColuna('l2', 'descricao')).getByRole('textbox'), { target: { value: 'Mourões da cerca' } });
    fireEvent.change(screen.getByTestId('previa-descricao-base'), { target: { value: 'Arames' } });
    await waitFor(() => expect(ultimoPedido().map((p) => p.descricao)).toEqual(['Arames 1/2', 'Arames 2/2']));
    /* a competência para todas */
    fireEvent.change(screen.getByTestId('previa-competencia'), { target: { value: '10/06/2031' } });
    await waitFor(() => expect(ultimoPedido().map((p) => p.data_competencia)).toEqual(['2031-06-10', '2031-06-10']));
  });
  it('coluna desmarcada não vai ao pedido; marcar a Conta leva a conta SÓ à programada (nas pagas nunca muda)', async () => {
    abrir();
    await conferido();
    fireEvent.click(screen.getByTestId('previa-coluna-conta'));
    await waitFor(() => expect(ultimoPedido().some((p) => 'conta_bancaria_id' in p)).toBe(true));
    /* URGENTE 29/10 — a Descrição desmarcada (de início): a de hoje fica e ganha só o "i/N" */
    expect(ultimoPedido()).toEqual([{ id: 'l1', descricao: 'Cercas 1/2', numero_documento: 'NF 1', tipo_documento: 'Nota Fiscal', data_competencia: '2031-06-02' },
      { id: 'l2', descricao: 'Cercas 2/2', numero_documento: 'NF 1', tipo_documento: 'Nota Fiscal', data_competencia: '2031-06-02', conta_bancaria_id: 'c1' }]);
    /* marcar a Descrição é o ÚNICO jeito de a base da nota ir */
    fireEvent.click(screen.getByTestId('previa-coluna-descricao'));
    await waitFor(() => expect(ultimoPedido()[0].descricao).toBe('Cercas sintetico 1/2'));
  });
  it('o vazio em destaque: a conta vazia da 2/2 (âmbar, com a frase no title), mesmo com a coluna desmarcada', async () => {
    abrir();
    await conferido();
    const vazio = within(naColuna('l2', 'conta')).getByTestId('previa-vazio');
    expect(vazio.getAttribute('title')).toBe('Este lançamento está sem Conta: escolha ou marque a coluna Conta para completar.');
  });
  it('a data sempre dd/mm/aaaa (a competência da Vera saía "2026-08-18 · i…")', async () => {
    estado.hoje.l1 = { ...HOJE.l1, data_competencia: '2026-08-18' };
    estado.nomes['2026-08-18'] = '2026-08-18';
    abrir();
    await conferido();
    fireEvent.click(screen.getByTestId('previa-coluna-competencia'));
    await waitFor(() => expect(valorDe(naColuna('l1', 'competencia'))).toBe('18/08/2026'));
  });
  it('a prévia que não se confere (mesmo depois de uma boa) trava o gravar e diz; a recusa da gravação fica no rodapé', async () => {
    abrir(vi.fn(async () => 'O mês 06/2031 está fechado. Nada foi gravado.'));
    await conferido();
    banco.completarComANota.mockResolvedValueOnce({ ok: false, motivo: 'sem conexão' });
    fireEvent.change(screen.getByTestId('previa-numero'), { target: { value: 'NF 9' } });
    expect((await screen.findByTestId('previa-falha')).textContent).toBe('Não consegui conferir a prévia (sem conexão).');
    expect(screen.getByTestId('previa-gravar')).toBeDisabled();
    fireEvent.change(screen.getByTestId('previa-numero'), { target: { value: 'NF 2' } });
    await conferido();
    fireEvent.click(screen.getByTestId('previa-gravar'));
    expect((await screen.findByTestId('previa-erro')).textContent).toBe('O mês 06/2031 está fechado. Nada foi gravado.');
  });
});
