/**
 * RATEIO-HIGINO-01 (Gabriel 17/11) — "Conferir rateio": a relação do contador (papel escaneado) conferida contra os itens que JÁ estão
 * na conta comum. Aberto pelo PAGAMENTO (a transferência para a conta comum). Uma linha por item; o operador digita o valor da relação
 * (100%) e a NF, e escolhe, item a item, fazenda e conta ("manter" o do sistema ou o da relação — nada automático). O que falta entra
 * por "+ Linha da relação". O PDF é anexado UMA vez e ligado a todos. A soma × o pagamento fica visível, nunca ajustada.
 * A regra é a lib pura `conferirRateio`; a gravação é a `gravarConferencia` (writers que já existem). Recorrência nunca é tocada (D2).
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import { DatePicker, formatIsoToBr } from '@/components/ui/date-picker';
import { SearchableSelect, type OpcaoSearchable } from '@/components/ui/searchable-select';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import { Ajuda } from '@/components/ui/ajuda';
import { QUADRO_REGUA, TD_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA } from '@/components/ui/regua-tabela';
import { REGRA_ARQUIVO_DO_DOCUMENTO } from '@/hooks/useLancamentoDocumentos';
import { reais } from '@/lib/financeiro/nfe/formatos';
import { desfazerCompletar } from '@/lib/financeiro/nfeConsultas';
import { cn } from '@/lib/utils';
import {
  conferencia, itensNovos, pedidoDoCompletar, situacaoDaLinha, PARTE_PADRAO_PCT,
  type ItemDoRateio, type LinhaDaRelacao, type SituacaoDaLinha,
} from '@/lib/financeiro/rateio/conferirRateio';
import { gravarConferencia, lerItensDoRateio, type CriarItem, type PagamentoDoRateio } from '@/lib/financeiro/rateio/rateioNoBanco';

export interface FazendaDoRateio { id: string; codigo: string | null; nome: string }
export interface ContaDoPlano { id: string; subcentro: string | null; centro_custo: string | null; tipo_operacao: string | null }

interface Props {
  clienteId: string;
  pagamento: PagamentoDoRateio;
  nomeDaConta: string;
  fazendas: readonly FazendaDoRateio[];
  contasDoPlano: readonly ContaDoPlano[];
  criarItem: CriarItem;
  onClose: () => void;
  onGravou: (ids: string[]) => void;
}

/* colunas medidas: nada corta (o texto longo vai no title, com "…") */
const COLS = [76, 0, 100, 196, 84, 126, 76, 92, 160, 30];
const CABECALHO = ['Venc.', 'Descrição', 'Fazenda', 'Conta', 'No sistema', 'Relação (100%)', '50%', 'NF', 'Situação', ''];
const NUMERICAS = new Set([4, 5, 6]);

const linhaDoItem = (i: ItemDoRateio): LinhaDaRelacao => ({
  chave: i.id, itemId: i.id, valorCheioCent: null, nf: null, fazendaId: i.fazendaId, planoContaId: i.planoContaId,
  descricao: i.descricao, vencimento: i.vencimento, competencia: i.competencia, escolha: 'manter',
});
let seqNova = 0;
const linhaNova = (vencimento: string): LinhaDaRelacao => {
  seqNova += 1;
  return { chave: `nova-${seqNova}`, itemId: null, valorCheioCent: null, nf: null, fazendaId: null, planoContaId: null, descricao: '',
    vencimento, competencia: vencimento, escolha: 'relacao' };
};

const COR: Record<SituacaoDaLinha['tipo'], string> = {
  confere: 'bg-emerald-50 text-emerald-800', muda: 'bg-sky-50 text-sky-800', travado: 'bg-amber-50 text-amber-900',
  falta: 'text-muted-foreground', nova: 'bg-rose-50 text-rose-800',
};

export function ConferirRateioDialog({ clienteId, pagamento, nomeDaConta, fazendas, contasDoPlano, criarItem, onClose, onGravou }: Props) {
  const [itens, setItens] = useState<Map<string, ItemDoRateio>>(new Map());
  const [linhas, setLinhas] = useState<LinhaDaRelacao[]>([]);
  const [outros, setOutros] = useState<ItemDoRateio[]>([]);
  const [lendo, setLendo] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [gravando, setGravando] = useState(false);

  useEffect(() => {
    let vivo = true;
    void lerItensDoRateio(clienteId, pagamento).then((r) => {
      if (!vivo) return;
      setLendo(false);
      if (r.ok === false) { setErro(r.motivo); return; }
      setItens(new Map([...r.valor.desta, ...r.valor.outros].map((i) => [i.id, i])));
      setLinhas(r.valor.desta.map(linhaDoItem));
      setOutros(r.valor.outros);
    });
    return () => { vivo = false; };
  }, [clienteId, pagamento]);

  const opcoesConta = useMemo<OpcaoSearchable[]>(() => contasDoPlano
    .filter((c) => (c.tipo_operacao ?? '').startsWith('2'))
    .map((c) => ({ value: c.id, label: `${c.subcentro ?? '—'}`, hint: c.centro_custo ?? undefined })), [contasDoPlano]);
  const opcoesFazenda = useMemo<OpcaoSearchable[]>(() => fazendas.map((f) => ({ value: f.id, label: f.codigo || f.nome, hint: f.codigo ? f.nome : undefined })), [fazendas]);
  const nomeDaContaDoPlano = (id: string | null) => contasDoPlano.find((c) => c.id === id)?.subcentro ?? '—';
  const codigoDaFazenda = (id: string | null) => { const f = fazendas.find((x) => x.id === id); return f ? (f.codigo || f.nome) : '—'; };

  const mudar = (chave: string, f: (l: LinhaDaRelacao) => LinhaDaRelacao) => { setErro(null); setLinhas((ls) => ls.map((l) => (l.chave === chave ? f(l) : l))); };
  /* fazenda/conta: trocar no seletor É a escolha "usar a relação"; voltar ao do sistema é "manter" */
  const escolher = (l: LinhaDaRelacao, campo: 'fazendaId' | 'planoContaId', valor: string) => mudar(l.chave, (x) => {
    const n = { ...x, [campo]: valor };
    const it = x.itemId ? itens.get(x.itemId) : undefined;
    if (!it) return n;
    const difere = n.fazendaId !== it.fazendaId || n.planoContaId !== it.planoContaId;
    return { ...n, escolha: difere ? 'relacao' : 'manter' };
  });
  const manter = (l: LinhaDaRelacao) => mudar(l.chave, (x) => {
    const it = x.itemId ? itens.get(x.itemId) : undefined;
    return it ? { ...x, fazendaId: it.fazendaId, planoContaId: it.planoContaId, escolha: 'manter' } : x;
  });
  const puxar = (i: ItemDoRateio) => { setOutros((o) => o.filter((x) => x.id !== i.id)); setLinhas((ls) => [...ls, linhaDoItem(i)]); };
  const tirar = (l: LinhaDaRelacao) => {
    setLinhas((ls) => ls.filter((x) => x.chave !== l.chave));
    const it = l.itemId ? itens.get(l.itemId) : undefined;
    if (it) setOutros((o) => [...o, it]);
  };

  const situacoes = useMemo(() => new Map(linhas.map((l) => [l.chave, situacaoDaLinha(l, l.itemId ? itens.get(l.itemId) ?? null : null)])), [linhas, itens]);
  const pedido = useMemo(() => pedidoDoCompletar(linhas, itens), [linhas, itens]);
  const novos = useMemo(() => itensNovos(linhas), [linhas]);
  const conf = useMemo(() => conferencia(linhas, itens, pagamento.valorCent), [linhas, itens, pagamento.valorCent]);
  const temOQueGravar = pedido.length > 0 || novos.prontos.length > 0 || !!arquivo;
  const pode = !lendo && !gravando && temOQueGravar && novos.incompletos.length === 0;

  const gravar = async () => {
    if (!pode) return;
    setGravando(true); setErro(null);
    try {
      const conferidos = linhas.filter((l) => l.itemId && l.valorCheioCent != null).map((l) => l.itemId).filter((x): x is string => !!x);
      const r = await gravarConferencia(clienteId, pagamento.id, pedido, novos.prontos, conferidos, arquivo, criarItem);
      if (r.ok === false) { setErro(r.motivo); return; }
      const { mudaram, criados, operacao, documentoGravado } = r.valor;
      const partes = [mudaram ? `${mudaram} atualizado${mudaram === 1 ? '' : 's'}` : '', criados.length ? `${criados.length} criado${criados.length === 1 ? '' : 's'}` : '',
        arquivo ? (documentoGravado ? 'relação anexada' : 'a relação não anexou') : ''].filter(Boolean);
      toast.success(`Rateio conferido: ${partes.join(' · ')}`, operacao ? {
        action: { label: 'Desfazer', onClick: () => { void desfazerCompletar(operacao).then((e) => (e ? toast.error(e) : toast.success('Desfeito'))); } },
      } : undefined);
      onGravou([...pedido.map((p) => p.id), ...criados, pagamento.id]);
      onClose();
    } finally { setGravando(false); }
  };

  const colgroup = <colgroup>{COLS.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}</colgroup>;

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !gravando) onClose(); }}>
      <DialogContent className="flex h-[min(640px,95vh)] w-[min(1180px,97vw)] max-w-none flex-col gap-0 overflow-hidden p-0" data-testid="conferir-rateio">
        <div className="flex h-9 shrink-0 items-center gap-2 bg-primary px-3.5 pr-10">
          <DialogTitle className="text-[13px] font-semibold leading-none text-primary-foreground">Conferir rateio</DialogTitle>
          <DialogDescription className="sr-only">Confere a relação do rateio contra os itens da conta comum, linha a linha.</DialogDescription>
          <Ajuda titulo="Conferir rateio" lado="bottom"
            oQueE="A relação do contador conferida contra os itens que já estão na conta comum: o valor da relação (100%) vira a sua parte (50%)."
            porQue="O DRE por fazenda e por conta vem dos itens; o pagamento só leva o dinheiro para a conta comum (fora do DRE)."
            comoFazer="Digite o valor e a NF de cada linha do papel. Fazenda e conta mudam só se você escolher. O que falta, + Linha da relação. A diferença com o pagamento fica à vista." />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 bg-muted p-2 text-[10.5px]">
          <div className="flex h-6 shrink-0 items-center gap-4 rounded-md border bg-card px-2.5 tabular-nums" data-testid="rateio-cabecalho">
            <b className="min-w-0 truncate" title={pagamento.descricao ?? undefined}>{pagamento.descricao ?? 'Pagamento'}</b>
            <span className="shrink-0">{formatIsoToBr(pagamento.vencimento)}</span>
            <span className="shrink-0">R$ {reais(pagamento.valorCent)}</span>
            <span className="shrink-0 text-muted-foreground">para {nomeDaConta}</span>
            <span className="shrink-0 text-muted-foreground">parte {PARTE_PADRAO_PCT}%</span>
          </div>
          <div className={cn(QUADRO_REGUA, 'min-h-0 flex-1')}>
            <div className="min-h-0 flex-1 overflow-auto" data-testid="rateio-rolagem">
              <table className="w-full min-w-[1060px] table-fixed border-collapse">
                {colgroup}
                <thead className="sticky top-0 z-10 bg-primary">
                  <tr>{CABECALHO.map((h, i) => <th key={i} className={cn(TH_REGUA, NUMERICAS.has(i) ? 'text-right' : 'text-left')}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {lendo && <tr><td colSpan={10} className={cn(TD_REGUA, 'text-muted-foreground')}>Lendo os itens da conta comum…</td></tr>}
                  {!lendo && !linhas.length && <tr><td colSpan={10} className={cn(TD_REGUA, 'text-muted-foreground')}>Nenhum item desta relação no mês. Puxe dos outros abaixo ou + Linha da relação.</td></tr>}
                  {linhas.map((l) => {
                    const it = l.itemId ? itens.get(l.itemId) : undefined;
                    const s = situacoes.get(l.chave);
                    const difere = !!it && (l.fazendaId !== it.fazendaId || l.planoContaId !== it.planoContaId);
                    return (
                      <tr key={l.chave} className="h-[24px] border-b border-border/50" data-testid="rateio-linha" data-situacao={s?.tipo}>
                        <td className={TD_REGUA}>{it ? formatIsoToBr(it.vencimento ?? '') : (
                          <DatePicker size="compact" value={l.vencimento ?? ''} onChange={(v) => mudar(l.chave, (x) => ({ ...x, vencimento: v, competencia: v }))} />)}</td>
                        <td className={TD_REGUA_TEXTO} title={l.descricao ?? undefined}>{it ? (l.descricao ?? '—') : (
                          <Input value={l.descricao ?? ''} onChange={(e) => mudar(l.chave, (x) => ({ ...x, descricao: e.target.value }))} placeholder="Histórico da relação" className="h-[20px] px-1 text-[10px]" data-testid="rateio-nova-descricao" />)}</td>
                        <td className={TD_REGUA} title={[codigoDaFazenda(l.fazendaId), it && l.fazendaId !== it.fazendaId ? `no sistema: ${codigoDaFazenda(it.fazendaId)}` : ''].filter(Boolean).join(' · ')}>
                          <SearchableSelect value={l.fazendaId ?? ''} onValueChange={(v) => escolher(l, 'fazendaId', v)} options={opcoesFazenda} semTodos dense
                            placeholder="Fazenda" triggerClassName={cn('h-[20px] text-[10px]', it && l.fazendaId !== it.fazendaId && 'border-amber-500')} />
                        </td>
                        <td className={TD_REGUA} title={nomeDaContaDoPlano(l.planoContaId)}>
                          <SearchableSelect value={l.planoContaId ?? ''} onValueChange={(v) => escolher(l, 'planoContaId', v)} options={opcoesConta} semTodos dense
                            placeholder="Conta" triggerClassName={cn('h-[20px] text-[10px]', it && l.planoContaId !== it.planoContaId && 'border-amber-500')} />
                        </td>
                        <td className={TD_REGUA_NUM} title={it?.pago ? 'pago: valor não muda' : undefined}>{it ? reais(it.valorCent) : '—'}</td>
                        <td className={TD_REGUA}>
                          <CampoMoeda valor={l.valorCheioCent == null ? null : l.valorCheioCent / 100} onChange={(n) => mudar(l.chave, (x) => ({ ...x, valorCheioCent: n == null ? null : Math.round(n * 100) }))} className="h-[20px] text-[10px]" />
                        </td>
                        <td className={cn(TD_REGUA_NUM, s?.difCent && 'text-amber-700')} title={s?.difCent ? `diferença ${reais(s.difCent)}` : undefined} data-testid="rateio-parte">{s?.parteCent == null ? '—' : reais(s.parteCent)}</td>
                        <td className={TD_REGUA}>
                          <Input value={l.nf ?? ''} onChange={(e) => mudar(l.chave, (x) => ({ ...x, nf: e.target.value || null }))} placeholder={it?.numeroDocumento ?? 'nº'} className="h-[20px] px-1 text-[10px] tabular-nums" title={it?.numeroDocumento ? `hoje: ${it.numeroDocumento}` : undefined} data-testid="rateio-nf" />
                        </td>
                        <td className={TD_REGUA}>
                          <div className="flex items-center gap-1">
                            <span className={cn('min-w-0 truncate rounded px-1 leading-[16px]', s ? COR[s.tipo] : '')} title={[s?.frase, difere && it ? `no sistema: ${codigoDaFazenda(it.fazendaId)} · ${nomeDaContaDoPlano(it.planoContaId)}` : ''].filter(Boolean).join(' · ')} data-testid="rateio-situacao">{s?.frase ?? '—'}</span>
                            {difere && <button type="button" className="shrink-0 text-[9.5px] text-primary underline" onClick={() => manter(l)} data-testid="rateio-manter">manter</button>}
                          </div>
                        </td>
                        <td className={TD_REGUA}><button type="button" className="text-muted-foreground hover:text-destructive" title={it ? 'não é desta relação (vai para os outros do mês)' : 'tirar a linha nova'} onClick={() => tirar(l)} data-testid="rateio-tirar">✕</button></td>
                      </tr>
                    );
                  })}
                  {!!outros.length && <tr><td colSpan={10} className={cn(TD_REGUA, 'bg-muted/60 font-medium')}>Outros do mês na {nomeDaConta} ({outros.length})</td></tr>}
                  {outros.map((i) => (
                    <tr key={i.id} className="border-b border-border/50 text-muted-foreground" data-testid="rateio-outro">
                      <td className={TD_REGUA}>{formatIsoToBr(i.vencimento ?? '')}</td>
                      <td className={TD_REGUA_TEXTO} title={i.descricao ?? undefined}>{i.descricao ?? '—'}</td>
                      <td className={TD_REGUA_TEXTO}>{codigoDaFazenda(i.fazendaId)}</td>
                      <td className={TD_REGUA_TEXTO} title={nomeDaContaDoPlano(i.planoContaId)}>{nomeDaContaDoPlano(i.planoContaId)}</td>
                      <td className={TD_REGUA_NUM}>{reais(i.valorCent)}</td>
                      <td colSpan={4} className={TD_REGUA_TEXTO} title={i.numeroDocumento ?? undefined}>{i.numeroDocumento ?? ''}</td>
                      <td className={TD_REGUA}><button type="button" className="text-primary" title="é desta relação" onClick={() => puxar(i)} data-testid="rateio-puxar">＋</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex h-[26px] shrink-0 items-center gap-2">
            <Button type="button" size="sm" variant="outline" className="h-[24px] shrink-0 px-2.5 text-[10.5px]" onClick={() => setLinhas((ls) => [...ls, linhaNova(pagamento.vencimento)])} data-testid="rateio-nova">+ Linha da relação</Button>
            <AreaDeArquivo regra={REGRA_ARQUIVO_DO_DOCUMENTO} onArquivos={(a) => setArquivo(a[0] ?? null)} convite="Anexe a relação (PDF)" detalhe=""
              conteudo={arquivo ? arquivo.name : undefined} tituloDoConteudo={arquivo?.name} onRemover={arquivo ? () => setArquivo(null) : undefined}
              className="h-[24px] min-w-0 flex-1" testId="rateio-arquivo" />
          </div>
          <div className="grid h-[24px] shrink-0 grid-cols-[1fr_1fr_1fr_1fr] items-center gap-2 rounded-md border bg-card px-2.5 tabular-nums" data-testid="rateio-conferencia">
            <span title="a soma das partes (50%) das linhas conferidas">Relação (50%) <b>{reais(conf.relacaoCent)}</b> · {conf.conferidas}/{conf.linhas}</span>
            <span title="os itens como ficam depois de gravar">Itens <b>{reais(conf.itensCent)}</b></span>
            <span>Pagamento <b>{reais(conf.pagamentoCent)}</b></span>
            <span className={cn(conf.difCent !== 0 && 'font-semibold text-amber-700')} title="pagamento − itens: fica visível, nunca se ajusta" data-testid="rateio-diferenca">Diferença {reais(conf.difCent)}</span>
          </div>
        </div>
        <div className="flex h-9 shrink-0 items-center gap-2 border-t bg-card px-3 text-[10.5px]">
          <span className="min-w-0 truncate text-destructive" data-testid="rateio-erro" title={erro ?? (novos.incompletos.length ? 'Linha nova sem valor, fazenda, conta, vencimento ou histórico.' : undefined)}>
            {erro ? `⚠ ${erro}` : novos.incompletos.length ? `⚠ ${novos.incompletos.length} linha${novos.incompletos.length === 1 ? '' : 's'} nova${novos.incompletos.length === 1 ? '' : 's'} incompleta${novos.incompletos.length === 1 ? '' : 's'}` : ''}
          </span>
          <span className="ml-auto" />
          <Button type="button" size="sm" variant="outline" className="h-[24px] shrink-0 px-2.5 text-[10.5px]" disabled={gravando} onClick={onClose}>Cancelar</Button>
          <Button type="button" size="sm" className="h-[24px] w-[150px] shrink-0 px-2.5 text-[10.5px]" disabled={!pode} onClick={() => { void gravar(); }} data-testid="rateio-gravar">
            {gravando ? 'Gravando…' : 'Gravar conferência'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
