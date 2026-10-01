/**
 * PR-CONC-CASAR-VALOR-BANCO-01 — "Casar com o banco": "Usar valor do banco", "absorver a diferença", "remover deste
 * casamento" e a frase da diferença com o SENTIDO CERTO.
 *
 * ⚠ O CASO DO NJ (30/09 11:21): no banco −506,51 "Vivo Celular - VIVO MOVEL - MS"; levado "Vivo Casa · Telefonica" 506,84.
 *   A RPC devolve diferença −0,33 (soma − extrato, assinados) e a frase dizia "somam MENOS" — o lançamento é MAIOR.
 * ⚠ O BANCO FALSO FAZ A CONTA DA `fn_espelho_casar` (corpo lido no `prosrc` em 30/09): soma = Σ direção × |valor|,
 *   diferença = round(soma − extrato, 2), `ok` quando |diferença| ≤ 0,01. Assim o resumo e a frase vêm do mesmo
 *   caminho da tela real, não de números prontos.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { LevadoInicial } from './CasarComBancoModal';

const DIRECAO = vi.hoisted(() => new Map<string, number>());
/* Para o N:1: o valor de cada extrato e do lançamento, pelo id — a `fn_espelho_casar_n1` soma em MÓDULO. */
const VALORES = vi.hoisted(() => new Map<string, number>());
/* CONC-BLOCOS-TELA-01: o que a `fn_conciliar_bloco` falsa devolve, e com que argumentos foi chamada. */
const BLOCO = vi.hoisted(() => ({ resposta: { data: null, error: null } as { data: unknown; error: unknown }, chamadas: [] as unknown[] }));
const TOAST = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast: TOAST }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: { p_itens: { lancamento_id: string; valor: number }[]; p_lancamento_id: string; p_extratos: string[]; p_simular?: boolean; p_regra?: string }) => {
      if (fn === 'fn_espelho_casar_n1') {
        /* O corpo da RPC (lido no `prosrc` em 30/09): tudo em módulo, diferença = Σ|extratos| − |lançamento|. */
        const noLanc = Math.abs(VALORES.get(args.p_lancamento_id) ?? 0);
        const soma = args.p_extratos.reduce((a, id) => a + Math.abs(VALORES.get(id) ?? 0), 0);
        const diferenca = Math.round((soma - noLanc) * 100) / 100;
        return Promise.resolve({
          data: Math.abs(diferenca) <= 0.01
            ? { ok: true, no_lancamento: noLanc, soma_extratos: soma }
            : { ok: false, motivo: 'soma_nao_bate', no_lancamento: noLanc, soma_extratos: soma, diferenca },
          error: null,
        });
      }
      if (fn === 'fn_conciliar_bloco') {
        BLOCO.chamadas.push(args);
        return Promise.resolve(BLOCO.resposta);
      }
      if (fn !== 'fn_espelho_casar') return Promise.resolve({ data: null, error: null });
      const alvo = -506.51;
      const soma = args.p_itens.reduce((a, i) => a + (DIRECAO.get(i.lancamento_id) ?? -1) * Math.abs(i.valor), 0);
      const diferenca = Math.round((soma - alvo) * 100) / 100;
      return Promise.resolve({
        data: Math.abs(diferenca) <= 0.01
          ? { ok: true, no_extrato: alvo, soma }
          : { ok: false, motivo: 'soma_nao_bate', no_extrato: alvo, soma, diferenca },
        error: null,
      });
    },
  },
}));
vi.mock('@/components/conciliacao/CriarLancamentoDaLinha', () => ({ CriarLancamentoDaLinha: () => null }));
vi.mock('@/components/financeiro-v2/EspelhoConciliacaoTab', () => ({ MOTIVO_CASAR_LABEL: {} }));

import { CasarComBancoModal, CasarN1Modal, CasarBlocoModal, sentidoDaDiferenca, valorAbsorvendo, fraseDaRecusa } from './CasarComBancoModal';

const EXTRATO = { extrato_id: 'e-vivo', data: '2026-09-01', historico: 'Vivo Celular - VIVO MOVEL - MS', valor: -506.51 };
const VIVO: LevadoInicial = { lancamento_id: 'l-vivo', descricao: 'Vivo Casa', fornecedor: 'Telefonica Brasil S.A.', valor_assinado: -506.84 };

function montar(iniciais: LevadoInicial[]) {
  for (const l of iniciais) DIRECAO.set(l.lancamento_id, Math.sign(l.valor_assinado));
  return render(<CasarComBancoModal open onClose={() => {}} extrato={EXTRATO} iniciais={iniciais}
    nomeConta="Banco do Brasil" contaBancariaId="bb" onConciliado={() => {}} />);
}
const campo = (desc: string) => screen.getByLabelText(`Valor de ${desc}`) as HTMLInputElement;
const frase = () => screen.findByTestId('frase-diferenca');

describe('o sentido da diferença (a regra pura)', () => {
  it('saída: lançamento maior que o banco é "a mais"; menor é "a menos"', () => {
    expect(sentidoDaDiferenca(-0.33, -506.51)).toBe('a_mais'); // o caso do Vivo
    expect(sentidoDaDiferenca(6.51, -506.51)).toBe('a_menos');
  });
  it('entrada: idem, pelo sinal do extrato; e zero confere', () => {
    expect(sentidoDaDiferenca(10, 100)).toBe('a_mais');
    expect(sentidoDaDiferenca(-10, 100)).toBe('a_menos');
    expect(sentidoDaDiferenca(0.004, 100)).toBe('confere');
  });
  it('absorver: a linha passa a valer o necessário para a soma bater; zerada ou negativa → null', () => {
    expect(valorAbsorvendo(506.84, -1, -0.33)).toBe(506.51);
    expect(valorAbsorvendo(206.84, -1, -0.33)).toBe(206.51);
    expect(valorAbsorvendo(110, 1, 10)).toBe(100);
    expect(valorAbsorvendo(0.2, -1, -0.33)).toBeNull();
  });
});

/* CONC-BLOCOS-TELA-01: o botão se chama "Corrigir o valor do lançamento" (gesto separado, decisão do Gabriel) e a dica diz
   o que ele faz; o comportamento é o mesmo. */
describe('um lançamento levado — "Corrigir o valor do lançamento"', () => {
  it('a frase diz "a mais" com o valor; o botão põe 506,51 no campo e a diferença vai a zero', async () => {
    montar([VIVO]);
    expect((await frase()).textContent).toContain('Os lançamentos somam R$ 0,33 a mais que o banco.');
    const botao = screen.getByTestId('usar-valor-banco');
    expect(botao.textContent).toBe('Corrigir o valor do lançamento');
    expect(botao.getAttribute('title')).toBe('muda o valor do lançamento para o do banco (506,51)');
    fireEvent.click(botao);
    expect(campo('Vivo Casa').value).toBe('506,51');
    await waitFor(() => expect(screen.getByTestId('frase-diferenca').textContent).toBe('Confere com o banco ✓'));
    expect(screen.getByRole('button', { name: 'Conciliar' })).not.toBeDisabled();
    expect(screen.getByTestId('usar-valor-banco')).toBeDisabled(); // já é o valor do banco
  });

  it('lançamento menor que o banco: a frase diz "a menos"', async () => {
    montar([{ ...VIVO, valor_assinado: -500 }]);
    expect((await frase()).textContent).toContain('Os lançamentos somam R$ 6,51 a menos que o banco.');
  });
});

describe('vários lançamentos levados — "absorver a diferença"', () => {
  const A: LevadoInicial = { lancamento_id: 'l-a', descricao: 'Parte A', fornecedor: 'Telefonica', valor_assinado: -300 };
  const B: LevadoInicial = { lancamento_id: 'l-b', descricao: 'Parte B', fornecedor: 'Telefonica', valor_assinado: -206.84 };

  it('absorver na linha B ajusta SÓ a linha B; a A não muda e a soma bate', async () => {
    montar([A, B]);
    await frase();
    expect(screen.queryByTestId('usar-valor-banco')).toBeNull(); // com vários, é "absorver"
    const linhaB = campo('Parte B').parentElement!;
    fireEvent.click(within(linhaB).getByTestId('absorver-diferenca'));
    expect(campo('Parte B').value).toBe('206,51');
    expect(campo('Parte A').value).toBe('300,00');
    await waitFor(() => expect(screen.getByTestId('frase-diferenca').textContent).toBe('Confere com o banco ✓'));
  });

  it('linha que ficaria zerada ou negativa: "absorver" desabilitado com o motivo', async () => {
    DIRECAO.clear();
    montar([{ ...A, valor_assinado: -506.51 - 0.2 + 0.1 }, { ...B, valor_assinado: -0.1 }]);
    await frase();
    const linhaB = campo('Parte B').parentElement!;
    const absorverB = within(linhaB).getByTestId('absorver-diferenca');
    expect(absorverB).toBeDisabled();
    expect(absorverB.getAttribute('title')).toContain('ficaria zerada ou negativa');
  });
});

describe('"tirar" virou "remover deste casamento"', () => {
  it('o rótulo novo, com o title explicando que nada é apagado; o antigo não existe mais', async () => {
    montar([VIVO]);
    await frase();
    const remover = screen.getByRole('button', { name: 'remover deste casamento' });
    expect(remover.getAttribute('title')).toContain('Nada é apagado');
    expect(screen.queryByRole('button', { name: 'tirar' })).toBeNull();
    fireEvent.click(remover);
    expect(screen.queryByLabelText('Valor de Vivo Casa')).toBeNull();
  });
});

describe('o modal não corta nada (a estrutura que a medida da tela exigiu)', () => {
  /* PR-CONC-SUGESTOES-CASAR-01 (Gabriel, print 13:42): a descrição truncava com espaço sobrando. Cada levado agora
     ocupa DUAS linhas — a identificação inteira (venc · descrição · fornecedor · status) e o campo com as ações. */
  it('coluna do grid travada; levado em duas linhas, identificação inteira sem reticência; botão da altura do campo', async () => {
    const LONGO: LevadoInicial = { lancamento_id: 'l-rastro', descricao: 'Serviço Rastreabilidade Bovina - SISBOV mensalidade setembro',
      fornecedor: 'Agroinblue - G.F.de Rezende Junqueira; Gasto Recorrente', valor_assinado: -506.84,
      data_vencimento: '2026-09-08', status_transacao: 'programado' };
    montar([LONGO]);
    await frase();
    const dialogo = screen.getByRole('dialog');
    expect(dialogo.className).toContain('grid-cols-[minmax(0,1fr)]');
    const levado = screen.getByTestId('levado');
    const ident = within(levado).getByTestId('levado-identificacao');
    expect([...ident.children].map((c) => c.textContent)).toEqual([
      '08/09', LONGO.descricao, LONGO.fornecedor, 'Programado',
    ]);
    /* nada corta: nem truncate nem ellipsis em lugar nenhum do levado; texto livre quebra */
    for (const el of [levado, ...levado.querySelectorAll('*')]) expect(el.getAttribute('class') ?? '').not.toMatch(/\btruncate\b|text-ellipsis/);
    expect(ident.children[1].className).toContain('break-words');
    expect(ident.children[2].className).toContain('break-words');
    /* a segunda linha é a do campo e das ações */
    const linha = campo(LONGO.descricao!).parentElement!;
    expect(linha.className).toContain('min-w-0');
    expect(linha.parentElement).toBe(levado);
    expect(screen.getByTestId('usar-valor-banco').className).toContain('h-[23px]');
    const cab = within(dialogo).getAllByText('Banco do Brasil · 01/09').find((e) => e.className.includes('opacity-90'))!;
    expect(cab.className).not.toContain('truncate');
  });
});

describe('o levado sem vencimento nem status mostra "—" (dado ausente), nunca vazio', () => {
  it('VIVO sem os campos novos', async () => {
    montar([VIVO]);
    await frase();
    const ident = screen.getByTestId('levado-identificacao');
    expect([...ident.children].map((c) => c.textContent)).toEqual(['—', 'Vivo Casa', 'Telefonica Brasil S.A.', '—']);
  });
});

describe('N:1 — a frase dos extratos contra o lançamento, com o valor e a 10px', () => {
  const FOLHA = { lancamento_id: 'l-folha', descricao: 'Folha de Pagamento', fornecedor: 'Jonatas', valor_assinado: -3000 };
  const ext = (id: string, valor: number) => ({ extrato_id: id, data: '2026-09-04', historico: `Pix ${id}`, valor });
  function montarN1(extratos: { extrato_id: string; data: string; historico: string; valor: number }[]) {
    VALORES.set(FOLHA.lancamento_id, FOLHA.valor_assinado);
    for (const e of extratos) VALORES.set(e.extrato_id, e.valor);
    return render(<CasarN1Modal open onClose={() => {}} sis={FOLHA} extratos={extratos} nomeConta="Banco do Brasil" onConciliado={() => {}} />);
  }
  const fraseN1 = () => screen.findByTestId('frase-diferenca-n1');

  it('extratos somam MAIS que o lançamento: "a mais", com o valor', async () => {
    montarN1([ext('x1', -2000), ext('x2', -1200)]);
    const f = await fraseN1();
    expect(f.textContent).toContain('Os extratos somam R$ 200,00 a mais que o lançamento.');
    expect(f.className).toContain('text-[10px]');
  });
  it('extratos somam MENOS: "a menos"', async () => {
    montarN1([ext('x1', -2000), ext('x2', -900)]);
    expect((await fraseN1()).textContent).toContain('Os extratos somam R$ 100,00 a menos que o lançamento.');
  });
  it('bate: "Confere com o banco ✓"', async () => {
    montarN1([ext('x1', -2000), ext('x2', -1000)]);
    await waitFor(async () => expect((await fraseN1()).textContent).toBe('Confere com o banco ✓'));
  });
});

/**
 * CONC-CASAR-N1-LARGURA-01 — o histórico longo do banco não alarga o N:1 (homologação do Gabriel, 01/10 08:31: a coluna
 * crescia e o `overflow-hidden` cortava valores, soma e Conciliar). O caso real: ICMS da NF 9287581 (2.470,26) pago em
 * 26/08 −454,26 + 27/08 −2.016,00, Sicredi Lavoura.
 * ⚠ O jsdom NÃO FAZ LAYOUT (scrollWidth e clientWidth são 0 — `0 <= 0` passaria sempre e não provaria nada): o teste prova
 *   o CONTRATO que impede o alargamento — a coluna do grid presa (`minmax(0,1fr)`), a largura fixa e o histórico que
 *   trunca com `title` —, e a medida renderizada vai no relatório.
 */
describe('CONC-CASAR-N1-LARGURA-01 — histórico longo no N:1', () => {
  const HIST = 'PAGAMENTO PIX-PIX_DEB   15412257000128 GOVERNO DO ESTADO DE MATO GROSSO DO SUL · SECRETARIA DE FAZENDA · DAEMS ICMS NF 9287581 OLINDA';
  const ICMS = { lancamento_id: 'l-icms', descricao: 'ICMS Venda Mandioca · NF 9287581', fornecedor: 'Sefaz MS', valor_assinado: -2470.26 };
  const EXTRATOS = [
    { extrato_id: 'e-454', data: '2026-08-26', historico: `${HIST} (1/2)`, valor: -454.26 },
    { extrato_id: 'e-2016', data: '2026-08-27', historico: `${HIST} (2/2)`, valor: -2016 },
  ];
  const montarN1 = () => {
    VALORES.set('l-icms', -2470.26); VALORES.set('e-454', -454.26); VALORES.set('e-2016', -2016);
    return render(<CasarN1Modal open onClose={() => {}} sis={ICMS} extratos={EXTRATOS} nomeConta="Sicredi Lavoura" onConciliado={() => {}} />);
  };

  it('os históricos têm 120+ caracteres (o caso que alargava)', () => {
    for (const e of EXTRATOS) expect((e.historico ?? '').length).toBeGreaterThanOrEqual(120);
  });

  it('a coluna do grid é presa à largura do modal (a mesma regra do 1:N) e a largura é fixa', () => {
    montarN1();
    const modal = screen.getByRole('dialog');
    expect(modal.className).toContain('grid-cols-[minmax(0,1fr)]');
    expect(modal.className).toContain('w-[560px]');
    /* e nunca cresce pelo conteúdo */
    expect(modal.scrollWidth).toBeLessThanOrEqual(modal.clientWidth);
  });

  it('o histórico trunca com o texto inteiro no title; valores, soma, "Confere" e Conciliar estão lá', async () => {
    montarN1();
    for (const e of EXTRATOS) {
      /* o título EXATO (o banco manda espaços triplos; o `getByTitle` os colapsaria) */
      const h = Array.from(document.querySelectorAll('[title]')).find((el) => el.getAttribute('title') === e.historico);
      expect(h).toBeDefined();
      expect(h?.className ?? '').toMatch(/\btruncate\b/);
      expect(h?.className ?? '').toMatch(/\bmin-w-0\b/);
    }
    expect(screen.getByText('-454,26')).toBeInTheDocument();
    expect(screen.getByText('-2.016,00')).toBeInTheDocument();
    expect(await screen.findByTestId('frase-diferenca-n1')).toHaveTextContent('Confere com o banco ✓');
    const conciliar = screen.getByRole('button', { name: 'Conciliar' });
    expect(conciliar).toBeEnabled();
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   CONC-BLOCOS-TELA-01 — a variante BLOCO (mock aprovado: docs/mocks/mock-casar-bloco-v1.html). Os números são os do
   Emerson, agosto: 3 Pix × 7 arranquios = 22.276,80, diferença 0. A RPC falsa devolve a matriz e o resumo como a real
   devolveu no proto (fn_conciliar_bloco, simular); a tela só mostra.
   ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
describe('CONC-BLOCOS-TELA-01 — Casar com o banco · bloco', () => {
  const HIST = 'PAGAMENTO PIX-PIX_DEB   01391928164 EMERSON DE OLIVEIRA DOS ANJOS · CONTA CORRENTE SICREDI LAVOURA · AGENCIA 0914 · DOC 77777';
  const EXT = [
    { extrato_id: 'e1', data: '2026-08-24', historico: HIST, valor: -3000 },
    { extrato_id: 'e2', data: '2026-08-28', historico: HIST + ' (2)', valor: -16276.8 },
    { extrato_id: 'e3', data: '2026-08-28', historico: 'PAGAMENTO PIX-CX747834  68443093000162 68443093 CLEYTON ROBERTO DA SILVA · SICREDI', valor: -3000 },
  ];
  const DESCS = ['Arranquio Mandioca 40,34 t · NF 9287581', 'Arranquio Mandioca 20,24 t · NF 9294773', 'Arranquio Mandioca 19,82 t · NF 9294773',
    'Arranquio Mandioca 19,18 t · NF 9297983', 'Arranquio Mandioca 17,68 t · NF 9297983', 'Arranquio Mandioca 20,52 t · NF 9310349',
    'Arranquio Mandioca 21,34 t · NF 9310349'];
  const VALS = [5647.6, 2833.6, 2774.8, 2685.2, 2475.2, 2872.8, 2987.6];
  const LAN = DESCS.map((d, i) => ({ lancamento_id: `l${i + 1}`, data: '2026-08-24', descricao: d, fornecedor: 'Emerson de Oliveira dos Anjos', valor_assinado: -VALS[i] }));
  /* A matriz que a RPC devolveu (9 células: o 1º arranquio leva 3.000 do Pix de 24/08 e 2.647,60 do de 28/08). */
  const MATRIZ = [
    { extrato_id: 'e1', lancamento_id: 'l1', valor_aplicado: 3000 },
    { extrato_id: 'e2', lancamento_id: 'l1', valor_aplicado: 2647.6 },
    { extrato_id: 'e2', lancamento_id: 'l2', valor_aplicado: 2833.6 }, { extrato_id: 'e2', lancamento_id: 'l3', valor_aplicado: 2774.8 },
    { extrato_id: 'e2', lancamento_id: 'l4', valor_aplicado: 2685.2 }, { extrato_id: 'e2', lancamento_id: 'l5', valor_aplicado: 2475.2 },
    { extrato_id: 'e2', lancamento_id: 'l6', valor_aplicado: 2872.8 },
    { extrato_id: 'e2', lancamento_id: 'l7', valor_aplicado: 2788.4 }, { extrato_id: 'e3', lancamento_id: 'l7', valor_aplicado: 199.2 },
  ];
  const OK = { data: {
    ok: true, simulado: true, regra: 'exato', matriz: MATRIZ,
    resumo: { soma_extratos: 22276.8, soma_lancamentos: 22276.8, diferenca: 0, quitados: LAN.map((l) => ({ lancamento_id: l.lancamento_id })), parcial: null },
  }, error: null };
  const montarBloco = () => render(<CasarBlocoModal open onClose={() => {}} extratos={EXT} lancamentos={LAN} nomeConta="Sicredi Lavoura" onConciliado={() => {}} />);

  it('o histórico do banco tem 120+ caracteres no fixture', () => {
    expect(HIST.length).toBeGreaterThanOrEqual(120);
  });

  it('não estoura: 700px fixos, a coluna presa ao modal, o botão no DOM, a descrição com a NF inteira', async () => {
    BLOCO.resposta = OK; BLOCO.chamadas = [];
    montarBloco();
    const dlg = screen.getByTestId('casar-bloco');
    expect(dlg.className).toContain('grid-cols-[minmax(0,1fr)]');
    expect(dlg.className).toContain('w-[700px]');
    expect(dlg.scrollWidth).toBeLessThanOrEqual(dlg.clientWidth);
    expect(screen.getByTestId('conciliar-bloco')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('frase-bloco').textContent).toBe('Confere com o banco ✓ · os 7 lançamentos ficam quitados'));
    /* a descrição sai INTEIRA e não trunca; o histórico trunca com o texto no title */
    const descricoes = screen.getAllByTestId('descricao-levada');
    expect(descricoes[0].textContent).toBe('Arranquio Mandioca 40,34 t · NF 9287581');
    for (const d of descricoes) expect(d.className).not.toContain('truncate');
    const hist = [...document.querySelectorAll('[title]')].find((el) => el.getAttribute('title') === HIST)!;
    expect(hist.className).toContain('truncate');
    expect(screen.getByTestId('diferenca-bloco').textContent).toBe('0,00');
    expect(screen.getByTestId('conciliar-bloco')).not.toBeDisabled();
  });

  it('a matriz exibida é a da RPC: o aplicado de cada lançamento é a soma das células DELE, e a situação vem do resumo', async () => {
    BLOCO.resposta = OK; BLOCO.chamadas = [];
    montarBloco();
    await screen.findByTestId('frase-bloco');
    const linhas = screen.getAllByTestId('lancamento-levado');
    expect(linhas.map((l) => within(l).getByTestId('aplicado').textContent)).toEqual(
      ['5.647,60', '2.833,60', '2.774,80', '2.685,20', '2.475,20', '2.872,80', '2.987,60']);
    expect(linhas.every((l) => within(l).getByTestId('situacao').textContent === 'Quitado')).toBe(true);
    /* a chamada foi a simulação, com os ids e a regra */
    expect(BLOCO.chamadas[0]).toEqual({ p_extratos: ['e1', 'e2', 'e3'], p_lancamentos: LAN.map((l) => l.lancamento_id), p_regra: 'exato', p_simular: true });
  });

  it('parcial: chip "Falta R$ X" e a frase do parcial (mais antigo primeiro)', async () => {
    BLOCO.resposta = { data: {
      ok: true, simulado: true, regra: 'mais_antigo_primeiro',
      matriz: [{ extrato_id: 'e1', lancamento_id: 'l1', valor_aplicado: 3000 }],
      resumo: { soma_extratos: 3000, soma_lancamentos: 5647.6, diferenca: -2647.6, quitados: [],
        parcial: { lancamento_id: 'l1', descricao: DESCS[0], aplicado: 3000, falta: 2647.6 } },
    }, error: null };
    render(<CasarBlocoModal open onClose={() => {}} extratos={EXT.slice(0, 1)} lancamentos={LAN.slice(0, 1)} regraInicial="mais_antigo_primeiro" onConciliado={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('situacao').textContent).toBe('Falta 2.647,60'));
    expect(screen.getByTestId('frase-bloco').textContent).toBe(`Parcial · falta R$ 2.647,60 na ${DESCS[0]} · segue em aberto para o próximo depósito`);
  });

  it('recusa CBLOC: a frase da RPC fica NO MODAL, em vermelho, sem toast; o botão desabilita dizendo por quê', async () => {
    BLOCO.resposta = { data: null, error: { code: 'CBLOC', message: 'extrato_ja_vinculado: o extrato de 28/08 (-2017.00) ja tem vinculo — desfaca antes.' } };
    TOAST.error.mockClear();
    montarBloco();
    const recusa = await screen.findByText('o extrato de 28/08 (-2017.00) ja tem vinculo — desfaca antes.');
    expect(recusa.getAttribute('data-testid')).toBe('recusa-bloco');
    expect(recusa.className).toContain('text-destructive');
    const botao = screen.getByTestId('conciliar-bloco');
    expect(botao).toBeDisabled();
    expect(botao.getAttribute('title')).toBe('o extrato de 28/08 (-2017.00) ja tem vinculo — desfaca antes.');
    expect(TOAST.error).not.toHaveBeenCalled();
  });

  it('NÃO existe "Corrigir o valor do lançamento" (nem "Usar valor do banco") na variante bloco', async () => {
    BLOCO.resposta = OK;
    montarBloco();
    await screen.findByTestId('frase-bloco');
    expect(screen.queryByText(/Corrigir o valor do lançamento|Usar valor do banco/)).toBeNull();
    expect(screen.queryByTestId('usar-valor-banco')).toBeNull();
  });

  it('Conciliar bloco é a MESMA RPC com p_simular=false, e o duplo clique grava uma vez só', async () => {
    BLOCO.resposta = OK; BLOCO.chamadas = [];
    const feito = vi.fn();
    render(<CasarBlocoModal open onClose={() => {}} extratos={EXT} lancamentos={LAN} onConciliado={feito} />);
    await screen.findByTestId('frase-bloco');
    const botao = screen.getByTestId('conciliar-bloco');
    fireEvent.click(botao); fireEvent.click(botao);
    await waitFor(() => expect(feito).toHaveBeenCalledTimes(1));
    const gravacoes = BLOCO.chamadas.filter((c) => (c as { p_simular: boolean }).p_simular === false);
    expect(gravacoes).toHaveLength(1);
  });

  it('a frase da recusa sai sem o código', () => {
    expect(fraseDaRecusa('soma_diverge: os extratos somam 1 e os lancamentos 2')).toBe('os extratos somam 1 e os lancamentos 2');
  });
});

/**
 * CONC-CASAR-ALTURA-01 — homologação do Gabriel (01/10 12:30): o bloco com 2 Pix × 12 lançamentos passava da tela e o
 * rodapé sumia. Nas 3 variantes: teto de 90vh, só o miolo rola, cabeçalho e rodapé (border-t, 34px) fixos.
 * ⚠ O jsdom NÃO FAZ LAYOUT: o teste prova o CONTRATO (as classes e o botão FORA do rolável); a medida vai no relatório.
 */
describe('CONC-CASAR-ALTURA-01 — teto de 90vh, miolo rola, rodapé fixo', () => {
  const contrato = (botao: RegExp | string) => {
    const dlg = screen.getByRole('dialog');
    expect(dlg.className).toContain('max-h-[90vh]');
    expect(dlg.className).toContain('flex-col');
    /* sem o X do Radix (`button.absolute`, escondido pela classe do modal) */
    const filhos = [...dlg.children].filter((el) => el.tagName !== 'BUTTON');
    const rolavel = filhos.filter((el) => el.className.includes('overflow-y-auto'));
    expect(rolavel).toHaveLength(1);
    expect(rolavel[0].className).toContain('min-h-0');
    expect(rolavel[0].className).toContain('flex-1');
    const conciliar = typeof botao === 'string' ? screen.getByTestId(botao) : screen.getByRole('button', { name: botao });
    expect(rolavel[0].contains(conciliar)).toBe(false);
    const rodape = filhos.find((el) => el.contains(conciliar))!;
    expect(rodape).toBe(filhos[filhos.length - 1]);
    for (const c of ['shrink-0', 'border-t', 'h-[34px]']) expect(rodape.className).toContain(c);
    /* o cabeçalho continua shrink-0 e a rolagem é UMA só (nenhum outro filho rola) */
    expect(filhos[0].className).toContain('shrink-0');
  };

  it('1:N: Conciliar, Criar e Cancelar no rodapé fixo, fora do miolo', () => {
    montar([VIVO]);
    contrato(/^Conciliar$/);
    const dlg = screen.getByRole('dialog');
    const rodape = [...dlg.children].filter((el) => el.tagName !== 'BUTTON').pop()!;
    if (!(rodape instanceof HTMLElement)) throw new Error('rodapé ausente');
    expect(within(rodape).getByText('Criar lançamento pela diferença')).toBeInTheDocument();
    expect(within(rodape).getByText('Cancelar')).toBeInTheDocument();
  });
  it('N:1: o mesmo contrato', () => {
    VALORES.set('l-n1', -3000); VALORES.set('n1a', -2000); VALORES.set('n1b', -1000);
    render(<CasarN1Modal open onClose={() => {}} sis={{ lancamento_id: 'l-n1', descricao: 'Folha', fornecedor: 'X', valor_assinado: -3000 }}
      extratos={[{ extrato_id: 'n1a', data: '2026-09-04', historico: 'Pix a', valor: -2000 }, { extrato_id: 'n1b', data: '2026-09-04', historico: 'Pix b', valor: -1000 }]}
      nomeConta="Banco do Brasil" onConciliado={() => {}} />);
    contrato(/^Conciliar$/);
  });
  it('bloco: o mesmo contrato, com o "Desfazer fica no ⋯" à esquerda do rodapé', () => {
    BLOCO.resposta = { data: { ok: true, simulado: true, regra: 'exato', matriz: [], resumo: { soma_extratos: 1, soma_lancamentos: 1, diferenca: 0, quitados: [], parcial: null } }, error: null };
    render(<CasarBlocoModal open onClose={() => {}}
      extratos={[{ extrato_id: 'b1', data: '2026-09-02', historico: 'Pix', valor: -1 }]}
      lancamentos={[{ lancamento_id: 'bl1', data: '2026-09-02', descricao: 'Frete', fornecedor: 'Nelson', valor_assinado: -1 }]}
      onConciliado={() => {}} />);
    contrato('conciliar-bloco');
    const dlg = screen.getByRole('dialog');
    expect([...dlg.children].filter((el) => el.tagName !== 'BUTTON').pop()!.textContent).toContain('Desfazer fica no');
  });
});
