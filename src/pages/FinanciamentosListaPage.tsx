import { ArrowLeft, Plus, Eye, ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCliente } from '@/contexts/ClienteContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { format } from 'date-fns';

/* ── Types ── */
/* ⚠ CLASSES LIDAS DO CÓDIGO DA REFERÊNCIA, não estimadas: `NUM` e `APOIO` são
   os mesmos de `ObrigacoesTabela`. O `whitespace-nowrap` do NUM tem motivo
   registrado lá — sem ele "−R$ 2.155,00" quebra em duas linhas e a altura da
   linha deixa de ser previsível. */
const NUM = 'text-right font-mono tabular-nums whitespace-nowrap';

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

const statusColor: Record<string, string> = {
  ativo: 'bg-emerald-100 text-emerald-800',
  quitado: 'bg-muted text-muted-foreground',
  cancelado: 'bg-red-100 text-red-800',
};

interface FinanciamentosListaProps {
  onNovo?: () => void;
  onDetalhe?: (id: string) => void;
  onVoltar?: () => void;
}

export default function FinanciamentosListaPage({ onNovo, onDetalhe, onVoltar }: FinanciamentosListaProps = {}) {
  const { clienteAtual } = useCliente();
  const { user } = useAuth();
  const clienteId = clienteAtual?.id;

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
  const maskDate = (v: string): string => {
    const d = v.replace(/\D/g, '').slice(0, 8);
    if (d.length <= 2) return d;
    if (d.length <= 4) return `${d.slice(0,2)}/${d.slice(2)}`;
    return `${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4)}`;
  };

  /* ── Query principal ── */
  const { data: financiamentos = [], isLoading } = useQuery({
    queryKey: ['financiamentos-lista', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      // 1) financiamentos + credor
      const { data: fins, error: e1 } = await supabase
        .from('financiamentos')
        .select('*, financeiro_fornecedores!financiamentos_credor_id_fkey(nome)')
        .eq('cliente_id', clienteId!)
        .order('created_at', { ascending: false });
      if (e1) throw e1;

      // 2) parcelas
      const { data: parcelas, error: e2 } = await supabase
        .from('financiamento_parcelas')
        .select('financiamento_id, status, data_vencimento, valor_principal, valor_juros')
        .eq('cliente_id', clienteId!);
      if (e2) throw e2;

      // Agrupar parcelas por financiamento
      const parcelaMap = new Map<string, typeof parcelas>();
      for (const p of parcelas ?? []) {
        const arr = parcelaMap.get(p.financiamento_id) ?? [];
        arr.push(p);
        parcelaMap.set(p.financiamento_id, arr);
      }

      return (fins ?? []).map((f: any): FinanciamentoRow => {
        const ps = parcelaMap.get(f.id) ?? [];
        const pagas = ps.filter(p => p.status === 'pago').length;
        const pendentes = ps.filter(p => p.status === 'pendente');
        const proxVenc = pendentes
          .map(p => p.data_vencimento)
          .sort()
          .at(0);
        const totalPendente = pendentes.reduce(
          (s, p) => s + Number(p.valor_principal) + Number(p.valor_juros), 0
        );
          /* A parcela da PRÓXIMA data — a mesma linha que `prox_vencimento`
             aponta. Principal + juros é o que o operador paga. */
          const proxParcela = pendentes.find(p => p.data_vencimento === proxVenc);
          const valorParcela = proxParcela
            ? Number(proxParcela.valor_principal) + Number(proxParcela.valor_juros)
            : null;

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
          parcelas_pagas: pagas,
          prox_vencimento: proxVenc ?? undefined,
          total_pendente: totalPendente,
            valor_parcela: valorParcela,
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
  const filtered = useMemo(() => {
    const descQ = filtroDescricao.trim().toLowerCase();
    const contQ = filtroContrato.trim().toLowerCase();
    return financiamentos.filter(f => {
      if (filtroStatus !== 'todos' && f.status !== filtroStatus) return false;
      if (filtroTipo !== 'todos' && f.tipo_financiamento !== filtroTipo) return false;
      if (filtroNatureza !== 'todas' && f.natureza !== filtroNatureza) return false;
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
    });
  }, [financiamentos, filtroStatus, filtroTipo, filtroNatureza, filtroDescricao, filtroContrato, filtroCredor,
      filtroDataContratoDe, filtroDataContratoAte, filtroVencDe, filtroVencAte]);

  const dadosOrdenados = [...filtered].sort((a: any, b: any) => {
    let vA = a[sortCol];
    let vB = b[sortCol];
    if (sortCol === 'data_contrato' || sortCol === 'prox_vencimento') {
      vA = vA ? new Date(vA).getTime() : 0;
      vB = vB ? new Date(vB).getTime() : 0;
    } else if (sortCol === 'valor_total') {
      vA = Number(vA);
      vB = Number(vB);
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
  const totais = useMemo(() => ({
    financiado: filtered.reduce((s, f) => s + f.valor_total, 0),
    aPagar: filtered.reduce((s, f) => s + f.total_pendente, 0),
  }), [filtered]);

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

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col bg-background" style={{ height: 'calc(100vh - 60px)' }}>
      {/* ═══ BARRA SUPERIOR — PR-PARC-01 item 1 ═══════════════════════════════════
          ⚠ SÓ NESTA TELA, e dentro do container que já desconta 60px: ela custa 32px
          do corpo, e o envelope aceitou o preço. `sticky` aqui é redundante com o
          `shrink-0` do flex — mantido porque é a classe da referência, e divergir dela
          num PR de paridade seria criar a segunda régua que este PR veio apagar.
          ⚠ SEM BOTÃO SAIR: o menu lateral já tem, e um segundo caminho para sair é um
          caminho que ninguém testa. */}
      <header className="sticky top-0 z-40 shrink-0 bg-primary shadow-md">
        <div className="flex items-center justify-between gap-2 px-3 py-1">
          <p className="min-w-0 truncate text-[11px] font-semibold tracking-wide text-primary-foreground">
            Financeiro<span className="mx-1 text-primary-foreground/40">/</span>
            <span className="font-normal text-primary-foreground/90">Parcelamentos e Financiamentos</span>
          </p>
          {/* ⚠ O EMAIL VEM DO `useAuth` QUE JÁ EXISTE (`contexts/AuthContext`), não de
              um hook novo: o Header e outras telas já leem `user?.email` dali. */}
          <span className="max-w-[220px] truncate text-[10px] text-primary-foreground/65">
            {user?.email ?? ''}
          </span>
        </div>
      </header>

      {/* Cabeçalho fixo: título + totais + filtros */}
      <div className="shrink-0 bg-background border-b shadow-sm px-4 pt-3 pb-2 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {onVoltar && (
              <Button variant="ghost" size="icon" onClick={onVoltar}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            {/* ⚠ SUBTÍTULO DA REFERÊNCIA, verbatim: "O que você contratou — e quanto
                ainda deve". Ele nomeia a pergunta que a tela responde, e a segunda
                metade é exatamente a coluna que faltava. */}
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight leading-none text-foreground">
                Parcelamentos e Financiamentos
              </h1>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                O que você contratou — e quanto ainda deve
              </p>
            </div>
          </div>
          {/* CTA da casa: o mesmo `bg-cta` do resto do sistema, em 28px. */}
          <Button size="sm" className="h-7 gap-1 bg-cta px-2.5 text-xs font-semibold text-cta-foreground hover:bg-cta-hover"
            onClick={onNovo}>
            <Plus className="size-3.5" /> Novo
          </Button>
        </div>

        {/* ═══ TOTAIS — PR-PARC-01 item 3 ══════════════════════════════════════════
            ⚠ SAÍRAM DA LINHA DE FILTROS, onde eram dois pares de 10px espremidos
            contra a borda direita: são os dois números que respondem à pergunta do
            subtítulo, e ficavam menores que os rótulos dos filtros.
            ⚠ E VOLTARAM A SER VALOR COMPLETO (A19). O `fmtCompact` local abreviava
            "R$ 17.6M": abreviação esconde a ordem de grandeza exata justamente no
            número que se confere contra o banco. Ele era local a este arquivo — não
            um formatador compartilhado — e saiu junto. */}
        <div className="flex items-baseline gap-6 px-0 py-1">
          <div>
            <div className="text-[11px] text-muted-foreground">Total financiado</div>
            <div className="text-[20px] font-medium tabular-nums leading-tight">{fmt(totais.financiado)}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">A pagar</div>
            <div className="text-[20px] font-medium tabular-nums leading-tight">{fmt(totais.aPagar)}</div>
          </div>
        </div>

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
            className="h-7 w-44 text-[11px]"
          />
          <Input
            placeholder="Nº contrato..."
            value={filtroContrato}
            onChange={e => setFiltroContrato(e.target.value)}
            className="h-7 w-28 text-[11px]"
          />
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="h-7 w-24 text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="quitado">Quitado</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
          {/* ⚠ 3d — ESTE SELECT PASSOU A SER O "ESCOPO". Ele nunca teve rótulo:
              filtra `tipo_financiamento`, e com a natureza ao lado um item
              "Todos" solto não diria mais QUAL eixo. O item ganhou o nome do
              eixo — o mesmo recurso que o select de credor já usa com "Todos
              credores", e não uma segunda régua de rótulo nesta linha. */}
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="h-7 w-24 text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos escopos</SelectItem>
              <SelectItem value="pecuaria">Pecuária</SelectItem>
              <SelectItem value="agricultura">Agricultura</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroNatureza} onValueChange={setFiltroNatureza}>
            <SelectTrigger className="h-7 w-28 text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="financiamento">Financiamento</SelectItem>
              <SelectItem value="parcelamento">Parcelamento</SelectItem>
              <SelectItem value="emprestimo">Empréstimo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroCredor} onValueChange={setFiltroCredor}>
            <SelectTrigger className="h-7 w-40 text-[11px]"><SelectValue placeholder="Credor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos credores</SelectItem>
              {credores.map(cr => <SelectItem key={cr} value={cr}>{cr}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* ⚠ O "Limpar" FICA, e fica na primeira linha: ele existe desde antes deste
              PR e some sozinho quando não há filtro extra. Tirá-lo obrigaria a limpar
              sete campos à mão. */}
          {hasExtraFilters && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={clearExtraFilters}>
              Limpar
            </Button>
          )}
        </div>

        {/* ⚠ AS DATAS CONTINUAM `input` DE TEXTO com `maxLength={10}` e `font-mono` — a
            máscara (`maskDate`) já existe neste arquivo e não é `type="date"`, que o
            gate de controle nativo proíbe. O que muda aqui é só a altura e o rótulo. */}
        <div className="flex items-center gap-1.5">
          <span className="w-14 shrink-0 text-[10px] text-muted-foreground">Contrato</span>
          <input
            type="text"
            value={filtroDataContratoDe}
            onChange={e => setFiltroDataContratoDe(maskDate(e.target.value))}
            placeholder="de dd/mm/aaaa"
            maxLength={10}
            className="h-7 w-[92px] rounded-md border bg-background px-2 font-mono text-[11px]"
          />
          <input
            type="text"
            value={filtroDataContratoAte}
            onChange={e => setFiltroDataContratoAte(maskDate(e.target.value))}
            placeholder="até dd/mm/aaaa"
            maxLength={10}
            className="h-7 w-[92px] rounded-md border bg-background px-2 font-mono text-[11px]"
          />
          <span className="ml-3 w-16 shrink-0 text-[10px] text-muted-foreground">Vencimento</span>
          <input
            type="text"
            value={filtroVencDe}
            onChange={e => setFiltroVencDe(maskDate(e.target.value))}
            placeholder="de dd/mm/aaaa"
            maxLength={10}
            className="h-7 w-[92px] rounded-md border bg-background px-2 font-mono text-[11px]"
          />
          <input
            type="text"
            value={filtroVencAte}
            onChange={e => setFiltroVencAte(maskDate(e.target.value))}
            placeholder="até dd/mm/aaaa"
            maxLength={10}
            className="h-7 w-[92px] rounded-md border bg-background px-2 font-mono text-[11px]"
          />
        </div>
      </div>

      {/* Área de rolagem com tabela — thead sticky DENTRO deste container */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <p className="text-sm text-muted-foreground p-4">Carregando…</p>
        ) : dadosOrdenados.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">Nenhum financiamento encontrado.</p>
        ) : (
            /* ⚠ MEDIDAS LIDAS DO CÓDIGO DA REFERÊNCIA (`ObrigacoesTabela` do
               financas), não estimadas de print — FIN-OBRIGACOES-PARIDADE-01:
               `table-fixed` + colgroup em PORCENTAGEM somando 100% (nunca gera
               rolagem horizontal, e o truncate sai com reticências em vez de
               quebrar a linha), cabeçalho `sticky` com `bg-muted/95 backdrop-blur`,
               e NENHUM override de fonte — a densidade é o default do primitivo
               `ui/table`. Lá o comentário é explícito: régua própria em arquivo
               de tela é como a consistência se perde.
               ⚠ A COLUNA DE STATUS TEM 13%, e o motivo está registrado lá: o
               badge mais a fração "2/12" não cabiam em 8% e a fração saía
               cortada. Copiei a largura com o motivo. */
            <Table className="table-fixed">
              <colgroup>
                <col className="w-[6%]" />
                {/* ⚠ DESCRIÇÃO 19% -> 22%, CREDOR 14% -> 11% (PR-PARC-02). A troca
                    é de três pontos entre duas colunas vizinhas, e a soma segue
                    em 100% — a regra do `table-fixed` herdada da referência.
                    O motivo é MEDIDO, não estético: 64 dos 156 contratos (41%) já
                    passavam de 30 caracteres em descrição + nº do contrato, e o
                    sufixo de escopo entrou no fim dessa mesma célula. O credor
                    cede porque é o texto mais curto e já tem `title`. */}
                <col className="w-[22%]" />
                <col className="w-[11%]" />
                <col className="w-[12%]" />
                <col className="w-[13%]" />
                <col className="w-[11%]" />
                <col className="w-[8%]" />
                <col className="w-[13%]" />
                <col className="w-[4%]" />
              </colgroup>
              <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                <TableRow className="border-b">
                  {/* ⚠ 3e — ORDENA POR `natureza`, e a chave antiga era LETRA MORTA:
                      `sortCol` era 'tipo', campo que nunca existiu na linha (a
                      coluna é `tipo_financiamento`), então `a['tipo']` e
                      `b['tipo']` eram ambos `undefined` e clicar no cabeçalho não
                      reordenava nada. Agora a chave é a do dado exibido. */}
                  <CabecalhoOrdenavel rotulo="Tipo" ativo={sortCol === 'natureza'}
                    direcao={sortDir} aoOrdenar={() => handleSort('natureza')} />
                  <CabecalhoOrdenavel rotulo="Descrição" ativo={sortCol === 'descricao'}
                    direcao={sortDir} aoOrdenar={() => handleSort('descricao')} />
                  <CabecalhoOrdenavel rotulo="Credor" ativo={sortCol === 'credor_nome'}
                    direcao={sortDir} aoOrdenar={() => handleSort('credor_nome')} />
                  <CabecalhoOrdenavel rotulo="Principal" ativo={sortCol === 'valor_total'}
                    direcao={sortDir} aoOrdenar={() => handleSort('valor_total')} direita />
                  <CabecalhoOrdenavel rotulo="Saldo devedor" ativo={sortCol === 'total_pendente'}
                    direcao={sortDir} aoOrdenar={() => handleSort('total_pendente')} direita />
                  <CabecalhoOrdenavel rotulo="Parcela" ativo={sortCol === 'valor_parcela'}
                    direcao={sortDir} aoOrdenar={() => handleSort('valor_parcela')} direita />
                  <CabecalhoOrdenavel rotulo="Próxima" ativo={sortCol === 'prox_vencimento'}
                    direcao={sortDir} aoOrdenar={() => handleSort('prox_vencimento')} />
                  <CabecalhoOrdenavel rotulo="Status" ativo={sortCol === 'status'}
                    direcao={sortDir} aoOrdenar={() => handleSort('status')} />
                  <TableHead />
                </TableRow>
              </TableHeader>
            <TableBody>
                {dadosOrdenados.map(f => {
                  const encerrado = f.status !== 'ativo';
                  return (
                  <TableRow key={f.id} className={encerrado ? 'opacity-50' : ''}>
                    {/* ⚠ PÍLULA DE NATUREZA — PR-PARC-02 item 3b. A forma é a da
                        referência (`border`, 9px bold, `rounded`); o eixo deixou
                        de ser pecuária x agricultura e passou a ser o que o
                        contrato É. As cores FIN/PARC são as medidas no Finanças;
                        EMP não existe lá e o âmbar é proposta deste PR. */}
                    <TableCell>
                      <span className={`inline-flex items-center rounded border px-1 py-0 text-[9px] font-bold leading-tight ${PILULA_NATUREZA[f.natureza]?.classe ?? PILULA_NATUREZA.financiamento.classe}`}>
                        {PILULA_NATUREZA[f.natureza]?.sigla ?? PILULA_NATUREZA.financiamento.sigla}
                      </span>
                    </TableCell>
                    {/* A descrição é o caminho para o detalhe, como na referência.
                        ⚠ 3c — O ESCOPO NÃO SOME COM A PÍLULA: ele vem aqui, como
                        sufixo de 10px. O `title` carrega a linha inteira porque
                        a coluna trunca mesmo depois do alargamento (22% ≈ 225px)
                        e o sufixo é o primeiro pedaço a ser cortado — sem isso, o
                        escopo ficaria ilegível nas descrições mais longas. */}
                    <TableCell className="truncate"
                      title={`${f.descricao}${f.numero_contrato ? ` ${f.numero_contrato}` : ''} · ${escopoSigla(f.tipo_financiamento)}`}>
                      <span className="font-semibold">{f.descricao}</span>
                      {f.numero_contrato && (
                        <span className="ml-1 text-[10px] text-muted-foreground">{f.numero_contrato}</span>
                      )}
                      <span className="ml-1 text-[10px] text-muted-foreground">· {escopoSigla(f.tipo_financiamento)}</span>
                    </TableCell>
                    <TableCell className="truncate" title={f.credor_nome}>{f.credor_nome}</TableCell>
                    <TableCell className={NUM}>{fmt(f.valor_total)}</TableCell>
                    {/* ⚠ O NÚMERO QUE JUSTIFICA A TELA — e ele já existia: o
                        `total_pendente` era calculado no fetch e nunca exibido.
                        Foi por não estar na lista que os financiamentos do NJ
                        custaram uma semana de arqueologia. */}
                    <TableCell className={`${NUM} font-semibold`}>{fmt(f.total_pendente)}</TableCell>
                    <TableCell className={NUM}>
                      {f.valor_parcela != null ? fmt(f.valor_parcela) : '—'}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {f.prox_vencimento
                        ? format(new Date(f.prox_vencimento + 'T12:00:00'), 'dd/MM/yy')
                        : '—'}
                    </TableCell>
                    <TableCell className="truncate">
                      <span className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-normal leading-tight ${statusColor[f.status] ?? ''}`}>
                        {f.status}
                      </span>
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        {f.parcelas_pagas}/{f.total_parcelas}
                      </span>
                    </TableCell>
                    <TableCell className="px-0 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => {
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
                      onDetalhe?.(f.id);
                    }}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        )}
      </div>
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
      className={`cursor-pointer select-none hover:text-foreground ${direita ? 'text-right' : ''}`}
      onClick={aoOrdenar}
      aria-sort={ativo ? (direcao === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className={`inline-flex items-center gap-0.5 ${direita ? 'flex-row-reverse' : ''}`}>
        {rotulo}
        <Seta className={`h-2.5 w-2.5 shrink-0 ${ativo ? '' : 'opacity-30'}`} aria-hidden />
      </span>
    </TableHead>
  );
}
