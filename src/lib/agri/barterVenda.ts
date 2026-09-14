/**
 * A VENDA DO GRÃO NO BARTER — a perna ENTREGUEI (PR-AGRI-BARTER-TELA-C).
 *
 * ⚠ A VENDA É POR CLASSE DE QUALIDADE, NÃO POR CARGA. A cooperativa compra o lote: "tantas
 * sacas até 20 ppb a R$ 90, tantas acima a R$ 80". Medido no Proto em 13/09/2026, a safra
 * 23/24 de amendoim tem 4.040,28 sc até 20 e 3.706,37 sc acima, vindas de DEZ cargas — amarrar
 * a venda a uma delas seria inventar um vínculo que o romaneio não tem. Por isso
 * `agri_oc_entregas.colheita_id` fica NULO neste desenho: a chave é a classe.
 *
 * ⚠ A CLASSE É DERIVADA, e este arquivo é o único lugar que a nomeia. `agri_colheita` guarda
 * `aflatoxina_ppb` por carga e NÃO tem coluna de classe; `agri_oc_entregas.classe_aflatoxina` é
 * texto livre, sem CHECK no banco (medido). Duas pontas sem vocabulário comum é como se
 * escreve 'ate_20' num lado e 'ate' no outro e ninguém descobre até o relatório não fechar.
 *
 * ⚠ QUATRO CLASSES, NÃO DUAS. Além das duas do limite, existem:
 *   - SEM CLASSE — carga sem ppb informado. Não é faixa, é pendência, e ela é REAL: 1.032,00
 *     sacas na 25/26 (medido). Escondê-la faria o operador não achar um terço do que colheu.
 *   - ROÇA — o refugo, que a cooperativa paga à parte e que `totaisColheita` mantém FORA das
 *     duas faixas de propósito. 603,70 sc na 23/24.
 */

/** O limite que separa as duas faixas — o mesmo de `colheita.ts`, e por isso importado de lá. */
import { LIMITE_AFLATOXINA } from './colheita';
/**
 * ⚠ `parseMoeda`, NÃO `parseNumericValue`. Os dois existem e discordam em "5.000": o de
 * dinheiro lê 5 mil, o de peso lê 5 vírgula zero. Sacas e preço são quantidade e dinheiro em
 * pt-BR, onde o ponto é milhar — e foi exatamente este engano que bloqueou carga válida na
 * colheita (PR-AGRI-COLHEITA-FIX-05).
 */
import { parseMoeda } from '@/lib/calculos/numeroBR';

export const CLASSES_VENDA = [
  { valor: 'ate_20', label: `Até ${LIMITE_AFLATOXINA} ppb` },
  { valor: 'acima_20', label: `Acima de ${LIMITE_AFLATOXINA} ppb` },
  { valor: 'roca', label: 'Grão de roça' },
  { valor: 'sem_classe', label: 'Sem aflatoxina informada' },
] as const;

export type ClasseVenda = (typeof CLASSES_VENDA)[number]['valor'];

/**
 * A COR DE CADA CLASSE — PR-AGRI-BARTER-POLISH item 9.
 *
 * ⚠ A COR CARREGA SIGNIFICADO, não enfeite: verde é o lote que a cooperativa paga mais caro,
 * coral é o que passou do limite de aflatoxina e vale menos, marrom é o refugo. O produtor lê a
 * composição da entrega de relance e vê onde foi parar a safra dele.
 * ⚠ E ELA NÃO SUBSTITUI O RÓTULO: o ponto colorido acompanha o texto, nunca o troca — quem não
 * distingue as cores continua lendo "Acima de 20 ppb".
 */
export function corDaClasse(valor: string | null | undefined): string {
  switch (valor) {
    case 'ate_20': return 'bg-success';
    case 'acima_20': return 'bg-[#e8735a]';
    case 'roca': return 'bg-[#8b5e3c]';
    default: return 'bg-muted-foreground';
  }
}

export function labelDaClasse(valor: string | null | undefined): string {
  if (!valor) return '—';
  return CLASSES_VENDA.find(c => c.valor === valor)?.label ?? valor;
}

/** O que a safra TEM em cada classe, vindo das cargas. */
export interface DisponivelPorClasse {
  ate_20: number;
  acima_20: number;
  roca: number;
  sem_classe: number;
}

/** A carga, no mínimo que esta conta precisa. */
export interface CargaParaDisponivel {
  aflatoxina_ppb: number | null;
  sacas_boas: number | null;
  grao_roca_sacas: number | null;
}

const num = (v: number | null | undefined) => (typeof v === 'number' && isFinite(v) ? v : 0);
const arred = (v: number, casas = 2) => {
  const f = 10 ** casas;
  return Math.round(v * f) / f;
};

/**
 * Quanto a safra colheu em cada classe.
 *
 * ⚠ ESPELHA `totaisColheita` DE PROPÓSITO, e a regra copiada é a que importa: o grão de roça
 * fica FORA das duas faixas, sempre — ele já é refugo, e somá-lo a "até 20" faria o lote bom
 * parecer maior do que a cooperativa vai pagar. A carga contribui para a sua faixa COM as
 * sacas boas e para 'roca' com as sacas de roça, ao mesmo tempo.
 */
export function disponivelPorClasse(
  cargas: readonly CargaParaDisponivel[],
): DisponivelPorClasse {
  let ate = 0, acima = 0, sem = 0, roca = 0;
  for (const c of cargas) {
    const boas = num(c.sacas_boas);
    roca += num(c.grao_roca_sacas);
    if (c.aflatoxina_ppb == null) sem += boas;
    else if (c.aflatoxina_ppb <= LIMITE_AFLATOXINA) ate += boas;
    else acima += boas;
  }
  return {
    ate_20: arred(ate), acima_20: arred(acima),
    roca: arred(roca), sem_classe: arred(sem),
  };
}

/** Uma linha de entrega — o que o operador digita. */
export interface EntregaForm {
  classe: string;
  /** Texto do campo, em pt-BR. */
  sacas: string;
  precoSaca: string;
}

export interface EntregaCalculada {
  classe: string;
  sacas: number;
  precoSaca: number;
  valor: number;
  /** Quanto a safra tem nesta classe — referência, nunca trava. */
  disponivel: number;
  /** Vendeu mais do que a safra colheu nesta classe? */
  excede: boolean;
}

const lerNumero = (t: string): number => {
  const texto = (t ?? '').trim();
  if (!texto) return 0;
  const n = parseMoeda(texto);
  return n == null ? 0 : n;
};

/**
 * Quanto a safra tem NA classe da linha.
 *
 * ⚠ SWITCH, NÃO ÍNDICE POR STRING. `d[classe]` obrigaria a afrouxar o tipo com um cast — que
 * é proibido em código novo — e, pior, devolveria `undefined` em silêncio no dia em que uma
 * classe nova entrar em `CLASSES_VENDA` e ninguém a acrescentar em `DisponivelPorClasse`.
 * Aqui o compilador cobra.
 */
function dispDaClasse(d: DisponivelPorClasse, classe: string): number {
  switch (classe) {
    case 'ate_20': return d.ate_20;
    case 'acima_20': return d.acima_20;
    case 'roca': return d.roca;
    case 'sem_classe': return d.sem_classe;
    default: return 0;
  }
}

/**
 * Calcula as linhas da venda contra o que a safra tem.
 *
 * ⚠ EXCEDER AVISA, NÃO BLOQUEIA — decisão do briefing, e ela tem razão de ser: pode haver
 * estoque de safra anterior na cooperativa, e uma trava rígida impediria uma venda legítima.
 * O aviso existe para o caso comum, que é dígito trocado.
 */
export function calcularEntregas(
  linhas: readonly EntregaForm[],
  disponivel: DisponivelPorClasse,
): EntregaCalculada[] {
  return linhas.map(l => {
    const sacas = arred(lerNumero(l.sacas));
    const precoSaca = arred(lerNumero(l.precoSaca));
    const disp = dispDaClasse(disponivel, l.classe);
    return {
      classe: l.classe,
      sacas,
      precoSaca,
      valor: arred(sacas * precoSaca),
      disponivel: disp,
      /* Tolerância de meia saca: arredondamento de romaneio não é venda a mais. */
      excede: sacas > disp + 0.5,
    };
  });
}

export interface TotaisVenda {
  /** Soma das entregas. */
  bruto: number;
  /** O que a cooperativa retém — Senar e afins. */
  deducoes: number;
  /** O que de fato fica com o produtor. */
  liquido: number;
  /** Quantas linhas vendem mais do que a safra tem. */
  excedentes: number;
}

export function totaisVenda(
  entregas: readonly EntregaCalculada[], deducoes: number,
): TotaisVenda {
  const bruto = arred(entregas.reduce((s, e) => s + e.valor, 0));
  const ded = arred(Math.max(0, deducoes));
  return {
    bruto,
    deducoes: ded,
    liquido: arred(bruto - ded),
    excedentes: entregas.filter(e => e.excede).length,
  };
}

/**
 * A dedução sobre a receita bruta da venda de produto rural — Senar e Funrural.
 *
 * ⚠ A ALÍQUOTA É SUGESTÃO, NÃO REGRA GRAVADA, e desde o RESUMO-2 ela é EDITÁVEL na tela. O
 * percentual muda por lei e por ano — subiu para 1,7% —, e uma constante no código faria o
 * sistema discordar do documento da cooperativa sem ninguém saber qual dos dois está certo.
 * O 1,5% aqui é só o ponto de partida do campo.
 * ⚠ E O VALOR CONTINUA EDITÁVEL DIRETO: quem retém é a cooperativa, e o que vale no acerto é o
 * que veio no papel dela. A alíquota calcula; o valor manda.
 */
export const ALIQUOTA_DEDUCAO_PADRAO = 1.5;

/** O valor da dedução para uma alíquota em PERCENTUAL (1,5 = 1,5%). */
export function deducaoPorAliquota(bruto: number, aliquotaPct: number): number {
  if (!isFinite(aliquotaPct) || aliquotaPct <= 0) return 0;
  return arred(bruto * (aliquotaPct / 100));
}

/**
 * A alíquota que um valor representa sobre o bruto — o caminho inverso.
 *
 * ⚠ EXISTE PARA O CAMPO NÃO MENTIR quando o operador digita o VALOR do documento: sem isto, a
 * caixinha de % continuaria mostrando 1,5% ao lado de um valor que é 1,7% do bruto, e o
 * percentual exibido seria uma afirmação falsa sobre o número ao lado.
 */
export function aliquotaDoValor(bruto: number, valor: number): number {
  if (bruto <= 0) return 0;
  return arred((valor / bruto) * 100, 4);
}

/**
 * O saldo do contrato de barter.
 *
 * ⚠ O SINAL É O RECADO. Positivo = o parceiro deve ao produtor (entregou mais grão do que
 * recebeu de insumo); negativo = o produtor deve ao parceiro. Sem o rótulo em palavra, o
 * operador lê "−390.000" e não sabe de que lado está.
 */
export function saldoDoContrato(entregue: number, recebido: number) {
  const saldo = arred(entregue - recebido);
  return {
    saldo,
    rotulo: saldo > 0 ? 'crédito com o parceiro'
      : saldo < 0 ? 'deve ao parceiro'
        : 'quitado',
  };
}
