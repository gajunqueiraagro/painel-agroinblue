/**
 * PATR-01 · PR B — o núcleo PURO da tela Cadastros › Patrimônio (nada de React, nada de banco).
 *
 * ⚠ NENHUM NÚMERO NASCE AQUI. Aquisição, depreciação acumulada, contábil e mercado vêm prontos da `fn_patrimonio_lista`; a série
 * vem da `fn_patrimonio_depreciacao`. Esta lib só FORMATA, ORDENA, FILTRA e SOMA o que a tela mostra (o rodapé e os cartões somam
 * as linhas que o banco devolveu). A única conta própria é a DIVISÃO do custo da pastagem pela área de cada pasto (decisão 7 do
 * briefing: "o custo se divide pela área") — exibição, nunca gravada.
 * ⚠ "—" é dado ausente (sem mercado, sem vida útil); zero é zero (CLAUDE.md, sentinelas de dado).
 */
import type { ColunaOrdenavel } from '@/hooks/useOrdenacaoTabela';
import { casaNaBusca } from '@/lib/texto/busca';

export type SituacaoBem = 'em_formacao' | 'em_uso' | 'baixado';
export type AtividadeBem = 'pecuaria' | 'lavoura' | 'compartilhado';
export type OrigemValor = 'lancamentos' | 'sem_lancamento' | 'estimativa';

/** Uma linha da `fn_patrimonio_lista` (o nome das colunas é o do banco). */
export interface BemDaLista {
  bem_id: string;
  fazenda_id: string;
  fazenda_codigo: string | null;
  categoria_id: string;
  categoria_codigo: string;
  categoria_nome: string;
  deprecia: boolean;
  tem_mercado: boolean;
  tem_pastos: boolean;
  descricao: string;
  marca: string | null;
  modelo: string | null;
  identificacao: string | null;
  situacao: SituacaoBem;
  em_uso_desde: string | null;
  baixado_em: string | null;
  atividade: AtividadeBem;
  origem_valor: OrigemValor;
  valor_extra: number;
  valor_lancamentos: number;
  aquisicao: number;
  a_realizar: number;
  n_lancamentos: number;
  n_a_realizar: number;
  n_a_conferir: number;
  n_selo: number;
  n_repetidas: number;
  primeira_data: string | null;
  vida_util_meses: number | null;
  residual_pct: number | null;
  depreciacao_acumulada: number;
  depreciacao_no_ano: number;
  valor_contabil: number;
  mercado_valor: number | null;
  mercado_data: string | null;
  mercado_base: string | null;
  area_pastos_ha: number | null;
  versao: number;
}

/** Uma categoria (`patrimonio_categorias`). */
export interface CategoriaBem {
  id: string;
  cliente_id: string | null;
  codigo: string;
  nome: string;
  vida_util_anos: number | null;
  residual_pct: number;
  deprecia: boolean;
  tem_mercado: boolean;
  base_mercado: 'terra' | 'bem' | null;
  tem_pastos: boolean;
  ordem: number;
  ativo: boolean;
}

/* ── FORMATOS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** 2 casas pt-BR, sem "R$" (a coluna e o cartão já dizem que é dinheiro). */
export const n2 = (v: number): string => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "R$ 1.234,56" */
export const brl = (v: number): string => `R$ ${n2(v)}`;
/** ISO "2026-10-31" → "31/10/2026"; vazio → "—". */
export const dataBR = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};
/** ISO → "10/2026" (o mês do "em uso desde", o início da depreciação). */
export const mesBR = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const [a, m] = iso.slice(0, 10).split('-');
  return `${m}/${a}`;
};

/** O NOME CURTO da categoria NA TABELA (regra do Gabriel, 31/10: a coluna Categoria não corta com "…" a 1170 px); o nome completo
 *  fica no modal e no `title`. Pelos 13 códigos do cadastro global (conferidos no proto). Categoria do cliente (código fora do mapa)
 *  mostra o nome dela. Se a casa quiser o nome curto no banco (`nome_curto` em `patrimonio_categorias`), entra no PR B2. */
export const NOME_CURTO_CATEGORIA: Readonly<Record<string, string>> = {
  maquinas: 'Máquinas', implementos: 'Implementos', veiculos: 'Veículos', equipamentos_informatica: 'Informática', benfeitorias: 'Benfeitorias',
  instalacoes: 'Instalações', rede_agua: 'Rede de água', cercas: 'Cercas', estradas_aceiros: 'Estradas', pastagens: 'Pastagens',
  formacao_area: 'Formação de área', correcao_solo: 'Correção de solo', terra: 'Terra',
};
export const nomeCurtoDaCategoria = (b: Pick<BemDaLista, 'categoria_codigo' | 'categoria_nome'>): string =>
  NOME_CURTO_CATEGORIA[b.categoria_codigo] ?? b.categoria_nome;

export const ROTULO_SITUACAO: Record<SituacaoBem, string> = { em_formacao: 'em formação', em_uso: 'em uso', baixado: 'baixado' };
export const ROTULO_ATIVIDADE: Record<AtividadeBem, string> = { pecuaria: 'Pecuária', lavoura: 'Lavoura', compartilhado: 'Compartilhado' };

/** A vida útil na coluna: "10 a" (meses múltiplos de 12) ou "18 m"; sem vida (terra) "—". */
export function rotuloVida(meses: number | null): string {
  if (meses == null) return '—';
  return meses % 12 === 0 ? `${meses / 12} a` : `${meses} m`;
}

/** O que a coluna "Depreciado" escreve quando NÃO há número: terra "não deprecia", em formação "começa no uso". */
export function rotuloSemDepreciacao(b: Pick<BemDaLista, 'deprecia' | 'situacao'>): string | null {
  if (!b.deprecia) return 'não deprecia';
  if (b.situacao === 'em_formacao') return 'começa no uso';
  return null;
}

/** A coluna "Origem": "3 lanç.", "sem lançamento", "estimativa" (a do valor sem lançamento vem junto quando há os dois). */
export function rotuloOrigem(b: Pick<BemDaLista, 'n_lancamentos' | 'origem_valor'>): string {
  const extra = b.origem_valor === 'sem_lancamento' ? 'sem lançamento' : b.origem_valor === 'estimativa' ? 'estimativa' : null;
  if (b.n_lancamentos > 0) return extra ? `${b.n_lancamentos} lanç. + ${extra === 'sem lançamento' ? 'valor' : extra}` : `${b.n_lancamentos} lanç.`;
  return extra ?? 'sem lançamento';
}

/** A data da linha: a do primeiro lançamento ligado; sem lançamento, o "em uso desde". */
export const dataDoBem = (b: Pick<BemDaLista, 'primeira_data' | 'em_uso_desde'>): string | null => b.primeira_data ?? b.em_uso_desde;

/* ── A LISTA ──────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

export type ColunaBem = 'data' | 'bem' | 'categoria' | 'fazenda' | 'situacao' | 'vida' | 'aquisicao' | 'depreciado' | 'contabil' | 'mercado' | 'origem';

/** As colunas ordenáveis — TODA coluna ordena (regra do briefing). Ausência vai para o fim (`ordenarPorColuna`). */
export const COLUNAS_ORDENAVEIS: ReadonlyArray<ColunaOrdenavel<BemDaLista, ColunaBem>> = [
  { coluna: 'data', tipo: 'data', valor: b => dataDoBem(b) },
  { coluna: 'bem', tipo: 'texto', valor: b => b.descricao },
  { coluna: 'categoria', tipo: 'texto', valor: b => nomeCurtoDaCategoria(b) },
  { coluna: 'fazenda', tipo: 'texto', valor: b => b.fazenda_codigo },
  { coluna: 'situacao', tipo: 'texto', valor: b => ROTULO_SITUACAO[b.situacao] },
  { coluna: 'vida', tipo: 'numero', valor: b => b.vida_util_meses },
  { coluna: 'aquisicao', tipo: 'numero', valor: b => b.aquisicao },
  { coluna: 'depreciado', tipo: 'numero', valor: b => (rotuloSemDepreciacao(b) ? null : b.depreciacao_acumulada) },
  { coluna: 'contabil', tipo: 'numero', valor: b => b.valor_contabil },
  { coluna: 'mercado', tipo: 'numero', valor: b => b.mercado_valor },
  { coluna: 'origem', tipo: 'numero', valor: b => b.n_lancamentos },
];

/** O filtro da lista: o chip da categoria (código; vazio = todas) e a busca (descrição, marca, modelo, placa/série). */
export function filtrarBens(bens: readonly BemDaLista[], categoria: string, busca: string): BemDaLista[] {
  return bens.filter(b => (!categoria || b.categoria_codigo === categoria)
    && (!busca.trim() || [b.descricao, b.marca, b.modelo, b.identificacao, b.categoria_nome, b.fazenda_codigo].some(t => casaNaBusca(t, busca))));
}

export interface TotaisDaLista { n: number; aquisicao: number; depreciado: number; contabil: number; mercado: number; noAno: number }

/** O rodapé e os cartões: a soma das linhas mostradas. Mercado sem avaliação entra pelo CONTÁBIL (o mock: `mk ?? vc`) — o cartão
 *  "Valor de mercado" é a melhor estimativa do conjunto, não a soma só dos avaliados. */
export function totaisDaLista(bens: readonly BemDaLista[]): TotaisDaLista {
  return bens.reduce<TotaisDaLista>((t, b) => ({
    n: t.n + 1,
    aquisicao: t.aquisicao + b.aquisicao,
    depreciado: t.depreciado + b.depreciacao_acumulada,
    contabil: t.contabil + b.valor_contabil,
    mercado: t.mercado + (b.mercado_valor ?? b.valor_contabil),
    noAno: t.noAno + b.depreciacao_no_ano,
  }), { n: 0, aquisicao: 0, depreciado: 0, contabil: 0, mercado: 0, noAno: 0 });
}

/** Os chips de categoria: as que existem no cadastro (cliente vence global pelo código), na ordem do cadastro. */
export function chipsDeCategoria(categorias: readonly CategoriaBem[]): Array<{ codigo: string; nome: string }> {
  const porCodigo = new Map<string, CategoriaBem>();
  for (const c of [...categorias].sort((a, b) => a.ordem - b.ordem)) {
    if (!c.ativo) continue;
    const atual = porCodigo.get(c.codigo);
    if (!atual || (c.cliente_id && !atual.cliente_id)) porCodigo.set(c.codigo, c);
  }
  return [...porCodigo.values()].sort((a, b) => a.ordem - b.ordem).map(c => ({ codigo: c.codigo, nome: c.nome }));
}

/* ── O MODAL ──────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

export type AbaBem = 'dados' | 'lancamentos' | 'pastos' | 'depreciacao' | 'mercado' | 'documentos';

/** As SEIS abas, SEMPRE no mesmo lugar; a que não vale para a categoria fica APAGADA com o motivo (nunca some). Bem novo: Dados e
 *  Lançamentos (o valor sem lançamento se informa já na criação e grava junto, num passo — Gabriel 30/10); as outras precisam do bem
 *  gravado. */
export function abasDoBem(categoria: Pick<CategoriaBem, 'deprecia' | 'tem_mercado' | 'tem_pastos'> | null, salvo: boolean)
  : Array<{ aba: AbaBem; rotulo: string; apagada: boolean; motivo?: string }> {
  const salveAntes = 'salve o bem antes';
  const def = (aba: AbaBem, rotulo: string, motivoDaCategoria?: string) => {
    const motivo = !salvo && aba !== 'dados' && aba !== 'lancamentos' ? salveAntes : motivoDaCategoria;
    return { aba, rotulo, apagada: motivo != null, motivo };
  };
  return [
    def('dados', 'Dados'),
    def('lancamentos', 'Lançamentos'),
    def('pastos', 'Pastos', categoria && !categoria.tem_pastos ? 'só para pastagem' : undefined),
    def('depreciacao', 'Depreciação', categoria && !categoria.deprecia ? 'esta categoria não deprecia' : undefined),
    def('mercado', 'Valor de mercado', categoria && !categoria.tem_mercado ? 'sem valor de mercado próprio' : undefined),
    def('documentos', 'Documentos'),
  ];
}

export interface PastoDoBem { pasto_id: string; nome: string; fazenda_codigo: string | null; area_ha: number }

/** O custo de cada pasto pela área (decisão 7): custo = aquisição × área ÷ área total; R$/ha = aquisição ÷ área total; o contábil
 *  de hoje segue a mesma proporção. Os centavos que o arredondamento sobra vão para o último pasto (a soma fecha com a aquisição). */
export function custoPorPasto(pastos: readonly PastoDoBem[], aquisicao: number, contabil: number) {
  const total = pastos.reduce((t, p) => t + p.area_ha, 0);
  if (total <= 0) return { linhas: pastos.map(p => ({ ...p, pct: 0, custo: 0, contabil: 0 })), areaTotal: 0, porHa: null as number | null };
  const r2 = (v: number) => Math.round(v * 100) / 100;
  let custoAcum = 0, contAcum = 0;
  const linhas = pastos.map((p, i) => {
    const ultimo = i === pastos.length - 1;
    const custo = ultimo ? r2(aquisicao - custoAcum) : r2(aquisicao * p.area_ha / total);
    const cont = ultimo ? r2(contabil - contAcum) : r2(contabil * p.area_ha / total);
    custoAcum += custo; contAcum += cont;
    return { ...p, pct: (p.area_ha / total) * 100, custo, contabil: cont };
  });
  return { linhas, areaTotal: r2(total), porHa: r2(aquisicao / total) };
}

/** A frase que o banco devolve pronta (P0001 / 40001 / 42501) vai ao operador; outra coisa vira frase genérica e o texto cru vai
 *  ao console (OC-ABRIR-LENTO-01: erro do banco nunca vai cru à tela). */
export function fraseDoErro(error: { code?: string; message?: string } | null | undefined, padrao = 'Não consegui gravar. Tente de novo.'): string {
  if (!error) return padrao;
  if (error.code === 'P0001' || error.code === '40001') return error.message ?? padrao;
  if (error.code === '42501') return 'Sem acesso a este registro.';
  console.error('[patrimonio]', error);
  return padrao;
}

/** A tabela "Depreciação ano a ano" do modal: a série MENSAL do banco agrupada por ano (meses, soma das quotas, acumulada e contábil
 *  do último mês do ano). Só agrupa — a quota e a acumulada são as do banco. */
export function anoAAno(serie: ReadonlyArray<{ periodo: string; quota: number; acumulada: number; contabil: number }>) {
  const porAno = new Map<string, { ano: string; meses: number; depreciacao: number; acumulada: number; contabil: number }>();
  for (const m of serie) {
    const ano = m.periodo.slice(0, 4);
    const atual = porAno.get(ano) ?? { ano, meses: 0, depreciacao: 0, acumulada: 0, contabil: 0 };
    atual.meses += 1;
    atual.depreciacao = Math.round((atual.depreciacao + m.quota) * 100) / 100;
    atual.acumulada = m.acumulada;
    atual.contabil = m.contabil;
    porAno.set(ano, atual);
  }
  return [...porAno.values()].sort((a, b) => a.ano.localeCompare(b.ano));
}

export const ESPECIES_DE_DOCUMENTO: ReadonlyArray<{ valor: string; rotulo: string }> = [
  { valor: 'nota_fiscal', rotulo: 'Nota fiscal' }, { valor: 'contrato', rotulo: 'Contrato' }, { valor: 'escritura', rotulo: 'Escritura' },
  { valor: 'matricula', rotulo: 'Matrícula' }, { valor: 'laudo', rotulo: 'Laudo' }, { valor: 'seguro', rotulo: 'Apólice de seguro' },
  { valor: 'foto', rotulo: 'Foto' }, { valor: 'outro', rotulo: 'Outro' },
];
export const rotuloEspecie = (e: string): string => ESPECIES_DE_DOCUMENTO.find(x => x.valor === e)?.rotulo ?? 'Outro';

/** "180 KB", "1,2 MB"; sem tamanho "—". */
export function tamanhoDoArquivo(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('pt-BR')} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

/** O bem JÁ DEPRECIOU num mês passado (o mesmo critério da `fn_patrimonio_bem_salvar`): daqui em diante, situação e mês do "em uso"
 *  mudam só como correção com motivo, e vida/residual só pela mudança com vigência. */
export function jaDeprecia(b: { deprecia: boolean; situacao: SituacaoBem; em_uso_desde: string | null }, hoje: string): boolean {
  return b.deprecia && b.situacao !== 'em_formacao' && !!b.em_uso_desde && b.em_uso_desde.slice(0, 7) < hoje.slice(0, 7);
}
