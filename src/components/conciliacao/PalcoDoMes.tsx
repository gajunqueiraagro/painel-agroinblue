import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoeda } from '@/lib/calculos/formatters';
import {
  useConciliacaoDoMes, contarBaldes, frameDoRodape,
  type MovimentoConciliacao, type SituacaoMovimento,
} from '@/hooks/useConciliacaoDoMes';
import { EstacaoConciliar } from '@/components/conciliacao/EstacaoConciliar';
import { TH_REGUA, TD_REGUA, TD_REGUA_TEXTO, TD_REGUA_NUM, TextoReservado } from '@/components/ui/regua-tabela';
import {
  buscarSugestoesDoMes, conciliarEmLote, fraseDoResultado, valorDoPar,
  type BaldeDoLote, type RespostaDoMotor, type ResultadoDoPar,
} from '@/lib/conciliacao/loteDeSugestoes';

/**
 * PalcoDoMes — o mês inteiro numa tela. FIN-CONCIL-PALCO-MES-01.
 * Portado de `PalcoAmplo.tsx` + `palco.ts` do `AllinBlues/financas`.
 *
 * ⚠ O PALCO NÃO CONCILIA: ele mostra e ROTEIA. Clicar numa linha abre a
 * `EstacaoConciliar` que já existe — a mesma do card do mês, sem uma variação.
 * Vincular, desfazer e as travas moram lá, e é o que a descrição do original
 * promete ao operador: "onde estão as travas". Um segundo lugar que grava seria
 * um segundo lugar para a regra divergir.
 *
 * ⚠ AS PEÇAS SÃO AS NOSSAS, e nenhuma nasceu aqui: `useConciliacaoDoMes` (os
 * movimentos), `useSugestoesDoMes` (o motor), `contarBaldes` (as contagens) e
 * `frameDoRodape` (a frase do rodapé) vieram de `useConciliacaoDoMes.ts`, onde a
 * rota paralela já os usava. Reescrever qualquer um deles criaria dois
 * contadores para a mesma pergunta.
 *
 * ⚠ O MOTOR DE SUGESTÕES SAIU DESTA TELA — PR-PALCO-SEM-MOTOR-01, decisão do Gabriel em
 * 18/09/2026, e o histórico fica porque ele explica por quê.
 *
 * A tela teve, em UM DIA, três versões do mesmo defeito:
 *   1. O motor NUNCA era chamado — as duas chamadas de `calcular()` estavam guardadas por
 *      `if (sugestoes != null)`, e `sugestoes` nasce `null`. As colunas ficavam em "—" para
 *      sempre e quem lia concluía "não há sugestão" onde ninguém tinha perguntado.
 *   2. Passou a ser chamado (447a1e91), e o "—" virou "calculando…" — que também mentia,
 *      porque a RPC morria em `57014` e a promessa nunca chegava.
 *   3. A tela passou a dizer "não calculou" com uma faixa âmbar e um "tentar de novo"
 *      (PR-PALCO-ERRO-VISIVEL-01) — honesto, e ainda assim inútil: o operador via um aviso
 *      que não tinha como resolver.
 *
 * ⚠ E O NÚMERO É O ARGUMENTO: `fn_sugestoes_extrato` leva 9.907 ms na Vera Ligia · Itaú
 * Personalite · set/26 (35 movimentos, 283 ms cada), contra `statement_timeout` de 8 s do papel
 * `authenticated`. Cabem ~28 movimentos no teto, e 45 dos 64 pares conta/mês de 2026 passam
 * disso — 70,3% das telas, média de 68 movimentos, maior mês com 262. Não é lentidão de mês
 * grande: é a maioria dos meses reais.
 * ⚠ TIRAR NÃO É DESISTIR DO MOTOR: ele continua vivo na ESTAÇÃO, onde roda para UM movimento
 * por vez (`fn_candidatos_conciliacao`, 409 ms medidos) e entrega o que promete. O que saiu foi
 * a varredura do mês inteiro, que é o caminho que não escala.
 * ⚠ E O CUSTO DE DEIXAR ERA MAIOR QUE O DE TIRAR: uma coluna que não responde ocupa espaço,
 * exige explicação e ensina o operador a ignorar a tela. Uma tela que mostra menos e não mente
 * vale mais que uma que promete e falha.
 *
 * ⚠ O NÚMERO "13,7 ms em 35 movimentos" QUE JÁ ESTEVE ESCRITO AQUI ERA 725× ERRADO — vinha de
 * um LEFT JOIN replicado à mão, não da função. Foi ele que serviu de prova para o motor passar
 * a rodar sozinho ao abrir. Fica registrado porque um número medido no caminho errado não é
 * menos perigoso que nenhum: ele convence.
 *
 * ⚠ O VÍNCULO REAL FICOU, e é o que a coluna "Conciliado com" mostra: `✓` mais a descrição do
 * lançamento que casou (PR-PALCO-VINCULO-01). Isso é fato do banco, não palpite, e é a única
 * coisa que aquela coluna afirma agora.
 */
interface Props {
  clienteId: string | null;
  contaId: string | null;
  contaNome: string;
  ano: number;
  mes: number;
  aoFechar: () => void;
  /** Recarrega o card do mês depois de um vínculo feito daqui. */
  aoMudar?: () => void | Promise<void>;
}

/* ⚠ A ORDEM É A DO TRABALHO, não a do alfabeto — copiada de `palco.ts`:
   primeiro o que se resolve num clique, depois o que exige a mão, e por último o
   que já está fechado. As cores são as mesmas do original; todas existem aqui
   com o mesmo nome, então nenhuma tradução de token foi necessária. */
/**
 * ⚠ OS QUATRO CHIPS DO MOTOR SAÍRAM — PR-PALCO-SEM-MOTOR-01. Eram `match direto`, `provável`,
 * `ambíguo` e `sem match`, e os quatro liam o `estado` que `fn_sugestoes_extrato` devolvia. Sem
 * o motor, eles não teriam o que contar — e um chip permanentemente desabilitado é pior que
 * chip nenhum: ele anuncia uma capacidade que a tela não tem.
 * ⚠ OS TRÊS QUE FICAM SÃO FATO DO BANCO — `conciliado`, `parcial` e `sem vínculo` saem da
 * `situacao`, que é a soma dos `valor_aplicado` ativos. Nenhum depende de palpite, e por isso
 * nenhum pode ficar "ausente": a contagem é sempre um número.
 */
type FiltroDoPalco = 'todos' | 'parcial' | 'conciliado' | 'sem_vinculo';
const CHIPS: readonly { filtro: FiltroDoPalco; rotulo: string; cor: string }[] = [
  { filtro: 'todos',       rotulo: 'Todos',        cor: 'bg-muted text-muted-foreground' },
  { filtro: 'sem_vinculo', rotulo: 'sem vínculo',  cor: 'bg-destructive/10 text-destructive' },
  { filtro: 'parcial',     rotulo: 'parcial',      cor: 'bg-primary/10 text-primary' },
  { filtro: 'conciliado',  rotulo: 'conciliados',  cor: 'bg-success/15 text-success' },
] as const;

/* P124 — os três baldes da SUGESTÃO (do motor, depois do "Buscar sugestões do mês"), ao lado dos do vínculo. */
type FiltroDaSugestao = 'nenhum' | BaldeDoLote;
const CHIPS_SUGESTAO: readonly { filtro: BaldeDoLote; rotulo: string }[] = [
  { filtro: 'exata', rotulo: 'exata' },
  { filtro: 'conferir', rotulo: 'a conferir' },
  { filtro: 'sem', rotulo: 'sem sugestão' },
];

/**
 * P124 (CONC-LOTE-SUGESTOES-01, Gabriel 28/10/2026, mock `mock-conciliar-lote-v1.html`) — O LOTE SUBSTITUI A CAIXA "Vincular os
 * exatos" (decisão 1): uma régua só, a do motor (`fn_candidatos_conciliacao`). "Buscar sugestões do mês" é GESTO (decisão 5): roda o
 * motor de cada movimento em aberto, 4 de cada vez, e a coluna "Sugestão do sistema" passa a dizer o par (status, favorecido, vencimento,
 * valor, Δ R$, Δ dias). A EXATA vem marcada; a conferir e a de empate, desmarcadas. "Conciliar selecionados (N)" mostra antes o resumo
 * e grava PAR A PAR pelo gravador de hoje (decisão 3); cada linha diz ✓ ou a recusa do banco, e um recusado não para os outros.
 * O palco continua roteando: clicar na linha (ou "procurar ›"/"abrir") abre a estação, onde estão as travas.
 */
export function PalcoDoMes({ clienteId, contaId, contaNome, ano, mes, aoFechar, aoMudar }: Props) {
  const { movimentos, loading, recarregar } = useConciliacaoDoMes(clienteId, contaId, ano, mes);
  const [filtro, setFiltro] = useState<FiltroDoPalco>('todos');
  const [filtroSug, setFiltroSug] = useState<FiltroDaSugestao>('nenhum');
  const [conciliando, setConciliando] = useState<MovimentoConciliacao | null>(null);
  const [sugestoes, setSugestoes] = useState<Map<string, RespostaDoMotor> | null>(null);
  const [buscando, setBuscando] = useState<{ feitos: number; total: number } | null>(null);
  const [marcados, setMarcados] = useState<ReadonlySet<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [gravando, setGravando] = useState<{ feitos: number; total: number } | null>(null);
  const [resultados, setResultados] = useState<ReadonlyMap<string, ResultadoDoPar>>(new Map());
  const [fraseLote, setFraseLote] = useState<string | null>(null);

  const contagem = useMemo(() => contarBaldes(movimentos), [movimentos]);
  const abertos = useMemo(() => movimentos.filter(m => m.situacao !== 'conciliado'), [movimentos]);
  const baldeDe = (id: string): BaldeDoLote | 'erro' | null => {
    const r = sugestoes?.get(id);
    if (!r) return null;
    return r.ok ? r.sugestao.balde : 'erro';
  };
  const contagemSug = useMemo(() => {
    const c: Record<BaldeDoLote, number> = { exata: 0, conferir: 0, sem: 0 };
    for (const m of abertos) { const r = sugestoes?.get(m.id); if (r?.ok) c[r.sugestao.balde] += 1; }
    return c;
  }, [abertos, sugestoes]);

  const visiveis = useMemo(() => {
    let v: readonly MovimentoConciliacao[] = movimentos;
    if (filtro === 'sem_vinculo') v = v.filter(m => m.situacao === 'nao_conciliado');
    else if (filtro !== 'todos') v = v.filter(m => m.situacao === filtro);
    if (filtroSug !== 'nenhum') v = v.filter(m => m.situacao !== 'conciliado' && baldeDe(m.id) === filtroSug);
    return v;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `baldeDe` lê `sugestoes`, que está na lista
  }, [movimentos, filtro, filtroSug, sugestoes]);

  const contagemDoChip = (f: FiltroDoPalco): number => {
    switch (f) {
      case 'todos':       return contagem.todos;
      case 'conciliado':  return contagem.conciliado;
      case 'parcial':     return contagem.parcial;
      case 'sem_vinculo': return contagem.sem_vinculo;
    }
  };

  /** O par que a linha conciliaria (movimento aberto + 1º candidato do motor), ou nulo. */
  const parDe = (m: MovimentoConciliacao) => {
    const r = sugestoes?.get(m.id);
    if (!r?.ok || !r.sugestao.candidato || m.situacao === 'conciliado') return null;
    return { extratoId: m.id, lancamentoId: r.sugestao.candidato.id, valor: valorDoPar(m.valorAberto, r.sugestao.candidato) };
  };
  const paresMarcados = movimentos.filter(m => marcados.has(m.id)).map(m => ({ m, par: parDe(m) })).filter(x => x.par !== null);
  const totalMarcado = paresMarcados.reduce((s, x) => s + (x.m.valor < 0 ? -1 : 1) * (x.par?.valor ?? 0), 0);

  const buscar = async () => {
    if (!clienteId || buscando) return;
    const ids = abertos.map(m => m.id);
    setBuscando({ feitos: 0, total: ids.length }); setFraseLote(null); setResultados(new Map());
    const r = await buscarSugestoesDoMes(clienteId, ids, (feitos, total) => setBuscando({ feitos, total }));
    setSugestoes(r);
    /* a EXATA vem marcada; o resto, desmarcado (a certeza é do motor) */
    setMarcados(new Set(ids.filter(id => { const x = r.get(id); return x?.ok && x.sugestao.balde === 'exata'; })));
    setBuscando(null);
  };

  const gravar = async () => {
    const pares = paresMarcados.map(x => x.par).filter((p): p is NonNullable<typeof p> => p !== null);
    if (pares.length === 0) return;
    setConfirmando(false); setGravando({ feitos: 0, total: pares.length });
    const r = await conciliarEmLote(pares, (feitos, total) => setGravando({ feitos, total }));
    setResultados(new Map(r.map(x => [x.extratoId, x])));
    setFraseLote(fraseDoResultado(r));
    setMarcados(new Set(r.filter(x => !x.ok).map(x => x.extratoId)));
    setGravando(null);
    await recarregar();
    await aoMudar?.();
  };

  const alternar = (id: string) => setMarcados(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const marcarExatas = () => setMarcados(new Set(abertos.filter(m => baldeDe(m.id) === 'exata').map(m => m.id)));
  const ocupado = !!buscando || !!gravando;
  const rodapeEsquerda = gravando ? `Conciliando ${gravando.feitos} de ${gravando.total}…`
    : buscando ? `Buscando sugestões… ${buscando.feitos} de ${buscando.total}`
    : fraseLote ?? (loading ? 'Carregando…' : frameDoRodape(contagem));

  return (
    <>
      <Dialog open onOpenChange={o => !o && !ocupado && aoFechar()}>
        <DialogContent className="flex h-[86vh] max-h-[86vh] w-[94vw] max-w-7xl flex-col gap-0 overflow-hidden p-0" data-testid="palco-do-mes">
          <DialogHeader className="shrink-0 border-b border-border px-5 py-2.5 pr-10 text-left">
            <DialogTitle className="text-base leading-none">
              Conciliação do mês · {contaNome || '—'}
            </DialogTitle>
            <DialogDescription className="text-[11px]">
              Clique na linha para abrir a estação · busque as sugestões do mês, marque e concilie em lote.
            </DialogDescription>
          </DialogHeader>

          {/* ── chips do vínculo (fato do banco) · chips da sugestão (do motor, depois de buscar) · Buscar ── */}
          <div className="flex shrink-0 items-center gap-1 border-b border-border px-5 py-1.5">
            {CHIPS.map(chip => {
              const n = contagemDoChip(chip.filtro);
              const vazio = n === 0;
              return (
                <button key={chip.filtro} type="button"
                  disabled={vazio}
                  onClick={() => setFiltro(chip.filtro)}
                  className={cn(
                    'inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded px-1.5 text-[10px] font-semibold transition',
                    chip.cor,
                    vazio
                      ? 'cursor-not-allowed opacity-40'
                      : filtro === chip.filtro
                        ? 'cursor-pointer ring-1 ring-current ring-offset-1'
                        : 'cursor-pointer hover:brightness-95',
                  )}>
                  {chip.filtro === 'todos' ? `Todos (${n})` : `${n} ${chip.rotulo}`}
                </button>
              );
            })}
            <span className="min-w-0 flex-1" />
            <span className="shrink-0 text-[10px] text-muted-foreground">Sugestão:</span>
            {/* os três da sugestão: lugar SEMPRE presente (antes de buscar, "—" no contador e desabilitados) */}
            {CHIPS_SUGESTAO.map(c => {
              const n = sugestoes ? contagemSug[c.filtro] : null;
              const ligado = filtroSug === c.filtro;
              return (
                <button key={c.filtro} type="button" disabled={n === null || n === 0}
                  onClick={() => setFiltroSug(ligado ? 'nenhum' : c.filtro)}
                  data-testid={`chip-sugestao-${c.filtro}`}
                  className={cn('inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full border px-2 text-[10px] tabular-nums',
                    ligado ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground',
                    n === null || n === 0 ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-muted')}>
                  {c.rotulo} <TextoReservado texto={n === null ? '(—)' : `(${n})`} reserva="(999)" />
                </button>
              );
            })}
            <Button type="button" size="sm" variant="outline" className="ml-1 h-6 w-[176px] shrink-0 text-[10.5px]"
              disabled={!clienteId || ocupado || loading || abertos.length === 0}
              title={abertos.length === 0 ? 'Nenhum movimento em aberto' : 'Roda o motor de cada movimento em aberto (4 de cada vez)'}
              onClick={() => { void buscar(); }} data-testid="buscar-sugestoes">
              {buscando ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Buscando…</> : sugestoes ? 'Buscar de novo' : 'Buscar sugestões do mês'}
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto" data-testid="lista-do-palco">
            {loading ? (
              <p className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Lendo o mês…
              </p>
            ) : visiveis.length === 0 ? (
              <p className="py-10 text-center text-xs text-muted-foreground">
                {movimentos.length === 0
                  ? 'Nenhum movimento importado neste mês.'
                  : 'Nenhum movimento neste filtro.'}
              </p>
            ) : (
              <table className="w-full table-fixed border-collapse" data-testid="tabela-palco">
                <colgroup>
                  {/* ⚠ MEDIDO NO GATE (28/10): os dois valores com 100px ("-R$ 99.999.999,99" pede 99); a Data com 62 (dd/mm/aaaa pede 58)
                      e o Favorecido com 10% (corta com "…" e o nome no `title`) — o que sobra vai às duas colunas de texto, e a 1000px o
                      "Movimento do banco" (pede 100) e a Sugestão (status + "empate") cabem. */}
                  <col style={{ width: '26px' }} /><col style={{ width: '62px' }} /><col /><col style={{ width: '100px' }} />
                  <col style={{ width: '72px' }} /><col /><col style={{ width: '10%' }} /><col style={{ width: '66px' }} />
                  <col style={{ width: '100px' }} /><col style={{ width: '82px' }} /><col style={{ width: '44px' }} /><col style={{ width: '58px' }} />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-primary">
                  <tr>
                    <th className={TH_REGUA} aria-label="Marcar" /><th className={cn(TH_REGUA, 'text-left')}>Data</th>
                    <th className={cn(TH_REGUA, 'text-left')}>Movimento do banco</th><th className={cn(TH_REGUA, 'text-right')}>Valor</th>
                    <th className={cn(TH_REGUA, 'text-left')}>Estado</th><th className={cn(TH_REGUA, 'text-left')}>Sugestão do sistema</th>
                    <th className={cn(TH_REGUA, 'text-left')}>Favorecido</th><th className={cn(TH_REGUA, 'text-left')}>Venc.</th>
                    <th className={cn(TH_REGUA, 'text-right')}>Valor sist.</th><th className={cn(TH_REGUA, 'text-right')}>Δ R$</th>
                    <th className={cn(TH_REGUA, 'text-right')}>Δ dias</th><th className={TH_REGUA} />
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map(m => {
                    const r = sugestoes?.get(m.id);
                    const sug = r?.ok ? r.sugestao : null;
                    const c = sug?.candidato ?? null;
                    const aberto = m.situacao !== 'conciliado';
                    const par = parDe(m);
                    const res = resultados.get(m.id);
                    const textoSug = c ? `${c.descricao ?? '—'}` : '';
                    return (
                      <tr key={m.id} data-testid="linha-palco" data-balde={aberto ? (baldeDe(m.id) ?? 'nao-buscado') : 'conciliado'}
                        className={cn('cursor-pointer border-b border-border/60 hover:bg-muted/40', marcados.has(m.id) && 'bg-primary/5')}
                        onClick={() => setConciliando(m)}>
                        <td className={cn(TD_REGUA, 'text-center')} onClick={e => e.stopPropagation()}>
                          {aberto && par && (
                            <Checkbox className="h-3 w-3" checked={marcados.has(m.id)} disabled={ocupado}
                              onCheckedChange={() => alternar(m.id)} aria-label="Marcar para conciliar" data-testid="marcar-linha" />
                          )}
                        </td>
                        <td className={cn(TD_REGUA, 'whitespace-nowrap tabular-nums')}>{brData(m.data_movimento)}</td>
                        <td className={TD_REGUA_TEXTO} title={m.descricao ?? undefined}>{m.descricao || '—'}</td>
                        <td className={cn(TD_REGUA_NUM, 'font-semibold', m.valor < 0 ? 'text-destructive' : 'text-success')}>{formatMoeda(m.valor)}</td>
                        <td className={TD_REGUA}><EstadoBadge situacao={m.situacao} /></td>
                        {/* ⚠ O VÍNCULO MANDA: com par gravado, a coluna diz COM QUEM casou (✓, fato do banco); aberto, a sugestão do motor */}
                        {!aberto || m.vinculos > 0 ? (
                          <td className={TD_REGUA_TEXTO} colSpan={6} title={m.vinculos > 0 ? (parDoVinculo(m) ?? undefined) : undefined}>
                            {m.vinculos > 0 ? <>✓ {parDoVinculo(m)}</> : null}
                          </td>
                        ) : r && 'erro' in r ? (
                          <td className={cn(TD_REGUA_TEXTO, 'text-destructive')} colSpan={6} title={r.erro}>não consegui perguntar ao motor — abra a estação</td>
                        ) : sug && !c ? (
                          <td className={cn(TD_REGUA_TEXTO, 'italic text-muted-foreground')} colSpan={6}>
                            sem sugestão · <button type="button" className="underline" onClick={e => { e.stopPropagation(); setConciliando(m); }}>procurar ›</button>
                          </td>
                        ) : c ? (<>
                          {/* o status e o "empate" fora do texto que corta (`shrink-0`): o que termina em "…" é só a descrição, e ela está
                              inteira no `title` (a regra de corte confere o texto do pedaço que corta) */}
                          <td className={cn(TD_REGUA, 'overflow-hidden')} title={`${c.status ?? ''} · ${textoSug}${sug?.empate ? ' · empate com outro lançamento' : ''}`}>
                            <span className="flex min-w-0 items-center gap-1">
                              <span className="shrink-0 rounded-full bg-muted px-1 text-[9.5px] text-muted-foreground">{c.status ?? '—'}</span>
                              <span className="min-w-0 flex-1 truncate" data-testid="sugestao-texto">{textoSug}</span>
                              {sug?.empate && <span className="shrink-0 rounded bg-amber-100 px-1 text-[9.5px] text-amber-800">empate</span>}
                            </span>
                          </td>
                          <td className={cn(TD_REGUA_TEXTO, 'text-muted-foreground')} title={c.favorecido ?? undefined}>{c.favorecido ?? '—'}</td>
                          <td className={cn(TD_REGUA, 'whitespace-nowrap tabular-nums')}>{brData(c.vencimento ?? c.dataReferencia ?? '')}</td>
                          <td className={cn(TD_REGUA_NUM, m.valor < 0 ? 'text-destructive' : 'text-success')}>{formatMoeda((m.valor < 0 ? -1 : 1) * Math.abs(c.valor))}</td>
                          <td className={cn(TD_REGUA_NUM, Math.abs(c.deltaValor) < 0.005 ? 'text-success' : 'text-destructive')}>
                            {Math.abs(c.deltaValor) < 0.005 ? 'exato' : formatMoeda(c.deltaValor)}
                          </td>
                          <td className={cn(TD_REGUA_NUM, (c.deltaDias ?? 0) > 3 && 'text-destructive')}>{c.deltaDias ?? '—'}</td>
                        </>) : (
                          <td className={TD_REGUA} colSpan={6} />
                        )}
                        <td className={cn(TD_REGUA, 'whitespace-nowrap text-right')} onClick={e => e.stopPropagation()}>
                          {res ? (
                            <span className={cn('text-[10px]', res.ok ? 'text-success' : 'text-destructive')} title={res.erro ?? 'conciliado'}
                              data-testid="resultado-par">{res.ok ? '✓' : 'recusado'}</span>
                          ) : (
                            <button type="button" className="text-[10px] underline" onClick={() => setConciliando(m)}>
                              {m.situacao === 'conciliado' ? 'Revisar' : c ? 'abrir' : 'Conciliar'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <DialogFooter className="shrink-0 items-center justify-between gap-2 border-t border-border bg-accent px-5 py-2 sm:justify-between">
            {/* fora de tabela nada termina em "…": a frase QUEBRA em até 2 linhas, num lugar de altura FIXA (a frase muda com o gesto —
                buscando, conciliando, o resultado — e o rodapé não muda de altura) */}
            <span className={cn('h-[28px] min-w-0 flex-1 overflow-hidden text-[11px] leading-[14px]', fraseLote && resultados.size > 0 && [...resultados.values()].some(x => !x.ok) ? 'text-destructive' : 'text-muted-foreground')}
              title={rodapeEsquerda} data-testid="rodape-palco">{rodapeEsquerda}</span>
            {confirmando ? (
              <>
                <span className="text-[11px]" data-testid="previa-lote">
                  <TextoReservado texto={`${paresMarcados.length} serão conciliados · total ${formatMoeda(totalMarcado)}`}
                    reserva="999 serão conciliados · total -R$ 99.999.999,99" alinhar="direita" />
                </span>
                <Button size="sm" variant="outline" className="w-[150px]" onClick={() => setConfirmando(false)}>Voltar</Button>
                <Button size="sm" className="w-[200px]" onClick={() => { void gravar(); }} data-testid="confirmar-lote">Confirmar</Button>
              </>
            ) : (
              <>
                <span className="text-[11px] text-muted-foreground" data-testid="selecionados">
                  <TextoReservado texto={`Selecionados: ${paresMarcados.length} · ${formatMoeda(totalMarcado)}`}
                    reserva="999 serão conciliados · total -R$ 99.999.999,99" alinhar="direita" />
                </span>
                <Button size="sm" variant="outline" className="w-[150px]" disabled={!sugestoes || ocupado || contagemSug.exata === 0}
                  onClick={marcarExatas} data-testid="marcar-exatas">Marcar todas as exatas</Button>
                <Button size="sm" className="w-[200px]" disabled={ocupado || paresMarcados.length === 0}
                  onClick={() => setConfirmando(true)} data-testid="conciliar-selecionados">
                  {gravando ? 'Conciliando…' : `Conciliar selecionados (${paresMarcados.length})`}
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" className="w-[70px]" disabled={ocupado} onClick={aoFechar}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ⚠ A ESTAÇÃO ABRE POR CIMA E O PALCO NÃO FECHA — pedido do briefing e
          comportamento do original: quem veio ver o mês inteiro continua nele
          depois de resolver uma linha. Ao voltar, a lista e os baldes recarregam
          da mesma fonte, então o vínculo recém-feito aparece sem F5. */}
      {conciliando && (
        <EstacaoConciliar
          movimento={conciliando}
          contaBancariaId={contaId}
          aoFechar={() => setConciliando(null)}
          aoMudar={async () => {
            await recarregar();
            await aoMudar?.();
          }}
        />
      )}
    </>
  );
}

/**
 * ⚠ O VÍNCULO MANDA, A SUGESTÃO COMPLETA. `conciliado` e `parcial` são fato do
 * banco e vencem sempre; o estado do motor só aparece onde o vínculo não diz
 * nada. Deixar uma sugestão sobrepor o vínculo seria o oposto da regra
 * vínculo-first que o `contarBaldes` protege.
 */
function EstadoBadge({ situacao }: { situacao: SituacaoMovimento }) {
  /* P124: o selo do mock — minúsculo, 9,5px, uma linha (em caixa alta ele quebrava na coluna de 72px) */
  const base = 'whitespace-nowrap rounded-full px-1.5 py-0 text-[9.5px] font-medium';
  if (situacao === 'conciliado') return <span className={cn(base, 'bg-success/15 text-success')}>conciliado</span>;
  if (situacao === 'parcial')    return <span className={cn(base, 'bg-primary/10 text-primary')}>parcial</span>;
  /* ⚠ OS QUATRO ESTADOS DO MOTOR SAÍRAM DAQUI — PR-PALCO-SEM-MOTOR-01. `match direto`,
     `provável`, `ambíguo` e `sem match` eram palpite; o que sobra é fato do vínculo, e
     "em aberto" sempre foi a resposta honesta para quem não tem par gravado. */
  return <span className={cn(base, 'bg-muted text-muted-foreground')}>em aberto</span>;
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground ${className ?? ''}`}>
      {children}
    </th>
  );
}

/**
 * O que a coluna "Lançamento" mostra num movimento JÁ VINCULADO.
 *
 * ⚠ COM DOIS OU MAIS, A CONTAGEM — e não um deles. São 43 movimentos no proto (27 com dois, um
 * com dez): escolher um para exibir esconderia os outros nove e faria a tela afirmar um par que
 * não é "o" par. `lancamentoDescricao` chega nulo nesse caso, de propósito.
 */
function parDoVinculo(m: MovimentoConciliacao): string {
  if (m.vinculos > 1) return `${m.vinculos} lançamentos · ${formatMoeda(m.valorConciliado)}`;
  const desc = m.lancamentoDescricao?.trim() || '—';
  return m.lancamentoFavorecido ? `${desc} · ${m.lancamentoFavorecido}` : desc;
}

const brData = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
