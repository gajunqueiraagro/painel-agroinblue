/**
 * Qual safra um lançamento provavelmente pertence — CUSTEIO-TXT / SAFRA-CADASTRO.
 *
 * ⚠ SUGESTÃO, NUNCA DECISÃO. O escopo e a data dizem qual safra é a provável; quem
 * confirma é quem lança. Devolver `null` é resposta legítima e frequente — melhor um
 * campo vazio que o operador preenche do que uma safra errada que ninguém revisa.
 * ⚠ A TEMPORADA VIRA EM JULHO, como no cadastro: julho/2026 abre a `26/27`, junho/2026
 * ainda é `25/26`. A regra vive junto do resto em `culturas.ts` — uma só definição.
 * ⚠ AGRICULTURA COM MAIS DE UMA CULTURA NÃO ESCOLHE SOZINHA. Se o cliente tem amendoim
 * e mandioca na mesma temporada, um custeio genérico ("energia elétrica") não diz de qual
 * lavoura é. A preferência por amendoim existe porque é a cultura principal do NJ e a
 * escolha errada é visível na hora; mas quando há empate de verdade a decisão continua
 * sendo do operador — por isso a preferência é uma LISTA, e não um sorteio.
 */
import { temporadaDeReferencia } from './culturas';

export interface SafraCandidata {
  id: string;
  /* Opcional para aceitar o `Safra` do `useFinanceiroV2` sem cast: lá o código pode não
     ter sido selecionado, e "sem código" é o mesmo que "não dá para saber a temporada". */
  codigo?: string | null;
  escopo_negocio?: string | null;
  ativa?: boolean;
}

/** Ordem de preferência quando a agricultura tem mais de uma cultura na temporada. */
const PREFERENCIA_CULTURA = ['AMD', 'MAND', 'SOJ', 'MIL', 'CAN', 'OUT'];

/**
 * @param dataISO  'YYYY-MM-DD' — a competência do lançamento, não a data de hoje.
 * @param escopo   'pecuaria' | 'agricultura' (qualquer outro devolve null).
 * @param safras   o cadastro do cliente; inativas são ignoradas.
 */
export function safraSugerida(
  dataISO: string | null | undefined,
  escopo: string | null | undefined,
  safras: SafraCandidata[],
): string | null {
  if (!dataISO || !escopo) return null;
  const m = /^(\d{4})-(\d{2})/.exec(dataISO);
  if (!m) return null;

  const temporada = temporadaDeReferencia(new Date(Number(m[1]), Number(m[2]) - 1, 1));
  const doEscopo = safras.filter(s =>
    s.ativa !== false && (s.escopo_negocio ?? '') === escopo && (s.codigo ?? '').startsWith(`${temporada}-`));
  if (doEscopo.length === 0) return null;
  if (doEscopo.length === 1) return doEscopo[0].id;

  /* Mais de uma na mesma temporada e escopo: só a agricultura tem esse caso real (uma
     cultura por safra). Escolhe pela ordem de preferência; sem nenhuma conhecida, devolve
     null em vez de chutar a primeira da lista, que dependeria da ordem do banco. */
  for (const sigla of PREFERENCIA_CULTURA) {
    const achou = doEscopo.find(s => (s.codigo ?? '').endsWith(`-${sigla}`));
    if (achou) return achou.id;
  }
  return null;
}
