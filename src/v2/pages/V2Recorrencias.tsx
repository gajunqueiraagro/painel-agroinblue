import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Repeat, Pencil, Play, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { formatMoeda } from '@/lib/calculos/formatters';
import { cn } from '@/lib/utils';
import { useRecorrencias, cancelarRecorrencia, type Recorrencia, type SituacaoRecorrencia } from '@/hooks/useRecorrencias';
import { RecorrenciaDialog } from '@/components/recorrencias/RecorrenciaDialog';
import { GerarLancamentosDialog } from '@/components/recorrencias/GerarLancamentosDialog';

/**
 * V2Recorrencias — as regras que se repetem todo mês.
 * FIN-RECORRENCIA-01, Tempo 1. Estrutura portada de `RecorrenciasPage` do
 * `AllinBlues/financas`, com o vocabulário desta casa.
 *
 * ⚠ O ESTADO DA TABELA É DERIVADO, e nenhuma das três colunas do fim existe no
 * banco: próxima competência sai da marca d'água, situação sai de `ativo` mais a
 * comparação com a última competência, e "gerados" é contagem por
 * `recorrencia_id`. Gravá-los criaria campos que envelhecem sozinhos — o padrão
 * que esta frente já caçou cinco vezes.
 *
 * ⚠ NÃO HÁ "EXCLUIR". Cancelar é `ativo = false` e NÃO apaga o que já foi
 * gerado — os lançamentos criados são lançamentos normais, editáveis e
 * conciliáveis como quaisquer outros. O texto da confirmação diz isso, porque é
 * exatamente a dúvida do operador no momento do clique.
 */
export default function V2Recorrencias() {
  const { recorrencias, loading, recarregar, clienteId } = useRecorrencias();
  const [editando, setEditando] = useState<Recorrencia | null | undefined>(undefined);
  const [gerando, setGerando] = useState<Recorrencia | null>(null);
  const [cancelando, setCancelando] = useState<Recorrencia | null>(null);

  const confirmarCancelamento = async () => {
    if (!cancelando) return;
    const { ok, erro } = await cancelarRecorrencia(cancelando.id);
    if (!ok) { toast.error(erro ?? 'O banco recusou o cancelamento.'); return; }
    toast.success('Recorrência cancelada. Os lançamentos já gerados continuam onde estão.');
    setCancelando(null);
    await recarregar();
  };

  return (
    <div className="space-y-2 p-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Repeat className="h-4 w-4" /> Recorrências
        </span>
        <span className="text-[10px] text-muted-foreground">
          A regra que se repete todo mês · os lançamentos nascem dela e são normais em todo o resto
        </span>
        <div className="flex-1" />
        <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!clienteId}
          title={clienteId ? undefined : 'Escolha um cliente primeiro'}
          onClick={() => setEditando(null)}>
          <Plus className="h-3.5 w-3.5" /> Nova recorrência
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        {loading ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">Carregando…</p>
        ) : recorrencias.length === 0 ? (
          /* ⚠ VAZIO COM CAMINHO, não área em branco: quem chega aqui pela
             primeira vez precisa saber o que a tela faz e como começar. */
          <div className="px-3 py-10 text-center">
            <Repeat className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-[12px] font-medium">Nenhuma recorrência cadastrada</p>
            <p className="mx-auto mt-1 max-w-md text-[10px] leading-snug text-muted-foreground">
              Contas que repetem todo mês — telefone, internet, mão de obra. Você cadastra a regra uma
              vez, diz de quando até quando, e gera os lançamentos do período em um clique.
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-[11px]">
            <thead className="border-b bg-muted/40">
              <tr>
                <Th className="text-left">Descrição</Th>
                <Th className="text-left">Favorecido</Th>
                <Th className="text-left">Classificação</Th>
                <Th className="text-right">Valor</Th>
                <Th className="text-center">Dia</Th>
                <Th className="text-left">Próxima</Th>
                <Th className="text-center">Gerados</Th>
                <Th className="text-center">Situação</Th>
                <Th className="text-right"> </Th>
              </tr>
            </thead>
            <tbody>
              {recorrencias.map(r => (
                <tr key={r.id} className={cn('border-b border-border/60 hover:bg-muted/40',
                  r.situacao === 'cancelada' && 'opacity-55')}>
                  <td className="max-w-0 truncate px-2 py-1 font-medium" title={r.descricao}>{r.descricao}</td>
                  <td className="max-w-0 truncate px-2 py-1 text-muted-foreground" title={r.favorecidoNome ?? ''}>
                    {r.favorecidoNome ?? '—'}
                  </td>
                  <td className="max-w-0 truncate px-2 py-1 text-muted-foreground" title={r.subcentro}>{r.subcentro}</td>
                  {/* Cor por sinal, e o sinal já está no número — a cor acompanha. */}
                  <td className={cn('whitespace-nowrap px-2 py-1 text-right font-medium tabular-nums',
                    r.valorBase < 0 ? 'text-destructive' : 'text-success')}>
                    {formatMoeda(r.valorBase)}
                  </td>
                  <td className="px-2 py-1 text-center tabular-nums text-muted-foreground">{r.diaVencimento}</td>
                  {/* ⚠ TRAÇO QUANDO NÃO HÁ PRÓXIMA: a regra cumpriu o que
                      prometeu, e "—" diz isso melhor que uma data vazia. */}
                  <td className="whitespace-nowrap px-2 py-1 tabular-nums text-muted-foreground">
                    {r.proximaCompetencia ? mesBr(r.proximaCompetencia) : '—'}
                  </td>
                  <td className="px-2 py-1 text-center tabular-nums">{r.gerados}</td>
                  <td className="px-2 py-1 text-center"><SituacaoBadge s={r.situacao} /></td>
                  <td className="whitespace-nowrap px-2 py-1 text-right">
                    <Button variant="ghost" size="sm" className="h-[18px] gap-1 px-1 text-[10px]"
                      onClick={() => setEditando(r)}>
                      <Pencil className="h-3 w-3" /> Editar
                    </Button>
                    {/* ⚠ GERAR SÓ ONDE HÁ O QUE GERAR — regra do botão que
                        explica: cancelada não gera (a RPC recusa), concluída não
                        tem próxima. */}
                    {r.situacao === 'ativa' && (
                      <Button variant="ghost" size="sm" className="h-[18px] gap-1 px-1 text-[10px]"
                        onClick={() => setGerando(r)}>
                        <Play className="h-3 w-3" /> Gerar
                      </Button>
                    )}
                    {r.ativo && (
                      <Button variant="ghost" size="sm" className="h-[18px] gap-1 px-1 text-[10px] text-destructive"
                        onClick={() => setCancelando(r)}>
                        <Ban className="h-3 w-3" /> Cancelar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editando !== undefined && (
        <RecorrenciaDialog
          recorrencia={editando} clienteId={clienteId}
          aoFechar={() => setEditando(undefined)}
          aoSalvar={async () => { await recarregar(); }}
        />
      )}

      {gerando && (
        <GerarLancamentosDialog
          recorrencia={gerando}
          aoFechar={() => setGerando(null)}
          aoGerar={async () => { await recarregar(); }}
        />
      )}

      <AlertDialog open={!!cancelando} onOpenChange={o => !o && setCancelando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar recorrência?</AlertDialogTitle>
            {/* ⚠ O TEXTO RESPONDE A DÚVIDA DO CLIQUE. "Cancelar" sugere desfazer,
                e o operador precisa saber que o passado fica — senão hesita, ou
                pior, cancela achando que limpa. */}
            <AlertDialogDescription className="text-[11px] leading-snug">
              A regra para de gerar daqui para a frente. <b>Os lançamentos já gerados NÃO são
              apagados</b> — eles continuam no financeiro, editáveis e conciliáveis como quaisquer
              outros. Você pode reativar a regra depois editando-a.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void confirmarCancelamento(); }}>
              Cancelar recorrência
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SituacaoBadge({ s }: { s: SituacaoRecorrencia }) {
  const base = 'rounded px-1 py-0 text-[10px] font-semibold uppercase';
  if (s === 'ativa') return <span className={cn(base, 'bg-success/15 text-success')}>ativa</span>;
  if (s === 'concluida') return <span className={cn(base, 'bg-muted text-muted-foreground')}>concluída</span>;
  return <span className={cn(base, 'bg-destructive/10 text-destructive')}>cancelada</span>;
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground ${className ?? ''}`}>
      {children}
    </th>
  );
}

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesBr = (iso: string): string => {
  const [a, m] = iso.slice(0, 7).split('-').map(Number);
  return `${MES_CURTO[m - 1]}/${String(a).slice(2)}`;
};
