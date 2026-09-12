/**
 * A CHAVE DE RATEIO DO ADMINISTRATIVO — AGRI-RATEIO-TELA-01.
 *
 * ⚠ É PERCENTUAL DECLARADO, NÃO CALCULADO — e essa é a diferença que separa esta chave do
 * "Rateio ADM" que já existe no Financeiro. Aquele distribui o administrativo entre FAZENDAS,
 * proporcional ao rebanho médio do mês (derivado do dado, sem ninguém declarar nada); este
 * distribui entre ATIVIDADES — pecuária, lavoura, silvicultura — por um percentual que o
 * produtor decide e assume. Dois rateios, dois eixos, e nenhum substitui o outro.
 * ⚠ A SOMA TEM DE DAR 100, E A VALIDAÇÃO É DURA. Uma chave de 95% deixa 5% do contador, do
 * escritório e do software fora de qualquer atividade — o custo some do DRE sem ninguém
 * apagar nada. Uma de 105% cria despesa que não existe. Nos dois casos o erro aparece meses
 * depois, num resultado que não fecha, longe de onde foi cometido.
 * ⚠ ZERO É RESPOSTA VÁLIDA: quem só tem pecuária declara 100/0/0. O que não vale é a soma
 * errada.
 */
import { parseNumericValue } from '@/lib/calculos/abate';

export type AtividadeRateio = 'pecuaria' | 'agricultura' | 'silvicultura';

/**
 * ⚠ O RÓTULO É "LAVOURA" E O VALOR É `agricultura` — a mesma assimetria do card do modal e do
 * cadastro de safras: o produtor diz lavoura, a coluna diz agricultura.
 * ⚠ AS CORES VIERAM DO BRIEFING (pecuária azul, lavoura verde, silvicultura teal) e DIVERGEM
 * da paleta canônica de `tiposUso.ts`, onde agricultura é AZUL e eucalipto é teal. A
 * divergência está reportada; o dia em que o PR-UI-PASTO-CORES-03 unificar as paletas, é aqui
 * que se troca.
 */
export const ATIVIDADES_RATEIO: readonly {
  valor: AtividadeRateio;
  rotulo: string;
  /** Classe da barra proporcional. */
  barra: string;
}[] = [
  { valor: 'pecuaria', rotulo: 'Pecuária', barra: 'bg-blue-500' },
  { valor: 'agricultura', rotulo: 'Lavoura', barra: 'bg-emerald-500' },
  { valor: 'silvicultura', rotulo: 'Silvicultura', barra: 'bg-teal-500' },
];

/** O que a tela edita: três textos, um por atividade. */
export type RateioForm = Record<AtividadeRateio, string>;

export const RATEIO_VAZIO: RateioForm = { pecuaria: '', agricultura: '', silvicultura: '' };

/**
 * ⚠ `parseNumericValue`, NUNCA `Number()`: "72,5" é o que se digita em português, e
 * `Number('72,5')` é `NaN` — que viraria zero e faria a soma fechar errado em silêncio.
 */
export function percentualDe(texto: string | null | undefined): number {
  return parseNumericValue(texto ?? '');
}

export function somaPercentuais(form: RateioForm): number {
  const s = ATIVIDADES_RATEIO.reduce((acc, a) => acc + percentualDe(form[a.valor]), 0);
  /* Duas casas: a soma de três decimais não pode falhar por resíduo binário — 33,33 × 3 dá
     99,99 de verdade, mas 72,1 + 24,9 + 3 não pode dar 99,999999. */
  return Math.round(s * 100) / 100;
}

export interface ValidacaoRateio {
  ok: boolean;
  erro?: string;
  soma: number;
  payload?: Array<{ atividade: AtividadeRateio; percentual: number }>;
}

/**
 * ⚠ CADA UM ENTRE 0 E 100, E A SOMA EXATAMENTE 100. O CHECK do banco garante só a faixa de
 * cada linha; a soma ele não vê — as três linhas são independentes lá. Quem guarda o
 * invariante é esta função, e é por isso que ela existe fora do componente.
 */
export function validarRateio(form: RateioForm): ValidacaoRateio {
  const soma = somaPercentuais(form);
  for (const a of ATIVIDADES_RATEIO) {
    const v = percentualDe(form[a.valor]);
    if (v < 0 || v > 100) {
      return { ok: false, soma, erro: `${a.rotulo}: o percentual fica entre 0 e 100.` };
    }
  }
  if (soma !== 100) {
    return { ok: false, soma, erro: `Soma ${soma}% — ajuste para 100%.` };
  }
  return {
    ok: true,
    soma,
    payload: ATIVIDADES_RATEIO.map(a => ({ atividade: a.valor, percentual: percentualDe(form[a.valor]) })),
  };
}

/**
 * Os anos oferecidos nos cards.
 *
 * ⚠ CINCO ATRÁS, O CORRENTE E UM À FRENTE, mais qualquer ano que JÁ TENHA CHAVE gravada —
 * inclusive fora da janela. Uma chave de 2018 que sumisse dos cards seria uma chave que
 * ninguém mais consegue abrir para corrigir, e ela continuaria valendo no DRE daquele ano.
 */
export function anosDoRateio(anoCorrente: number, anosComChave: readonly number[] = []): number[] {
  const set = new Set<number>();
  for (let a = anoCorrente - 5; a <= anoCorrente + 1; a++) set.add(a);
  anosComChave.forEach(a => set.add(a));
  /* ⚠ CRESCENTE: o mais ANTIGO à esquerda — FIN-AUDITORIA-CULTURA-01 item 3. A fita nasceu
     decrescente ("o mais usado primeiro"), e ler tempo da direita para a esquerda contraria a
     régua de meses da casa (Jan à esquerda, Dez à direita) e a própria leitura. */
  return [...set].sort((a, b) => a - b);
}
