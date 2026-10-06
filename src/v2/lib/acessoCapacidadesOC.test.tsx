/**
 * ACESSOS-OC-03a — as CAPACIDADES dentro da operacao comercial.
 * ⚠ ACESSOS-FIN-01 (Gabriel, 06/10/2026) REVERTEU TRES CELULAS: o financeiro move gado, altera o combinado fisico depois do
 *   movimento e reabre depois dele. Os casos abaixo foram levados ao contrato novo: o MECANISMO (fisico apagado, Entrega em
 *   leitura, Reabrir apagado) segue provado com `SEM_O_FISICO` — quem nao tem as tres capacidades —, e o FINANCEIRO e' provado
 *   do lado de quem pode. Abate e boitel continuam fechados para ele.
 *
 * ⚠ O PERFIL FINANCEIRO E' PROVADO SO' AQUI: nao ha' usuario financeiro para o navegador (nao se cria usuario nem se troca
 *   perfil). Os shells recebem as capacidades por prop (`acessoOC`), exatamente como o hospedeiro as desce.
 * ⚠ E' O QUE A TELA OFERECE: a trava de gravacao por perfil e' do banco (01F).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import type { ComponentProps } from 'react';
import {
  ACESSO_TOTAL, CAPACIDADES_OC, CAPACIDADES_OC_LISTA, MOTIVO_ABATE_BOITEL, MOTIVO_APOS_MOVIMENTO, MOTIVO_GADO,
  MOTIVO_REABRIR_APOS_MOVIMENTO, acessoDaPessoa, motivoFisicoTravado, motivoReabrirTravado, ocTemGadoMovido, podeNaOperacao,
  type AcessoOperacao, type CapacidadeOC,
} from './acessoOperacao';
import { nivelDaTela } from './acessoTelas';
import { TELA_OPERACAO_COMERCIAL } from './navGrupos';

const quem = vi.hoisted(() => ({ isAdmin: false, perfil: 'financeiro' as string | null }));
vi.mock('@/contexts/ClienteContext', () => ({
  useCliente: () => ({ isAdmin: quem.isAdmin, clienteAtual: quem.perfil === null ? null : { id: 'c1', perfil: quem.perfil } }),
}));
vi.mock('@/hooks/useStatusPilares', () => ({
  useStatusPilares: () => ({ status: { p1_mapa_pastos: { status: 'aberto' } }, loading: false, error: null, refetch: async () => {} }),
}));
vi.mock('@/hooks/useOcCompromissos', () => ({
  useOcCompromissos: () => ({ resumoOperacao: null, compromissos: [], loading: false, recarregar: async () => {} }),
}));
beforeEach(() => { quem.perfil = 'financeiro'; quem.isAdmin = false; });

import { AbaNegociacaoLotes } from '@/components/compra/AbaNegociacaoLotes';
import { AbaRecebimentoLotes } from '@/components/compra/AbaRecebimentoLotes';
import { VendaModalShell } from '@/components/venda/VendaModalShell';
import { AbateModalShell } from '@/components/abate/AbateModalShell';
import { BoitelBlocosModais, boitelVazio } from '@/components/venda/BoitelBlocosModais';
import type { CompraLotesApi, LoteForm } from '@/hooks/useCompraLotes';
import type { RecebimentoApi } from '@/hooks/useOperacaoRecebimento';

const FINANCEIRO = acessoDaPessoa('financeiro', false);
const GESTOR = acessoDaPessoa('gestor_cliente', false);
/* Quem abre a OC mas nao tem as tres capacidades do gado — o financeiro de ANTES do ACESSOS-FIN-01. Hoje nenhum perfil que abre
   a OC e' assim; o mecanismo continua no codigo e e' por ele que se prova. */
const SEM_O_FISICO: AcessoOperacao = { ...GESTOR, negociar_apos_movimento: false, movimentar_gado: false, reabrir_apos_movimento: false };
const PERFIS = ['gestor_cliente', 'financeiro', 'campo', 'leitura'] as const;

/* ═══ 1. O DONO ═══════════════════════════════════════════════════════════════════ */
describe('o dono das capacidades (podeNaOperacao)', () => {
  it('a tabela inteira, celula por celula', () => {
    const esperado: Record<CapacidadeOC, [boolean, boolean, boolean, boolean]> = {
      //                        gestor financeiro campo  leitura
      abrir:                   [true,  true,  false, false],
      criar:                   [true,  true,  false, false],
      negociar_preco:          [true,  true,  false, false],
      negociar_combinado:      [true,  true,  false, false],
      negociar_apos_movimento: [true,  true,  false, false],
      negociar_abate_boitel:   [true,  false, false, false],
      movimentar_gado:         [true,  true,  false, false],
      concluir_negociacao:     [true,  true,  false, false],
      reabrir_apos_movimento:  [true,  true,  false, false],
      lancar_realizado_boitel: [true,  false, false, false],
      atualizar_entregas:      [true,  true,  false, false],
      excluir_definitivo:      [false, false, false, false],
    };
    expect(Object.keys(CAPACIDADES_OC).sort()).toEqual(Object.keys(esperado).sort());
    expect([...CAPACIDADES_OC_LISTA].sort()).toEqual(Object.keys(esperado).sort());
    for (const c of CAPACIDADES_OC_LISTA) PERFIS.forEach((p, i) => expect(`${c}/${p}:${podeNaOperacao(p, false, c)}`).toBe(`${c}/${p}:${esperado[c][i]}`));
  });
  it('admin: tudo; perfil nulo, vazio ou desconhecido: nada — e "admin_agroinblue" sem isAdmin nao e admin', () => {
    for (const c of CAPACIDADES_OC_LISTA) {
      expect(podeNaOperacao('admin_agroinblue', true, c)).toBe(true);
      expect(podeNaOperacao(null, true, c)).toBe(true);
      for (const p of [null, undefined, '', 'dono', 'admin_agroinblue']) expect(podeNaOperacao(p, false, c)).toBe(false);
    }
    expect(acessoDaPessoa('admin_agroinblue', true)).toEqual(ACESSO_TOTAL);
  });
  it("'abrir' anda JUNTO com a tela da operacao: quem abre a tela tem a capacidade, e vice-versa", () => {
    for (const p of [...PERFIS, null, 'dono']) {
      expect(podeNaOperacao(p, false, 'abrir')).toBe(nivelDaTela(p, false, TELA_OPERACAO_COMERCIAL) !== 'nao');
      expect(podeNaOperacao(p, false, 'abrir')).toBe(nivelDaTela(p, false, 'operacoes-comerciais') !== 'nao');
    }
    expect(podeNaOperacao('admin_agroinblue', true, 'abrir')).toBe(nivelDaTela('admin_agroinblue', true, TELA_OPERACAO_COMERCIAL) !== 'nao');
  });
  it('o FATO: so movimentacao viva conta como gado movido', () => {
    expect(ocTemGadoMovido(null)).toBe(false);
    expect(ocTemGadoMovido([])).toBe(false);
    expect(ocTemGadoMovido([{ cancelado: true }])).toBe(false);
    expect(ocTemGadoMovido([{ cancelado: true }, { cancelado: false }])).toBe(true);
    expect(ocTemGadoMovido([{}])).toBe(true);
  });
  it('capacidade x fato: o fisico e o reabrir so fecham, DEPOIS do movimento, para quem nao tem a capacidade; gestor e financeiro nunca', () => {
    expect(motivoFisicoTravado(SEM_O_FISICO, false)).toBeNull();
    expect(motivoFisicoTravado(SEM_O_FISICO, true)).toBe(MOTIVO_APOS_MOVIMENTO);
    expect(motivoReabrirTravado(SEM_O_FISICO, false)).toBeNull();
    expect(motivoReabrirTravado(SEM_O_FISICO, true)).toBe(MOTIVO_REABRIR_APOS_MOVIMENTO);
    for (const movido of [false, true]) {
      for (const quemPode of [GESTOR, FINANCEIRO, ACESSO_TOTAL]) {
        expect(motivoFisicoTravado(quemPode, movido)).toBeNull();
        expect(motivoReabrirTravado(quemPode, movido)).toBeNull();
      }
    }
    /* ACESSOS-FIN-01: no gado, o financeiro e' o gestor — as tres celulas, e so' elas, mudaram */
    expect(FINANCEIRO.movimentar_gado && FINANCEIRO.negociar_apos_movimento && FINANCEIRO.reabrir_apos_movimento).toBe(true);
    expect([FINANCEIRO.negociar_abate_boitel, FINANCEIRO.lancar_realizado_boitel, FINANCEIRO.excluir_definitivo]).toEqual([false, false, false]);
    expect(MOTIVO_GADO).toBe('Movimentação de gado: feita pelo gestor ou pelo financeiro.');
    expect(MOTIVO_APOS_MOVIMENTO).toBe('Gado já movimentado: quantidade, peso, categoria e lotes são alterados pelo gestor ou pelo financeiro. O preço segue editável.');
    expect(MOTIVO_REABRIR_APOS_MOVIMENTO).toBe('Gado já movimentado: a negociação é reaberta pelo gestor ou pelo financeiro.');
    expect(MOTIVO_ABATE_BOITEL).toBe('Abate e boitel: edição pelo financeiro chega na próxima etapa.');
  });
});

/* ═══ 2. A NEGOCIACAO (compra e venda comuns usam a MESMA aba) ════════════════════ */
const LOTE: LoteForm = {
  idLocal: 'loc1', id: 'lote-1', ordem: 1, categoria: 'desmama_m', quantidade: '178', pesoMedioKg: '248,21',
  criterioValor: 'kg', valorInformado: '12,80', observacao: '',
};
function lotesFalsos(): CompraLotesApi {
  return {
    lotes: [LOTE], loading: false, saving: false,
    adicionarLote: vi.fn(() => 'novo'), editarLote: vi.fn(), removerLote: vi.fn(), salvar: vi.fn(async () => null),
    recarregar: vi.fn(async () => {}), totais: { lotes: 1, animais: 178, pesoTotal: 44181.38, valorNegociado: 565521.66 },
  };
}
const CATS = [{ value: 'desmama_m', label: 'Desmama M' }, { value: 'vacas', label: 'Vacas' }];
function negociacao(api: CompraLotesApi, over: Partial<ComponentProps<typeof AbaNegociacaoLotes>> = {}) {
  return render(<AbaNegociacaoLotes categoria="" categoriasDisponiveis={CATS} quantidadeNum={0} pesoKgNum={0} darkSelectClass=""
    modoOC operacaoPronta lotesApi={api} {...over} />);
}
const abrirLote = () => fireEvent.click(screen.getByText('Desmama M').closest('button')!);
const dialogo = () => within(screen.getByRole('dialog'));
const campo = (rotulo: RegExp) => {
  for (const l of dialogo().getAllByText(rotulo)) {
    const alvo = l.parentElement?.querySelector('input, button[role="combobox"]');
    if (alvo) return alvo;
  }
  throw new Error(`sem controle para ${rotulo}`);
};

describe('Negociacao — financeiro SEM gado movido: edita o combinado inteiro', () => {
  const acesso = { motivoFisico: motivoFisicoTravado(FINANCEIRO, false), motivoReabrir: motivoReabrirTravado(FINANCEIRO, false) };
  it('incluir lote e lixeira habilitados, sem motivo escrito', () => {
    const api = lotesFalsos();
    negociacao(api, { acesso });
    expect(screen.queryByTestId('motivo-fisico')).toBeNull();
    expect(screen.getByRole('button', { name: 'Adicionar lote' }).hasAttribute('disabled')).toBe(false);
    const lixo = screen.getByLabelText('Remover lote Desmama M');
    expect(lixo.hasAttribute('disabled')).toBe(false);
    fireEvent.click(lixo);
    expect(api.removerLote).toHaveBeenCalledWith('loc1');
  });
  it('no lote: categoria, quantidade, peso e valor editaveis', () => {
    negociacao(lotesFalsos(), { acesso });
    abrirLote();
    for (const r of [/^Categoria/, /^Quantidade/, /^Peso m/, /^Valor/]) expect(`${r}:${campo(r).hasAttribute('disabled')}`).toBe(`${r}:false`);
  });
  it('o DOM e IDENTICO ao de quem nao recebe `acesso` (o gestor e o admin de hoje)', () => {
    const a = negociacao(lotesFalsos(), { acesso });
    const comAcesso = a.container.innerHTML; a.unmount();
    const b = negociacao(lotesFalsos());
    expect(comAcesso).toBe(b.container.innerHTML);
  });
});

describe('Negociacao — quem nao altera o fisico, COM gado movido: fisico apagado com o motivo, preco aberto', () => {
  const motivo = motivoFisicoTravado(SEM_O_FISICO, true)!;
  const props = { fisicoBloqueado: true, acesso: { motivoFisico: motivo, motivoReabrir: motivoReabrirTravado(SEM_O_FISICO, true) } };
  it('o motivo fica ESCRITO; incluir lote e lixeira continuam la, apagados, com o motivo no title — e o clique nao dispara', () => {
    const api = lotesFalsos();
    negociacao(api, props);
    expect(screen.getByTestId('motivo-fisico').textContent).toBe(MOTIVO_APOS_MOVIMENTO);
    const add = screen.getByRole('button', { name: 'Adicionar lote' });
    expect(add.hasAttribute('disabled')).toBe(true);
    expect(add.getAttribute('title')).toBe(motivo);
    const lixo = screen.getByLabelText('Remover lote Desmama M');
    expect(lixo.hasAttribute('disabled')).toBe(true);
    expect(lixo.getAttribute('title')).toBe(motivo);
    fireEvent.click(lixo);
    expect(api.removerLote).not.toHaveBeenCalled();
    expect(screen.queryByText('Excluir lote')).toBeNull();
  });
  it('no lote: categoria, quantidade e peso apagados; valor e criterio editaveis; o cabecalho diz o motivo', () => {
    negociacao(lotesFalsos(), props);
    abrirLote();
    for (const r of [/^Categoria/, /^Quantidade/, /^Peso m/]) expect(`${r}:${campo(r).hasAttribute('disabled')}`).toBe(`${r}:true`);
    expect(campo(/^Valor/).hasAttribute('disabled')).toBe(false);
    expect(campo(/^Quantidade/).getAttribute('title')).toBe(motivo);
    expect(dialogo().getAllByText(motivo).length).toBeGreaterThan(0);
    const outro = dialogo().getByRole('button', { name: 'Aplicar e adicionar outro' });
    expect(outro.hasAttribute('disabled')).toBe(true);
    expect(outro.getAttribute('title')).toBe(motivo);
  });
  it('o PAYLOAD do Aplicar leva o fisico INALTERADO (o valor lido, nunca vazio) e o preco novo', () => {
    const api = lotesFalsos();
    negociacao(api, props);
    abrirLote();
    fireEvent.change(campo(/^Valor/), { target: { value: '13,50' } });
    fireEvent.click(dialogo().getByRole('button', { name: 'Aplicar' }));
    expect(api.editarLote).toHaveBeenCalledTimes(1);
    const [id, patch] = vi.mocked(api.editarLote).mock.calls[0];
    expect(id).toBe('loc1');
    expect(patch).toMatchObject({ categoria: 'desmama_m', quantidade: '178', pesoMedioKg: '248,21' });
    expect(String(patch.valorInformado)).toContain('13,5');
  });
  it('a MESMA trava sem o motivo de acesso (o gestor, com recebimento) e a de sempre: categoria aberta, lixeira e incluir como eram', () => {
    negociacao(lotesFalsos(), { fisicoBloqueado: true });
    expect(screen.queryByTestId('motivo-fisico')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Adicionar lote' })).toBeNull();
    abrirLote();
    expect(campo(/^Categoria/).hasAttribute('disabled')).toBe(false);
    expect(campo(/^Quantidade/).hasAttribute('disabled')).toBe(true);
  });
  it('"Reabrir e editar" do lote (OC fechada): apagado, com o motivo escrito', () => {
    const reabrir = vi.fn(async () => true);
    negociacao(lotesFalsos(), { somenteLeitura: true, onReabrirParaEditar: reabrir, acesso: props.acesso });
    abrirLote();
    fireEvent.change(dialogo().getByPlaceholderText('Motivo da reabertura'), { target: { value: 'corrigir' } });
    const b = dialogo().getByRole('button', { name: 'Reabrir e editar' });
    expect(b.hasAttribute('disabled')).toBe(true);
    expect(b.getAttribute('title')).toBe(MOTIVO_REABRIR_APOS_MOVIMENTO);
    expect(dialogo().getByTestId('motivo-reabrir').textContent).toBe(MOTIVO_REABRIR_APOS_MOVIMENTO);
    fireEvent.click(b);
    expect(reabrir).not.toHaveBeenCalled();
  });
  it('sem movimento o financeiro REABRE pelo lote (o contragesto do concluir)', () => {
    const reabrir = vi.fn(async () => true);
    negociacao(lotesFalsos(), { somenteLeitura: true, onReabrirParaEditar: reabrir, acesso: { motivoFisico: null, motivoReabrir: null } });
    abrirLote();
    fireEvent.change(dialogo().getByPlaceholderText('Motivo da reabertura'), { target: { value: 'corrigir' } });
    fireEvent.click(dialogo().getByRole('button', { name: 'Reabrir e editar' }));
    expect(reabrir).toHaveBeenCalledWith('corrigir');
  });
});

/* ═══ 3. ENTREGA / RECEBIMENTO ════════════════════════════════════════════════════ */
function recebimentoFalso(movs: RecebimentoApi['movimentacoes'] = []): RecebimentoApi {
  return {
    lotes: [{ loteId: 'lote-1', ordem: 1, categoria: 'desmama_m', qtdNegociada: 178, qtdRecebida: 0, diferenca: -178, estado: 'nao_iniciado',
      pesoMedioNegociadoKg: 248.21, criterioValor: 'kg', valorInformado: 12.8 }],
    movimentacoes: movs, loading: false, saving: false,
    concluirNegociacao: vi.fn(async () => true), receberTodos: vi.fn(async () => {}),
    listarAdotaveis: vi.fn(async () => ({ saidas: [], erro: null })), adotar: vi.fn(async () => null), desvincular: vi.fn(async () => null),
    registrar: vi.fn(async () => {}), estornar: vi.fn(async () => {}), encerrar: vi.fn(async () => {}), reabrir: vi.fn(async () => {}),
    estornarTudo: vi.fn(async () => true), recarregar: vi.fn(async () => {}),
  };
}
const MOV: RecebimentoApi['movimentacoes'][number] = {
  id: 'mov-1', loteId: 'lote-1', data: '2026-08-28', categoria: 'desmama_m', quantidade: 100, pesoMedio: 248, cancelado: false,
  origem: 'registrada', lancamentoId: 'lanc-1', valorTotal: 1000,
};
const GESTOS_DE_GADO = /^(Receber|Enviar|Registrar nova|Adotar|estornar|desvincular|Encerrar|Reabrir)/i;
function entrega(over: Partial<ComponentProps<typeof AbaRecebimentoLotes>> = {}) {
  return render(<AbaRecebimentoLotes api={recebimentoFalso([MOV])} operacaoPronta concluida encerrada={false} isCompra
    categoriasDisponiveis={CATS} adocao={{ fazendaNome: 'Faz', contraparteNome: 'Forn', lado: 'compra' }} {...over} />);
}
describe('Entrega / Recebimento — so leitura para quem nao move gado', () => {
  it('a busca sabe achar: para quem move gado ha gestos na aba', () => {
    entrega();
    expect(screen.getAllByRole('button').filter((b) => GESTOS_DE_GADO.test(b.textContent?.trim() ?? '')).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('entrega-somente-leitura')).toBeNull();
  });
  it('quem nao move gado: nenhum gesto de gado, e o motivo ESCRITO no lugar da frase do titulo financeiro', () => {
    entrega({ somenteLeitura: true, motivoSomenteLeitura: MOTIVO_GADO });
    expect(screen.queryAllByRole('button').filter((b) => GESTOS_DE_GADO.test(b.textContent?.trim() ?? ''))).toEqual([]);
    expect(screen.getByTestId('entrega-somente-leitura').textContent).toBe(MOTIVO_GADO);
    expect(screen.queryByText(/título financeiro/)).toBeNull();
  });
  it('sem o motivo, a frase de sempre (operacao cancelada) nao muda', () => {
    entrega({ somenteLeitura: true });
    expect(screen.getByText(/Operação fechada com título financeiro/)).toBeTruthy();
    expect(screen.queryByTestId('entrega-somente-leitura')).toBeNull();
  });
});

/* ═══ 4. OS SHELLS (venda e abate montados; a compra, pela FONTE) ══════════════════ */
const FAZ = [{ id: 'faz', nome: 'Faz. Ursa Maior' }];
const CP = [{ id: 'ricardo', nome: 'Ricardo Goulart' }];
function venda(over: Partial<ComponentProps<typeof VendaModalShell>> = {}) {
  return render(
    <VendaModalShell
      data="2026-08-28" setData={() => {}} compradorId="ricardo" setCompradorId={() => {}} contrapartes={CP}
      onNovoComprador={() => {}} vendaFazendaId="faz" setVendaFazendaId={() => {}} fazendasOC={FAZ}
      propriedadeDestino="" setPropriedadeDestino={() => {}} vendaTipoVenda="gado_adulto" setVendaTipoVenda={() => {}}
      observacao="" setObservacao={() => {}} ocOperacaoId="op-venda" ocStatusComercial="programada"
      categoria="" categoriasDisponiveis={CATS} quantidadeNum={0} pesoKgNum={0} submitting={false}
      lotesApi={lotesFalsos()} recebimentoApi={recebimentoFalso()}
      onSalvarOperacao={async () => true} onSalvarNegociacao={async () => {}} onFechar={() => {}}
      {...over} />,
  );
}
function abate(over: Partial<ComponentProps<typeof AbateModalShell>> = {}) {
  return render(
    <AbateModalShell
      data="2026-08-28" setData={() => {}} frigorificoId="ricardo" setFrigorificoId={() => {}} contrapartes={CP}
      onNovoFrigorifico={() => {}} abateFazendaId="faz" setAbateFazendaId={() => {}} fazendasOC={FAZ}
      observacao="" setObservacao={() => {}} numeroDocumento={null} ocOperacaoId="op-abate" ocStatusComercial="programada"
      categoria="" categoriasDisponiveis={CATS} quantidadeNum={0} pesoKgNum={0} submitting={false}
      lotesApi={lotesFalsos()} recebimentoApi={recebimentoFalso()}
      onSalvarOperacao={async () => true} onSalvarNegociacao={async () => {}} onFechar={() => {}}
      {...over} />,
  );
}
const botao = (nome: RegExp) => screen.queryAllByRole('button').find((b) => nome.test(b.textContent?.trim() ?? '')) ?? null;

describe('venda comum — o shell combina capacidade e fato', () => {
  it('financeiro, sem movimento, na Negociacao: sem motivo, incluir lote habilitado, Concluir oferecido', () => {
    venda({ acessoOC: FINANCEIRO, abaInicial: 'negociacao' });
    expect(screen.queryByTestId('motivo-fisico')).toBeNull();
    expect(screen.getByRole('button', { name: 'Adicionar lote' }).hasAttribute('disabled')).toBe(false);
    expect(botao(/Concluir negociação/)).not.toBeNull();
  });
  it('sem a capacidade, COM movimento: o fisico fecha com o motivo — e para o gestor E PARA O FINANCEIRO a mesma OC segue aberta', () => {
    const r = venda({ acessoOC: SEM_O_FISICO, abaInicial: 'negociacao', recebimentoApi: recebimentoFalso([MOV]) });
    expect(screen.getByTestId('motivo-fisico').textContent).toBe(MOTIVO_APOS_MOVIMENTO);
    expect(screen.getByRole('button', { name: 'Adicionar lote' }).hasAttribute('disabled')).toBe(true);
    /* a venda passou a ligar a trava do fisico (que so' a compra ligava): no lote, quantidade e peso apagados, valor aberto */
    abrirLote();
    expect(campo(/^Quantidade/).hasAttribute('disabled')).toBe(true);
    expect(campo(/^Peso m/).hasAttribute('disabled')).toBe(true);
    expect(campo(/^Valor/).hasAttribute('disabled')).toBe(false);
    r.unmount();
    for (const quemPode of [GESTOR, FINANCEIRO]) {
      const v = venda({ acessoOC: quemPode, abaInicial: 'negociacao', recebimentoApi: recebimentoFalso([MOV]) });
      expect(screen.queryByTestId('motivo-fisico')).toBeNull();
      expect(screen.getByRole('button', { name: 'Adicionar lote' }).hasAttribute('disabled')).toBe(false);
      v.unmount();
    }
  });
  it('movimentacao ESTORNADA nao conta: quem nao altera o fisico volta a editar o combinado', () => {
    venda({ acessoOC: SEM_O_FISICO, abaInicial: 'negociacao', recebimentoApi: recebimentoFalso([{ ...MOV, cancelado: true }]) });
    expect(screen.queryByTestId('motivo-fisico')).toBeNull();
  });
  it('"Reabrir negociação" (OC fechada): sem movimento reabre; com movimento, apagado com o motivo so para quem nao tem a capacidade — o financeiro reabre', () => {
    const r = venda({ acessoOC: SEM_O_FISICO, abaInicial: 'negociacao', ocStatusComercial: 'fechada' });
    expect(botao(/Reabrir negociação/)?.hasAttribute('disabled')).toBe(false);
    expect(screen.queryByTestId('reabrir-negociacao-motivo')).toBeNull();
    r.unmount();
    const s = venda({ acessoOC: SEM_O_FISICO, abaInicial: 'negociacao', ocStatusComercial: 'fechada', recebimentoApi: recebimentoFalso([MOV]) });
    expect(screen.getByTestId('reabrir-negociacao').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('reabrir-negociacao-motivo').textContent).toBe(MOTIVO_REABRIR_APOS_MOVIMENTO);
    s.unmount();
    venda({ acessoOC: FINANCEIRO, abaInicial: 'negociacao', ocStatusComercial: 'fechada', recebimentoApi: recebimentoFalso([MOV]) });
    expect(botao(/Reabrir negociação/)?.hasAttribute('disabled')).toBe(false);
    expect(screen.queryByTestId('reabrir-negociacao-motivo')).toBeNull();
  });
  it('Entrega: quem nao move gado ve a aba em leitura com o motivo; o gestor E O FINANCEIRO, com os gestos', () => {
    const r = venda({ acessoOC: SEM_O_FISICO, abaInicial: 'entrega', ocStatusComercial: 'fechada', recebimentoApi: recebimentoFalso([MOV]) });
    expect(screen.getByTestId('entrega-somente-leitura').textContent).toBe(MOTIVO_GADO);
    expect(within(screen.getByTestId('entrega-somente-leitura').closest('div.space-y-2, div')!.parentElement!).queryAllByRole('button').filter((b) => GESTOS_DE_GADO.test(b.textContent?.trim() ?? ''))).toEqual([]);
    r.unmount();
    for (const quemPode of [GESTOR, FINANCEIRO]) {
      const v = venda({ acessoOC: quemPode, abaInicial: 'entrega', ocStatusComercial: 'fechada', recebimentoApi: recebimentoFalso([MOV]) });
      expect(screen.queryByTestId('entrega-somente-leitura')).toBeNull();
      expect(screen.getAllByRole('button').filter((b) => GESTOS_DE_GADO.test(b.textContent?.trim() ?? '')).length).toBeGreaterThan(0);
      v.unmount();
    }
  });
  it('ACESSOS-FIN-01: na venda comum o shell do FINANCEIRO rende o MESMO DOM do gestor, com e sem gado movido — a unica diferenca e a frase do boitel', () => {
    const FRASE_BOITEL = /<p [^>]*data-testid="motivo-tipo-boitel"[^>]*>[^<]*<\/p>/;
    const limpo = (h: string) => h.replace(/:r[0-9a-z]+:|radix-[^"]+/g, '');
    for (const aba of ['venda', 'negociacao', 'entrega'] as const) for (const movs of [[], [MOV]]) {
      const a = venda({ acessoOC: FINANCEIRO, abaInicial: aba, recebimentoApi: recebimentoFalso(movs) });
      const fin = a.container.innerHTML; a.unmount();
      const b = venda({ acessoOC: GESTOR, abaInicial: aba, recebimentoApi: recebimentoFalso(movs) });
      const ges = b.container.innerHTML; b.unmount();
      expect(ges.length).toBeGreaterThan(500);
      /* a busca sabe achar: na aba Venda a frase do boitel existe para o financeiro, e so' para ele */
      expect(`${aba}:${FRASE_BOITEL.test(fin)}`).toBe(`${aba}:${aba === 'venda'}`);
      expect(FRASE_BOITEL.test(ges)).toBe(false);
      expect(limpo(fin.replace(FRASE_BOITEL, ''))).toBe(limpo(ges));
    }
  });
  it('gestor e admin: o shell com `acessoOC` de gestor rende o MESMO DOM de quem nao recebe a prop (o de hoje)', () => {
    for (const aba of ['venda', 'negociacao', 'entrega'] as const) {
      const a = venda({ acessoOC: GESTOR, abaInicial: aba, recebimentoApi: recebimentoFalso([MOV]) });
      const com = a.container.innerHTML; a.unmount();
      const b = venda({ abaInicial: aba, recebimentoApi: recebimentoFalso([MOV]) });
      const sem = b.container.innerHTML; b.unmount();
      expect(sem.length).toBeGreaterThan(500);
      expect(com.replace(/:r[0-9a-z]+:|radix-[^"]+/g, '')).toBe(sem.replace(/:r[0-9a-z]+:|radix-[^"]+/g, ''));
    }
  });
});

describe('venda em BOITEL e ABATE — a Negociacao inteira em leitura para o financeiro (ate o 03b)', () => {
  it('boitel: o motivo escrito, Salvar e Concluir apagados com ele, e o tipo de venda travado', () => {
    venda({ acessoOC: FINANCEIRO, abaInicial: 'negociacao', vendaTipoVenda: 'boitel', boitelData: boitelVazio(), onBoitelChange: () => {} });
    expect(screen.getByTestId('motivo-negociacao-leitura').textContent).toBe(MOTIVO_ABATE_BOITEL);
    expect(botao(/Salvar negociação/)?.hasAttribute('disabled')).toBe(true);
    expect(botao(/Concluir negociação/)?.hasAttribute('disabled')).toBe(true);
    expect(botao(/Concluir negociação/)?.getAttribute('title')).toBe(MOTIVO_ABATE_BOITEL);
  });
  it('boitel COMPLETO (os cinco do planejamento): para o gestor o Salvar acende; para o financeiro continua apagado, pelo motivo', () => {
    const completo = { ...boitelVazio(), dias: 100, gmd: 1.5, rendimento: 54, custoDiaria: 18, precoVendaArroba: 320 };
    const g = venda({ acessoOC: GESTOR, abaInicial: 'negociacao', vendaTipoVenda: 'boitel', boitelData: completo, onBoitelChange: () => {} });
    expect(screen.queryByTestId('motivo-negociacao-leitura')).toBeNull();
    expect(botao(/Salvar negociação/)?.hasAttribute('disabled')).toBe(false);
    expect(botao(/Concluir negociação/)?.getAttribute('title')).not.toBe(MOTIVO_ABATE_BOITEL);
    g.unmount();
    venda({ acessoOC: FINANCEIRO, abaInicial: 'negociacao', vendaTipoVenda: 'boitel', boitelData: completo, onBoitelChange: () => {} });
    expect(botao(/Salvar negociação/)?.hasAttribute('disabled')).toBe(true);
    expect(botao(/Salvar negociação/)?.getAttribute('title')).toBe(MOTIVO_ABATE_BOITEL);
  });
  it('venda nova pelo financeiro: a opcao Boitel do tipo de venda fica apagada, com o motivo escrito', () => {
    venda({ acessoOC: FINANCEIRO, ocOperacaoId: null, vendaTipoVenda: '' });
    expect(screen.getByTestId('motivo-tipo-boitel').textContent).toBe(MOTIVO_ABATE_BOITEL);
    const fonte = readFileSync('src/components/venda/VendaModalShell.tsx', 'utf8');
    expect(fonte).toContain('<SelectItem value="boitel" disabled={!acessoOC.negociar_abate_boitel}');
  });
  it('"Lançar realizado do abate" (boitel): apagado com o motivo; sem o motivo, o botao de sempre', () => {
    const iniciar = vi.fn(async () => true);
    const r = render(<BoitelBlocosModais valor={boitelVazio()} onChange={() => {}} somenteLeitura onIniciarRealizado={iniciar}
      podeLancarRealizado motivoLancarRealizado={MOTIVO_ABATE_BOITEL} />);
    const b = screen.getByTestId('lancar-realizado-abate');
    expect(b.hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('lancar-realizado-abate-motivo').textContent).toBe(MOTIVO_ABATE_BOITEL);
    r.unmount();
    render(<BoitelBlocosModais valor={boitelVazio()} onChange={() => {}} onIniciarRealizado={iniciar} podeLancarRealizado />);
    expect(screen.queryByTestId('lancar-realizado-abate')).toBeNull();
    expect(screen.getByRole('button', { name: 'Lançar realizado do abate' }).hasAttribute('disabled')).toBe(false);
  });
  it('abate, financeiro: o motivo escrito na Negociacao, incluir lote apagado, Salvar e Concluir apagados', () => {
    abate({ acessoOC: FINANCEIRO, abaInicial: 'negociacao' });
    expect(screen.getByTestId('motivo-negociacao-leitura').textContent).toBe(MOTIVO_ABATE_BOITEL);
    expect(screen.getByRole('button', { name: 'Adicionar lote' }).hasAttribute('disabled')).toBe(true);
    expect(botao(/Salvar negociação/)?.hasAttribute('disabled')).toBe(true);
    expect(botao(/Concluir negociação/)?.hasAttribute('disabled')).toBe(true);
  });
  it('abate, gestor: o MESMO DOM de quem nao recebe a prop', () => {
    const a = abate({ acessoOC: GESTOR, abaInicial: 'negociacao' });
    const com = a.container.innerHTML; a.unmount();
    const b = abate({ abaInicial: 'negociacao' });
    expect(b.container.innerHTML.length).toBeGreaterThan(500);
    expect(com.replace(/:r[0-9a-z]+:|radix-[^"]+/g, '')).toBe(b.container.innerHTML.replace(/:r[0-9a-z]+:|radix-[^"]+/g, ''));
    expect(screen.queryByTestId('motivo-negociacao-leitura')).toBeNull();
  });
});

/* ═══ 5. A LIGACAO, LIDA DA FONTE ═════════════════════════════════════════════════ */
const fonte = (p: string) => readFileSync(p, 'utf8');
describe('a ligacao: o hospedeiro le uma vez e desce por prop; ninguem pergunta pelo perfil', () => {
  it('o hospedeiro (LancamentosTab) le `useAcessoOperacao` UMA vez e entrega aos tres shells', () => {
    const f = fonte('src/pages/LancamentosTab.tsx');
    expect(f.match(/useAcessoOperacao\(\)/g)).toHaveLength(1);
    expect(f).toContain('<AbateModalShell\n          acessoOC={acessoOC}');
    expect(f).toContain('<VendaModalShell\n            acessoOC={acessoOC}');
    expect(f).toContain('const compraFormApi = {\n    acessoOC,');
  });
  it('compra: o fisico, o Recebimento, o Estornar e o Reabrir saem do dono', () => {
    const f = fonte('src/components/compra/CompraModalShell.tsx');
    expect(f).toContain('fisicoBloqueado={temRecebimentoAtivo || !!motivoFisicoAcesso}');
    expect(f).toContain('somenteLeitura={permissoes.recebimentoReadOnly || !!motivoGado}');
    expect(f).toContain('<GestoDeOperacao podeAlterar={false} motivo={motivoGado} onClick={() => undefined} testId="estornar-recebimento">');
    expect(f).toContain('<GestoDeOperacao podeAlterar={false} motivo={motivoReabrirAcesso} onClick={() => undefined} testId="reabrir-operacao">');
    expect(f).toContain('const motivoGado = acessoOC.movimentar_gado ? null : MOTIVO_GADO;');
  });
  it('"Atualizar entregas" e uma celula do dono, nos tres shells', () => {
    for (const p of ['src/components/compra/CompraModalShell.tsx', 'src/components/venda/VendaModalShell.tsx', 'src/components/abate/AbateModalShell.tsx']) {
      expect(fonte(p)).toContain('motivoAtualizarEntregas={acessoOC.atualizar_entregas ? null : MOTIVO_SEM_CAPACIDADE}');
    }
  });
  it('nenhum `if` de perfil nos pontos de uso: so o dono compara perfil', () => {
    const arquivos = [
      'src/pages/LancamentosTab.tsx', 'src/components/compra/CompraModalShell.tsx', 'src/components/venda/VendaModalShell.tsx',
      'src/components/abate/AbateModalShell.tsx', 'src/components/compra/AbaNegociacaoLotes.tsx', 'src/components/compra/AbaRecebimentoLotes.tsx',
      'src/components/abate/AbaLotesAbate.tsx', 'src/components/venda/BoitelBlocosModais.tsx', 'src/components/venda/AbaContaCorrenteOC.tsx',
      'src/components/operacao-comercial/central/CentralOperacoesComerciais.tsx', 'src/v2/hooks/usePodeAbrir.ts',
    ];
    /* 'financeiro' e 'campo' tambem sao nome de ABA e de grupo: a comparacao de PERFIL e' a que cita `perfil` ou um nome so' de perfil */
    const PERFIL = /\bperfil\s*[!=]==|[!=]==\s*'(gestor_cliente|leitura)'|perfil[^\n]{0,40}'financeiro'/;
    /* a busca sabe achar: o dono compara perfil */
    expect(PERFIL.test(fonte('src/v2/lib/acessoOperacao.ts'))).toBe(true);
    for (const a of arquivos) expect(`${a}:${PERFIL.test(fonte(a))}`).toBe(`${a}:false`);
  });
});
