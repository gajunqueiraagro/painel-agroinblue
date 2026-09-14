/**
 * BARTER — Produção › Agricultura › Barter (PR-AGRI-BARTER-TELA-A).
 *
 * ⚠ ONDE MORA, E POR QUÊ: o grupo Produção já tem "Operações Comerciais" sob *Pecuária*; o
 * barter é a operação comercial da LAVOURA, e entra sob *Agricultura* pelo mesmo raciocínio.
 * Ele nasce da colheita — que mora em Produção › Lançar › Agricultura — e só termina no
 * financeiro, quando se materializa. Pendurá-lo no Financeiro poria a origem no lugar errado.
 * ⚠ ESTA É A FATIA A: lista, abertura e o cabeçalho do detalhe. As duas pernas (insumo
 * recebido e grão entregue) e a materialização são as fatias B, C e D — e os blocos vazios
 * dizem isso por escrito, em vez de fingirem que a tela está pronta.
 * ⚠ A CONTA DE PERMUTA NÃO SE PEDE NA TELA. A RPC cria ou reusa a do parceiro; perguntar por
 * ela abriria espaço para o operador escolher uma conta de banco — que é exatamente o que a
 * separação de permuta existe para impedir.
 */
import { useEffect, useMemo, useState } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Plus, ArrowLeft, Handshake, Save, Pencil, Trash2, Lock, List, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatMoeda } from '@/lib/calculos/formatters';
import { useBarterContratos, useTotaisPorContrato, type ContratoNaLista } from '@/hooks/useBarterContratos';
import { FornecedorSelect } from '@/components/shared/FornecedorSelect';
import { useBarterInsumos, type BarterInsumo, type InsumoPayload } from '@/hooks/useBarterInsumos';
import { useBarterVenda, type BarterVenda, type VendaPayload } from '@/hooks/useBarterVenda';
import { BarterInsumoModal } from '@/components/agri/BarterInsumoModal';
import { BarterComposicaoEntrega } from '@/components/agri/BarterComposicaoEntrega';
import { BarterVendaModal } from '@/components/agri/BarterVendaModal';
import {
  labelDaClasse, saldoDoContrato, composicaoDasVendas,
} from '@/lib/agri/barterVenda';
import { ExportarColheita } from '@/components/agri/ExportarColheita';
import {
  exportarInsumosXlsx, exportarInsumosPdf, exportarVendasXlsx, exportarVendasPdf,
  exportarExtratoXlsx, exportarExtratoPdf,
  type ContextoBarter,
} from '@/lib/agri/exportBarter';
import { useBarterMaterializacao, useExtratoPermuta } from '@/hooks/useBarterMaterializacao';
import { BarterMaterializarCard } from '@/components/agri/BarterMaterializarCard';
import { BarterListaModal, BarterResumoCard } from '@/components/agri/BarterListaModal';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { DatePicker } from '@/components/ui/date-picker';
import { CULTURAS_LANCAMENTO } from '@/lib/agri/rateioLancamento';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFinanceiroV2, type LancamentoV2 } from '@/hooks/useFinanceiroV2';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';
import { useOrdenacaoTabela, type ColunaOrdenavel } from '@/hooks/useOrdenacaoTabela';
import { ThOrdenavel } from '@/components/ui/th-ordenavel';
import { useSafrasLavoura } from '@/hooks/useAreaPlantada';
import { formatNum } from '@/lib/calculos/formatters';

/** O visual de cada status — o mesmo vocabulário da Central de Operações. */
const TOM_STATUS: Record<string, string> = {
  aberto: 'bg-success/15 text-success',
  fechado: 'bg-muted text-muted-foreground',
  cancelado: 'bg-destructive/10 text-destructive',
};

const dataBR = (iso: string | null) => (iso && iso.length >= 10
  ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

const TH = 'sticky top-0 z-10 bg-primary px-1.5 py-1 text-[9px] font-semibold'
  + ' text-primary-foreground';

/**
 * O CINZA ESCURO DA LISTA DE INSUMOS — cabeçalho e total no MESMO tom.
 *
 * ⚠ ELE É MAIS CLARO QUE O `bg-primary`, não mais escuro, e vale registrar porque o briefing
 * pedia "cinza escuro, não o cinza claro atual": o atual NÃO era cinza claro — era o navy
 * `--primary` (#1d3a5d). Este #3a4864 é um passo ACIMA dele, um azul-ardósia. A mudança é de
 * tom, não de claro para escuro.
 * ⚠ E OS DOIS ANDAM JUNTOS: o total fecha a tabela e tem de ter a cor do cabeçalho, senão as
 * duas bordas da lista se leem como blocos diferentes.
 */
const CINZA_ESCURO = 'bg-[#3a4864]';
const TH_INSUMO = 'sticky top-0 z-10 bg-[#3a4864] px-1.5 py-1 text-[9px] font-semibold text-white';

/**
 * AS COLUNAS ORDENÁVEIS DOS INSUMOS — contrato de `useOrdenacaoTabela`, o mesmo ordenador da
 * lista de cargas da colheita e do modal de rateio. Nada novo aqui.
 * ⚠ A DATA ORDENA POR DATA REAL, não pelo texto dd/mm/aaaa: ordenar o formatado poria 01/12
 * antes de 02/01, porque compara o dia primeiro. O valor de comparação é o ISO do banco.
 */
/**
 * AS COLUNAS ORDENÁVEIS DAS VENDAS — mesmo contrato do insumo, mesmo ordenador.
 * ⚠ "CLASSES VENDIDAS" ORDENA PELO TEXTO CONCATENADO, que é o que a célula mostra: ordenar por
 * quantidade de classes poria "Até 20 ppb" ao lado de "Grão de roça" só por ambas terem uma, e a
 * ordem não corresponderia ao que se lê.
 */
const COLUNAS_VENDA: Array<ColunaOrdenavel<BarterVenda, string> & { h: string; dir?: boolean }> = [
  { coluna: 'data', h: 'Data', tipo: 'data', valor: v => v.data_operacao },
  { coluna: 'cultura', h: 'Cultura', tipo: 'texto', valor: v => v.cultura },
  {
    coluna: 'classes', h: 'Classes vendidas', tipo: 'texto',
    valor: v => v.entregas.map(e => labelDaClasse(e.classe_aflatoxina)).join(' · '),
  },
  { coluna: 'liquido', h: 'Líquido', tipo: 'numero', valor: v => v.valor_liquido, dir: true },
];

const COLUNAS_INSUMO: Array<ColunaOrdenavel<BarterInsumo, string> & { h: string; dir?: boolean }> = [
  { coluna: 'data', h: 'Data', tipo: 'data', valor: i => i.data_recebimento },
  { coluna: 'produto', h: 'Produto', tipo: 'texto', valor: i => i.produto },
  { coluna: 'nf', h: 'NF', tipo: 'texto', valor: i => i.nf_numero },
  { coluna: 'quantidade', h: 'Quantidade', tipo: 'numero', valor: i => i.quantidade, dir: true },
  { coluna: 'safra', h: 'Safra', tipo: 'texto', valor: i => i.safra_id },
  { coluna: 'valor', h: 'Valor', tipo: 'numero', valor: i => i.valor, dir: true },
];

export function AgriBarterTab() {
  const { clienteAtual } = useCliente();
  const { fazendaAtual, fazendas } = useFazenda();
  const clienteId = clienteAtual?.id ?? null;
  const { contratos, carregando, abrir, editar } = useBarterContratos(clienteId);
  const totaisPorContrato = useTotaisPorContrato(clienteId);

  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  /** `null` = criando; preenchido = editando aquele contrato. */
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [parceiroId, setParceiroId] = useState('');
  /* ⚠ O NOME VEM DO SELETOR, não de uma segunda leitura. O `FornecedorSelect` entrega
     `(id, nome)` no mesmo gesto, e é esse nome que a mensagem da conta de permuta usa. */
  const [parceiroNome, setParceiroNome] = useState('');
  const [nome, setNome] = useState('');
  const [cultura, setCultura] = useState('');
  /* ⚠ Nasce em hoje, mas EDITÁVEL: o barter costuma ser lançado meses depois de assinado. */
  const [dataAbertura, setDataAbertura] = useState(() => new Date().toISOString().slice(0, 10));
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const contrato = useMemo(
    () => contratos.find(c => c.id === abertoId) ?? null, [contratos, abertoId]);

  /* ── A PERNA RECEBI (fatia B) ── */
  const {
    insumos, salvar: salvarInsumo, excluir: excluirInsumo, total: totalInsumos,
    recarregar: recarregarInsumos,
  } = useBarterInsumos(clienteId, abertoId);
  const [insumoAberto, setInsumoAberto] = useState<BarterInsumo | null>(null);
  const [modalInsumo, setModalInsumo] = useState(false);
  const [salvandoInsumo, setSalvandoInsumo] = useState(false);

  /**
   * ⚠ O CATÁLOGO NÃO SE CARREGA SOZINHO — a lição do `PainelPeriodoTab`, repetida no
   * `AgriDreCulturaTab`: sem o `load*`, o seletor de plano abre VAZIO e nenhum tipo acusa,
   * porque lista vazia é lista válida. Só aparece na tela do operador.
   * ⚠ E A SAFRA NÃO VEM DAQUI. `fin.loadSafras` traz TODAS as safras do cliente, pecuária
   * junto; `useSafrasLavoura` já filtra `escopo_negocio = 'agricultura'` e é a mesma lista que
   * a colheita oferece. Insumo de barter é da lavoura — oferecer safra de boi seria convidar
   * ao erro num campo que o operador não pode conferir depois.
   */
  const fin = useFinanceiroV2();
  /* ⚠ OS QUATRO CATÁLOGOS, não só as classificações: o `LancamentoV2Dialog` que o atalho abre
     precisa de contas, fornecedores e safras além delas, e buscá-los ao clicar deixaria o
     primeiro lançamento com os seletores vazios. É o mesmo `useEffect` do DRE e do painel. */
  useEffect(() => {
    void fin.loadClassificacoes();
    void fin.loadContas();
    void fin.loadFornecedores();
    void fin.loadSafras();
  }, [fin.loadClassificacoes, fin.loadContas, fin.loadFornecedores, fin.loadSafras]);

  const [editandoLanc, setEditandoLanc] = useState<LancamentoV2 | null>(null);

  /**
   * ⚠ A LINHA VEM INTEIRA DO BANCO (`select('*')`) — copiado do DRE e do painel, e pelo mesmo
   * motivo: o insumo guarda seis campos e o modal precisa das sessenta e cinco. Buscar uma linha
   * ao clicar é mais barato que trazer tudo para o caso de o operador abrir uma.
   */
  const abrirLancamento = async (id: string | null) => {
    if (!id) return;
    const { data } = await (supabase as any).from('financeiro_lancamentos_v2')
      .select('*').eq('id', id).maybeSingle();
    const linha: LancamentoV2 | null = data ?? null;
    if (linha) setEditandoLanc(linha);
  };

  /* ⚠ A ORDENAÇÃO É DA LISTA CRUA, e o total do rodapé continua somando `insumos`: soma não muda
     com a ordem, e ligá-la à lista ordenada sugeriria que muda. */
  const ordInsumos = useOrdenacaoTabela(insumos, COLUNAS_INSUMO, { coluna: 'data', direcao: 'asc' });
  const { safras } = useSafrasLavoura(clienteId);
  const nomeDaSafra = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of safras) m.set(s.id, s.codigo || s.nome);
    return m;
  }, [safras]);

  const gravarInsumo = async (payload: InsumoPayload) => {
    /* Produto, valor e safra são o mínimo: sem eles o insumo não tem o que virar custo. */
    if (!payload.produto) { toast.error('Informe o produto recebido.'); return; }
    if (!(payload.valor > 0)) { toast.error('Informe o valor do insumo.'); return; }
    if (!payload.safra_id) { toast.error('Escolha a safra deste insumo.'); return; }
    setSalvandoInsumo(true);
    try {
      const r = await salvarInsumo(insumoAberto?.id ?? null, payload);
      if (!r.ok) { toast.error(r.erro ?? 'Não foi possível salvar o insumo.'); return; }
      toast.success(insumoAberto ? 'Insumo atualizado.' : 'Insumo lançado.');
      setModalInsumo(false); setInsumoAberto(null);
    } finally {
      setSalvandoInsumo(false);
    }
  };

  /**
   * ⚠ MATERIALIZADO NÃO SE MEXE. O `financeiro_lancamento_id` é o vínculo 1:1 com o DRE:
   * editar o valor por baixo deixaria o lançamento apontando para um número que mudou, e
   * apagar a linha deixaria o lançamento órfão. O caminho é estornar (fatia D) e refazer.
   */
  const materializado = (i: BarterInsumo) => !!i.financeiro_lancamento_id;

  const removerInsumo = async (i: BarterInsumo) => {
    if (materializado(i)) { toast.error('Estorne o contrato antes de excluir este insumo.'); return; }
    const r = await excluirInsumo(i.id);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível excluir o insumo.'); return; }
    toast.success('Insumo excluído.');
  };

  /* ── A PERNA ENTREGUEI (fatia C) ── */
  /* ⚠ REUSA O `contrato` DE CIMA, não uma segunda busca: duas leituras do mesmo contrato
     poderiam divergir por um render e a venda nasceria apontando para outro parceiro. */
  const {
    vendas, salvar: salvarVenda, excluir: excluirVenda, totalEntregue, materializada,
  } = useBarterVenda(
    clienteId, abertoId,
    contrato?.fazenda_id ?? null,
    contrato?.parceiro_fornecedor_id ?? null,
  );
  const [vendaAberta, setVendaAberta] = useState<BarterVenda | null>(null);
  const [modalVenda, setModalVenda] = useState(false);
  const [salvandoVenda, setSalvandoVenda] = useState(false);

  const gravarVenda = async (payload: VendaPayload) => {
    if (!payload.safra_id) { toast.error('Escolha a safra do grão.'); return; }
    if (!payload.cultura) { toast.error('Escolha a cultura vendida.'); return; }
    if (!(payload.valor_bruto > 0)) { toast.error('Lance ao menos uma classe com sacas e preço.'); return; }
    setSalvandoVenda(true);
    try {
      const r = await salvarVenda(vendaAberta?.id ?? null, payload);
      if (!r.ok) { toast.error(r.erro ?? 'Não foi possível salvar a venda.'); return; }
      toast.success(vendaAberta ? 'Venda atualizada.' : 'Venda lançada.');
      setModalVenda(false); setVendaAberta(null);
    } finally {
      setSalvandoVenda(false);
    }
  };

  const removerVenda = async (v: BarterVenda) => {
    if (materializada(v)) { toast.error('Estorne o contrato antes de excluir esta venda.'); return; }
    const r = await excluirVenda(v);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível excluir a venda.'); return; }
    toast.success('Venda excluída.');
  };

  /**
   * A COMPOSIÇÃO DA ENTREGA POR CLASSE — item 9 do polish, e o motivo de existir da tela.
   *
   * ⚠ É O QUE O PRODUTOR CONFERE COM A COOPERATIVA, saca a saca. "Entregue R$ 413.717,24" não
   * diz COMO foi pago; a cooperativa paga preços diferentes por classe de aflatoxina, e é
   * exatamente aí que uma divergência de acerto aparece.
   * ⚠ SOMA AS ENTREGAS DE TODAS AS VENDAS do contrato, agrupadas por classe: duas vendas da mesma
   * classe em datas diferentes são o mesmo lote de qualidade para quem confere.
   * ⚠ O PREÇO EXIBIDO É O MÉDIO PONDERADO (valor ÷ sacas), não o da primeira linha. Com uma venda
   * só eles coincidem; com duas a preços diferentes, mostrar o primeiro seria afirmar um preço
   * que não foi praticado no conjunto.
   */
  const composicao = useMemo(() => composicaoDasVendas(vendas), [vendas]);

  /* ⚠ AQUI, e não junto do ordenador dos insumos: `vendas` só existe depois do hook, e o gate de
     TDZ acusa uso acima da declaração. É ordem, não lógica. */
  const ordVendas = useOrdenacaoTabela(vendas, COLUNAS_VENDA, { coluna: 'data', direcao: 'asc' });

  /**
   * A venda cuja composição está aberta. `null` = fechada.
   *
   * ⚠ ELA SOBREVIVE AO CADEADO, e é a diferença entre ver e editar: uma venda materializada não
   * se altera sem estorno, mas conferir COMO ela foi paga — por classe, com o preço de cada uma —
   * é justamente o que se faz depois de materializar, contra o acerto da cooperativa.
   */
  const [composicaoDe, setComposicaoDe] = useState<BarterVenda | null>(null);

  const ctxExport = useMemo((): ContextoBarter => ({
    cliente: clienteAtual?.nome ?? '—',
    contrato: contrato?.nome ?? '—',
    parceiro: contrato?.parceiroNome ?? '—',
    cultura: contrato?.cultura ? labelDaCultura(contrato.cultura) : '—',
    /* ⚠ O PAPEL NÃO LEVA UUID: a safra vai pelo código, resolvida pelo mesmo mapa da tela. */
    nomeDaSafra: (id) => (id ? (nomeDaSafra.get(id) ?? '—') : '—'),
  }), [clienteAtual, contrato, nomeDaSafra]);

  /* ⚠ AGORA O SALDO FECHA, e é o LÍQUIDO que entra dos dois lados: o Senar fica com a
     cooperativa e nunca chega ao produtor. */
  const balanco = saldoDoContrato(totalEntregue, totalInsumos);

  /* ── MATERIALIZAR / ESTORNAR (fatia D) ── */
  const { materializar, estornar } = useBarterMaterializacao(abertoId, contrato?.conta_permuta_id ?? null);
  const { linhas: extrato, saldo: saldoPermuta } = useExtratoPermuta(contrato?.conta_permuta_id ?? null);
  const [ocupado, setOcupado] = useState(false);
  const [verInsumos, setVerInsumos] = useState(false);
  const [verVendas, setVerVendas] = useState(false);

  /**
   * ⚠ A CONTA É A MESMA DA RPC, e por isso conta PARTE e INSUMO juntos, ignorando valor zero:
   * o laço do banco varre `agri_oc_partes` com `coalesce(valor,0) <> 0` e `agri_oc_insumos`
   * idem. Se a tela prometesse 30 e o banco gerasse 28, o operador confirmaria um número que
   * não existe.
   */
  const partesDasVendas = useMemo(() => vendas.flatMap(v => v.partes), [vendas]);
  const pendentes = useMemo(() =>
    partesDasVendas.filter(p => !p.financeiro_lancamento_id && Number(p.valor) !== 0).length
    + insumos.filter(i => !i.financeiro_lancamento_id && Number(i.valor) !== 0).length,
  [partesDasVendas, insumos]);
  const materializados = useMemo(() =>
    partesDasVendas.filter(p => !!p.financeiro_lancamento_id).length
    + insumos.filter(i => !!i.financeiro_lancamento_id).length,
  [partesDasVendas, insumos]);

  const rodar = async (acao: 'materializar' | 'estornar') => {
    setOcupado(true);
    try {
      const r = acao === 'materializar' ? await materializar() : await estornar();
      if (!r.ok) { toast.error(r.erro ?? 'Não foi possível concluir.'); return; }
      toast.success(acao === 'materializar'
        ? `${'gerados' in r ? r.gerados : 0} lançamentos gerados no DRE.`
        : 'Lançamentos estornados. A conta de permuta voltou a zero.');
    } finally {
      setOcupado(false);
    }
  };

  const criar = async () => {
    if (!parceiroId) { toast.error('Escolha o parceiro do contrato.'); return; }
    if (!nome.trim()) { toast.error('Dê um nome ao contrato.'); return; }
    /* ⚠ A CULTURA É OBRIGATÓRIA, e não por capricho: sem ela os insumos vão ao DRE por cultura
       SEM cultura e caem em "Não apropriado" — o custo some da lavoura que o gerou. Foi
       exatamente o que aconteceu com o contrato 23/24 antes do AGRI-BARTER-04. */
    /* ⚠ NA EDIÇÃO A CULTURA NÃO É ALTERADA — ela já foi para os lançamentos materializados, e
       trocá-la deixaria o contrato dizendo uma coisa e o DRE outra, sem nada reconciliar os dois. */
    if (!editandoId && !cultura) { toast.error('Escolha a cultura do barter.'); return; }
    setSalvando(true);
    try {
      if (editandoId) {
        const r = await editar(editandoId, {
          nome: nome.trim(), descricao: descricao.trim() || null, data_abertura: dataAbertura,
        });
        if (!r.ok) { toast.error(r.erro ?? 'Não foi possível salvar o contrato.'); return; }
        toast.success('Contrato atualizado.');
        setNovoAberto(false); setEditandoId(null);
        return;
      }
      const r = await abrir(parceiroId, nome.trim(), fazendaAtual?.id ?? null,
        descricao.trim() || null, cultura, dataAbertura || null);
      if (!r.ok) { toast.error(r.erro ?? 'Não foi possível abrir o contrato.'); return; }
      /* ⚠ `ok` COM `erro` é o caso da data que não gravou: o contrato existe, só a data ficou a
         de hoje. Avisar sem bloquear é o que impede o operador de abrir um segundo. */
      if (r.erro) toast.warning(r.erro);
      /* ⚠ A MENSAGEM SEGUE `conta_criada`, que agora diz a verdade (AGRI-BARTER-03C): anunciar
         "conta criada" ao reusar a do parceiro faria o operador procurar uma segunda conta que
         não existe — e a trava do banco garante que ela não exista mesmo. */
      const parceiro = parceiroNome || 'parceiro';
      toast.success(r.abertura?.conta_criada
        ? `Contrato aberto. A conta "Permuta · ${parceiro}" foi criada.`
        : `Contrato aberto na conta de permuta que já existia com ${parceiro}.`);
      setNovoAberto(false);
      setParceiroId(''); setParceiroNome(''); setNome(''); setCultura('');
      setDataAbertura(new Date().toISOString().slice(0, 10)); setDescricao('');
      if (r.abertura?.contrato_id) setAbertoId(r.abertura.contrato_id);
    } finally {
      setSalvando(false);
    }
  };

  /* ── O DETALHE ── */
  if (contrato) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col gap-2 p-4 animate-fade-in">
        <div className="flex shrink-0 items-start gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Voltar aos contratos"
            onClick={() => setAbertoId(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h2 className="text-lg font-bold leading-tight text-foreground">{contrato.nome}</h2>
            {/* ⚠ A CULTURA APARECE AQUI, na linha que já existe, e não num sexto card: ela é
                identidade do contrato ("o barter do amendoim"), não número a conferir. E o "—"
                quando falta é informação — foi assim que o 23/24 passou meses sem ela. */}
            <p className="text-xs text-muted-foreground">
              {contrato.parceiroNome} · {contrato.cultura ? labelDaCultura(contrato.cultura) : '—'}
              {' · aberto em '}{dataBR(contrato.data_abertura)}
            </p>
          </div>
          <div className="flex-1" />
          <span className={cn('rounded px-2 py-0.5 text-[10px] font-medium', TOM_STATUS[contrato.status] ?? 'bg-muted')}>
            {contrato.status}
          </span>
        </div>

        {/* ⚠ IDENTIDADE É LISTA, NÚMERO É CARTÃO — item 4 do polish. Cinco cartões iguais faziam
            "Parceiro" competir com "Saldo" pela mesma atenção, e nenhum dos dois é lido primeiro.
            O que identifica o contrato (parceiro, conta, cultura, status, abertura) vira um bloco
            de linhas alinhadas, sóbrio; só os TRÊS NÚMEROS ficam em destaque. */}
        <div className="grid shrink-0 gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 rounded-md border bg-card px-3 py-2">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[11px]">
              {([
                ['Parceiro', contrato.parceiroNome],
                /* ⚠ O NOME DA CONTA, NUNCA O ID: sem UUID na tela, e o nome já é único por
                   parceiro (índice `uq_conta_permuta_por_parceiro`). */
                ['Conta de permuta', contrato.contaPermutaNome ?? '—'],
                ['Cultura', contrato.cultura ? labelDaCultura(contrato.cultura) : '—'],
                ['Aberto em', dataBR(contrato.data_abertura)],
              ] as Array<[string, string]>).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="whitespace-nowrap text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 truncate whitespace-nowrap font-medium" title={v}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {/* ⚠ A MESMA COR DOS CARTÕES DE AÇÃO — item 3. Estes três eram os únicos números de
                dinheiro da tela ainda neutros, e cor que vale em metade da tela não é padrão, é
                exceção: custo vermelho, receita verde, em toda parte. */}
            <Metrica rotulo="Recebido (insumos)" valor={formatMoeda(totalInsumos)} cor="text-destructive"
              nota={`${insumos.length} ${insumos.length === 1 ? 'insumo' : 'insumos'}`} />
            <Metrica rotulo="Entregue (grão)" valor={formatMoeda(totalEntregue)} cor="text-success"
              nota={`${vendas.length} ${vendas.length === 1 ? 'venda' : 'vendas'} · líquido`} />
            {/* ⚠ O RÓTULO É A METADE ÚTIL DO NÚMERO, e a COR é a outra: "−390.000" não diz de que
                lado o produtor está. Verde = crédito com o parceiro, vermelho = deve. */}
            <Metrica rotulo="Saldo" valor={formatMoeda(balanco.saldo)} nota={balanco.rotulo}
              destaque cor={balanco.saldo > 0 ? 'text-success'
                : balanco.saldo < 0 ? 'text-destructive' : undefined} />
          </div>
        </div>

        {/* ⚠ AS TRÊS LISTAS SAÍRAM DA TELA E VIRARAM MODAL — PR-AGRI-BARTER-RESUMO-MODAL.
            Com 26 insumos, uma venda e 28 lançamentos, três listas empilhadas ocupavam a tela
            inteira e ainda rolavam por dentro. O que fica é o resumo; o detalhe abre no clique.
            ⚠ E OS CARDS DE TOPO É QUE SÃO O RESUMO BOM: recebido, entregue e saldo já estão lá
            em cima. Estes três cartões não repetem o dinheiro — só dizem quantos e dão as
            ações. Repetir o número gastaria a altura que este PR existe para economizar. */}
        <div className="grid shrink-0 grid-cols-1 gap-1.5 md:grid-cols-3">
          <BarterResumoCard titulo="Recebi (insumos)"
            valor={formatMoeda(totalInsumos)} cor="text-destructive"
            estado={insumos.length === 0 ? 'nenhum insumo lançado'
              : `${insumos.length} ${insumos.length === 1 ? 'insumo' : 'insumos'} do parceiro`}>
            <Button size="sm" variant="outline" className="h-6 gap-1 px-1.5 text-[10px]"
              onClick={() => setVerInsumos(true)}>
              <List className="h-3 w-3" /> Ver insumos
            </Button>
            <Button size="sm" variant="outline" className="h-6 gap-1 px-1.5 text-[10px]"
              onClick={() => { setInsumoAberto(null); setModalInsumo(true); }}>
              <Plus className="h-3 w-3" /> Adicionar
            </Button>
          </BarterResumoCard>

          <BarterResumoCard titulo="Entreguei (grão)"
            valor={formatMoeda(totalEntregue)} cor="text-success"
            estado={vendas.length === 0 ? 'nenhuma venda lançada'
              : `${vendas.length} ${vendas.length === 1 ? 'venda' : 'vendas'} de grão · líquido`}>
            <Button size="sm" variant="outline" className="h-6 gap-1 px-1.5 text-[10px]"
              onClick={() => setVerVendas(true)}>
              <List className="h-3 w-3" /> Ver vendas
            </Button>
            <Button size="sm" variant="outline" className="h-6 gap-1 px-1.5 text-[10px]"
              onClick={() => { setVendaAberta(null); setModalVenda(true); }}>
              <Plus className="h-3 w-3" /> Lançar venda
            </Button>
          </BarterResumoCard>

          <BarterMaterializarCard
            contaPermutaNome={contrato.contaPermutaNome}
            pendentes={pendentes}
            materializados={materializados}
            linhas={extrato}
            saldo={saldoPermuta}
            ocupado={ocupado}
            onMaterializar={() => void rodar('materializar')}
            onEstornar={() => void rodar('estornar')}
            onExportar={async (formato) => {
              const conta = contrato.contaPermutaNome ?? '—';
              if (formato === 'xlsx') exportarExtratoXlsx(extrato, ctxExport, saldoPermuta, conta);
              else await exportarExtratoPdf(extrato, ctxExport, saldoPermuta, conta);
            }}
          />
        </div>

        {/* ── COMPOSIÇÃO DA ENTREGA POR CLASSE ──
            ⚠ FICA NA TELA, NÃO NO MODAL: é a conferência que o produtor faz com a cooperativa, e
            escondê-la atrás de um clique faria a tela mostrar um total de R$ 413 mil sem dizer
            como ele foi pago — que é exatamente a pergunta que ele tem na mão. */}
        {/* ⚠ BLOCO CONTIDO — item 3. A composição ocupava a largura inteira para mostrar quatro
            linhas de três números, e uma tabela esticada põe o rótulo a um palmo do valor. */}
        {composicao.linhas.length > 0 && (
          <BarterComposicaoEntrega composicao={composicao} rotuloTotal="Líquido entregue"
            th={TH} larguraMax={560} />
        )}

        {/* ── AS TRÊS LISTAS, agora em modal ── */}
        <BarterListaModal
          aberto={verInsumos}
          titulo="Insumos recebidos"
          subtitulo="O que a cooperativa entregou — a perna de custo do barter."
          acao={(
            /* ⚠ OS DOIS NA MESMA ALTURA, e era isso que desencaixava: o Exportar vinha com
               fundo BRANCO CHEIO e o Adicionar transparente com borda — dois pesos visuais
               diferentes na mesma linha, e o olho lia como se um fosse o principal.
               ⚠ AGORA A HIERARQUIA É A CERTA: Adicionar é a ação e leva o verde `--acao` da
               casa; Exportar é secundário e fica em contorno. `items-center` e a mesma `h-7`
               nos dois é o que alinha de fato — sem altura igual, `items-center` alinha centros
               de caixas de tamanhos diferentes.
               ⚠ E AS ALTURAS JÁ ERAM IGUAIS — o desalinho era OUTRO. Medido: 28px nos dois, e o
               Exportar saía 6,5px acima porque o invólucro dele tem um `mb-[13px]` fixo, escrito
               para a toolbar da colheita; `items-center` centra a caixa COM a margem, e metade
               dela vira deslocamento. O `classeEnvolucro="mb-0"` é o que zera isso aqui sem
               mexer no host original. Os dois em `h-8`, a altura de toolbar da casa.
               ⚠ E ESTE É UM COMENTÁRIO DE JS, não de JSX: aqui dentro de `acao={(…)}` a forma
               com chaves é um objeto literal para o parser, não um comentário. Quarta vez neste
               repo — a regra é: dentro de uma EXPRESSÃO, comentário de JS; dentro de FILHOS de
               elemento, comentário de JSX.
               ⚠ E NÃO SE ESCREVE O DELIMITADOR DE FECHO NO MEIO DO TEXTO: ele fecha o comentário
               ali mesmo, e o resto da prosa vira código. Foi o que acabou de acontecer aqui. */
            <div className="flex items-center gap-1.5">
              <ExportarColheita
                classeEnvolucro="mb-0"
                classeGatilho="h-8 border-white/40 bg-transparent text-primary-foreground hover:bg-white/10 hover:text-white"
                desabilitado={insumos.length === 0}
                motivo={insumos.length === 0 ? 'Nenhum insumo para exportar.' : undefined}
                onExportar={async (formato) => {
                  if (formato === 'xlsx') exportarInsumosXlsx(insumos, ctxExport, totalInsumos);
                  else await exportarInsumosPdf(insumos, ctxExport, totalInsumos);
                }}
              />
              <Button size="sm" variant="acao" className="h-8 gap-1 px-2 text-[10px]"
                onClick={() => { setInsumoAberto(null); setModalInsumo(true); }}>
                <Plus className="h-3 w-3" /> Adicionar insumo
              </Button>
            </div>
          )}
          rodapeEsquerda="Total recebido"
          rodapeDireita={formatMoeda(totalInsumos)}
          corRodape={CINZA_ESCURO}
          onFechar={() => setVerInsumos(false)}>
        {/* ⚠ SÓ O PRODUTO É FLEXÍVEL. Data, NF, quantidade, safra e valor têm largura reservada
            para o pior caso e `whitespace-nowrap`: o VALOR não pode quebrar em duas linhas, que
            é o defeito que esta fatia veio corrigir. Quem encolhe quando falta espaço é o nome
            do produto, que trunca com reticência e guarda o inteiro no `title`. */}
        <table className="w-full table-fixed border-collapse text-[10px] leading-tight">
          <colgroup>
            {['12%', '27%', '11%', '16%', '14%', '13%', '7%'].map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr>
              {COLUNAS_INSUMO.map(c => (
                <ThOrdenavel key={c.coluna} coluna={c.coluna} rotulo={c.h}
                  ordem={ordInsumos.ordem} onOrdenar={ordInsumos.alternar}
                  className={TH_INSUMO} alinhaDireita={c.dir} />
              ))}
              <th className={cn(TH_INSUMO, 'text-right')} />
            </tr>
          </thead>
          <tbody>
            {insumos.length === 0 && (
              <tr><td colSpan={7} className="px-2 py-6 text-center text-[10px] text-muted-foreground">
                Nenhum insumo lançado. O que a cooperativa entregou entra aqui.
              </td></tr>
            )}
            {ordInsumos.ordenadas.map(i => (
              <tr key={i.id} className="border-t border-slate-100 odd:bg-[#1e3a5f]/[0.03]">
                {/* ⚠ A DATA É A DE RECEBIMENTO — a competência que vai para o DRE —, não a de
                    criação do registro. É ela que o operador confere contra a nota. */}
                <td className="whitespace-nowrap px-1.5 py-0.5 tabular-nums">{dataBR(i.data_recebimento)}</td>
                <td className="truncate px-1.5 py-0.5" title={i.produto}>{i.produto}</td>
                <td className="truncate px-1.5 py-0.5 text-muted-foreground">{i.nf_numero ?? '—'}</td>
                <td className="whitespace-nowrap px-1.5 py-0.5 text-right tabular-nums">
                  {i.quantidade == null ? '—'
                    : `${formatNum(i.quantidade, 2)}${i.unidade ? ` ${i.unidade}` : ''}`}
                </td>
                <td className="truncate px-1.5 py-0.5 text-muted-foreground">
                  {i.safra_id ? (nomeDaSafra.get(i.safra_id) ?? '—') : '—'}
                </td>
                <td className="whitespace-nowrap px-1.5 py-0.5 text-right tabular-nums">{formatMoeda(i.valor)}</td>
                {/* ⚠ OS BOTÕES FICAM SEMPRE NO LUGAR, mesmo travados (lei de estabilidade
                    visual). Materializado troca o par por um cadeado que DIZ o motivo —
                    não some, não desloca a coluna. */}
                <td className="px-1 py-0.5 text-right">
                  {materializado(i) ? (
                    <span className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground"
                      title="Insumo já materializado no DRE. Estorne o contrato para editar ou excluir.">
                      <Lock className="h-3 w-3" />
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5">
                      <button type="button" title="Editar insumo"
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => { setInsumoAberto(i); setModalInsumo(true); }}>
                        <Pencil className="h-3 w-3" />
                      </button>
                      {/* ⚠ O ATALHO PARA O LANÇAMENTO é o que estava faltando: o insumo guarda o
                          QUE e QUANTO, mas vencimento e pagamento vivem no lançamento financeiro
                          vinculado — e até aqui só se chegava lá por outra tela.
                          ⚠ ELE OCUPA O LUGAR MESMO SEM VÍNCULO, desabilitado e dizendo por quê:
                          botão que some conforme o dado desloca a coluna inteira. */}
                      <button type="button"
                        title={i.financeiro_lancamento_id
                          ? 'Abrir o lançamento financeiro (vencimento e pagamento)'
                          : 'Este insumo ainda não tem lançamento financeiro vinculado.'}
                        disabled={!i.financeiro_lancamento_id}
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted
                          hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                        onClick={() => { void abrirLancamento(i.financeiro_lancamento_id); }}>
                        <ExternalLink className="h-3 w-3" />
                      </button>
                      <button type="button" title="Excluir insumo"
                        className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => void removerInsumo(i)}>
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </BarterListaModal>

        <BarterListaModal
          aberto={verVendas}
          titulo="Vendas de grão"
          subtitulo="O que foi entregue ao parceiro, por classe de qualidade."
          acao={(
            <div className="flex items-center gap-1.5">
              <ExportarColheita
                classeEnvolucro="mb-0"
                classeGatilho="h-8 border-white/40 bg-transparent text-primary-foreground hover:bg-white/10 hover:text-white"
                desabilitado={vendas.length === 0}
                motivo={vendas.length === 0 ? 'Nenhuma venda para exportar.' : undefined}
                onExportar={async (formato) => {
                  if (formato === 'xlsx') exportarVendasXlsx(vendas, ctxExport, totalEntregue);
                  else await exportarVendasPdf(vendas, ctxExport, totalEntregue);
                }}
              />
              <Button size="sm" variant="acao" className="h-8 gap-1 px-2 text-[10px]"
                onClick={() => { setVendaAberta(null); setModalVenda(true); }}>
                <Plus className="h-3 w-3" /> Lançar venda
              </Button>
            </div>
          )}
          rodapeEsquerda="Total entregue (líquido)"
          rodapeDireita={formatMoeda(totalEntregue)}
          corRodape={CINZA_ESCURO}
          onFechar={() => setVerVendas(false)}>
        {/* ⚠ SÓ "CLASSES VENDIDAS" É FLEXÍVEL. Data, cultura e líquido têm largura reservada e
            `whitespace-nowrap`: o LÍQUIDO não pode quebrar em duas linhas — é o mesmo cuidado da
            lista de insumos, e o mesmo motivo. */}
        <table className="w-full table-fixed border-collapse text-[10px] leading-tight">
          <colgroup>
            {['14%', '21%', '34%', '19%', '12%'].map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr>
              {COLUNAS_VENDA.map(c => (
                <ThOrdenavel key={c.coluna} coluna={c.coluna} rotulo={c.h}
                  ordem={ordVendas.ordem} onOrdenar={ordVendas.alternar}
                  className={TH_INSUMO} alinhaDireita={c.dir} />
              ))}
              <th className={cn(TH_INSUMO, 'text-right')} />
            </tr>
          </thead>
          <tbody>
            {vendas.length === 0 && (
              <tr><td colSpan={5} className="px-2 py-6 text-center text-[10px] text-muted-foreground">
                Nenhuma venda lançada. O grão que foi para o parceiro entra aqui.
              </td></tr>
            )}
            {ordVendas.ordenadas.map(v => (
              <tr key={v.id} className="border-t border-slate-100 odd:bg-[#1e3a5f]/[0.03]">
                <td className="whitespace-nowrap px-1.5 py-0.5 tabular-nums">{dataBR(v.data_operacao)}</td>
                <td className="truncate px-1.5 py-0.5">{labelDaCultura(v.cultura)}</td>
                {/* ⚠ AS CLASSES POR EXTENSO, não a contagem: "2 classes" obrigaria a abrir
                    a venda para saber se o lote bom foi vendido. */}
                <td className="truncate px-1.5 py-0.5 text-muted-foreground"
                  title={v.entregas.map(e => labelDaClasse(e.classe_aflatoxina)).join(' · ')}>
                  {v.entregas.length === 0 ? '—'
                    : v.entregas.map(e => labelDaClasse(e.classe_aflatoxina)).join(' · ')}
                </td>
                <td className="whitespace-nowrap px-1.5 py-0.5 text-right tabular-nums">
                  {formatMoeda(v.valor_liquido ?? 0)}
                </td>
                {/* ⚠ O ↗ FICA FORA DO `if` DO CADEADO, e é a mudança que importa aqui: ver a
                    composição é LEITURA, e leitura não se tranca. Conferir como a venda foi paga
                    é exatamente o que se faz DEPOIS de materializar, contra o acerto da
                    cooperativa — trancá-lo junto com a edição escondia a informação justamente
                    quando ela passa a ser cobrada.
                    ⚠ E OS BOTÕES FICAM SEMPRE NO MESMO LUGAR: o par editar/excluir vira um
                    cadeado que DIZ o motivo, e o ↗ não se move nem some. */}
                <td className="px-1 py-0.5 text-right">
                  <span className="inline-flex items-center gap-0.5">
                    {materializada(v) ? (
                      <span className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground"
                        title="Venda já materializada no DRE. Para editar, estorne o contrato.">
                        <Lock className="h-3 w-3" />
                      </span>
                    ) : (
                      <>
                        <button type="button" title="Editar venda"
                          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          onClick={() => { setVendaAberta(v); setModalVenda(true); }}>
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button type="button" title="Excluir venda"
                          className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => void removerVenda(v)}>
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    )}
                    <button type="button" title="Ver a composição por classe desta venda"
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => setComposicaoDe(v)}>
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </BarterListaModal>


        {/* ⚠ UM `BarterListaModal` TAMBÉM AQUI, não um Dialog novo: a composição é uma tabela com
            um total no rodapé — exatamente o que este shell resolve —, e o operador reconhece a
            moldura das outras três listas.
            ⚠ O SUBTÍTULO DIZ QUAL VENDA É: a composição do card soma TODAS as vendas do contrato,
            e sem a data e a cultura no topo as duas tabelas seriam indistinguíveis na tela. */}
        {composicaoDe && (
          <BarterListaModal
            aberto
            titulo="Composição da entrega"
            subtitulo={`${dataBR(composicaoDe.data_operacao)} · ${labelDaCultura(composicaoDe.cultura)}`
              + ` — como esta venda foi paga, por classe.`}
            rodapeEsquerda="Líquido desta venda"
            rodapeDireita={formatMoeda(composicaoDasVendas([composicaoDe]).liquido)}
            corRodape={CINZA_ESCURO}
            onFechar={() => setComposicaoDe(null)}>
            <BarterComposicaoEntrega
              composicao={composicaoDasVendas([composicaoDe])}
              rotuloTotal="Líquido desta venda" th={TH_INSUMO} />
          </BarterListaModal>
        )}

        <BarterVendaModal
          aberto={modalVenda}
          venda={vendaAberta}
          clienteId={clienteId}
          safras={safras}
          classificacoes={fin.classificacoes}
          salvando={salvandoVenda}
          onFechar={() => { setModalVenda(false); setVendaAberta(null); }}
          onSalvar={p => void gravarVenda(p)}
        />

        <BarterInsumoModal
          aberto={modalInsumo}
          insumo={insumoAberto}
          safras={safras}
          classificacoes={fin.classificacoes}
          salvando={salvandoInsumo}
          onFechar={() => { setModalInsumo(false); setInsumoAberto(null); }}
          onSalvar={p => void gravarInsumo(p)}
        />

        {/* ⚠ O MODAL DO LANÇAMENTO É IRMÃO DA LISTA, nunca filho de uma linha — a mesma decisão
            do DRE e do painel: fechar a edição não desmonta o modal de insumos por baixo, então
            a ordenação e a posição da rolagem continuam onde estavam.
            ⚠ AO SALVAR, RECARREGA O INSUMO TAMBÉM: o valor do lançamento e o do insumo são o
            mesmo dinheiro visto de dois lados, e atualizar só um deixaria a linha dizendo um
            número e o "Total recebido" outro, na mesma tela aberta. */}
        <LancamentoV2Dialog
          open={!!editandoLanc}
          onClose={() => setEditandoLanc(null)}
          onSave={async (form, id) => {
            const ok = id ? await fin.editarLancamento(id, form) : await fin.criarLancamento(form);
            if (ok && id) await recarregarInsumos();
            return ok;
          }}
          lancamento={editandoLanc}
          fazendas={fazendas}
          contas={fin.contasBancarias}
          classificacoes={fin.classificacoes}
          fornecedores={fin.fornecedores}
          safras={fin.safras}
          onCriarFornecedor={fin.criarFornecedor}
        />
      </div>
    );
  }

  /* ── A LISTA ── */
  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2 p-4 animate-fade-in">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Barter</h2>
          {/* ⚠ O SUBTÍTULO EXPLICA O QUE É, não repete o cliente. O nome do cliente já está na
              barra de cima, em toda tela; aqui ele gastava a única linha que podia dizer ao
              operador novo o que esta tela faz. */}
          <p className="text-xs text-muted-foreground">
            Troca de grãos por insumos com a cooperativa — entra no resultado, não no caixa.
          </p>
        </div>
        <Button size="sm" className="h-8 gap-1 text-[11px]"
          onClick={() => {
            setEditandoId(null); setParceiroId(''); setParceiroNome(''); setNome('');
            setCultura(''); setDataAbertura(new Date().toISOString().slice(0, 10)); setDescricao('');
            setNovoAberto(true);
          }}>
          <Plus className="h-3.5 w-3.5" /> Novo contrato
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <table className="w-full table-fixed border-collapse text-[10px] leading-tight">
          <colgroup>
            {['16%', '19%', '17%', '9%', '11%', '11%', '11%', '6%'].map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className={cn(TH, 'text-left')}>Parceiro</th>
              <th className={cn(TH, 'text-left')}>Contrato</th>
              <th className={cn(TH, 'text-left')}>Conta de permuta</th>
              <th className={cn(TH, 'text-left')}>Abertura</th>
              {/* ⚠ OS TRÊS NÚMEROS NA LISTA — item 2. Sem eles o operador abria contrato por
                  contrato só para saber onde está o dinheiro. */}
              <th className={cn(TH, 'text-right')}>Recebido</th>
              <th className={cn(TH, 'text-right')}>Entregue</th>
              <th className={cn(TH, 'text-right')}>Saldo</th>
              <th className={cn(TH, 'text-right')} />
            </tr>
          </thead>
          <tbody>
            {!carregando && contratos.length === 0 && (
              <tr><td colSpan={8} className="px-2 py-6 text-center text-[11px] text-muted-foreground">
                <Handshake className="mx-auto mb-1 h-5 w-5 opacity-40" />
                Nenhum contrato de barter. O primeiro cria a conta de permuta do parceiro.
              </td></tr>
            )}
            {contratos.map((c: ContratoNaLista) => {
              const t = totaisPorContrato.get(c.id) ?? { recebido: 0, entregue: 0, saldo: 0 };
              return (
                /* ⚠ LINHA MAIS ALTA — item 1a. `py-1.5` contra `py-0.5`: a lista tem oito colunas
                   e é a primeira coisa que o operador vê; densidade não é apertar até doer. */
                <tr key={c.id}
                  className="cursor-pointer border-t border-slate-100 odd:bg-[#1e3a5f]/[0.03] hover:bg-[#1e3a5f]/[0.06]"
                  title="Abrir o contrato" onClick={() => setAbertoId(c.id)}>
                  <td className="truncate px-1.5 py-1.5" title={c.parceiroNome}>{c.parceiroNome}</td>
                  <td className="truncate px-1.5 py-1.5" title={c.nome}>
                    {c.nome}
                    {/* ⚠ O STATUS COLADO NO NOME, não em coluna própria: ele é adjetivo do
                        contrato, e uma coluna inteira para três palavras curtas roubava o espaço
                        que os números precisavam. */}
                    <span className={cn('ml-1.5 rounded px-1 py-0.5 text-[9px] font-medium',
                      TOM_STATUS[c.status] ?? 'bg-muted')}>{c.status}</span>
                  </td>
                  {/* ⚠ `whitespace-nowrap` JUNTO COM `truncate`: só o truncate não impede a quebra
                      quando a célula tem largura fixa e o texto tem espaços — e "Permuta ·
                      Cooperativa Agropecuaria de Parapua 1" tem cinco. O nome inteiro no `title`. */}
                  <td className="truncate whitespace-nowrap px-1.5 py-1.5 text-muted-foreground"
                    title={c.contaPermutaNome ?? undefined}>
                    {c.contaPermutaNome ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-1.5 py-1.5 tabular-nums">{dataBR(c.data_abertura)}</td>
                  <td className="whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums text-destructive">
                    {formatMoeda(t.recebido)}
                  </td>
                  <td className="whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums text-success">
                    {formatMoeda(t.entregue)}
                  </td>
                  <td className={cn('whitespace-nowrap px-1.5 py-1.5 text-right font-medium tabular-nums',
                    t.saldo > 0 ? 'text-success' : t.saldo < 0 ? 'text-destructive' : undefined)}>
                    {formatMoeda(t.saldo)}
                  </td>
                  <td className="px-1 py-1.5 text-right">
                    {/* ⚠ `stopPropagation` PORQUE A LINHA INTEIRA ABRE O CONTRATO: sem ele, clicar
                        em editar abriria o detalhe por baixo do modal. */}
                    <button type="button" title="Editar contrato"
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setEditandoId(c.id);
                        setParceiroId(c.parceiro_fornecedor_id); setParceiroNome(c.parceiroNome);
                        setNome(c.nome); setCultura(c.cultura ?? '');
                        setDataAbertura(c.data_abertura?.slice(0, 10) ?? '');
                        setDescricao(c.descricao ?? '');
                        setNovoAberto(true);
                      }}>
                      <Pencil className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── NOVO CONTRATO ── */}
      <Dialog open={novoAberto} onOpenChange={o => { if (!o) setNovoAberto(false); }}>
        <DialogContent className="max-w-md gap-0 p-0 [&>button.absolute]:hidden">
          <div className="bg-primary px-4 py-2.5 text-primary-foreground">
            <h2 className="text-[15px] font-bold leading-tight">
              {editandoId ? 'Editar contrato de barter' : 'Novo contrato de barter'}
            </h2>
            <p className="mt-0.5 text-[11px] text-primary-foreground/80">
              {editandoId
                ? 'Parceiro e cultura não mudam: eles já foram para os lançamentos.'
                : 'A conta de permuta do parceiro nasce junto, se ainda não existir.'}
            </p>
          </div>
          <div className="space-y-2 p-4">
            {/* ⚠ O SELETOR É O DA CASA, e a troca não é estética. O dropdown próprio que estava
                aqui despejava TODOS os fornecedores do cliente sem busca e sem filtro de ativo —
                medido no Proto em 13/09/2026: 3.390 linhas no maior cliente, 838 delas INATIVAS.
                O `FornecedorSelect` busca no servidor (ilike com debounce de 300ms, teto de 50),
                filtra `ativo = true` na própria query e ainda traz o "+" de cadastrar novo. */}
            <FornecedorSelect
              label="Parceiro"
              required
              disabled={!!editandoId}
              fornecedorId={parceiroId || null}
              onFornecedorChange={(id, n) => { setParceiroId(id ?? ''); setParceiroNome(n ?? ''); }}
              clienteId={clienteId ?? ''}
              placeholder="Escolha o fornecedor parceiro"
            />
            <div>
              <Label className="text-[10px]">Nome do contrato <span className="text-destructive">*</span></Label>
              <Input value={nome} onChange={e => setNome(e.target.value)}
                placeholder="Barter Amendoim 25/26" className="mt-0.5 h-8 text-[12px]" />
            </div>
            <div>
              {/* ⚠ A LISTA É `CULTURAS_LANCAMENTO`, a mesma do `LancamentoV2Dialog` e do cadastro
                  de área — e NÃO `useCulturasDaSafra`, que o briefing sugeriu. Aquele hook pede
                  um `safraId`, e o contrato de barter NÃO TEM SAFRA por desenho: ele atravessa
                  safras, o insumo entra numa e o grão sai na seguinte. Sem safra não há como
                  perguntar "o que foi plantado nela"; o que se reusa é o catálogo canônico. */}
              <Label className="text-[10px]">Cultura <span className="text-destructive">*</span></Label>
              <Select value={cultura} onValueChange={setCultura} disabled={!!editandoId}>
                <SelectTrigger className="mt-0.5 h-8 text-[12px]">
                  <SelectValue placeholder="O que este barter negocia" />
                </SelectTrigger>
                <SelectContent>
                  {CULTURAS_LANCAMENTO.map(c => (
                    <SelectItem key={c.valor} value={c.valor} className="text-[12px]">{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                A receita e os insumos herdam esta cultura no resultado — é ela que põe o custo
                da semente na mesma coluna da venda do grão, sem ratear.
              </p>
            </div>
            <div>
              {/* ⚠ EDITÁVEL, E ISSO É CONSERTO: a coluna tem default `CURRENT_DATE`, então todo
                  contrato nascia com a data do dia em que alguém o lançou — não do dia em que foi
                  assinado. E é esta data que o materializador usa como competência do insumo que
                  não informou a sua. */}
              <Label className="text-[10px]">Aberto em</Label>
              <DatePicker value={dataAbertura} onChange={v => setDataAbertura(v ?? '')}
                className="mt-0.5" />
            </div>
            <div>
              <Label className="text-[10px]">Descrição</Label>
              <Input value={descricao} onChange={e => setDescricao(e.target.value)}
                className="mt-0.5 h-8 text-[12px]" />
            </div>
            {/* ⚠ O TEXTO DIZ O QUE O CONTRATO DEFINE, não só o que ele NÃO pede. A frase antiga
                começava pela ausência ("a safra não entra") e o operador saía sem saber que a
                CULTURA entra — que é justamente o campo obrigatório logo acima. */}
            <p className="text-[10px] leading-snug text-muted-foreground">
              O contrato define a <strong>cultura</strong>. A <strong>safra</strong> você informa em
              cada insumo e na venda, porque o insumo pode entrar numa safra e o grão sair na
              seguinte.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 bg-primary px-4 py-2">
            <Button variant="ghost" className="text-primary-foreground/90 hover:bg-white/10 hover:text-white"
              onClick={() => { setNovoAberto(false); setEditandoId(null); }}>Fechar</Button>
            <Button className="gap-1 bg-white text-primary hover:bg-white/90"
              disabled={salvando} onClick={() => { void criar(); }}>
              <Save className="h-4 w-4" />
              {salvando ? 'Salvando…' : editandoId ? 'Salvar contrato' : 'Abrir contrato'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metrica({ rotulo, valor, nota, destaque, cor }: {
  rotulo: string; valor: string; nota?: string; destaque?: boolean; cor?: string;
}) {
  return (
    <div className="min-w-0 rounded-md border bg-card px-2.5 py-1.5">
      <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</div>
      {/* ⚠ O NÚMERO GANHA PESO QUANDO GANHA COR: um valor colorido em 12px normal some ao lado
          do saldo em 16px. Os três cartões de número usam a mesma régua. */}
      <div className={cn('mt-0.5 truncate leading-none tabular-nums',
        destaque ? 'text-[16px] font-medium' : cor ? 'text-[14px] font-medium' : 'text-[12px]',
        cor)}>{valor}</div>
      {nota && <div className="mt-0.5 text-[9px] text-muted-foreground">{nota}</div>}
    </div>
  );
}
