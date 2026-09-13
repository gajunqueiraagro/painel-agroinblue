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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, ArrowLeft, Handshake, Save, Pencil, Trash2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatMoeda } from '@/lib/calculos/formatters';
import { useBarterContratos, useFornecedoresDoCliente, type ContratoNaLista } from '@/hooks/useBarterContratos';
import { useBarterInsumos, type BarterInsumo, type InsumoPayload } from '@/hooks/useBarterInsumos';
import { BarterInsumoModal } from '@/components/agri/BarterInsumoModal';
import { useFinanceiroV2 } from '@/hooks/useFinanceiroV2';
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

/** Um bloco que ainda não existe — e que diz qual fatia o trará. */
function AindaNao({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="rounded-md border border-dashed p-4">
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</div>
      <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{descricao}</p>
    </div>
  );
}

export function AgriBarterTab() {
  const { clienteAtual } = useCliente();
  const { fazendaAtual } = useFazenda();
  const clienteId = clienteAtual?.id ?? null;
  const { contratos, carregando, abrir } = useBarterContratos(clienteId);
  const fornecedores = useFornecedoresDoCliente(clienteId);

  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [parceiroId, setParceiroId] = useState('');
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const contrato = useMemo(
    () => contratos.find(c => c.id === abertoId) ?? null, [contratos, abertoId]);

  /* ── A PERNA RECEBI (fatia B) ── */
  const { insumos, salvar: salvarInsumo, excluir: excluirInsumo, total: totalInsumos } =
    useBarterInsumos(clienteId, abertoId);
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
  useEffect(() => { void fin.loadClassificacoes(); }, [fin.loadClassificacoes]);
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

  const criar = async () => {
    if (!parceiroId) { toast.error('Escolha o parceiro do contrato.'); return; }
    if (!nome.trim()) { toast.error('Dê um nome ao contrato.'); return; }
    setSalvando(true);
    try {
      const r = await abrir(parceiroId, nome.trim(), fazendaAtual?.id ?? null, descricao.trim() || null);
      if (!r.ok) { toast.error(r.erro ?? 'Não foi possível abrir o contrato.'); return; }
      /* ⚠ A MENSAGEM SEGUE `conta_criada`, que agora diz a verdade (AGRI-BARTER-03C): anunciar
         "conta criada" ao reusar a do parceiro faria o operador procurar uma segunda conta que
         não existe — e a trava do banco garante que ela não exista mesmo. */
      const parceiro = fornecedores.find(f => f.id === parceiroId)?.nome ?? 'parceiro';
      toast.success(r.abertura?.conta_criada
        ? `Contrato aberto. A conta "Permuta · ${parceiro}" foi criada.`
        : `Contrato aberto na conta de permuta que já existia com ${parceiro}.`);
      setNovoAberto(false);
      setParceiroId(''); setNome(''); setDescricao('');
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
            <p className="text-xs text-muted-foreground">
              {contrato.parceiroNome} · aberto em {dataBR(contrato.data_abertura)}
            </p>
          </div>
          <div className="flex-1" />
          <span className={cn('rounded px-2 py-0.5 text-[10px] font-medium', TOM_STATUS[contrato.status] ?? 'bg-muted')}>
            {contrato.status}
          </span>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-1.5 md:grid-cols-4">
          <Metrica rotulo="Parceiro" valor={contrato.parceiroNome} />
          {/* ⚠ O NOME DA CONTA, NUNCA O ID: sem UUID na tela, e o nome já é único por parceiro
              (índice `uq_conta_permuta_por_parceiro`). */}
          <Metrica rotulo="Conta de permuta" valor={contrato.contaPermutaNome ?? '—'} />
          {/* ⚠ O NÚMERO É PARCIAL E DIZ ISSO. A perna do grão é a fatia C: enquanto ela não
              existe, "entregue" é zero DE VERDADE — nada foi entregue neste sistema —, e o
              saldo negativo é a leitura correta do contrato, não um defeito de tela. */}
          <Metrica rotulo="Recebido (insumos)" valor={formatMoeda(totalInsumos)}
            nota={`${insumos.length} ${insumos.length === 1 ? 'insumo' : 'insumos'}`} />
          <Metrica rotulo="Saldo" valor={formatMoeda(-totalInsumos)}
            nota={totalInsumos > 0 ? 'deve ao parceiro · entregue (fatia C) − recebido' : 'entregue − recebido'}
            destaque />
        </div>

        <div className="grid min-h-0 flex-1 gap-2 md:grid-cols-2">
          {/* ── RECEBI (fatia B) ─────────────────────────────────────────────────────────
              ⚠ O CABEÇALHO E O TOTAL FICAM; SÓ O CORPO ROLA (A21). O `min-h-0` na coluna é o
              que dá altura ao scrollport interno — sem ele o `sticky` das células sobe junto
              com a página, que é o erro já cometido duas vezes na casa. */}
          <div className="flex min-h-0 flex-col overflow-hidden rounded-md border">
            <div className="flex shrink-0 items-center gap-2 border-b bg-muted/40 px-2 py-1">
              <div className="text-[11px] font-bold uppercase tracking-wide">Recebi (insumos)</div>
              <div className="flex-1" />
              <Button size="sm" variant="outline" className="h-6 gap-1 px-1.5 text-[10px]"
                onClick={() => { setInsumoAberto(null); setModalInsumo(true); }}>
                <Plus className="h-3 w-3" /> Adicionar insumo
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full table-fixed border-collapse text-[10px] leading-tight">
                <colgroup>
                  {['30%', '13%', '17%', '15%', '17%', '8%'].map((w, i) => <col key={i} style={{ width: w }} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th className={cn(TH, 'text-left')}>Produto</th>
                    <th className={cn(TH, 'text-left')}>NF</th>
                    <th className={cn(TH, 'text-right')}>Quantidade</th>
                    <th className={cn(TH, 'text-left')}>Safra</th>
                    <th className={cn(TH, 'text-right')}>Valor</th>
                    <th className={cn(TH, 'text-right')} />
                  </tr>
                </thead>
                <tbody>
                  {insumos.length === 0 && (
                    <tr><td colSpan={6} className="px-2 py-6 text-center text-[10px] text-muted-foreground">
                      Nenhum insumo lançado. O que a cooperativa entregou entra aqui.
                    </td></tr>
                  )}
                  {insumos.map(i => (
                    <tr key={i.id} className="border-t border-slate-100 odd:bg-[#1e3a5f]/[0.03]">
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
            </div>
            {/* ⚠ O TOTAL FORA DA TABELA, não em `tfoot`: com `border-collapse` o `sticky` não
                gruda em `<tfoot>` nem em `<tr>`, só na célula — e aqui a régua fica mais
                simples do lado de fora do scrollport, onde não há o que grudar. */}
            <div className="flex shrink-0 items-center justify-between border-t bg-primary px-2 py-1
              text-[10px] font-semibold text-primary-foreground">
              <span>Total recebido</span>
              <span className="tabular-nums">{formatMoeda(totalInsumos)}</span>
            </div>
          </div>

          <AindaNao titulo="Entreguei (grão)"
            descricao="A venda do grão, ligada às cargas da colheita por classe de aflatoxina e preço por saca. Entra na fatia C." />
        </div>
        <AindaNao titulo="Materializar"
          descricao="Gerar os lançamentos no DRE — receita da venda e custo do insumo, na conta de permuta, sem tocar no caixa — e o estorno que desfaz. Entra na fatia D." />

        <BarterInsumoModal
          aberto={modalInsumo}
          insumo={insumoAberto}
          safras={safras}
          classificacoes={fin.classificacoes}
          salvando={salvandoInsumo}
          onFechar={() => { setModalInsumo(false); setInsumoAberto(null); }}
          onSalvar={p => void gravarInsumo(p)}
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
          <p className="text-xs text-muted-foreground">{clienteAtual?.nome ?? '—'}</p>
        </div>
        <Button size="sm" className="h-8 gap-1 text-[11px]" onClick={() => setNovoAberto(true)}>
          <Plus className="h-3.5 w-3.5" /> Novo contrato
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <table className="w-full table-fixed border-collapse text-[10px] leading-tight">
          <colgroup>
            {['26%', '30%', '16%', '14%', '14%'].map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr>
              {['Parceiro', 'Contrato', 'Conta de permuta', 'Abertura', 'Status'].map(h => (
                <th key={h} className={cn(TH, 'text-left')}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!carregando && contratos.length === 0 && (
              <tr><td colSpan={5} className="px-2 py-6 text-center text-[11px] text-muted-foreground">
                <Handshake className="mx-auto mb-1 h-5 w-5 opacity-40" />
                Nenhum contrato de barter. O primeiro cria a conta de permuta do parceiro.
              </td></tr>
            )}
            {contratos.map((c: ContratoNaLista) => (
              <tr key={c.id}
                className="cursor-pointer border-t border-slate-100 odd:bg-[#1e3a5f]/[0.03] hover:bg-[#1e3a5f]/[0.06]"
                title="Abrir o contrato" onClick={() => setAbertoId(c.id)}>
                <td className="truncate px-1.5 py-0.5" title={c.parceiroNome}>{c.parceiroNome}</td>
                <td className="truncate px-1.5 py-0.5" title={c.nome}>{c.nome}</td>
                <td className="truncate px-1.5 py-0.5 text-muted-foreground" title={c.contaPermutaNome ?? undefined}>
                  {c.contaPermutaNome ?? '—'}
                </td>
                <td className="whitespace-nowrap px-1.5 py-0.5 tabular-nums">{dataBR(c.data_abertura)}</td>
                <td className="px-1.5 py-0.5">
                  <span className={cn('rounded px-1 py-0.5 text-[9px] font-medium',
                    TOM_STATUS[c.status] ?? 'bg-muted')}>{c.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── NOVO CONTRATO ── */}
      <Dialog open={novoAberto} onOpenChange={o => { if (!o) setNovoAberto(false); }}>
        <DialogContent className="max-w-md gap-0 p-0 [&>button.absolute]:hidden">
          <div className="bg-primary px-4 py-2.5 text-primary-foreground">
            <h2 className="text-[15px] font-bold leading-tight">Novo contrato de barter</h2>
            <p className="mt-0.5 text-[11px] text-primary-foreground/80">
              A conta de permuta do parceiro nasce junto, se ainda não existir.
            </p>
          </div>
          <div className="space-y-2 p-4">
            <div>
              <Label className="text-[10px]">Parceiro <span className="text-destructive">*</span></Label>
              <Select value={parceiroId} onValueChange={setParceiroId}>
                <SelectTrigger className="mt-0.5 h-8 text-[12px]">
                  <SelectValue placeholder="Escolha o fornecedor parceiro" />
                </SelectTrigger>
                <SelectContent>
                  {fornecedores.map(f => (
                    <SelectItem key={f.id} value={f.id} className="text-[12px]">{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px]">Nome do contrato <span className="text-destructive">*</span></Label>
              <Input value={nome} onChange={e => setNome(e.target.value)}
                placeholder="Barter Amendoim 25/26" className="mt-0.5 h-8 text-[12px]" />
            </div>
            <div>
              <Label className="text-[10px]">Descrição</Label>
              <Input value={descricao} onChange={e => setDescricao(e.target.value)}
                className="mt-0.5 h-8 text-[12px]" />
            </div>
            {/* ⚠ A SAFRA NÃO SE PEDE AQUI, e é decisão de modelo: ela vive em CADA PERNA, porque
                o barter atravessa safras — o insumo entra numa e o grão sai na seguinte. */}
            <p className="text-[10px] leading-snug text-muted-foreground">
              A safra não entra no contrato: cada perna tem a sua, porque o insumo costuma entrar
              numa safra e o grão sair na seguinte.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 bg-primary px-4 py-2">
            <Button variant="ghost" className="text-primary-foreground/90 hover:bg-white/10 hover:text-white"
              onClick={() => setNovoAberto(false)}>Fechar</Button>
            <Button className="gap-1 bg-white text-primary hover:bg-white/90"
              disabled={salvando} onClick={() => { void criar(); }}>
              <Save className="h-4 w-4" /> {salvando ? 'Abrindo…' : 'Abrir contrato'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metrica({ rotulo, valor, nota, destaque }: {
  rotulo: string; valor: string; nota?: string; destaque?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-md border bg-card px-2.5 py-1.5">
      <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</div>
      <div className={cn('mt-0.5 truncate leading-none',
        destaque ? 'text-[16px] font-medium tabular-nums' : 'text-[12px]')}>{valor}</div>
      {nota && <div className="mt-0.5 text-[9px] text-muted-foreground">{nota}</div>}
    </div>
  );
}
