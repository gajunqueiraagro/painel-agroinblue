/**
 * OC-RECEB-PARCIAL-01 — o titulo de OC recebido por MENOS que o valor, depois de dividido pelo banco (Receb. 1/2 realizado e
 * conciliado + Receb. 2/2 programado). O caso real: Santa Rita, venda 50 Desmama F, R$ 150.000 entregue, R$ 100.000 recebidos em
 * 04/09. A regra mora no banco (`_fn_conc_baixa_no_vinculo`); aqui se trava o que a TELA diz:
 *   T1 a OC mostra as duas partes como linhas proprias ("Receb. 1/2" e "Receb. 2/2") e a faixa diz o que falta de verdade
 *   T2 o "⋯": conciliado trava os tres gestos com UM motivo (com o proximo passo); o 2/2 em aberto deixa cancelar
 *   T3 "Buscar recebimento no Financeiro": os do proprio comprador primeiro, "Outro favorecido" depois, separados; nome numa linha
 *   T4 a Conferencia: a linha do sistema diz a parcela ("· Receb. 1/2"), a falta tem frase propria — e a tela usa as duas
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { AbaContaCorrenteOC, acoesDaLinha } from './AbaContaCorrenteOC';
import { barraDaDiferenca, lerContaCorrente, type ContaCorrente } from '@/lib/oc/contaCorrente';
import { descricaoComParcela, fraseDaFalta } from '@/lib/conciliacao/mesaDoDia';
import type { OcContaCorrenteApi, RecebimentoVinculavel } from '@/hooks/useOcContaCorrente';

/** O que `oc_conta_corrente` devolve para a OC 64c0e240 depois do conserto (21/10/2026), sem nomes. */
function walter(): ContaCorrente {
  const r = lerContaCorrente({
    modelo: 'conta_corrente', versao: 9, valor_acordado: 150000, entregue: 150000, cab_entregue: 50, recebido: 100000, programado: 50000,
    devolvido: 0, saldo: -50000, explicado: 0, saldo_a_explicar: -50000, falta_explicar: -50000, situacao: 'falta_receber',
    a_entregar: 0, ultima_entrega: '2026-09-03', recebimentos_sem_conta_bancaria: 0, saidas_sem_entrega: 0,
    linhas: [
      { tipo: 'entrega', data: '2026-09-03', parte_id: 'e1', lote_ordem: 1, cab: 50, categoria: 'desmama_f', conta_ordem: 1110,
        conta: 'Venda de Desmama Fêmeas', mov_entrega: -150000, status: 'sem_caixa', no_saldo: true, saldo: -150000 },
      { tipo: 'recebimento', data: '2026-09-04', parte_id: 'r1', lancamento_id: 'l1', conta_ordem: 1110, conta: 'Venda de Desmama Fêmeas',
        banco: 'Banco do Brasil', descricao: 'Venda 050 Desmama F · Recebimento', mov_recebido: 100000, status: 'conciliado', no_saldo: true, saldo: -50000 },
      { tipo: 'recebimento', data: '2026-09-04', parte_id: 'r2', lancamento_id: 'l2', conta_ordem: 1110, conta: 'Venda de Desmama Fêmeas',
        banco: 'Banco do Brasil', descricao: 'Venda 050 Desmama F · Recebimento', mov_recebido: 50000, status: 'programado', no_saldo: false, saldo: -50000 },
    ],
    explicacoes: [],
  });
  if (!r) throw new Error('fixture');
  return r;
}

function api(c: ContaCorrente, itens: RecebimentoVinculavel[] = []): OcContaCorrenteApi {
  return {
    contaCorrente: c, loading: false, erro: null, ocupado: false, recarregar: vi.fn(async () => {}),
    sincronizarEntregas: vi.fn(async () => null),
    listarVinculaveis: vi.fn(async () => ({ erro: null, itens })),
    vincularRecebimento: vi.fn(async () => null), explicarSaldo: vi.fn(async () => null), desfazerExplicacao: vi.fn(async () => null),
    simularExplicacao: vi.fn(async () => ({ previa: null, erro: null })), lerRolCancelamento: vi.fn(async () => ({ rol: null, erro: null })),
    listarLotes: vi.fn(async () => []), listarContas: vi.fn(async () => []),
  };
}

describe('OC-RECEB-PARCIAL-01 — o recebimento parcial dividido, na OC', () => {
  it('T1 as duas partes sao linhas proprias (Receb. 1/2 e 2/2) e a faixa diz o que falta de verdade', () => {
    render(<AbaContaCorrenteOC api={api(walter())} somenteLeitura={false} />);
    expect(screen.getAllByText('Receb. 1/2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Receb. 2/2').length).toBeGreaterThan(0);
    expect(barraDaDiferenca(walter())).toEqual({ frase: 'Falta receber R$ 50.000,00, já programado.', valor: 50000 });
    expect(document.body.textContent).toContain('Falta receber R$ 50.000,00, já programado.');
    expect(document.body.textContent).not.toContain('a menos do que entregou');
  });

  it('T1b falta maior que o programado: diz as duas coisas; sem programado, a frase de sempre', () => {
    const base = walter();
    expect(barraDaDiferenca({ ...base, programado: 20000 })?.frase)
      .toBe('Recebeu R$ 50.000,00 a menos do que entregou; R$ 20.000,00 já está programado.');
    expect(barraDaDiferenca({ ...base, programado: 0 })?.frase).toBe('Recebeu R$ 50.000,00 a menos do que entregou.');
  });

  it('T2 o "⋯": conciliado trava os tres gestos com o mesmo motivo; o 2/2 em aberto (com compromisso) deixa cancelar', () => {
    const [, r1, r2] = walter().linhas;
    const motivos = acoesDaLinha(r1, 'venda', false, true).filter(a => a.chave !== 'abrir').map(a => a.motivo);
    expect(new Set(motivos)).toEqual(new Set(['conciliado · desfaça a conciliação na Conferência primeiro']));
    const doDois = Object.fromEntries(acoesDaLinha(r2, 'venda', false, true).map(a => [a.chave, a.motivo]));
    expect(doDois.cancelar_programado).toBeNull();
    expect(doDois.parcelar).toBeNull();   // OC-CORRECOES-01 C2: o parcelar acendeu
    /* nenhum item do mesmo recebimento contradiz o outro: nao ha "ja' recebido" ao lado de "programado" */
    for (const l of [r1, r2]) {
      const t = acoesDaLinha(l, 'venda', false, true).map(a => a.motivo ?? '').join(' | ');
      expect(t.includes('já recebido') && t.includes('só para recebimento programado')).toBe(false);
    }
  });

  it('T3 buscar recebimento: os do proprio comprador primeiro, "Outro favorecido" depois; nome numa linha com title', async () => {
    const itens: RecebimentoVinculavel[] = [
      { lancamentoId: 'o1', data: '2026-09-10', valor: 5000, descricao: 'Pix de terceiro com um nome muito comprido que nao cabe', subcentro: 'Venda de Desmama Fêmeas',
        mesmoFavorecido: false, semContaBancaria: false, status: 'realizado', conciliado: false },
      { lancamentoId: 'm1', data: '2026-09-20', valor: 50000, descricao: 'Pix do comprador', subcentro: 'Venda de Desmama Fêmeas',
        mesmoFavorecido: true, semContaBancaria: false, status: 'realizado', conciliado: false },
    ];
    render(<AbaContaCorrenteOC api={api(walter(), itens)} somenteLeitura={false} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Buscar recebimento no Financeiro' }));
    await waitFor(() => expect(screen.getByTestId('grupo-mesmo-favorecido')).toBeTruthy());
    const linhas = [...document.querySelectorAll('tbody tr')].map(tr => tr.getAttribute('data-testid') ?? tr.getAttribute('data-lancamento'));
    expect(linhas.filter(Boolean)).toEqual(['grupo-mesmo-favorecido', 'm1', 'grupo-outro-favorecido', 'o1']);
    expect(screen.getByTestId('grupo-mesmo-favorecido').textContent).toBe('Do comprador da operação');
    expect(screen.getByTestId('grupo-outro-favorecido').textContent).toBe('Outro favorecido');
    const celula = within(document.querySelector('tr[data-lancamento="o1"]') as HTMLElement).getByText(/Pix de terceiro/);
    expect(celula.className).toContain('truncate');
    expect(celula.getAttribute('title')).toBe('Pix de terceiro com um nome muito comprido que nao cabe');
    expect(document.body.textContent).not.toContain(' · outro favorecido');
  });
});

describe('OC-RECEB-PARCIAL-01 — a Conferencia', () => {
  it('T4 a parcela no nome; a falta com frase propria (receber e pagar); sem parcela, a descricao como veio', () => {
    expect(descricaoComParcela('Venda 050 Desmama F · Recebimento', '1/2')).toBe('Venda 050 Desmama F · Receb. 1/2');
    expect(descricaoComParcela('Compra 030 Garrote · Pagamento', '2/3')).toBe('Compra 030 Garrote · Pgto. 2/3');
    expect(descricaoComParcela('Venda 050 Desmama F · Recebimento', null)).toBe('Venda 050 Desmama F · Recebimento');
    expect(descricaoComParcela(null, '1/2')).toBeNull();
    expect(fraseDaFalta({ valor_assinado: 50000, descricao: 'Venda 050 Desmama F · Recebimento', fornecedor: null }).replace(/ /g, ' '))
      .toBe('Falta receber R$ 50.000,00 · Venda 050 Desmama F · em aberto');
    expect(fraseDaFalta({ valor_assinado: -300, descricao: 'Mao de obra Mandioca', fornecedor: null }).replace(/ /g, ' '))
      .toBe('Falta pagar R$ 300,00 · Mao de obra Mandioca · em aberto');
  });

  it('T4b a tela usa as duas: a linha do sistema com a parcela; o candidato da falta uma vez, cinza, sem os complementos', () => {
    const fonte = readFileSync('src/components/financeiro-v2/EspelhoConciliacaoTab.tsx', 'utf8');
    expect(fonte).toContain('descricaoComParcela(s.descricao, s.oc_parcela)');
    expect(fonte).toContain("const eFalta = !!c.saldo_de_id && !c.ja_conciliado;");
    expect(fonte).toContain('data-testid="linha-falta">{fraseDaFalta(c)}');
    expect(fonte).toContain("eFalta && 'text-muted-foreground'");
    expect(fonte).toContain('{!eFalta && (');
  });
});
