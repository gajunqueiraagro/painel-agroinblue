/**
 * FOLHA-TELAS-03 — a aba "Folha do mês" e a coluna Fazenda, com as APIs INJETADAS (as mesmas da bancada, `scripts/ui-cortes/dados/folha.ts`,
 * SINTÉTICO):
 *   M1 o leitor do `fn_folha_mes`: o que não é do tipo vira nulo ("—"), nunca zero; os 4 documentos sempre na mesma ordem
 *   M2 a palavra da situação (pago e conferido · a pagar · difere · falta recibo · sem previsto) e o "Pago em" só com TUDO pago
 *   M3 "Confirmar folha": a frase do porquê (fonte única do disabled/title) — nula só quando tudo confere (o pagamento não trava)
 *   M8 Confirmar e Reabrir pela prévia do banco (o reabrir exige o motivo) · M9/M10 a aba Férias: o leitor, as palavras, as provisões do banco
 *   M4 a coluna Fazenda: o código da fazenda, "+N" quando divide, o rateio inteiro no title; sem atuação, "—"
 *   M5 a tela: uma linha por funcionário, o rodapé com a soma do banco, o Confirmar apagado dizendo por quê; trocar o tipo relê com '13_1'
 *   M6 "ligar" pede a PRÉVIA (simular) e só "Ligar" grava
 *   M7 a aba Funcionários mostra a Fazenda pelo código
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/integrations/supabase/client', () => import('../../../scripts/ui-cortes/mocks/supabase'));
vi.mock('@/contexts/ClienteContext', () => import('../../../scripts/ui-cortes/mocks/cliente'));
vi.mock('@/contexts/AuthContext', () => import('../../../scripts/ui-cortes/mocks/auth'));
vi.mock('@/contexts/FazendaContext', () => import('../../../scripts/ui-cortes/mocks/fazenda'));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { FolhaTela } from './FolhaTela';
import { FolhaApiProvider } from '@/hooks/useFolha';
import { FolhaMesApiProvider } from '@/hooks/useFolhaMes';
import { apiDaFolha, apiDaFolhaMes, FAZENDAS_DA_FOLHA } from '../../../scripts/ui-cortes/dados/folha';
import { folhaDoMesDoBanco, lugaresDosDocumentos, motivoParaNaoConfirmar, pagoEm, situacaoDaLinha, type FolhaDoMes } from '@/lib/folha/folhaMes';
import { codigosDasFazendas, rotuloDaFazenda, tituloDaFazenda } from '@/lib/folha/fazendaDaAtuacao';

const g = globalThis as unknown as { __fazendaBancada?: unknown };
g.__fazendaBancada = { fazendas: FAZENDAS_DA_FOLHA, fazendaAtual: null, isGlobal: true, fazendaId: '__global__' };

function montar(mes = apiDaFolhaMes('nj'), folha = apiDaFolha('nj'), aba: 'mes' | 'funcionarios' = 'mes') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={qc}><FolhaApiProvider api={folha}><FolhaMesApiProvider api={mes}>
    <FolhaTela entrada={{ aba }} />
  </FolhaMesApiProvider></FolhaApiProvider></QueryClientProvider></MemoryRouter>);
  return { mes, folha };
}
afterEach(() => cleanup());

const lanc = (status: string, pagamento: string | null) => ({ id: 'l', valor: 1, status, vencimento: null, pagamento, conciliado: false, ligado: true });

describe('M1 o leitor do fn_folha_mes', () => {
  it('o que não é do tipo vira nulo; os 4 documentos sempre presentes e na mesma ordem', () => {
    const f = folhaDoMesDoBanco({ competencia: '2026-11', tipo: 'xyz', linhas: [{ funcionario_id: 'a', nome: 'Ana', previsto: '', recibo: null, situacao_folha: 'nada' }, 'lixo'],
      totais: { pessoas: 1 }, documentos: { recibos: { chegou: true, n: 3, de: 9 } } });
    expect(f).not.toBeNull();
    if (!f) return;
    expect(f.tipo).toBe('mensal');
    expect(f.linhas).toHaveLength(1);
    expect(f.linhas[0].previsto).toBeNull();
    expect(f.linhas[0].recibo).toBeNull();
    expect(f.linhas[0].situacao_folha).toBe('a_conferir');
    expect(f.totais.previsto).toBeNull();
    expect(lugaresDosDocumentos(f).map(d => `${d.chave}:${d.detalhe}`)).toEqual(['espelho:não chegou', 'recibos:3 de 9', 'guia_fgts:não chegou', 'guia_inss:não chegou']);
    expect(folhaDoMesDoBanco('lixo')).toBeNull();
  });
});

describe('M2 a situação e o "Pago em"', () => {
  it('as palavras da tela e o dia do último pagamento só quando todos estão pagos', () => {
    expect(situacaoDaLinha({ situacao_folha: 'confere', lancamentos: [lanc('realizado', '2026-12-05')] }).texto).toBe('Pago e conferido');
    expect(situacaoDaLinha({ situacao_folha: 'confere', lancamentos: [lanc('previsto', null)] }).texto).toBe('Confere · a pagar');
    expect(situacaoDaLinha({ situacao_folha: 'diferenca', lancamentos: [] })).toEqual({ texto: 'Recibo difere', tom: 'ambar' });
    expect(situacaoDaLinha({ situacao_folha: 'sem_recibo', lancamentos: [] }).texto).toBe('Falta recibo');
    expect(situacaoDaLinha({ situacao_folha: 'sem_previsto', lancamentos: [] }).tom).toBe('cinza');
    expect(pagoEm({ lancamentos: [lanc('realizado', '2026-12-05'), lanc('realizado', '2026-12-07')] })).toBe('2026-12-07');
    expect(pagoEm({ lancamentos: [lanc('realizado', '2026-12-05'), lanc('previsto', null)] })).toBeNull();
    expect(pagoEm({ lancamentos: [] })).toBeNull();
  });
});

describe('M3 o porquê do Confirmar', () => {
  const base = (t: Partial<FolhaDoMes['totais']>, falta: string[] = []): FolhaDoMes => ({
    competencia: '2026-11', tipo: 'mensal', calendario: [], documentos: lugaresVazios(), folha: null,
    totais: { pessoas: 1, previsto: 1, recibo: 1, diferenca: 0, confere: 1, diferencas: 0, sem_recibo: 0, a_conferir: 0, sem_previsto: 0, criados_pelo_recibo: 0, a_ligar: 0, ...t },
    linhas: [{ funcionario_id: 'a', nome: 'Ana', vinculo_a_confirmar: false, previsto: 1, recibo: 1, diferenca: 0, recibos: [], lancamentos: [], lancamento_status: null,
      situacao_folha: 'confere', falta, falta_frase: null }],
  });
  it('lista o que falta; nula só quando tudo confere e ninguém tem o que fazer', () => {
    expect(motivoParaNaoConfirmar(null)).toMatch(/Carregando/);
    expect(motivoParaNaoConfirmar(base({ sem_recibo: 2, diferencas: 1 }))).toBe('Falta: 2 sem recibo · 1 com diferença.');
    expect(motivoParaNaoConfirmar(base({}, ['recibo']))).toMatch(/1 pessoa ainda tem/);
    /* o pagamento não trava (a folha se confirma antes de pagar; a mesma regra do banco, 118740) */
    expect(motivoParaNaoConfirmar(base({}, ['pagamento']))).toBeNull();
    expect(motivoParaNaoConfirmar(base({}))).toBeNull();
  });
});
function lugaresVazios(): FolhaDoMes['documentos'] {
  const d = { chegou: false, n: null, de: null, valor: null, vencimento: null };
  return { recibos: d, espelho: d, guia_inss: d, guia_fgts: d };
}

describe('M4 a coluna Fazenda', () => {
  const codigo = codigosDasFazendas(FAZENDAS_DA_FOLHA);
  it('o código, "+N" quando divide, o rateio no title; sem atuação "—"; sem código, o nome', () => {
    const duas = [{ fazenda_id: 'fSED', fazenda: 'Sede', atividade: 'pecuaria', pct: 60 }, { fazenda_id: 'fRET', fazenda: 'Retiro', atividade: 'agricultura', pct: 40 }];
    expect(rotuloDaFazenda(duas, codigo)).toBe('SED +1');
    expect(tituloDaFazenda(duas, codigo)).toBe('SED Sede · Pecuária 60% · RET Retiro · Agricultura 40%');
    expect(rotuloDaFazenda([duas[1]], codigo)).toBe('RET');
    expect(rotuloDaFazenda([], codigo)).toBe('—');
    expect(rotuloDaFazenda([{ fazenda_id: 'outra', fazenda: 'Santa Cruz', atividade: null, pct: 100 }], codigo)).toBe('Santa Cruz');
  });
});

describe('M5 a aba Folha do mês', () => {
  it('uma linha por funcionário, o rodapé do banco, o Confirmar apagado dizendo por quê; trocar o tipo relê com 13_1', async () => {
    const { mes } = montar();
    await screen.findAllByTestId('folha-mes-linha');
    expect(screen.getAllByTestId('folha-mes-linha')).toHaveLength(27);
    const confirmar = screen.getByTestId('folha-mes-confirmar');
    expect(confirmar).toHaveProperty('disabled', true);
    expect(confirmar.getAttribute('title')).toMatch(/^Falta: /);
    expect(screen.getByTestId('folha-mes-motivo').textContent).toBe(confirmar.getAttribute('title'));
    expect(screen.getByTestId('folha-mes-rodape').textContent).toContain('27 funcionários');
    expect(screen.getByTestId('folha-mes-doc-recibos').textContent).toMatch(/de 27/);
    /* a linha sem atuação tem "—"; a que divide, "SED +1" */
    expect(screen.getAllByTestId('folha-mes-fazenda').map(c => c.textContent)).toContain('SED +1');
    fireEvent.click(within(screen.getByTestId('folha-mes-faixa')).getByText('13º · 1ª parcela'));
    await waitFor(() => expect(mes.chamadas.some(c => c.args[2] === '13_1')).toBe(true));
  });
  it('quando tudo confere (mesmo a pagar) o Confirmar acende e a frase diz "Tudo confere."', async () => {
    montar(apiDaFolhaMes('vera', 'tudo_confere'), apiDaFolha('vera'));
    await screen.findAllByTestId('folha-mes-linha');
    expect(screen.getByTestId('folha-mes-motivo').textContent).toBe('Tudo confere.');
    expect(screen.getByTestId('folha-mes-confirmar')).toHaveProperty('disabled', false);
  });
});

describe('M6 ligar o lançamento que entrou pelo favorecido', () => {
  it('a prévia primeiro (simular); só "Ligar" grava', async () => {
    const { folha } = montar();
    const ligar = vi.spyOn(folha, 'ligar');
    const botoes = await screen.findAllByTestId('folha-mes-ligar');
    fireEvent.click(botoes[0]);
    await screen.findByTestId('folha-mes-ligar-previa');
    expect(ligar).toHaveBeenCalledTimes(1);
    expect(ligar.mock.calls[0][3]).toBe(true);
    fireEvent.click(screen.getByTestId('folha-mes-ligar-ok'));
    await waitFor(() => expect(ligar).toHaveBeenCalledTimes(2));
    expect(ligar.mock.calls[1][3]).toBe(false);
  });
});

describe('M7 a aba Funcionários: a Fazenda pelo código', () => {
  it('a coluna Fazenda mostra o código e o rateio no title', async () => {
    montar(apiDaFolhaMes('nj'), apiDaFolha('nj'), 'funcionarios');
    await screen.findAllByTestId('folha-linha');
    const celulas = screen.getAllByTestId('folha-fazenda');
    expect(celulas.map(c => c.textContent)).toContain('SED +1');
    expect(celulas.find(c => c.textContent === 'SED +1')?.getAttribute('title')).toBe('SED Sede · Pecuária 60% · RET Retiro · Agricultura 40%');
  });
});

/* ── lote 118740: Confirmar / Reabrir e a aba Férias ──────────────────────────────────────────────────────────────────────── */
import { feriasAProgramar, feriasDoBanco, situacaoDeFerias } from '@/lib/folha/folhaFerias';
import { estaConfirmada, FALTA_QUE_TRAVA } from '@/lib/folha/folhaMes';

describe('M8 o Confirmar: o pagamento não trava; a folha confirmada diz quando', () => {
  it('só lançamento, ligar, recibo e vínculo travam; confirmada = a frase com a data', () => {
    expect(FALTA_QUE_TRAVA).toEqual(['lancamento', 'ligar', 'recibo', 'vinculo']);
    const f = folhaDoMesDoBanco({ competencia: '2026-11', tipo: 'mensal', totais: { pessoas: 1, confere: 1 }, folha: { id: 'fo', situacao: 'confirmada', confirmada_em: '2026-12-04T10:00:00Z' },
      linhas: [{ funcionario_id: 'a', nome: 'Ana', situacao_folha: 'confere', falta: ['pagamento'] }] });
    expect(estaConfirmada(f)).toBe(true);
    expect(motivoParaNaoConfirmar(f)).toBe('Folha confirmada em 04/12/2026.');
    if (!f) return;
    expect(motivoParaNaoConfirmar({ ...f, folha: null })).toBeNull();
  });
  it('a tela: Confirmar pede a PRÉVIA (simular) e só o 2º clique grava; confirmada mostra o Reabrir, que exige o motivo', async () => {
    const mes = apiDaFolhaMes('vera', 'tudo_confere');
    const confirmar = vi.spyOn(mes, 'confirmar');
    montar(mes, apiDaFolha('vera'));
    await screen.findAllByTestId('folha-mes-linha');
    fireEvent.click(screen.getByTestId('folha-mes-confirmar'));
    await screen.findByTestId('folha-mes-previa');
    expect(confirmar).toHaveBeenCalledTimes(1);
    expect(confirmar.mock.calls[0][3]).toBe(true);
    fireEvent.click(screen.getByTestId('folha-mes-previa-ok'));
    await waitFor(() => expect(confirmar).toHaveBeenCalledTimes(2));
    expect(confirmar.mock.calls[1][3]).toBe(false);
    cleanup();
    const conf = apiDaFolhaMes('vera', 'confirmada');
    const reabrir = vi.spyOn(conf, 'reabrir');
    montar(conf, apiDaFolha('vera'));
    fireEvent.click(await screen.findByTestId('folha-mes-reabrir'));
    expect(screen.getByTestId('folha-mes-previa-ok')).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByTestId('folha-mes-reabrir-motivo'), { target: { value: 'o contador corrigiu' } });
    fireEvent.click(screen.getByTestId('folha-mes-previa-ok'));
    await waitFor(() => expect(reabrir).toHaveBeenCalledTimes(2));
    expect(reabrir.mock.calls.map(c => c[2])).toEqual([true, false]);
    expect(reabrir.mock.calls[0][1]).toBe('o contador corrigiu');
  });
});

describe('M9 as férias: o leitor e as palavras', () => {
  it('o que não é do tipo vira nulo; vencida em vermelho; vence diz os dias; ganhando diz os avos', () => {
    const f = feriasDoBanco({ linhas: [{ funcionario_id: 'a', nome: 'Ana', origem: 'xyz', situacao_ferias: 'nada', tirou: null, provisao_ferias: '' }], totais: { vencidas: 2, vence_90: 3 } });
    expect(f?.linhas[0].origem).toBeNull();
    expect(f?.linhas[0].situacao_ferias).toBe('sem_admissao');
    expect(f?.linhas[0].provisao_ferias).toBeNull();
    expect(f?.totais.provisao_13).toBeNull();
    if (f) expect(feriasAProgramar(f.totais)).toBe(5);
    expect(situacaoDeFerias({ situacao_ferias: 'vencida', dias: -3, avos_em_curso: 0 })).toEqual({ texto: 'Vencida (dobro)', tom: 'vermelho' });
    expect(situacaoDeFerias({ situacao_ferias: 'vence', dias: 24, avos_em_curso: 0 }).texto).toBe('Vence em 24 dias');
    expect(situacaoDeFerias({ situacao_ferias: 'vence', dias: 1, avos_em_curso: 0 }).texto).toBe('Vence em 1 dia');
    expect(situacaoDeFerias({ situacao_ferias: 'ganhando', dias: null, avos_em_curso: 5 }).texto).toBe('Ganhando (5/12)');
  });
});

describe('M10 a aba Férias', () => {
  it('as provisões do banco no topo e no rodapé; uma linha por ativo; a aba diz quantas pedem programação; "pela admissão" sem o tirou', async () => {
    const mes = apiDaFolhaMes('nj');
    montar(mes, apiDaFolha('nj'), 'funcionarios');
    const aba = await screen.findByRole('tab', { name: /^Férias · \d+/ });
    const r = await mes.ferias('x');
    if (!r.ok || !r.dados) throw new Error('bancada');
    expect(aba.textContent).toBe(`Férias · ${feriasAProgramar(r.dados.totais)}`);
    fireEvent.click(aba);
    await screen.findAllByTestId('folha-ferias-linha');
    expect(screen.getAllByTestId('folha-ferias-linha')).toHaveLength(27);
    const prov = r.dados.totais.provisao_ferias ?? 0;
    const br = prov.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    expect(screen.getByTestId('folha-ferias-prov-ferias').textContent).toContain(br);
    expect(screen.getByTestId('folha-ferias-rodape').textContent).toContain(br);
    const linhas = screen.getAllByTestId('folha-ferias-linha');
    const pelaAdm = linhas.find(l => within(l).queryByText('pela admissão'));
    expect(pelaAdm?.textContent).toContain('—');
    expect(screen.getAllByTestId('folha-ferias-situacao').map(c => c.textContent)).toContain('Vencida (dobro)');
  });
});
