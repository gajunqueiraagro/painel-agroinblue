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

/** O código travado: `25/26-Pec` ou `25/26-AMD`. */
export function codigoDaSafra(temporada: string, escopo: string, cultura?: string | null): string {
  if (escopo === 'agricultura') {
    const c = cultura ? culturaPorValor(cultura) : undefined;
    return c ? `${temporada}-${c.sigla}` : '';
  }
  return `${temporada}-${SIGLA_PECUARIA}`;
}

/** O nome sugerido, que o operador pode reescrever: "Safra 25/26 Amendoim". */
export function nomeDaSafra(temporada: string, escopo: string, cultura?: string | null): string {
  if (escopo === 'agricultura') {
    const c = cultura ? culturaPorValor(cultura) : undefined;
    return c ? `Safra ${temporada} ${c.label}` : '';
  }
  return `Safra ${temporada} Pecuária`;
}
