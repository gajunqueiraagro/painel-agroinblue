import { ArrowLeft, Plus, ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { useCliente } from '@/contexts/ClienteContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import { ObrigacaoDialog } from '@/components/financiamentos/ObrigacaoDialog';
import { lerSituacaoEmLoteDoBanco } from '@/hooks/useSituacaoDoContrato';
import { inscreverEmLancamentos } from '@/hooks/useFinanceiroV2';
import { resumoDoContratoNaLista, totaisDasCompras } from '@/lib/financiamentos/situacaoEmLote';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { Segmentado } from '@/components/ui/segmentado';
import {
  ListaDeFinanciamentos, SeloDoContrato, TABELA_LANC, TD_DATA_LANC, TD_VALOR_LANC, LINHA_LANC, TH_LANC,
} from '@/components/financiamentos/ListaDeFinanciamentos';
import { contratoDaLista, ehCompraParcelada, ENCERRADOS, type ContratoDaLista } from '@/lib/financiamentos/listaDeFinanciamentos';

/* ── Types ── */
/* ⚠ CLASSES LIDAS DO CÓDIGO DA REFERÊNCIA, não estimadas: `NUM` e `APOIO` são
   os mesmos de `ObrigacoesTabela`. O `whitespace-nowrap` do NUM tem motivo
   registrado lá — sem ele "−R$ 2.155,00" quebra em duas linhas e a altura da
   linha deixa de ser previsível. */
const NUM = 'text-right font-mono tabular-nums whitespace-nowrap';
/* ⚠ 9px — EXCECAO DELIBERADA AO PISO DE 10px, e SO' para numero monetario em fonte MONO
   (decisao do Gabriel, PR-PARC-05d item 6b). Medido: "R$ 16.380.000,00" sao 16 caracteres;
   em mono 10px (~0,6em = 6px por caractere) da' 96px + `px-2` da celula = 112px, contra os
   ~116px que 12% de largura ofereciam — passava raspando e, com `whitespace-nowrap`,
   invadia a coluna vizinha em vez de quebrar. As duas saidas obvias estao fechadas:
   ABREVIAR viola o A19 (valor monetario nunca aparece cru nem abreviado) e QUEBRAR LINHA
   viola a linha de 21px do dense. Sobra encolher o digito — e digito mono a 9px continua
   legivel porque nao ha' ambiguidade de largura entre caracteres.
   ⚠ NAO VALE PARA TEXTO: descricao, credor e rotulo seguem em 10px. */
const MOEDA = TD_VALOR_LANC;

interface FinanciamentoRow {
  /** Valor da PRÓXIMA parcela pendente — a coluna "Parcela" da referência. */
  valor_parcela?: number | null;
  id: string;
  descricao: string;
  numero_contrato: string | null;
  data_contrato: string | null;
  /** PR-PARC-02 — financiamento | parcelamento | emprestimo. É o eixo da
   *  pílula da primeira coluna; `tipo_financiamento` virou o ESCOPO. */
  natureza: string;
  tipo_financiamento: string;
  credor_id: string | null;
  valor_total: number;
  total_parcelas: number;
  status: string;
  created_at: string;
  credor_nome?: string;
  parcelas_pagas: number;
  prox_vencimento?: string;
  total_pendente: number;
  /** PR-PARC-03 — a metade "juros" de `total_pendente`, para o total do topo. */
  juros_pendente: number;
  /** FIN-FINANC-28-P3-FIX2 — o já pago e o vencido em aberto, dos cartões do dono (os cards de "Compras parceladas") */
  pago: number;
  vencido: number;
  /** FIN-FINANC-28-P3 — a mesma linha na forma da aba "Financiamentos" (o saldo vem do lote, chave `saldo`). */
  paraLista: ContratoDaLista;
}

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/* ⚠ PR-PARC-02 — 3b — AS TRÊS PÍLULAS NUM LUGAR SÓ, e o motivo é o de sempre
   nesta casa: a mesma natureza aparece na pílula, na busca e no filtro, e três
   ternários espalhados divergem no primeiro PR que acrescentar a quarta. FIN e
   PARC têm as cores medidas no Finanças; EMP é PROPOSTA deste PR — não existe
   na referência. */
const PILULA_NATUREZA: Record<string, { sigla: string; rotulo: string; classe: string }> = {
  financiamento: { sigla: 'FIN',  rotulo: 'Financiamento', classe: 'border-violet-300 bg-violet-50 text-violet-700' },
  parcelamento:  { sigla: 'PARC', rotulo: 'Parcelamento',  classe: 'border-sky-300 bg-sky-50 text-sky-700' },
  emprestimo:    { sigla: 'EMP',  rotulo: 'Empréstimo',    classe: 'border-amber-300 bg-amber-50 text-amber-700' },
};

/** O escopo (`tipo_financiamento`), que saiu da pílula e virou sufixo da descrição. */
const escopoSigla = (tipo: string) => (tipo === 'pecuaria' ? 'PEC' : 'AGR');

/* (o selo da situação passou a ser o `SeloDoContrato`, a forma do status de Lançamentos — FIN-FINANC-28-P3) */

interface FinanciamentosListaProps {
  onNovo?: () => void;
  onDetalhe?: (id: string) => void;
  onVoltar?: () => void;
}

export default function FinanciamentosListaPage({ onNovo, onDetalhe, onVoltar }: FinanciamentosListaProps = {}) {
  const { clienteAtual } = useCliente();
  const { user } = useAuth();
  const clienteId = clienteAtual?.id;
  const qc = useQueryClient();

  /* PR-PARC-04 item 7 — "+ Nova obrigacao" abre um MODAL POR CIMA desta lista, e nao
     mais a pagina de cadastro: a lista continua montada atras, entao ao fechar nao ha'
     remontagem nem perda dos filtros.
     ⚠ A PROP `onNovo` CONTINUA DECLARADA e deixou de ser chamada. O `Index.tsx` ainda a
     passa (e o ramo `finView.mode === 'novo'` continua la', agora inalcancavel); remove-la
     seria mexer em arquivo fora do escopo deste PR. */
  const [novaObrigacaoAberta, setNovaObrigacaoAberta] = useState(false);
  /* FIN-FINANC-28-P3 — duas abas: "Financiamentos" (financiamento e empréstimo, a lista nova) e "Compras parceladas" (a lista
     de sempre, só com os parcelamentos). Os encerrados da aba nova nascem recolhidos. */
  const [aba, setAba] = useState<'financiamentos' | 'parcelas'>('financiamentos');
  const [encerradosAbertos, setEncerradosAbertos] = useState(false);
  const [filtroSituacaoFin, setFiltroSituacaoFin] = useState('todos');

  /* PR-PARC-04b item 3 — ABRIR O CONTRATO. Um caminho so', chamado pela linha inteira e
     pelo olho: eram o mesmo gesto escrito duas vezes, e duas copias de "grava os filtros
     antes de sair" divergem no primeiro filtro novo. */
  const abrirContrato = (id: string) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        status: filtroStatus, tipo: filtroTipo,
        natureza: filtroNatureza,
        descricao: filtroDescricao, contrato: filtroContrato,
        credor: filtroCredor, dataContratoDe: filtroDataContratoDe,
        dataContratoAte: filtroDataContratoAte,
        vencDe: filtroVencDe, vencAte: filtroVencAte,
      }));
    } catch {}
    onDetalhe?.(id);
  };

  const STORAGE_KEY = `financiamentos_lista_filtros_${clienteAtual?.id ?? 'anon'}`;
  const _sf = (() => {
    if (!clienteAtual?.id) return null;
    try { const r = sessionStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; }
    catch { return null; }
  })();

  const [filtroStatus, setFiltroStatus] = useState(_sf?.status ?? 'ativo');
  const [filtroTipo, setFiltroTipo] = useState(_sf?.tipo ?? 'todos');
  const [filtroNatureza, setFiltroNatureza] = useState(_sf?.natureza ?? 'todas');
  const [filtroDescricao, setFiltroDescricao] = useState(_sf?.descricao ?? '');
  const [filtroContrato, setFiltroContrato] = useState(_sf?.contrato ?? '');
  const [filtroCredor, setFiltroCredor] = useState(_sf?.credor ?? 'todos');
  const [filtroDataContratoDe, setFiltroDataContratoDe] = useState(_sf?.dataContratoDe ?? '');
  const [filtroDataContratoAte, setFiltroDataContratoAte] = useState(_sf?.dataContratoAte ?? '');
  const [filtroVencDe, setFiltroVencDe] = useState('');
  const [filtroVencAte, setFiltroVencAte] = useState('');

  const [sortCol, setSortCol] = useState<string>('data_contrato');
  // Default ASC: contratos mais antigos primeiro ao abrir a tela.
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  // dd/mm/aaaa → yyyy-mm-dd; retorna '' se incompleto/inválido
  const brToISO = (v: string): string => {
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return '';
    const [, d, mo, y] = m;
    const dt = new Date(`${y}-${mo}-${d}`);
    if (isNaN(dt.getTime())) return '';
    return `${y}-${mo}-${d}`;
  };
  // Máscara automática: insere '/' ao digitar (dd/mm/aaaa)
  /* ⚠ O ESTADO DOS FILTROS CONTINUA EM dd/mm/aaaa — e ISSO NAO E' DETALHE. Ele e' o que
     vai para o `sessionStorage` (`STORAGE_KEY`), e ha' filtro salvo na maquina do operador
     agora: trocar o formato guardado faria a proxima abertura ler '20/08/2026' como se
     fosse ISO e devolver lista vazia, calada. O `DatePicker` fala 'yyyy-MM-dd', entao a
     conversao acontece na FRONTEIRA do campo — `brToISO` na entrada, `isoParaBR` na
     saida — e o resto do arquivo (o `brToISO` do filtro, a persistencia) nao muda.
     ⚠ `maskDate` SAIU junto com os quatro `<input>` de texto: era o unico chamador. */
  const isoParaBR = (v: string): string => {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  };

  /* ── Query principal ── */
  /* ⚠ A SITUAÇÃO DAS PARCELAS VEM DO DONO, EM LOTE — PARC-FECHA-02 item 2. A lista lia `financiamento_parcelas.status`, que
     ninguém atualiza quando a parcela é paga pelo Financeiro: "Reboque Agrícola" mostrava saldo devedor 110.000,00 com
     25.666,66 a vencer no contrato. Agora é a MESMA leitura da tela do contrato (`fn_financiamento_situacao`), numa chamada
     por tela. A chave segue `financiamentos-lista` (quem cria, edita ou apaga contrato a invalida pelo prefixo), e o canal
     do Financeiro a relê: pagar uma parcela pelo lançamento muda a lista sem F5. */
  const hoje = hojeLocal();
  useEffect(() => {
    if (!clienteId) return;
    return inscreverEmLancamentos(clienteId, () => {
      void qc.invalidateQueries({ queryKey: ['financiamentos-lista', clienteId] }, { cancelRefetch: false });
    });
  }, [clienteId, qc]);
  const { data: financiamentos = [], isLoading } = useQuery({
    queryKey: ['financiamentos-lista', clienteId, hoje],
    enabled: !!clienteId,
    queryFn: async () => {
      // 1) financiamentos + credor
      const { data: fins, error: e1 } = await supabase
        .from('financiamentos')
        .select('*, financeiro_fornecedores!financiamentos_credor_id_fkey(nome)')
        .eq('cliente_id', clienteId!)
        .order('created_at', { ascending: false });
      if (e1) throw e1;

      // 2) a situação de cada contrato, do dono, numa chamada
      const lote = await lerSituacaoEmLoteDoBanco(clienteId!, hoje);

      // 3) FIN-FINANC-28-P3 — o nome das linhas de crédito do cliente (para o agrupamento) e o número de cada contrato
      //    (para o rolado dizer "→ <sucessor>")
      const { data: linhas, error: e3 } = await supabase
        .from('financiamento_linhas_credito')
        .select('id, programa, descricao')
        .eq('cliente_id', clienteId!);
      if (e3) throw e3;
      const nomeDaLinha = new Map<string, string>();
      for (const l of linhas ?? []) nomeDaLinha.set(l.id, l.programa || l.descricao || 'Linha de crédito');
      // 4) FIN-FINANC-28-P3-FIX — a data da 1ª liberação VIVA de cada contrato (a coluna Data; sem liberação, a do contrato)
      const { data: libs, error: e4 } = await supabase
        .from('financiamento_liberacoes')
        .select('financiamento_id, data')
        .eq('cliente_id', clienteId!)
        .is('cancelado_em', null);
      if (e4) throw e4;
      const primeiraLib = new Map<string, string>();
      for (const l of libs ?? []) {
        const atual = primeiraLib.get(l.financiamento_id);
        if (!atual || l.data < atual) primeiraLib.set(l.financiamento_id, l.data);
      }
      const numeroPorId = new Map<string, string | null>();
      for (const f of fins ?? []) numeroPorId.set(f.id, f.numero_contrato ?? null);

      return (fins ?? []).map((f: any): FinanciamentoRow => {
        const r = resumoDoContratoNaLista(lote.get(f.id));

        return {
          id: f.id,
          descricao: f.descricao,
          numero_contrato: f.numero_contrato ?? null,
          data_contrato: f.data_contrato ?? null,
          /* Os 156 contratos anteriores ao PR-PARC-02 nasceram sem natureza
             explícita; o default do banco é 'financiamento' e o fallback aqui
             cobre a linha que ainda não tiver o valor materializado. */
          natureza: f.natureza ?? 'financiamento',
          tipo_financiamento: f.tipo_financiamento,
          credor_id: f.credor_id,
          valor_total: Number(f.valor_total),
          total_parcelas: f.total_parcelas,
          status: f.status,
          created_at: f.created_at,
          credor_nome: f.financeiro_fornecedores?.nome ?? '—',
          parcelas_pagas: r.parcelasPagas,
          prox_vencimento: r.proxVencimento ?? undefined,
          total_pendente: r.totalPendente,
          juros_pendente: r.jurosPendente,
            valor_parcela: r.valorDaProxParcela,
          pago: r.pago,
          vencido: r.vencido,
          paraLista: contratoDaLista({
            id: f.id,
            numeroContrato: f.numero_contrato ?? null,
            banco: f.financeiro_fornecedores?.nome ?? null,
            descricao: f.descricao,
            status: f.status,
            linhaCreditoId: f.linha_credito_id ?? null,
            linhaCreditoNome: f.linha_credito_id ? (nomeDaLinha.get(f.linha_credito_id) ?? null) : null,
            sucessorNumero: f.contrato_sucessor_id ? (numeroPorId.get(f.contrato_sucessor_id) ?? null) : null,
            saldo: lote.get(f.id)?.saldo,
            proxVencimento: r.proxVencimento,
            dataContrato: f.data_contrato ?? null,
            primeiraLiberacao: primeiraLib.get(f.id) ?? null,
          }),
        };
      });
    },
  });

  /* ── Credores únicos para o select ── */
  const credores = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const f of financiamentos) {
      if (f.credor_nome && f.credor_nome !== '—' && !seen.has(f.credor_nome)) {
        seen.add(f.credor_nome);
        result.push(f.credor_nome);
      }
    }
    return result.sort();
  }, [financiamentos]);

  /* ── Filtros (client-side, sobre dados já carregados) ── */
  /* FIN-FINANC-28-P3 — UM PREDICADO PARA AS DUAS ABAS. A situação vem de fora (cada aba tem a sua) e a natureza fica fora
     daqui: em "Compras parceladas" ela é fixa (o select fica apagado), em "Financiamentos" é aplicada por quem chama. */
  const passaNosFiltros = useMemo(() => {
    const descQ = filtroDescricao.trim().toLowerCase();
    const contQ = filtroContrato.trim().toLowerCase();
    return (f: FinanciamentoRow, situacao: string): boolean => {
      if (situacao === 'encerrados') { if (!ENCERRADOS.includes(f.status)) return false; }
      else if (situacao !== 'todos' && f.status !== situacao) return false;
      if (filtroTipo !== 'todos' && f.tipo_financiamento !== filtroTipo) return false;
      /* ⚠ A BUSCA ALCANÇA O QUE A LINHA MOSTRA, inclusive o que veio de outro
         cadastro — a regra da referência: procurar pelo credor e não achar a
         obrigação dele seria a busca mentindo sobre o próprio alcance. Antes
         ela só olhava a descrição.
         PR-PARC-02: a linha passou a mostrar a NATUREZA, então a natureza entrou
         aqui pela mesma regra — sem ela, procurar "parcelamento" não acharia os
         parcelamentos. O escopo continua alcançável: ele não sumiu da linha,
         mudou de lugar (pílula → sufixo da descrição). */
      if (descQ && ![f.descricao, f.credor_nome, f.numero_contrato ?? '',
                     f.tipo_financiamento === 'pecuaria' ? 'PEC pecuária' : 'AGR agricultura',
                     `${PILULA_NATUREZA[f.natureza]?.sigla ?? ''} ${PILULA_NATUREZA[f.natureza]?.rotulo ?? ''}`]
                     .join(' ').toLowerCase().includes(descQ)) return false;
      if (contQ && !(f.numero_contrato ?? '').toLowerCase().includes(contQ)) return false;
      if (filtroCredor !== 'todos' && f.credor_nome !== filtroCredor) return false;
      const isoContratoDe = brToISO(filtroDataContratoDe);
      const isoContratoAte = brToISO(filtroDataContratoAte);
      const isoVencDe      = brToISO(filtroVencDe);
      const isoVencAte     = brToISO(filtroVencAte);
      if (isoContratoDe && (f.data_contrato ?? '') < isoContratoDe) return false;
      if (isoContratoAte && (f.data_contrato ?? '') > isoContratoAte) return false;
      if (isoVencDe && (f.prox_vencimento ?? '') < isoVencDe) return false;
      if (isoVencAte && (f.prox_vencimento ?? '') > isoVencAte) return false;
      return true;
    };
  }, [filtroTipo, filtroDescricao, filtroContrato, filtroCredor,
      filtroDataContratoDe, filtroDataContratoAte, filtroVencDe, filtroVencAte]);

  /* a lista da aba "Compras parceladas": só os parcelamentos */
  const filtered = useMemo(
    () => financiamentos.filter(f => ehCompraParcelada(f.natureza) && passaNosFiltros(f, filtroStatus)),
    [financiamentos, passaNosFiltros, filtroStatus]);

  const dadosOrdenados = [...filtered].sort((a: any, b: any) => {
    let vA = a[sortCol];
    let vB = b[sortCol];
    if (sortCol === 'data_contrato' || sortCol === 'prox_vencimento') {
      vA = vA ? new Date(vA).getTime() : 0;
      vB = vB ? new Date(vB).getTime() : 0;
    } else if (sortCol === 'valor_total') {
      vA = Number(vA);
      vB = Number(vB);
    } else if (sortCol === 'numero_contrato') {
      vA = vA ?? '';
      vB = vB ?? '';
    } else if (sortCol === 'parcelas') {
      vA = a.total_parcelas > 0 ? a.parcelas_pagas / a.total_parcelas : 0;
      vB = b.total_parcelas > 0 ? b.parcelas_pagas / b.total_parcelas : 0;
    }
    if (typeof vA === 'string' && typeof vB === 'string') {
      return sortDir === 'asc' ? vA.localeCompare(vB, 'pt-BR') : vB.localeCompare(vA, 'pt-BR');
    }
    return sortDir === 'asc' ? (vA ?? 0) - (vB ?? 0) : (vB ?? 0) - (vA ?? 0);
  });

  /* ── Totalizadores (baseado na lista filtrada) ── */
  /* ⚠ PR-PARC-03 item 5 — "Juros a pagar" SAI DA MESMA BASE de "A pagar", não de
     uma segunda contagem: `total_pendente` é principal pendente + juros
     pendentes, e `juros_pendente` é a segunda metade exata dessa soma. Conferido
     no banco proto contra os números do briefing (NJ Pecuária, contratos
     ativos): 11.610.096,80 de principal + 10.620.656,42 de juros =
     22.230.753,22, que é o "A pagar" exibido hoje.
     ⚠ E É POR ISSO QUE SÃO QUATRO, NÃO TRÊS. "Total financiado" é o valor_total
     do contrato — inclui principal JÁ AMORTIZADO — então ele NUNCA fecharia com
     "A pagar", e a conta parecia errada. Com "Principal em aberto" exibido, a
     identidade fica visível na própria linha de números:
         Principal em aberto + Juros a pagar = A pagar
     e "Total financiado" fica ao lado como a referência do contratado. O
     principal em aberto é derivado por SUBTRAÇÃO da mesma base
     (`total_pendente - juros_pendente`), não por uma terceira varredura: assim
     não há como os quatro divergirem entre si. */
  /* FIN-FINANC-28-P3-FIX2 — os cards da compra parcelada, em centavos, no dono puro (`totaisDasCompras`), das MESMAS linhas */
  const totais = useMemo(() => totaisDasCompras(filtered), [filtered]);

  /* FIN-FINANC-28-P3 — a aba "Financiamentos": financiamento e empréstimo, sem os filtros da lista antiga (a lista nova agrupa,
     soma e recolhe os encerrados sozinha). */
  const contratosFinanciamento = useMemo(
    () => financiamentos
      .filter(f => !ehCompraParcelada(f.natureza)
        && (filtroNatureza === 'todas' || f.natureza === filtroNatureza)
        && passaNosFiltros(f, filtroSituacaoFin))
      .map(f => f.paraLista),
    [financiamentos, filtroNatureza, passaNosFiltros, filtroSituacaoFin]);

  /* FIN-FINANC-28-P3-FIX2 — a coluna Banco só aparece quando há linha de crédito (grupo que não é banco): decidido sobre TODOS
     os financiamentos, nunca sobre o recorte do filtro (filtrar não muda coluna). */
  const mostrarBanco = useMemo(
    () => financiamentos.some(f => !ehCompraParcelada(f.natureza) && !!f.paraLista.linhaCreditoId),
    [financiamentos]);

  const hasExtraFilters = !!(filtroDescricao || filtroContrato || filtroCredor !== 'todos' ||
    filtroDataContratoDe || filtroDataContratoAte || filtroVencDe || filtroVencAte);

  const clearExtraFilters = () => {
    setFiltroDescricao('');
    setFiltroContrato('');
    setFiltroCredor('todos');
    setFiltroDataContratoDe('');
    setFiltroDataContratoAte('');
    setFiltroVencDe('');
    setFiltroVencAte('');
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
  };

  if (!clienteId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Selecione um cliente para ver os financiamentos.</p>
      </div>
    );
  }

  /* FIN-FINANC-28-P3 — A MESMA FILEIRA DE FILTROS NAS DUAS ABAS (movida verbatim do card da lista antiga; só a situação e a
     natureza conhecem a aba). Na aba "Financiamentos" ela fica entre os cards e a tabela, como em "Compras parceladas". */
  const filtros = (
        /* FIN-LISTA-COMPACTA-01 — os dois grupos de filtros numa linha so' quando cabem (`flex-wrap`); sem largura,
            o grupo das datas desce, como antes. */
        <div className="relative mb-1.5 shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1.5" data-testid="filtros-financiamentos">
        {/* ═══ FILTROS — PR-PARC-01 item 4 ════════════════════════════════════════
            ⚠ DUAS LINHAS DE 28px, e os rótulos "Contrato de:" / "Venc. de:" saíram: em
            24 caracteres de largura fixa cada, os quatro rótulos gastavam mais espaço
            que os quatro campos. O contexto foi para o placeholder, que só aparece
            quando o campo está vazio — que é justamente quando ele é preciso.
            ⚠ `h-7` EM TUDO: o padrão da casa para linha densa. Antes eram `h-8` (32px)
            em dois blocos com `space-y-2` e `flex-wrap`, e o topo inteiro passava de
            400px numa tela cuja lista é o conteúdo. */}
        <div className="flex items-center gap-1.5">
          <Input
            placeholder="Buscar descrição..."
            value={filtroDescricao}
            onChange={e => setFiltroDescricao(e.target.value)}
            className="h-6 w-44 text-[11px]"
          />
          <Input
            placeholder="Nº contrato..."
            value={filtroContrato}
            onChange={e => setFiltroContrato(e.target.value)}
            className="h-6 w-28 text-[11px]"
          />
          {/* FIN-FINANC-28-P3 — na aba "Financiamentos" a situação tem estado próprio (nasce "Todas": os encerrados ficam na linha
              recolhida) e oferece rolado e "Encerrados"; em "Compras parceladas" é o select de sempre. */}
          {aba === 'financiamentos' ? (
            <Select value={filtroSituacaoFin} onValueChange={setFiltroSituacaoFin}>
              <SelectTrigger className="h-6 w-24 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="encerrados">Encerrados</SelectItem>
                <SelectItem value="quitado">Quitado</SelectItem>
                <SelectItem value="rolado">Rolado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          ) : (
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="h-6 w-24 text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="quitado">Quitado</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
          )}
          {/* ⚠ 3d — ESTE SELECT PASSOU A SER O "ESCOPO". Ele nunca teve rótulo:
              filtra `tipo_financiamento`, e com a natureza ao lado um item
              "Todos" solto não diria mais QUAL eixo. O item ganhou o nome do
              eixo — o mesmo recurso que o select de credor já usa com "Todos
              credores", e não uma segunda régua de rótulo nesta linha. */}
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="h-6 w-24 text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos escopos</SelectItem>
              <SelectItem value="pecuaria">Pecuária</SelectItem>
              <SelectItem value="agricultura">Agricultura</SelectItem>
            </SelectContent>
          </Select>
          {/* FIN-FINANC-28-P3 — a aba já é "Compras parceladas": a natureza fica fixa e apagada (lugar mantido). */}
          <Select value={aba === 'parcelas' ? 'parcelamento' : filtroNatureza} onValueChange={setFiltroNatureza} disabled={aba === 'parcelas'}>
            <SelectTrigger className="h-6 w-28 text-[11px]" title={aba === 'parcelas' ? 'a aba já é Compras parceladas' : undefined}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="financiamento">Financiamento</SelectItem>
              <SelectItem value="parcelamento">Parcelamento</SelectItem>
              <SelectItem value="emprestimo">Empréstimo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroCredor} onValueChange={setFiltroCredor}>
            <SelectTrigger className="h-6 w-40 text-[11px]"><SelectValue placeholder="Credor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos credores</SelectItem>
              {credores.map(cr => <SelectItem key={cr} value={cr}>{cr}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* ⚠ O "Limpar" FICA, e fica na primeira linha: ele existe desde antes deste
              PR e some sozinho quando não há filtro extra. Tirá-lo obrigaria a limpar
              sete campos à mão. */}
          {hasExtraFilters && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={clearExtraFilters}>
              Limpar
            </Button>
          )}
        </div>

        {/* ⚠ AS DATAS PASSARAM AO CALENDARIO DO SISTEMA (A20). A mascara de texto nao
            era controle NATIVO — passava no gate — mas obrigava a digitar dd/mm/aaaa de
            cabeca, sem ver o mes. O `DatePicker` em `size="compact"` (h-6) casa com a
            altura nova dos filtros e nasce vazio com o placeholder "de"/"até".
            ⚠ O ESTADO NAO MUDOU: os quatro filtros continuam guardando 'yyyy-MM-dd' e a
            persistencia em sessionStorage segue lendo as mesmas chaves. */}
        <div className="flex items-center gap-1.5">
          <span className="w-14 shrink-0 text-[10px] text-muted-foreground">Contrato</span>
          <DatePicker
            value={brToISO(filtroDataContratoDe)}
            onChange={iso => setFiltroDataContratoDe(isoParaBR(iso))}
            size="compact"
            placeholder="de"
            className="w-[110px]"
          />
          <DatePicker
            value={brToISO(filtroDataContratoAte)}
            onChange={iso => setFiltroDataContratoAte(isoParaBR(iso))}
            size="compact"
            placeholder="até"
            className="w-[110px]"
          />
          <span className="ml-3 w-16 shrink-0 text-[10px] text-muted-foreground">Vencimento</span>
          <DatePicker
            value={brToISO(filtroVencDe)}
            onChange={iso => setFiltroVencDe(isoParaBR(iso))}
            size="compact"
            placeholder="de"
            className="w-[110px]"
          />
          <DatePicker
            value={brToISO(filtroVencAte)}
            onChange={iso => setFiltroVencAte(isoParaBR(iso))}
            size="compact"
            placeholder="até"
            className="w-[110px]"
          />
        </div>
      </div>
  );

  return (
    /* ⚠ SEM NUMERO MAGICO: a altura vem do PAI. Antes era `calc(100vh - 60px)`, e os
       60px eram o `Header` do shell ANTIGO (`pages/Index.tsx`) — no /v2 esse cabecalho
       nao existe, e por isso a lista terminava dezenas de pixels acima do rodape. Trocar
       por outra constante so' mudaria o erro de lugar: a `V2FilterBar` e' `flex-wrap` e
       muda de altura conforme a largura da janela.
       ⚠ `h-full`, E NAO `flex-1`, PORQUE ESTA TELA TEM DOIS PAIS. No /v2 o pai e' coluna
       flex com altura (`V2Index:1465`, ja com 'financiamentos' no `SECOES_APP_SHELL`) e
       os dois funcionariam; em `pages/Index.tsx:468` o pai tem altura mas NAO e' flex —
       ali `flex-1` seria inerte e a tela perderia a altura, levando a rolagem de volta
       para a pagina. `h-full` mede contra a caixa de conteudo nos dois casos: no v2
       preenche a coluna; no Index preenche o espaco acima do `pb-20` reservado a'
       BottomNav. Um conjunto de classes, dois pais, nenhuma ramificacao. */
    /* FIN-LISTA-COMPACTA-01 — SEM A TRAVA `max-w-5xl`: a pagina usa a largura do conteudo. Era ela que deixava a
       Descricao com ~23% de 1024px e cortava o numero do contrato que vinha dentro dela. */
    <div className="w-full flex flex-col bg-background h-full min-h-0">
      {/* ═══ BARRA SUPERIOR — PR-PARC-01 item 1 ═══════════════════════════════════
          ⚠ SÓ NESTA TELA, e dentro do container que já desconta 60px: ela custa 32px
          do corpo, e o envelope aceitou o preço. `sticky` aqui é redundante com o
          `shrink-0` do flex — mantido porque é a classe da referência, e divergir dela
          num PR de paridade seria criar a segunda régua que este PR veio apagar.
          ⚠ SEM BOTÃO SAIR: o menu lateral já tem, e um segundo caminho para sair é um
          caminho que ninguém testa. */}
      {/* A faixa saiu daqui para `v2/components/BarraSecao` quando a Recorrências passou a
          precisar da mesma — move verbatim, zero mudança visual. */}
      {/* ⚠ A FAIXA SAIU DAQUI — PR-BARRA-UNICA-01a: o `V2Index` monta a `BarraSecao`
          uma vez, para todas as seções. Mantê-la aqui empilharia duas barras azuis. */}

      {/* Cabeçalho fixo: título + totais. Os FILTROS desceram para dentro do card
          (PR-PARC-03 item 2).
          ⚠ SAÍRAM O `border-b` E O `shadow-sm`: com o card logo abaixo, a régua
          de largura total virava uma segunda linha horizontal a 8px da borda do
          card — duas molduras para uma separação só. Quem separa o topo da lista
          agora é a borda do card. */}
      <div className="shrink-0 bg-background px-4 pt-3 pb-2 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {onVoltar && (
              <Button variant="ghost" size="icon" onClick={onVoltar}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            {/* FIN-FINANC-28-P3 (ajuste do Chat, 17/10) — SEM TÍTULO NEM SUBTÍTULO: como em Lançamentos Financeiros, a tela se
                nomeia só pela barra do topo (o caminho, 11px). Ficam as abas. */}
            <Segmentado
              className="shrink-0"
              altura={22}
              valor={aba}
              onEscolher={setAba}
              opcoes={[
                { valor: 'financiamentos', rotulo: 'Financiamentos' },
                { valor: 'parcelas', rotulo: 'Compras parceladas' },
              ]}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* LUGAR RESERVADO: na aba "Compras parceladas" o botão fica invisível, e o "Nova obrigação" não anda. */}
            <Button variant="outline" size="sm"
              className={`h-7 w-[132px] px-2 text-xs ${aba === 'financiamentos' ? '' : 'invisible'}`}
              aria-hidden={aba !== 'financiamentos'} tabIndex={aba === 'financiamentos' ? 0 : -1}
              data-testid="mostrar-encerrados" aria-pressed={encerradosAbertos}
              onClick={() => setEncerradosAbertos(v => !v)}>
              {encerradosAbertos ? 'Ocultar encerrados' : 'Mostrar encerrados'}
            </Button>
            {/* CTA da casa: o mesmo `bg-cta` do resto do sistema, em 28px. */}
            <Button size="sm" className="h-7 gap-1 bg-cta px-2.5 text-xs font-semibold text-cta-foreground hover:bg-cta-hover"
              onClick={() => setNovaObrigacaoAberta(true)}>
              <Plus className="size-3.5" /> Nova obrigação
            </Button>
          </div>
        </div>

        {/* ═══ TOTAIS — PR-PARC-01 item 3 ══════════════════════════════════════════
            ⚠ SAÍRAM DA LINHA DE FILTROS, onde eram dois pares de 10px espremidos
            contra a borda direita: são os dois números que respondem à pergunta do
            subtítulo, e ficavam menores que os rótulos dos filtros.
            ⚠ E VOLTARAM A SER VALOR COMPLETO (A19). O `fmtCompact` local abreviava
            "R$ 17.6M": abreviação esconde a ordem de grandeza exata justamente no
            número que se confere contra o banco. Ele era local a este arquivo — não
            um formatador compartilhado — e saiu junto. */}
        {/* ⚠ OS DOIS DO MEIO SÃO O PONTO — item 5. Sozinhos, "financiado 17,6M" e
            "a pagar 22,2M" liam-se como erro de sistema. Com o principal em aberto e os
            juros entre eles, a conta se fecha à vista de todos: 11,6M + 10,6M = 22,2M, e
            o que se deve a mais que o contratado É o juro. Nenhum operador precisa abrir
            contrato para entender. A ORDEM É A DA CONTA e não muda.
            ⚠ CAIXAS, E MENORES QUE OS PARES SOLTOS (PR-PARC-04b item B): 38px contra os
            ~46px de antes (11px de rótulo + 20px de valor + `py-1`). A cor à esquerda faz
            o trabalho que o tamanho fazia — "A pagar" é a única com fundo, porque é a
            resposta do subtítulo. */}
        {aba === 'parcelas' && (
        /* FIN-FINANC-28-P3-FIX2 — Total das compras · Já pago · A pagar · Vencidas (sem Principal e sem Juros: a compra
           parcelada não tem juros). "A pagar" = Total − Já pago; quando difere da soma das parcelas em aberto o card AVISA
           (ponto âmbar + a conta no `title`), nunca ajusta. "Vencidas" só fica vermelho com valor. */
        <div className="grid grid-cols-4 gap-2" data-testid="cards-compras">
          {[
            { rotulo: 'Total das compras', valor: totais.total, borda: 'border-l-muted-foreground/40', tom: '', titulo: 'soma do valor das compras' },
            { rotulo: 'Já pago', valor: totais.pago, borda: 'border-l-emerald-500', tom: 'text-[#15803d]', titulo: 'parcelas com lançamento pago' },
            { rotulo: 'A pagar', valor: totais.aPagar, borda: 'border-l-primary', tom: '', link: true,
              titulo: totais.diferenca !== 0
                ? `Total − Já pago = ${fmt(totais.aPagar)} · parcelas em aberto = ${fmt(totais.emAberto)} · diferença ${fmt(totais.diferenca)}`
                : 'Total − Já pago (= a soma das parcelas em aberto)' },
            { rotulo: 'Vencidas', valor: totais.vencidas, borda: totais.vencidas > 0 ? 'border-l-destructive' : 'border-l-muted-foreground/40',
              tom: totais.vencidas > 0 ? 'text-[#b91c1c]' : '', titulo: 'parcelas em aberto com vencimento antes de hoje' },
          ].map(c => (
            <div key={c.rotulo} title={c.titulo} data-testid={`card-${c.rotulo}`}
              /* FIN-LISTA-COMPACTA-01 — 40px com `py-1`: 8 + 13 (rotulo) + 18 (valor) = 39, o numero nao encosta. */
              className={`h-[40px] rounded-md border border-l-[3px] px-3 py-1 ${c.borda}`}>
              <div className="flex items-center gap-1 text-[10px] leading-none text-muted-foreground">
                <span className="truncate">{c.rotulo}</span>
                {c.link && totais.diferenca !== 0 && <span className="size-1.5 shrink-0 rounded-full bg-amber-500" data-testid="a-pagar-diverge" aria-hidden />}
              </div>
              {c.link ? (
                /* TODO "FIN-28 cronograma": o clique abre o gráfico do cronograma no próximo passo; hoje não faz nada */
                <button type="button" onClick={() => { /* TODO FIN-28 cronograma */ }}
                  className={`mt-0.5 block text-[14px] font-semibold tabular-nums leading-tight underline decoration-dotted underline-offset-2 ${c.tom}`}>
                  {fmt(c.valor)}
                </button>
              ) : (
                <div className={`mt-0.5 text-[14px] font-semibold tabular-nums leading-tight truncate ${c.tom}`}>{fmt(c.valor)}</div>
              )}
            </div>
          ))}
        </div>
        )}

      </div>

      {/* ═══ O CARD — PR-PARC-03 item 2 ═══════════════════════════════════════════
          Busca e tabela vivem dentro de um card com recuo, como na referência do
          Finanças. Título, subtítulo, botão e os três números ficam FORA.
          ⚠ `min-h-0` NOS DOIS NÍVEIS: sem ele um filho flex recusa-se a encolher
          abaixo do conteúdo, o card cresce além da tela e a rolagem escapa para a
          página — que é exatamente o defeito que este PR veio corrigir. */}
      {/* `pb-1` (4px) e nao `pb-3` (12px): com o container terminando rente ao rodape,
          este recuo E' a distancia final da lista ate' a borda da tela — a regra da Mesa
          pede 5px, e 12 devolviam parte da faixa que o item 1 acabou de recuperar. */}
      <div className="min-h-0 flex-1 px-4 pb-1">
        {aba === 'financiamentos' ? (
          isLoading
            ? <p className="text-sm text-muted-foreground p-4">Carregando…</p>
            : <ListaDeFinanciamentos contratos={contratosFinanciamento} encerradosAbertos={encerradosAbertos}
                aoAlternarEncerrados={() => setEncerradosAbertos(v => !v)} aoAbrir={abrirContrato} filtros={filtros}
                mostrarBanco={mostrarBanco} />
        ) : (
        <div className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-card px-3 pt-2 pb-0 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
        {filtros}

      {/* ═══ ROLAGEM — PR-PARC-03 item 3 ══════════════════════════════════════════
          ⚠ AQUI ESTAVA O DEFEITO DO CABEÇALHO QUE SUMIA, e não era falta de
          `sticky`: o `sticky` já existia. O primitivo embrulha a `<table>` num
          div `overflow-auto` PRÓPRIO, e `overflow-auto` cria scrollport. O thead
          ancora no scrollport MAIS PRÓXIMO — esse div — que não tinha altura
          declarada, crescia com o conteúdo e nunca rolava; quem rolava era o
          container de fora. O cabeçalho grudava num elemento que subia junto.
          A correção é pôr a rolagem NO NÍVEL CERTO, e agora ela é declarada onde
          mora: `wrapperClassName` leva altura e overflow para o div do primitivo,
          que vira o scrollport de verdade e ancora o thead.
          ⚠ UM SCROLLPORT SÓ: este container NÃO rola — ele só limita a altura
          (`min-h-0`). Quem rola é o wrapper da tabela, uma camada abaixo.
          ⚠ `overflow-x-hidden` porque `table-fixed` + colgroup somando 100% não
          pode estourar na horizontal: se estourar é bug de largura para reportar,
          não barra para rolar. */}
      <div className="min-h-0 flex-1">
        {isLoading ? (
          <p className="text-sm text-muted-foreground p-4">Carregando…</p>
        ) : dadosOrdenados.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">Nenhum financiamento encontrado.</p>
        ) : (
            /* ⚠ MEDIDAS LIDAS DO CÓDIGO DA REFERÊNCIA (`ObrigacoesTabela` do
               financas), não estimadas de print — FIN-OBRIGACOES-PARIDADE-01:
               `table-fixed` + colgroup em PORCENTAGEM somando 100% (nunca gera
               rolagem horizontal, e o truncate sai com reticências em vez de
               quebrar a linha) e NENHUM override de fonte na tela — a densidade
               vem do primitivo. Lá o comentário é explícito: régua própria em
               arquivo de tela é como a consistência se perde.
               ⚠ PR-PARC-03: a densidade agora é pedida — `density="dense"`, a
               régua 9/10/21 da referência. Continua sendo o primitivo quem a
               define; esta tela só ADERE. O fundo do cabeçalho deixou de ser
               `bg-muted/95 backdrop-blur` e virou `bg-card` opaco, porque dentro
               do card translúcido deixa a linha passar por baixo do número.
               ⚠ AS LARGURAS DIVERGIRAM DA REFERÊNCIA e o porquê está no colgroup
               abaixo, coluna a coluna — esta tela tem duas colunas de texto que a
               referência não tem (descrição com nº de contrato + escopo, e credor). */
            <Table
              density="dense"
              /* o primitivo põe `font-medium` (500) em toda célula; em Lançamentos o texto é 400 e só o valor é 600 */
              className={`${TABELA_LANC} table-fixed [&_td:not(.celula-valor)]:font-normal`}
              /* FIN-LISTA-COMPACTA-01 — piso de largura, abaixo do qual a TABELA rola dentro do card (a pagina nunca).
                 FIN-FINANC-28-P3-FIX2: as fixas (568) + 66 para Descricao e Credor cada = 700, bem abaixo dos 892 uteis a 1.126. */
              style={{ minWidth: 700 }}
              wrapperClassName="h-full overflow-x-auto overflow-y-auto"
            >
              {/* FIN-FINANC-28-P3-FIX2 (Gabriel, 17/10) — a ordem da casa, data primeiro: Data · Descrição · Credor · Valor da compra ·
                  A pagar · Parcela · Próxima · Situação · Pagas. Saíram a pílula de Tipo (a aba só tem parcelamentos) e o Nº contrato
                  (só nesta aba; a de Financiamentos mantém). Descrição e Credor ficam SEM largura e dividem o que sobra (cortam com o
                  inteiro no `title`); as fixas, medidas no Chromium com a régua de Lançamentos, somam 568. */}
              <colgroup>
                <col style={{ width: 62 }} data-testid="col-data" />
                <col />
                <col />
                <col style={{ width: 110 }} />
                <col style={{ width: 98 }} />
                <col style={{ width: 98 }} />
                <col style={{ width: 68 }} />
                <col style={{ width: 72 }} />
                <col style={{ width: 60 }} />
              </colgroup>
              <TableHeader className="sticky top-0 z-10 bg-primary text-primary-foreground [&_tr]:border-b-0 [&_tr]:hover:bg-primary">
                <TableRow>
                  <CabecalhoOrdenavel rotulo="Data" ativo={sortCol === 'data_contrato'}
                    direcao={sortDir} aoOrdenar={() => handleSort('data_contrato')} />
                  <CabecalhoOrdenavel rotulo="Descrição" ativo={sortCol === 'descricao'}
                    direcao={sortDir} aoOrdenar={() => handleSort('descricao')} />
                  <CabecalhoOrdenavel rotulo="Credor" ativo={sortCol === 'credor_nome'}
                    direcao={sortDir} aoOrdenar={() => handleSort('credor_nome')} />
                  <CabecalhoOrdenavel rotulo="Valor da compra" ativo={sortCol === 'valor_total'}
                    direcao={sortDir} aoOrdenar={() => handleSort('valor_total')} direita />
                  <CabecalhoOrdenavel rotulo="A pagar" ativo={sortCol === 'total_pendente'}
                    direcao={sortDir} aoOrdenar={() => handleSort('total_pendente')} direita />
                  <CabecalhoOrdenavel rotulo="Parcela" ativo={sortCol === 'valor_parcela'}
                    direcao={sortDir} aoOrdenar={() => handleSort('valor_parcela')} direita />
                  <CabecalhoOrdenavel rotulo="Próxima" ativo={sortCol === 'prox_vencimento'}
                    direcao={sortDir} aoOrdenar={() => handleSort('prox_vencimento')} />
                  <CabecalhoOrdenavel rotulo="Situação" ativo={sortCol === 'status'}
                    direcao={sortDir} aoOrdenar={() => handleSort('status')} />
                  <CabecalhoOrdenavel rotulo="Pagas" ativo={sortCol === 'parcelas'}
                    direcao={sortDir} aoOrdenar={() => handleSort('parcelas')} direita />
                </TableRow>
              </TableHeader>
            <TableBody>
                {dadosOrdenados.map(f => {
                  const encerrado = f.status !== 'ativo';
                  /* a LINHA INTEIRA abre o contrato (o olho saiu com a coluna própria: a linha clicável é a regra da casa) */
                  return (
                  <TableRow
                    key={f.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => abrirContrato(f.id)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); abrirContrato(f.id); } }}
                    className={`${LINHA_LANC} cursor-pointer hover:bg-muted/40 ${encerrado ? 'opacity-50' : ''}`}
                  >
                    <TableCell className={TD_DATA_LANC} data-testid="cel-data">
                      {f.data_contrato ? format(new Date(f.data_contrato + 'T12:00:00'), 'dd/MM/yy') : '—'}
                    </TableCell>
                    <TableCell className="truncate" data-testid="cel-descricao"
                      title={[f.descricao, escopoSigla(f.tipo_financiamento), f.numero_contrato ? `nº ${f.numero_contrato}` : null].filter(Boolean).join(' · ')}>
                      <span className="font-medium leading-tight">{f.descricao}</span>
                      <span className="ml-1 text-muted-foreground">· {escopoSigla(f.tipo_financiamento)}</span>
                    </TableCell>
                    <TableCell className="truncate" title={f.credor_nome}>{f.credor_nome}</TableCell>
                    <TableCell className={MOEDA}>{fmt(f.valor_total)}</TableCell>
                    <TableCell className={MOEDA}>{fmt(f.total_pendente)}</TableCell>
                    <TableCell className={MOEDA}>
                      {f.valor_parcela != null ? fmt(f.valor_parcela) : '—'}
                    </TableCell>
                    <TableCell className={TD_DATA_LANC}>
                      {f.prox_vencimento
                        ? format(new Date(f.prox_vencimento + 'T12:00:00'), 'dd/MM/yy')
                        : '—'}
                    </TableCell>
                    <TableCell className="celula-status whitespace-nowrap" data-testid="cel-status">
                      <SeloDoContrato status={f.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums" data-testid="cel-pagas">
                      {f.parcelas_pagas}/{f.total_parcelas}
                    </TableCell>
                  </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        )}
        </div>
        </div>
        )}
      </div>

      {/* ⚠ INVALIDA AS DUAS FAMILIAS. `financiamentos-lista` e' a desta tela — sem ela a
          obrigacao recem-criada so' apareceria recarregando a pagina. As duas do painel
          (`painel-financiamentos` / `painel-parcelas`) sao de OUTRA tela, que le' os
          mesmos contratos: deixa-las velhas faria o painel divergir da lista ate' o
          proximo refetch. */}
      {/* ⚠ MONTAGEM CONDICIONAL, e nao `open={...}` num modal sempre montado. O estado do
          formulario mora no `useFinanciamentoCadastro`, DENTRO do dialogo: mantido montado,
          ele guardaria o contrato anterior e o proximo "+ Nova obrigacao" abriria com os
          dados do ultimo — a pagina que ele substitui remontava a cada entrada e nascia
          limpa. De quebra, as 6 queries do hook (fazenda, fornecedores, contas e os tres
          planos) so' saem quando o modal abre, e nao a cada render desta lista. */}
      {novaObrigacaoAberta && (
      <ObrigacaoDialog
        open
        onOpenChange={setNovaObrigacaoAberta}
        onSalvo={() => {
          setNovaObrigacaoAberta(false);
          qc.invalidateQueries({ queryKey: ['financiamentos-lista', clienteId] });
          qc.invalidateQueries({ queryKey: ['painel-financiamentos', clienteId] });
          qc.invalidateQueries({ queryKey: ['painel-parcelas', clienteId] });
        }}
      />
      )}
    </div>
  );
}

/**
 * Um cabeçalho ordenável, na forma da referência (`CabecalhoOrdenavel` do
 * financas).
 *
 * ⚠ A SETA É SEMPRE VISÍVEL, apagada quando a coluna não é a ativa — e o motivo
 * está escrito lá: mostrá-la só no hover esconde do operador QUAIS colunas
 * ordenam, que é justamente o que ele precisa saber antes de tentar. A lista
 * daqui usava "↑↓" em texto, que só aparecia na coluna ativa.
 */
function CabecalhoOrdenavel({ rotulo, ativo, direcao, aoOrdenar, direita }: {
  rotulo: string; ativo: boolean; direcao: 'asc' | 'desc';
  aoOrdenar: () => void; direita?: boolean;
}) {
  const Seta = !ativo ? ChevronsUpDown : direcao === 'asc' ? ChevronUp : ChevronDown;
  return (
    <TableHead
      /* ⚠ `text-foreground` É OVERRIDE LOCAL DESTA TELA — item 3. O primitivo dá
         `text-muted-foreground` e a referência do Finanças mantém o muted; aqui o
         Gabriel pediu cabeçalho ESCURO. Fica no arquivo da tela, de propósito:
         mudar o primitivo escureceria o cabeçalho de 39 telas.
         O `hover:text-foreground` saiu por ter virado letra morta — a cor de
         repouso já é essa.
         ⚠ `normal-case tracking-normal` PELO MESMO MOTIVO (PR-PARC-04b item D): o
         primitivo dense entrega `uppercase tracking-wide`, e "SALDO DEVEDOR" em
         versalete de 9px com espaçamento gasta mais largura do que "Saldo devedor"
         e lê-se pior. O override é DESTA TELA — mudar o dense trocaria o cabeçalho
         de todas as tabelas densas do sistema, e isso é decisão sua, não deste PR.
         O 9px/600 do primitivo continua valendo. */
      className={`cursor-pointer select-none whitespace-nowrap ${TH_LANC} px-2 ${direita ? 'text-right' : ''}`}
      onClick={aoOrdenar}
      aria-sort={ativo ? (direcao === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className={`inline-flex items-center gap-0.5 ${direita ? 'flex-row-reverse' : ''}`}>
        {rotulo}
        <Seta className={`h-2.5 w-2.5 shrink-0 ${ativo ? '' : 'text-primary-foreground/70'}`} aria-hidden />
      </span>
    </TableHead>
  );
}
