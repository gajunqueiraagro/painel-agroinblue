import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { LayoutList, FileText } from 'lucide-react';
import { formatMoeda } from '@/lib/calculos/formatters';
import { useCliente } from '@/contexts/ClienteContext';
import { useContasBancariasLeves, rotuloContaLeve } from '@/hooks/useContasBancariasLeves';
import {
  useConciliacaoDoMes, contarBaldes, frameDoRodape,
  type MovimentoConciliacao, type SituacaoMovimento,
} from '@/hooks/useConciliacaoDoMes';
import { useSaldoGerencialDoMes, useImportacoesDaConta } from '@/hooks/useExtratoDaConta';
import { ImportacoesDialog } from '@/components/conciliacao/ImportacoesDialog';
import { EstacaoConciliar } from '@/components/conciliacao/EstacaoConciliar';

/**
 * V2ConciliacaoExtrato — a tela de conciliação do extrato, PORTADA.
 * FIN-CONCIL-PORTAR-01, rodada 1.
 *
 * ⚠ PORTAR, NÃO REDESENHAR. A estrutura, a hierarquia e a linguagem vêm do
 * `AllinBlues/financas` (`ExtratoPage.tsx`, `palco.ts`, `ImportacoesDialog.tsx`);
 * o que troca é a FONTE — `extrato_bancario_v2` + `conciliacao_bancaria_itens` +
 * `financeiro_lancamentos_v2`. Onde uma peça de lá não tem equivalente aqui, ela
 * fica DECLARADA como ausente, nunca improvisada.
 *
 * ⚠ TELA NOVA, ROTA PRÓPRIA. As três telas antigas de conciliação seguem
 * intocadas até a homologação — elas morrem na rodada 2, e não antes: derrubar o
 * caminho velho no mesmo PR que estreia o novo tira o retorno de quem
 * homologa.
 *
 * ⚠ O QUE AINDA NÃO ESTÁ AQUI, e por quê: os três baldes de SUGESTÃO (match
 * direto, provável, ambíguo) e o painel de candidatos da estação dependem do
 * trio do motor (`v_extrato_conciliacao` + `fn_candidatos_conciliacao` +
 * `fn_sugestoes_extrato`), que está com o arquiteto. Eles aparecem como
 * AUSENTES — não como zero: "0 prováveis" afirmaria que o motor olhou e não
 * achou, quando ele ainda não olhou.
 */
export default function V2ConciliacaoExtrato({ abaImportar, abaGerencial }: {
  /* ⚠ AS DUAS OUTRAS ABAS VEM PRONTAS DE FORA — adendo do B-20. A regra e'
     TRANSFERIR, nao recriar: o importador e o extrato gerencial ja existem e
     ja funcionam, e monta-los aqui de novo seria a segunda copia de duas telas
     inteiras. O V2Index, que sabe montar as duas, passa cada uma como elemento.
     ⚠ O CONTEXTO DA REGUA NAO DESCE POR AQUI nesta rodada. O gerencial ja
     aceita `initialAno`/`initialMes` — quem monta passa os dele —, mas a CONTA
     nao tem prop equivalente (`contaSel` nasce nulo, medido). Herdar a conta
     exige uma prop nova naquele componente, e ela entra junto com a saida do
     item do menu lateral, na rodada 2. */
  abaImportar?: React.ReactNode;
  abaGerencial?: React.ReactNode;
}) {
  const [aba, setAba] = useState<'importar' | 'gerencial' | 'conciliacao'>('conciliacao');
  return (
    <div className="space-y-2 min-w-0">
      {/* ⚠ A ORDEM E A DO ORIGINAL: Importar · Extrato gerencial · Conciliacao.
          E' a ordem do TRABALHO — primeiro entra o arquivo, depois se olha o
          mes, e por fim se concilia. Trocar a ordem seria redesenhar. */}
      <div className="flex items-center gap-1 border-b">
        {([['importar', 'Importar'], ['gerencial', 'Extrato gerencial'], ['conciliacao', 'Conciliação']] as const)
          .map(([k, rot]) => (
            <button key={k} type="button" onClick={() => setAba(k)}
              className={`-mb-px border-b-2 px-3 py-1.5 text-[12px] font-medium transition-colors ${
                aba === k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {rot}
            </button>
          ))}
      </div>
      {aba === 'importar' ? (abaImportar ?? <VazioDaAba nome="Importar" />)
        : aba === 'gerencial' ? (abaGerencial ?? <VazioDaAba nome="Extrato gerencial" />)
        : <AbaConciliacao />}
    </div>
  );
}

/* ⚠ AUSENCIA COM NOME, nunca area em branco: sem o elemento, a aba diz qual e'
   e que ela nao foi montada — em vez de parecer uma tela quebrada. */
function VazioDaAba({ nome }: { nome: string }) {
  return (
    <p className="rounded-md border border-dashed px-3 py-8 text-center text-[11px] text-muted-foreground">
      A aba “{nome}” não foi montada por quem abriu esta tela.
    </p>
  );
}

function AbaConciliacao() {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  const { contas } = useContasBancariasLeves(clienteId);

  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [contaId, setContaId] = useState<string>('');
  const [verImportacoes, setVerImportacoes] = useState(false);
  const [conciliando, setConciliando] = useState<MovimentoConciliacao | null>(null);
  const [balde, setBalde] = useState<'todos' | SituacaoMovimento>('todos');

  const contaEfetiva = contaId || contas[0]?.id || '';
  const conta = contas.find(c => c.id === contaEfetiva);

  const { movimentos, loading, recarregar } = useConciliacaoDoMes(clienteId, contaEfetiva || null, ano, mes);
  const saldo = useSaldoGerencialDoMes(clienteId, contaEfetiva || null, ano, mes);
  const importacoes = useImportacoesDaConta(clienteId, contaEfetiva || null);

  const contagem = useMemo(() => contarBaldes(movimentos), [movimentos]);
  const lista = useMemo(
    () => (balde === 'todos' ? movimentos : movimentos.filter(m => m.situacao === balde)),
    [movimentos, balde],
  );

  return (
    <div className="space-y-2 min-w-0">
      {/* ─── 1. A RÉGUA DE MESES ────────────────────────────────────────────
          ⚠ A COR É O ESTADO, e ela só diz o que sabe: verde quando o mês fecha,
          vermelho quando há movimento a resolver, TRACEJADO quando não há
          extrato importado. Tracejado não é "zero conciliados" — é "não há o que
          conciliar", e são coisas diferentes.
          ⚠ A RÉGUA SÓ CONHECE O MÊS ABERTO nesta rodada: pintar os doze exigiria
          doze consultas ou uma agregação por mês, e a agregação certa é a do
          trio (`fn_sugestoes_extrato` por faixa). Os demais nascem neutros, e o
          neutro aqui é honesto — a tela não sabe. */}
      <div className="rounded-md border bg-card px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
            <SelectTrigger className="h-7 w-[92px] text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[hoje.getFullYear() - 1, hoje.getFullYear(), hoje.getFullYear() + 1].map(a => (
                <SelectItem key={a} value={String(a)} className="text-[12px]">{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-1">
            {MESES.map((rot, i) => {
              const m = i + 1;
              const ativo = m === mes;
              const estado = m === mes ? estadoDoMes(contagem) : 'desconhecido';
              return (
                <button key={m} type="button" onClick={() => setMes(m)}
                  className={`h-7 min-w-[42px] rounded px-2 text-[11px] font-medium transition-colors ${
                    ativo ? 'ring-2 ring-primary/60 ' : ''}${CLASSE_ESTADO[estado]}`}>
                  {rot}
                </button>
              );
            })}
          </div>
          <div className="flex-1" />
          <Select value={contaEfetiva} onValueChange={setContaId}>
            <SelectTrigger className="h-7 w-[200px] text-[11px]"><SelectValue placeholder="Conta" /></SelectTrigger>
            <SelectContent>
              {contas.map(c => (
                <SelectItem key={c.id} value={c.id} className="text-[12px]">{rotuloContaLeve(c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ─── 2. O CARD "EXTRATO DO MÊS" ─────────────────────────────────────
          Estrutura copiada do original (faixa de título com a pílula da conta,
          contagem à direita e o botão "Conciliar o mês"; abaixo, a grade de
          três campos).
          ⚠ "SALDO DO MÊS (GERENCIAL)" E NÃO "DECLARADO PELO BANCO" — decisão do
          Gabriel (opção B). O rótulo do original pressupõe o LEDGERBAL do OFX, e
          medimos que ele não chega ao banco: `saldo_apos` é NULO nos 3.685
          movimentos e o parser não lê a tag. O número que existe vem de
          `financeiro_saldos_bancarios_v2`, que é o saldo GERENCIAL da casa — daí
          a pílula de `origem_saldo` ao lado: ela impede que um saldo `manual` ou
          `historico_legado` passe por extrato de banco.
          ⚠ O RÓTULO ORIGINAL FICA RESERVADO para quando o importador novo
          capturar o LEDGERBAL — e a prova de que o dado existe já está feita: o
          OFX real de maio traz BALAMT 212.836,93 em 02/06. */}
      <div className="rounded-md border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-1">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Extrato do mês
          </span>
          {conta && (
            <span className="rounded-full bg-primary/10 px-2 py-0 text-[10px] font-medium text-primary">
              {rotuloContaLeve(conta)}
            </span>
          )}
          <div className="flex-1" />
          <span className="text-[10px] text-muted-foreground">
            {movimentos.length} movimento{movimentos.length === 1 ? '' : 's'}
          </span>
          <Button type="button" variant="outline" size="sm"
            className="h-6 gap-1 px-2 text-[10px]" onClick={() => setVerImportacoes(true)}>
            <FileText className="h-3 w-3" />
            Importações ({importacoes.importacoes.length})
          </Button>
          {movimentos.length > 0 && (
            <Button type="button" variant="outline" size="sm"
              className="h-6 gap-1 px-2 text-[10px]"
              title="Ver o mês inteiro com as sugestões do motor, numa tela só."
              disabled
              /* ⚠ DESABILITADO COM MOTIVO — a regra do botão que explica (B-09):
                 o palco amplo é a leitura do motor, e o motor é o trio que ainda
                 não chegou. Botão cinza sem frase ensina que o sistema é
                 arbitrário. */
              >
              <LayoutList className="h-3 w-3" />
              Conciliar o mês
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-4 border-b px-3 py-1 sm:grid-cols-3">
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
          <Campo rotulo="Na data de">
            {saldo.anoMes ? `fim de ${saldo.anoMes}` : '—'}
          </Campo>
          <Campo rotulo="Conciliados">
            {contagem.conciliado} de {contagem.todos}
          </Campo>
        </div>

        {/* ─── 3. O PLACAR ────────────────────────────────────────────────
            ⚠ TRÊS BALDES DE FATO, TRÊS AUSENTES. Conciliado, parcial e sem
            vínculo saem do VÍNCULO — a soma dos `valor_aplicado` ativos contra o
            valor do movimento, tolerância R$ 0,005. Match direto, provável e
            ambíguo são SUGESTÃO e vêm do trio do motor; até lá aparecem em cinza
            com a razão no `title`, e não zerados. */}
        <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-1.5">
          <Chip rotulo="Todos" n={contagem.todos} ativo={balde === 'todos'} onClick={() => setBalde('todos')}
            cor="bg-muted text-muted-foreground" />
          <Chip rotulo="conciliados" n={contagem.conciliado} ativo={balde === 'conciliado'}
            onClick={() => setBalde('conciliado')} cor="bg-success/15 text-success" />
          <Chip rotulo="parcial" n={contagem.parcial} ativo={balde === 'parcial'}
            onClick={() => setBalde('parcial')} cor="bg-primary/10 text-primary" />
          <Chip rotulo="sem vínculo" n={contagem.sem_vinculo} ativo={balde === 'nao_conciliado'}
            onClick={() => setBalde('nao_conciliado')} cor="bg-destructive/10 text-destructive" />
          <span className="ml-2 text-[9px] text-muted-foreground"
            title="Match direto, provável e ambíguo são sugestão do motor de candidatos, que ainda não existe neste banco. Aparecem quando o motor entrar — zerá-los agora afirmaria que ele olhou e não achou.">
            match direto · provável · ambíguo — aguardando o motor de sugestões
          </span>
        </div>

        {/* ─── 4. A LISTA DO MÊS ──────────────────────────────────────────
            Colunas do original: Data · Descrição · Doc · Valor · Situação, com
            "Revisar" abrindo a estação.
            ⚠ SÓ AS LINHAS ROLAM: o bloco de saldo e o placar ficam parados, e o
            `thead` é `sticky`. É a mesma decisão do original, pela mesma razão —
            rolar a página levaria o resumo embora junto. */}
        {loading ? (
          <div className="space-y-1 p-2">
            {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-4 w-full" />)}
          </div>
        ) : movimentos.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">
            Nenhum movimento importado neste mês.
          </p>
        ) : (
          <div className="max-h-[calc(100vh-24rem)] min-h-[9rem] overflow-auto">
            <table className="w-full border-collapse text-[10px]">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b">
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
                    <td className="px-2 py-1 whitespace-nowrap tabular-nums">{brData(m.data_movimento)}</td>
                    <td className="px-2 py-1 max-w-0 truncate" title={m.descricao ?? ''}>{m.descricao ?? '—'}</td>
                    <td className="px-2 py-1 whitespace-nowrap font-mono text-muted-foreground">{m.documento || '—'}</td>
                    {/* ⚠ COR POR SINAL, e o sinal já está escrito no número — a
                        cor acompanha, nunca é o único canal. */}
                    <td className={`px-2 py-1 text-right tabular-nums whitespace-nowrap ${
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

        {/* ─── 6. O RODAPÉ ────────────────────────────────────────────────
            "Nada a fazer" é estado de verdade, não ausência de mensagem: com o
            mês conferido a tela diz isso, em vez de mostrar contadores zerados. */}
        <div className="px-3 py-1.5 text-[10px] text-muted-foreground">
          {frameDoRodape(contagem)}
        </div>
      </div>

      <ImportacoesDialog
        aberto={verImportacoes}
        aoFechar={() => setVerImportacoes(false)}
        contaNome={conta ? rotuloContaLeve(conta) : ''}
        importacoes={importacoes.importacoes}
        carregando={importacoes.loading}
        aoDesfazer={importacoes.desfazer}
        desfazendo={importacoes.desfazendo}
      />

      {conciliando && (
        <EstacaoConciliar
          movimento={conciliando}
          aoFechar={() => setConciliando(null)}
          aoMudar={async () => { await recarregar(); }}
        />
      )}
    </div>
  );
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/* ⚠ TRÊS ESTADOS, E O TERCEIRO É "NÃO SEI". Verde e vermelho falam do que a
   tela mediu; `desconhecido` é o mês que ela não abriu — e pintá-lo de qualquer
   cor seria afirmar sobre dado que não foi lido. */
type EstadoMes = 'fechado' | 'divergente' | 'sem_extrato' | 'desconhecido';
const CLASSE_ESTADO: Record<EstadoMes, string> = {
  fechado: 'bg-success/15 text-success',
  divergente: 'bg-destructive/10 text-destructive',
  sem_extrato: 'border border-dashed border-border text-muted-foreground',
  desconhecido: 'bg-muted text-muted-foreground',
};
function estadoDoMes(c: { todos: number; parcial: number; sem_vinculo: number }): EstadoMes {
  if (c.todos === 0) return 'sem_extrato';
  return c.parcial === 0 && c.sem_vinculo === 0 ? 'fechado' : 'divergente';
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
