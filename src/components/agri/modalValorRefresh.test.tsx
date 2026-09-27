/**
 * DRE-MODAL-REFRESH-01 — o modal de valor do DRE acompanha a escrita feita a partir dele.
 *
 * ⚠ O DEFEITO (relato do Gabriel, Administracao R$ 333.322,65, 455 lancamentos, 293 de rateio adm.):
 *   salvar um lancamento aberto pelo modal nao mudava a lista, os cards nem o total — so' fechar e
 *   reabrir. Tres causas: os cards liam a FOTOGRAFIA da celula tirada no clique (`recorte.celula`), a
 *   lista do rateio administrativo nunca era relida, e o modal da lavoura guardava a resposta da RPC
 *   no estado da pagina.
 * ⚠ O QUE ESTE ARQUIVO TRAVA: (1) editar a descricao atualiza a linha sem perder aba nem ordenacao;
 *   (2) reclassificar para outro grupo tira a linha e os cards se refazem pelo DRE relido — nunca por
 *   conta local; (3) so' salvar uma edicao rele, cancelar e falhar nao. E a prova de que a releitura da
 *   celula e' a MESMA que a grade faz no clique: para cada celula clicada, `celulaAtualizada` sobre o
 *   mesmo DRE devolve exatamente a celula que a grade mandou.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ModalValorDre, valorDaPecuaria, celulaAtualizada } from '@/components/agri/RateioDetalheModal';
import { PecDrePanel, colunasDaVisao } from '@/pages/PecDrePanel';
import { salvarERecarregar } from '@/lib/financeiro/salvarERecarregar';
import type {
  DrePecuaria, DrePecLinhas, LancamentoPec, RateioAdmPec, RecortePec,
} from '@/hooks/useDrePecuaria';

const linhas = (o: Partial<DrePecLinhas>): DrePecLinhas => ({
  vendas: 0, outras_receitas: 0, receita_bruta: 0, deducoes: 0, receita_liquida: 0,
  vpb_operacional: 0, reposicao: 0, vbp: 0, custo_variavel: 0, margem: 0,
  custo_fixo: 0, rateio_adm: 0, resultado_operacional: 0, juros: null, resultado_periodo: 0,
  efeito_mercado: 0, resultado_com_mercado: 0, investimento: 0, a_pagar: 0,
  lucro_liquido: 0, juros_proprio: 0, juros_rateado: 0,
  patrimonio: { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 0, cab_fim: 0, cab_media: 0 },
  producao: { ha_medio: null, at_produzida: null, at_desfrutada: null, cab_desfrutada: null, at_comprada: null, cab_comprada: null },
  p0_fonte: 'fechamento', p1_fonte: 'fechamento',
  centros: [], centros_juros: [], ...o,
});

/* ⚠ OS NUMEROS SAO DESIGUAIS DE PROPOSITO: com valores iguais, ler a chave errada daria o mesmo. */
const dreCom = (adm: number, mo: number, rateioAdm: number, rateioMo: number): DrePecuaria => ({
  periodo: { de: '2026-01', ate: '2026-12', p0: '2025-12', meses: 12 },
  rateio_adm: { pool: rateioAdm + rateioMo, bruto: 999999, criterio: 'cabecas medias no periodo' },
  fazendas: [{
    fazenda_id: 'f1', nome: 'Ursa Maior',
    linhas: linhas({
      custo_fixo: adm + mo, custo_variavel: 4321, rateio_adm: rateioAdm + rateioMo,
      patrimonio: { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 0, cab_fim: 0, cab_media: 800 },
      centros: [
        { bloco: 'fixo', centro: 'Administração', valor: adm, a_pagar: 0 },
        { bloco: 'fixo', centro: 'Mão de Obra', valor: mo, a_pagar: 0 },
        { bloco: 'variavel', centro: 'Nutrição', valor: 4321, a_pagar: 0 },
      ],
      rateio_adm_grupos: [{ grupo: 'Administração', valor: rateioAdm }, { grupo: 'Mão de Obra', valor: rateioMo }],
    }),
  }],
  total: linhas({
    custo_fixo: adm + mo, custo_variavel: 4321, rateio_adm: rateioAdm + rateioMo,
    patrimonio: { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 0, cab_fim: 0, cab_media: 800 },
    centros: [
      { bloco: 'fixo', centro: 'Administração', valor: adm, a_pagar: 0 },
      { bloco: 'fixo', centro: 'Mão de Obra', valor: mo, a_pagar: 0 },
      { bloco: 'variavel', centro: 'Nutrição', valor: 4321, a_pagar: 0 },
    ],
    rateio_adm_grupos: [{ grupo: 'Administração', valor: rateioAdm }, { grupo: 'Mão de Obra', valor: rateioMo }],
  }),
});

const lanc = (id: string, descricao: string, valor: number): LancamentoPec => ({
  origem: 'lancamento', id, data: '2026-03-10', pagamento: '2026-03-10', descricao, favorecido: 'Fornecedor',
  valor, status: 'realizado', fazenda: 'Ursa Maior', fazenda_id: 'f1', centro: 'Administração',
  subcentro: 'Administração', bloco: 'fixo', documento: null,
});

const rateioCom = (ls: { id: string; descricao: string; valor: number; grupo: string }[]): RateioAdmPec => ({
  lancamentos: ls.map(l => ({
    id: l.id, data: '2026-03-10', pagamento: '2026-03-10', descricao: l.descricao, favorecido: 'Escritório',
    fazenda: 'Administrativo', status: 'realizado', valor: l.valor, grupo: l.grupo, pct: 50, parte: l.valor / 2,
    origem: 'lancamento' as const,
  })),
  grupos: [...new Set(ls.map(l => l.grupo))].map(g => ({
    grupo: g, bruto: ls.filter(l => l.grupo === g).reduce((a, l) => a + l.valor, 0),
    parte: ls.filter(l => l.grupo === g).reduce((a, l) => a + l.valor / 2, 0),
  })),
});

/* O clique em "Administração" (filha do Custo fixo, coluna Total) com o DRE ANTIGO — a fotografia. */
const recorteAdm = (dre: DrePecuaria): RecortePec => ({
  fazendaId: null, fazendaNome: 'Total', bloco: 'fixo', centro: 'Administração', rotulo: 'Administração',
  de: '2026-01', ate: '2026-12', cenario: 'realizado',
  celula: {
    direto: dre.total.centros.find(c => c.centro === 'Administração')?.valor ?? null,
    rateio: dre.total.rateio_adm_grupos?.find(g => g.grupo === 'Administração')?.valor ?? null,
    grupo: 'Administração', comRateio: true, cabMedia: dre.total.patrimonio.cab_media, meses: 12,
  },
});

const montarModal = (valor: ReturnType<typeof valorDaPecuaria>) => (
  <ModalValorDre aberto onFechar={() => {}} valor={valor} comRateioInicial onAbrirLancamento={() => {}} />
);
const descricoes = () => [...document.querySelectorAll('tbody tr td:nth-child(3) span.truncate')].map(s => s.textContent);
/* A faixa dos tres cards (Direto, Rateio, Total) — "Direto da fazenda" tambem e' o rotulo do segmentado. */
const cartoes = () => document.querySelector('.grid.grid-cols-3')?.textContent ?? '';

describe('o modal de valor depois de salvar um lançamento aberto por ele', () => {
  it('(1) editar a descrição atualiza a linha, sem perder a aba nem a ordenação', () => {
    const antes = dreCom(1000, 5000, 200, 300);
    const rec = recorteAdm(antes);
    const lista = [lanc('a1', 'Contador março', 600), lanc('a2', 'Aluguel escritório', 400)];
    const rat = rateioCom([{ id: 'r1', descricao: 'Pró-labore', valor: 400, grupo: 'Administração' }]);
    const { rerender } = render(montarModal(valorDaPecuaria({ recorte: rec, lancamentos: lista, rateio: rat, dre: antes, periodoRotulo: '2026' })));
    /* A ordem por descrição, escolhida pelo operador antes de abrir o lançamento. */
    fireEvent.click(screen.getByText('Descrição'));
    const ordemAntes = descricoes();
    expect(ordemAntes).toContain('Contador março');
    /* E a aba em que ele estava: a Rateio, aberta antes do salvar. */
    fireEvent.click(screen.getByText('Rateio'));
    expect(screen.getByText(/Mesma conta do DRE/)).toBeTruthy();

    /* O banco devolveu a descrição nova; a página relê e o modal recebe o valor novo. */
    const listaNova = [lanc('a1', 'Contador março (corrigido)', 600), lanc('a2', 'Aluguel escritório', 400)];
    rerender(montarModal(valorDaPecuaria({ recorte: rec, lancamentos: listaNova, rateio: rat, dre: antes, periodoRotulo: '2026' })));
    expect(screen.getByText(/Mesma conta do DRE/)).toBeTruthy();
    fireEvent.click(screen.getByText('Lançamentos'));
    expect(descricoes()).toContain('Contador março (corrigido)');
    expect(descricoes()).not.toContain('Contador março');
    /* A mesma ordenação: a linha editada continua na posição que a descrição nova dá. */
    expect(descricoes()).toEqual(ordemAntes.map(d => (d === 'Contador março' ? 'Contador março (corrigido)' : d)));
  });

  it('(2) reclassificar para outro grupo tira a linha, e os cards vêm do DRE relido — não da foto do clique', () => {
    const antes = dreCom(1000, 5000, 200, 300);
    const rec = recorteAdm(antes);
    const lista = [lanc('a1', 'Contador março', 600), lanc('a2', 'Aluguel escritório', 400)];
    const rat = rateioCom([
      { id: 'r1', descricao: 'Pró-labore', valor: 400, grupo: 'Administração' },
      { id: 'r2', descricao: 'Software', valor: 100, grupo: 'Administração' },
    ]);
    const v1 = valorDaPecuaria({ recorte: rec, lancamentos: lista, rateio: rat, dre: antes, periodoRotulo: '2026' });
    expect(v1.direto).toBe(1000);
    expect(v1.rateio).toBe(200);
    expect(v1.linhas).toHaveLength(4);

    /* a2 (400 direto) foi para Mão de Obra, e r2 (o administrativo) também: o DRE relido já não os
       conta em Administração. O recorte continua sendo o do CLIQUE, com a celula velha. */
    const depois = dreCom(600, 5400, 150, 350);
    const v2 = valorDaPecuaria({
      recorte: rec, lancamentos: [lista[0]],
      rateio: rateioCom([
        { id: 'r1', descricao: 'Pró-labore', valor: 400, grupo: 'Administração' },
        { id: 'r2', descricao: 'Software', valor: 100, grupo: 'Mão de Obra' },
      ]),
      dre: depois, periodoRotulo: '2026',
    });
    expect(v2.direto).toBe(600);
    expect(v2.rateio).toBe(150);
    expect(v2.linhas.map(l => l.descricao)).toEqual(['Contador março', 'Pró-labore']);
    /* ⚠ A BUSCA PROVA QUE SABE ACHAR: sem o DRE relido, a foto do clique continuaria mandando. */
    const semDre = valorDaPecuaria({ recorte: rec, lancamentos: [lista[0]], rateio: rat, dre: null, periodoRotulo: '2026' });
    expect(semDre.direto).toBe(1000);

    render(montarModal(v2));
    expect(cartoes()).toContain('600,00');
    expect(cartoes()).toContain('150,00');
    expect(cartoes()).toContain('750,00');
    expect(cartoes()).not.toContain('1.200,00');
    expect(screen.getByText(/2 lançamentos/)).toBeTruthy();
  });

  it('(3) só salvar uma edição relê — cancelar (não chama o save), falhar e criar não', async () => {
    const ordem: string[] = [];
    const recarregar = vi.fn(async () => { ordem.push('recarregar'); });
    expect(await salvarERecarregar(async () => { ordem.push('salvar'); return true; }, 'id-1', recarregar)).toBe(true);
    expect(ordem).toEqual(['salvar', 'recarregar']);
    recarregar.mockClear();
    expect(await salvarERecarregar(async () => false, 'id-1', recarregar)).toBe(false);
    expect(await salvarERecarregar(async () => true, null, recarregar)).toBe(true);
    expect(recarregar).not.toHaveBeenCalled();
  });

  it('a célula relida é a MESMA que a grade manda no clique — em cada tipo de célula', () => {
    const dre = dreCom(1000, 5000, 200, 300);
    for (const rateioNosGrupos of [false, true]) {
      const onAbrirLista = vi.fn();
      render(<PecDrePanel modo="detalhado" rateioNosGrupos={rateioNosGrupos} onAbrirLista={onAbrirLista}
        colunas={colunasDaVisao({ visao: 'fazenda', de: '2026-01', ate: '2026-12', real: dre, meta: null, carregandoMeta: false, anos: [] })}
        alturaCartao={null} cartaoRef={{ current: null }} />);
      const linha = (rot: string) => [...document.querySelectorAll<HTMLTableRowElement>('tbody tr')]
        .find(tr => (tr.cells[0]?.textContent ?? '').trim().startsWith(rot));
      const abrirGrupo = (rot: string) => { const td = linha(rot)?.cells[0]; if (td) fireEvent.click(td); };
      abrirGrupo('(−) Custo fixo');
      abrirGrupo('(−) Custo variável');
      /* Total e a fazenda, em cada tipo: linha do bloco, filha, rateio administrativo. */
      for (const rot of ['(−) Custo fixo', '(−) Custo variável', 'Administração', 'Mão de Obra', 'Nutrição']) {
        const tr = linha(rot);
        if (tr?.cells[1]) fireEvent.click(tr.cells[1]);
        if (tr?.cells[3]) fireEvent.click(tr.cells[3]);
      }
      if (!rateioNosGrupos) {
        const tr = linha('(−) Rateio administrativo');
        if (tr?.cells[1]) fireEvent.click(tr.cells[1]);
        if (tr?.cells[3]) fireEvent.click(tr.cells[3]);
      }
      const recortes: RecortePec[] = onAbrirLista.mock.calls.map(c => c[0]);
      expect(recortes.length).toBeGreaterThanOrEqual(10);
      for (const r of recortes) expect(celulaAtualizada(r, dre), `${r.rotulo} ${r.fazendaId ?? 'total'}`).toEqual(r.celula);
      cleanup();
    }
  });
});
