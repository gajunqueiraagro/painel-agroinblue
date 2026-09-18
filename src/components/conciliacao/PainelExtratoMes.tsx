import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { LayoutList, FileText, Pencil, ListPlus } from 'lucide-react';
import { formatMoeda } from '@/lib/calculos/formatters';
import {
  useConciliacaoDoMes, useSugestoesDoMes, contarBaldes, frameDoRodape,
  type SituacaoMovimento,
} from '@/hooks/useConciliacaoDoMes';
import { useSaldoGerencialDoMes, useSaldoSistemaNaPosicao, useImportacoesDaConta, importacoesDoMes, useSaldoDeclaradoOfx } from '@/hooks/useExtratoDaConta';
import { SaldoRealDialog } from '@/components/conciliacao/SaldoRealDialog';
import { ImportacoesDialog } from '@/components/conciliacao/ImportacoesDialog';
import { PalcoDoMes } from '@/components/conciliacao/PalcoDoMes';
import { ConciliarMesDialog } from '@/components/conciliacao/ConciliarMesDialog';

/**
 * PainelExtratoMes — o cabeçalho do "Extrato do mês": a conta, a contagem, as três portas do mês
 * (Ver importações / Conciliar o mês / Ver o mês) e os quatro números do fechamento.
 * FIN-CONCIL-INTEGRAR-01.
 *
 * ⚠ ELE NÃO LISTA MAIS OS MOVIMENTOS — PR-IMPORTAR-CORPO-02. A lista morava aqui e era a TERCEIRA
 * cópia da mesma pergunta: o "Ver o mês" mostra os mesmos movimentos com os filtros do motor, e o
 * "Revisar" de cada linha daqui abria a mesma `EstacaoConciliar` que o palco abre. O que ficou é o
 * que só existe aqui: os números que dizem se o mês fecha.
 *
 * ⚠ E HOJE ELE TEM UM LUGAR SÓ, a aba "Importar Banco" — o comentário antigo falava em duas abas,
 * e a segunda não existe mais. `comPlacar` (o placar de baldes e o rodapé) segue no arquivo sem
 * nenhum caller: é código morto ANTERIOR a este PR, não resíduo dele. Apagá-lo é frente própria.
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
  const [verConciliarMes, setVerConciliarMes] = useState(false);
  const [balde, setBalde] = useState<'todos' | SituacaoMovimento | 'match_direto' | 'provavel' | 'ambiguo' | 'sem_match'>('todos');

  const { movimentos, recarregar } = useConciliacaoDoMes(clienteId, contaId, ano, mes);
  const saldo = useSaldoGerencialDoMes(clienteId, contaId, ano, mes);
  const sistema = useSaldoSistemaNaPosicao(
    clienteId, contaId, saldo.anoMes, saldo.saldoInicial, saldo.posicaoEm);
  const [editandoSaldo, setEditandoSaldo] = useState(false);
  const importacoes = useImportacoesDaConta(clienteId, contaId);
  const sug = useSugestoesDoMes(clienteId, contaId, ano, mes);
  /* ⚠ O MESMO HOOK DO LÁPIS — PR-IMPORTAR-PORTAO-01. `useSaldoDeclaradoOfx` já lê a importação
     do mês (viva, não cancelada) com saldo declarado, e já resolve o desempate: a MAIS RECENTE
     pela data do saldo e, empatando, pela data da importação. Uma segunda leitura aqui daria
     duas respostas para "qual saldo o banco declarou neste mês". */
  const ofx = useSaldoDeclaradoOfx(clienteId, contaId, ano, mes);

  /**
   * O PORTÃO DO PASSO 1 — "o extrato fecha?".
   *
   * ⚠ ELE PERGUNTA OUTRA COISA QUE OS QUATRO NÚMEROS ACIMA. Lá a conta é sistema × o que o
   * operador digitou no lápis; aqui é o que o banco MANDOU (a soma dos movimentos) × o que o
   * banco DECLARA (o LEDGERBAL do próprio arquivo). É a única conferência da tela em que os
   * dois lados vêm de fora da casa — e por isso é a que prova que a importação está completa.
   *
   * ⚠ TOLERANCIA ZERO, E NÃO BLOQUEIA: conciliação bancária é 100%, então qualquer diferença
   * aparece, inclusive de um centavo. Aparecer não é impedir — o operador julga. Na Vera Ligia
   * de set/26 a diferença de R$ 2,94 é o Itaú declarando saldo com rendimento do dia já
   * provisionado, que ainda não virou movimento: comportamento do banco, não erro da casa.
   *
   * ⚠ O CORTE É A DATA DO OFX, NÃO O FIM DO MÊS: o arquivo declara "saldo em 17/09" e o mês
   * ainda não acabou. Somar setembro inteiro compararia posições diferentes e acusaria uma
   * diferença que é só o resto do mês.
   *
   * ⚠ O INICIAL É O `saldo_inicial` DO PRÓPRIO MÊS, e não uma leitura nova do mês anterior: a
   * cadeia de `saldos_v2` garante `saldo_final(N) = saldo_inicial(N+1)` — conferido na Vera
   * Ligia (ago/26 fecha em 30.943,91 e set/26 abre com 30.943,91). Ler o mês anterior seria uma
   * consulta a mais para chegar ao mesmo número, com o risco de discordar dele.
   *
   * ⚠ E OS MOVIMENTOS SÃO OS QUE A TELA JÁ CARREGOU: `useConciliacaoDoMes` traz os do mês já
   * filtrados por `cancelado_em IS NULL` e `ignorado_em IS NULL`. Zero consulta nova.
   */
  const portao = useMemo(() => {
    if (!ofx.ofx) return null;
    if (saldo.saldoInicial == null) return null;
    const corte = ofx.ofx.data.slice(0, 10);
    const soma = movimentos
      .filter((m) => m.data_movimento.slice(0, 10) <= corte)
      .reduce((acc, m) => acc + (Number(m.valor) || 0), 0);
    const calculado = Math.round((saldo.saldoInicial + soma) * 100) / 100;
    const declarado = ofx.ofx.valor;
    return {
      corte, calculado, declarado,
      diferenca: Math.round((declarado - calculado) * 100) / 100,
    };
  }, [ofx.ofx, saldo.saldoInicial, movimentos]);

  const contagem = useMemo(() => contarBaldes(movimentos, sug.sugestoes), [movimentos, sug.sugestoes]);
  /* ⚠ MESMA RÉGUA DO BOTÃO ANTIGO: `situacao === 'nao_conciliado'` é o vínculo real (soma
     dos `valor_aplicado` ativos), não heurística. Movimento parcial fica de fora, como
     antes. */
  const semVinculo = useMemo(() => movimentos.filter(m => m.situacao === 'nao_conciliado').length, [movimentos]);

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
          {/* O número é o da lista do modal: ativas do mês (PR-IMPORTACOES-MES-01). */}
          Ver importações ({importacoesDoMes(importacoes.importacoes, `${ano}-${String(mes).padStart(2, '0')}`).ativas.length})
        </Button>
        {/* ⚠ O BOTÃO DEIXOU DE SER MORTO — FIN-CONCIL-PALCO-MES-01. Estava
            desabilitado com o motivo escrito desde a portagem; o palco existe
            agora e ele abre. Segue sumindo com o mês vazio: não há mês inteiro
            para mostrar quando não há movimento. */}
        {/* ⚠ O PRIMEIRO PASSO DO FLUXO DO NJ mora aqui, ao lado das outras ações
            do mês: importar o OFX, lançar tudo cru e conciliado, e só então
            classificar pelo Excel. */}
        {/* ⚠ O LAÇO MORREU — [CONCIL-MES-01] (130). "Lançar todos os sem vínculo" criava um
            cru para CADA movimento, sem prévia e sem olhar o sistema: na Sicredi Pessoal do
            NJ seriam 107 crus por cima de 31 lançamentos existentes — 31 duplicatas. Agora
            o botão abre a prévia, e quem grava é uma RPC atômica.
            ⚠ O NÚMERO NO RÓTULO É O MESMO DE ANTES (movimentos sem vínculo): é o que o
            operador conta na tela. Quantos viram cru e quantos são substituídos só a RPC
            sabe, e ela diz na prévia — prometer aqui seria adivinhar. */}
        {movimentos.length > 0 && (
          <Button type="button" variant="outline" size="sm"
            className="h-6 gap-1 px-2 text-[10px]"
            disabled={!clienteId || !contaId}
            title={!contaId ? 'Escolha uma conta na régua para conciliar o mês.'
              : 'Ver o que entra cru, o que o banco substitui e se o saldo fecha — antes de gravar.'}
            onClick={() => setVerConciliarMes(true)}>
            <ListPlus className="h-3 w-3" />
            Conciliar o mês{semVinculo > 0 ? ` (${semVinculo})` : ''}
          </Button>
        )}
        {/* ⚠ ERA "Conciliar o mês" E VIROU "Ver o mês" — 130. Dois botões com o mesmo nome
            ao lado um do outro, um abrindo prévia de gravação e o outro uma tela de
            leitura, é a receita do clique errado. Este só MOSTRA; o outro GRAVA, e é o que
            merece o verbo. */}
        {movimentos.length > 0 && (
          <Button type="button" variant="outline" size="sm"
            className="h-6 gap-1 px-2 text-[10px]"
            title="Ver o mês inteiro com as sugestões do motor, numa tela só. Não grava nada."
            onClick={() => setVerPalco(true)}>
            <LayoutList className="h-3 w-3" />
            Ver o mês
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

      {/* ⚠ A FAIXA DO PORTÃO — PR-IMPORTAR-PORTAO-01. Ela responde "o extrato fecha?" logo depois
          de importar, antes de o operador seguir para a classificação: se faltou movimento no
          arquivo, tudo o que vier depois é trabalho sobre base incompleta.
          ⚠ FAIXA E NÃO UM QUINTO NÚMERO, e a razão é medida: um campo de 1/5 de largura mostraria
          "R$ 2,94" sem dizer de onde saiu, e com tolerância zero essa diferença aparece com
          frequência — o operador teria de abrir o lápis toda vez para descobrir o par. A faixa
          mostra os três números de uma vez e custa 23px; o quinto campo dentro do grid de quatro
          quebraria a linha e empurraria a tabela em 34px (medido em Chromium). */}
      {portao && portao.diferenca === 0 && (
        <div className="border-b border-border bg-success/10 px-3 py-1 text-[10px] leading-snug text-success">
          <strong className="font-semibold">O extrato fecha</strong> em {diaMesBr(portao.corte)} ·
          {' '}calculado {formatMoeda(portao.calculado)} · o banco declara {formatMoeda(portao.declarado)}
        </div>
      )}

      {portao && portao.diferenca !== 0 && (
        /* ⚠ MOSTRA E NÃO BLOQUEIA: nada aqui desabilita botão nem impede ir para as outras abas.
           Conciliação bancária é 100%, então a diferença aparece inteira — inclusive de um
           centavo —, e quem julga é o operador. Há causas legítimas: o Itaú declara o saldo já
           com o rendimento do dia provisionado, que ainda não virou movimento. */
        <div className="border-b border-border bg-warning/10 px-3 py-1 text-[10px] leading-snug text-warning">
          <strong className="font-semibold">O extrato não fecha</strong> em {diaMesBr(portao.corte)} ·
          {' '}calculado {formatMoeda(portao.calculado)} · o banco declara {formatMoeda(portao.declarado)} ·
          {' '}diferença <strong className="font-semibold">{formatMoeda(portao.diferenca)}</strong>
        </div>
      )}

      {/* ⚠ SEM O SALDO DO BANCO A TELA DIZ ISSO, e não "confere": a coluna `saldo_declarado`
          nasceu em 17/09/2026, então 81 das 83 importações do proto não a têm. Afirmar que fecha
          sem ter com o que comparar seria a tela inventando uma conferência que ninguém fez. O
          caminho é o mesmo lápis que já existe — o saldo do extrato em PDF. */}
      {!portao && clienteId && contaId && movimentos.length > 0 && !ofx.loading && (
        <div className="border-b border-border bg-muted/30 px-3 py-1 text-[10px] leading-snug text-muted-foreground">
          {ofx.ofx === null
            ? <>Este arquivo não trouxe o saldo do banco — não dá para conferir se o extrato fecha.{' '}</>
            : <>Sem saldo inicial neste mês — não dá para calcular se o extrato fecha.{' '}</>}
          <button type="button" onClick={() => setEditandoSaldo(true)}
            className="underline underline-offset-2 hover:text-foreground">
            Confira pelo extrato em PDF e informe o saldo
          </button>
        </div>
      )}

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
              onClick={() => setBalde('ambiguo')} cor="bg-warning/15 text-warning" />
            <Chip rotulo="sem match" n={contagem.sem_match ?? 0} ativo={balde === 'sem_match'}
              onClick={() => setBalde('sem_match')} cor="bg-destructive/10 text-destructive" />
          </>)}
        </div>
      )}

      {/* ⚠ A TABELA DE MOVIMENTOS SAIU DAQUI — PR-IMPORTAR-CORPO-02. Ela listava os movimentos do
          mês com um "Revisar" por linha, e os dois modais deste mesmo cabeçalho já fazem tudo o
          que ela fazia: "Ver o mês" mostra a lista inteira com os filtros do motor (match direto,
          provável, ambíguo, sem match) e o "Vincular os exatos", e o "Revisar" dela abria
          exatamente a MESMA `EstacaoConciliar` que o palco abre. Nenhuma função se perde; some a
          terceira cópia da mesma lista.
          ⚠ E DOIS DEFEITOS SAEM COM ELA, que é o motivo de sair agora: o subcabeçalho rolava com
          a página e o `thead` era translúcido (`bg-muted/60`), então as linhas passavam por baixo
          do cabeçalho enquanto se conferia o número. Não há o que congelar nem o que opacizar
          numa tabela que não existe.
          ⚠ O ESTADO VAZIO TAMBÉM SAIU: "Nenhum movimento importado neste mês" dizia o que a
          contagem do cabeçalho ("0 movimentos") já diz, na mesma tela. */}


      {comPlacar && (
        <div className="px-3 py-1.5 text-[10px] text-muted-foreground">{frameDoRodape(contagem)}</div>
      )}

      <ImportacoesDialog
        aberto={verImportacoes} aoFechar={() => setVerImportacoes(false)}
        contaNome={contaNome} importacoes={importacoes.importacoes}
        anoMes={`${ano}-${String(mes).padStart(2, '0')}`}
        carregando={importacoes.loading} aoDesfazer={importacoes.desfazer}
        desfazendo={importacoes.desfazendo}
      />
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

      {/* ⚠ O SALDO DO SISTEMA VAI POR PROP — 130. O card já o calcula (posição contra
          posição, FIN-SALDO-POSICAO-01); refazer a conta dentro do diálogo daria dois
          números para a mesma pergunta na mesma tela. */}
      <ConciliarMesDialog
        open={verConciliarMes}
        onOpenChange={setVerConciliarMes}
        clienteId={clienteId} contaId={contaId} contaNome={contaNome}
        ano={ano} mes={mes}
        arquivosOfx={importacoesDoMes(importacoes.importacoes, `${ano}-${String(mes).padStart(2, '0')}`).ativas.length}
        saldoSistemaHoje={sistema.saldoSistema ?? null}
        aoConcluir={async () => { await recarregar(); }}
      />
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

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 py-0.5">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{rotulo}</div>
      <div className="text-[11px] font-medium tabular-nums">{children}</div>
    </div>
  );
}

/** 'YYYY-MM-DD' → 'DD/MM'. Data civil, sem `Date` — fuso não muda o dia aqui. */
const diaMesBr = (iso: string): string => {
  const p = iso.slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}` : '—';
};
