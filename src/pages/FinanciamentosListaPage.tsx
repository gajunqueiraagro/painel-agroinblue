import { ArrowLeft, Plus, Eye, ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { useCliente } from '@/contexts/ClienteContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { ObrigacaoDialog } from '@/components/financiamentos/ObrigacaoDialog';

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
const MOEDA = 'text-right font-mono tabular-nums whitespace-nowrap text-[9px]';

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
  const qc = useQueryClient();

  /* PR-PARC-04 item 7 — "+ Nova obrigacao" abre um MODAL POR CIMA desta lista, e nao
     mais a pagina de cadastro: a lista continua montada atras, entao ao fechar nao ha'
     remontagem nem perda dos filtros.
     ⚠ A PROP `onNovo` CONTINUA DECLARADA e deixou de ser chamada. O `Index.tsx` ainda a
     passa (e o ramo `finView.mode === 'novo'` continua la', agora inalcancavel); remove-la
     seria mexer em arquivo fora do escopo deste PR. */
  const [novaObrigacaoAberta, setNovaObrigacaoAberta] = useState(false);

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
        /* A mesma varredura, a mesma lista de pendentes: os dois números não
           podem divergir porque saem do mesmo `pendentes`. */
        const jurosPendente = pendentes.reduce((s, p) => s + Number(p.valor_juros), 0);
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
          juros_pendente: jurosPendente,
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
  const totais = useMemo(() => ({
    financiado: filtered.reduce((s, f) => s + f.valor_total, 0),
    principalAberto: filtered.reduce((s, f) => s + (f.total_pendente - f.juros_pendente), 0),
    juros: filtered.reduce((s, f) => s + f.juros_pendente, 0),
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
    <div className="w-full max-w-5xl mx-auto flex flex-col bg-background h-full min-h-0">
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

      {/* Cabeçalho fixo: título + totais. Os FILTROS desceram para dentro do card
          (PR-PARC-03 item 2).
          ⚠ SAÍRAM O `border-b` E O `shadow-sm`: com o card logo abaixo, a régua
          de largura total virava uma segunda linha horizontal a 8px da borda do
          card — duas molduras para uma separação só. Quem separa o topo da lista
          agora é a borda do card. */}
      <div className="shrink-0 bg-background px-4 pt-3 pb-2 space-y-2">
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
            onClick={() => setNovaObrigacaoAberta(true)}>
            <Plus className="size-3.5" /> Nova obrigação
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
        {/* ⚠ OS DOIS DO MEIO SÃO O PONTO — item 5. Sozinhos, "financiado 17,6M" e
            "a pagar 22,2M" liam-se como erro de sistema. Com o principal em aberto e os
            juros entre eles, a conta se fecha à vista de todos: 11,6M + 10,6M = 22,2M, e
            o que se deve a mais que o contratado É o juro. Nenhum operador precisa abrir
            contrato para entender. A ORDEM É A DA CONTA e não muda.
            ⚠ CAIXAS, E MENORES QUE OS PARES SOLTOS (PR-PARC-04b item B): 38px contra os
            ~46px de antes (11px de rótulo + 20px de valor + `py-1`). A cor à esquerda faz
            o trabalho que o tamanho fazia — "A pagar" é a única com fundo, porque é a
            resposta do subtítulo. */}
        <div className="grid grid-cols-4 gap-2">
          {([
            { rotulo: 'Total financiado',    valor: totais.financiado,     borda: 'border-l-muted-foreground/40', fundo: '' },
            { rotulo: 'Principal em aberto', valor: totais.principalAberto, borda: 'border-l-primary',             fundo: '' },
            { rotulo: 'Juros a pagar',       valor: totais.juros,           borda: 'border-l-amber-500',           fundo: '' },
            { rotulo: 'A pagar',             valor: totais.aPagar,          borda: 'border-l-primary',             fundo: 'bg-primary/5' },
          ] as const).map(c => (
            <div key={c.rotulo}
              /* ⚠ 42px, E NAO 38: o conteudo sempre foi 43px — rotulo 10px/leading-none (13
                 com o `mt-0.5`), valor 14px/leading-tight (18) e `py-1.5` (12). Em 38px o
                 valor era CORTADO por baixo, e como a caixa nao tem `overflow-hidden` o
                 corte aparecia como numero encostado na borda. */
              className={`h-[42px] rounded-md border border-l-[3px] px-3 py-1.5 ${c.borda} ${c.fundo}`}>
              <div className="text-[10px] leading-none text-muted-foreground truncate">{c.rotulo}</div>
              <div className="mt-0.5 text-[14px] font-semibold tabular-nums leading-tight truncate">{fmt(c.valor)}</div>
            </div>
          ))}
        </div>

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
        <div className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-card px-3 pt-2 pb-0 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
        <div className="relative mb-1.5 shrink-0 flex flex-col gap-y-1.5">
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
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="h-6 w-24 text-[11px]"><SelectValue /></SelectTrigger>
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
            <SelectTrigger className="h-6 w-24 text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos escopos</SelectItem>
              <SelectItem value="pecuaria">Pecuária</SelectItem>
              <SelectItem value="agricultura">Agricultura</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroNatureza} onValueChange={setFiltroNatureza}>
            <SelectTrigger className="h-6 w-28 text-[11px]"><SelectValue /></SelectTrigger>
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
              className="table-fixed"
              wrapperClassName="h-full overflow-x-hidden overflow-y-auto"
            >
              {/* ⚠ A SOMA É 100 E ISSO NÃO É OPCIONAL: `table-fixed` + colgroup em
                  PORCENTAGEM é o que impede rolagem horizontal e faz o `truncate` sair
                  com reticências em vez de quebrar a linha.
                  6 + 26 + 14 + 11 + 12 + 11 + 8 + 9 + 3 = 100
                  ⚠ QUEM CEDEU (PR-PARC-04b item C): Principal 12->11, Saldo devedor
                  13->12, Status 13->9 e ações 4->3 pagam os 4 pontos da Descrição
                  (22->26) e os 3 do Credor (11->14) — os dois únicos campos de TEXTO da
                  linha, e os únicos que truncam. Os números têm largura conhecida e não
                  ganham nada com folga; texto ganha caractere por ponto.
                  ⚠ STATUS VOLTOU A ENCOLHER, e o risco está medido: em 8% o badge mais a
                  fração "2/12" saíam cortados, e foi por isso que ele tinha 13%. 9% é UM
                  ponto acima do que já falhou — se a fração cortar de novo na homologação,
                  é daqui que sai o ponto que falta. */}
              <colgroup>
                {/* 5 + 23 + 12 + 7 + 12 + 13 + 12 + 7 + 7 + 2 = 100 */}
                <col className="w-[5%]" />
                <col className="w-[23%]" />
                <col className="w-[12%]" />
                <col className="w-[7%]" />
                <col className="w-[12%]" />
                <col className="w-[13%]" />
                <col className="w-[12%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[2%]" />
              </colgroup>
              {/* ⚠ A BORDA MORA NO `thead`, NÃO NA LINHA — item 3. Na linha, ela
                  é filha do que rola e some por um instante a cada quadro do
                  scroll; no `thead` sticky ela viaja junto e o cabeçalho fica
                  sempre fechado por baixo. Daí o `[&_tr]:border-b-0`, que desliga
                  a borda que o primitivo põe na linha do cabeçalho.
                  ⚠ `bg-card` OPACO, não `bg-muted/95 backdrop-blur`: dentro do
                  card o fundo tem de ser o MESMO do card, ou aparece um degrau de
                  cor; e translúcido deixa a linha passar por baixo do número que
                  se está conferindo. */}
              {/* ⚠ CABECALHO AZUL (PR-PARC-05d item 3). O `border-b` SAIU: com fundo cheio,
                  a regua vira segunda linha rente ao azul. Override LOCAL — o primitivo
                  dense continua entregando o cabecalho claro para as outras 39 tabelas;
                  se o azul vingar, vira A25 no dense, por decisao do Gabriel. */}
              <TableHeader className="sticky top-0 z-10 bg-primary text-primary-foreground [&_tr]:border-b-0 [&_tr]:hover:bg-primary">
                <TableRow>
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
                  {/* PR-PARC-05d item 4 — a data que responde "de quando e' esse contrato".
                      A coluna JA' vinha na query e no tipo; so' nunca foi exibida. */}
                  <CabecalhoOrdenavel rotulo="Contratado em" ativo={sortCol === 'data_contrato'}
                    direcao={sortDir} aoOrdenar={() => handleSort('data_contrato')} />
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
                  /* ⚠ A LINHA INTEIRA ABRE O CONTRATO. O olho continua porque e' a
                     affordance VISIVEL — quem nao sabe que a linha e' clicavel precisa
                     de um alvo que se anuncie; quem ja sabe nao mira mais em 20px. */
                  return (
                  <TableRow
                    key={f.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => abrirContrato(f.id)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); abrirContrato(f.id); } }}
                    className={`cursor-pointer hover:bg-muted/40 ${encerrado ? 'opacity-50' : ''}`}
                  >
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
                      <span className="font-medium leading-tight">{f.descricao}</span>
                      {f.numero_contrato && (
                        <span className="ml-1 text-[10px] text-muted-foreground">{f.numero_contrato}</span>
                      )}
                      <span className="ml-1 text-[10px] text-muted-foreground">· {escopoSigla(f.tipo_financiamento)}</span>
                    </TableCell>
                    <TableCell className="truncate" title={f.credor_nome}>{f.credor_nome}</TableCell>
                    <TableCell className="font-mono tabular-nums whitespace-nowrap">
                      {f.data_contrato ? format(new Date(f.data_contrato + 'T12:00:00'), 'dd/MM/yy') : '—'}
                    </TableCell>
                    <TableCell className={MOEDA}>{fmt(f.valor_total)}</TableCell>
                    {/* ⚠ O NÚMERO QUE JUSTIFICA A TELA — e ele já existia: o
                        `total_pendente` era calculado no fetch e nunca exibido.
                        Foi por não estar na lista que os financiamentos do NJ
                        custaram uma semana de arqueologia. */}
                    <TableCell className={`${MOEDA} font-semibold`}>{fmt(f.total_pendente)}</TableCell>
                    <TableCell className={MOEDA}>
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
                    {/* ⚠ `select-none` SO' AQUI. Arrastar sobre a descricao continua
                        selecionando texto — e' dado que se copia; o que nao pode e' o
                        clique na coluna de acoes virar selecao. */}
                    <TableCell className="px-0 text-right select-none">
                    {/* ⚠ ERA ESTE O CULPADO DOS 26,5px. `h-6` sao 24px dentro de uma
                        linha de 21px: a celula tem `py-0`, entao quem manda na altura e'
                        o filho mais alto, e o botao esticava TODAS as linhas da tabela.
                        `size="icon"` traz `h-8 w-8` — o `p-0` impede que o padding do
                        variante volte a empurrar. */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 p-0"
                      title="Abrir"
                      aria-label="Abrir"
                      onClick={e => { e.stopPropagation(); abrirContrato(f.id); }}
                    >
                      <Eye className="size-3.5" />
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
      className={`cursor-pointer select-none text-primary-foreground normal-case tracking-normal ${direita ? 'text-right' : ''}`}
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
