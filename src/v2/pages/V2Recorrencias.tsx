import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus, Repeat, Pencil, Play, Ban, Search, MoreHorizontal,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatMoeda } from '@/lib/calculos/formatters';
import { cn } from '@/lib/utils';
import { useFinanceiroV2 } from '@/hooks/useFinanceiroV2';
import { useRecorrencias, cancelarRecorrencia, type Recorrencia, type SituacaoRecorrencia } from '@/hooks/useRecorrencias';
import { RecorrenciaDialog } from '@/components/recorrencias/RecorrenciaDialog';
import { GerarLancamentosDialog } from '@/components/recorrencias/GerarLancamentosDialog';

/**
 * V2Recorrencias — as regras que se repetem todo mês.
 * FIN-RECORRENCIA-01, Tempo 1; layout refeito no 01d.
 *
 * ⚠ A ESTRUTURA É A DO `financas` (RecorrenciasPage + RecorrenciasTabela), com
 * os tokens traduzidos para os desta casa — `surface` virou `bg-card`, o
 * primitivo de tabela é o nosso. Nenhuma classe foi copiada por parecer certa:
 * onde a casa já tem uma régua, ela venceu a do original.
 *
 * ⚠ A DENSIDADE NÃO É DEFINIDA AQUI. Ela é o default de `components/ui/table`
 * (cabeçalho 10px, célula 11px, `py-0.5`) — um pouco maior que a do original
 * (9px/10px). Não a apertei: régua própria escrita dentro de uma tela é
 * exatamente como a consistência se perde, e o primitivo serve dezenas de
 * telas.
 *
 * ⚠ O ESTADO DA TABELA É DERIVADO, e nenhuma das colunas do fim existe no
 * banco: próxima competência sai da marca d'água, situação sai de `ativo` mais a
 * comparação com a última competência, e "gerados" é contagem por
 * `recorrencia_id`.
 *
 * ⚠ NÃO HÁ "EXCLUIR". Cancelar é `ativo = false` e NÃO apaga o que já foi
 * gerado — os lançamentos criados são lançamentos normais, editáveis e
 * conciliáveis como quaisquer outros.
 *
 * ⚠ ORDENAÇÃO E BUSCA MORAM AQUI, e não numa lib compartilhada. O original tem
 * `shared/lib/ordenacao` porque três telas de lá a usam; aqui há uma só, e criar
 * a peça compartilhada agora seria inventar arquitetura para um caso.
 */

/** O que uma coluna devolve para comparar. `null` sempre vai para o fim. */
type Chave = { texto: string } | { numero: number } | null;
type Coluna = 'descricao' | 'favorecido' | 'conta' | 'valor' | 'periodicidade' | 'proxima' | 'situacao';
type Direcao = 'asc' | 'desc';

const NUM = 'text-right tabular-nums whitespace-nowrap';
const APOIO = 'text-[10px] text-muted-foreground';

export default function V2Recorrencias() {
  const { recorrencias, loading, recarregar, clienteId } = useRecorrencias();
  const { contasBancarias } = useFinanceiroV2();
  const [editando, setEditando] = useState<Recorrencia | null | undefined>(undefined);
  const [gerando, setGerando] = useState<Recorrencia | null>(null);
  const [cancelando, setCancelando] = useState<Recorrencia | null>(null);
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<{ campo: Coluna; direcao: Direcao }>({ campo: 'descricao', direcao: 'asc' });

  /* ⚠ O NOME DA CONTA É O MESMO QUE O SELETOR MOSTRA — `nome_exibicao ||
     nome_conta`, a régua de `ContaBancariaSelect`. Escolher outro campo faria a
     lista chamar a conta de um jeito e o modal de outro. */
  const nomeConta = (id: string) => {
    const c = contasBancarias.find(x => x.id === id);
    return c ? (c.nome_exibicao || c.nome_conta) : '—';
  };

  /* ⚠ A BUSCA ALCANÇA TUDO O QUE A LINHA MOSTRA, inclusive o que veio de outro
     cadastro. Procurar "Itaú" e não achar a recorrência que está na conta Itaú
     seria a busca mentindo sobre o próprio alcance. */
  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (termo === '') return recorrencias;
    return recorrencias.filter(r =>
      [r.descricao, r.favorecidoNome ?? '', nomeConta(r.contaBancariaId), r.subcentro, ROTULO_SITUACAO[r.situacao]]
        .join(' ').toLowerCase().includes(termo));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorrencias, busca, contasBancarias]);

  const ordenadas = useMemo(() => {
    const chaveDe = (r: Recorrencia): Chave => {
      switch (ordem.campo) {
        case 'descricao': return { texto: r.descricao };
        case 'favorecido': return r.favorecidoNome ? { texto: r.favorecidoNome } : null;
        case 'conta': return { texto: nomeConta(r.contaBancariaId) };
        case 'valor': return { numero: r.valorBase };
        case 'periodicidade': return { numero: r.diaVencimento };
        /* A próxima competência só existe enquanto há o que gerar. */
        case 'proxima': return r.proximaCompetencia ? { texto: r.proximaCompetencia } : null;
        case 'situacao': return { texto: ROTULO_SITUACAO[r.situacao] };
      }
    };
    const copia = [...filtradas];
    copia.sort((a, b) => {
      const ka = chaveDe(a), kb = chaveDe(b);
      /* ⚠ VAZIO VAI PARA O FIM EM QUALQUER DIREÇÃO: uma coluna sem valor não é
         "menor", é ausente — e inverter a ordem não deve trazer os buracos para
         o topo. */
      if (ka === null && kb === null) return 0;
      if (ka === null) return 1;
      if (kb === null) return -1;
      const base = 'texto' in ka && 'texto' in kb
        ? ka.texto.localeCompare(kb.texto, 'pt-BR', { sensitivity: 'base', numeric: true })
        : 'numero' in ka && 'numero' in kb ? ka.numero - kb.numero : 0;
      return ordem.direcao === 'asc' ? base : -base;
    });
    return copia;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtradas, ordem.campo, ordem.direcao, contasBancarias]);

  /** Clicar na coluna ativa inverte; clicar em outra ordena por ela, ascendente. */
  const alternar = (campo: Coluna) => setOrdem(o =>
    o.campo === campo ? { campo, direcao: o.direcao === 'asc' ? 'desc' : 'asc' } : { campo, direcao: 'asc' });

  const confirmarCancelamento = async () => {
    if (!cancelando) return;
    const { ok, erro } = await cancelarRecorrencia(cancelando.id);
    if (!ok) { toast.error(erro ?? 'O banco recusou o cancelamento.'); return; }
    toast.success('Recorrência cancelada. Os lançamentos já gerados continuam onde estão.');
    setCancelando(null);
    await recarregar();
  };

  const Cab = ({ campo, rotulo, className }: { campo: Coluna; rotulo: string; className?: string }) => {
    const ativo = ordem.campo === campo;
    /* ⚠ A SETA É SEMPRE VISÍVEL, apagada quando a coluna não é a ativa. Mostrá-la
       só no hover esconde quais colunas ordenam — justamente a informação que o
       operador precisa antes de tentar. */
    const Seta = !ativo ? ChevronsUpDown : ordem.direcao === 'asc' ? ChevronUp : ChevronDown;
    return (
      <TableHead className={cn('cursor-pointer select-none hover:text-foreground', className)}
        onClick={() => alternar(campo)}
        aria-sort={ativo ? (ordem.direcao === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <span className="inline-flex items-center gap-0.5">
          {rotulo}
          <Seta className={cn('h-2.5 w-2.5 shrink-0', !ativo && 'opacity-30')} aria-hidden />
        </span>
      </TableHead>
    );
  };

  return (
    <div className="space-y-2 p-3">
      {/* CABEÇALHO — título, o que a tela é, e a ação à direita. */}
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[15px] font-semibold leading-none">
            <Repeat className="h-4 w-4" /> Recorrências
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            A regra que gera lançamentos previstos — nunca um lançamento
          </p>
        </div>
        <div className="flex-1" />
        <Button size="sm" className="h-7 gap-1.5 px-2.5 text-xs" disabled={!clienteId}
          title={clienteId ? undefined : 'Escolha um cliente primeiro'}
          onClick={() => setEditando(null)}>
          <Plus className="h-3 w-3" /> Nova recorrência
        </Button>
      </div>

      {loading ? (
        <p className="px-3 py-8 text-center text-xs text-muted-foreground">Carregando…</p>
      ) : recorrencias.length === 0 ? (
        /* ⚠ VAZIO COM CAMINHO, não área em branco: quem chega aqui pela primeira
           vez precisa saber o que a tela faz e como começar. */
        <div className="rounded-lg border bg-card px-3 py-10 text-center">
          <Repeat className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-[12px] font-medium">Nenhuma recorrência cadastrada</p>
          <p className="mx-auto mt-1 max-w-md text-[10px] leading-snug text-muted-foreground">
            Uma recorrência é uma regra, não um lançamento: ela gera previsões até o mês que você
            escolher. Aluguel, energia, mensalidade.
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Use o botão “Nova recorrência” para começar.
          </p>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por descrição, favorecido, conta…"
              className="h-7 pl-7 text-xs" />
          </div>

          <div className="rounded-lg border bg-card">
            {/* `table-fixed` com colgroup em PORCENTAGEM: é o que permite truncar
                com reticências em vez de quebrar a linha em duas, e a soma fecha
                em 100% — a tabela nunca gera rolagem horizontal. */}
            <Table className="table-fixed">
              <colgroup>
                <col className="w-[22%]" /><col className="w-[16%]" /><col className="w-[14%]" />
                <col className="w-[13%]" /><col className="w-[12%]" /><col className="w-[9%]" />
                <col className="w-[10%]" /><col className="w-[4%]" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <Cab campo="descricao" rotulo="Descrição" />
                  <Cab campo="favorecido" rotulo="Favorecido" />
                  <Cab campo="conta" rotulo="Conta" />
                  <Cab campo="valor" rotulo="Valor" className="text-right [&>span]:flex-row-reverse" />
                  <Cab campo="periodicidade" rotulo="Periodicidade" />
                  <Cab campo="proxima" rotulo="Próxima" />
                  <Cab campo="situacao" rotulo="Situação" />
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordenadas.map(r => {
                  const conta = nomeConta(r.contaBancariaId);
                  const favorecido = r.favorecidoNome ?? '—';
                  return (
                    <TableRow key={r.id} className={cn(r.situacao === 'cancelada' && 'opacity-55')}>
                      {/* title em toda célula truncável: a informação inteira
                          continua alcançável no hover, e a linha continua sendo
                          uma linha. */}
                      <TableCell className="truncate" title={r.descricao}>
                        <span className="font-semibold">{r.descricao}</span>
                      </TableCell>
                      <TableCell className="truncate" title={favorecido}>{favorecido}</TableCell>
                      <TableCell className="truncate" title={conta}>{conta}</TableCell>
                      {/* Cor por sinal, e o sinal já está no número. */}
                      <TableCell className={cn(NUM, r.valorBase < 0 ? 'text-destructive' : 'text-foreground')}>
                        {formatMoeda(r.valorBase)}
                      </TableCell>
                      <TableCell className="truncate">
                        Mensal<span className={cn('ml-1', APOIO)}>dia {r.diaVencimento}</span>
                      </TableCell>
                      {/* ⚠ TRAÇO QUANDO NÃO HÁ PRÓXIMA: a regra cumpriu o que
                          prometeu, e "—" diz isso melhor que uma data vazia. */}
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {r.proximaCompetencia ? mesBr(r.proximaCompetencia) : '—'}
                      </TableCell>
                      <TableCell className="truncate">
                        <SituacaoBadge s={r.situacao} />
                        {r.gerados > 0 && <span className={cn('ml-1', APOIO)}>{r.gerados}</span>}
                      </TableCell>
                      <TableCell className="px-0 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0"
                              title="Ações desta recorrência">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-xs">
                            <DropdownMenuItem onClick={() => setEditando(r)}>
                              <Pencil className="mr-2 h-3 w-3" /> Editar
                            </DropdownMenuItem>
                            {/* ⚠ GERAR SÓ ONDE HÁ O QUE GERAR: cancelada não gera
                                (a RPC recusa), concluída não tem próxima. */}
                            {r.situacao === 'ativa' && (
                              <DropdownMenuItem onClick={() => setGerando(r)}>
                                <Play className="mr-2 h-3 w-3" /> Gerar lançamentos
                              </DropdownMenuItem>
                            )}
                            {r.ativo && (
                              <DropdownMenuItem className="text-destructive" onClick={() => setCancelando(r)}>
                                <Ban className="mr-2 h-3 w-3" /> Cancelar
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {ordenadas.length === 0 && busca.trim() !== '' && (
            <p className="py-6 text-center text-[11px] text-muted-foreground">
              Nenhuma recorrência para “{busca.trim()}”.
            </p>
          )}
        </>
      )}

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

const ROTULO_SITUACAO: Record<SituacaoRecorrencia, string> = {
  ativa: 'Ativa', concluida: 'Concluída', cancelada: 'Cancelada',
};

function SituacaoBadge({ s }: { s: SituacaoRecorrencia }) {
  const base = 'rounded px-1 py-0 text-[9px] font-semibold uppercase leading-tight';
  if (s === 'ativa') return <span className={cn(base, 'bg-success/15 text-success')}>ativa</span>;
  if (s === 'concluida') return <span className={cn(base, 'bg-muted text-muted-foreground')}>concluída</span>;
  return <span className={cn(base, 'bg-destructive/10 text-destructive')}>cancelada</span>;
}

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesBr = (iso: string): string => {
  const [a, m] = iso.slice(0, 7).split('-').map(Number);
  return `${MES_CURTO[m - 1]}/${String(a).slice(2)}`;
};
