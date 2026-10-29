/**
 * conferenciaDoDia — P159a (CONC-TELAS-01, Gabriel 28/10): o que a Conferência DESENHA em cada dia da mesa, e em que ordem.
 *
 * ⚠ D1 — DENTRO DO DIA, O MAIOR |VALOR| PRIMEIRO, sem separar entradas de saídas e sem separar casado de sem par: o "−175,00 sem par"
 *   aparece entre o −260,95 e o −3,97 casados, que é onde o olho o procura. É a mesma regra do Extrato (banco) e do Extrato do sistema
 *   (`porDia`). Os CANDIDATOS (previsto/programado que podem casar) vêm depois dos movimentos do dia: não são movimento, ficam fora
 *   da soma do dia (`DiaConf.candidatos`), e misturá-los faria o "possível par" parecer movimento.
 * ⚠ A ORDEM É SÓ DESTA TELA: a `ordenar` da mesa (entradas antes, maiores primeiro) continua como está, porque o Extrato da planilha
 *   do Enriquecer (`extratoDaPlanilha`) também lê a mesa.
 * ⚠ OS FILTROS (os chips do cabeçalho) ESCONDEM LINHAS, NÃO MUDAM A CONTA: o dia que fica mostra o fechamento do DIA INTEIRO.
 *   "Sem par" é o "Só não conciliados" de antes (o extrato PARCIAL também aparece); "Casados" mostra só o casado (1:N e N:1).
 * ⚠ LIB PURA: nenhum React. O que é parcial quem decide é a tela (`ehParcial`), com a regra dela (`faltaDoExtrato`).
 */
import type { DiaConf, Pareado, ParedoN1, RestoSemPar, EspSis, EspCandidato } from './mesaDoDia';
import type { EspOfx } from '@/components/conciliacao/TabelaExtratoDoMes';

export type FiltroConferencia = 'todos' | 'sem_par' | 'casados';

export type ItemConferencia =
  | { tipo: 'pareado'; p: Pareado }
  | { tipo: 'n1'; g: ParedoN1 }
  | { tipo: 'extrato_sem_par'; e: EspOfx }
  | { tipo: 'interna'; s: EspSis }
  | { tipo: 'lanc_sem_par'; s: EspSis }
  | { tipo: 'resto'; r: RestoSemPar }
  | { tipo: 'candidato'; c: EspCandidato };

const valorDe = (i: ItemConferencia): number => {
  switch (i.tipo) {
    case 'pareado': return i.p.extrato.valor;
    case 'n1': return i.g.sis.valor_assinado;
    case 'extrato_sem_par': return i.e.valor;
    case 'interna': case 'lanc_sem_par': return i.s.valor_assinado;
    case 'resto': return i.r.resto;
    case 'candidato': return i.c.valor_assinado;
  }
};
const porValor = (itens: ItemConferencia[]) =>
  itens.map((item, pos) => ({ item, pos }))
    .sort((a, b) => Math.abs(valorDe(b.item)) - Math.abs(valorDe(a.item)) || a.pos - b.pos)
    .map((x) => x.item);

/** As linhas do dia, na ordem da tela e já filtradas. Vazio = o dia não aparece. */
export function itensDoDia(d: DiaConf, filtro: FiltroConferencia, o: { mostrarCandidatos: boolean; ehParcial: (p: Pareado) => boolean }): ItemConferencia[] {
  const movimentos: ItemConferencia[] = [
    ...d.pareados.filter((p) => filtro !== 'sem_par' || o.ehParcial(p)).map((p): ItemConferencia => ({ tipo: 'pareado', p })),
    ...(filtro === 'sem_par' ? [] : d.paredosN1.map((g): ItemConferencia => ({ tipo: 'n1', g }))),
    ...(filtro === 'casados' ? [] : [
      ...d.extratosSemPar.map((e): ItemConferencia => ({ tipo: 'extrato_sem_par', e })),
      ...d.internas.map((s): ItemConferencia => ({ tipo: 'interna', s })),
      ...d.lancsSemPar.map((s): ItemConferencia => ({ tipo: 'lanc_sem_par', s })),
      ...d.restos.map((r): ItemConferencia => ({ tipo: 'resto', r })),
    ]),
  ];
  const candidatos: ItemConferencia[] = filtro === 'casados' || !o.mostrarCandidatos ? []
    : d.candidatos.map((c): ItemConferencia => ({ tipo: 'candidato', c }));
  return [...porValor(movimentos), ...porValor(candidatos)];
}

/** "12 movimentos · 1 sem par" do cabeçalho do dia, e o "(N sem par)" do fechamento. Movimento = linha do BANCO. */
export function contagemDoDia(d: DiaConf, ehParcial: (p: Pareado) => boolean) {
  const movimentos = d.pareados.length + d.paredosN1.reduce((a, g) => a + g.extratos.length, 0) + d.extratosSemPar.length;
  const semPar = d.extratosSemPar.length + d.lancsSemPar.length + d.restos.length + d.pareados.filter(ehParcial).length;
  return { movimentos, semPar };
}

/** Os números dos chips: Casados (linhas do banco casadas) · Sem par (do banco e do sistema, o parcial incluído) · Todos. */
export function contagensDaMesa(dias: readonly DiaConf[], ehParcial: (p: Pareado) => boolean) {
  let casados = 0, semPar = 0, internas = 0;
  for (const d of dias) {
    casados += d.pareados.filter((p) => !ehParcial(p)).length + d.paredosN1.reduce((a, g) => a + g.extratos.length, 0);
    semPar += contagemDoDia(d, ehParcial).semPar;
    internas += d.internas.length;
  }
  return { todos: casados + semPar + internas, casados, semPar };
}

/** "Quinta-feira · 01/10" */
export function rotuloDoDia(iso: string | null): string {
  if (!iso) return 'sem data';
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  const semana = new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long' });
  /* P159e (mock `mock-casar-abas-v1.html`): a data inteira, dd/mm/aaaa */
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)} · ${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
