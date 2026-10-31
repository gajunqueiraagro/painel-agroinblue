/* PROD-EVOLUCAO-01b — o hook do mês por categoria na bancada: linhas SINTÉTICAS no PIOR caso de largura (a regra do item, Gabriel 30/10 17:16:
 * nenhum número cortado) — as 9 categorias, saldo de 5 dígitos no total, os 8 tipos com movimento, produção de 6 dígitos negativa, GMD negativo,
 * pesos fora (âmbar e vermelho). A conta é a da `montarMesPorCategoria` (testada); aqui só o que ela recebe.
 * `&tipos=3` = só compra, abate e venda (o mês comum); `&aberto=1` = mês sem Fechamento; `&vazio=1` = mês sem linha nenhuma. */
import type { ZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';
import type { CategoriaDoRebanho, LancamentoDoMes } from '@/lib/producao/evolucaoMes';

const q = new URLSearchParams(globalThis.location?.search ?? '');
const POUCOS = q.get('tipos') === '3';
const CATS: CategoriaDoRebanho[] = [
  ['mamotes_m', 'Mamotes M'], ['desmama_m', 'Desmama M'], ['garrotes', 'Garrotes'], ['bois', 'Bois'], ['touros', 'Touros'],
  ['mamotes_f', 'Mamotes F'], ['desmama_f', 'Desmama F'], ['novilhas', 'Novilhas'], ['vacas', 'Vacas'],
].map(([codigo, nome], i) => ({ codigo, nome, ordem_exibicao: i + 1 }));

/* [código, saldo inicial, kg/cab inicial, kg/cab final] — o total passa de 19 mil cabeças */
const BASE: [string, number, number, number][] = [
  ['mamotes_m', 1_987, 98.4, 121.7], ['desmama_m', 2_345, 188.1, 211.7], ['garrotes', 3_388, 330.2, 355.9], ['bois', 4_344, 488.6, 501.1], ['touros', 213, 610.3, 615.4],
  ['mamotes_f', 1_909, 95.2, 117.8], ['desmama_f', 1_876, 180.4, 199.6], ['novilhas', 1_543, 305.5, 322.0], ['vacas', 2_235, 440.1, 450.0],
];
const mov = (cab: number, kg: number, so3 = false) => (POUCOS && !so3 ? [0, 0] : [cab, cab * kg]);

const linha = (mes: number, [codigo, si, kgI, kgF]: [string, number, number, number], i: number): ZootCategoriaMensal => {
  const nasc = mov(codigo.startsWith('mamotes') ? 1_234 : 0, 32);
  const compra = mov(i % 2 ? 1_111 : 0, 257.4, true);
  const tEnt = mov(codigo === 'garrotes' ? 345 : 0, 310);
  const abate = mov(codigo === 'bois' || codigo === 'vacas' ? 1_052 : 0, 547, true);
  const venda = mov(codigo === 'bois' ? 1_140 : codigo === 'novilhas' ? 99 : 0, 424.5, true);
  const consumo = mov(codigo === 'bois' ? 12 : 0, 480);
  const morte = mov(i === 1 ? 87 : 3, 170);
  const tSai = mov(codigo === 'garrotes' ? 345 : 0, 310);
  const entrou = codigo === 'bois' ? 1_321 : codigo === 'garrotes' ? 1_100 : 0;
  const saiu = codigo === 'garrotes' ? 1_321 : codigo === 'desmama_m' ? 1_100 : 0;
  const sf = si + nasc[0] + compra[0] + tEnt[0] - abate[0] - venda[0] - consumo[0] - morte[0] - tSai[0] + entrou - saiu;
  const pb = codigo === 'bois' ? -148_765 : 98_765;
  return {
    fazenda_id: 'f1', cliente_id: 'c1', ano: 2026, mes, cenario: 'realizado', ano_mes: `2026-${String(mes).padStart(2, '0')}`,
    categoria_id: codigo, categoria_codigo: codigo, categoria_nome: codigo, ordem_exibicao: i + 1,
    saldo_inicial: si, entradas_externas: nasc[0] + compra[0] + tEnt[0], saidas_externas: abate[0] + venda[0] + consumo[0] + morte[0] + tSai[0],
    evol_cat_entrada: entrou, evol_cat_saida: saiu, saldo_final: sf, saldo_sistema: sf, saldo_p1: sf,
    peso_total_inicial: si * kgI, peso_total_final: sf * kgF, peso_medio_inicial: kgI, peso_medio_final: kgF,
    peso_entradas_externas: 0, peso_saidas_externas: 0, peso_evol_cat_entrada: entrou * 390.2, peso_evol_cat_saida: saiu * 390.2,
    dias_mes: 30, gmd: null, producao_biologica: pb,
    cab_nascimento: nasc[0], cab_compra: compra[0], cab_transf_entrada: tEnt[0], cab_abate: abate[0], cab_venda: venda[0], cab_transf_saida: tSai[0],
    cab_consumo: consumo[0], cab_morte: morte[0],
    peso_nascimento: nasc[1], peso_compra: compra[1], peso_transf_entrada: tEnt[1], peso_abate: abate[1], peso_venda: venda[1], peso_transf_saida: tSai[1],
    peso_consumo: consumo[1], peso_morte: morte[1],
    fonte_oficial_mes: q.get('aberto') === '1' ? 'parcial' : 'fechamento',
  };
};

const TIPOS = ['compra', 'abate', 'venda', 'morte', 'reclassificacao', 'nascimento', 'consumo'];
const LANCS: LancamentoDoMes[] = Array.from({ length: 31 }, (_, i) => ({
  id: `l${i}`, data: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`, tipo: TIPOS[i % TIPOS.length],
  categoria: CATS[i % 9].codigo, categoria_destino: TIPOS[i % TIPOS.length] === 'reclassificacao' ? CATS[(i + 1) % 9].codigo : null,
  quantidade: i === 0 ? 1_234 : 7 + i * 3, peso_medio_kg: i === 3 ? null : i === 5 ? 5_000 : 100 + (i * 37) % 520, // i=5: o peso digitado errado (>999%)
}));

export function useEvolucaoDoMes(_ano: number, mes: number, _cenario: 'realizado' | 'meta') {
  const vazio = q.get('vazio') === '1';
  return {
    rowsDoMes: vazio ? [] : BASE.map((b, i) => linha(mes, b, i)),
    rowsDoMesAnterior: vazio ? [] : BASE.map((b, i) => linha(mes - 1, b, i)),
    categorias: CATS, fechado: q.get('aberto') !== '1', ultimoFechado: 9, isGlobal: true,
    lancamentos: vazio ? [] : LANCS, erroLancamentos: null, carregando: false,
  };
}
