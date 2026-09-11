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

export interface OpcoesSugestao {
  /**
   * Desempatar por cultura quando há mais de uma candidata. Padrão `true`.
   *
   * ⚠ A POLÍTICA DEPENDE DE QUEM ESTÁ OLHANDO — PR-FIN-ATIVIDADE-01b. No import em lote
   * (`CusteioTxtImportTab`) ninguém confere linha a linha: campo vazio ali vira lançamento
   * sem safra que nunca mais é revisado, e por isso o desempate por cultura principal é o
   * mal menor — a escolha errada é visível na hora. No MODAL o operador está com os olhos no
   * campo, e sugerir Amendoim quando existem Amendoim e Mandioca é decidir por ele uma coisa
   * que ele decide melhor. Duas telas, duas políticas, uma função.
   */
  desempatar?: boolean;
}

/**
 * @param dataISO  'YYYY-MM-DD' — a competência do lançamento, não a data de hoje.
 * @param escopo   'pecuaria' | 'agricultura' (qualquer outro devolve null).
 * @param safras   o cadastro do cliente; inativas são ignoradas.
 */
export function safraSugerida(
  dataISO: string | null | undefined,
  escopo: string | null | undefined,
  safras: SafraCandidata[],
  opcoes: OpcoesSugestao = {},
): string | null {
  /* ⚠ O FILTRO É O DA `safrasCandidatas`, chamado — não copiado. A tela mostra as
     candidatas no topo da lista, e se os dois conjuntos divergissem o operador veria uma
     safra sugerida que não está no topo. Uma definição, dois usos. */
  const doEscopo = safrasCandidatas(dataISO, escopo, safras);
  if (doEscopo.length === 0) return null;
  if (doEscopo.length === 1) return doEscopo[0].id;

  /* Mais de uma na mesma temporada e escopo: só a agricultura tem esse caso real (uma
     cultura por safra). Escolhe pela ordem de preferência; sem nenhuma conhecida, devolve
     null em vez de chutar a primeira da lista, que dependeria da ordem do banco. */
  if (opcoes.desempatar === false) return null;
  for (const sigla of PREFERENCIA_CULTURA) {
    const achou = doEscopo.find(s => (s.codigo ?? '').endsWith(`-${sigla}`));
    if (achou) return achou.id;
  }
  return null;
}

/**
 * As candidatas, sem escolher nenhuma — PR-FIN-ATIVIDADE-01b.
 *
 * ⚠ NENHUMA TELA A CHAMA MAIS — FIN-SAFRA-ORDEM-02. Ela existia para que o dropdown do modal
 * mostrasse no topo EXATAMENTE as que a sugestão considerou; o topo acabou (a lista voltou à
 * ordem cronológica pura) e o único chamador que resta é a `safraSugerida` aqui em cima.
 * Continua exportada de propósito: é o conjunto "temporada + escopo", que é uma pergunta
 * legítima, e apagá-la agora seria apagar a definição junto com o consumidor.
 */
export function safrasCandidatas(
  dataISO: string | null | undefined,
  escopo: string | null | undefined,
  safras: SafraCandidata[],
): SafraCandidata[] {
  if (!dataISO || !escopo) return [];
  const m = /^(\d{4})-(\d{2})/.exec(dataISO);
  if (!m) return [];
  const temporada = temporadaDeReferencia(new Date(Number(m[1]), Number(m[2]) - 1, 1));
  return safras.filter((s) =>
    s.ativa !== false && (s.escopo_negocio ?? '') === escopo && (s.codigo ?? '').startsWith(`${temporada}-`));
}
