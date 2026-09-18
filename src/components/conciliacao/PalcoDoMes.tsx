import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Link2, Loader2, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoeda } from '@/lib/calculos/formatters';
import {
  useConciliacaoDoMes, useSugestoesDoMes, contarBaldes, frameDoRodape,
  type MovimentoConciliacao, type SituacaoMovimento,
} from '@/hooks/useConciliacaoDoMes';
import { EstacaoConciliar } from '@/components/conciliacao/EstacaoConciliar';
import { VincularMatchDireto } from '@/components/conciliacao/VincularMatchDireto';

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
 * ⚠ AS SUGESTÕES SÃO PEDIDAS AO ABRIR, e desde PR-PALCO-SUGESTOES-01 isto é verdade —
 * antes o comentário afirmava e o código não fazia. As duas únicas chamadas de `calcular()`
 * estavam dentro de `if (sug.sugestoes != null)`, e `sugestoes` NASCE `null` e volta a `null`
 * a cada troca de mês/conta: a condição nunca abria. O efeito na tela era silencioso e
 * enganoso — "Lançamento sugerido" e "Valor sug." em "—" para sempre, o badge sempre "em
 * aberto", os quatro chips do motor sempre desabilitados. Quem olhava lia "está tudo em
 * aberto"; o que havia era um motor que nunca respondeu.
 * ⚠ AS DUAS GUARDAS FICARAM, e continuam certas: elas são RE-cálculo depois de gravar
 * (vincular em lote, mexer na Estação) — "se já respondeu, refaça". Quem faz a PRIMEIRA
 * chamada é o efeito abaixo.
 * ⚠ E O NÚMERO QUE ESTAVA ESCRITO AQUI ESTAVA 725× ERRADO — corrigido em
 * PR-PALCO-ERRO-VISIVEL-01. A linha dizia "13,7 ms em 35 movimentos e 276,6 ms em 219", e
 * aquilo era o LEFT JOIN REPLICADO à mão numa medição de plano, não a função. Medido em
 * 18/09/2026 pelo caminho de verdade, como `authenticated` e com o JWT real:
 *     fn_sugestoes_extrato  ·  Vera Ligia · Itaú Personalite · set/26 · 35 movimentos
 *     9.907 ms  —  283 ms por movimento  (fn_candidatos_conciliacao sozinha: 409 ms para um)
 * ⚠ E O TETO DO PAPEL É 8 s (`statement_timeout` de `authenticated`, em `pg_roles.rolconfig`),
 * então a RPC morre em `57014` e NUNCA responde neste mês. Cabem ~28 movimentos no teto; 45
 * dos 64 pares conta/mês de 2026 no proto passam disso — 70,3% das telas, média de 68
 * movimentos, maior mês com 262.
 * ⚠ ESTE PR NÃO CONSERTA A LENTIDÃO, conserta a MENTIRA: a tela passa a dizer que não
 * conseguiu calcular, em vez de prometer um cálculo que não vem. O desempenho é a frente
 * seguinte.
 * ⚠ E A LIÇÃO É A DO NÚMERO ERRADO, de novo: foi este "13,7 ms" que serviu de prova para o
 * motor passar a rodar sozinho ao abrir. Um número medido no caminho errado não é menos
 * perigoso que nenhum — ele convence.
 *
 * ⚠ OS "~91 ms POR MOVIMENTO" QUE ESTAVAM ESCRITOS AQUI ERAM ILUSÃO DE MÊS
 * PEQUENO — a remedição deu ~6-8 s por movimento, e 190 movimentos estouravam em
 * timeout. Fica registrado porque um número errado num comentário é pior que
 * nenhum: este foi citado como evidência de que o caminho escalava.
 *
 * ⚠ E JÁ FOI CORRIGIDO, em 01/09 — não pela reescrita set-based que se supunha
 * necessária, mas por índice em `transferencia_grupo_id` mais a janela de ±60
 * dias no WHERE de `fn_candidatos_conciliacao`: o mês de 190 responde em ~3,7 s.
 * O diagnóstico "precisa ser set-based" também era do número errado.
 * ⚠ ESTE PARÁGRAFO NÃO SE SUSTENTA NA MEDIÇÃO DE 18/09, e fica com a ressalva em vez de
 * sumir: a 283 ms por movimento, um mês de 190 levaria ~54 s, não 3,7 s. Ou a correção de
 * 01/09 foi medida por outro caminho (como o "13,7 ms" acima), ou o desempenho regrediu
 * desde então. Saber qual dos dois é a primeira pergunta da frente de desempenho — e é por
 * isso que a afirmação continua escrita, marcada.
 *
 * ⚠ ESTADO AUSENTE ≠ SEM MATCH. Enquanto o motor não respondeu, a linha não
 * afirma estado nenhum — mostra a situação do VÍNCULO, que é fato do banco.
 * Escrever "sem match" antes de perguntar seria inventar resposta.
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
type FiltroDoPalco = 'todos' | 'match_direto' | 'provavel' | 'ambiguo' | 'sem_match' | 'parcial' | 'conciliado';
const CHIPS: readonly { filtro: FiltroDoPalco; rotulo: string; cor: string }[] = [
  { filtro: 'todos',        rotulo: 'Todos',        cor: 'bg-muted text-muted-foreground' },
  { filtro: 'match_direto', rotulo: 'match direto', cor: 'bg-success/15 text-success' },
  { filtro: 'provavel',     rotulo: 'provável',     cor: 'bg-primary/10 text-primary' },
  { filtro: 'ambiguo',      rotulo: 'ambíguo',      cor: 'bg-warning/15 text-warning' },
  { filtro: 'sem_match',    rotulo: 'sem match',    cor: 'bg-destructive/10 text-destructive' },
  { filtro: 'parcial',      rotulo: 'parcial',      cor: 'bg-primary/10 text-primary' },
  { filtro: 'conciliado',   rotulo: 'conciliados',  cor: 'bg-success/15 text-success' },
] as const;

export function PalcoDoMes({ clienteId, contaId, contaNome, ano, mes, aoFechar, aoMudar }: Props) {
  const { movimentos, loading, recarregar } = useConciliacaoDoMes(clienteId, contaId, ano, mes);
  const sug = useSugestoesDoMes(clienteId, contaId, ano, mes);
  const [filtro, setFiltro] = useState<FiltroDoPalco>('todos');
  const [conciliando, setConciliando] = useState<MovimentoConciliacao | null>(null);

  /* ⚠ A PRIMEIRA CHAMADA — PR-PALCO-SUGESTOES-01. É este efeito que faltava: sem ele, as duas
     chamadas guardadas por `sugestoes != null` nunca disparavam a primeira, e o palco abria
     mudo. Dispara ao montar e a cada troca de cliente/conta/mês, que é exatamente quando
     `useSugestoesDoMes` zera o que tinha.
     ⚠ SEM RISCO DE LAÇO: `calcular` é um `useCallback` estável e `sugestoes` só muda por ele —
     ele não está nas dependências, então uma resposta não pede outra. */
  const calcularSugestoes = sug.calcular;
  useEffect(() => {
    if (!clienteId || !contaId) return;
    void calcularSugestoes();
  }, [clienteId, contaId, ano, mes, calcularSugestoes]);

  /**
   * ⚠ TRÊS ESTADOS, E O DO MEIO É NOVO — PR-PALCO-ERRO-VISIVEL-01.
   *   falhouMotor      — perguntei e o banco recusou (quase sempre: passou dos 8 s).
   *   aguardandoMotor  — ainda não respondeu: ou está calculando, ou nem começou.
   *   nenhum dos dois  — respondeu, e aí o que está na lista é a resposta (vazia inclusive).
   * ⚠ A ORDEM IMPORTA: `sugestoes` é `null` nos DOIS primeiros casos, então "falhou" tem de
   * ser perguntado ANTES. Era essa colisão que fazia a tela escrever "calculando…" para
   * sempre num mês que já tinha morrido em timeout.
   */
  const falhouMotor = sug.erro != null;
  const aguardandoMotor = sug.sugestoes == null && !falhouMotor;

  /**
   * A frase do operador — e ela nomeia o TEMPO quando foi tempo.
   * ⚠ "ERRO 57014" NÃO É PORTUGUÊS DE NINGUÉM: o código fica no `title`, para quem for
   * investigar, e a linha diz o que aconteceu. Quando a causa NÃO é tempo, a frase não
   * inventa: diz que não conseguiu e mostra o motivo cru.
   */
  const foiTempo = !!sug.erro && (/57014/.test(sug.erro) || /timeout/i.test(sug.erro));
  const fraseDaFalha = foiTempo
    ? `O cálculo das sugestões passou do tempo limite do banco (8 s) — este mês tem ${movimentos.length} movimentos, e o motor leva cerca de 0,3 s em cada um.`
    : 'Não foi possível calcular as sugestões deste mês.';

  const contagem = useMemo(() => contarBaldes(movimentos, sug.sugestoes), [movimentos, sug.sugestoes]);

  /* ⚠ UM MAPA, DUAS COLUNAS: estado e sugestão saem da MESMA linha da RPC. */
  const porMovimento = useMemo(() => {
    const m = new Map<string, { estado: string; descricao: string | null; valor: number | null }>();
    for (const s of sug.sugestoes ?? []) {
      m.set(s.extratoId, { estado: s.estado, descricao: s.sugestaoDescricao, valor: s.sugestaoValor });
    }
    return m;
  }, [sug.sugestoes]);

  /* ⚠ O FILTRO LÊ O MESMO CAMPO QUE O CONTADOR — a regra do original. Os baldes
     de fato (`parcial`, `conciliado`) filtram pela `situacao`, que é o vínculo;
     os de sugestão, pelo `estado` que a RPC devolveu. Nada é recalculado. */
  const visiveis = useMemo(() => {
    if (filtro === 'todos') return movimentos;
    if (filtro === 'conciliado' || filtro === 'parcial') {
      return movimentos.filter(m => m.situacao === filtro);
    }
    return movimentos.filter(m => porMovimento.get(m.id)?.estado === filtro);
  }, [movimentos, filtro, porMovimento]);

  const contagemDoChip = (f: FiltroDoPalco): number | null => {
    switch (f) {
      case 'todos':        return contagem.todos;
      case 'conciliado':   return contagem.conciliado;
      case 'parcial':      return contagem.parcial;
      case 'match_direto': return contagem.match_direto;
      case 'provavel':     return contagem.provavel;
      case 'ambiguo':      return contagem.ambiguo;
      case 'sem_match':    return contagem.sem_match;
    }
  };

  return (
    <>
      <Dialog open onOpenChange={o => !o && aoFechar()}>
        <DialogContent className="flex h-[86vh] max-h-[86vh] w-[94vw] max-w-7xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-border px-5 py-2.5 pr-10 text-left">
            <DialogTitle className="text-base leading-none">
              Conciliação do mês · {contaNome || '—'}
            </DialogTitle>
            <DialogDescription className="text-[11px]">
              O mês inteiro numa tela. Clique na linha para abrir a estação — vincular, ajustar ou
              criar acontece lá, onde estão as travas.
            </DialogDescription>
          </DialogHeader>

          {/* ── chips ──────────────────────────────────────────────────────
              ⚠ NULO DESABILITA COM OUTRA RAZÃO QUE ZERO, e a diferença está no
              `title`: `null` é "o motor ainda não respondeu", `0` é "respondeu e
              não há". Pintar os dois igual apagaria a distinção que
              `contarBaldes` faz de propósito. */}
          <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-5 py-1.5">
            {CHIPS.map(chip => {
              const n = contagemDoChip(chip.filtro);
              const ausente = n == null;
              const vazio = n === 0;
              return (
                <button key={chip.filtro} type="button"
                  disabled={ausente || vazio}
                  onClick={() => setFiltro(chip.filtro)}
                  /* ⚠ O `title` DIZ QUAL DOS DOIS SILÊNCIOS É — PR-PALCO-ERRO-VISIVEL-01. O chip
                     fica desabilitado em ambos, mas "ainda não respondeu" sobre um mês que já
                     morreu em timeout manda o operador esperar por nada. */
                  title={ausente
                    ? (falhouMotor ? fraseDaFalha : 'O motor de sugestões ainda não respondeu para este mês.')
                    : undefined}
                  className={cn(
                    'inline-flex h-5 items-center rounded px-1.5 text-[10px] font-semibold transition',
                    chip.cor,
                    ausente || vazio
                      ? 'cursor-not-allowed opacity-40'
                      : filtro === chip.filtro
                        ? 'cursor-pointer ring-1 ring-current ring-offset-1'
                        : 'cursor-pointer hover:brightness-95',
                  )}>
                  {chip.filtro === 'todos' ? `Todos (${n ?? 0})` : `${n ?? '—'} ${chip.rotulo}`}
                </button>
              );
            })}
            {sug.carregando && (
              <span className="ml-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                procurando sugestões…
              </span>
            )}
            {/* ⚠ AO LADO DOS CHIPS, e não no rodapé: o botão age sobre UM balde,
                e fica onde o operador vê a contagem dele. Recarrega a lista e os
                baldes ao terminar, sem fechar o palco.

                ⚠ B-38 — SEM O GATE `!sug.carregando`. Enquanto o botão lia o
                balde do motor, esperar fazia sentido; agora ele varre o mês pela
                própria RPC e não depende de sugestão nenhuma. Manter o gate o
                esconderia justamente no mês grande, onde o motor demora ou dá
                timeout — o mês que mais precisa dele. */}
            <VincularMatchDireto
              clienteId={clienteId}
              contaId={contaId}
              ano={ano}
              mes={mes}
              aoConcluir={async () => {
                await recarregar();
                if (sug.sugestoes != null) await sug.calcular();
                await aoMudar?.();
              }}
            />
          </div>

          {/* ⚠ O AVISO E O CAMINHO DE VOLTA — PR-PALCO-ERRO-VISIVEL-01. Dizer "não calculou"
              nas células e parar por aí deixaria o operador sem saída: ele veria a falha e não
              teria o que fazer com ela. O botão repete a MESMA chamada — num mês de 28 ou 29
              movimentos ela às vezes passa, e quando não passa a falha se repete, que também é
              uma resposta.
              ⚠ FORA DO SCROLLPORT, e por isso irmão da tabela e não filho: um aviso que some ao
              rolar é um aviso que o operador perde justamente enquanto procura a linha que o
              motivou. */}
          {falhouMotor && (
            <div className="flex shrink-0 items-center gap-2 border-b border-amber-300/60 bg-amber-50 px-5 py-1.5 text-[10px] text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                {fraseDaFalha} As colunas de sugestão ficam sem resposta; o resto da tela é fato do
                banco e continua valendo.
              </span>
              <Button type="button" variant="outline" size="sm"
                className="h-5 shrink-0 gap-1 px-2 text-[10px]"
                disabled={sug.carregando}
                title={sug.erro ?? undefined}
                onClick={() => { void sug.calcular(); }}>
                {sug.carregando ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
                Tentar de novo
              </Button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto">
            {loading ? (
              <p className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Lendo o mês e procurando as sugestões…
              </p>
            ) : visiveis.length === 0 ? (
              <p className="py-10 text-center text-xs text-muted-foreground">
                {movimentos.length === 0
                  ? 'Nenhum movimento importado neste mês.'
                  : 'Nenhum movimento neste filtro.'}
              </p>
            ) : (
              <table className="w-full border-collapse text-[10px]">
                <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                  <tr>
                    <Th className="w-[62px] text-left">Data</Th>
                    <Th className="text-left">Descrição</Th>
                    <Th className="w-[80px] text-left">Estado</Th>
                    <Th className="text-left">Lançamento</Th>
                    {/* O DINHEIRO EM BLOCO, à direita e colado na ação: movimento
                        e sugestão lado a lado respondem de graça a pergunta que o
                        operador faz — "bate?" */}
                    <Th className="w-[92px] text-right">Valor</Th>
                    <Th className="w-[92px] text-right">Valor sug.</Th>
                    <Th className="w-[86px] text-right"> </Th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map(m => {
                    const s = porMovimento.get(m.id);
                    return (
                      <tr key={m.id}
                        className="cursor-pointer border-b border-border/60 hover:bg-muted/40"
                        onClick={() => setConciliando(m)}>
                        <td className="h-[21px] whitespace-nowrap px-2 py-0 align-middle font-mono">
                          {brData(m.data_movimento)}
                        </td>
                        {/* o que CEDE é o contexto: trunca com o inteiro no title */}
                        <td className="h-[21px] max-w-0 truncate px-2 py-0 align-middle" title={m.descricao ?? undefined}>
                          {m.descricao || '—'}
                        </td>
                        <td className="h-[21px] px-2 py-0 align-middle">
                          <EstadoBadge situacao={m.situacao} estado={s?.estado ?? null} />
                        </td>
                        {/* ⚠ UMA COLUNA, DUAS NATUREZAS, E O ✓ DIZ QUAL — PR-PALCO-VINCULO-01.
                            Ela responde sempre à mesma pergunta ("qual lançamento do sistema
                            corresponde a este movimento?"), mas a resposta ora é FATO (há vínculo
                            gravado) ora é PALPITE (o motor sugeriu). Sem marcar a diferença, a
                            coluna voltaria a enganar — é a mesma família do "—" que fazia o
                            operador ler "não há sugestão" onde ninguém tinha perguntado.
                            ⚠ ANTES ELA ESCONDIA: o conciliado imprimia "— conciliado —" e o par
                            só aparecia abrindo a Estação, uma linha por vez.
                            ⚠ "calculando…" NÃO É "—": traço é dado ausente; aqui o dado ainda não
                            chegou. */}
                        <td className={cn('h-[21px] max-w-0 truncate px-2 py-0 align-middle',
                          m.vinculos > 0 ? '' : 'text-muted-foreground')}
                          title={m.vinculos > 0 ? (parDoVinculo(m) ?? undefined) : (s?.descricao ?? undefined)}>
                          {m.vinculos > 0
                            ? <>✓ {parDoVinculo(m)}</>
                            : s?.descricao ?? <SemSugestao aguardando={aguardandoMotor} falhou={falhouMotor} />}
                        </td>
                        <td className={cn('h-[21px] whitespace-nowrap px-2 py-0 text-right align-middle font-semibold tabular-nums',
                          m.valor < 0 ? 'text-destructive' : 'text-success')}>
                          {formatMoeda(m.valor)}
                        </td>
                        <td className={cn('h-[21px] whitespace-nowrap px-2 py-0 text-right align-middle tabular-nums',
                          s?.valor != null ? (s.valor < 0 ? 'text-destructive' : 'text-success') : 'text-muted-foreground')}>
                          {s?.valor != null && s.estado !== 'sem_match' && m.situacao !== 'conciliado'
                            ? formatMoeda(s.valor)
                            : (m.situacao === 'conciliado'
                                ? '—'
                                : <SemSugestao aguardando={aguardandoMotor} falhou={falhouMotor} />)}
                        </td>
                        <td className="h-[21px] whitespace-nowrap px-2 py-0 text-right align-middle"
                          onClick={e => e.stopPropagation()}>
                          <Button type="button" variant="ghost" size="sm"
                            className="h-[18px] gap-1 px-1 text-[10px]"
                            onClick={() => setConciliando(m)}>
                            <Link2 className="h-3 w-3" />
                            {m.situacao === 'conciliado' ? 'Revisar' : 'Conciliar'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <DialogFooter className="shrink-0 items-center justify-between gap-2 border-t border-border bg-accent px-5 py-2 sm:justify-between">
            <span className="text-[11px] text-muted-foreground">
              {loading ? 'Carregando…' : frameDoRodape(contagem)}
            </span>
            <Button variant="outline" onClick={aoFechar}>Fechar</Button>
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
            /* ⚠ AS SUGESTÕES SÓ RECALCULAM SE JÁ EXISTIAM: pedir o motor aqui,
               quando ninguém o pediu antes, custaria os ~5 s no meio de um
               fluxo em que o operador só desfez um vínculo. */
            if (sug.sugestoes != null) await sug.calcular();
            await aoMudar?.();
          }}
        />
      )}
    </>
  );
}

/**
 * O que a célula de sugestão escreve quando NÃO há sugestão — PR-PALCO-ERRO-VISIVEL-01.
 *
 * ⚠ TRÊS AUSÊNCIAS DIFERENTES, TRÊS TEXTOS, e é a regra das sentinelas do CLAUDE.md levada
 * até o fim:
 *   calculando…    — perguntei e ainda não voltou. Espere.
 *   não calculou   — perguntei e o banco recusou. Não adianta esperar.
 *   sem sugestão   — perguntei, respondeu, e não achou nada. É resposta, não ausência.
 * ⚠ O "—" SAIU DAQUI, e era ele o defeito de um nível adiante: traço quer dizer "dado
 * ausente", e o motor que respondeu "não achei" não deixou dado ausente nenhum — deixou uma
 * resposta. Quem lia "—" concluía que ninguém tinha perguntado.
 * ⚠ UMA FUNÇÃO PARA AS DUAS COLUNAS: "Lançamento" e "Valor sug." respondem à mesma pergunta
 * em pedaços diferentes, e dois textos que divergissem na mesma linha seriam pior que um
 * errado.
 */
function SemSugestao({ aguardando, falhou }: { aguardando: boolean; falhou: boolean }) {
  if (falhou) return <span className="italic text-amber-700 dark:text-amber-300">não calculou</span>;
  if (aguardando) return <span className="italic">calculando…</span>;
  return <span>sem sugestão</span>;
}

/**
 * ⚠ O VÍNCULO MANDA, A SUGESTÃO COMPLETA. `conciliado` e `parcial` são fato do
 * banco e vencem sempre; o estado do motor só aparece onde o vínculo não diz
 * nada. Deixar uma sugestão sobrepor o vínculo seria o oposto da regra
 * vínculo-first que o `contarBaldes` protege.
 */
function EstadoBadge({ situacao, estado }: { situacao: SituacaoMovimento; estado: string | null }) {
  const base = 'rounded px-1 py-0 text-[10px] font-semibold uppercase';
  if (situacao === 'conciliado') return <span className={cn(base, 'bg-success/15 text-success')}>conciliado</span>;
  if (situacao === 'parcial')    return <span className={cn(base, 'bg-primary/10 text-primary')}>parcial</span>;
  switch (estado) {
    case 'match_direto': return <span className={cn(base, 'bg-success/15 text-success')}>match direto</span>;
    case 'provavel':     return <span className={cn(base, 'bg-primary/10 text-primary')}>provável</span>;
    case 'ambiguo':      return <span className={cn(base, 'bg-warning/15 text-warning')}>ambíguo</span>;
    case 'sem_match':    return <span className={cn(base, 'bg-destructive/10 text-destructive')}>sem match</span>;
    /* Sem resposta do motor, a linha diz o que sabe — e "em aberto" é o vínculo,
       não um palpite. */
    default:             return <span className={cn(base, 'bg-muted text-muted-foreground')}>em aberto</span>;
  }
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
