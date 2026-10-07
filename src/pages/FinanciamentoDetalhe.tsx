import { useState } from 'react';
import { LancamentoDaParcelaDialog } from '@/components/financiamentos/LancamentoDaParcelaDialog';
import { useSituacaoDoContrato } from '@/hooks/useSituacaoDoContrato';
import {
  CLASSE_SEM_LANCAMENTO, CLASSE_SITUACAO, MOTIVO_PARCELA_SEM_LANCAMENTO, ROTULO_SEM_LANCAMENTO, ROTULO_SITUACAO, TOM_DO_PRAZO,
  origemDaSituacao, porQueSemLancamento, semLancamento, textoDasNotas, textoDoPrazo,
} from '@/lib/financiamentos/situacaoDoContrato';
import { CancelarParcelaDialog } from '@/components/financiamentos/CancelarParcelaDialog';
import { ExcluirCompraDialog, RecriarLancamentoDialog } from '@/components/financiamentos/GestosDoContratoDialogs';
import { simularCancelarParcela } from '@/lib/financiamentos/cancelarParcelaBanco';
import type { PreviaCancelarParcela } from '@/lib/financiamentos/cancelarParcela';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';
import { docDaLinha } from '@/lib/financeiro/documentoHelper';
import { textoDasParcelas, valorComumDasParcelas } from '@/lib/financiamentos/valorDasParcelas';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { ArrowLeft, Paperclip, Pencil, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell, TableFooter } from '@/components/ui/table';
import { useCliente } from '@/contexts/ClienteContext';
import { supabase } from '@/integrations/supabase/client';
import { montarPayloadConta } from '@/lib/financeiro/contaPayload';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  ObrigacaoDialog, type AbaDaObrigacao,
  SUBCENTRO_AMORTIZACAO, SUBCENTRO_JUROS, NOME_NATUREZA, PILULA_NATUREZA,
} from '@/components/financiamentos/ObrigacaoDialog';
import { FinanciamentoForm } from '@/hooks/useFinanciamentoCadastro';

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/* dd/mm/aa — o padrão de data de tabela da casa (A31) */
const fmtDate = (d: string | null) =>
  d ? format(new Date(d + 'T12:00:00'), 'dd/MM/yy') : '—';

/* valor de tabela: sem "R$" (o cabeçalho da coluna diz a moeda) */
const num2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const COR_DO_PRAZO: Record<'verde' | 'vermelho' | 'cinza', string> = { verde: 'text-[#15803d]', vermelho: 'text-[#b91c1c]', cinza: 'text-muted-foreground' };
const LINHA_DE_DADOS = 'flex h-[18px] min-w-0 items-baseline gap-x-5';
const MOTIVO_DOCUMENTOS_SO_NO_PARCELAMENTO = 'Documentos no contrato: só em parcelamento. No financiamento com juros a nota e o boleto ficam no lançamento.';

/* Número em tabela: a FONTE DO PROJETO com dígitos de largura fixa (PARC-CONTRATO-01: a mono destoava do resto do sistema). */
const NUM = 'tabular-nums whitespace-nowrap';
const MOEDA = 'text-right tabular-nums whitespace-nowrap text-[10px]';
/* PARC-FECHA-02 item 5 — o Total é o RODAPÉ PADRÃO DA CASA (o `TF` de `ParcelasDaCompra`): fundo #E8E6DF, negrito, 2px em cima.
   ⚠ O filete de 2px é SOMBRA INTERNA da célula, não borda: o `tfoot` é `sticky` e borda de célula em tabela colapsada fica
   para trás quando a lista rola. A sombra anda com a célula e não ocupa espaço (a linha segue com 19px). */
const TOTAL = 'bg-[#E8E6DF] text-[10px] font-bold shadow-[inset_0_2px_0_#9aa7b6]';
/* linha da parcela: 19px (o padrão de tabela, A31). Nada dentro dela passa de 16px — o filho mais alto manda na altura. */
/* ⚠ a entrelinha vai ESCRITA: a celula herdava 20px e, sozinha, levava a linha a 20,5–21px (medido). 18 + 1 de borda = 19. */
const LINHA = 'h-[19px] [&>td]:leading-[18px]';

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
  /* a aba em que o Editar obrigação abre: Contrato (Editar), Documentos ou Parcelas ("Editar parcelas") */
  const [abaDoEditar, setAbaDoEditar] = useState<AbaDaObrigacao>('contrato');
  const abrirEdicao = (aba: AbaDaObrigacao) => { setAbaDoEditar(aba); setEditOpen(true); };
  /* PARC-LIVRES-01 passo 4 — o lápis e o "Ver" abrem o lançamento da parcela no MODAL DO FINANCEIRO (o dono do pagamento). */
  const [lancamentoAberto, setLancamentoAberto] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  /* PARC-CADEIA-01 passo 4 — a parcela viva sem lançamento vivo tem dois gestos na linha: recriar o lançamento, ou retirar a
     parcela (o MESMO aviso das portas do Financeiro, pelo id da parcela). A frase de erro do gesto fica escrita ao lado de "Parcelas". */
  const [recriarParcela, setRecriarParcela] = useState<string | null>(null);
  const [retirarParcela, setRetirarParcela] = useState<{ parcelaId: string; previa: PreviaCancelarParcela } | null>(null);
  const [recadoDaLinha, setRecadoDaLinha] = useState<string | null>(null);
  const pedirRetirada = async (parcelaId: string) => {
    setRecadoDaLinha(null);
    const r = await simularCancelarParcela({ parcelaId }, 'so_esta');
    if (r.previa) setRetirarParcela({ parcelaId, previa: r.previa });
    else setRecadoDaLinha(r.erro);
  };
  /** depois de um gesto que mexeu na cadeia: avisa o Financeiro e relê o contrato e a lista (sem F5) */
  const aposMexerNaCadeia = () => {
    if (clienteId) notificarLancamentosMudaram(clienteId);
    for (const chave of ['financiamento-detalhe', 'financiamentos-lista', 'financiamento-parcelas', 'financiamento-situacao', 'painel-financiamentos',
      'obrigacao-edicao', 'obrigacao-edicao-parcelas', 'obrigacao-edicao-lancamentos', 'cpr-lancs', 'cpr-caixa']) {
      void qc.invalidateQueries({ queryKey: [chave] });
    }
  };

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

  /* ── A SITUAÇÃO E OS CARTÕES — PARC-LIVRES-01 passo 4 ──────────────────────────────────────────────────────────────────
     ⚠ O DONO DA SITUAÇÃO "PAGA" É O LANÇAMENTO, e a leitura é UMA, no banco (`fn_financiamento_situacao`): as parcelas vivas com
       a situação derivada e os cartões prontos. Esta tela NÃO SOMA, não filtra e não decide quem está pago — antes ela somava
       `financiamento_parcelas.status`, que ninguém atualiza quando o pagamento acontece pelo Financeiro (o contrato dizia
       "Pago R$ 0,00 · 0/6" com três parcelas conciliadas). Relê sozinha quando um lançamento muda. */
  const hj = hojeLocal();
  /* PARC-CONTRATO-01: com `detalhe` o MESMO dono devolve também competência, conta, PRAZO, documentos e as contagens — a tela
     não calcula nenhum deles. */
  const { data: situacao } = useSituacaoDoContrato(id, clienteId, hj, { detalhe: true });
  const cartoes = situacao?.cartoes ?? null;
  const contagens = cartoes?.detalhe ?? null;
  const linhas = situacao?.parcelas ?? [];
  const dinheiro = (v: number | undefined) => (v === undefined ? '…' : fmt(v));
  const notas = textoDasNotas(contagens);

  /* ── A SAFRA mora nas PARCELAS (não há coluna no contrato): a mesma leitura do Editar obrigação, pelo dono puro
     `valorComumDasParcelas` — iguais = o nome; diferentes = "varia entre as parcelas"; nenhuma = "Sem safra". */
  const { data: safraDasParcelas } = useQuery({
    queryKey: ['financiamento-safra-das-parcelas', id],
    enabled: !!id,
    queryFn: async (): Promise<string> => {
      const { data } = await supabase.from('financeiro_lancamentos_v2').select('id, safra_id').eq('financiamento_id', id!).eq('cancelado', false);
      const lista = data ?? [];
      if (lista.length === 0) return '—';
      const ids = [...new Set(lista.map(l => l.safra_id).filter((v): v is string => !!v))];
      const nomes: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: cad } = await supabase.from('financeiro_safras').select('id, nome').in('id', ids);
        for (const sf of cad ?? []) nomes[sf.id] = sf.nome;
      }
      return textoDasParcelas(valorComumDasParcelas(lista.map(l => l.safra_id)), 'Sem safra', v => nomes[v] ?? 'safra fora do cadastro');
    },
  });

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
  const saveEdit = async (form: FinanciamentoForm, extras: { status: string; parcelasAtualizadas?: number }): Promise<boolean> => {
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
        /* no parcelamento a 1ª parcela é a da lista: este gravador não a troca (o campo fica em leitura) */
        /* a FAZENDA do parcelamento é gravada (PARC-CONTRATO-01 item 2: o campo era editável e o Salvar a jogava fora) */
        ...(form.natureza === 'parcelamento' ? (form.fazenda_id ? { fazenda_id: form.fazenda_id } : {}) : { data_primeira_parcela: form.data_primeira_parcela || null }),
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
    /* PARC-LIVRES-01 2A — NO PARCELAMENTO NAO SE DESLOCA: este laço move só `financiamento_parcelas`, e o lançamento de cada
       parcela ficava com a data de antes (parcela e lançamento divergiam). A data de cada parcela se edita na grade de parcelas,
       que grava parcela e lançamento juntos. Financiamento e empréstimo: como sempre. */
    if (form.natureza !== 'parcelamento' && dataAntiga && dataNova && dataAntiga !== dataNova) {
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

    /* ⚠ O QUE O SALVAR NÃO ALCANÇA, DITO — PARC-OBRIGACAO-EDICAO-01a. Descrição e conta são copiadas para o lançamento de cada
       parcela quando ela nasce; este gravador atualiza só o CONTRATO. Enquanto a propagação não existe, quem mudou um dos dois
       num contrato com parcelas lê que elas ficaram como estavam — em vez de descobrir depois. */
    const mudouOQueAsParcelasCopiam =
      (form.descricao ?? '') !== (fin?.descricao ?? '')
      || (form.plano_conta_parcela_id || null) !== (fin?.plano_conta_parcela_id ?? null)
      || (form.conta_bancaria_id || null) !== (fin?.conta_bancaria_id ?? null);
    if ((extras.parcelasAtualizadas ?? 0) > 0) {
      /* PARC-CONTRATO-01 item 2: a alteração foi levada às parcelas pelo diálogo de escopo — o número é o que o banco gravou */
      const n = extras.parcelasAtualizadas ?? 0;
      toast.success('Obrigação atualizada', { description: n === 1 ? '1 lançamento de parcela atualizado.' : `${n} lançamentos de parcela atualizados.` });
    } else if (mudouOQueAsParcelasCopiam && parcelas.length > 0) {
      toast.success('Obrigação atualizada', { description: 'As parcelas já lançadas não foram alteradas.' });
    } else {
      toast.success('Obrigação atualizada');
    }
    // Invalidações RQ pós-sucesso — atualização "sem F5" das superfícies React Query.
    // (Superfícies imperativas — modal Lançamentos/useFinanceiroV2 e Conciliação/
    // useConciliacaoBancariaItens — atualizam só no remount; ver gate inicial.)
    qc.invalidateQueries({ queryKey: ['financiamento-detalhe', id] });
    qc.invalidateQueries({ queryKey: ['financiamentos-lista'] });
    qc.invalidateQueries({ queryKey: ['financiamento-parcelas', id] });
    qc.invalidateQueries({ queryKey: ['financiamento-situacao'] });
    qc.invalidateQueries({ queryKey: ['saldo-sistema-conta'] });
    qc.invalidateQueries({ queryKey: ['saldo-caixa-mensal'] });
    qc.invalidateQueries({ queryKey: ['painel-financiamentos'] });
    qc.invalidateQueries({ queryKey: ['auditoria-saldo-anterior'] });
    qc.invalidateQueries({ queryKey: ['auditoria-saldo-extrato-real'] });
    /* ⚠ AS CHAVES DO PRÓPRIO DIÁLOGO — PARC-OBRIGACAO-EDICAO-01a. Eram as únicas que este gravador não invalidava: o
       `ObrigacaoDialog` lê o contrato por elas, desmonta ao fechar, e reaberto recebia a cópia de antes do salvar. */
    qc.invalidateQueries({ queryKey: ['obrigacao-edicao', id] });
    qc.invalidateQueries({ queryKey: ['obrigacao-edicao-parcelas', id] });
    qc.invalidateQueries({ queryKey: ['obrigacao-edicao-lancamentos', id] });
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
    /* ⚠ `overflow-hidden` NA RAIZ (PR-PARC-05d item 9). O topo desta tela e' `shrink-0` e
       NAO tem teto: barra + titulo + subtitulo + dados (98px no parcelamento, 118 no
       credito) + seis caixas + progresso somam ~300px, contra ~160px da lista. Em janela
       baixa o que sobra para o card encolhe, e como `shrink-0` se recusa a ceder o
       conjunto passava do rodape em vez de parar nele. Com `overflow-hidden` o container
       vira o limite de verdade e o card termina onde a tela termina — a rolagem util
       continua existindo uma camada abaixo, no wrapper da tabela. */
    <div className="w-full min-w-0 h-full min-h-0 flex flex-col overflow-hidden bg-background max-w-5xl mx-auto">

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

      <div className="shrink-0 px-3 pt-1.5 pb-1.5 space-y-1.5">
        {/* ═══ a — LINHA DO TÍTULO (PARC-CONTRATO-01, mock aprovado): UMA linha de 26px. O nome é CONTIDO (15px), encurta com
            reticência e `title`, e nunca empurra os botões — eles têm lugar reservado à direita (`shrink-0`). */}
        <div className="flex h-[26px] items-center gap-2 min-w-0" data-testid="linha-do-titulo">
          <Button variant="ghost" size="icon" className="h-6 w-6 p-0 shrink-0"
            onClick={onVoltar} title="Voltar à lista" aria-label="Voltar à lista">
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="min-w-0 truncate text-[15px] font-semibold leading-none text-foreground" title={fin.descricao} data-testid="titulo-do-contrato">
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
          <span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground">
            {NOME_NATUREZA[fin.natureza] ?? NOME_NATUREZA.financiamento} · {escopo === 'pecuaria' ? 'Pecuária' : 'Agricultura'}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-1" data-testid="botoes-do-contrato">
            <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-[10.5px]" onClick={() => abrirEdicao('contrato')}>
              <Pencil className="size-3" /> Editar
            </Button>
            {/* item que não vale fica APAGADO com o motivo: no financiamento com juros o contrato não guarda documento (passo 6) */}
            <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-[10.5px]" disabled={!ehParcelamento}
              title={ehParcelamento ? 'Nota fiscal e boletos das parcelas' : MOTIVO_DOCUMENTOS_SO_NO_PARCELAMENTO}
              onClick={() => abrirEdicao('documentos')}>
              <Paperclip className="size-3" /> Documentos
            </Button>
            {/* ⚠ "Excluir contrato" MORAVA NO RODAPE DO MODAL ANTIGO. O ObrigacaoDialog não tem (nem deve ter) botão destrutivo;
                sem o gatilho aqui a exclusão em cascata ficaria sem porta de entrada. */}
            <Button variant="ghost" size="sm"
              className="h-6 gap-1 px-2 text-[10.5px] text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-3" /> Excluir
            </Button>
          </div>
        </div>

        {/* ═══ b — DADOS, em DUAS linhas (rótulo cinza + valor em negrito, 10,5px). A terceira só existe com Nº contrato, Entrada
            ou Observação preenchidos (e, no crédito, leva os dois destinos contábeis).
            ⚠ CADA LINHA É INDEPENDENTE (flex), NÃO UMA GRADE DE COLUNAS: medido no NJ, com colunas alinhadas o credor longo de uma
              linha e a classificação longa da outra pediam 912px dos 810 e os dois cortavam; soltas, cada linha usa a largura
              que ELA precisa. Número e data nunca encolhem; o texto só corta (com o inteiro no `title`) se a linha não couber. */}
        <div className="rounded-md border px-2 py-1" data-testid="dados-do-contrato">
          <div className={LINHA_DE_DADOS}>
            <Dado rotulo="Descrição" valor={fin.descricao} />
            <Dado rotulo="Credor" valor={nomeCredor} />
            <Dado rotulo="Contrato em" valor={fmtDate(fin.data_contrato)} numero />
            <Dado rotulo="Parcelas" valor={String(fin.total_parcelas)} numero />
          </div>
          <div className={LINHA_DE_DADOS}>
            {/* no parcelamento há UM destino contábil (a despesa em N vezes); no crédito são DOIS, e vão na terceira linha */}
            {ehParcelamento && <Dado rotulo="Classificação" valor={nomeParcela} />}
            <Dado rotulo="Conta" valor={nomeConta} />
            <Dado rotulo="1ª parcela" valor={fmtDate(fin.data_primeira_parcela)} numero />
            <Dado rotulo="Safra" valor={safraDasParcelas ?? '…'} />
            {!ehParcelamento && Number(fin.taxa_juros_mensal) > 0 && <Dado rotulo="Taxa" valor={`${Number(fin.taxa_juros_mensal).toFixed(2)}% a.m.`} numero />}
          </div>
          {(!ehParcelamento || fin.numero_contrato || fin.observacao || Number(fin.valor_entrada) > 0) && (
            <div className={LINHA_DE_DADOS} data-testid="dados-terceira-linha">
              {!ehParcelamento && <Dado rotulo="Amortização" valor={SUBCENTRO_AMORTIZACAO[escopo]} />}
              {!ehParcelamento && <Dado rotulo="Juros" valor={SUBCENTRO_JUROS[escopo]} />}
              {fin.numero_contrato && <Dado rotulo="Nº contrato" valor={fin.numero_contrato} numero />}
              {Number(fin.valor_entrada) > 0 && <Dado rotulo="Entrada" valor={fmt(Number(fin.valor_entrada))} numero />}
              {fin.observacao && <Dado rotulo="Observação" valor={fin.observacao} />}
            </div>
          )}
        </div>

        {/* ═══ c — CARTÕES de 40px, lidos de `fn_financiamento_situacao` (valores E contagens). "Juros previstos" só no crédito. */}
        <div className={`grid gap-2 ${ehParcelamento ? 'grid-cols-5' : 'grid-cols-6'}`}>
          <Cartao rotulo="Valor do contrato" valor={fmt(Number(fin.valor_total))} borda="border-l-muted-foreground/40" />
          <Cartao rotulo="Pago" contagem={cartoes ? cartoes.pagas : undefined} valor={dinheiro(cartoes?.pago)} borda="border-l-emerald-500" tom="text-[#15803d]" />
          <Cartao rotulo="A vencer" contagem={contagens?.aVencerQtde} valor={dinheiro(cartoes?.aVencer)} borda="border-l-primary" />
          {/* Vencido só fica vermelho QUANDO HÁ VENCIDO: tarja de alerta acesa em contrato em dia ensina a ignorar a cor */}
          <Cartao rotulo="Vencido" contagem={contagens?.vencidoQtde} valor={dinheiro(cartoes?.vencido)}
            borda={(cartoes?.vencido ?? 0) > 0 ? 'border-l-destructive' : 'border-l-muted-foreground/40'}
            tom={(cartoes?.vencido ?? 0) > 0 ? 'text-[#b91c1c]' : undefined} />
          <div data-testid="cartao-Progresso" className="h-[40px] rounded-md border border-l-[3px] border-l-muted-foreground/40 px-2 py-1">
            <div className="text-[10px] leading-[12px] text-muted-foreground">Progresso</div>
            <div className="whitespace-nowrap text-[12px] font-semibold leading-[14px] tabular-nums">
              {cartoes ? `${cartoes.pagas} de ${cartoes.parcelas} pagas` : '…'}
            </div>
            {/* a barra é só desenho: a fração vem pronta (pagas e parcelas do banco) */}
            <div className="mt-[3px] h-[3px] overflow-hidden rounded bg-muted">
              <div className="h-full bg-emerald-500" style={{ width: `${cartoes && cartoes.parcelas > 0 ? (cartoes.pagas / cartoes.parcelas) * 100 : 0}%` }} />
            </div>
          </div>
          {!ehParcelamento && <Cartao rotulo="Juros previstos" valor={dinheiro(cartoes?.jurosPrevistos)} borda="border-l-amber-500" />}
        </div>
      </div>

      {/* ═══ d — PARCELAS, até o rodapé ═══════════════════════════════════════
          ⚠ A ROLAGEM MORA NO WRAPPER DA TABELA (A21), e é nele que o `sticky` do thead e do tfoot ancora. `min-h-0` nos dois
          níveis: sem ele o filho flex recusa-se a encolher abaixo do conteúdo e a rolagem escapa para a tela inteira. */}
      <div className="min-h-0 flex-1 px-3 pb-1">
        <div className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-card px-3 pt-1.5 pb-0">
          <div className="mb-1 flex h-[22px] shrink-0 items-center gap-2">
            <h2 className="text-[12px] font-semibold text-foreground">Parcelas</h2>
            <span className={`min-w-0 truncate text-[10px] ${recadoDaLinha ? 'font-medium text-destructive' : 'text-muted-foreground'}`}
              data-testid="dica-da-linha" title={recadoDaLinha ?? undefined}>
              {recadoDaLinha ?? 'clique na linha para abrir o lançamento no Financeiro'}
            </span>
            <Button variant="outline" size="sm" className="ml-auto h-[20px] shrink-0 gap-1 px-2 text-[10px]" onClick={() => abrirEdicao('parcelas')}>
              <Pencil className="size-3" /> Editar parcelas
            </Button>
          </div>
          <div className="min-h-0 flex-1">
            <Table density="dense" className="table-fixed" wrapperClassName="h-full overflow-x-hidden overflow-y-auto">
              {/* ⚠ LARGURAS EM px, MEDIDAS: só a Conta (texto) fica com o resto e corta; número, valor e data têm a largura do pior caso. */}
              <colgroup>
                <col style={{ width: 40 }} />
                <col style={{ width: 54 }} />
                <col style={{ width: 54 }} />
                <col style={{ width: 54 }} />
                <col style={{ width: 108 }} />
                <col />
                {!ehParcelamento && <col style={{ width: 84 }} />}
                {!ehParcelamento && <col style={{ width: 76 }} />}
                <col style={{ width: 88 }} />
                {/* Situação: 88 = "sem lançamento" (o pior rótulo, 78px medidos) + o respiro da célula */}
                <col style={{ width: 88 }} />
                {ehParcelamento && <col style={{ width: 118 }} />}
                {ehParcelamento && <col style={{ width: 46 }} />}
                {!ehParcelamento && <col style={{ width: 40 }} />}
                <col style={{ width: 24 }} />
              </colgroup>
              <TableHeader className="sticky top-0 z-10 bg-primary text-primary-foreground [&_tr]:border-b-0 [&_tr]:hover:bg-primary">
                <TableRow>
                  <ThDet>Nº</ThDet>
                  <ThDet>Comp.</ThDet>
                  <ThDet>Venc.</ThDet>
                  <ThDet>Pgto.</ThDet>
                  <ThDet>Prazo</ThDet>
                  <ThDet>Conta</ThDet>
                  {!ehParcelamento && <ThDet direita>Principal</ThDet>}
                  {!ehParcelamento && <ThDet direita>Juros</ThDet>}
                  <ThDet direita>{ehParcelamento ? 'Valor (R$)' : 'Total (R$)'}</ThDet>
                  <ThDet>Situação</ThDet>
                  {ehParcelamento && <ThDet>Nota fiscal</ThDet>}
                  {ehParcelamento && <ThDet>Boleto</ThDet>}
                  {!ehParcelamento && <ThDet />}
                  <ThDet />
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map(p => {
                  const d = p.detalhe;
                  const doc = d ? docDaLinha({ tipo_documento: d.tipoDocumento, numero_documento: d.numeroDocumento }, d.documentos) : null;
                  const abrir = () => { if (p.lancamentoId) setLancamentoAberto(p.lancamentoId); };
                  /* PARC-CADEIA-01 passo 4 — parcela viva de compra parcelada SEM lançamento vivo: situação própria e dois gestos */
                  const orfa = ehParcelamento && semLancamento(p);
                  return (
                    /* O CLIQUE NA LINHA abre o lançamento da parcela no modal do Financeiro; o lápis faz o mesmo. A coluna "Ver" saiu. */
                    <TableRow key={p.id} className={`${LINHA} ${p.lancamentoId ? 'cursor-pointer' : ''}`} data-testid="linha-do-contrato" data-situacao={p.situacao}
                      onClick={abrir} title={p.lancamentoId ? undefined : MOTIVO_PARCELA_SEM_LANCAMENTO}>
                      <TableCell className={NUM}>{p.numero ?? '—'}{cartoes ? `/${cartoes.parcelas}` : ''}</TableCell>
                      <TableCell className={NUM} data-testid="competencia">{fmtDate(d?.competencia ?? null)}</TableCell>
                      <TableCell className={`${NUM} ${p.situacao === 'vencida' ? 'font-semibold text-[#b91c1c]' : ''}`}>{fmtDate(p.dataVencimento)}</TableCell>
                      <TableCell className={NUM} data-testid="pago-em">{fmtDate(p.pagoEm)}</TableCell>
                      <TableCell className={`whitespace-nowrap ${d?.prazo ? COR_DO_PRAZO[TOM_DO_PRAZO[d.prazo.tipo]] : 'text-muted-foreground'}`} data-testid="prazo">
                        {textoDoPrazo(d?.prazo ?? null)}
                      </TableCell>
                      <TableCell className="truncate" title={d?.contaNome ?? undefined} data-testid="conta-da-parcela">{d?.contaNome ?? '—'}</TableCell>
                      {!ehParcelamento && <TableCell className={MOEDA}>{num2(p.valorPrincipal)}</TableCell>}
                      {!ehParcelamento && <TableCell className={MOEDA}>{num2(p.valorJuros)}</TableCell>}
                      <TableCell className={`${MOEDA} font-semibold`}>{num2(p.valorTotal)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center whitespace-nowrap rounded px-1 py-0 text-[9px] font-normal leading-tight ${orfa ? CLASSE_SEM_LANCAMENTO : CLASSE_SITUACAO[p.situacao]}`}
                              title={orfa ? porQueSemLancamento(p) : origemDaSituacao(p)} data-testid="situacao-da-parcela" data-sem-lancamento={orfa ? 'sim' : undefined}>
                          {orfa ? ROTULO_SEM_LANCAMENTO : ROTULO_SITUACAO[p.situacao]}
                        </span>
                      </TableCell>
                      {ehParcelamento && orfa && (
                        /* sem lançamento não há nota nem boleto a mostrar: as duas colunas dão lugar aos dois gestos da linha */
                        <TableCell colSpan={2} className="whitespace-nowrap" data-testid="gestos-da-parcela">
                          <button type="button" className="text-[10px] font-medium text-primary hover:underline"
                            title="Cria um lançamento novo para esta parcela (o cancelado não volta)"
                            onClick={(e) => { e.stopPropagation(); setRecadoDaLinha(null); setRecriarParcela(p.id); }} data-testid="recriar-da-linha">
                            Recriar lançamento
                          </button>
                          <span className="px-1 text-muted-foreground">·</span>
                          <button type="button" className="text-[10px] font-medium text-destructive hover:underline"
                            title="Retira esta parcela da compra: o contrato passa a ter uma parcela a menos e o total é recalculado"
                            onClick={(e) => { e.stopPropagation(); void pedirRetirada(p.id); }} data-testid="retirar-da-linha">
                            Retirar
                          </button>
                        </TableCell>
                      )}
                      {ehParcelamento && !orfa && (
                        <TableCell className={NUM} title={doc?.resumo || undefined} data-testid="nota-da-parcela">{doc?.rotulo || '—'}</TableCell>
                      )}
                      {ehParcelamento && !orfa && (
                        <TableCell className="text-center" data-testid="boleto-da-parcela">
                          {d && d.boletos > 0
                            ? <span title={d.boletos === 1 ? '1 boleto' : `${d.boletos} boletos`} className="inline-flex"><Paperclip className="size-3 text-muted-foreground" aria-label="tem boleto" /></span>
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      )}
                      {!ehParcelamento && (
                        <TableCell className="whitespace-nowrap">
                          {/* financiamento com juros: a parcela tem DOIS lançamentos — a linha e o lápis abrem o principal, e a linha oferece o dos juros */}
                          {p.lancamentoJurosId && (
                            <button type="button" className="text-[10px] font-medium text-primary hover:underline"
                              title="Abrir o lançamento dos juros desta parcela no Financeiro"
                              onClick={(e) => { e.stopPropagation(); setLancamentoAberto(p.lancamentoJurosId); }} data-testid="ver-juros">
                              juros
                            </button>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="px-0 text-right select-none">
                        {/* ⚠ 16px DENTRO DE LINHA DE 19px: `py-0` na célula faz o filho mais alto mandar na altura de TODAS as linhas. */}
                        <Button variant="ghost" size="icon" className="h-4 w-4 p-0 align-middle"
                          onClick={(e) => { e.stopPropagation(); abrir(); }}
                          disabled={!p.lancamentoId}
                          title={p.lancamentoId ? 'Abrir o lançamento desta parcela no Financeiro' : MOTIVO_PARCELA_SEM_LANCAMENTO}
                          aria-label="Abrir o lançamento da parcela">
                          <Pencil className="size-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              {/* ⚠ TOTAL PRESO EMBAIXO (PARC-FECHA-02 item 5), o rodapé padrão da casa. TUDO aqui vem da leitura do contrato: a
                  tela não soma. */}
              <TableFooter className="sticky bottom-0 z-10 border-t-0 bg-[#E8E6DF] [&>tr]:border-b-0" data-testid="rodape-das-parcelas">
                <TableRow className={`${LINHA} hover:bg-transparent`}>
                  <TableCell colSpan={5} className={`${TOTAL} whitespace-nowrap`}>
                    Total{cartoes ? ` · ${cartoes.parcelas} ${cartoes.parcelas === 1 ? 'parcela' : 'parcelas'}` : ''}
                  </TableCell>
                  <TableCell className={`${TOTAL} whitespace-nowrap text-right`} data-testid="total-pago">
                    <span className="font-normal text-muted-foreground">pago</span> <span className="tabular-nums text-[#15803d]">{cartoes ? num2(cartoes.pago) : '…'}</span>
                  </TableCell>
                  {!ehParcelamento && <TableCell className={`${MOEDA} ${TOTAL}`}>{cartoes ? num2(cartoes.somaPrincipal) : '…'}</TableCell>}
                  {!ehParcelamento && <TableCell className={`${MOEDA} ${TOTAL}`}>{cartoes ? num2(cartoes.jurosPrevistos) : '…'}</TableCell>}
                  <TableCell className={`${MOEDA} ${TOTAL}`} data-testid="total-das-parcelas">{cartoes ? num2(cartoes.somaTotal) : '…'}</TableCell>
                  <TableCell className={`${TOTAL} whitespace-nowrap tabular-nums`} data-testid="total-pagas">
                    {cartoes ? `${cartoes.pagas} de ${cartoes.parcelas}` : '…'}
                  </TableCell>
                  {ehParcelamento && (
                    <TableCell className={`${TOTAL} whitespace-nowrap tabular-nums ${COR_DO_PRAZO[notas.tom]}`} title={notas.titulo} data-testid="total-notas">{notas.texto}</TableCell>
                  )}
                  {ehParcelamento && (
                    <TableCell className={`${TOTAL} text-center tabular-nums`} data-testid="total-boletos"
                      title={contagens ? (contagens.boletos === 1 ? '1 boleto' : `${contagens.boletos} boletos`) : undefined}>
                      {contagens ? contagens.boletos : '…'}
                    </TableCell>
                  )}
                  {!ehParcelamento && <TableCell className={TOTAL} />}
                  <TableCell className={TOTAL} />
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
          abaInicial={abaDoEditar}
          onSalvarEdicao={saveEdit}
          onSalvo={() => setEditOpen(false)}
        />
      )}

      {/* PARC-CADEIA-01 passo 4 — COMPRA PARCELADA: a exclusão é UMA gravação no banco (`fn_parcelamento_excluir`), com a
          simulação no diálogo, motivo obrigatório e a recusa escrita ao lado do botão. Financiamento com juros e empréstimo
          seguem pelo caminho de sempre, logo abaixo. */}
      {ehParcelamento && confirmDelete && id && (
        <ExcluirCompraDialog
          financiamentoId={id}
          descricao={fin.descricao ?? ''}
          aoVoltar={() => setConfirmDelete(false)}
          aoExcluir={(previa) => {
            setConfirmDelete(false);
            setEditOpen(false);
            aposMexerNaCadeia();
            toast.success(`Compra parcelada cancelada. ${previa.lancamentos === 1 ? '1 lançamento cancelado' : `${previa.lancamentos} lançamentos cancelados`}.`);
            onVoltar?.();
          }}
        />
      )}
      {recriarParcela && (
        <RecriarLancamentoDialog parcelaId={recriarParcela} aoVoltar={() => setRecriarParcela(null)}
          aoRecriar={() => { setRecriarParcela(null); aposMexerNaCadeia(); }} />
      )}
      {retirarParcela && clienteId && (
        <CancelarParcelaDialog clienteId={clienteId} alvo={{ parcelaId: retirarParcela.parcelaId }} previa={retirarParcela.previa}
          aoVoltar={() => setRetirarParcela(null)}
          aoGravar={(escopo) => { setRetirarParcela(null); aposMexerNaCadeia(); if (escopo === 'todas') onVoltar?.(); }} />
      )}

      <AlertDialog open={confirmDelete && !ehParcelamento} onOpenChange={setConfirmDelete}>
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

      {/* ── O lançamento da parcela, no modal do Financeiro: é nele que se paga e se edita; ao salvar, esta tela relê sozinha ── */}
      <LancamentoDaParcelaDialog lancamentoId={lancamentoAberto} clienteId={clienteId} aoFechar={() => setLancamentoAberto(null)} />
    </div>
  );
}

/* ── Dados do contrato: rótulo cinza + valor em negrito, 10,5px, numa linha de 18px. O valor corta com o inteiro no `title`
   (texto); número e data não cortam (`numero`). ─────────────────────────────────────────────────────────────────────── */
function Dado({ rotulo, valor, numero }: { rotulo: string; valor?: string | null; numero?: boolean }) {
  return (
    <div className={`flex h-[18px] items-baseline gap-1.5 text-[10.5px] leading-[18px] ${numero ? 'shrink-0' : 'min-w-0'}`} data-testid={`dado-${rotulo}`}>
      <span className="shrink-0 text-muted-foreground">{rotulo}</span>
      <span className={`font-semibold text-foreground ${numero ? 'whitespace-nowrap tabular-nums' : 'min-w-0 truncate'}`} title={valor ?? undefined}>{valor || '—'}</span>
    </div>
  );
}

/* ── Cartão de 40px: rótulo (com a contagem de parcelas, do banco) e o valor, que nunca corta. ───────────────────────── */
function Cartao({ rotulo, contagem, valor, borda, tom }: { rotulo: string; contagem?: number; valor: string; borda: string; tom?: string }) {
  return (
    <div data-testid={`cartao-${rotulo}`} className={`h-[40px] rounded-md border border-l-[3px] px-2 py-1 ${borda}`}>
      <div className="truncate text-[10px] leading-[12px] text-muted-foreground">
        {rotulo}{contagem !== undefined ? ` · ${contagem} ${contagem === 1 ? 'parcela' : 'parcelas'}` : ''}
      </div>
      <div className={`mt-[2px] whitespace-nowrap text-[13px] font-semibold leading-[16px] tabular-nums ${tom ?? ''}`}>{valor}</div>
    </div>
  );
}

/* Cabecalho da tabela do detalhe — MESMO override local da lista: o primitivo dense
   entrega `uppercase tracking-wide` e `text-muted-foreground`; aqui o cabecalho e'
   escuro e em caixa normal. Local de proposito — mudar o dense trocaria o cabecalho
   de todas as tabelas densas do sistema. */
function ThDet({ children, direita }: { children?: React.ReactNode; direita?: boolean }) {
  return (
    <TableHead className={`text-primary-foreground normal-case tracking-normal ${direita ? 'text-right' : ''}`}>
      {children}
    </TableHead>
  );
}
