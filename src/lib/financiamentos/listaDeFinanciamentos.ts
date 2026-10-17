/**
 * FIN-FINANC-28-P3 — a LISTA DE FINANCIAMENTOS do desenho aprovado (mock v1.1, partes 1 e 4), num dono puro.
 *
 * Os números de cada contrato vêm prontos da fonte única do saldo (`fn_financiamentos_situacao_lote` → chave `saldo`,
 * `_fn_financiamento_saldo`): contratado, liberado, amortizado, saldo, pendências. AQUI NENHUM SALDO É CALCULADO — só se
 * agrupa e se SOMA o que o banco mandou, em centavos inteiros. Liberado ou saldo NULO = "?": o contrato fica FORA da soma e a
 * soma diz quantos ficaram de fora ("+ ?"). Nunca um número inventado.
 * O próximo vencimento é o de `resumoDoContratoNaLista` (o menor vencimento entre as parcelas que o banco julgou não pagas),
 * decisão do Gabriel em 17/10.
 */
import type { SaldoDoContrato } from './situacaoDoContrato';

export interface ContratoDaLista {
  id: string;
  numeroContrato: string | null;
  banco: string | null;
  /** FIN-FINANC-28-P3-FIX4 — o CPF/CNPJ do credor (o `title` da coluna diz "Nome · documento") */
  bancoDocumento?: string | null;
  descricao: string;
  status: string;
  linhaCreditoId: string | null;
  linhaCreditoNome: string | null;
  /** o número do contrato que nasceu deste (o rolado aponta o sucessor) */
  sucessorNumero: string | null;
  saldo: SaldoDoContrato | null;
  proxVencimento: string | null;
  /** a data da linha: a da 1ª liberação gravada (viva) quando há; senão a do contrato */
  data: string | null;
  dataOrigem: 'liberacao' | 'contrato' | null;
}

/** Vigente = o que ainda deve. Encerrado = quitado, rolado ou cancelado (recolhidos numa linha). */
export const ENCERRADOS: readonly string[] = ['quitado', 'rolado', 'cancelado'];
export const ehEncerrado = (c: ContratoDaLista): boolean => ENCERRADOS.includes(c.status);

/** Número de contrato "de verdade": não vazio e com algum dígito (a mesma regra da pendência `sem_numero_contrato`). */
export const temNumero = (n: string | null): boolean => !!n && n.trim() !== '' && /\d/.test(n);

/* POR EXTENSO no `title` da célula; a coluna mostra a CURTA (FIN-FINANC-28-P3-FIX2: coluna estreita e fixa). */
export const TEXTO_PENDENCIA: Record<string, string> = {
  sem_liberacao: 'liberação não gravada',
  amortizacao_sem_lancamento: 'amortização sem lançamento',
  liberado_maior_que_contratado: 'liberado maior que o contratado',
  amortizado_maior_que_liberado: 'amortizado maior que o liberado',
  sem_numero_contrato: 'falta nº do contrato',
  /* FIN-FINANC-28 PASSO 4 — o banco (`_fn_financiamento_saldo`) diz quando falta a cédula viva do contrato */
  sem_documento: 'falta a cédula do contrato',
  aditivo_a_anexar: 'prorrogado: falta anexar o aditivo',
};
export const TEXTO_PENDENCIA_CURTO: Record<string, string> = {
  sem_liberacao: 'sem lib.',
  amortizacao_sem_lancamento: 'amort. s/ lanç.',
  liberado_maior_que_contratado: 'lib. > contr.',
  amortizado_maior_que_liberado: 'amort. > lib.',
  sem_numero_contrato: 'sem nº',
  sem_documento: 'sem doc',
  aditivo_a_anexar: 'sem aditivo',
};
/** O que a coluna estreita mostra: a primeira pendência, curta, e "+N" quando há mais (todas, por extenso, vão no `title`). */
export const pendenciaCurta = (codigos: readonly string[]): string =>
  codigos.length === 0 ? '' : `${TEXTO_PENDENCIA_CURTO[codigos[0]] ?? codigos[0]}${codigos.length > 1 ? ` +${codigos.length - 1}` : ''}`;
/** As pendências em português, separadas por " · "; código desconhecido aparece como veio (nunca some). */
export const textoDasPendencias = (codigos: readonly string[]): string =>
  codigos.map((c) => TEXTO_PENDENCIA[c] ?? c).join(' · ');

/** Uma soma que sabe quantos contratos ficaram de fora por falta do número ("+ ?") e quantos entraram (`conhecidos`).
 *  Nenhum conhecido = a soma NÃO EXISTE: a tela mostra "?", nunca "0,00" (zero inventado). */
export interface Soma { valor: number; aConfirmar: number; conhecidos: number }
/** a soma tem algum valor conhecido? (senão a tela diz "?") */
export const somaConhecida = (s: Soma): boolean => s.conhecidos > 0 || s.aConfirmar === 0;

export interface SubtotaisDaLista { contratado: Soma; liberado: Soma; amortizado: Soma; saldo: Soma }

export interface GrupoDaLista extends SubtotaisDaLista {
  chave: string;
  tipo: 'linha' | 'banco';
  rotulo: string;
  contratos: ContratoDaLista[];
}

export interface ListaDeFinanciamentos {
  grupos: GrupoDaLista[];
  encerrados: ContratoDaLista[];
  total: SubtotaisDaLista;
  /** contratos (vigentes e encerrados, fora rolado/cancelado) com alguma pendência */
  comPendencia: number;
}

const cent = (v: number) => Math.round(v * 100);

function somar(contratos: readonly ContratoDaLista[], campo: 'contratado' | 'liberado' | 'amortizado' | 'saldo'): Soma {
  let c = 0;
  let fora = 0;
  let dentro = 0;
  for (const k of contratos) {
    if (k.saldo?.foraDasSomas) continue;
    const v = k.saldo ? k.saldo[campo] : null;
    if (v === null || v === undefined) fora += 1;
    else { c += cent(v); dentro += 1; }
  }
  return { valor: c / 100, aConfirmar: fora, conhecidos: dentro };
}

function subtotais(contratos: readonly ContratoDaLista[]): SubtotaisDaLista {
  return {
    contratado: somar(contratos, 'contratado'), liberado: somar(contratos, 'liberado'),
    amortizado: somar(contratos, 'amortizado'), saldo: somar(contratos, 'saldo'),
  };
}

export const SEM_BANCO = 'Sem banco';

/** Ordem dentro do grupo: a coluna e a direção pedidas; empate pelo número do contrato e pelo id (estável). */
export type ColunaDaLista = 'data' | 'numero' | 'banco' | 'descricao' | 'status' | 'contratado' | 'liberado' | 'amortizado' | 'saldo' | 'proxVencimento';

function valorDaColuna(c: ContratoDaLista, col: ColunaDaLista): string | number | null {
  switch (col) {
    case 'data': return c.data;
    case 'numero': return c.numeroContrato;
    case 'banco': return c.banco;
    case 'descricao': return c.descricao;
    case 'status': return c.status;
    case 'proxVencimento': return c.proxVencimento;
    default: return c.saldo ? c.saldo[col] : null;
  }
}

export function ordenarContratos(contratos: readonly ContratoDaLista[], col: ColunaDaLista, dir: 'asc' | 'desc'): ContratoDaLista[] {
  const fator = dir === 'asc' ? 1 : -1;
  return [...contratos].sort((a, b) => {
    const va = valorDaColuna(a, col);
    const vb = valorDaColuna(b, col);
    if (va !== vb) {
      if (va === null) return 1;            // vazio sempre no fim, nas duas direções
      if (vb === null) return -1;
      const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
      if (r !== 0) return r * fator;
    }
    return (a.numeroContrato ?? '').localeCompare(b.numeroContrato ?? '', 'pt-BR') || a.id.localeCompare(b.id);
  });
}

/**
 * Agrupa os VIGENTES por linha de crédito, quando o contrato tem uma; os demais, por banco. Grupos de linha primeiro, depois os
 * de banco, cada bloco em ordem de contratado (maior primeiro). Os encerrados ficam à parte, na mesma ordem pedida.
 */
/** Ordem padrão (FIN-FINANC-28-P3-FIX): Data crescente dentro de cada grupo — a ordem da casa, data primeiro. */
export function montarListaDeFinanciamentos(contratos: readonly ContratoDaLista[], col: ColunaDaLista = 'data',
                                            dir: 'asc' | 'desc' = 'asc'): ListaDeFinanciamentos {
  const vigentes = contratos.filter((c) => !ehEncerrado(c));
  const porChave = new Map<string, { tipo: 'linha' | 'banco'; rotulo: string; contratos: ContratoDaLista[] }>();
  for (const c of vigentes) {
    const chave = c.linhaCreditoId ? `linha:${c.linhaCreditoId}` : `banco:${c.banco ?? SEM_BANCO}`;
    const tipo: 'linha' | 'banco' = c.linhaCreditoId ? 'linha' : 'banco';
    const g = porChave.get(chave) ?? {
      tipo,
      rotulo: c.linhaCreditoId ? (c.linhaCreditoNome ?? 'Linha de crédito') : (c.banco ?? SEM_BANCO),
      contratos: [],
    };
    g.contratos.push(c);
    porChave.set(chave, g);
  }
  const grupos: GrupoDaLista[] = [...porChave.entries()].map(([chave, g]) => ({
    chave, tipo: g.tipo, rotulo: g.rotulo, contratos: ordenarContratos(g.contratos, col, dir), ...subtotais(g.contratos),
  }));
  grupos.sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'linha' ? -1 : 1)
    || b.contratado.valor - a.contratado.valor || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  const comPendencia = contratos.filter((c) => !c.saldo?.foraDasSomas && (c.saldo?.pendencias.length ?? 0) > 0).length;
  return { grupos, encerrados: ordenarContratos(contratos.filter(ehEncerrado), col, dir), total: subtotais(vigentes), comPendencia };
}

/** Natureza que mora na aba "Compras parceladas"; o resto (financiamento, empréstimo) é a aba "Financiamentos". */
export const ehCompraParcelada = (natureza: string | null | undefined): boolean => natureza === 'parcelamento';

/**
 * A linha da lista a partir do que a tela já leu — o contrato, a situação do lote (com a chave `saldo`), o nome da linha de
 * crédito e o número do sucessor. NADA É CALCULADO: o próximo vencimento é o do helper de sempre (`resumoDoContratoNaLista`),
 * passado pronto.
 */
export function contratoDaLista(entrada: {
  id: string; numeroContrato: string | null; banco: string | null; bancoDocumento?: string | null; descricao: string | null; status: string;
  linhaCreditoId: string | null; linhaCreditoNome: string | null; sucessorNumero: string | null;
  saldo: SaldoDoContrato | null | undefined; proxVencimento: string | null | undefined;
  dataContrato: string | null | undefined; primeiraLiberacao: string | null | undefined;
}): ContratoDaLista {
  const lib = entrada.primeiraLiberacao ?? null;
  const contrato = entrada.dataContrato ?? null;
  return {
    id: entrada.id,
    numeroContrato: entrada.numeroContrato,
    banco: entrada.banco,
    ...(entrada.bancoDocumento ? { bancoDocumento: entrada.bancoDocumento } : {}),
    descricao: entrada.descricao ?? '',
    status: entrada.status,
    linhaCreditoId: entrada.linhaCreditoId,
    linhaCreditoNome: entrada.linhaCreditoNome,
    sucessorNumero: entrada.sucessorNumero,
    saldo: entrada.saldo ?? null,
    proxVencimento: entrada.proxVencimento ?? null,
    data: lib ?? contrato,
    dataOrigem: lib ? 'liberacao' : contrato ? 'contrato' : null,
  };
}
