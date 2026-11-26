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
import type { ItemSugerido } from '@/lib/financeiro/nfe/sugestaoDosItens';

/* o "hoje" de cada parcela no banco falso: a l1 é conciliada (🔒 conta, valor, vencimento), a l2 programada. A conta da l2 está VAZIA (a 4/4 da
   Alta Paulista); o fornecedor é o mesmo nas duas; a fazenda DIFERE (z1 × z2). */
const HOJE: Record<string, Record<string, unknown>> = {
  l1: { descricao: 'Cercas', numero_documento: 'NF 1', data_competencia: '2031-05-02', favorecido_id: 'f1', fazenda_id: 'z1', conta_bancaria_id: 'c0',
    plano_conta_id: 'p0', safra_id: 's0', valor: 632, data_vencimento: '2031-06-20' },
  l2: { descricao: 'Cercas', numero_documento: 'NF 1', data_competencia: '2031-05-02', favorecido_id: 'f1', fazenda_id: 'z2', conta_bancaria_id: null,
    plano_conta_id: 'p0', safra_id: 's0', valor: 632, data_vencimento: '2031-07-20' },
};
const NOMES: Record<string, string> = { f1: 'Fornecedor sintetico', z1: 'Fazenda Um', z2: 'Fazenda Dois', c0: 'Banco sintetico', c1: 'Banco da nota', p0: 'Manutenção', s0: 'Safra 30/31' };
const estado = vi.hoisted(() => ({ hoje: {} as Record<string, Record<string, unknown>>, nomes: {} as Record<string, string>, recusaJuntar: false }));
const banco = vi.hoisted(() => ({
  completarComANota: vi.fn(async (_c: string, pedido: readonly Record<string, unknown>[], _o: { juntar: boolean; chave: string | null; simular: boolean; valorNotaCent?: number | null })
    : Promise<Consulta<ResultadoCompletar>> => {
    /* NOTA-JUNTAR-CLASSIF-01 — juntar com contas diferentes no que FICA: a recusa do banco (`fn_parcelamento_juntar_lancamentos`) */
    const fica = (p: Record<string, unknown>) => ('plano_conta_id' in p ? p.plano_conta_id : estado.hoje[String(p.id)].plano_conta_id);
    const recusas = estado.recusaJuntar && _o.juntar && new Set(pedido.map(fica)).size > 1
      ? ['Os lançamentos têm classificações diferentes: acerte a classificação antes de juntar.'] : [];
    return ({ ok: true, valor: { ok: recusas.length === 0, recusas, operacao: null, financiamentoId: null,
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
      }) } });
  }),
  /* DA-NOTA-CLASSIF-01 — a sugestão pelos itens: por padrão a nota ainda não está gravada (`null`) */
  sugestaoDosItensDaNota: vi.fn(async (_c: string, _k: string | null): Promise<Consulta<ItemSugerido[] | null>> => ({ ok: true, valor: null })),
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
  estado.recusaJuntar = false;
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

describe('P163 v4 — uma linha por parcela, na ordem da casa', () => {
  it('as colunas: Parc. · Comp. · Venc. · Pgto. · Descrição · Nº · [as opcionais que mudam ou diferem] · Valor · Status; o cabeçalho numa linha', async () => {
    abrir();
    await conferido();
    /* DA-NOTA-CLASSIF-01 — a classificação (fazenda, subcentro, safra) aparece SEMPRE; a conta da nota mudaria a da l2 (vazia hoje): aparece;
       o fornecedor igual: não (e a legenda não diz mais "não mudam") */
    /* NOTA-ENTREGA-FUTURA-01 (3, Gabriel 25/11): a ORDEM DA LISTA do Financeiro — … · Fornecedor · Faz. · Plano de contas · (Safra) · Conta · NF · Valor · Status */
    expect(cabecalhos()).toEqual(['Parc.', 'Comp.', 'Venc.', 'Pgto.', 'Descrição', 'Fazenda', 'Plano de contas', 'Safra', 'Conta', 'NF', 'Valor', 'Status']);
    expect(screen.getByTestId('previa-iguais').textContent).toBe('Fornecedor: igual em todas');
    expect(screen.getByRole('dialog').textContent).toContain('O que a nota muda em cada parcela · NF 000.000.001 · Fornecedor sintetico · R$ 1.264,00');
    expect(screen.getByTestId('previa-dre').textContent).toBe('DRE: R$ 1.264,00 passam de 05/2031 para 06/2031');
    expect(screen.getByTestId('previa-rodape-frase').textContent).toContain('nada é gravado antes de você clicar');
    /* de início: Comp., Descrição e Nº marcados; as opcionais não */
    expect(['competencia', 'descricao', 'documento', 'fazenda', 'conta'].map((c) => screen.getByTestId(`previa-coluna-${c}`).getAttribute('data-state')))
      .toEqual(['checked', 'unchecked', 'checked', 'unchecked', 'unchecked']);   // URGENTE 29/10 — a Descrição vem desmarcada
    expect(banco.completarComANota.mock.calls.every((c) => c[2].simular)).toBe(true);
  });
  it('fornecedor igual em todas: SEM coluna; a fazenda igual em todas SEGUE com coluna (classificação sempre editável, DA-NOTA-CLASSIF-01)', async () => {
    estado.hoje.l2 = { ...HOJE.l2, fazenda_id: 'z1' };
    abrir();
    await conferido();
    expect(cabecalhos()).not.toContain('Fornecedor');
    expect(cabecalhos()).toEqual(expect.arrayContaining(['Fazenda', 'Plano de contas', 'Safra']));
    expect(screen.getByTestId('previa-iguais').textContent).not.toContain('azenda');
    /* na conciliada (l1) o cadeado fica SÓ no caixa: subcentro, fazenda e safra sem 🔒 */
    for (const c of ['fazenda', 'subcentro', 'safra']) expect(within(naColuna('l1', c)).queryByTestId('previa-cadeado')).toBeNull();
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
    /* NOTA-ENTREGA-FUTURA-01 (3): a frase curta; o motivo técnico não aparece na tela (vai no ⓘ) */
    expect((await screen.findByTestId('previa-falha')).textContent).toBe('Não consegui conferir agora. Tente de novo.');
    expect(screen.getByTestId('previa-rodape-frase').textContent).not.toContain('sem conexão');
    expect(screen.getByTestId('previa-gravar')).toBeDisabled();
    fireEvent.change(screen.getByTestId('previa-numero'), { target: { value: 'NF 2' } });
    await conferido();
    fireEvent.click(screen.getByTestId('previa-gravar'));
    expect((await screen.findByTestId('previa-erro')).textContent).toBe('O mês 06/2031 está fechado. Nada foi gravado.');
  });
});

/* DA-NOTA-CLASSIF-01 (Gabriel 24/11 09:17) — a sugestão pelos itens (PLANO-SUGESTAO-01 B2) na etapa 2: só sugere; o "usar" põe no "Aplicar a todas" */
describe('DA-NOTA-CLASSIF-01 — a sugestão da conta pelos itens', () => {
  const item = (n: number, plano: string, subcentro: string): ItemSugerido => ({ itemId: `i${n}`, nItem: n, planoContaId: plano, subcentro, fonte: 'a',
    confianca: 'alta', porque: 'Já usado 4× neste cliente.' });
  it('sem a nota gravada: diz "depois de gravar a nota" (nunca vazio calado)', async () => {
    abrir();
    expect(await screen.findByTestId('previa-sugestao-sem-nota')).toBeTruthy();
  });
  it('uma conta para todos os itens: "Sugestão pelos itens: <subcentro> · usar"; NADA vai ao pedido antes do clique; o clique leva às DUAS (a conciliada inclusive)', async () => {
    banco.sugestaoDosItensDaNota.mockResolvedValueOnce({ ok: true, valor: [item(1, 'p9', 'Peças e Pneus'), item(2, 'p9', 'Peças e Pneus')] });
    const confirmar = abrir();
    await conferido();
    expect((await screen.findByTestId('previa-sugestao-conta')).textContent).toBe('Peças e Pneus');
    expect(ultimoPedido().some((p: Record<string, unknown>) => 'plano_conta_id' in p)).toBe(false);
    fireEvent.click(screen.getByTestId('previa-sugestao-usar'));
    await waitFor(() => expect(ultimoPedido().map((p: Record<string, unknown>) => p.plano_conta_id)).toEqual(['p9', 'p9']));
    expect(screen.getByTestId('previa-coluna-subcentro').getAttribute('data-state')).toBe('checked');
    expect(screen.queryByTestId('previa-sugestao-usar')).toBeNull();
    expect(confirmar).not.toHaveBeenCalled();
  });
  it('DA-NOTA ETAPA 2 — a troca de subcentro DESTACADA: "Subcentro muda de Manutenção para Peças e Pneus" (antes do clique: a legenda)', async () => {
    estado.nomes.p9 = 'Peças e Pneus';
    banco.sugestaoDosItensDaNota.mockResolvedValueOnce({ ok: true, valor: [item(1, 'p9', 'Peças e Pneus')] });
    abrir();
    await conferido();
    expect(screen.queryByTestId('previa-troca-conta')).toBeNull();
    expect(screen.getByTestId('previa-legenda')).toBeTruthy();
    fireEvent.click(await screen.findByTestId('previa-sugestao-usar'));
    expect((await screen.findByTestId('previa-troca-conta-de')).textContent).toBe('Manutenção');
    expect(screen.getByTestId('previa-troca-conta-para').textContent).toBe('Peças e Pneus');
    expect(screen.getByTestId('previa-troca-conta').textContent).toBe('Subcentro muda deManutençãoparaPeças e Pneus');
  });
  it('a sugestão igual à de hoje: "já está nela", sem botão', async () => {
    banco.sugestaoDosItensDaNota.mockResolvedValueOnce({ ok: true, valor: [item(1, 'p0', 'Manutenção')] });
    abrir();
    await conferido();
    expect((await screen.findByTestId('previa-sugestao-igual')).textContent).toContain('já está nela');
    expect(screen.queryByTestId('previa-sugestao-usar')).toBeNull();
  });
  it('itens em contas diferentes: manda para a etapa Itens (nenhum palpite de uma conta só)', async () => {
    banco.sugestaoDosItensDaNota.mockResolvedValueOnce({ ok: true, valor: [item(1, 'p9', 'Peças'), item(2, 'p8', 'Combustível')] });
    abrir();
    expect((await screen.findByTestId('previa-sugestao-varias')).textContent).toBe('Os itens vão para 2 contas: divida na etapa Itens da nota');
  });
  it('P146 — a consulta que falha diz "Não consegui verificar" e oferece Tentar de novo (relê)', async () => {
    banco.sugestaoDosItensDaNota.mockResolvedValueOnce({ ok: false, motivo: 'sem conexão com o servidor' });
    abrir();
    expect((await screen.findByTestId('previa-sugestao-falha')).getAttribute('title')).toBe('sem conexão com o servidor');
    const antes = banco.sugestaoDosItensDaNota.mock.calls.length;
    fireEvent.click(screen.getByText('Tentar de novo'));
    await waitFor(() => expect(banco.sugestaoDosItensDaNota.mock.calls.length).toBe(antes + 1));
    expect(await screen.findByTestId('previa-sugestao-sem-nota')).toBeTruthy();
  });
});

describe('NOTA-JUNTAR-CLASSIF-01 — juntar com classificações diferentes resolve em 1 clique', () => {
  const abrirJuntando = (juntar = true) => {
    render(<PreviaCompletar open onFechar={() => {}} clienteId="cli" alvos={ALVOS} rotulos={{ l1: '1/2', l2: '2/2' }} todasIniciais={TODAS}
      atualizarNaoPagas={false} juntar={juntar} chave="k" onConfirmar={vi.fn(async () => null)} />);
  };
  /* o caso NJ (NF 176.663): a 1/2 em Manutenção Máquinas Agricultura, a 2/2 em Manutenção Máquinas Pecuária, cada uma com a safra da atividade */
  const doisLados = () => {
    estado.hoje.l1 = { ...estado.hoje.l1, plano_conta_id: 'p-agr', safra_id: 's-agr' };
    estado.hoje.l2 = { ...estado.hoje.l2, plano_conta_id: 'p-pec', safra_id: 's-pec' };
    estado.recusaJuntar = true;
  };
  it('a linha: "Usar a da 1/2 em todas" · "Usar a da 2/2 em todas" · "Dividir por item · em breve" (desligado); o rodapé curto; não grava', async () => {
    doisLados();
    abrirJuntando();
    const linhaJ = await screen.findByTestId('previa-juntar-classif');
    const botoes = within(linhaJ).getAllByRole('button').filter((b) => b.textContent && !/^\s*$/.test(b.textContent));
    expect(botoes.slice(0, 3).map((b) => b.textContent)).toEqual(['Usar a da 1/2 em todas', 'Usar a da 2/2 em todas', 'Dividir por item · em breve']);
    expect(within(linhaJ).getByText('Dividir por item · em breve')).toBeDisabled();
    expect((await screen.findByTestId('previa-recusa')).textContent).toBe('Escolha a classificação acima.');
    expect(screen.getByTestId('previa-gravar')).toBeDisabled();
  });
  it('o clique leva a conta E a safra da parcela às DUAS (a conciliada inclusive) e o juntar passa; a escolhida fica marcada', async () => {
    doisLados();
    abrirJuntando();
    fireEvent.click(await screen.findByText('Usar a da 2/2 em todas'));
    await waitFor(() => expect(ultimoPedido().map((p: Record<string, unknown>) => p.plano_conta_id)).toEqual(['p-pec', 'p-pec']));
    expect(ultimoPedido().map((p: Record<string, unknown>) => p.safra_id)).toEqual(['s-pec', 's-pec']);
    await conferido();
    expect(screen.getByText('Usar a da 2/2 em todas').className).toContain('bg-primary');
    expect(screen.getByTestId('previa-juntar-classif')).toBeTruthy();
  });
  it('sem juntar, ou com a mesma conta nas duas: nenhuma linha', async () => {
    doisLados();
    abrirJuntando(false);
    await conferido();
    expect(screen.queryByTestId('previa-juntar-classif')).toBeNull();
  });
  it('a mesma conta nas parcelas (juntando): nenhuma linha', async () => {
    abrirJuntando();
    await conferido();
    expect(screen.queryByTestId('previa-juntar-classif')).toBeNull();
  });
});
