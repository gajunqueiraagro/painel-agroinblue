/**
 * As culturas agrícolas e suas siglas — SAFRA-CADASTRO-01.
 *
 * ⚠ A SIGLA É O QUE JÁ ESTÁ NO BANCO. As safras existentes se chamam `25/26-AMD` e
 * `25/26-MAND`; a cultura mora HOJE no sufixo do código, e a spec do fechamento agrícola
 * (docs/specs/AGRI-FECHAMENTO-v1.md, item 2.1) manda fazer o backfill da futura coluna
 * `cultura` exatamente por esse sufixo. Por isso a lista nasce aqui, em lib: quando AGRI-01
 * criar a coluna, o backfill lê deste mapa em vez de reescrever as regras num SQL solto.
 * ⚠ NENHUMA CULTURA DEPENDE DE SUBCENTRO. Mandioca entra sem ter conta de receita própria
 * no plano — a cultura é da safra, o subcentro é do lançamento, e amarrar os dois faria o
 * cadastro esperar por uma migration de plano de contas que é outra frente (PLANO-01).
 * ⚠ 'outras' EXISTE PARA NÃO FORÇAR UMA ESCOLHA FALSA: sem ela, quem planta o que não está
 * na lista escolheria a cultura errada, e o dado nasceria mentindo.
 */
export interface Cultura {
  valor: string;
  label: string;
  /** Entra no código da safra: `25/26-AMD`. */
  sigla: string;
}

export const CULTURAS: readonly Cultura[] = [
  { valor: 'amendoim', label: 'Amendoim', sigla: 'AMD' },
  { valor: 'mandioca', label: 'Mandioca', sigla: 'MAND' },
  { valor: 'soja', label: 'Soja', sigla: 'SOJ' },
  { valor: 'milho', label: 'Milho', sigla: 'MIL' },
  { valor: 'cana', label: 'Cana', sigla: 'CAN' },
  { valor: 'outras', label: 'Outras', sigla: 'OUT' },
] as const;

/** Sufixo do código quando o escopo é pecuária — o padrão já gravado (`25/26-Pec`). */
export const SIGLA_PECUARIA = 'Pec';

/**
 * Sufixo da LAVOURA — AGRI-CADASTRO-SAFRA-01.
 *
 * ⚠ A CULTURA SAIU DA SAFRA e foi para a área plantada (frente AGRI-03-AREA): a safra passa
 * a ser "25/26 Lavoura", não "25/26 Amendoim". Um talhão de amendoim e um de mandioca na
 * MESMA temporada são duas áreas plantadas, não duas safras — e enquanto a cultura era do
 * código, a conta do ano exigia somar duas safras que descreviam o mesmo período.
 * ⚠ AS SAFRAS EXISTENTES NÃO MUDAM. `25/26-AMD` e `25/26-MAND` continuam com o código que
 * têm; o cadastro não reescreve código de safra já criada, e o mapa de `CULTURAS` continua
 * aqui porque é ele que lê aquele sufixo.
 */
export const SIGLA_LAVOURA = 'Lav';

export const culturaPorValor = (v: string): Cultura | undefined =>
  CULTURAS.find(c => c.valor === v);

/**
 * A temporada agrícola vai de julho a junho — `25/26` começa em jul/2025.
 *
 * ⚠ É CONVENÇÃO, NÃO DADO, e a spec registra isso: `data_inicio`/`data_fim` entram em
 * AGRI-01 justamente para a temporada deixar de ser deduzida do rótulo. Enquanto não
 * entram, a regra vive aqui, num lugar só.
 */
export function temporadaDeReferencia(hoje: Date): string {
  const ano = hoje.getFullYear();
  const inicio = hoje.getMonth() >= 6 ? ano : ano - 1;   // getMonth: 6 = julho
  return `${String(inicio % 100).padStart(2, '0')}/${String((inicio + 1) % 100).padStart(2, '0')}`;
}

/**
 * O piso absoluto da lista de temporadas.
 *
 * ⚠ ELE É CONVENÇÃO, E ISSO PRECISA FICAR DITO: não há nada no banco que comece em 2015 —
 * é só um fundo de poço razoável para a lista não ser infinita. O piso ANTERIOR era pior
 * porque era invisível: a função oferecia dois anos para trás e ninguém sabia que era um
 * limite, então o NJ, com pecuária lançada desde 2020, simplesmente não tinha como cadastrar
 * 20/21 — o cadastro recusava um dado que existe.
 */
export const TEMPORADA_PISO = 2015;
/** Quantos anos à frente a lista vai além da temporada corrente. */
export const TEMPORADAS_A_FRENTE = 5;
/** Quantos anos para trás, quando o piso não corta antes. */
export const TEMPORADAS_ATRAS = 20;

/**
 * As temporadas oferecidas no select — FIN-SAFRA-CADASTRO-01.
 *
 * ⚠ DA MAIS RECENTE PARA A MAIS ANTIGA. Com cinco itens a ordem não importava; com dezessete,
 * importa: quem cadastra está quase sempre na temporada corrente ou na seguinte, e quem
 * procura 20/21 sabe que vai rolar. Crescente poria os anos vivos no fim da lista.
 * ⚠ A CORRENTE NÃO É A PRIMEIRA, e é de propósito: as futuras vêm antes dela porque planejar
 * a safra que vem é uso real (é o que o `data_fim` das recorrências já faz).
 */
export function temporadasDisponiveis(hoje: Date): string[] {
  const atual = hoje.getMonth() >= 6 ? hoje.getFullYear() : hoje.getFullYear() - 1;
  const teto = atual + TEMPORADAS_A_FRENTE;
  const piso = Math.max(TEMPORADA_PISO, atual - TEMPORADAS_ATRAS);
  const lista: string[] = [];
  for (let ini = teto; ini >= piso; ini--) {
    lista.push(`${String(ini % 100).padStart(2, '0')}/${String((ini + 1) % 100).padStart(2, '0')}`);
  }
  return lista;
}

/**
 * O código travado: `25/26-Pec` ou `25/26-Lav`.
 *
 * ⚠ SEM CULTURA O CÓDIGO NÃO É MAIS VAZIO — AGRI-CADASTRO-SAFRA-01. Ele era: o cadastro
 * exigia escolher a cultura antes de deixar criar, e o vazio é que segurava o botão. Agora a
 * lavoura tem sigla própria e a safra nasce completa sem a pergunta.
 * ⚠ O PARÂMETRO `cultura` FICA, e continua valendo quando vem: é ele que mantém o formato
 * das safras antigas reconhecível por quem já o passava. O cadastro parou de passá-lo.
 */
export function codigoDaSafra(temporada: string, escopo: string, cultura?: string | null): string {
  if (escopo === 'agricultura') {
    const c = cultura ? culturaPorValor(cultura) : undefined;
    return `${temporada}-${c ? c.sigla : SIGLA_LAVOURA}`;
  }
  return `${temporada}-${SIGLA_PECUARIA}`;
}

/** O nome sugerido, que o operador pode reescrever: "Safra 25/26 Lavoura". */
export function nomeDaSafra(temporada: string, escopo: string, cultura?: string | null): string {
  if (escopo === 'agricultura') {
    const c = cultura ? culturaPorValor(cultura) : undefined;
    return `Safra ${temporada} ${c ? c.label : 'Lavoura'}`;
  }
  return `Safra ${temporada} Pecuária`;
}

/** O ciclo da safra: a temporada de julho a junho, ou a lavoura que fica anos no chão. */
export type CicloSafra = 'anual' | 'perene';

/**
 * AS DATAS QUE A TEMPORADA IMPLICA — AGRI-CADASTRO-SAFRA-01.
 *
 * ⚠ SÓ O PADRÃO, NUNCA A VERDADE. O plantio real atrasa, a colheita entra pelo mês seguinte,
 * e a coluna `data_inicio`/`data_fim` existe (AGRI-01) justamente para guardar o que houve,
 * não o que a convenção diz. Por isso os dois campos ficam EDITÁVEIS depois de preenchidos:
 * isto aqui é o palpite que poupa digitação, não um cálculo que manda no dado.
 * ⚠ JULHO A JUNHO é a mesma convenção de `temporadaDeReferencia`, e mora ao lado dela de
 * propósito — duas definições do ano agrícola divergiriam no primeiro ajuste.
 * ⚠ O SÉCULO É 20xx: as temporadas oferecidas vão de 2015 em diante, e '99/00' significaria
 * 2099/2100, não 1999 — coerente com `temporadaDeReferencia`, que também trabalha em módulo
 * 100 sem guardar século.
 */
export function periodoDaTemporada(temporada: string): { inicio: string; fim: string } | null {
  const m = /^(\d{2})\/(\d{2})$/.exec((temporada || '').trim());
  if (!m) return null;
  const anoInicio = 2000 + Number(m[1]);
  return { inicio: `${anoInicio}-07-01`, fim: `${anoInicio + 1}-06-30` };
}

/** `2020-03-15` → `20`. Devolve null para data vazia ou fora do formato ISO. */
function anoCurto(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-\d{2}-\d{2}$/.exec((iso || '').trim());
  return m ? m[1].slice(2) : null;
}

/**
 * O código e o nome de uma safra PERENE — o eucalipto que planta em 2020 e corta em 2027.
 *
 * ⚠ ELE NASCE DAS DATAS, porque perene não tem temporada: o que identifica a safra é o
 * intervalo entre o plantio e o corte previsto. `20/27-Lav` é o mesmo formato do anual, e é
 * por isso que ele funciona — a lista de safras continua legível sem aprender um segundo
 * formato.
 * ⚠ E ELE PODE COLIDIR COM UM ANUAL: um perene de 2020 a 2021 gera `20/21-Lav`, igual ao da
 * temporada 20/21. Não se inventa desempate automático — o aviso de código repetido que o
 * cadastro já mostra pega o caso, e no perene o código é editável justamente por isso.
 */
export function codigoSafraPerene(inicio: string | null, fim: string | null, escopo: string): string {
  const a = anoCurto(inicio);
  const b = anoCurto(fim);
  if (!a || !b) return '';
  const sigla = escopo === 'agricultura' ? SIGLA_LAVOURA : SIGLA_PECUARIA;
  return `${a}/${b}-${sigla}`;
}

/** "Safra perene 2020–2027" — rótulo humano, e o operador reescreve à vontade. */
export function nomeSafraPerene(inicio: string | null, fim: string | null): string {
  const a = /^(\d{4})-/.exec((inicio || '').trim());
  const b = /^(\d{4})-/.exec((fim || '').trim());
  if (!a || !b) return '';
  return `Safra perene ${a[1]}\u2013${b[1]}`;
}
