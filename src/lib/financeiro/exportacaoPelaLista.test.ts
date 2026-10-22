/**
 * FIN-V2-LISTA-FLAG-01 (parte 3) — a exportacao pela MESMA RPC da tela, e o lancamento dividido pela parte.
 *   X1 le todas as paginas ate' o total (ids unicos, na ordem da tela)
 *   X2 falha FECHADA: total que muda, id repetido, acima do teto (antes da 2a pagina), resposta torta
 *   X3 Selluz (NF 3.241, R$ 9.583,00): filtrado por Manutencao -> 1 linha de 1.055,00 com a classificacao da parte, total 9.583,00 e
 *      "1 de 2 contas"; sem filtro -> 1 linha de 9.583,00, "dividido em 2 contas"; 2 de 3 casando -> 2 linhas; sem divisao = igual
 */
import { describe, it, expect } from 'vitest';
import { lerListaInteira, abrirDivididasParaExportar, type PedirPaginaDaLista } from './exportacaoPelaLista';
import { ErroConjuntoIncompleto, ErroConjuntoObsoleto } from './listaPaginadaV2';
import type { LancamentoV2 } from '@/hooks/useFinanceiroV2';

const linha = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, cliente_id: 'c', valor: 100, sinal: '-1', subcentro: 'Sal', ...extra }) as unknown as LancamentoV2;
const paginador = (todas: LancamentoV2[], total = todas.length, mexer?: (p: number) => Partial<{ total: number; linhas: LancamentoV2[] }>) => {
  const pedidos: number[] = [];
  const pedir: PedirPaginaDaLista = async (pagina, por) => {
    pedidos.push(pagina);
    const m = mexer?.(pagina) ?? {};
    return { total_linhas: m.total ?? total, linhas: m.linhas ?? todas.slice(pagina * por, (pagina + 1) * por) };
  };
  return { pedir, pedidos };
};

describe('FIN-V2-LISTA-FLAG-01 — exportacao pela RPC da tela', () => {
  it('X1 le todas as paginas ate o total', async () => {
    const todas = Array.from({ length: 25 }, (_, i) => linha(`l${i}`));
    const { pedir, pedidos } = paginador(todas);
    const r = await lerListaInteira(pedir, { porPagina: 10 });
    expect(r.map(l => l.id)).toEqual(todas.map(l => l.id));
    expect(pedidos).toEqual([0, 1, 2]);
  });

  it('X0 o lote padrao respeita o teto da RPC (1..500 por pagina)', async () => {
    const pedidos: number[] = [];
    await lerListaInteira(async (_p, por) => { pedidos.push(por); return { total_linhas: 1, linhas: [linha('a')] }; });
    expect(pedidos).toEqual([500]);
  });

  it('X2 falha fechada', async () => {
    const todas = Array.from({ length: 25 }, (_, i) => linha(`l${i}`));
    await expect(lerListaInteira(paginador(todas, 25, p => (p === 1 ? { total: 26 } : {})).pedir, { porPagina: 10 }))
      .rejects.toBeInstanceOf(ErroConjuntoObsoleto);
    await expect(lerListaInteira(paginador(todas, 25, p => (p === 1 ? { linhas: todas.slice(0, 10) } : {})).pedir, { porPagina: 10 }))
      .rejects.toBeInstanceOf(ErroConjuntoObsoleto);
    const grande = paginador(todas, 999);
    await expect(lerListaInteira(grande.pedir, { porPagina: 10, teto: 500 })).rejects.toBeInstanceOf(ErroConjuntoIncompleto);
    expect(grande.pedidos).toEqual([0]);
    await expect(lerListaInteira(async () => ({ linhas: 'x' }))).rejects.toThrow('Não foi possível ler a lista');
  });

  it('X3 o dividido sai pela parte', () => {
    const manut = { ordem: 2, valor: 1055, macro_custo: 'Custeio Produção', grupo_custo: 'Custo Fixo Pecuária', centro_custo: 'Manutenção Fazenda',
      subcentro: 'Manutenção de Instalações Pecuária', escopo_negocio: 'pecuaria', safra_id: null };
    const inv = { ...manut, ordem: 1, valor: 8528, macro_custo: 'Investimento na Fazenda', subcentro: 'Investimento em Instalações Pecuária' };
    const selluz = (casadas: number, partes: unknown[]) => linha('selluz', { valor: 9583, subcentro: 'Investimento em Instalações Pecuária',
      valor_parte: partes.reduce((s: number, p) => s + Number((p as { valor: number }).valor), 0), partes_total: 2, partes_casadas: casadas, partes });

    const [f] = abrirDivididasParaExportar([selluz(1, [manut])]);
    expect(f).toMatchObject({ id: 'selluz', valor: 1055, subcentro: 'Manutenção de Instalações Pecuária', macro_custo: 'Custeio Produção',
      total_lancamento: 9583, divisao: '1 de 2 contas' });

    const sem = abrirDivididasParaExportar([selluz(2, [inv, manut])]);
    expect(sem).toHaveLength(1);
    expect(sem[0]).toMatchObject({ valor: 9583, total_lancamento: null, divisao: 'dividido em 2 contas' });

    const tres = linha('t', { valor: -300, partes_total: 3, partes_casadas: 2, partes: [{ ...manut, valor: 100 }, { ...inv, valor: 50 }] });
    expect(abrirDivididasParaExportar([tres]).map(l => [l.valor, l.subcentro])).toEqual([[-100, manut.subcentro], [-50, inv.subcentro]]);

    const normal = linha('n');
    expect(abrirDivididasParaExportar([normal])).toEqual([normal]);
  });
});
