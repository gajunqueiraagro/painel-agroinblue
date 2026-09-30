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
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: { p_itens: { lancamento_id: string; valor: number }[]; p_lancamento_id: string; p_extratos: string[] }) => {
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

import { CasarComBancoModal, CasarN1Modal, sentidoDaDiferenca, valorAbsorvendo } from './CasarComBancoModal';

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

describe('um lançamento levado — "Usar valor do banco"', () => {
  it('a frase diz "a mais" com o valor; o botão põe 506,51 no campo e a diferença vai a zero', async () => {
    montar([VIVO]);
    expect((await frase()).textContent).toContain('Os lançamentos somam R$ 0,33 a mais que o banco.');
    const botao = screen.getByTestId('usar-valor-banco');
    expect(botao.textContent).toBe('Usar valor do banco (506,51)');
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
  it('coluna do grid travada, descrição que trunca com title, botão da altura do campo, cabeçalho sem reticência', async () => {
    montar([VIVO]);
    await frase();
    const dialogo = screen.getByRole('dialog');
    expect(dialogo.className).toContain('grid-cols-[minmax(0,1fr)]');
    const linha = campo('Vivo Casa').parentElement!;
    expect(linha.className).toContain('min-w-0');
    expect(linha.firstElementChild!.getAttribute('title')).toBe('Vivo Casa · Telefonica Brasil S.A.');
    expect(screen.getByTestId('usar-valor-banco').className).toContain('h-[23px]');
    const cab = within(dialogo).getAllByText('Banco do Brasil · 01/09').find((e) => e.className.includes('opacity-90'))!;
    expect(cab.className).not.toContain('truncate');
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
