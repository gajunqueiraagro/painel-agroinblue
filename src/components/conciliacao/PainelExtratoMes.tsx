import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LayoutList, FileText, Link2, Pencil } from 'lucide-react';
import { formatMoeda } from '@/lib/calculos/formatters';
import {
  useConciliacaoDoMes, useSugestoesDoMes, contarBaldes, frameDoRodape,
  type MovimentoConciliacao, type SituacaoMovimento,
} from '@/hooks/useConciliacaoDoMes';
import { useSaldoGerencialDoMes, useSaldoSistemaNaPosicao, useImportacoesDaConta } from '@/hooks/useExtratoDaConta';
import { SaldoRealDialog } from '@/components/conciliacao/SaldoRealDialog';
import { ImportacoesDialog } from '@/components/conciliacao/ImportacoesDialog';
import { EstacaoConciliar } from '@/components/conciliacao/EstacaoConciliar';
import { PalcoDoMes } from '@/components/conciliacao/PalcoDoMes';
import { LancarMesEmMassa } from '@/components/conciliacao/LancarMesEmMassa';

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
  const [verPalco, setVerPalco] = useState(false);
  const [conciliando, setConciliando] = useState<MovimentoConciliacao | null>(null);
  const [balde, setBalde] = useState<'todos' | SituacaoMovimento | 'match_direto' | 'provavel' | 'ambiguo' | 'sem_match'>('todos');

  const { movimentos, loading, recarregar } = useConciliacaoDoMes(clienteId, contaId, ano, mes);
  const saldo = useSaldoGerencialDoMes(clienteId, contaId, ano, mes);
  const sistema = useSaldoSistemaNaPosicao(
    clienteId, contaId, saldo.anoMes, saldo.saldoInicial, saldo.posicaoEm);
  const [editandoSaldo, setEditandoSaldo] = useState(false);
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
        {/* ⚠ O BOTÃO DEIXOU DE SER MORTO — FIN-CONCIL-PALCO-MES-01. Estava
            desabilitado com o motivo escrito desde a portagem; o palco existe
            agora e ele abre. Segue sumindo com o mês vazio: não há mês inteiro
            para mostrar quando não há movimento. */}
        {/* ⚠ O PRIMEIRO PASSO DO FLUXO DO NJ mora aqui, ao lado das outras ações
            do mês: importar o OFX, lançar tudo cru e conciliado, e só então
            classificar pelo Excel. */}
        {movimentos.length > 0 && (
          <LancarMesEmMassa
            movimentos={movimentos}
            contaBancariaId={contaId}
            aoConcluir={async () => { await recarregar(); }}
          />
        )}
        {movimentos.length > 0 && (
          <Button type="button" variant="outline" size="sm"
            className="h-6 gap-1 px-2 text-[10px]"
            title="Ver o mês inteiro com as sugestões do motor, numa tela só."
            onClick={() => setVerPalco(true)}>
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
      <div className="grid grid-cols-2 gap-x-4 border-b border-border px-3 py-1 sm:grid-cols-4">
        {/* ⚠ POSIÇÃO CONTRA POSIÇÃO — FIN-SALDO-POSICAO-01. O sistema é somado
            ATÉ a data declarada, e não até o fim do mês: um extrato consultado em
            13/08 declara a posição daquele dia, e compará-la com o fechamento
            acusaria uma diferença que é só o resto do mês. */}
        <Campo rotulo={`Saldo no sistema (até ${diaMesBr(saldo.posicaoEm)})`}>
          {sistema.saldoSistema == null ? '—' : formatMoeda(sistema.saldoSistema)}
        </Campo>

        <Campo rotulo={`Saldo extrato (${diaMesBr(saldo.posicaoEm)})`}>
          <span className="flex items-baseline gap-1.5">
            {saldo.saldo == null ? '—' : formatMoeda(saldo.saldo)}
            {saldo.origem && (
              <span className="rounded-full bg-muted px-1.5 py-0 text-[9px] font-normal text-muted-foreground">
                {saldo.origem}
              </span>
            )}
            {/* O lápis: a porta para declarar o saldo e a posição. */}
            {clienteId && contaId && (
              <button type="button" onClick={() => setEditandoSaldo(true)}
                className="text-muted-foreground hover:text-foreground"
                title="Informar o saldo real do banco e a data da posição.">
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </span>
        </Campo>

        {/* ⚠ "—" QUANDO NÃO SE PERGUNTOU. Sem saldo declarado não há diferença a
            calcular; mostrar zero afirmaria que o mês fecha. */}
        <Campo rotulo="Diferença de saldo (o mês fecha?)">
          {saldo.saldo == null || sistema.saldoSistema == null ? '—' : (
            <span className={Math.abs(saldo.saldo - sistema.saldoSistema) < 0.01
              ? 'text-success' : 'text-destructive'}>
              {Math.abs(saldo.saldo - sistema.saldoSistema) < 0.01
                ? 'confere'
                : formatMoeda(saldo.saldo - sistema.saldoSistema)}
            </span>
          )}
        </Campo>

        <Campo rotulo="Conciliados">{contagem.conciliado} de {contagem.todos}</Campo>
      </div>

      {/* ⚠ O AVISO COBRA A ATUALIZAÇÃO, e existe porque a posição no meio do mês é
          declaração TEMPORÁRIA: a cadeia mensal segue lendo `saldo_final` como
          fim de mês. Sem esta linha, o operador informaria a posição de 13/08 e
          fecharia o mês achando que conferiu agosto inteiro. */}
      {saldo.saldo != null && sistema.aposPosicao > 0 && (
        <div className="border-b border-border bg-destructive/5 px-3 py-1 text-[10px] leading-snug text-destructive">
          {sistema.aposPosicao} realizado{sistema.aposPosicao === 1 ? '' : 's'} após{' '}
          {diaMesBr(saldo.posicaoEm)} não conferido{sistema.aposPosicao === 1 ? '' : 's'} — informe o
          saldo de uma data mais recente para o mês fechar.
        </div>
      )}

      {/* A frase de rodapé: qual data a diferença usou, dita sem o operador
          precisar abrir o modal para descobrir. */}
      {saldo.saldo != null && (
        <div className="border-b border-border px-3 py-0.5 text-[9px] leading-snug text-muted-foreground">
          {saldo.posicaoDeclarada
            ? `A diferença compara a posição de ${diaMesBr(saldo.posicaoEm)}, que é a data declarada pelo banco — e não o fim do mês.`
            : `Sem posição declarada: a diferença compara o fim do mês (${diaMesBr(saldo.posicaoEm)}). Informe a data no lápis para conferir posição contra posição.`}
        </div>
      )}

      {editandoSaldo && clienteId && contaId && (
        <SaldoRealDialog
          clienteId={clienteId} contaId={contaId} contaNome={contaNome}
          ano={ano} mes={mes}
          saldoAtual={saldo.saldo} saldoDataAtual={saldo.saldoData}
          aoFechar={() => setEditandoSaldo(false)}
          aoSalvar={() => { saldo.recarregarSaldo(); }}
        />
      )}

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
          {/* ⚠ SOB DEMANDA — a medição mandou: o motor roda uma vez por movimento,
              e calcular a cada abertura faria a tela parecer travada para quem só
              queria ver a lista. O botão diz por quê; até ser apertado, os três
              ficam AUSENTES, não zerados. */}
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
        /* ⚠ A ALTURA AGORA E' NOSSA, e a conta esta escrita — B-28, item 6. O
           `23.2rem` que veio do original era medido para a PILHA DELE (319px
           acima da tabela + 52px de respiro do shell); a nossa tem um bloco a
           mais que a de la', a regua de doze cards de mes, e por isso o numero
           herdado sobrava.
           A CONTA, em duas parcelas verificaveis:
             a) a linha custa 19px — as celulas sao `py-0`, entao quem define a
                altura e' o botao `h-[18px]` da ponta, mais 1px de `border-b`;
             b) a homologacao do B-27 mediu na tela real que faltavam 5 linhas.
                5 x 19px = 95px = 5.94rem.
             23.2rem - 5.94rem = 17.26rem, arredondado para 17.3rem.
           ⚠ A PARCELA (b) E' MEDIDA NO NAVEGADOR, NAO CALCULADA AQUI, e e' de
           proposito: somar a pilha por CSS exigiria o shell do /v2, que este
           ambiente nao renderiza. Estimar aquilo foi o que produziu o `26rem`
           errado antes. O `min-h` segue impedindo que a area suma em tela curta. */
        <div className="max-h-[calc(100vh-17.3rem)] min-h-[9rem] overflow-auto">
          <table className="w-full border-collapse text-[10px]">
            <thead className="sticky top-0 z-10 bg-muted/60">
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
              {/* ⚠ `py-0` NAS CELULAS, como no original: a altura da linha passa a
                  vir do conteudo, e quem a define e' o botao `h-[18px]` da ponta.
                  Com `py-1` a linha custava ~29px; assim custa ~19px. Densidade e'
                  quantas linhas cabem sem rolar. */}
              {lista.map(m => (
                <tr key={m.id} className="border-b border-border/60 hover:bg-muted/40">
                  <td className="whitespace-nowrap px-2 py-0 font-mono">{brData(m.data_movimento)}</td>
                  <td className="w-full max-w-0 truncate px-2 py-0" title={m.descricao ?? ''}>{m.descricao ?? '—'}</td>
                  <td className="whitespace-nowrap px-2 py-0 font-mono text-muted-foreground">{m.documento || '—'}</td>
                  {/* Cor por sinal, e o sinal já está escrito no número — a cor
                      acompanha, nunca é o único canal. */}
                  <td className={`whitespace-nowrap px-2 py-0 text-right font-medium tabular-nums ${
                    m.valor < 0 ? 'text-destructive' : 'text-success'}`}>
                    {formatMoeda(m.valor)}
                  </td>
                  <td className="px-2 py-0 text-center"><SituacaoBadge situacao={m.situacao} /></td>
                  {/* ⚠ O BOTAO E' O DO ORIGINAL menos o tamanho: la' e' `text-[9px]`
                      e o piso de leitura desta casa e' 10px (PADROES-UI, "nada que o
                      operador precise ler desce abaixo disso"). Altura, folga, icone
                      de elo e a ausencia de `text-primary` vieram verbatim — era o
                      `text-primary` que fazia o "Revisar" sair mais escuro que o de
                      la'. */}
                  <td className="whitespace-nowrap px-2 py-0 text-right">
                    <Button type="button" variant="ghost" size="sm"
                      className="h-[18px] gap-1 px-1 text-[10px]"
                      onClick={() => setConciliando(m)}>
                      <Link2 className="h-3 w-3" />
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
          contaBancariaId={contaId}
          aoMudar={async () => { await recarregar(); }} />
      )}

      {/* ⚠ O PALCO RECEBE O MESMO ANO/MÊS/CONTA DESTE CARD — ele é a mesma
          pergunta em outra escala, não uma tela com filtro próprio. E ao fechar,
          o card recarrega: um vínculo feito lá dentro muda o "Conciliados N de M"
          daqui. */}
      {verPalco && (
        <PalcoDoMes
          clienteId={clienteId} contaId={contaId} contaNome={contaNome}
          ano={ano} mes={mes}
          aoFechar={() => setVerPalco(false)}
          aoMudar={async () => { await recarregar(); }}
        />
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
    return <span className="rounded bg-success/15 px-1 py-0 text-[10px] font-semibold uppercase text-success">conciliado</span>;
  }
  if (situacao === 'parcial') {
    return <span className="rounded bg-primary/10 px-1 py-0 text-[10px] font-semibold uppercase text-primary">parcial</span>;
  }
  return <span className="rounded bg-muted px-1 py-0 text-[10px] font-semibold uppercase text-muted-foreground">em aberto</span>;
}

/**
 * ⚠ CAIXA ALTA PEQUENA, como no original — `uppercase tracking-wide` era o que
 * faltava e o que fazia o cabecalho sair "normal e maior" no print do B-27.
 * ⚠ O `text-[9px]` do original NAO veio: o piso de leitura desta casa e' 10px
 * (docs/PADROES-UI.md). Sem tamanho proprio, o `th` herda o `text-[10px]` da
 * tabela — no piso, e nao abaixo dele.
 */
function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`px-2 py-1 font-semibold uppercase tracking-wide text-muted-foreground ${className ?? ''}`}>
      {children}
    </th>
  );
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

/** 'YYYY-MM-DD' → 'DD/MM'. Data civil, sem `Date` — fuso não muda o dia aqui. */
const diaMesBr = (iso: string): string => {
  const p = iso.slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}` : '—';
};
