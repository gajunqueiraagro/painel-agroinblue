import { useState } from 'react';
import ModalBaixaParcela from '@/components/financiamentos/ModalBaixaParcela';
import DialogVerLancamentosOficiais from '@/components/financiamentos/DialogVerLancamentosOficiais';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell, TableFooter } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { useCliente } from '@/contexts/ClienteContext';
import { supabase } from '@/integrations/supabase/client';
import { montarPayloadConta } from '@/lib/financeiro/contaPayload';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  ObrigacaoDialog,
  SUBCENTRO_AMORTIZACAO, SUBCENTRO_JUROS, NOME_NATUREZA, PILULA_NATUREZA,
} from '@/components/financiamentos/ObrigacaoDialog';
import { FinanciamentoForm } from '@/hooks/useFinanciamentoCadastro';

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (d: string | null) =>
  d ? format(new Date(d + 'T12:00:00'), 'dd/MM/yyyy') : '—';

const today = () => format(new Date(), 'yyyy-MM-dd');

/* Numero em tabela: fonte mono e digitos de largura fixa, para as colunas alinharem
   entre linhas (A6/A10/A22). */
const NUM = 'font-mono tabular-nums whitespace-nowrap';

/* ================================================================ */

interface FinanciamentoDetalheProps {
  id?: string;
  onVoltar?: () => void;
  from?: 'lancamentos';
}

export default function FinanciamentoDetalhe({ id, onVoltar, from }: FinanciamentoDetalheProps = {}) {
  const qc = useQueryClient();
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;

  const [editOpen, setEditOpen] = useState(false);
  const [parcelaEdit, setParcelaEdit] = useState<any>(null);
  const [parcelaLancamentosOpen, setParcelaLancamentosOpen] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /* ── Financiamento ── */
  const { data: fin, isLoading: loadingFin } = useQuery({
    queryKey: ['financiamento-detalhe', id],
    enabled: !!id && !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financiamentos')
        /* PR-PARC-05 — o subcentro da classificacao da parcela entra no MESMO select:
           no parcelamento ele e' o unico destino contabil do contrato e precisa aparecer
           nos Dados. Uma relacao a mais, nenhuma query a mais. */
        .select('*, financeiro_fornecedores!financiamentos_credor_id_fkey(nome), financeiro_contas_bancarias!financiamentos_conta_bancaria_id_fkey(nome_conta, nome_exibicao), financeiro_plano_contas!financiamentos_plano_conta_parcela_id_fkey(subcentro)')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  /* ── Parcelas ── */
  const { data: parcelas = [], isLoading: loadingP } = useQuery({
    queryKey: ['financiamento-parcelas', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financiamento_parcelas')
        .select('*')
        .eq('financiamento_id', id!)
        .order('numero_parcela');
      if (error) throw error;
      return data ?? [];
    },
  });

  /* ── Resumo financeiro ── */
  const hj = today();
  const pagas = parcelas.filter(p => p.status === 'pago');
  const pendentes = parcelas.filter(p => p.status === 'pendente');
  const totalPago = pagas.reduce((s, p) => s + Number(p.valor_principal) + Number(p.valor_juros), 0);
  const aVencer = pendentes.filter(p => p.data_vencimento >= hj).reduce((s, p) => s + Number(p.valor_principal) + Number(p.valor_juros), 0);
  const vencido = pendentes.filter(p => p.data_vencimento < hj).reduce((s, p) => s + Number(p.valor_principal) + Number(p.valor_juros), 0);
  const progresso = parcelas.length > 0 ? (pagas.length / parcelas.length) * 100 : 0;
  /* Juros previstos — a soma do que o contrato vai custar ALEM do principal. No
     parcelamento nao existe (o motor grava valor_juros = 0), e ali o numero certo e' o
     traco, nunca "R$ 0,00": zero afirma que se apurou e deu zero. */
  const jurosPrevistos = parcelas.reduce((s2, p) => s2 + Number(p.valor_juros), 0);
  /* ⚠ SOMAS DA LINHA DE TOTAL — sobre TODAS as parcelas, nao so' as visiveis na rolagem.
     Nao e' agregacao nova nem consulta nova: sao as mesmas linhas ja' carregadas por
     `financiamento-parcelas`. Uma tabela que rola sem total obriga a somar no olho. */
  const somaPrincipal = parcelas.reduce((s2, p) => s2 + Number(p.valor_principal), 0);
  const somaTotal = somaPrincipal + jurosPrevistos;

  /* ⚠ O FORM DEIXOU DE SER SEMEADO AQUI. Quem carrega o contrato agora e' o
     `ObrigacaoDialog` em `modo="editar"` (query propria por `financiamentoId`), e por
     isso sairam daqui o `editForm` e os tres lookups que so' o modal antigo usava
     (fornecedores, contas e planos de entrada). Abrir e' so' abrir. */
  const openEdit = () => setEditOpen(true);

  /* ⚠ MESMO ESCRITOR DE SEMPRE — mudou a FONTE, nao a logica. Ele continua sendo o
     unico lugar que sincroniza o lancamento de captacao (cria / atualiza / cancela) e
     que invalida as sete chaves de saldo e auditoria; o que era `editForm.<campo>`
     (Record solto) passou a ser `form.<campo>` (FinanciamentoForm tipado). O dialogo
     entrega o form e este metodo grava — ver `onSalvarEdicao` no ObrigacaoDialog. */
  const saveEdit = async (form: FinanciamentoForm, extras: { status: string }): Promise<boolean> => {
    /* O banco guarda a taxa MENSAL; o form fala em ANUAL. Mesma conversao de juros
       compostos que o gravador de criacao usa. */
    const taxaMensal = form.taxa_juros_anual > 0
      ? (Math.pow(1 + form.taxa_juros_anual / 100, 1 / 12) - 1) * 100
      : 0;
    const { error } = await supabase
      .from('financiamentos')
      .update({
        natureza: form.natureza,
        descricao: form.descricao,
        numero_contrato: form.numero_contrato?.trim() || null,
        tipo_financiamento: form.tipo_financiamento,
        credor_id: form.credor_id || null,
        conta_bancaria_id: form.conta_bancaria_id || null,
        valor_total: form.valor_total,
        valor_entrada: form.valor_entrada,
        taxa_juros_mensal: Math.round(taxaMensal * 10000) / 10000,
        data_contrato: form.data_contrato,
        data_primeira_parcela: form.data_primeira_parcela || null,
        observacao: form.observacao || null,
        /* A situacao do contrato volta a ser editavel — o seletor mora na aba Contrato do
           ObrigacaoDialog, so' em modo editar, e chega aqui por `extras` porque nao e' campo
           de criacao (todo contrato nasce 'ativo'). */
        status: extras.status,
        gerar_lancamento_captacao: !!form.gerar_lancamento_captacao,
        plano_conta_captacao_id: form.plano_conta_captacao_id || null,
        plano_conta_parcela_id: form.plano_conta_parcela_id || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id!);
    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
      return false;
    }

    /* ── DESLOCAMENTO DO CRONOGRAMA (PR-PARC-05c item 3) ──────────────────────
       ⚠ AQUI, E NAO NO DIALOGO: este e' o unico ponto do fluxo com acesso as parcelas
       e ao estado ANTERIOR do contrato (`fin.data_primeira_parcela`) — o dialogo so'
       conhece o form, e o form ja' e' o valor novo.
       ⚠ SO' AS PENDENTES. A data de uma parcela paga ja' virou lancamento no caixa;
       reescreve-la nao adia nada, so' desmente um fato registrado. O filtro e'
       `status <> 'pago'` no proprio UPDATE, para nao depender do que o front carregou.
       ⚠ DIAS, NAO MESES: o intervalo e' a diferenca em dias entre a data antiga e a
       nova, aplicado igual a todas — assim uma frequencia semestral continua semestral,
       e o dia do mes acompanha o que o operador escolheu. */
    const dataAntiga: string | null = fin?.data_primeira_parcela ?? null;
    const dataNova = form.data_primeira_parcela || null;
    if (dataAntiga && dataNova && dataAntiga !== dataNova) {
      const MS_DIA = 86400000;
      const deltaDias = Math.round(
        (new Date(dataNova + 'T12:00:00').getTime() - new Date(dataAntiga + 'T12:00:00').getTime()) / MS_DIA,
      );
      if (deltaDias !== 0) {
        const { data: pendentes } = await supabase
          .from('financiamento_parcelas')
          .select('id, data_vencimento')
          .eq('financiamento_id', id!)
          .neq('status', 'pago');
        for (const par of pendentes ?? []) {
          if (!par.data_vencimento) continue;
          const nova = new Date(par.data_vencimento + 'T12:00:00');
          nova.setDate(nova.getDate() + deltaDias);
          await supabase
            .from('financiamento_parcelas')
            .update({ data_vencimento: format(nova, 'yyyy-MM-dd'), updated_at: new Date().toISOString() })
            .eq('id', par.id);
        }
        if ((pendentes?.length ?? 0) > 0) {
          toast.info(`${pendentes!.length} parcela(s) pendente(s) deslocada(s) em ${deltaDias} dia(s).`);
        }
      }
    }

    // ── Sync lançamento de captação ──────────────────────────────────
    const novoGerar = !!form.gerar_lancamento_captacao;
    const novoPlanoCap = form.plano_conta_captacao_id;
    const lancId: string | null = (fin as any)?.lancamento_captacao_id ?? null;
    const anoMes = format(new Date(form.data_contrato + 'T12:00:00'), 'yyyy-MM');

    if (novoGerar && novoPlanoCap) {
      if (lancId) {
        await supabase.from('financeiro_lancamentos_v2').update({
          valor: form.valor_total,
          data_competencia: form.data_contrato,
          data_pagamento: form.data_contrato,
          // Convenção soberana (PR-K): 1-Entradas → conta_destino_id; conta_bancaria_id null.
          ...montarPayloadConta('1-Entradas', form.conta_bancaria_id || null),
          favorecido_id: form.credor_id || null,
          plano_conta_id: novoPlanoCap,
          ano_mes: anoMes,
          cancelado: false,
          cancelado_em: null,
          cancelado_por: null,
          sem_movimentacao_caixa: false,
          updated_at: new Date().toISOString(),
        }).eq('id', lancId);
      } else {
        const { data: novoLanc } = await supabase
          .from('financeiro_lancamentos_v2')
          .insert({
            cliente_id: (fin as any)?.cliente_id,
            fazenda_id: (fin as any)?.fazenda_id,
            financiamento_id: id!,
            // Convenção soberana (PR-K): 1-Entradas → conta_destino_id; conta_bancaria_id null.
            ...montarPayloadConta('1-Entradas', form.conta_bancaria_id || null),
            favorecido_id: form.credor_id || null,
            tipo_operacao: '1-Entradas',
            sinal: 1,
            valor: form.valor_total,
            data_competencia: form.data_contrato,
            data_pagamento: form.data_contrato,
            ano_mes: anoMes,
            origem_lancamento: 'financiamento',
            origem_tipo: 'financiamento_captacao',
            plano_conta_id: novoPlanoCap,
            descricao: `Captação: ${(form.descricao ?? '').trim()}`,
            status_transacao: 'realizado',
            sem_movimentacao_caixa: false,
            cancelado: false,
          })
          .select('id')
          .single();
        if (novoLanc?.id) {
          await supabase.from('financiamentos')
            .update({ lancamento_captacao_id: novoLanc.id })
            .eq('id', id!);
        }
      }
    } else if (!novoGerar && lancId) {
      await supabase.from('financeiro_lancamentos_v2').update({
        cancelado: true,
        cancelado_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', lancId);
    }
    // ─────────────────────────────────────────────────────────────────

    toast.success('Obrigação atualizada');
    // Invalidações RQ pós-sucesso — atualização "sem F5" das superfícies React Query.
    // (Superfícies imperativas — modal Lançamentos/useFinanceiroV2 e Conciliação/
    // useConciliacaoBancariaItens — atualizam só no remount; ver gate inicial.)
    qc.invalidateQueries({ queryKey: ['financiamento-detalhe', id] });
    qc.invalidateQueries({ queryKey: ['financiamentos-lista'] });
    qc.invalidateQueries({ queryKey: ['financiamento-parcelas', id] });
    qc.invalidateQueries({ queryKey: ['saldo-sistema-conta'] });
    qc.invalidateQueries({ queryKey: ['saldo-caixa-mensal'] });
    qc.invalidateQueries({ queryKey: ['painel-financiamentos'] });
    qc.invalidateQueries({ queryKey: ['auditoria-saldo-anterior'] });
    qc.invalidateQueries({ queryKey: ['auditoria-saldo-extrato-real'] });
    /* ⚠ ERA ISTO QUE DEIXAVA O MODAL ABERTO (PR-PARC-05b item 3). A funcao e'
       `Promise<boolean>` e caia no fim sem `return`, devolvendo `undefined`: o
       `if (ok) onSalvo?.()` do dialogo nunca disparava, e o operador via o toast de
       sucesso com o modal parado na tela — parecia que nao tinha salvo.
       ⚠ O TSC FICOU MUDO porque `strict:false` desliga `noImplicitReturns`: assinatura
       que promete `boolean` e caminho que nao devolve nada convivem sem uma linha de
       aviso. Terceiro caso da familia registrada no CLAUDE.md (gate cego). */
    return true;
  };

  const excluirFinanciamento = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      // ETAPA 1: Cancelar lancamentos financeiros vinculados em cascata
      const { cancelarLancamentosDoFinanciamento } = await import('@/lib/financiamentos/parcelaMirror');
      const result = await cancelarLancamentosDoFinanciamento(supabase as any, id);

      // Bloqueio: conciliados ou editados manualmente
      if (!result.ok) {
        const partes: string[] = [];
        if (result.conciliados > 0) {
          partes.push(`${result.conciliados} lancamento(s) conciliado(s) — desconcilie antes de excluir`);
        }
        if (result.editadosManual > 0) {
          partes.push(`${result.editadosManual} lancamento(s) editado(s) manualmente — exclua individualmente primeiro`);
        }
        toast.error(`Exclusao bloqueada: ${partes.join(' / ')}`);
        return;
      }

      // Garantia adicional no caller: totalizadores devem bater
      if (result.totalCancelados !== result.totalCandidatos) {
        toast.error(
          `Operacao abortada: esperados ${result.totalCandidatos} cancelamentos, ` +
          `executados ${result.totalCancelados}. Financiamento NAO foi excluido.`
        );
        return;
      }

      // ETAPA 2: Apagar parcelas (so apos cascade soft cancel confirmado)
      const { error: errPar } = await supabase
        .from('financiamento_parcelas')
        .delete()
        .eq('financiamento_id', id);
      if (errPar) throw errPar;

      // ETAPA 3: Apagar financiamento
      const { error } = await supabase.from('financiamentos').delete().eq('id', id);
      if (error) throw error;

      toast.success(
        result.totalCancelados > 0
          ? `Financiamento excluido. ${result.totalCancelados} lancamento(s) financeiro(s) cancelado(s) em cascata.`
          : 'Financiamento excluido.'
      );
      qc.invalidateQueries({ queryKey: ['financiamentos-lista'] });
      setConfirmDelete(false);
      setEditOpen(false);
      onVoltar?.();
    } catch (e: any) {
      toast.error('Erro ao excluir: ' + (e.message || e));
    } finally {
      setDeleting(false);
    }
  };

  /* ⚠ A EDICAO INLINE DA GRADE SAIU (PR-PARC-05). Ela abria um `<input type="number">`
     de 24px DENTRO de uma celula `py-0` de linha de 21px — exatamente o defeito que o
     PR-PARC-04b acabou de consertar na lista, e que aqui esticaria todas as linhas. Os
     mesmos dois campos (principal e juros) sao editados no modal da parcela, que ja'
     chama a MESMA RPC de reconciliacao (`fn_reconciliar_parcela_financiamento`) e ainda
     valida, mostra o total e trata a conta. Nenhuma capacidade se perdeu: mudou o lugar.
     ⚠ Com ela saiu a ULTIMA entrada de dinheiro em `type="number"` desta tela. */

  /* ── Loading / not found ── */
  if (loadingFin || loadingP) {
    return <div className="w-full h-full min-h-0 bg-background flex items-center justify-center"><span className="text-3xl animate-pulse">💰</span></div>;
  }
  if (!fin) {
    return <div className="w-full h-full min-h-0 bg-background flex items-center justify-center"><p className="text-sm text-muted-foreground">Financiamento não encontrado.</p></div>;
  }

  /* ⚠ `w-full` NAO E' REDUNDANTE — ERA O QUE FALTAVA (PR-PARC-04c). Este bloco tinha
     `max-w-5xl mx-auto` sem largura propria, e isso so' funcionava porque o pai era um
     BLOCO: ai' `width:auto` preenche o espaco ate' o teto e `mx-auto` centraliza. Quando
     'financiamentos' entrou no app-shell (df7f88e2), o pai virou COLUNA FLEX — e para um
     item flex com margens laterais `auto` o `stretch` do eixo cruzado e' desligado por
     regra: a largura passou a ser a do CONTEUDO (fit-content), e o detalhe abriu estreito
     e centralizado. `w-full` devolve a largura definida e vale nos dois pais. E' o mesmo
     idioma que a lista ja' usava — foi por ter `w-full` que ela nao regrediu.
     ⚠ `h-full min-h-0 overflow-y-auto` NO LUGAR DE `min-h-screen`: no app-shell a section
     e' `md:overflow-hidden`, entao a pagina nao rola mais por fora. Com `min-h-screen`
     (100vh, mais alto que a area util) o conteudo era CORTADO sem barra nenhuma. Agora a
     rolagem mora aqui dentro, como na lista. */
  const ehParcelamento = fin.natureza === 'parcelamento';
  const escopo = fin.tipo_financiamento === 'agricultura' ? 'agricultura' : 'pecuaria';
  const nomeCredor = fin.financeiro_fornecedores?.nome ?? null;
  const nomeConta = fin.financeiro_contas_bancarias?.nome_exibicao || fin.financeiro_contas_bancarias?.nome_conta || null;
  const nomeParcela = fin.financeiro_plano_contas?.subcentro ?? null;

  return (
    /* ⚠ COLUNA FLEX, NAO AREA QUE ROLA (mudou no PR-PARC-05). Ate' o 04c a raiz inteira
       rolava; agora topo e dados sao fixos e QUEM ROLA E' A TABELA, como na lista. O
       `h-full min-h-0` continua sendo o que faz a tela medir contra o pai nos dois shells
       — e' o conserto do 04c, preservado. */
    <div className="w-full min-w-0 h-full min-h-0 flex flex-col bg-background max-w-5xl mx-auto">

      {/* ═══ 1 — BARRA AZUL, a mesma da lista ═══════════════════════════════════
          ⚠ O "← Voltar" SOLTO SAIU e virou o elo do meio do caminho. Ele dizia para
          onde ia, mas nao dizia ONDE SE ESTAVA; o breadcrumb diz as duas coisas na
          mesma linha e devolve os 36px que o botao ocupava. */}
      <header className="shrink-0 bg-primary shadow-md">
        <div className="flex items-center gap-2 px-3 py-1">
          {/* ⚠ A MIGALHA DO MEIO E' BOTAO DE VERDADE. `onVoltar` sempre esteve ligado —
              conferi os dois pais, os dois o passam — mas um link BRANCO no meio de texto
              BRANCO, sem icone e sem sublinhado em repouso, nao se anuncia: o operador
              nao achou por onde voltar. `cursor-pointer` e `hover:underline` explicitos
              (o `cursor` ja' vinha do preflight; fica escrito para nao depender dele) e,
              acima de tudo, a seta do item abaixo. */}
          <p className="min-w-0 truncate text-[11px] font-semibold tracking-wide text-primary-foreground">
            {/* ⚠ "Financeiro" E' TEXTO, NAO LINK — nao ha' destino proprio para ele, e
                duas migalhas indo ao mesmo lugar mentem sobre a hierarquia. Igual a' lista. */}
            Financeiro
            <span className="mx-1 text-primary-foreground/40">/</span>
            <button type="button" onClick={onVoltar}
              className="cursor-pointer font-normal text-primary-foreground/90 hover:underline">
              {from === 'lancamentos' ? 'Lançamentos' : 'Parcelamentos e Financiamentos'}
            </button>
            <span className="mx-1 text-primary-foreground/40">/</span>
            {/* O ultimo nivel e' onde se esta': nao e' link. */}
            <span className="font-normal text-primary-foreground/90">{fin.descricao}</span>
          </p>
        </div>
      </header>

      <div className="shrink-0 px-4 pt-2 pb-2 space-y-2">
        {/* ═══ 1 — TITULO ══════════════════════════════════════════════════════ */}
        <div className="flex items-center gap-2 min-w-0">
          {/* ⚠ A SETA VOLTOU, e nao e' redundancia com a migalha: sair de uma tela e' o
              gesto mais frequente do detalhe, e ele precisa de um alvo que se veja de
              relance. Mesmo `onVoltar` das migalhas — um caminho so'. */}
          <Button variant="ghost" size="icon" className="h-7 w-7 p-0 shrink-0"
            onClick={onVoltar} title="Voltar à lista" aria-label="Voltar à lista">
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="text-[20px] font-bold leading-none tracking-tight text-foreground truncate" title={fin.descricao}>
            {fin.descricao}
          </h1>
          <span className="shrink-0 rounded border border-primary/40 bg-primary/10 px-1 text-[9px] font-bold text-primary">
            {PILULA_NATUREZA[fin.natureza] ?? PILULA_NATUREZA.financiamento}
          </span>
          <span className={`shrink-0 inline-flex items-center rounded px-1 py-0 text-[9px] font-normal leading-tight ${
            fin.status === 'ativo' ? 'bg-emerald-100 text-emerald-800'
            : fin.status === 'quitado' ? 'bg-muted text-muted-foreground'
            : 'bg-red-100 text-red-800'}`}>
            {fin.status}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground truncate">
          {nomeCredor ?? '—'} · {escopo === 'pecuaria' ? 'Pecuária' : 'Agricultura'} · contratado em {fmtDate(fin.data_contrato)}
        </p>

        {/* ═══ 2 — DADOS DO CONTRATO, em colunas alinhadas (A17) ═══════════════
            ⚠ NAO E' "Rotulo: valor" NUMA STRING. Cada grupo e' uma grade de duas
            colunas: rotulos numa, valores noutra, todos comecando no MESMO x. Antes
            eram pares corridos com dois-pontos, e comparar dois campos exigia LER a
            linha inteira — o mesmo motivo do A17 no resumo do Novo Lancamento. */}
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[12px] font-semibold text-foreground">Dados do contrato</h2>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={openEdit}>
              <Pencil className="size-3.5" /> Editar
            </Button>
            {/* ⚠ "Excluir contrato" MORAVA NO RODAPE DO MODAL ANTIGO. O modal novo e' o
                ObrigacaoDialog, que nao tem (nem deve ter) botao destrutivo; sem trazer o
                gatilho para ca', a exclusao em cascata — com todo o bloqueio de conciliado
                e editado a mao — ficaria sem porta de entrada. */}
            <Button variant="ghost" size="sm"
              className="h-7 gap-1 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-3.5" /> Excluir
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-x-6 rounded-md border px-3 py-2">
          <Grupo>
            <Par rotulo="Descrição" valor={fin.descricao} />
            <Par rotulo="Nº contrato" valor={fin.numero_contrato} />
            <Par rotulo="Natureza" valor={NOME_NATUREZA[fin.natureza] ?? NOME_NATUREZA.financiamento} />
            <Par rotulo="Escopo" valor={escopo === 'pecuaria' ? 'Pecuária' : 'Agricultura'} />
          </Grupo>
          <Grupo>
            <Par rotulo="Credor" valor={nomeCredor} />
            <Par rotulo="Conta" valor={nomeConta} />
            <Par rotulo="Status">
              <span className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-normal leading-tight ${
                fin.status === 'ativo' ? 'bg-emerald-100 text-emerald-800'
                : fin.status === 'quitado' ? 'bg-muted text-muted-foreground'
                : 'bg-red-100 text-red-800'}`}>
                {fin.status}
              </span>
            </Par>
            {/* ⚠ A CLASSIFICACAO MUDA COM A NATUREZA porque o destino contabil muda:
                no parcelamento ha' UM (a despesa em N vezes); no credito ha' DOIS, e
                quem os fixa e' o escopo, no banco. */}
            {ehParcelamento
              ? <Par rotulo="Parcela" valor={nomeParcela} />
              : <>
                  <Par rotulo="Amortização" valor={SUBCENTRO_AMORTIZACAO[escopo]} />
                  <Par rotulo="Juros" valor={SUBCENTRO_JUROS[escopo]} />
                </>}
          </Grupo>
          <Grupo>
            <Par rotulo="Contrato em" valor={fmtDate(fin.data_contrato)} mono />
            <Par rotulo="1ª parcela" valor={fmtDate(fin.data_primeira_parcela)} mono />
            <Par rotulo="Parcelas" valor={String(fin.total_parcelas)} mono />
            {!ehParcelamento && (
              <Par rotulo="Taxa" valor={`${Number(fin.taxa_juros_mensal).toFixed(2)}% a.m.`} mono />
            )}
          </Grupo>
          <Grupo>
            <Par rotulo="Valor total" valor={fmt(Number(fin.valor_total))} mono />
            <Par rotulo="Entrada" valor={Number(fin.valor_entrada) > 0 ? fmt(Number(fin.valor_entrada)) : null} mono />
            <Par rotulo="Observação" valor={fin.observacao} />
          </Grupo>
        </div>

        {/* ═══ 3 — CAIXAS DE NUMEROS, a forma do topo da lista ════════════════ */}
        <div className="grid grid-cols-6 gap-2">
          {([
            { rotulo: 'Valor do contrato', valor: fmt(Number(fin.valor_total)), borda: 'border-l-muted-foreground/40' },
            { rotulo: 'Pago',              valor: fmt(totalPago),               borda: 'border-l-emerald-500' },
            { rotulo: 'A vencer',          valor: fmt(aVencer),                 borda: 'border-l-primary' },
            /* Vencido so' fica vermelho QUANDO HA' VENCIDO: uma tarja de alerta acesa em
               contrato em dia ensina a ignorar a cor. */
            { rotulo: 'Vencido',           valor: fmt(vencido),                 borda: vencido > 0 ? 'border-l-destructive' : 'border-l-muted-foreground/40' },
            { rotulo: 'Progresso',         valor: `${pagas.length}/${parcelas.length}`, borda: 'border-l-muted-foreground/40' },
            { rotulo: 'Juros previstos',   valor: ehParcelamento ? '—' : fmt(jurosPrevistos), borda: 'border-l-amber-500' },
          ] as const).map(c => (
            <div key={c.rotulo} className={`h-[38px] rounded-md border border-l-[3px] px-3 py-1.5 ${c.borda}`}>
              <div className="text-[10px] leading-none text-muted-foreground truncate">{c.rotulo}</div>
              <div className="mt-0.5 text-[14px] font-semibold tabular-nums leading-tight truncate">{c.valor}</div>
            </div>
          ))}
        </div>
        <Progress value={progresso} className="h-1" />
      </div>

      {/* ═══ 4 — PARCELAS, ate' o rodape ═══════════════════════════════════════
          ⚠ A ROLAGEM MORA NO WRAPPER DA TABELA (A21), e e' nele que o `sticky` do
          thead ancora. `min-h-0` nos dois niveis: sem ele o filho flex recusa-se a
          encolher abaixo do conteudo e a rolagem escapa para a tela inteira. */}
      <div className="min-h-0 flex-1 px-4 pb-1">
        <div className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-card px-3 pt-2 pb-0">
          <div className="mb-1.5 flex shrink-0 items-baseline justify-between">
            <h2 className="text-[12px] font-semibold text-foreground">Parcelas</h2>
            <span className="text-[11px] text-muted-foreground">
              {parcelas.length} {parcelas.length === 1 ? 'parcela' : 'parcelas'}
            </span>
          </div>
          <div className="min-h-0 flex-1">
            <Table density="dense" className="table-fixed" wrapperClassName="h-full overflow-x-hidden overflow-y-auto">
              <colgroup>
                <col className="w-[5%]" />
                <col className="w-[13%]" />
                {!ehParcelamento && <col className="w-[14%]" />}
                {!ehParcelamento && <col className="w-[13%]" />}
                <col className={ehParcelamento ? 'w-[24%]' : 'w-[14%]'} />
                <col className="w-[12%]" />
                <col className="w-[13%]" />
                <col className="w-[12%]" />
                <col className="w-[8%]" />
              </colgroup>
              <TableHeader className="sticky top-0 z-10 border-b border-border bg-card [&_tr]:border-b-0">
                <TableRow>
                  <ThDet>N</ThDet>
                  <ThDet>Vencimento</ThDet>
                  {!ehParcelamento && <ThDet direita>Principal</ThDet>}
                  {!ehParcelamento && <ThDet direita>Juros</ThDet>}
                  <ThDet direita>{ehParcelamento ? 'Valor' : 'Total'}</ThDet>
                  <ThDet>Situação</ThDet>
                  <ThDet>Pago em</ThDet>
                  <ThDet>Lançamento</ThDet>
                  <ThDet />
                </TableRow>
              </TableHeader>
              <TableBody>
                {parcelas.map(p => {
                  const principal = Number(p.valor_principal);
                  const juros = Number(p.valor_juros);
                  const total = principal + juros;
                  const isPending = p.status === 'pendente';
                  const isOverdue = isPending && p.data_vencimento < hj;
                  /* Vocabulario de tela — os identificadores gravados nao mudam. */
                  const situacaoLabel = p.status === 'pago' ? 'Paga'
                    : p.status === 'cancelado' ? 'Cancelada'
                    : isOverdue ? 'Vencida' : 'Pendente';
                  const situacaoClass = p.status === 'pago'
                    ? 'bg-emerald-100 text-emerald-800'
                    : isOverdue
                      ? 'bg-red-100 text-red-800'
                      : 'bg-amber-100 text-amber-800';
                  const temLancamento = !!(p.lancamento_id || p.lancamento_juros_id);

                  return (
                    <TableRow key={p.id}>
                      <TableCell className={NUM}>{p.numero_parcela}</TableCell>
                      <TableCell className={NUM}>{fmtDate(p.data_vencimento)}</TableCell>
                      {!ehParcelamento && <TableCell className={`text-right ${NUM}`}>{fmt(principal)}</TableCell>}
                      {!ehParcelamento && <TableCell className={`text-right ${NUM}`}>{fmt(juros)}</TableCell>}
                      <TableCell className={`text-right font-semibold ${NUM}`}>{fmt(total)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-normal leading-tight ${situacaoClass}`}>
                          {situacaoLabel}
                        </span>
                      </TableCell>
                      <TableCell className={NUM}>{fmtDate(p.data_pagamento)}</TableCell>
                      <TableCell>
                        {temLancamento ? (
                          <button type="button"
                            className="text-[10px] font-medium text-primary hover:underline"
                            onClick={() => setParcelaLancamentosOpen(p)}>
                            Ver
                          </button>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="px-0 text-right select-none">
                        {/* ⚠ h-5 (20px) DENTRO DE LINHA DE 21px — a mesma regra que o
                            PR-PARC-04b fixou na lista: `py-0` na celula faz o filho mais
                            alto mandar na altura de TODAS as linhas. */}
                        <Button variant="ghost" size="icon" className="h-5 w-5 p-0"
                          onClick={() => setParcelaEdit(p)} title="Editar parcela" aria-label="Editar parcela">
                          <Pencil className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              {/* ⚠ TOTAL PRESO EMBAIXO, mesma tecnica do thead preso em cima (A21): o
                  `sticky` ancora no wrapper que rola, e a borda mora no `tfoot` — na
                  linha ela e' filha do que rola e pisca a cada quadro. Fundo OPACO pelo
                  mesmo motivo do cabecalho: translucido deixa a parcela passar por baixo
                  do numero que se esta' conferindo. */}
              <TableFooter className="sticky bottom-0 z-10 border-t border-border bg-card [&>tr]:border-b-0">
                <TableRow>
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell />
                  {!ehParcelamento && <TableCell className={`text-right font-semibold ${NUM}`}>{fmt(somaPrincipal)}</TableCell>}
                  {!ehParcelamento && <TableCell className={`text-right font-semibold ${NUM}`}>{fmt(jurosPrevistos)}</TableCell>}
                  <TableCell className={`text-right font-semibold ${NUM}`}>{fmt(somaTotal)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {pagas.length}/{parcelas.length} pagas
                  </TableCell>
                  <TableCell className={`font-semibold ${NUM}`}>{fmt(totalPago)}</TableCell>
                  <TableCell />
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </div>
      </div>

      {/* ═══ 6 — EDITAR OBRIGACAO: a MESMA casca do "Nova obrigacao" ═══════════
          ⚠ MONTAGEM CONDICIONAL: o form vive dentro do dialogo, e mantido montado ele
          guardaria o contrato anterior entre aberturas — mesmo motivo da lista.
          ⚠ `onSalvarEdicao` recebe o `saveEdit` DESTA tela: o dialogo e' o formulario,
          e quem grava continua sendo quem ja' gravava (com a sincronia do lancamento de
          captacao intacta). */}
      {editOpen && (
        <ObrigacaoDialog
          open
          modo="editar"
          financiamentoId={id}
          onOpenChange={setEditOpen}
          onSalvarEdicao={saveEdit}
          onSalvo={() => setEditOpen(false)}
        />
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir financiamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acao remove o contrato e todas as parcelas, e CANCELA todos os lancamentos
              financeiros vinculados (soft delete via observacao, reversivel).
              Se houver lancamentos conciliados ou editados manualmente, a exclusao sera bloqueada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={excluirFinanciamento}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Modal único: editar parcela (cobre registro de pagamento via mudança de status) ── */}
      <ModalBaixaParcela
        parcela={parcelaEdit}
        financiamento={fin}
        onClose={() => setParcelaEdit(null)}
        modo="editar"
      />

      {/* ── Dialog read-only: ver lançamentos oficiais da parcela ── */}
      <DialogVerLancamentosOficiais
        parcela={parcelaLancamentosOpen}
        financiamento={fin}
        onClose={() => setParcelaLancamentosOpen(null)}
        onEditarParcela={(p) => {
          setParcelaLancamentosOpen(null);
          setParcelaEdit(p);
        }}
      />
    </div>
  );
}

/* ── Dados do contrato: par rotulo-valor em COLUNA alinhada (A17) ─────────────
   ⚠ O `Par` devolve DOIS filhos soltos (fragmento), nao um `<div>`: eles precisam ser
   itens diretos da grade `grid-cols-[auto_1fr]` do `Grupo` para que TODOS os rotulos
   meçam a mesma largura e TODOS os valores comecem no mesmo x. Embrulhar cada par num
   div devolveria o "Rotulo: valor" corrido que este PR veio desfazer. */
function Grupo({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0 min-w-0 content-start">{children}</div>;
}

function Par({ rotulo, valor, children, mono }: {
  rotulo: string; valor?: string | null; children?: React.ReactNode; mono?: boolean;
}) {
  return (
    <>
      <div className="flex h-5 items-center text-[10px] leading-tight text-muted-foreground">{rotulo}</div>
      <div className={`flex h-5 items-center min-w-0 text-[11px] font-medium leading-tight text-foreground ${mono ? 'font-mono tabular-nums' : ''}`}>
        {children ?? <span className="truncate" title={valor ?? undefined}>{valor || '—'}</span>}
      </div>
    </>
  );
}

/* Cabecalho da tabela do detalhe — MESMO override local da lista: o primitivo dense
   entrega `uppercase tracking-wide` e `text-muted-foreground`; aqui o cabecalho e'
   escuro e em caixa normal. Local de proposito — mudar o dense trocaria o cabecalho
   de todas as tabelas densas do sistema. */
function ThDet({ children, direita }: { children?: React.ReactNode; direita?: boolean }) {
  return (
    <TableHead className={`text-foreground normal-case tracking-normal ${direita ? 'text-right' : ''}`}>
      {children}
    </TableHead>
  );
}
