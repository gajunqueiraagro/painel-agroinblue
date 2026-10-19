import { useEffect, useRef, useState } from 'react';
import { importarDoApp } from '@/lib/app/falhaDeVersao';
import { LancamentoDaParcelaDialog } from '@/components/financiamentos/LancamentoDaParcelaDialog';
import { useSituacaoDoContrato } from '@/hooks/useSituacaoDoContrato';
import {
  CLASSE_SEM_LANCAMENTO, CLASSE_SITUACAO, MOTIVO_PARCELA_SEM_LANCAMENTO, ROTULO_SEM_LANCAMENTO, ROTULO_SITUACAO, TOM_DO_PRAZO,
  origemDaSituacao, porQueSemLancamento, semLancamento, textoDasNotas, textoDoPrazo, textoDoPrazoCurto,
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  ObrigacaoDialog, type AbaDaObrigacao,
  SUBCENTRO_AMORTIZACAO, SUBCENTRO_JUROS, NOME_NATUREZA, PILULA_NATUREZA,
} from '@/components/financiamentos/ObrigacaoDialog';
import { FinanciamentoForm } from '@/hooks/useFinanciamentoCadastro';
import { alinhamentoDoCabecalho, colunasDasParcelas, type ColunaDasParcelas } from '@/lib/financiamentos/reguaDasParcelas';
import { TABELA_LANC, TD_DATA_LANC, TD_VALOR_LANC, LINHA_LANC, TH_LANC, SeloDoContrato } from '@/components/financiamentos/ListaDeFinanciamentos';
import { GradeChaveValor } from '@/components/shared/GradeChaveValor';
import { formatarDocumento, nomeEDocumento } from '@/lib/fornecedores/fornecedorTexto';
import { BlocoDocumentos, BlocoLiberacoes, RemoverDialog } from '@/components/financiamentos/ContratoDeCredito';
import { COR_V4, ListaDePendencias, TabelaDePagamentos, TabelaDoHistorico, TopoDoContrato, type QuintaCelula } from '@/components/financiamentos/TelaDoContratoV3';
import { Segmentado } from '@/components/ui/segmentado';
import type { AcaoDoPendente, PendenteDoContrato } from '@/lib/financiamentos/telaDoContrato';
import { BuscarPagamentoDialog } from '@/components/financiamentos/BuscarNoContrato';
import { BotaoDarBaixa, DarBaixaDialog } from '@/components/financiamentos/DarBaixa';
import { BotaoJuntar, DesfazerJuncaoDialog, JuntarContratoDialog } from '@/components/financiamentos/JuntarContrato';
import { CadastroDeContratoDialog } from '@/components/financiamentos/CadastroDeContratoDialog';
import { ConsorcioDialog } from '@/components/financiamentos/ConsorcioDialog';
import { EditarParcelasDialog, SeloAjustada, type ParcelaParaEditar } from '@/components/financiamentos/EdicaoDoContrato';
import { useEdicaoDoContrato } from '@/hooks/useEdicaoDoContrato';
import { travaNaTela } from '@/lib/financiamentos/edicaoDoContrato';
import { ROTULO_DA_BAIXA, type TipoDeBaixa } from '@/lib/financiamentos/baixaDoContrato';
import { ROTULO_DO_PAPEL } from '@/lib/financiamentos/buscaNoContrato';
import type { VinculoDePagamento } from '@/hooks/useContratoDeCredito';
import { useContratoDeCredito } from '@/hooks/useContratoDeCredito';
import { avisoDoPrincipal, avisosDoCronograma, saldoAposDasParcelas, subtituloDoContrato } from '@/lib/financiamentos/contratoDeCredito';
import { resumoDoContratoNaLista } from '@/lib/financiamentos/situacaoEmLote';

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/* UI-SEM-CORTE-01 — data sempre dd/mm/aaaa completa (substitui o dd/mm/aa de tabela do A31) */
const fmtDate = (d: string | null) =>
  d ? format(new Date(d + 'T12:00:00'), 'dd/MM/yyyy') : '—';

/* valor de tabela: sem "R$" (o cabeçalho da coluna diz a moeda) */
const num2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataLonga = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
/** TELA DO CONTRATO v3 — as abas do crédito */
type AbaDoCredito = 'cronograma' | 'liberacoes' | 'pagamentos' | 'documentos' | 'historico' | 'a_resolver';

const COR_DO_PRAZO: Record<'verde' | 'vermelho' | 'cinza', string> = { verde: 'text-[#15803d]', vermelho: 'text-[#b91c1c]', cinza: 'text-muted-foreground' };
const MOTIVO_DOCUMENTOS_SO_NO_PARCELAMENTO = 'Documentos no contrato: só em parcelamento. No financiamento com juros a nota e o boleto ficam no lançamento.';

/* Número em tabela: a FONTE DO PROJETO com dígitos de largura fixa (PARC-CONTRATO-01: a mono destoava do resto do sistema). */
const NUM = 'tabular-nums whitespace-nowrap';
/* FIN-FINANC-28-P3-FIX — a tabela de Parcelas usa a RÉGUA DE LANÇAMENTOS (as classes de `ListaDeFinanciamentos.tsx`, que são as de
   `FinanceiroV2Tab.tsx`): valor `celula-valor` 9px/600, data `celula-data` mono 8px, selo `celula-status`, linha de 25px,
   cabeçalho 8px/600. */
const MOEDA = TD_VALOR_LANC;
/* PARC-FECHA-02 item 5 — o Total é o RODAPÉ PADRÃO DA CASA (o `TF` de `ParcelasDaCompra`): fundo #E8E6DF, negrito, 2px em cima.
   ⚠ O filete de 2px é SOMBRA INTERNA da célula, não borda: o `tfoot` é `sticky` e borda de célula em tabela colapsada fica
   para trás quando a lista rola. A sombra anda com a célula e não ocupa espaço (a linha segue com 19px). */
const TOTAL = 'bg-[#E8E6DF] text-[10px] font-bold shadow-[inset_0_2px_0_#9aa7b6]';
/* linha da parcela: 19px (o padrão de tabela, A31). Nada dentro dela passa de 16px — o filho mais alto manda na altura. */
/* ⚠ a entrelinha vai ESCRITA: a celula herdava 20px e, sozinha, levava a linha a 20,5–21px (medido). 18 + 1 de borda = 19. */
const LINHA = LINHA_LANC;
/* TELA DO CONTRATO v4 — a régua do cronograma do CRÉDITO: célula 10,5px, linha de 24px, 3px de padding lateral; cabeçalho navy 10px/600;
   Total preso em cinza forte. Situação: Vencida vermelho sólido, A vencer contornado, Paga verde. */
const TH_V4 = 'sticky top-0 z-10 h-[24px] whitespace-nowrap bg-[#1d3a5d] px-[2.5px] text-[10px] font-semibold text-white';
const TD_V4 = 'h-[24px] overflow-hidden whitespace-nowrap px-[2.5px] text-[10.5px] text-[#111827]';
const TF_V4 = 'sticky bottom-0 z-10 h-[24px] whitespace-nowrap bg-[#e4e9ef] px-[2.5px] text-[10.5px] font-bold text-[#111827] shadow-[inset_0_1px_0_#c5ced9]';
const SELO_V4: Record<'paga' | 'vencida' | 'pendente' | 'parcial', string> = {
  vencida: 'bg-[#b42318] text-white', pendente: 'border border-[#8a96a8] text-[#334155]', paga: 'bg-[#dcf2e3] text-[#166534]', parcial: 'bg-[#fdf0dc] text-[#b45309]',
};

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
        .select('*, financeiro_fornecedores!financiamentos_credor_id_fkey(nome, cpf_cnpj), financeiro_contas_bancarias!financiamentos_conta_bancaria_id_fkey(nome_conta, nome_exibicao), financeiro_plano_contas!financiamentos_plano_conta_parcela_id_fkey(subcentro), financiamento_linhas_credito!financiamentos_linha_credito_id_fkey(programa, descricao)')
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
  /* FIN-FINANC-28 PASSO 4 — liberações, destinações e documentos do contrato de crédito (o hook roda sempre: regra dos hooks;
     na compra parcelada a tela não o desenha) */
  const credito = useContratoDeCredito(id, clienteId);
  /* EDITAR = CADASTRO NOVO v2: o cabeçalho, as parcelas à mão, o regerar e o desfazer do crédito */
  const edicao = useEdicaoDoContrato(id, clienteId);
  const [focoParcela, setFocoParcela] = useState<string | null>(null);
  /* a leitura da tela acompanha a situação: pagar ou vincular por outro caminho relê a situação, e com ela o "A resolver" */
  const relerTela = credito.relerTela;
  useEffect(() => { if (situacao) relerTela(); }, [situacao]); // eslint-disable-line react-hooks/exhaustive-deps
  /* PASSO 4b — buscar o pagamento de uma parcela / desfazer o vínculo (os dois diálogos são donos da gravação) */
  const [buscarPagamentoDe, setBuscarPagamentoDe] = useState<string | null>(null);
  /* TELA DO CONTRATO v3 — a aba do crédito (o cronograma abre primeiro) */
  const [abaDoCredito, setAbaDoCredito] = useState<AbaDoCredito>('cronograma');
  const [desvinculando, setDesvinculando] = useState<VinculoDePagamento | null>(null);
  /* PASSO 5 — a baixa escolhida no menu e o "Desfazer baixa" */
  const [baixaEscolhida, setBaixaEscolhida] = useState<TipoDeBaixa | null>(null);
  const [desfazendoBaixa, setDesfazendoBaixa] = useState(false);
  /* FIN-CONTRATO-JUNTAR-01 */
  const [juntando, setJuntando] = useState(false);
  const [desfazendoJuncao, setDesfazendoJuncao] = useState<{ id: string; evento: string } | null>(null);
  /* passo 7: a rolagem cria o contrato novo pelo cadastro novo, já com o credor deste */
  const [criandoSucessor, setCriandoSucessor] = useState(false);
  const [versaoDosContratos, setVersaoDosContratos] = useState(0);
  const refDocumentos = useRef<HTMLDivElement>(null);

  /* FIN-FINANC-28-P3-FIX2 — a "Data de liberação" do cabeçalho: a 1ª liberação VIVA do contrato (sem liberação: "—") */
  const { data: primeiraLiberacao } = useQuery({
    queryKey: ['financiamento-primeira-liberacao', id],
    enabled: !!id && !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase.from('financiamento_liberacoes').select('data')
        .eq('financiamento_id', id!).is('cancelado_em', null).order('data', { ascending: true }).limit(1);
      if (error) throw error;
      return data?.[0]?.data ?? null;
    },
  });
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

    /* EDITAR = CADASTRO NOVO v2 (18/10/2026): este gravador ficou SÓ para a compra parcelada (o crédito grava o cabeçalho por
       `fn_financiamento_salvar_cabecalho`, que sincroniza a captação no banco). Saíram daqui o DESLOCAMENTO de dias das parcelas
       (só valia fora do parcelamento) e a SINCRONIA DA CAPTAÇÃO (nenhum parcelamento tem captação: medido 0 de 64 em 18/10). */
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
      const { cancelarLancamentosDoFinanciamento } = await importarDoApp(() => import('@/lib/financiamentos/parcelaMirror'));
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
  /* FIN-CONSORCIO-02 — o consórcio tem cadastro próprio: o detalhe abre o modal dele; fechar volta à lista. */
  if (fin.natureza === 'consorcio' && id) {
    return <ConsorcioDialog aberto financiamentoId={id} aoFechar={() => onVoltar?.()} />;
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
  const colunas = colunasDasParcelas(ehParcelamento);
  const escopo = fin.tipo_financiamento === 'agricultura' ? 'agricultura' : 'pecuaria';
  const nomeCredor = fin.financeiro_fornecedores?.nome ?? null;
  /* FIN-FINANC-28-P3-FIX4 — o documento do credor, formatado; sem documento no cadastro, "—" na grade */
  const documentoCredor = formatarDocumento(fin.financeiro_fornecedores?.cpf_cnpj ?? null) || null;
  const nomeConta = fin.financeiro_contas_bancarias?.nome_exibicao || fin.financeiro_contas_bancarias?.nome_conta || null;
  const nomeParcela = fin.financeiro_plano_contas?.subcentro ?? null;
  /* FIN-FINANC-28 PASSO 4 — o contrato de crédito: contratado do BANCO (`fn_financiamento_saldo`); saldo após e avisos dos donos */
  const resumoDoCredito = resumoDoContratoNaLista(situacao);
  const contratadoDoCredito = situacao?.saldo?.contratado ?? null;
  const saldoApos = ehParcelamento ? null : saldoAposDasParcelas(contratadoDoCredito, linhas);
  /* B3 (18/10): o aviso do principal que não fecha com o contratado sai de baixo do cronograma e vira item da aba "A resolver";
     os outros avisos (a 1ª parcela) ficam sob o cronograma */
  const principalDifere = ehParcelamento ? null : avisoDoPrincipal({ contratado: contratadoDoCredito, somaPrincipal: cartoes ? cartoes.somaPrincipal : null });
  const avisos = (ehParcelamento ? [] : avisosDoCronograma({
    contratado: contratadoDoCredito, somaPrincipal: cartoes ? cartoes.somaPrincipal : null, parcelas: linhas, primeiraLiberacao: primeiraLiberacao ?? null,
  })).filter((a) => a !== principalDifere);
  /* B3 (medido 18/10): a 1.126×579 o aviso da 1ª parcela ocupava 42px sob o cronograma e tirava duas parcelas da vista — ele
     também vira item da aba "A resolver" (só informa). Sob o cronograma não fica aviso nenhum. */
  const pendentesDoBanco = credito.tela?.aResolver ?? [];
  const ajustadas = new Set(parcelas.filter((r) => 'ajustada' in r && r.ajustada === true).map((r) => r.id));
  const parcelasParaEditar: ParcelaParaEditar[] = linhas.map((p) => ({
    id: p.id, numero: p.numero, vencimento: p.dataVencimento, principal: p.valorPrincipal, juros: p.valorJuros, ajustada: ajustadas.has(p.id),
    trava: travaNaTela(p.situacao, credito.vinculos.some((v) => v.parcelaId === p.id)),
  }));
  const avisosDaLista = [...(principalDifere ? [principalDifere] : []), ...avisos];
  const pendencias = { qtde: pendentesDoBanco.length + avisosDaLista.length, vencido: pendentesDoBanco.some((p) => p.tom === 'vencido') };
  /* TELA DO CONTRATO v4 — a 5ª célula do Resumo: Vencido (vermelho) quando há; no quitado, a data do último pagamento; senão o
     próximo pagamento (a 1ª parcela não paga, pela ordem do vencimento). Nada é somado: os valores são os do banco. */
  const proxima = linhas.find((p) => p.situacao !== 'paga') ?? null;
  const ultimoPagamento = linhas.map((p) => p.pagoEm).filter((d): d is string => !!d).sort().at(-1) ?? null;
  const quinta: QuintaCelula | null = !cartoes ? null
    : cartoes.vencido > 0 ? { rotulo: 'Vencido', valor: fmt(cartoes.vencido), vermelho: true,
      title: contagens ? `${contagens.vencidoQtde} ${contagens.vencidoQtde === 1 ? 'parcela vencida' : 'parcelas vencidas'}` : undefined }
    : fin.status === 'quitado' ? { rotulo: 'Quitado em', valor: dataLonga(ultimoPagamento), title: 'a data do último pagamento' }
    : proxima ? { rotulo: `Próx. pgto. ${dataLonga(proxima.dataVencimento)}`, valor: fmt(proxima.valorTotal), title: `Próximo pagamento ${dataLonga(proxima.dataVencimento)}` }
    : { rotulo: 'Próx. pgto.', valor: '—', title: 'Próximo pagamento' };
  const subtitulo = subtituloDoContrato({
    linha: fin.financiamento_linhas_credito?.programa ?? fin.financiamento_linhas_credito?.descricao ?? null,
    taxaAnual: Number(fin.taxa_juros) || null, taxaMensal: Number(fin.taxa_juros_mensal) || null,
    carenciaAte: fin.carencia_ate ?? null, sistema: fin.sistema_amortizacao ?? null,
    ate: fin.vencimento_final ?? linhas[linhas.length - 1]?.dataVencimento ?? null,
  });
  /* TELA DO CONTRATO v3 — o botão de cada pendência do "A resolver" leva ao gesto que a resolve */
  /* a aba "A resolver" some sem pendência: aberta, volta ao Cronograma (a aba padrão) */
  const abaAberta: AbaDoCredito = abaDoCredito === 'a_resolver' && pendencias.qtde === 0 ? 'cronograma' : abaDoCredito;
  const resolverPendente = (acao: AcaoDoPendente, p: PendenteDoContrato) => {
    if (acao === 'buscar_pagamento') { setAbaDoCredito('cronograma'); if (p.parcelaId) setBuscarPagamentoDe(p.parcelaId); }
    else if (acao === 'ver_liberacoes') setAbaDoCredito('liberacoes');
    else if (acao === 'ver_cronograma') setAbaDoCredito('cronograma');
    else if (acao === 'anexar') setAbaDoCredito('documentos');
    else abrirEdicao('contrato');
  };

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
    <div className={`w-full min-w-0 h-full min-h-0 flex flex-col overflow-hidden ${ehParcelamento ? 'bg-background max-w-5xl mx-auto' : COR_V4.pagina}`} data-testid="tela-do-contrato">

      {/* ═══ TELA DO CONTRATO v4 (18/10): a faixa navy "Financeiro / … / <contrato>" SAIU — o caminho é a barra do app (uma faixa
          só). Voltar é a seta da linha do título. */}
      <div className={`shrink-0 space-y-1.5 pb-1.5 pt-1.5 ${ehParcelamento ? 'px-3' : 'px-2'}`}>
        {ehParcelamento ? (<>
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

        {/* ═══ b — DADOS: GRADE CHAVE–VALOR (FIN-FINANC-28-P3-FIX2). Rótulos e valores na MESMA grade (antes eram linhas flex
            soltas, cada uma com a sua largura, e os rótulos de uma linha não caíam sob os da outra). 4 pares por linha a partir de
            1.280px, 2 abaixo. Primeiro os oito do pedido; depois os que a tela já mostrava (nada some). Vazio = "—". */}
        <div className="rounded-md border px-2 py-1" data-testid="dados-do-contrato">
          {/* FIN-FINANC-28-P3-FIX3 — COMPRA PARCELADA não fala de contrato, liberação, valor contratado nem vencimento final.
              Ordem do Gabriel; credor pelo NOME INTEIRO; competência = mês/ano da compra (texto da data, sem conta); situação =
              o status gravado no contrato (`financiamentos.status`), sem cálculo. Régua do formulário (10px / 11px).
              ⚠ PASSO 4: esta grade é SÓ da compra parcelada — o crédito tem o cabeçalho próprio (`CabecalhoDoCredito`). */}
          <GradeChaveValor regua="formulario" testId="grade-da-compra" colunas={[
            /* coluna 1 — a compra: o que foi, quando, de onde sai o dinheiro (ordem do Gabriel, 17/10 11:05) */
            [
              { rotulo: 'Descrição', valor: fin.descricao },
              { rotulo: 'Data da compra', valor: fmtDate(fin.data_contrato), tipo: 'data' },
              { rotulo: 'Competência', valor: fin.data_contrato ? `${fin.data_contrato.slice(5, 7)}/${fin.data_contrato.slice(0, 4)}` : null, tipo: 'data' },
              { rotulo: '1ª parcela', valor: fmtDate(fin.data_primeira_parcela), tipo: 'data' },
              { rotulo: 'Safra', valor: safraDasParcelas ?? '…' },
              { rotulo: 'Conta', valor: nomeConta },
              ...(fin.observacao ? [{ rotulo: 'Observação', valor: fin.observacao }] : []),
            ],
            /* coluna 2 — com quem e quanto: o CNPJ/CPF NUNCA se separa do Credor */
            [
              { rotulo: 'Credor', valor: nomeCredor ?? null, title: nomeEDocumento(nomeCredor, documentoCredor) || undefined },
              { rotulo: 'CNPJ/CPF', valor: documentoCredor },
              { rotulo: 'Valor da compra', valor: fin.valor_total != null ? fmt(Number(fin.valor_total)) : null, tipo: 'dinheiro' },
              { rotulo: 'Parcelas', valor: fin.total_parcelas != null ? String(fin.total_parcelas) : null },
              { rotulo: 'Classificação', valor: nomeParcela },
              { rotulo: 'Situação', valor: fin.status ? <SeloDoContrato status={fin.status} /> : null, title: fin.status ?? undefined },
              ...(Number(fin.valor_entrada) > 0 ? [{ rotulo: 'Entrada', valor: fmt(Number(fin.valor_entrada)), tipo: 'dinheiro' as const }] : []),
            ],
          ]} />
        </div>

        {/* ═══ c — CARTÕES de 40px, lidos de `fn_financiamento_situacao` (valores E contagens). "Juros previstos" só no crédito. */}
        <div className={`grid gap-2 ${ehParcelamento ? 'grid-cols-5' : 'grid-cols-6'}`}>
          <Cartao rotulo={ehParcelamento ? 'Valor da compra' : 'Valor do contrato'} valor={fmt(Number(fin.valor_total))} borda="border-l-muted-foreground/40" />
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
        </>) : (
          /* TELA DO CONTRATO v3 (Gabriel 18/10/2026) — título com selos e ações · Contrato em duas colunas + Resumo · A resolver */
          <TopoDoContrato numero={fin.numero_contrato ?? null} descricao={fin.descricao ?? ''} status={fin.status ?? null}
            saldo={situacao?.saldo} tela={credito.tela} parcelas={cartoes ? { total: cartoes.parcelas, pagas: cartoes.pagas } : null} quinta={quinta}
            onVoltar={onVoltar} onEditar={() => abrirEdicao('contrato')} pendencias={pendencias} onAbrirPendencias={() => setAbaDoCredito('a_resolver')}
            acaoDeJuntar={<BotaoJuntar status={fin.status ?? null} onAbrir={() => setJuntando(true)} />}
            acaoDeBaixa={<BotaoDarBaixa destaque status={fin.status ?? null} api={credito} onEscolher={setBaixaEscolhida} onDesfazer={() => setDesfazendoBaixa(true)} />} />
        )}
      </div>

      {/* ═══ TELA DO CONTRATO v3 — ABAS do crédito (o Segmentado da casa). O painel da aba ocupa o resto da altura. */}
      {!ehParcelamento && (
        <div className="flex shrink-0 items-center gap-2 px-2 pb-1.5" data-testid="abas-do-credito">
          {/* v4: uma linha, sem quebrar; a contagem fica ao lado do rótulo, em tom mais fraco */}
          <div className="shrink-0 whitespace-nowrap" data-testid="segmentado-das-abas">
          <Segmentado<AbaDoCredito> altura={22} valor={abaAberta} onEscolher={setAbaDoCredito} opcoes={[
            { valor: 'cronograma', rotulo: <RotuloDaAba nome="Cronograma" n={cartoes?.parcelas} /> },
            { valor: 'liberacoes', rotulo: <RotuloDaAba nome="Liberações" n={credito.tela?.liberacoesTotal.qtde} /> },
            { valor: 'pagamentos', rotulo: <RotuloDaAba nome="Pagamentos" n={credito.tela?.pagamentosTotal.qtde} /> },
            { valor: 'documentos', rotulo: <RotuloDaAba nome="Documentos" n={credito.documentos?.length} /> },
            { valor: 'historico', rotulo: 'Histórico' },
            /* "A resolver" é a última aba, com o N num selo vermelho; sem pendência, some */
            ...(pendencias.qtde > 0 ? [{ valor: 'a_resolver' as const, rotulo: (
              <span className="inline-flex items-center gap-1 whitespace-nowrap" data-testid="aba-a-resolver">A resolver
                <span className="rounded-full bg-[#b42318] px-1.5 text-[9.5px] font-semibold leading-[14px] text-white" data-testid="contagem-a-resolver">{pendencias.qtde}</span></span>) }] : []),
          ]} />
          </div>
          {/* recado da linha (erro de abrir/buscar) e "Editar parcelas" moram na barra das abas: nenhuma linha a mais sobre a tabela */}
          <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-destructive" title={recadoDaLinha ?? undefined} data-testid="recado-da-linha">{recadoDaLinha ?? ''}</span>
          <Button variant="outline" size="sm" className="h-[22px] shrink-0 gap-1 px-2 text-[11px]" onClick={() => abrirEdicao('parcelas')} data-testid="editar-parcelas">
            <Pencil className="size-3" /> Editar parcelas
          </Button>
        </div>
      )}
      {!ehParcelamento && abaAberta === 'liberacoes' && clienteId && (
        <div className="min-h-0 flex-1 px-2 pb-2" data-testid="painel-liberacoes">
          <BlocoLiberacoes api={credito} contaDoContrato={nomeConta} onAbrirLancamento={setLancamentoAberto} clienteId={clienteId} />
        </div>
      )}
      {!ehParcelamento && abaAberta === 'pagamentos' && (
        <div className="min-h-0 flex-1 px-2 pb-2" data-testid="painel-pagamentos">
          <TabelaDePagamentos tela={credito.tela} onAbrirLancamento={setLancamentoAberto} />
        </div>
      )}
      {!ehParcelamento && abaAberta === 'documentos' && (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" data-testid="painel-documentos">
          <BlocoDocumentos ref={refDocumentos} api={credito} />
        </div>
      )}
      {!ehParcelamento && abaAberta === 'a_resolver' && (
        <div className="min-h-0 flex-1 px-2 pb-2" data-testid="painel-a-resolver">
          <ListaDePendencias pendencias={pendentesDoBanco} avisos={avisosDaLista} onResolver={resolverPendente} />
        </div>
      )}
      {!ehParcelamento && abaAberta === 'historico' && (
        <div className="min-h-0 flex-1 px-2 pb-2" data-testid="painel-historico">
          <TabelaDoHistorico tela={credito.tela} onDesfazerJuncao={(id, evento) => setDesfazendoJuncao({ id, evento })} />
        </div>
      )}

      {/* ═══ d — PARCELAS, até o rodapé ═══════════════════════════════════════
          ⚠ A ROLAGEM MORA NO WRAPPER DA TABELA (A21), e é nele que o `sticky` do thead e do tfoot ancora. `min-h-0` nos dois
          níveis: sem ele o filho flex recusa-se a encolher abaixo do conteúdo e a rolagem escapa para a tela inteira. */}
      {/* ═══ TELA DO CONTRATO v4 — o CRONOGRAMA do crédito. O card tem a altura do conteúdo até o fim da tela (`max-h-full`): sem
          parcelas fica uma linha, nunca uma área branca enorme. Cabeçalho e Total presos no scrollport da tabela. */}
      {!ehParcelamento && abaAberta === 'cronograma' && (
      <div className="min-h-0 flex-1 px-2 pb-2" data-testid="painel-cronograma">
        <div className={`flex max-h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-white ${COR_V4.borda}`}>
          <div className="min-h-0 overflow-y-auto overflow-x-hidden" data-testid="area-que-rola-cronograma">
            <table className="w-full table-fixed border-collapse" data-testid="tabela-cronograma">
              <colgroup>
                {colunas.map(c => <col key={c.chave} style={c.largura === null ? undefined : { width: c.largura }} />)}
              </colgroup>
              <thead data-testid="cabecalho-cronograma"><tr>
                {colunas.map(c => (
                  <th key={c.chave} data-coluna={c.chave}
                    title={c.chave === 'lancamento' ? 'principal · juros · cada parcela casa com o lançamento do Financeiro (↔)' : undefined}
                    className={`${TH_V4} ${alinhamentoDoCabecalho(c)}`}>{c.rotulo}</th>
                ))}
              </tr></thead>
              <tbody>
                {linhas.length === 0 && (
                  <tr><td colSpan={colunas.length} className={`${TD_V4} ${COR_V4.rotulo}`} data-testid="cronograma-vazio">
                    Sem parcelas. Use ✎ Editar parcelas ou Editar para gerar o cronograma.
                  </td></tr>
                )}
                {linhas.map(p => {
                  const d = p.detalhe;
                  const vencida = p.situacao === 'vencida';
                  const vs = credito.vinculos.filter(v => v.parcelaId === p.id);
                  const podeBuscar = vs.length === 0 && (p.situacao !== 'paga' || (!p.lancamentoId && !p.lancamentoJurosId));
                  return (
                    <tr key={p.id} className={`border-b ${COR_V4.bordaFina} ${vencida ? COR_V4.fundoVermelho : 'hover:bg-[#f4f6f9]'} ${p.lancamentoId ? 'cursor-pointer' : ''}`}
                      data-testid="linha-do-contrato" data-situacao={p.situacao}
                      onClick={() => { if (p.lancamentoId) setLancamentoAberto(p.lancamentoId); }} title={p.lancamentoId ? undefined : MOTIVO_PARCELA_SEM_LANCAMENTO}>
                      <td className={`${TD_V4} tabular-nums`}>{p.numero ?? '—'}{cartoes ? `/${cartoes.parcelas}` : ''}</td>
                      <td className={`${TD_V4} text-[10px] tabular-nums ${vencida ? `font-semibold ${COR_V4.vermelho}` : ''}`}>{dataLonga(p.dataVencimento)}</td>
                      <td className={`${TD_V4} text-[10px] tabular-nums`} data-testid="pago-em">{dataLonga(p.pagoEm)}</td>
                      <td className={`${TD_V4} text-[10px] ${d?.prazo && TOM_DO_PRAZO[d.prazo.tipo] === 'vermelho' ? COR_V4.vermelho : d?.prazo && TOM_DO_PRAZO[d.prazo.tipo] === 'verde' ? 'text-[#15803d]' : COR_V4.rotulo}`} data-testid="prazo">
                        {textoDoPrazoCurto(d?.prazo ?? null)}
                      </td>
                      <td className={`${TD_V4} text-right tabular-nums`}>{p.valorPrincipal === 0 ? <span className={COR_V4.rotulo}>carência</span> : num2(p.valorPrincipal)}</td>
                      <td className={`${TD_V4} text-right tabular-nums`}>{num2(p.valorJuros)}</td>
                      <td className={`${TD_V4} text-right font-semibold tabular-nums`}>{num2(p.valorTotal)}</td>
                      <td className={`${TD_V4} text-right tabular-nums`} data-testid="saldo-apos">{saldoApos?.get(p.id) == null ? '—' : num2(saldoApos.get(p.id) ?? 0)}</td>
                      <td className={TD_V4}>
                        <span className={`inline-flex items-center whitespace-nowrap rounded px-[2px] text-[9.5px] font-semibold leading-[15px] ${SELO_V4[p.situacao]}`}
                          title={origemDaSituacao(p)} data-testid="situacao-da-parcela">{ROTULO_SITUACAO[p.situacao]}</span>
                        {ajustadas.has(p.id) && <> <SeloAjustada /></>}
                      </td>
                      {/* UI-SEM-CORTE-01 — sem corte calado: onde a coluna não comporta os gestos (750px de conteúdo), eles quebram a linha */}
                      <td className={`${TD_V4} !overflow-visible !whitespace-normal py-[3px]`} data-testid="lancamento-da-parcela" title={d?.contaNome ? `conta: ${d.contaNome}` : undefined}>
                        <div className="flex min-w-0 flex-wrap items-center text-[10px] [&>*]:whitespace-nowrap">
                          {p.lancamentoId && (
                            <button type="button" className="font-medium text-primary hover:underline" title="Abrir o lançamento do principal no Financeiro"
                              onClick={(e) => { e.stopPropagation(); setLancamentoAberto(p.lancamentoId); }} data-testid="ver-principal">↔ principal</button>
                          )}
                          {p.lancamentoId && p.lancamentoJurosId && <span className={`px-[2px] ${COR_V4.rotulo}`}>·</span>}
                          {p.lancamentoJurosId && (
                            <button type="button" className="font-medium text-primary hover:underline" title="Abrir o lançamento dos juros desta parcela no Financeiro"
                              onClick={(e) => { e.stopPropagation(); setLancamentoAberto(p.lancamentoJurosId); }} data-testid="ver-juros">↔ juros</button>
                          )}
                          {!p.lancamentoId && !p.lancamentoJurosId && <span className={COR_V4.rotulo}>—</span>}
                          {vs.length > 0 && (<>
                            <span className={`px-[2px] ${COR_V4.rotulo}`}>·</span>
                            <button type="button" className={`font-medium hover:underline ${COR_V4.vermelho}`} data-testid="desvincular-pagamento"
                              title={`Pagamento vinculado (${vs.map(v => ROTULO_DO_PAPEL[v.papel]).join(', ')}) · desvincular volta a parcela como estava`}
                              onClick={(e) => { e.stopPropagation(); setDesvinculando(vs[0]); }}>desvincular</button>
                          </>)}
                          {podeBuscar && (<>
                            <span className={`px-[2px] ${COR_V4.rotulo}`}>·</span>
                            <button type="button" className="font-medium text-primary hover:underline" data-testid="buscar-pagamento-botao"
                              title="Procurar no Financeiro o lançamento que pagou esta parcela"
                              onClick={(e) => { e.stopPropagation(); setBuscarPagamentoDe(p.id); }}>Buscar</button>
                          </>)}
                          {/* o lápis mora no FIM da mesma célula (a coluna própria saiu) */}
                          <button type="button" className={`ml-auto flex size-[14px] shrink-0 items-center justify-center rounded hover:bg-[#e3e8ee] ${COR_V4.rotulo}`}
                            onClick={(e) => { e.stopPropagation(); setFocoParcela(p.id); abrirEdicao('parcelas'); }}
                            title="Editar as parcelas (esta em destaque)" aria-label="Editar a parcela" data-testid="lapis-da-parcela">
                            <Pencil className="size-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {linhas.length > 0 && (
                <tfoot data-testid="rodape-das-parcelas"><tr>
                  <td colSpan={4} className={TF_V4}>Total{cartoes ? ` · ${cartoes.parcelas} ${cartoes.parcelas === 1 ? 'parcela' : 'parcelas'}` : ''}</td>
                  <td className={`${TF_V4} text-right tabular-nums`}>{cartoes ? num2(cartoes.somaPrincipal) : '…'}</td>
                  <td className={`${TF_V4} text-right tabular-nums`}>{cartoes ? num2(cartoes.jurosPrevistos) : '…'}</td>
                  <td className={`${TF_V4} text-right tabular-nums`} data-testid="total-das-parcelas">{cartoes ? num2(cartoes.somaTotal) : '…'}</td>
                  <td className={TF_V4} />
                  <td className={`${TF_V4} tabular-nums`} data-testid="total-pagas">{cartoes ? `${cartoes.pagas} de ${cartoes.parcelas}` : '…'}</td>
                  <td className={TF_V4} data-testid="total-pago">pago <span className="tabular-nums text-[#15803d]">{cartoes ? num2(cartoes.pago) : '…'}</span></td>
                </tr></tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
      )}

      {ehParcelamento && (
      <div className="min-h-0 flex-1 px-3 pb-1" data-testid="painel-cronograma">
        <div className={`flex h-full min-h-0 flex-col rounded-lg border border-border bg-card px-3 pt-1.5 ${ehParcelamento ? 'pb-0' : 'pb-1.5'}`}>
          {/* B3: no crédito esta linha saiu — o subtítulo virou o title do cabeçalho Lançamento e "Editar parcelas" foi para a barra das abas */}
          {ehParcelamento && (
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
          )}
          <div className="min-h-0 flex-1">
            <Table density="dense" className={`${TABELA_LANC} table-fixed [&_td:not(.celula-valor)]:font-normal`} wrapperClassName="h-full overflow-x-hidden overflow-y-auto">
              {/* ⚠ A RÉGUA TEM UM DONO (`reguaDasParcelas.ts`): o `colgroup` e o cabeçalho saem da MESMA lista — largura medida no
                  pior texto e o th alinhado como o conteúdo da coluna. Só a Conta (sem largura) fica com o resto e corta. */}
              <colgroup>
                {colunas.map(c => <col key={c.chave} style={c.largura === null ? undefined : { width: c.largura }} />)}
              </colgroup>
              <TableHeader className="sticky top-0 z-10 bg-primary text-primary-foreground [&_tr]:border-b-0 [&_tr]:hover:bg-primary">
                <TableRow>
                  {colunas.map(c => <ThDet key={c.chave} coluna={c} />)}
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
                      {ehParcelamento && <TableCell className={TD_DATA_LANC} data-testid="competencia">{fmtDate(d?.competencia ?? null)}</TableCell>}
                      <TableCell className={`${TD_DATA_LANC} ${p.situacao === 'vencida' ? '!font-semibold text-[#b91c1c]' : ''}`}>{fmtDate(p.dataVencimento)}</TableCell>
                      <TableCell className={TD_DATA_LANC} data-testid="pago-em">{fmtDate(p.pagoEm)}</TableCell>
                      <TableCell className={`whitespace-nowrap text-[9px] ${d?.prazo ? COR_DO_PRAZO[TOM_DO_PRAZO[d.prazo.tipo]] : 'text-muted-foreground'}`} data-testid="prazo">
                        {textoDoPrazo(d?.prazo ?? null)}
                      </TableCell>
                      {ehParcelamento && <TableCell className="truncate" title={d?.contaNome ?? undefined} data-testid="conta-da-parcela">{d?.contaNome ?? '—'}</TableCell>}
                      {/* principal zero = parcela de carência (só juros) */}
                      {!ehParcelamento && <TableCell className={MOEDA}>{p.valorPrincipal === 0 ? <span className="font-normal text-muted-foreground">carência</span> : num2(p.valorPrincipal)}</TableCell>}
                      {!ehParcelamento && <TableCell className={MOEDA}>{num2(p.valorJuros)}</TableCell>}
                      <TableCell className={`${MOEDA} font-semibold`}>{num2(p.valorTotal)}</TableCell>
                      {!ehParcelamento && <TableCell className={MOEDA} data-testid="saldo-apos">{saldoApos?.get(p.id) == null ? '—' : num2(saldoApos.get(p.id) ?? 0)}</TableCell>}
                      <TableCell className="celula-status">
                        <span className={`inline-flex items-center whitespace-nowrap rounded px-1 py-0 text-[9px] font-normal leading-tight ${orfa ? CLASSE_SEM_LANCAMENTO : CLASSE_SITUACAO[p.situacao]}`}
                              title={orfa ? porQueSemLancamento(p) : origemDaSituacao(p)} data-testid="situacao-da-parcela" data-sem-lancamento={orfa ? 'sim' : undefined}>
                          {orfa ? ROTULO_SEM_LANCAMENTO : ROTULO_SITUACAO[p.situacao]}
                        </span>
                        {/* EDITAR v2: a parcela ajustada à mão leva o selo (a coluna `ajustada` do banco), na mesma célula */}
                        {!ehParcelamento && ajustadas.has(p.id) && <> <SeloAjustada /></>}
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
                        <TableCell className="truncate" data-testid="lancamento-da-parcela" title={d?.contaNome ? `conta: ${d.contaNome}` : undefined}>
                          {/* crédito: a parcela tem DOIS lançamentos — ↔ abre cada um no Financeiro; sem nenhum, "—" */}
                          {p.lancamentoId && (
                            <button type="button" className="text-[10px] font-medium text-primary hover:underline" title="Abrir o lançamento do principal no Financeiro"
                              onClick={(e) => { e.stopPropagation(); setLancamentoAberto(p.lancamentoId); }} data-testid="ver-principal">
                              ↔ principal
                            </button>
                          )}
                          {p.lancamentoId && p.lancamentoJurosId && <span className="px-1 text-muted-foreground">·</span>}
                          {p.lancamentoJurosId && (
                            <button type="button" className="text-[10px] font-medium text-primary hover:underline"
                              title="Abrir o lançamento dos juros desta parcela no Financeiro"
                              onClick={(e) => { e.stopPropagation(); setLancamentoAberto(p.lancamentoJurosId); }} data-testid="ver-juros">
                              ↔ juros
                            </button>
                          )}
                          {!p.lancamentoId && !p.lancamentoJurosId && <span className="text-muted-foreground">—</span>}
                          {/* PASSO 4b: pagamento vinculado pelo operador -> "desvincular"; em aberto ou "paga sem lançamento" -> "Buscar" */}
                          {(() => {
                            const vs = credito.vinculos.filter(v => v.parcelaId === p.id);
                            if (vs.length > 0) {
                              return (
                                <>
                                  <span className="px-1 text-muted-foreground">·</span>
                                  <button type="button" className="text-[10px] font-medium text-destructive hover:underline" data-testid="desvincular-pagamento"
                                    title={`Pagamento vinculado (${vs.map(v => ROTULO_DO_PAPEL[v.papel]).join(', ')}) · desvincular volta a parcela como estava`}
                                    onClick={(e) => { e.stopPropagation(); setDesvinculando(vs[0]); }}>desvincular</button>
                                </>
                              );
                            }
                            const podeBuscar = p.situacao !== 'paga' || (!p.lancamentoId && !p.lancamentoJurosId);
                            return podeBuscar ? (
                              <>
                                <span className="px-1 text-muted-foreground">·</span>
                                <button type="button" className="text-[10px] font-medium text-primary hover:underline" data-testid="buscar-pagamento-botao"
                                  title="Procurar no Financeiro o lançamento que pagou esta parcela"
                                  onClick={(e) => { e.stopPropagation(); setBuscarPagamentoDe(p.id); }}>Buscar</button>
                              </>
                            ) : null;
                          })()}
                        </TableCell>
                      )}
                      <TableCell className="px-0 text-right select-none">
                        {/* ⚠ 16px DENTRO DE LINHA DE 19px: `py-0` na célula faz o filho mais alto mandar na altura de TODAS as linhas. */}
                        <Button variant="ghost" size="icon" className="h-4 w-4 p-0 align-middle"
                          onClick={(e) => { e.stopPropagation(); if (ehParcelamento) abrir(); else { setFocoParcela(p.id); abrirEdicao('parcelas'); } }}
                          disabled={ehParcelamento && !p.lancamentoId}
                          title={!ehParcelamento ? 'Editar as parcelas (esta em destaque)' : p.lancamentoId ? 'Abrir o lançamento desta parcela no Financeiro' : MOTIVO_PARCELA_SEM_LANCAMENTO}
                          aria-label={ehParcelamento ? 'Abrir o lançamento da parcela' : 'Editar a parcela'}>
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
                {ehParcelamento ? (
                <TableRow className={`${LINHA} hover:bg-transparent`}>
                    <TableCell colSpan={5} className={`${TOTAL} whitespace-nowrap`}>
                      Total{cartoes ? ` · ${cartoes.parcelas} ${cartoes.parcelas === 1 ? 'parcela' : 'parcelas'}` : ''}
                    </TableCell>
                    {/* FIN-FINANC-28-P3-FIX3 — na compra parcelada a célula sob a Conta fica vazia (o "pago X" já está no cartão Pago) */}
                    <TableCell className={`${TOTAL} whitespace-nowrap text-right`} data-testid="total-pago">
                      {!ehParcelamento && <><span className="font-normal text-muted-foreground">pago</span> <span className="tabular-nums text-[#15803d]">{cartoes ? num2(cartoes.pago) : '…'}</span></>}
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
                ) : (
                <TableRow className={`${LINHA} hover:bg-transparent`}>
                  <TableCell colSpan={4} className={`${TOTAL} whitespace-nowrap`}>
                    Total{cartoes ? ` · ${cartoes.parcelas} ${cartoes.parcelas === 1 ? 'parcela' : 'parcelas'}` : ''}
                  </TableCell>
                  <TableCell className={`${MOEDA} ${TOTAL}`}>{cartoes ? num2(cartoes.somaPrincipal) : '…'}</TableCell>
                  <TableCell className={`${MOEDA} ${TOTAL}`}>{cartoes ? num2(cartoes.jurosPrevistos) : '…'}</TableCell>
                  <TableCell className={`${MOEDA} ${TOTAL}`} data-testid="total-das-parcelas">{cartoes ? num2(cartoes.somaTotal) : '…'}</TableCell>
                  <TableCell className={TOTAL} />
                  <TableCell className={`${TOTAL} whitespace-nowrap tabular-nums`} data-testid="total-pagas">{cartoes ? `${cartoes.pagas} de ${cartoes.parcelas}` : '…'}</TableCell>
                  <TableCell className={`${TOTAL} whitespace-nowrap`} data-testid="total-pago">
                    <span className="font-normal text-muted-foreground">pago</span> <span className="tabular-nums text-[#15803d]">{cartoes ? num2(cartoes.pago) : '…'}</span>
                  </TableCell>
                  <TableCell className={TOTAL} />
                                </TableRow>
                )}
              </TableFooter>
            </Table>
          </div>
        </div>
      </div>
      )}

      {/* ═══ 6 — EDITAR OBRIGACAO: a MESMA casca do "Nova obrigacao" ═══════════
          ⚠ MONTAGEM CONDICIONAL: o form vive dentro do dialogo, e mantido montado ele
          guardaria o contrato anterior entre aberturas — mesmo motivo da lista.
          ⚠ `onSalvarEdicao` recebe o `saveEdit` DESTA tela: o dialogo e' o formulario,
          e quem grava continua sendo quem ja' gravava (com a sincronia do lancamento de
          captacao intacta). */}
      {/* EDITAR = CADASTRO NOVO v2 (18/10): no crédito o Editar abre o cadastro novo em modo editar e o "Editar parcelas" (e o lápis)
          a edição das parcelas — o ObrigacaoDialog ficou só para a compra parcelada. */}
      {editOpen && !ehParcelamento && abaDoEditar !== 'parcelas' && id && (
        <CadastroDeContratoDialog aberto financiamentoId={id} aoFechar={() => setEditOpen(false)}
          onSalvo={() => { for (const k of ['financiamento-detalhe', 'financiamentos-lista', 'financiamento-situacao', 'contrato-tela']) qc.invalidateQueries({ queryKey: [k] }); }} />
      )}
      {editOpen && !ehParcelamento && abaDoEditar === 'parcelas' && (
        <EditarParcelasDialog aberto aoFechar={() => { setEditOpen(false); setFocoParcela(null); }} api={edicao} ultimaOperacao={edicao.ultimaOperacao}
          parcelas={parcelasParaEditar} focoId={focoParcela} />
      )}
      {editOpen && ehParcelamento && (
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
      {buscarPagamentoDe && (() => {
        const alvo = linhas.find(x => x.id === buscarPagamentoDe);
        return alvo ? <BuscarPagamentoDialog api={credito} parcela={alvo} aoFechar={() => setBuscarPagamentoDe(null)} /> : null;
      })()}
      {juntando && <JuntarContratoDialog api={credito} numero={fin.numero_contrato ?? null} aoFechar={() => setJuntando(false)} />}
      {desfazendoJuncao && <DesfazerJuncaoDialog api={credito} juncaoId={desfazendoJuncao.id} evento={desfazendoJuncao.evento} aoFechar={() => setDesfazendoJuncao(null)} />}
      {baixaEscolhida && <DarBaixaDialog api={credito} tipo={baixaEscolhida} aoFechar={() => setBaixaEscolhida(null)}
        onCriarContratoNovo={() => setCriandoSucessor(true)} versaoDosContratos={versaoDosContratos} />}
      {criandoSucessor && fin && (
        <CadastroDeContratoDialog aberto aoFechar={() => setCriandoSucessor(false)}
          prefill={{ natureza: fin.natureza === 'emprestimo' ? 'emprestimo' : 'financiamento', credorId: fin.credor_id ?? null,
            valor: situacao?.saldo?.saldo ?? undefined, descricao: `${fin.descricao ?? ''} (renovação)` }}
          onSalvo={() => setVersaoDosContratos((v) => v + 1)} />
      )}
      {desfazendoBaixa && credito.baixaViva && (
        <RemoverDialog titulo="Desfazer baixa" comMotivo
          frase={`Desfaz a baixa "${ROTULO_DA_BAIXA[credito.baixaViva.tipo]}": o contrato volta como estava, as parcelas que saíram voltam e os lançamentos programados são recriados.`}
          aoConfirmar={(motivo) => credito.desfazerBaixa(credito.baixaViva!.id, motivo)} aoFechar={() => setDesfazendoBaixa(false)} />
      )}
      {desvinculando && (
        <RemoverDialog titulo="Desvincular pagamento da parcela" comMotivo
          frase={`O pagamento sai da parcela (${ROTULO_DO_PAPEL[desvinculando.papel]}): ela volta como estava e o lançamento programado é recriado. O lançamento do Financeiro não é apagado nem alterado.`}
          aoConfirmar={async (motivo) => { const r = await credito.desvincularPagamento(desvinculando.id, motivo, false); return typeof r === 'string' ? r : r.recusa; }}
          aoFechar={() => setDesvinculando(null)} />
      )}
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
function ThDet({ coluna }: { coluna: ColunaDasParcelas }) {
  return (
    /* a régua de Lançamentos (8px/600 maiúsculo) com o MESMO padding lateral da célula (px-2 do primitivo): o título do número fica
       à direita, em cima do número */
    <TableHead className={`${TH_LANC} px-2 tracking-[0.02em] ${alinhamentoDoCabecalho(coluna)}`} data-coluna={coluna.chave}
      title={coluna.chave === 'lancamento' ? 'principal · juros · cada parcela casa com o lançamento do Financeiro (↔)' : undefined}>
      {coluna.rotulo}
    </TableHead>
  );
}

/** TELA DO CONTRATO v4 — o rótulo da aba com a contagem ao lado, em tom mais fraco, na mesma linha */
function RotuloDaAba({ nome, n }: { nome: string; n: number | undefined }) {
  return <span className="inline-flex items-center gap-1 whitespace-nowrap">{nome}{n !== undefined && <span className="tabular-nums opacity-60">{n}</span>}</span>;
}
