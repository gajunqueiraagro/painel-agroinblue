/**
 * PR 4 — o MODAL DE ANÁLISE da Visão Geral (o banco é falso: devolve uma `fn_vg_analise` pronta e guarda cada pedido).
 *   A1 abre na aba e no nível clicados: o pedido leva lado, aba, foco e mês; a aba fica marcada
 *   A2 a tela não soma: valor, meta, Dif. R$, %, KPIs e o centro do donut são os do banco, escritos; sem meta → "—"
 *   A3 critério e unidade vão ao banco; a unidade que não vale fica apagada; a que o novo foco não aceita volta para R$
 *   A4 navegação: linha da direita → item do gráfico; ‹ › → o irmão seguinte; caminho → aba; esquerda → foco
 *   A5 PR 5 — "N lanç. ›" abre a GAVETA no nó da linha: pede a `fn_vg_gaveta` (nó, mês, critério e o recorte da tela) e não troca o
 *      gráfico; Esc fecha a gaveta antes do modal
 *   G1 a gaveta escreve o que o banco mandou (a tela não soma): indicadores, resumo, filhos (clique desce), total fixo
 *   G2 subcentro: lançamentos com data dd/mm/aaaa; a parte 2 da divisão ("id#2") abre o LANÇAMENTO (o lancamento_id); "Mais N de M ›"
 *      pede a página seguinte e a acrescenta; nó vazio: a frase dentro do quadro
 *   G3 salvou (a versão subiu): a gaveta relê as páginas já abertas, sem fechar; "Ver na lista" leva os filtros equivalentes
 *   G4 (G4, G4a–c) o AVISO acima do "Ver na lista" (a tela nunca esconde diferença): várias contas, vencidos de antes da janela, transferências
 *      entre contas escolhidas — cada um com a sua frase; sem diferença a linha fica vazia; o lugar existe em qualquer nível. O nó de
 *      transferências abre a lista no tipo "3-Transferências", sem centro
 *   G5 (PR 5b) a transferência de ENTRADA abre a lista com a conta em CONTA DESTINO (a de saída, em Conta Origem); a VIRADA DO ANO
 *      (média/acumulado nov/25 → fev/26): a 4ª frase com os meses do caso, depois das outras (hover com todas); no mesmo ano, nada
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc, from: () => ({}) } }));

import { ModalAnaliseVG } from './ModalAnaliseVG';
import type { AnaliseVG, LinhaAnaliseVG } from '@/lib/financeiro/visaoGeralAnalise';
import type { GavetaVG, LancamentoGavetaVG } from '@/lib/financeiro/visaoGeralGaveta';

const linha = (caminho: (string | null)[], rotulo: string, valor: number | null, meta: number | null, extra: Partial<LinhaAnaliseVG> = {}): LinhaAnaliseVG => ({
  caminho, rotulo, grupo: caminho[0] ?? null, valor, meta, dif: meta == null || valor == null ? null : Math.round((valor - meta) * 100) / 100,
  pct: meta ? 12.3 : null, razao: meta ? 1.123 : null, qtd: 7, unidade_valida: true, faixa: meta ? 'risco' : null, ...extra,
});
const ANALISE: AnaliseVG = {
  lado: 'saida', mes: '2026-09', criterio: 'mes', unidade: 'rs', meses_janela: 1, periodo: { de: '2026-01', ate_mes: '2026-09' },
  abas: [{ grupo: 'Custeio', rotulo: 'Custeio' }, { grupo: 'Juros', rotulo: 'Juros' }],
  unidades: [{ id: 'rs', rotulo: 'R$', valida: true }, { id: 'rs_cab', rotulo: 'R$/cab/mês', valida: true }, { id: 'rs_ha_agri', rotulo: 'R$/ha agricultura', valida: false }],
  resumo: { ...linha(['Custeio'], 'Custeio', 773404.73, 700000), valor_rs: 773404.73, pct_da_raiz: 61.2,
    fatias: [{ caminho: ['Custeio', 'pecuaria'], rotulo: 'Pecuária', grupo: 'Custeio', pct: 90 }, { caminho: ['Custeio', 'agricultura'], rotulo: 'Agricultura', grupo: 'Custeio', pct: 10 }] },
  tabela: { total: linha(['Custeio'], 'Custeio', 773404.73, 700000),
    linhas: [linha(['Custeio', 'pecuaria'], 'Pecuária', 754685.64, null), linha(['Custeio', 'agricultura'], 'Agricultura', 18719.09, 20000)] },
  foco: { total: linha(['Custeio'], 'Custeio', 773404.73, 700000),
    linhas: [linha(['Custeio', 'pecuaria'], 'Pecuária', 754685.64, null), linha(['Custeio', 'agricultura'], 'Agricultura', 18719.09, 20000)] },
  grafico: {
    item: linha(['Custeio'], 'Custeio', 773404.73, 700000),
    caminho: [{ caminho: [], rotulo: 'Saídas' }, { caminho: ['Custeio'], rotulo: 'Custeio' }],
    irmaos: [['Custeio'], ['Juros']],
    serie: [{ am: '2026-08', realizado: 600000, previsto: 0, total: 600000, media: 600000, meta: 700000 },
            { am: '2026-09', realizado: 773404.73, previsto: 0, total: 773404.73, media: 686702.37, meta: 700000 }],
    kpis: { mes: 773404.73, media: 686702.37, vs_meta: 10.5, tendencia: 28.9 },
  },
};
const CTX = { clienteId: 'cli', de: '2026-01-01', ate: '2026-12-31', contas: null, fazendas: null, atividade: null, hoje: '2026-10-23', status: ['previsto'], comVencidos: true };

const lanc = (i: number, extra: Partial<LancamentoGavetaVG> = {}): LancamentoGavetaVG => ({
  chave: `l${i}`, lancamento_id: `l${i}`, parte_ordem: 1, partes_total: 1, data: `2026-09-${String(10 + i).padStart(2, '0')}`,
  favorecido: `Favorecido ${i}`, descricao: `Compra ${i}`, conta: 'Banco X', valor: 100 * (i + 1), valor_lancamento: 100 * (i + 1),
  status: 'realizado', previsto: false, vencido: false, ...extra,
});
const GAV_FILHOS: GavetaVG = {
  lado: 'saida', mes: '2026-09', criterio: 'mes', janela: { de: '2026-09-01', ate: '2026-09-30' }, folha: false,
  caminho: [{ caminho: [], rotulo: 'Saídas' }, { caminho: ['Custeio'], rotulo: 'Custeio' }, { caminho: ['Custeio', 'agricultura'], rotulo: 'Agricultura' }],
  irmaos: [{ caminho: ['Custeio', 'pecuaria'], rotulo: 'Pecuária', valor: 754685.64 }, { caminho: ['Custeio', 'agricultura'], rotulo: 'Agricultura', valor: 18719.09 }],
  qtd: 9, total: 18719.09, medio: 2079.9,
  resumo: { tipo: 'filhos', linhas: [{ rotulo: 'Insumos', qtd: 6, valor: 15000, pct: 80.1 }, { rotulo: 'Mão de obra', qtd: 3, valor: 3719.09, pct: 19.9 }] },
  linhas: [{ caminho: ['Custeio', 'agricultura', 'Insumos'], rotulo: 'Insumos', qtd: 6, valor: 15000, pct: 80.1 },
           { caminho: ['Custeio', 'agricultura', 'Mão de obra'], rotulo: 'Mão de obra', qtd: 3, valor: 3719.09, pct: 19.9 }],
  total_linhas: 2, pagina: 1, por_pagina: 500, paginas: 1,
};
const SUB: (string | null)[] = ['Custeio', 'agricultura', 'Insumos', 'Sementes'];
const GAV_FOLHA = (pagina = 1): GavetaVG => ({
  ...GAV_FILHOS, folha: true, caminho: [...GAV_FILHOS.caminho, { caminho: SUB.slice(0, 3), rotulo: 'Insumos' }, { caminho: SUB, rotulo: 'Sementes' }],
  irmaos: [{ caminho: SUB, rotulo: 'Sementes', valor: 1234.56 }], qtd: 501, total: 98765.43, medio: 197.13,
  resumo: { tipo: 'favorecido', linhas: [{ rotulo: 'Favorecido 1', qtd: 3, valor: 600 }] },
  linhas: pagina === 1 ? [lanc(0), lanc(1, { chave: 'l9#2', lancamento_id: 'l9', parte_ordem: 2, partes_total: 2, valor: 40, valor_lancamento: 100 })]
                       : [lanc(2, { previsto: true, vencido: true, status: 'previsto' })],
  total_linhas: 3, pagina, por_pagina: 2, paginas: 2,
});

let resposta: AnaliseVG = ANALISE;
let gaveta: (args: any) => GavetaVG = () => GAV_FILHOS;
beforeEach(() => {
  (globalThis as any).ResizeObserver ??= class { observe() {} disconnect() {} };
  rpc.mockReset(); resposta = ANALISE; gaveta = () => GAV_FILHOS;
  rpc.mockImplementation(async (fn: string, args: any) => ({ data: fn === 'fn_vg_gaveta' ? gaveta(args) : resposta, error: null }));
});
const ultimo = () => rpc.mock.calls.filter((c) => c[0] === 'fn_vg_analise').at(-1)![1];
const daGaveta = () => rpc.mock.calls.filter((c) => c[0] === 'fn_vg_gaveta').map((c) => c[1]);
const passar = () => act(async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); });
const abrir = async (grupo: string | null = 'Custeio', onLanc = vi.fn(), extra: Partial<React.ComponentProps<typeof ModalAnaliseVG>> = {}) => {
  const r = render(<ModalAnaliseVG alvo={{ lado: 'saida', grupo, am: '2026-09' }} ctx={CTX} rotuloContas="Caixa + cartões" onFechar={() => {}} onLancamentos={onLanc} {...extra} />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return Object.assign(onLanc, { rerender: r.rerender });
};

describe('modal de análise', () => {
  it('A1 abre na aba e no nível clicados', async () => {
    await abrir('Custeio');
    expect(rpc).toHaveBeenCalledWith('fn_vg_analise', expect.objectContaining({ p_lado: 'saida', p_aba: 'Custeio', p_foco: ['Custeio'], p_grafico: null, p_mes: '2026-09',
      p_criterio: 'mes', p_unidade: 'rs', p_status: ['previsto'], p_incluir_vencidos: true }));
    expect(screen.getByTestId('analise-aba-Custeio').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('analise-aba-raiz').getAttribute('aria-pressed')).toBe('false');
    /* o período do cabeçalho é o da tela (jan–dez), não a janela do critério */
    expect(screen.getByTestId('analise-contexto').textContent).toBe('jan/26 – dez/26 · Caixa + cartões');
  });

  it('A2 os números são os do banco; sem meta → —', async () => {
    await abrir();
    expect(screen.getByTestId('analise-resumo-valor').textContent).toBe('R$ 773.404,73');
    expect(screen.getByTestId('analise-resumo-meta').textContent).toBe('R$ 700.000,00');
    expect(screen.getByTestId('analise-donut-centro').textContent).toBe('61,2%');
    expect(screen.getByTestId('analise-kpi-media').textContent).toBe('R$ 686.702,37');
    expect(screen.getByTestId('analise-kpi-tendencia').textContent).toBe('+28,9%');
    const pec = screen.getByTestId('analise-tabela-linha-0');
    expect(pec.textContent).toContain('R$ 754.685,64');
    expect(within(pec).getAllByText('—').length).toBe(3); /* meta, Dif. R$ e % */
    expect(screen.getByTestId('analise-tabela-linha-1').textContent).toContain('−R$ 1.280,91');
    expect(screen.getByTestId('analise-lanc-0').textContent).toBe('7 lanç. ›');
  });

  it('A3 critério e unidade vão ao banco; a que não vale fica apagada', async () => {
    await abrir();
    fireEvent.click(within(screen.getByTestId('analise-tabela')).getByText('Média'));
    await act(async () => { await Promise.resolve(); });
    expect(ultimo()).toMatchObject({ p_criterio: 'media' });
    fireEvent.click(screen.getByTestId('analise-unidade'));
    expect((screen.getByTestId('analise-unidade-rs_ha_agri') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('analise-unidade-rs_cab'));
    await act(async () => { await Promise.resolve(); });
    expect(ultimo()).toMatchObject({ p_unidade: 'rs_cab', p_criterio: 'media' });
    /* o novo foco não aceita a unidade: volta para R$ */
    resposta = { ...ANALISE, unidades: ANALISE.unidades.map((u) => (u.id === 'rs_cab' ? { ...u, valida: false } : u)) };
    fireEvent.click(screen.getByTestId('analise-aba-raiz'));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(ultimo()).toMatchObject({ p_unidade: 'rs', p_aba: null, p_foco: [] });
  });

  it('A4 navegação', async () => {
    await abrir();
    fireEvent.click(screen.getByTestId('analise-foco-linha-1'));
    await act(async () => { await Promise.resolve(); });
    expect(ultimo()).toMatchObject({ p_grafico: ['Custeio', 'agricultura'] });
    fireEvent.click(screen.getByTestId('analise-proximo'));
    await act(async () => { await Promise.resolve(); });
    /* os irmãos do banco são [Custeio], [Juros]: o item (agricultura) não está entre eles → anda a partir do 1º */
    expect(ultimo().p_grafico).toEqual(['Juros']);
    fireEvent.click(screen.getByTestId('analise-caminho-0'));
    await act(async () => { await Promise.resolve(); });
    expect(ultimo()).toMatchObject({ p_aba: null, p_foco: [], p_grafico: null });
    fireEvent.click(screen.getByTestId('analise-tabela-linha-0'));
    await act(async () => { await Promise.resolve(); });
    expect(ultimo()).toMatchObject({ p_foco: ['Custeio', 'pecuaria'], p_grafico: null });
    fireEvent.click(screen.getByTestId('analise-descer-1'));
    await act(async () => { await Promise.resolve(); });
    expect(ultimo()).toMatchObject({ p_foco: ['Custeio', 'agricultura'] });
  });

  it('A5 "N lanç. ›" abre a gaveta no nó da linha; Esc fecha a gaveta antes do modal', async () => {
    const onFechar = vi.fn();
    const onLanc = await abrir('Custeio', vi.fn(), { onFechar });
    const nAnalise = rpc.mock.calls.filter((c) => c[0] === 'fn_vg_analise').length;
    fireEvent.click(screen.getByTestId('analise-lanc-1'));
    await passar();
    expect(onLanc).toHaveBeenCalledWith(['Custeio', 'agricultura'], expect.objectContaining({ aba: 'Custeio' }));
    expect(daGaveta()[0]).toMatchObject({ p_lado: 'saida', p_caminho: ['Custeio', 'agricultura'], p_mes: '2026-09', p_criterio: 'mes',
      p_contas: null, p_status: ['previsto'], p_incluir_vencidos: true, p_pagina: 1, p_por_pagina: 500 });
    /* o gráfico não trocou (nenhum pedido novo ao modal) */
    expect(rpc.mock.calls.filter((c) => c[0] === 'fn_vg_analise').length).toBe(nAnalise);
    expect(screen.getByTestId('modal-analise').getAttribute('data-gaveta')).toBe('["Custeio","agricultura"]');
    fireEvent.keyDown(screen.getByTestId('modal-analise'), { key: 'Escape' });
    expect(screen.queryByTestId('gaveta')).toBeNull();
    expect(onFechar).not.toHaveBeenCalled();
  });

  it('G1 a gaveta escreve o que o banco mandou; filho desce; o caminho e os irmãos trocam o nó', async () => {
    await abrir();
    fireEvent.click(screen.getByTestId('analise-lanc-1'));
    await passar();
    expect(screen.getByTestId('gaveta-qtd').textContent).toBe('9');
    expect(screen.getByTestId('gaveta-total').textContent).toBe('R$ 18.719,09');
    expect(screen.getByTestId('gaveta-medio').textContent).toBe('R$ 2.079,90');
    expect(screen.getByTestId('gaveta-rodape-total').textContent).toBe('R$ 18.719,09');
    expect(screen.getByTestId('gaveta-resumo').textContent).toContain('80,1%');
    expect(screen.getByTestId('gaveta-contexto').textContent).toBe('set/26 · Caixa + cartões');
    expect(screen.getByTestId('gaveta-linha-0').textContent).toContain('R$ 15.000,00');
    fireEvent.click(screen.getByTestId('gaveta-linha-1'));
    await passar();
    expect(daGaveta().at(-1)).toMatchObject({ p_caminho: ['Custeio', 'agricultura', 'Mão de obra'] });
    fireEvent.click(screen.getByTestId('gaveta-irmao-0'));
    await passar();
    expect(daGaveta().at(-1)).toMatchObject({ p_caminho: ['Custeio', 'pecuaria'] });
    fireEvent.click(screen.getByTestId('gaveta-caminho-1'));
    await passar();
    expect(daGaveta().at(-1)).toMatchObject({ p_caminho: ['Custeio'] });
  });

  it('G2 subcentro: datas dd/mm/aaaa, a parte 2 abre o lançamento, "Mais" pagina, nó vazio com a frase', async () => {
    gaveta = (a) => GAV_FOLHA(a.p_pagina);
    const onAbrir = vi.fn();
    await abrir('Custeio', vi.fn(), { onAbrirLancamento: onAbrir });
    fireEvent.click(screen.getByTestId('analise-lanc-1'));
    await passar();
    fireEvent.click(screen.getByTestId('gaveta-irmao-0'));   /* o subcentro */
    await passar();
    expect(daGaveta().at(-1)).toMatchObject({ p_caminho: SUB });
    expect(screen.getByTestId('gaveta-linha-0').textContent).toContain('10/09/2026');
    expect(screen.getByTestId('gaveta-parte-1').textContent).toBe('parte 2/2 · ');
    fireEvent.click(screen.getByTestId('gaveta-linha-1'));
    expect(onAbrir).toHaveBeenCalledWith('l9', expect.objectContaining({ chave: 'l9#2' }));
    expect(screen.getByTestId('gaveta-mais').textContent).toBe('Mais 1 de 1 ›');
    fireEvent.click(screen.getByTestId('gaveta-mais'));
    await passar();
    expect(daGaveta().at(-1)).toMatchObject({ p_pagina: 2 });
    expect(screen.getByTestId('gaveta-linha-2').textContent).toContain('12/09/2026');
    expect(screen.queryByTestId('gaveta-mais')).toBeNull();
    /* o total é o do banco (o nó inteiro), não a soma das linhas na tela */
    expect(screen.getByTestId('gaveta-rodape-total').textContent).toBe('R$ 98.765,43');
    gaveta = () => ({ ...GAV_FOLHA(), linhas: [], total_linhas: 0, qtd: 0, total: 0, medio: null, paginas: 1 });
    fireEvent.click(screen.getByTestId('gaveta-caminho-3'));
    await passar();
    expect(screen.getByTestId('gaveta-vazio').textContent).toBe('Nenhum lançamento neste item em set/26.');
  });

  it('G3 salvou: a gaveta relê as páginas abertas, sem fechar; "Ver na lista" leva os filtros equivalentes', async () => {
    gaveta = (a) => GAV_FOLHA(a.p_pagina);
    const onVer = vi.fn();
    const m = await abrir('Custeio', vi.fn(), { onVerNaLista: onVer, versao: 0 });
    fireEvent.click(screen.getByTestId('analise-lanc-1'));
    await passar();
    fireEvent.click(screen.getByTestId('gaveta-irmao-0'));
    await passar();
    fireEvent.click(screen.getByTestId('gaveta-mais'));
    await passar();
    const antes = daGaveta().length;
    m.rerender(<ModalAnaliseVG alvo={{ lado: 'saida', grupo: 'Custeio', am: '2026-09' }} ctx={CTX} rotuloContas="Caixa + cartões" onFechar={() => {}}
      onLancamentos={m} onVerNaLista={onVer} versao={1} />);
    await passar();
    expect(daGaveta().slice(antes).map((x) => x.p_pagina).sort()).toEqual([1, 2]);
    expect(screen.getByTestId('gaveta')).toBeTruthy();
    expect(screen.getByTestId('gaveta-linha-2')).toBeTruthy();
    fireEvent.click(screen.getByTestId('gaveta-ver-lista'));
    expect(onVer).toHaveBeenCalledWith(
      { tipo: '2-Saídas', anos: ['2026'], meses: ['09'], status: ['realizado', 'conciliado_real', 'previsto'], fazendaId: null, contaId: null,
        contaDestinoId: null, atividade: 'agricultura', centro: 'Insumos', subcentro: 'Sementes' },
      expect.objectContaining({ gaveta: SUB }));
  });

  /* o banco devolve a folha (irmão 0 = o subcentro) com o `lista` pedido; a FOLHA da tela é o caminho de 4 níveis */
  const comLista = (lista: GavetaVG['lista'], base: () => GavetaVG = () => GAV_FOLHA()) => (a: any) => ({ ...base(), folha: a.p_caminho.length === 4, lista });
  const aoSubcentro = async () => {
    fireEvent.click(screen.getByTestId('analise-lanc-1'));
    await passar();
    expect(screen.getByTestId('gaveta-aviso').textContent).toBe('');   /* nível com filhos: a linha existe, vazia */
    expect(screen.getByTestId('gaveta-aviso').getAttribute('data-avisos')).toBe('0');
    fireEvent.click(screen.getByTestId('gaveta-irmao-0'));
    await passar();
    expect(daGaveta().at(-1)!.p_caminho).toHaveLength(4);
  };
  const aviso = () => screen.getByTestId('gaveta-aviso');

  it('G4 sem diferença: a linha fica vazia (o lugar continua reservado)', async () => {
    gaveta = comLista({ vencidos_fora: 0, transf_internas: 0 });
    await abrir('Custeio');
    await aoSubcentro();
    expect(aviso().textContent).toBe('');
    expect(aviso().getAttribute('data-avisos')).toBe('0');
    expect(screen.getByTestId('gaveta-ver-lista')).toBeTruthy();
  });

  it('G4a vencidos trazidos de antes da janela → "Na lista, os vencidos ficam no mês do vencimento."', async () => {
    gaveta = comLista({ vencidos_fora: 2, transf_internas: 0 });
    await abrir('Custeio');
    await aoSubcentro();
    expect(aviso().textContent).toBe('Na lista, os vencidos ficam no mês do vencimento.');
  });

  it('G4b várias contas → a frase das contas (vários avisos: a primeira na linha, todas no title)', async () => {
    gaveta = comLista({ vencidos_fora: 1, transf_internas: 0 });
    await abrir('Custeio', vi.fn(), { ctx: { ...CTX, contas: ['c1', 'c2'] } });
    await aoSubcentro();
    expect(aviso().textContent).toBe('A lista filtra uma conta por vez: vai abrir com todas as contas.');
    expect(aviso().getAttribute('data-avisos')).toBe('2');
    expect(aviso().getAttribute('title')).toContain('Na lista, os vencidos ficam no mês do vencimento.');
  });

  it('G4c transferências entre as contas escolhidas → a frase delas; "Ver na lista" no tipo 3, sem centro', async () => {
    const TRANSF: (string | null)[] = ['Outras saídas', null, 'Transferências para outras contas', null];
    gaveta = comLista({ vencidos_fora: 0, transf_internas: 6 },
      () => ({ ...GAV_FOLHA(), irmaos: [{ caminho: TRANSF, rotulo: 'Sem subcentro', valor: 10 }] }));
    const onVer = vi.fn();
    await abrir('Custeio', vi.fn(), { onVerNaLista: onVer, ctx: { ...CTX, contas: ['c1'] } });
    await aoSubcentro();
    expect(daGaveta().at(-1)!.p_caminho).toEqual(TRANSF);
    expect(aviso().textContent).toBe('A lista mostra as transferências entre as contas escolhidas; aqui elas se anulam.');
    fireEvent.click(screen.getByTestId('gaveta-ver-lista'));
    expect(onVer.mock.calls[0][0]).toMatchObject({ tipo: '3-Transferências', centro: null, subcentro: null, atividade: null, contaId: 'c1', contaDestinoId: null });
  });

  it('G5 transferência de ENTRADA: "Ver na lista" com a conta em Conta Destino, tipo 3, sem centro', async () => {
    const TRANSF: (string | null)[] = ['Outras entradas', null, 'Transferências de outras contas', null];
    gaveta = (a) => ({ ...comLista({ vencidos_fora: 0, transf_internas: 0 },
      () => ({ ...GAV_FOLHA(), irmaos: [{ caminho: TRANSF, rotulo: 'Sem subcentro', valor: 10 }] }))(a), lado: 'entrada' });
    const onVer = vi.fn();
    await abrir('Custeio', vi.fn(), { onVerNaLista: onVer, ctx: { ...CTX, contas: ['c1'] } });
    await aoSubcentro();
    expect(daGaveta().at(-1)!.p_caminho).toEqual(TRANSF);
    expect(aviso().textContent).toBe('');
    fireEvent.click(screen.getByTestId('gaveta-ver-lista'));
    expect(onVer.mock.calls[0][0]).toMatchObject({ tipo: '3-Transferências', centro: null, subcentro: null, contaId: null, contaDestinoId: 'c1' });
  });

  it('G5b a virada do ano: a 4ª frase com os meses do caso, depois das outras; no mesmo ano, sem frase', async () => {
    const VIRADA = 'A lista filtra por ano e mês: o período nov/25–fev/26 traz também jan–fev/25 e nov–dez/26.';
    gaveta = comLista({ vencidos_fora: 0, transf_internas: 0 },
      () => ({ ...GAV_FOLHA(), criterio: 'acumulado', mes: '2026-02', janela: { de: '2025-11-01', ate: '2026-02-28' } }));
    const r = await abrir('Custeio');
    await aoSubcentro();
    expect(aviso().textContent).toBe(VIRADA);
    expect(aviso().getAttribute('data-avisos')).toBe('1');
    r.rerender(<></>);
    /* com vencidos movidos: a dos vencidos na linha, a da virada no hover */
    gaveta = comLista({ vencidos_fora: 2, transf_internas: 0 },
      () => ({ ...GAV_FOLHA(), criterio: 'acumulado', mes: '2026-02', janela: { de: '2025-11-01', ate: '2026-02-28' } }));
    await abrir('Custeio');
    await aoSubcentro();
    expect(aviso().textContent).toBe('Na lista, os vencidos ficam no mês do vencimento.');
    expect(aviso().getAttribute('title')).toContain(VIRADA);
  });

  it('G5d pagamento da fatura do cartão (111949): a 5ª frase; sozinha na linha, depois das 4 no hover; sem fatura, nada', async () => {
    const FATURA = 'A lista mostra o pagamento da fatura como transferência; aqui não entra (a compra já foi a saída).';
    const TRANSF: (string | null)[] = ['Outras saídas', null, 'Transferências para outras contas', null];
    const noTransf = () => ({ ...GAV_FOLHA(), irmaos: [{ caminho: TRANSF, rotulo: 'Sem subcentro', valor: 10 }] });
    gaveta = comLista({ vencidos_fora: 0, transf_internas: 0, faturas_cartao: 1 }, noTransf);
    const r = await abrir('Custeio', vi.fn(), { ctx: { ...CTX, contas: ['c1'] } });
    await aoSubcentro();
    expect(aviso().textContent).toBe(FATURA);
    expect(aviso().getAttribute('data-avisos')).toBe('1');
    r.rerender(<></>);
    /* com as outras 4: a das contas na linha; no hover todas, a da fatura por último */
    gaveta = comLista({ vencidos_fora: 1, transf_internas: 2, faturas_cartao: 1 },
      () => ({ ...noTransf(), criterio: 'acumulado', mes: '2026-02', janela: { de: '2025-11-01', ate: '2026-02-28' } }));
    const r2 = await abrir('Custeio', vi.fn(), { ctx: { ...CTX, contas: ['c1', 'c2'] } });
    await aoSubcentro();
    expect(aviso().textContent).toBe('A lista filtra uma conta por vez: vai abrir com todas as contas.');
    expect(aviso().getAttribute('data-avisos')).toBe('5');
    const title = aviso().getAttribute('title')!;
    expect(title.endsWith(FATURA)).toBe(true);
    expect(title).toContain('nov/25–fev/26');
    r2.rerender(<></>);
    /* sem fatura: nada */
    gaveta = comLista({ vencidos_fora: 0, transf_internas: 0, faturas_cartao: 0 }, noTransf);
    await abrir('Custeio', vi.fn(), { ctx: { ...CTX, contas: ['c1'] } });
    await aoSubcentro();
    expect(aviso().textContent).toBe('');
    expect(aviso().getAttribute('data-avisos')).toBe('0');
  });

  it('G5c acumulado dentro do mesmo ano: sem a frase da virada (a linha fica vazia)', async () => {
    gaveta = comLista({ vencidos_fora: 0, transf_internas: 0 },
      () => ({ ...GAV_FOLHA(), criterio: 'acumulado', janela: { de: '2026-01-01', ate: '2026-09-30' } }));
    await abrir('Custeio');
    await aoSubcentro();
    expect(aviso().textContent).toBe('');
    expect(aviso().getAttribute('data-avisos')).toBe('0');
  });
});
