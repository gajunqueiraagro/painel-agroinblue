/**
 * AS RAZÕES DO DRE DA PECUÁRIA POR ANO — DRE-CASCATA-MODAL-01 (mock `docs/mocks/dre_cascata_modal_leitura_mock_v5.html`).
 *
 * ⚠ UMA FUNÇÃO PARA A CASCATA E PARA A "LEITURA DOS ANOS". O R$/@ do desfrute, o da reposição e o
 * ágio moravam no corpo da `PecCascataView`; foram EXTRAÍDOS para cá sem mudar uma vírgula (a prova
 * é a cascata mostrar os mesmos números antes e depois), e a leitura dos anos lê os mesmos. Duas
 * cópias discordariam no primeiro arredondamento — foi o que a PATRIMONIO-TOTAL-01 ensinou.
 *
 * ⚠ NENHUMA CHAVE NOVA É INVENTADA AQUI: tudo é divisão de números que a RPC já devolveu.
 *   Preço médio de venda (R$/@)  vendas ÷ @ desfrutadas em @ VIVA (decisão 2 do Gabriel: a definição
 *                                 que a cascata já usava — toda a receita de vendas)
 *   Custeio de produção          custo variável + custo fixo + rateio administrativo — o MESMO
 *                                 `compor` do "(−) Custeio de produção" do Resumido (decisão 1)
 *   Custo por @ produzida        custeio ÷ `at_produzida`
 *   Margem por @                 preço médio de venda − custo por @ produzida (nasce aqui)
 *
 * ⚠ AUSÊNCIA É TRAÇO, NUNCA ZERO: cada razão devolve `null` quando falta o numerador ou o
 * denominador. O RRCC de 2021 não tem cache (CACHE-RRCC-2021-01): `at_produzida` vem nulo, e o custo
 * por @ e a margem saem em "—" — não em zero, que afirmaria custo nenhum.
 */
import { kgToArrobas } from '@/types/cattle';
import { LINHAS_PEC_RESUMIDO_GRADE, somaComposta, valorDe } from '@/components/agri/drePecRegua';
import type { DrePecLinhas, MovimentosPec, ParcelaMov } from '@/hooks/useDrePecuaria';

/** Uma divisão que não inventa número: sem os dois termos, ou com denominador zero, é ausência. */
export const razao = (num: number | null | undefined, den: number | null | undefined): number | null =>
  (num == null || den == null || den === 0 ? null : num / den);

/** A variação de um ano contra o anterior, em fração (0,098 = +9,8 %). Sem base, ausência. */
export const variacaoNoAno = (atual: number | null, anterior: number | null): number | null =>
  (atual == null || anterior == null || anterior === 0 ? null : (atual - anterior) / Math.abs(anterior));

/* ⚠ O CUSTEIO É O DO RESUMIDO, lido da def e não redigitado: se a composição mudar lá, muda aqui. */
const COMPOR_CUSTEIO = LINHAS_PEC_RESUMIDO_GRADE.find(d => d.id === 'custeio')?.compor ?? null;

export interface IndicadoresAno {
  /* Rebanho */
  cabIni: number | null; cabFim: number | null; varCab: number | null;
  vpb: number | null; efeito: number | null;
  /* Desfrute */
  cabDesf: number | null; pctDesf: number | null;
  /** @ desfrutadas em @ VIVA — a `at_desfrutada` da RPC está em @ de carcaça. */
  atDesf: number | null;
  receitaDesf: number | null;
  pkDesf: number | null;
  /* Reposição */
  cabComp: number | null; atComp: number | null; rsComp: number | null;
  pkComp: number | null; agio: number | null;
  /* Produção e custo */
  custeio: number | null; atProd: number | null; custoAt: number | null;
  /* Margem */
  margemAt: number | null; margemPct: number | null;
  lucroOp: number | null;
}

export function indicadoresDoAno(l: DrePecLinhas | null | undefined): IndicadoresAno {
  const prod = l?.producao ?? null;

  /* ─── o bloco extraído da PecCascataView, sem mudança de conta ─── */
  /* ⚠ O DESFRUTE DO DRE VEM EM @ DE CARCAÇA (÷15, com rendimento 50% presumido nas vendas em pé) e
     o estoque em @ VIVA (÷30). Com 50% exatos os dois números coincidem; o que difere é o ABATE,
     onde o peso de carcaça é medido. Converter é dividir pelo rendimento e reconverter — o mesmo
     caminho do fix3. */
  const atDesf = prod?.at_desfrutada == null ? null : kgToArrobas(prod.at_desfrutada * 15 / 0.5);
  const atComp = prod?.at_comprada ?? null;
  const cabDesf = prod?.cab_desfrutada ?? null;
  const cabComp = prod?.cab_comprada ?? null;
  const rsDesf = l?.vendas ?? null;
  const rsComp = l?.reposicao ?? null;
  const pkDesf = atDesf && atDesf !== 0 && rsDesf != null ? rsDesf / atDesf : null;
  /* ⚠ REPOSIÇÃO ZERO COM COMPRA REAL DÁ TRAÇO, NÃO ZERO — REPOSICAO-SEM-CUSTO-01. Medido: o SR
     comprou 6 cabeças em 2021 e o DRE não tem lançamento de reposição nenhum. Um R$/@ de zero
     faria o ágio sair em −100 % em toda a tela, afirmando um prejuízo que não foi medido. */
  const pkComp = atComp && atComp !== 0 && rsComp != null && rsComp !== 0 ? rsComp / atComp : null;
  const agio = pkComp == null || pkDesf == null || pkDesf === 0 ? null : pkComp / pkDesf - 1;
  /* ─── fim do bloco extraído ─── */

  const cabIni = l ? l.patrimonio.cab_ini : null;
  const cabFim = l ? l.patrimonio.cab_fim : null;
  const custeio = l && COMPOR_CUSTEIO ? somaComposta(COMPOR_CUSTEIO, k => valorDe(l, k)) : null;
  const atProd = prod?.at_produzida ?? null;
  /* ⚠ PRODUÇÃO QUE NÃO É POSITIVA NÃO TEM CUSTO POR ARROBA: dividir o custeio por arrobas negativas
     daria um custo negativo, que não é preço de coisa nenhuma. Traço. */
  const custoAt = custeio != null && atProd != null && atProd > 0 ? custeio / atProd : null;
  const margemAt = pkDesf != null && custoAt != null ? pkDesf - custoAt : null;

  return {
    cabIni, cabFim, varCab: cabIni == null || cabFim == null ? null : cabFim - cabIni,
    vpb: l?.vpb_operacional ?? null, efeito: l?.efeito_mercado ?? null,
    cabDesf, pctDesf: cabIni != null && cabIni > 0 ? razao(cabDesf, cabIni) : null,
    atDesf, receitaDesf: rsDesf, pkDesf,
    cabComp, atComp, rsComp, pkComp, agio,
    custeio, atProd, custoAt,
    margemAt, margemPct: pkDesf != null && pkDesf > 0 ? razao(margemAt, pkDesf) : null,
    lucroOp: l?.resultado_operacional ?? null,
  };
}

/**
 * O PERÍODO DA COLUNA É PARCIAL? — "8 meses".
 *
 * ⚠ É PELO NÚMERO DE MESES DA PRÓPRIA COLUNA (`periodo.meses` da RPC), não pela data de hoje: com
 * "Ano 2026" o seletor corta em jan–ago e os anos anteriores da comparação são os MESMOS oito meses —
 * todos marcados, porque todos são valores de oito meses. Um ano cheio (safra, jan–dez) não leva marca.
 */
export const ehParcial = (meses: number) => meses > 0 && meses < 12;

/* ══════════════ A PONTE DO REBANHO ══════════════ */

export type UnidadePonte = 'at' | 'cab';

export interface PassoPonte {
  chave: string;
  rotulo: string;
  /** Com sinal: entra positivo, sai negativo; as pontas são o estoque. `null` = ausência ("—"). */
  valor: number | null;
  tipo: 'ponta' | 'entra' | 'sai' | 'dif';
  cor: string;
}

type ChavePonte = 'inicio' | 'producao' | 'nascimentos' | 'compras' | 'transf' | 'desfrute' | 'mortes' | 'dif' | 'fim';
export const COR_PONTE: Readonly<Record<ChavePonte, string>> = {
  inicio: '#94a3b8', producao: '#15803d', nascimentos: '#65a30d', compras: '#1D3A5D',
  transf: '#64748b', desfrute: '#c2410c', mortes: '#b91c1c', dif: '#9ca3af', fim: '#475569',
};

/**
 * OS PASSOS DA PONTE DE UM ANO, na unidade escolhida.
 *
 * ⚠ A DIFERENÇA É O `movimentos.ajustes` DA RPC E APARECE SEMPRE QUE NÃO É ZERO — decisão 5, nunca
 * escondida. É ela que fecha a identidade: início + entradas − saídas + diferença = fim, exato.
 * ⚠ PRODUÇÃO SÓ EXISTE EM ARROBAS: ganho de peso não move cabeça. Em cabeças o passo não é montado.
 * ⚠ E ELA SAI EM TRAÇO QUANDO O DRE NÃO TEM `at_produzida` (cache ausente — CACHE-RRCC-2021-01):
 * a RPC da ponte devolve zero ali e joga a produção inteira na diferença; mostrar "0" afirmaria que
 * não houve produção.
 * ⚠ TRANSFERÊNCIA SÓ ENTRA COM LÍQUIDO DIFERENTE DE ZERO — no Global elas se anulam, e a regra é a
 * de `montarPassos` (PecPonteAbas).
 */
export function passosDaPonte(m: MovimentosPec | null, unidade: UnidadePonte, temProducao: boolean): PassoPonte[] {
  if (!m) return [];
  const v = (p: ParcelaMov) => (unidade === 'at' ? p.arrobas : p.cabecas);
  const transf = v(m.transf_entrada) - v(m.transf_saida);
  const dif = v(m.ajustes);
  const passos: PassoPonte[] = [
    { chave: 'inicio', rotulo: 'Estoque inicial', valor: v(m.inicio), tipo: 'ponta', cor: COR_PONTE.inicio },
  ];
  if (unidade === 'at') {
    passos.push({ chave: 'producao', rotulo: 'Produção', valor: temProducao ? v(m.produzidas) : null,
      tipo: 'entra', cor: COR_PONTE.producao });
  }
  passos.push(
    { chave: 'nascimentos', rotulo: 'Nascimentos', valor: v(m.nascimentos), tipo: 'entra', cor: COR_PONTE.nascimentos },
    { chave: 'compras', rotulo: 'Compras (reposição)', valor: v(m.compradas), tipo: 'entra', cor: COR_PONTE.compras },
  );
  if (transf !== 0) {
    passos.push({ chave: 'transf', rotulo: 'Transferências (líquido)', valor: transf,
      tipo: transf > 0 ? 'entra' : 'sai', cor: COR_PONTE.transf });
  }
  passos.push(
    { chave: 'desfrute', rotulo: 'Desfrute (vendas e abates)', valor: -v(m.vendas_abates), tipo: 'sai', cor: COR_PONTE.desfrute },
    { chave: 'mortes', rotulo: 'Mortes', valor: -v(m.mortes), tipo: 'sai', cor: COR_PONTE.mortes },
  );
  if (dif !== 0) {
    passos.push({ chave: 'dif', rotulo: 'Diferença', valor: dif, tipo: 'dif', cor: COR_PONTE.dif });
  }
  passos.push({ chave: 'fim', rotulo: 'Estoque final', valor: v(m.fim), tipo: 'ponta', cor: COR_PONTE.fim });
  return passos;
}

/**
 * A PONTE POSICIONADA — de onde a onde cada barra vai, para o SVG só desenhar.
 *
 * ⚠ A MESMA LEI DA CASCATA: ponta sai do ZERO, passo flutua do acumulado, e o acumulado depois do
 * último passo tem de ser o estoque final. O `fecha` diz se fechou — com a diferença dentro, fecha
 * por construção, e o teste cobra isso.
 */
export function posicionarPonte(passos: readonly PassoPonte[]) {
  let acc = 0;
  const barras = passos.map(p => {
    if (p.tipo === 'ponta') {
      acc = p.valor ?? 0;
      return { ...p, de: Math.min(0, acc), ate: Math.max(0, acc), acc };
    }
    const de = acc;
    acc += p.valor ?? 0;
    return { ...p, de: Math.min(de, acc), ate: Math.max(de, acc), acc };
  });
  const fim = passos.length ? passos[passos.length - 1] : null;
  const antesDoFim = passos.slice(0, -1).reduce((a, p) => (p.tipo === 'ponta' ? (p.valor ?? 0) : a + (p.valor ?? 0)), 0);
  return { barras, fecha: fim?.valor != null && Math.abs(antesDoFim - fim.valor) < 0.011 };
}

/* ══════════════ O DESFRUTE POR TIPO ══════════════ */

/** Os subcentros da "Venda Geral" que aparecem SÓ em R$ — decisão 7: não têm arroba própria. */
export const SUBCENTROS_SO_RS: ReadonlyArray<{ subcentro: string; rotulo: string }> = [
  { subcentro: 'Venda de Tropa', rotulo: 'Venda de tropa' },
  { subcentro: 'Consumo Interno e Doações', rotulo: 'Consumo interno e doações' },
  { subcentro: 'Ganho com Mercado Futuro', rotulo: 'Ganho com mercado futuro (hedge)' },
];

/** O R$ de um grupo de centros do bloco venda da coluna — `Abates` (1010, 1020) ou `Venda Peso Vivo` (1110-1155). */
export function rsDoCentroDeVenda(l: DrePecLinhas | null | undefined, centro: string): number | null {
  if (!l) return null;
  const achados = l.centros.filter(c => c.bloco === 'venda' && c.centro === centro);
  return achados.length === 0 ? 0 : achados.reduce((s, c) => s + c.valor, 0);
}
