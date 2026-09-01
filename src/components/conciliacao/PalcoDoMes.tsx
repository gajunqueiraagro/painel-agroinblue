import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Link2, Loader2 } from 'lucide-react';
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
 * ⚠ AS SUGESTÕES SÃO SOB DEMANDA, e a medição é que decidiu: `fn_sugestoes_extrato`
 * chama `fn_candidatos_conciliacao` uma vez POR MOVIMENTO. Aqui elas são pedidas
 * ao ABRIR o palco, porque o palco existe para mostrá-las; quem só quer ver a
 * lista tem o card do mês, que não paga esse preço.
 *
 * ⚠ OS "~91 ms POR MOVIMENTO" QUE ESTAVAM ESCRITOS AQUI ERAM ILUSÃO DE MÊS
 * PEQUENO. A medição refeita deu ~6 s por movimento: 190 movimentos = timeout,
 * não os ~5,3 s que este comentário prometia. A reescrita set-based do motor é o
 * CONCIL-MOTOR-PERF-01, P0, fora desta tela. Fica registrado porque um número
 * errado num comentário é pior que nenhum: ele foi citado como evidência de que
 * o caminho escalava.
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
  { filtro: 'ambiguo',      rotulo: 'ambíguo',      cor: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  { filtro: 'sem_match',    rotulo: 'sem match',    cor: 'bg-destructive/10 text-destructive' },
  { filtro: 'parcial',      rotulo: 'parcial',      cor: 'bg-primary/10 text-primary' },
  { filtro: 'conciliado',   rotulo: 'conciliados',  cor: 'bg-success/15 text-success' },
] as const;

export function PalcoDoMes({ clienteId, contaId, contaNome, ano, mes, aoFechar, aoMudar }: Props) {
  const { movimentos, loading, recarregar } = useConciliacaoDoMes(clienteId, contaId, ano, mes);
  const sug = useSugestoesDoMes(clienteId, contaId, ano, mes);
  const [filtro, setFiltro] = useState<FiltroDoPalco>('todos');
  const [conciliando, setConciliando] = useState<MovimentoConciliacao | null>(null);

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
                  title={ausente ? 'O motor de sugestões ainda não respondeu para este mês.' : undefined}
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
                    <Th className="text-left">Lançamento sugerido</Th>
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
                        <td className="h-[21px] max-w-0 truncate px-2 py-0 align-middle text-muted-foreground"
                          title={s?.descricao ?? undefined}>
                          {m.situacao === 'conciliado' ? '— conciliado —' : (s?.descricao ?? '—')}
                        </td>
                        <td className={cn('h-[21px] whitespace-nowrap px-2 py-0 text-right align-middle font-semibold tabular-nums',
                          m.valor < 0 ? 'text-destructive' : 'text-success')}>
                          {formatMoeda(m.valor)}
                        </td>
                        <td className={cn('h-[21px] whitespace-nowrap px-2 py-0 text-right align-middle tabular-nums',
                          s?.valor != null ? (s.valor < 0 ? 'text-destructive' : 'text-success') : 'text-muted-foreground')}>
                          {s?.valor != null && s.estado !== 'sem_match' && m.situacao !== 'conciliado'
                            ? formatMoeda(s.valor)
                            : '—'}
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
    case 'ambiguo':      return <span className={cn(base, 'bg-amber-500/15 text-amber-700 dark:text-amber-400')}>ambíguo</span>;
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

const brData = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
