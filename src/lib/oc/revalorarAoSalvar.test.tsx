/**
 * OC-BOITEL-REVALORAR-SALVAR-01 — Salvar e Concluir reaplicam o realizado do boitel quando o lote diverge do acerto.
 *
 * ⚠ NASCE DA b58bf556 (Vera, 110 garrotes, 13/05/2026): realizado gravado desde 31/08 (saldo do acerto 593.139,96) e o lote
 *   em 565.217,00. Em 04/10 o Gabriel abriu o Realizado, clicou Aplicar sem mudar numero e salvou — tres vezes. Nenhum
 *   `revalorar_lote`: o Salvar so' gravava o realizado com o RASCUNHO SUJO, e Aplicar sem mudar nao suja.
 * ⚠ O `LancamentosTab` NAO SE MONTA EM TESTE (nenhum teste da casa o monta). O que se prova aqui:
 *   (1) a DECISAO (`decisaoDoRealizado`) e o MOTOR sobre o caso real (fixture lida do proto);
 *   (2) as ESCRITAS, pela lib de sempre (`gravarRealizadoBoitel`), com o saldo do acerto;
 *   (3) o CONCLUIR do `VendaModalShell` REAL: salva por dentro e so' fecha se o salvar passou;
 *   (4) a LIGACAO no `LancamentosTab`, lida da FONTE (o molde do `fazendaDoFormulario.test`);
 *   (5) a hipotese 2 da evidencia de 04/10 15:35 (rascunho perdido entre o Aplicar e o Salvar): no shell REAL, com o
 *       dialogo REAL, o valor editado chega ao `oc_salvar_boitel('realizado')`. O anfitriao do teste guarda rascunho e salvo
 *       com as MESMAS funcoes do `LancamentosTab` — ele nao e' o `LancamentosTab`, e o item (4) e' o que prende a ligacao.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState, type ComponentProps } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const p1 = vi.hoisted(() => ({ status: 'aberto' }));
vi.mock('@/hooks/useStatusPilares', () => ({
  useStatusPilares: () => ({ status: { p1_mapa_pastos: { status: p1.status } }, loading: false, error: null, refetch: async () => {} }),
}));
vi.mock('@/hooks/useOcCompromissos', () => ({
  useOcCompromissos: () => ({ resumoOperacao: null, compromissos: [], loading: false, recarregar: async () => {} }),
}));

import { decisaoDoRealizado, gravarRealizadoBoitel, type EscritasDoRealizado } from '@/lib/oc/gravarRealizadoBoitel';
import {
  liquidoDaVendaBoitel, valorDaVendaBoitel, slotDaVendaBoitel, avisoAcertoDivergente, COMO_RESOLVER_DIVERGENCIA,
} from '@/components/venda/BoitelNegociacaoDerivado';
import {
  boitelDeLinha, payloadBoitel, pendenciaDoRealizado, realizadoNaoSalvo, type BoitelEdicao,
} from '@/components/venda/BoitelBlocosModais';
import { VendaModalShell } from '@/components/venda/VendaModalShell';
import FIXTURE from './boitelB58bf556.fixture.json';

/* ── o caso real: as duas linhas de `zoo_operacao_boitel` e o lote, como o `LancamentosTab` os monta (cabecas e peso dos lotes) ── */
const QTD = FIXTURE.lote.qtd_negociada;
const PESO = Number(FIXTURE.lote.peso_medio_negociado_kg);
const SLOT = Number(FIXTURE.lote.valor_informado);
const comLote = (l: Record<string, unknown>): BoitelEdicao => {
  const d = boitelDeLinha(l);
  if (!d) throw new Error('fixture sem linha');
  return { ...d, qtdCabecas: QTD, pesoInicial: PESO };
};
const PROJETADO = comLote(FIXTURE.projetado);
const REALIZADO = comLote(FIXTURE.realizado);
const ACERTO = 593139.96;
const TOTAIS = { lotes: 1, valorNegociado: SLOT };

function escritas(over: Partial<EscritasDoRealizado> = {}) {
  const chamadas: string[] = [];
  const e: EscritasDoRealizado = {
    salvarBoitel: vi.fn(async (v: number) => { chamadas.push(`boitel@${v}`); return v + 1; }),
    idDoLote: vi.fn(async () => { chamadas.push('idDoLote'); return 'b53c75f3'; }),
    revalorar: vi.fn(async (v: number, lote: string, valor: number) => {
      chamadas.push(`revalorar@${v}:${lote}:${valor}`);
      return { versao: v + 1, lancamentosAfetados: 1, avisoPendente: null };
    }),
    depoisDeRevalorar: vi.fn(async () => { chamadas.push('depois'); }),
    ehConflitoDeVersao: () => false,
    ...over,
  };
  return { e, chamadas };
}

beforeEach(() => { p1.status = 'aberto'; });

describe('(1) a decisao e o motor, no caso da b58bf556', () => {
  it('o motor: saldo do acerto 593.139,96, lote 565.217,00 — divergente; o realizado esta completo', () => {
    expect(SLOT).toBe(565217);
    expect(liquidoDaVendaBoitel(REALIZADO)).toBe(ACERTO);
    const v = valorDaVendaBoitel({ slot: slotDaVendaBoitel(TOTAIS), realizado: REALIZADO, projetado: PROJETADO });
    expect(v).toMatchObject({ valor: 565217, acerto: ACERTO, realizadoAplicado: true, divergente: true });
    expect(pendenciaDoRealizado(REALIZADO)).toBeNull();
  });
  it('rascunho IGUAL ao gravado + lote divergente -> gravar (era "nada": o Aplicar sem mudar numero nao suja)', () => {
    expect(realizadoNaoSalvo(REALIZADO, { ...REALIZADO })).toBe(false);
    expect(decisaoDoRealizado({ sujo: false, loteDiverge: true, pendencia: null })).toBe('gravar');
  });
  it('sem divergencia e sem sujo -> nada; sujo -> gravar, como sempre', () => {
    expect(decisaoDoRealizado({ sujo: false, loteDiverge: false, pendencia: null })).toBe('nada');
    expect(decisaoDoRealizado({ sujo: true, loteDiverge: false, pendencia: null })).toBe('gravar');
    expect(decisaoDoRealizado({ sujo: true, loteDiverge: true, pendencia: null })).toBe('gravar');
    /* depois de revalorado o lote vale o acerto: nao ha mais o que reaplicar */
    expect(valorDaVendaBoitel({ slot: ACERTO, realizado: REALIZADO, projetado: PROJETADO }).divergente).toBe(false);
  });
  it('realizado INCOMPLETO: sujo recusa com a frase de hoje; so divergente (realizado antigo) nao grava nem trava', () => {
    const incompleto: BoitelEdicao = { ...REALIZADO, valorTotalDiarias: undefined };
    const falta = pendenciaDoRealizado(incompleto);
    expect(falta).toMatch(/^Realizado incompleto — /);
    expect(decisaoDoRealizado({ sujo: true, loteDiverge: true, pendencia: falta })).toBe('recusar');
    expect(decisaoDoRealizado({ sujo: false, loteDiverge: true, pendencia: falta })).toBe('nada');
  });
  it('slot vazio (lote sem valor) e venda sem lote: null, nunca zero', () => {
    expect(slotDaVendaBoitel({ lotes: 1, valorNegociado: 0 })).toBeNull();
    expect(slotDaVendaBoitel({ lotes: 0, valorNegociado: 10 })).toBeNull();
    expect(slotDaVendaBoitel(null)).toBeNull();
  });
});

describe('(2) as escritas: realizado e revalorar com o saldo do acerto, nesta ordem', () => {
  it('oc_salvar_boitel(realizado) -> le o lote -> oc_revalorar_lote(593.139,96) -> rele os lotes', async () => {
    const { e, chamadas } = escritas();
    const r = await gravarRealizadoBoitel(154, liquidoDaVendaBoitel(REALIZADO), e);
    expect(chamadas).toEqual(['boitel@154', 'idDoLote', 'revalorar@155:b53c75f3:593139.96', 'depois']);
    expect(r).toMatchObject({ ok: true, versao: 156 });
  });
});

describe('(4) a ligacao no LancamentosTab (lida da fonte)', () => {
  const fonte = readFileSync(resolve(__dirname, '../../pages/LancamentosTab.tsx'), 'utf8');
  it('o Salvar grava o realizado pela DECISAO (sujo OU divergente), nao mais so por `realizadoSujo`', () => {
    expect(fonte).toContain("if (decisaoRealizado === 'gravar') {");
    expect(fonte).not.toMatch(/if \(realizadoSujo\) \{\s*const r = await gravarRealizadoBoitel/);
    /* a busca sabe achar: a chamada da gravacao continua la, uma vez so */
    expect(fonte.match(/await gravarRealizadoBoitel\(clienteId, versaoFinal\)/g)).toHaveLength(1);
  });
  it('a divergencia vem do motor (`valorDaVendaBoitel` sobre o realizado SALVO e o slot dos lotes), sem formula nova', () => {
    expect(fonte).toMatch(/const loteDivergeDoAcerto = vendaTipoVenda === 'boitel' && valorDaVendaBoitel\(\{\s*slot: slotDaVendaBoitel\(lotesApi\.totais\), realizado: boitelRealSalvoDaVenda, projetado: boitelDaVenda,\s*\}\)\.divergente;/);
    expect(fonte).toContain('sujo: realizadoSujo, loteDiverge: loteDivergeDoAcerto, pendencia: pendenciaDoRealizado(boitelRealDaVenda),');
  });
  it('o botao Salvar acende com a divergencia, e o Concluir da venda chama o MESMO salvar', () => {
    expect(fonte).toContain("(ocVendaSemAlteracoes && decisaoRealizado !== 'gravar')");
    expect(fonte).toContain('onSalvarNegociacao={() => salvarNegociacaoVendaOC()}');
  });
});

/* ── o shell REAL, com um anfitriao que guarda rascunho e salvo como o LancamentosTab ── */
type ShellProps = ComponentProps<typeof VendaModalShell>;
function Anfitriao({ salvoInicial, slotInicial, e, status = 'programada', onConcluir }: {
  salvoInicial: BoitelEdicao; slotInicial: number; e: EscritasDoRealizado; status?: string;
  onConcluir: (v?: number) => void;
}) {
  const [rascunho, setRascunho] = useState<BoitelEdicao | null>(salvoInicial);
  const [salvo, setSalvo] = useState<BoitelEdicao | null>(salvoInicial);
  const [slot, setSlot] = useState(slotInicial);
  const sujo = realizadoNaoSalvo(rascunho, salvo);
  const diverge = valorDaVendaBoitel({ slot: slotDaVendaBoitel({ lotes: 1, valorNegociado: slot }), realizado: salvo, projetado: PROJETADO }).divergente;
  const decisao = decisaoDoRealizado({ sujo, loteDiverge: diverge, pendencia: pendenciaDoRealizado(rascunho) });
  const salvar = async (): Promise<number | false> => {
    if (decisao === 'recusar') return false;
    if (decisao !== 'gravar' || !rascunho) return 154;
    const liquido = liquidoDaVendaBoitel(rascunho);
    const r = await gravarRealizadoBoitel(154, liquido, {
      ...e,
      /* o payload que iria ao `oc_salvar_boitel('realizado')` e' o do RASCUNHO do momento do clique */
      salvarBoitel: async (v) => { ultimoPayload.atual = payloadBoitel(rascunho); return e.salvarBoitel(v); },
    });
    if ('erro' in r) return false;
    setSalvo(rascunho);
    if (liquido != null) setSlot(liquido);
    return r.versao;
  };
  const lotesApi = { totais: { lotes: 1, animais: QTD, valorNegociado: slot }, lotes: [], loading: false } as unknown as ShellProps['lotesApi'];
  /* o Concluir so' existe com a API de entrega presente; aqui ela nao faz nada */
  const recebimentoApi = { saving: false, movimentacoes: [] } as unknown as ShellProps['recebimentoApi'];
  return (
    <VendaModalShell
      data="2026-05-13" setData={() => {}} compradorId="ricardo" setCompradorId={() => {}}
      contrapartes={[{ id: 'ricardo', nome: 'Ricardo Duarte Goulart' }]} onNovoComprador={() => {}}
      vendaFazendaId="3m" setVendaFazendaId={() => {}} fazendasOC={[{ id: '3m', nome: 'Faz. 3 Muchachas' }]}
      propriedadeDestino="" setPropriedadeDestino={() => {}} vendaTipoVenda="boitel" setVendaTipoVenda={() => {}}
      observacao="" setObservacao={() => {}} ocOperacaoId="b58bf556" ocStatusComercial={status}
      categoria="" categoriasDisponiveis={[]} quantidadeNum={QTD} pesoKgNum={PESO} submitting={false}
      abaInicial="negociacao" lotesApi={lotesApi} recebimentoApi={recebimentoApi}
      boitelData={PROJETADO} onBoitelChange={() => {}} boitelReal={rascunho} boitelRealSalvo={salvo}
      pendenciaRealizado={decisao === 'recusar' ? pendenciaDoRealizado(rascunho) : null}
      onAplicarRealizado={setRascunho} onIniciarRealizado={async () => true}
      semAlteracoes={status === 'fechada' ? true : decisao !== 'gravar'}
      onSalvarOperacao={async () => true} onSalvarNegociacao={salvar} onConcluirNegociacao={onConcluir} onFechar={() => {}} />
  );
}
const ultimoPayload: { atual: Record<string, unknown> | null } = { atual: null };
const botao = (nome: RegExp) => screen.getByRole('button', { name: nome }) as HTMLButtonElement;
function montar(over: { slot?: number; status?: string; salvo?: BoitelEdicao } = {}) {
  ultimoPayload.atual = null;
  const { e, chamadas } = escritas();
  const onConcluir = vi.fn((_v?: number) => { chamadas.push('concluir'); });
  render(<Anfitriao salvoInicial={over.salvo ?? REALIZADO} slotInicial={over.slot ?? SLOT} e={e} status={over.status} onConcluir={onConcluir} />);
  return { e, chamadas, onConcluir };
}

describe('(3) no shell real: o aviso, o Salvar aceso e o Concluir que herda', () => {
  it('lote divergente: o aviso diz "salve a negociacao para atualizar" e o Salvar esta ACESO sem nada editado', () => {
    montar();
    expect(COMO_RESOLVER_DIVERGENCIA).toBe('salve a negociação para atualizar');
    const aviso = screen.getByTestId('aviso-lote-acerto');
    expect(aviso.textContent).toBe('Lote ≠ acerto · salve para atualizar');                 // a linha de 15px; a frase inteira no title
    expect(aviso.getAttribute('title')).toBe(avisoAcertoDivergente(ACERTO));
    expect(aviso.getAttribute('title')).toMatch(/^Acerto do boitel R\$\s593\.139,96 · salve a negociação para atualizar$/);
    expect(screen.queryByText(/reaplique o Realizado/)).toBeNull();
    expect(botao(/Salvar negociação/).disabled).toBe(false);
  });
  it('Salvar com o rascunho igual ao gravado: grava o realizado e revalora com 593.139,96; depois o aviso some e o botao apaga', async () => {
    const { chamadas } = montar();
    fireEvent.click(botao(/Salvar negociação/));
    await waitFor(() => expect(chamadas).toEqual(['boitel@154', 'idDoLote', 'revalorar@155:b53c75f3:593139.96', 'depois']));
    await waitFor(() => expect(screen.queryByTestId('aviso-lote-acerto')).toBeNull());
    expect(ultimoPayload.atual).toMatchObject({ valor_total_abate: 813771.01, qtd_abatida: 109 });
    expect(botao(/Salvar negociação/).disabled).toBe(true);
  });
  it('sem divergencia e sem sujo: Salvar apagado, e o Concluir nao grava realizado nenhum', async () => {
    const { chamadas, onConcluir } = montar({ slot: ACERTO });
    expect(screen.queryByTestId('aviso-lote-acerto')).toBeNull();
    expect(botao(/Salvar negociação/).disabled).toBe(true);
    fireEvent.click(botao(/Concluir negociação/));
    await waitFor(() => expect(onConcluir).toHaveBeenCalledTimes(1));
    expect(chamadas).toEqual(['concluir']);
  });
  it('CONCLUIR com lote divergente: grava o realizado e revalora ANTES de fechar, e fecha com a versao do revalorar', async () => {
    const { chamadas, onConcluir } = montar();
    fireEvent.click(botao(/Concluir negociação/));
    await waitFor(() => expect(onConcluir).toHaveBeenCalledTimes(1));
    expect(chamadas).toEqual(['boitel@154', 'idDoLote', 'revalorar@155:b53c75f3:593139.96', 'depois', 'concluir']);
    expect(onConcluir).toHaveBeenCalledWith(156);
  });
  it('se o salvar devolve false (recusa do banco), o Concluir NAO fecha', async () => {
    ultimoPayload.atual = null;
    const { e, chamadas } = escritas({ revalorar: vi.fn(async () => { throw new Error('Conflito de versao'); }) });
    const onConcluir = vi.fn();
    render(<Anfitriao salvoInicial={REALIZADO} slotInicial={SLOT} e={e} onConcluir={onConcluir} />);
    fireEvent.click(botao(/Concluir negociação/));
    await waitFor(() => expect(chamadas).toContain('idDoLote'));
    await new Promise(r => setTimeout(r, 30));
    expect(onConcluir).not.toHaveBeenCalled();
  });
});

describe('(5) hipotese 2: o rascunho sobrevive entre o Aplicar e o Salvar', () => {
  /* o lapis do bloco "Comercialização e Adiantamento" do cartao REALIZADO e' o segundo (o primeiro e' o da projecao) */
  const abrirRealizado = () => fireEvent.click(screen.getAllByRole('button', { name: 'Editar Comercialização e Adiantamento' })[1]);
  const campoValorDoAbate = () => {
    const input = screen.getByTitle('Valor total do abate (R$) — já líquido de bônus, tributos e descontos do frigorífico')
      .closest('div.min-w-0')?.querySelector('input');
    if (!input) throw new Error('sem o campo Valor total do abate');
    return input as HTMLInputElement;
  };
  it('OC aberta: editar o Valor total do abate em um centavo -> Aplicar -> Salvar manda o valor EDITADO ao oc_salvar_boitel(realizado)', async () => {
    const { chamadas } = montar({ slot: ACERTO });                              // sem divergencia: quem manda gravar e' o sujo
    expect(botao(/Salvar negociação/).disabled).toBe(true);
    abrirRealizado();
    const campo = campoValorDoAbate();
    expect(campo.disabled).toBe(false);
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: '813.771,02' } });
    fireEvent.blur(campo);
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(botao(/Salvar negociação/).disabled).toBe(false));   // o rascunho ficou sujo
    fireEvent.click(botao(/Salvar negociação/));
    await waitFor(() => expect(chamadas).toContain('depois'));
    expect(ultimoPayload.atual).toMatchObject({ valor_total_abate: 813771.02 });
    /* o revalorar leva o saldo do acerto com o centavo a mais */
    expect(chamadas[2]).toBe('revalorar@155:b53c75f3:593139.97');
  });
  it('OC FECHADA: o dialogo do Realizado e so leitura (campo desligado, Aplicar apagado) — a edicao nao entra', () => {
    montar({ slot: ACERTO, status: 'fechada' });
    abrirRealizado();
    expect(campoValorDoAbate().disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Aplicar' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText('Operação fechada · reabra para editar').length).toBeGreaterThan(0);
  });
});
