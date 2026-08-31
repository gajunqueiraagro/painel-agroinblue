import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LayoutList, FileText } from 'lucide-react';
import { formatMoeda } from '@/lib/calculos/formatters';
import {
  useConciliacaoDoMes, useSugestoesDoMes, contarBaldes, frameDoRodape,
  type MovimentoConciliacao, type SituacaoMovimento,
} from '@/hooks/useConciliacaoDoMes';
import { useSaldoGerencialDoMes, useImportacoesDaConta } from '@/hooks/useExtratoDaConta';
import { ImportacoesDialog } from '@/components/conciliacao/ImportacoesDialog';
import { EstacaoConciliar } from '@/components/conciliacao/EstacaoConciliar';

/**
 * PainelExtratoMes — o card "Extrato do mês" + o placar + a lista + a estação.
 * FIN-CONCIL-INTEGRAR-01.
 *
 * ⚠ UMA PECA, DOIS LUGARES. A aba "Importar Banco" mostra o card e a lista logo
 * abaixo do upload (para conferir o que acabou de entrar); a aba "Conciliação"
 * mostra o mesmo card com o PLACAR e o rodapé. Duas cópias divergiriam na
 * primeira mudança de coluna — e a tela toda existe para não ter dois números
 * para a mesma pergunta.
 *
 * ⚠ OS FILTROS VÊM DE FORA, sempre. Ano, mês e conta são do CABEÇALHO da tela de
 * Conciliação e valem para todas as abas — este painel não tem seletor próprio,
 * porque um seletor aqui poderia discordar do cabeçalho e a tela passaria a
 * falar de dois meses ao mesmo tempo.
 */
interface Props {
  clienteId: string | null;
  contaId: string | null;
  ano: number;
  mes: number;
  contaNome: string;
  /** Placar de baldes + rodapé — só a aba Conciliação os mostra. */
  comPlacar?: boolean;
}

export function PainelExtratoMes({ clienteId, contaId, ano, mes, contaNome, comPlacar }: Props) {
  const [verImportacoes, setVerImportacoes] = useState(false);
  const [conciliando, setConciliando] = useState<MovimentoConciliacao | null>(null);
  const [balde, setBalde] = useState<'todos' | SituacaoMovimento | 'match_direto' | 'provavel' | 'ambiguo' | 'sem_match'>('todos');

  const { movimentos, loading, recarregar } = useConciliacaoDoMes(clienteId, contaId, ano, mes);
  const saldo = useSaldoGerencialDoMes(clienteId, contaId, ano, mes);
  const importacoes = useImportacoesDaConta(clienteId, contaId);
  const sug = useSugestoesDoMes(clienteId, contaId, ano, mes);

  const contagem = useMemo(() => contarBaldes(movimentos, sug.sugestoes), [movimentos, sug.sugestoes]);
  /* ⚠ O FILTRO LÊ O MESMO CAMPO QUE O CONTADOR — a regra do original. Os baldes
     de fato filtram por `situacao` (o vínculo); os de sugestão, pelo `estado`
     que a RPC devolveu. Nenhum dos dois recalcula nada aqui. */
  const estadoPorMov = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of sug.sugestoes ?? []) m[s.extratoId] = s.estado;
    return m;
  }, [sug.sugestoes]);
  const lista = useMemo(() => {
    if (balde === 'todos') return movimentos;
    if (balde === 'conciliado' || balde === 'parcial' || balde === 'nao_conciliado') {
      return movimentos.filter(m => m.situacao === balde);
    }
    return movimentos.filter(m => estadoPorMov[m.id] === balde);
  }, [movimentos, balde, estadoPorMov]);

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* ⚠ FAIXA DE TÍTULO COPIADA DO ORIGINAL: rótulo 9px uppercase tracking-wider,
          pílula da conta em `bg-primary/10`, contagem à direita e o botão do palco.
          Fontes, alturas e espaçamentos são os de lá. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-1">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          Extrato do mês
        </span>
        {contaNome && (
          <span className="rounded-full bg-primary/10 px-2 py-0 text-[10px] font-medium text-primary">
            {contaNome}
          </span>
        )}
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground">
          {movimentos.length} movimento{movimentos.length === 1 ? '' : 's'}
        </span>
        <Button type="button" variant="outline" size="sm"
          className="h-6 gap-1 px-2 text-[10px]" onClick={() => setVerImportacoes(true)}>
          <FileText className="h-3 w-3" />
          Ver importações ({importacoes.importacoes.length})
        </Button>
        {movimentos.length > 0 && (
          <Button type="button" variant="outline" size="sm"
            className="h-6 gap-1 px-2 text-[10px]" disabled
            title="O palco amplo — o mês inteiro numa tela só — entra depois da homologação desta integração.">
            <LayoutList className="h-3 w-3" />
            Conciliar o mês
          </Button>
        )}
      </div>

      {/* ⚠ "SALDO DO MÊS (GERENCIAL)" ATÉ O IMPORTADOR NOVO — opção B, ratificada.
          O rótulo do original ("Saldo declarado pelo banco") pressupõe o LEDGERBAL
          do OFX, e ele ainda é descartado na importação: `saldo_apos` é nulo nos
          3.685 movimentos. O número que existe vem de
          `financeiro_saldos_bancarios_v2`, que é gerencial — e a pílula de origem
          ao lado impede que um saldo digitado à mão passe por extrato de banco.
          O rótulo do Financas volta quando a fonte for de banco. */}
      <div className="grid grid-cols-2 gap-x-4 border-b border-border px-3 py-1 sm:grid-cols-3">
        <Campo rotulo="Saldo do mês (gerencial)">
          <span className="flex items-baseline gap-1.5">
            {saldo.saldo == null ? '—' : formatMoeda(saldo.saldo)}
            {saldo.origem && (
              <span className="rounded-full bg-muted px-1.5 py-0 text-[9px] font-normal text-muted-foreground">
                {saldo.origem}
              </span>
            )}
          </span>
        </Campo>
        <Campo rotulo="Na data de">{saldo.anoMes ? `fim de ${saldo.anoMes}` : '—'}</Campo>
        <Campo rotulo="Conciliados">{contagem.conciliado} de {contagem.todos}</Campo>
      </div>

      {comPlacar && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-1.5">
          <Chip rotulo="Todos" n={contagem.todos} ativo={balde === 'todos'}
            onClick={() => setBalde('todos')} cor="bg-muted text-muted-foreground" />
          <Chip rotulo="conciliados" n={contagem.conciliado} ativo={balde === 'conciliado'}
            onClick={() => setBalde('conciliado')} cor="bg-success/15 text-success" />
          <Chip rotulo="parcial" n={contagem.parcial} ativo={balde === 'parcial'}
            onClick={() => setBalde('parcial')} cor="bg-primary/10 text-primary" />
          <Chip rotulo="sem vínculo" n={contagem.sem_vinculo} ativo={balde === 'nao_conciliado'}
            onClick={() => setBalde('nao_conciliado')} cor="bg-destructive/10 text-destructive" />
          <span className="mx-1 h-4 w-px bg-border" />
          {/* ⚠ SOB DEMANDA — a medição mandou: o motor roda uma vez por movimento
              (~91 ms cada, EXPLAIN ANALYZE), e calcular a cada abertura faria a
              tela parecer travada para quem só queria ver a lista. O botão diz
              por quê; até ser apertado, os três ficam AUSENTES, não zerados. */}
          {contagem.match_direto == null ? (
            <Button type="button" variant="outline" size="sm" className="h-5 gap-1 px-2 text-[10px]"
              disabled={sug.carregando || movimentos.length === 0}
              title={movimentos.length === 0
                ? 'Não há movimentos neste mês para sugerir.'
                : 'Consulta o motor de candidatos, uma vez por movimento. Fica sob demanda até a medição do app confirmar o ganho dos índices.'}
              onClick={() => { void sug.calcular(); }}>
              {sug.carregando ? 'Calculando…' : 'Calcular sugestões'}
            </Button>
          ) : (<>
            <Chip rotulo="match direto" n={contagem.match_direto} ativo={balde === 'match_direto'}
              onClick={() => setBalde('match_direto')} cor="bg-success/15 text-success" />
            <Chip rotulo="provável" n={contagem.provavel ?? 0} ativo={balde === 'provavel'}
              onClick={() => setBalde('provavel')} cor="bg-primary/10 text-primary" />
            <Chip rotulo="ambíguo" n={contagem.ambiguo ?? 0} ativo={balde === 'ambiguo'}
              onClick={() => setBalde('ambiguo')} cor="bg-amber-500/15 text-amber-700 dark:text-amber-400" />
            <Chip rotulo="sem match" n={contagem.sem_match ?? 0} ativo={balde === 'sem_match'}
              onClick={() => setBalde('sem_match')} cor="bg-destructive/10 text-destructive" />
          </>)}
        </div>
      )}

      {loading ? (
        <div className="space-y-1 p-2">
          {[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-4 w-full" />)}
        </div>
      ) : movimentos.length === 0 ? (
        <p className="px-3 py-8 text-center text-xs text-muted-foreground">
          Nenhum movimento importado neste mês.
        </p>
      ) : (
        /* ⚠ SÓ AS LINHAS ROLAM, como no original: o bloco de saldo e o placar
           ficam parados e o `thead` é `sticky`. Rolar a página levaria o resumo
           embora junto — que é o que o cabeçalho fixo existe para impedir. */
        <div className="max-h-[calc(100vh-26rem)] min-h-[9rem] overflow-auto">
          <table className="w-full border-collapse text-[10px]">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border">
                <Th className="text-left">Data</Th>
                <Th className="text-left">Descrição</Th>
                <Th className="text-left">Doc</Th>
                <Th className="text-right">Valor</Th>
                <Th className="text-center">Situação</Th>
                <Th className="text-right"> </Th>
              </tr>
            </thead>
            <tbody>
              {lista.map(m => (
                <tr key={m.id} className="border-b border-border/60 hover:bg-muted/40">
                  <td className="whitespace-nowrap px-2 py-1 tabular-nums">{brData(m.data_movimento)}</td>
                  <td className="max-w-0 truncate px-2 py-1" title={m.descricao ?? ''}>{m.descricao ?? '—'}</td>
                  <td className="whitespace-nowrap px-2 py-1 font-mono text-muted-foreground">{m.documento || '—'}</td>
                  {/* Cor por sinal, e o sinal já está escrito no número — a cor
                      acompanha, nunca é o único canal. */}
                  <td className={`whitespace-nowrap px-2 py-1 text-right tabular-nums ${
                    m.valor < 0 ? 'text-destructive' : 'text-success'}`}>
                    {formatMoeda(m.valor)}
                  </td>
                  <td className="px-2 py-1 text-center"><SituacaoBadge situacao={m.situacao} /></td>
                  <td className="px-2 py-1 text-right">
                    <Button type="button" variant="ghost" size="sm"
                      className="h-5 px-1.5 text-[10px] text-primary"
                      onClick={() => setConciliando(m)}>
                      Revisar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {comPlacar && (
        <div className="px-3 py-1.5 text-[10px] text-muted-foreground">{frameDoRodape(contagem)}</div>
      )}

      <ImportacoesDialog
        aberto={verImportacoes} aoFechar={() => setVerImportacoes(false)}
        contaNome={contaNome} importacoes={importacoes.importacoes}
        carregando={importacoes.loading} aoDesfazer={importacoes.desfazer}
        desfazendo={importacoes.desfazendo}
      />
      {conciliando && (
        <EstacaoConciliar movimento={conciliando} aoFechar={() => setConciliando(null)}
          aoMudar={async () => { await recarregar(); }} />
      )}
    </div>
  );
}

function Chip({ rotulo, n, cor, ativo, onClick }: {
  rotulo: string; n: number; cor: string; ativo: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${cor} ${
        ativo ? 'ring-2 ring-primary/50' : 'opacity-80 hover:opacity-100'}`}>
      {n} {rotulo}
    </button>
  );
}

function SituacaoBadge({ situacao }: { situacao: SituacaoMovimento }) {
  if (situacao === 'conciliado') {
    return <span className="rounded bg-success/15 px-1 py-0 text-[9px] font-semibold uppercase text-success">conciliado</span>;
  }
  if (situacao === 'parcial') {
    return <span className="rounded bg-primary/10 px-1 py-0 text-[9px] font-semibold uppercase text-primary">parcial</span>;
  }
  return <span className="rounded bg-muted px-1 py-0 text-[9px] font-semibold uppercase text-muted-foreground">em aberto</span>;
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={`px-2 py-1 font-semibold text-muted-foreground ${className ?? ''}`}>{children}</th>;
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 py-0.5">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{rotulo}</div>
      <div className="text-[11px] font-medium tabular-nums">{children}</div>
    </div>
  );
}

const brData = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
