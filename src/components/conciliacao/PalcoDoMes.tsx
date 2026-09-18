import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Link2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoeda } from '@/lib/calculos/formatters';
import {
  useConciliacaoDoMes, contarBaldes, frameDoRodape,
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

export function PalcoDoMes({ clienteId, contaId, contaNome, ano, mes, aoFechar, aoMudar }: Props) {
  const { movimentos, loading, recarregar } = useConciliacaoDoMes(clienteId, contaId, ano, mes);
  const [filtro, setFiltro] = useState<FiltroDoPalco>('todos');
  const [conciliando, setConciliando] = useState<MovimentoConciliacao | null>(null);

  const contagem = useMemo(() => contarBaldes(movimentos), [movimentos]);

  /* ⚠ O FILTRO LÊ O MESMO CAMPO QUE O CONTADOR — a regra do original. Os baldes
     de fato (`parcial`, `conciliado`) filtram pela `situacao`, que é o vínculo;
     os de sugestão, pelo `estado` que a RPC devolveu. Nada é recalculado. */
  const visiveis = useMemo(() => {
    if (filtro === 'todos') return movimentos;
    if (filtro === 'sem_vinculo') return movimentos.filter(m => m.situacao === 'nao_conciliado');
    return movimentos.filter(m => m.situacao === filtro);
  }, [movimentos, filtro]);

  const contagemDoChip = (f: FiltroDoPalco): number => {
    switch (f) {
      case 'todos':       return contagem.todos;
      case 'conciliado':  return contagem.conciliado;
      case 'parcial':     return contagem.parcial;
      case 'sem_vinculo': return contagem.sem_vinculo;
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
              const vazio = n === 0;
              return (
                <button key={chip.filtro} type="button"
                  disabled={vazio}
                  onClick={() => setFiltro(chip.filtro)}
                  className={cn(
                    'inline-flex h-5 items-center rounded px-1.5 text-[10px] font-semibold transition',
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
                await aoMudar?.();
              }}
            />
          </div>

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
                    <Th className="text-left">Conciliado com</Th>
                    <Th className="w-[92px] text-right">Valor</Th>
                    <Th className="w-[86px] text-right"> </Th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map(m => {
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
                          <EstadoBadge situacao={m.situacao} />
                        </td>
                        {/* ⚠ SÓ O VÍNCULO REAL — PR-PALCO-SEM-MOTOR-01. A coluna mostrava DUAS
                            naturezas: o par gravado (com ✓) e o palpite do motor. O palpite saiu
                            com o motor; o ✓ FICA, que é o que PR-PALCO-VINCULO-01 trouxe e
                            continua sendo fato do banco.
                            ⚠ VAZIA QUANDO NÃO HÁ VÍNCULO, e não "—" nem "calculando…": o traço é
                            a sentinela de dado AUSENTE, e aqui não falta dado nenhum — o
                            movimento simplesmente ainda não foi conciliado, o que a coluna
                            "Estado" ao lado já diz. Repetir a mesma ausência em duas colunas é
                            ruído, e foi de onde saíram todos os enganos desta tela. */}
                        <td className="h-[21px] max-w-0 truncate px-2 py-0 align-middle"
                          title={m.vinculos > 0 ? (parDoVinculo(m) ?? undefined) : undefined}>
                          {m.vinculos > 0 ? <>✓ {parDoVinculo(m)}</> : null}
                        </td>
                        <td className={cn('h-[21px] whitespace-nowrap px-2 py-0 text-right align-middle font-semibold tabular-nums',
                          m.valor < 0 ? 'text-destructive' : 'text-success')}>
                          {formatMoeda(m.valor)}
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
  const base = 'rounded px-1 py-0 text-[10px] font-semibold uppercase';
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
