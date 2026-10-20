import { useState } from 'react';
import { MoreHorizontal, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatNum } from '@/lib/calculos/formatters';
import {
  linhasDaEntrega, totaisDaEntrega, precoDoContrato, itensEnviarTodos, datasFaltando, rotuloDaSituacao, VOCABULARIO_ENTREGA,
  type SituacaoDaLinha,
} from '@/lib/oc/entregasPorLote';
import type { RecebimentoApi, LoteRecebimento, SaidaAdotavel } from '@/hooks/useOperacaoRecebimento';
import type { LadoContaCorrente } from '@/lib/oc/contaCorrente';
import { cn } from '@/lib/utils';

/* OC-ENTREGA-COMPACTA-01 (Gabriel, 15/10/2026) — A TABELA UNICA DA ABA ENTREGA/RECEBIMENTO, nos tres tipos (abate, venda,
   compra) e nos dois estados (aberta, encerrada). Saiu a lista de lotes em duas linhas e a tabela "Movimentacoes registradas".
   ⚠ A TELA SO' DESENHA: linhas, total e numeros sao de `linhasDaEntrega` / `totaisDaEntrega` (src/lib/oc/entregasPorLote.ts);
     as palavras, de `VOCABULARIO_ENTREGA`.
   ⚠ UMA LINHA POR REGISTRO: linha de 22px, cabecalho de 20px, nada quebra; texto que nao cabe corta com o inteiro no `title`;
     numero e data nunca cortam (colunas medidas). Mais de 12 linhas: so' o corpo rola, cabecalho e total parados.
   ⚠ ACOES (so' com a entrega aberta): venda e compra — "⋯" na saida (desvincular a adotada, estornar a registrada) e
     "<verbo> ▾" na linha que falta (Adotar · Registrar nova); abate — "estornar" e "<verbo>" diretos. O 📎 do documento do
     lote fica onde ja' existia (o abate). Menu e seletor abrem POR CIMA (dropdown e dialogo): nada empurra a tabela. */

const fmtBr = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');
const idCurto = (id: string) => id.slice(0, 8);
const fmtDif = (n: number | null) => (n == null ? '' : n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

/** A regua (px). UI-SEM-CORTE-02 — TODAS as colunas tem largura (a Categoria pelo conteudo: 104px cabem "Desmama Machos" e
 *  "Bezerros Machos" a 10px) e a tabela tem a largura da regua (`LARGURA_DA_ENTREGA`): a sobra fica a' direita, nunca dentro
 *  da Categoria. Data em dd/mm/aaaa (72px, medido na bancada: a 66 ainda cortava). */
export const COLUNAS_DA_ENTREGA: { chave: string; rotulo: string; largura: number | null; alinha: 'esq' | 'dir' | 'centro' }[] = [
  { chave: 'lote', rotulo: 'Lote', largura: 34, alinha: 'centro' },
  { chave: 'categoria', rotulo: 'Categoria', largura: 104, alinha: 'esq' },
  { chave: 'negCab', rotulo: 'Neg. cab', largura: 50, alinha: 'dir' },
  { chave: 'negKg', rotulo: 'Neg. kg', largura: 54, alinha: 'dir' },
  { chave: 'data', rotulo: 'Data', largura: 72, alinha: 'centro' },
  { chave: 'cab', rotulo: 'Cab', largura: 40, alinha: 'dir' },
  { chave: 'kgMed', rotulo: 'Kg méd.', largura: 54, alinha: 'dir' },
  { chave: 'dif', rotulo: 'Dif.', largura: 38, alinha: 'dir' },
  { chave: 'valor', rotulo: 'Valor R$', largura: 80, alinha: 'dir' },
  { chave: 'situacao', rotulo: 'Situação', largura: 66, alinha: 'esq' },
  { chave: 'acoes', rotulo: 'Ações', largura: 72, alinha: 'centro' },
];
export const LARGURA_DA_ENTREGA = COLUNAS_DA_ENTREGA.reduce((n, c) => n + (c.largura ?? 0), 0);
export const ALTURA_LINHA_ENTREGA = 22;
export const ALTURA_CABECALHO_ENTREGA = 20;
export const LINHAS_VISIVEIS_ENTREGA = 12;
const ALINHA: Record<'esq' | 'dir' | 'centro', string> = { esq: 'text-left', dir: 'text-right tabular-nums', centro: 'text-center tabular-nums' };
const TD = 'h-[22px] overflow-hidden text-ellipsis whitespace-nowrap px-1 py-0 text-[10px] leading-[22px]';
const TH = 'h-[20px] overflow-hidden whitespace-nowrap px-1 py-0 text-[9.5px] font-medium leading-[20px]';
const TOM_SITUACAO: Record<SituacaoDaLinha, string> = {
  feita: 'text-emerald-700', parcial: 'text-blue-700', falta: 'text-amber-700 font-medium',
};
const ACAO = 'text-[10px] text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline';

interface Props {
  api: RecebimentoApi;
  catLabel: (slug: string | null | undefined) => string;
  readOnly: boolean;
  lado?: LadoContaCorrente;
  /** venda e compra: adotar a saida/entrada ja' lancada; o abate registra direto. */
  comAdocao?: boolean;
  fazendaNome?: string | null;
  contraparteNome?: string | null;
  onRegistrarNova: (loteId: string) => void;
  onEstornar: (movimentacaoId: string) => void;
  /** O 📎 do documento do lote (onde ja' existia: o abate). Ausente = sem 📎. */
  onDocumento?: (loteId: string) => void;
  /** Recusa do banco (desvincular): o pai a escreve na linha do aviso, nunca em toast. */
  onRecusa?: (mensagem: string | null) => void;
}

export function EntregasVendaTabela({
  api, catLabel, readOnly, lado = 'venda', comAdocao = true, fazendaNome = null, contraparteNome = null,
  onRegistrarNova, onEstornar, onDocumento, onRecusa,
}: Props) {
  const v = VOCABULARIO_ENTREGA[lado];
  const [loteAdotando, setLoteAdotando] = useState<LoteRecebimento | null>(null);
  const [saidas, setSaidas] = useState<SaidaAdotavel[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [erroSeletor, setErroSeletor] = useState<string | null>(null);

  const linhas = linhasDaEntrega(api.lotes, api.movimentacoes);
  const tot = totaisDaEntrega(api.lotes, api.movimentacoes);

  const abrirSeletor = async (lote: LoteRecebimento) => {
    setLoteAdotando(lote); setMarcadas(new Set()); setErroSeletor(null); setSaidas([]); setCarregando(true);
    const r = await api.listarAdotaveis(lote.loteId);
    setSaidas(r.saidas); setErroSeletor(r.erro); setCarregando(false);
  };
  const fecharSeletor = () => { setLoteAdotando(null); setMarcadas(new Set()); setErroSeletor(null); setSaidas([]); };
  const alternar = (id: string) => setMarcadas(prev => {
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
  const confirmarAdocao = async () => {
    if (!loteAdotando) return;
    if (marcadas.size === 0) { setErroSeletor(`Selecione ao menos uma ${v.mov}.`); return; }
    const ids = saidas.filter(s => marcadas.has(s.lancamentoId)).map(s => s.lancamentoId);
    const erro = await api.adotar(loteAdotando.loteId, ids);
    if (erro) { setErroSeletor(erro); return; }
    fecharSeletor();
  };
  const desvincular = async (movimentacaoId: string) => {
    onRecusa?.(null);
    const erro = await api.desvincular(movimentacaoId);
    if (erro) onRecusa?.(erro);
  };

  const clip = (loteId: string) => onDocumento && (
    <button type="button" onClick={() => onDocumento(loteId)} title="Registrar documento deste lote"
      aria-label="Registrar documento do lote" className="text-muted-foreground/70 hover:text-foreground">
      <Paperclip className="h-3 w-3" />
    </button>
  );
  const alturaMax = ALTURA_CABECALHO_ENTREGA + LINHAS_VISIVEIS_ENTREGA * ALTURA_LINHA_ENTREGA + ALTURA_LINHA_ENTREGA;

  return (
    <>
      <div data-testid="tabela-entrega-rolagem" className="overflow-y-auto rounded-md border" style={{ maxHeight: alturaMax }}>
        <table className="table-fixed border-collapse" style={{ width: LARGURA_DA_ENTREGA }} data-testid="entregas-venda">
          <colgroup>{COLUNAS_DA_ENTREGA.map(c => <col key={c.chave} style={c.largura ? { width: c.largura } : undefined} />)}</colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="bg-primary text-primary-foreground">
              {COLUNAS_DA_ENTREGA.map(c => <th key={c.chave} className={cn(TH, ALINHA[c.alinha])}>{c.rotulo}</th>)}
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr><td colSpan={COLUNAS_DA_ENTREGA.length} className={`${TD} text-center text-muted-foreground`}>
                {api.loading ? 'Carregando…' : 'Nenhum lote negociado.'}</td></tr>
            )}
            {linhas.map(ln => {
              const l = ln.lote;
              const cat = catLabel(l.categoria);
              const tituloLote = `Lote ${l.ordem} · ${precoDoContrato(l)}`;
              const negCab = ln.negCab != null ? String(ln.negCab) : '';
              const negKg = ln.negKg != null ? formatNum(ln.negKg, 2) : '';
              if (ln.tipo === 'saida') {
                const m = ln.mov;
                return (
                  <tr key={m.id} className="[&>td]:shadow-[inset_0_-1px_0_hsl(var(--border)/0.6)]" data-linha="saida">
                    <td className={cn(TD, ALINHA.centro)} title={tituloLote}>{l.ordem}</td>
                    <td className={TD} title={cat}>{cat}</td>
                    <td className={cn(TD, ALINHA.dir)}>{negCab}</td>
                    <td className={cn(TD, ALINHA.dir)}>{negKg}</td>
                    <td className={cn(TD, ALINHA.centro)}>{fmtBr(m.data || null)}</td>
                    <td className={cn(TD, ALINHA.dir)}>{m.quantidade}</td>
                    <td className={cn(TD, ALINHA.dir)}>{m.pesoMedio != null ? formatNum(m.pesoMedio, 2) : '—'}</td>
                    <td className={cn(TD, ALINHA.dir, ln.dif != null && ln.dif !== 0 ? 'text-amber-700' : 'text-muted-foreground')}>{fmtDif(ln.dif)}</td>
                    <td className={cn(TD, ALINHA.dir)}>{m.valorTotal != null ? formatNum(m.valorTotal, 2) : '—'}</td>
                    <td className={cn(TD, TOM_SITUACAO[ln.situacao])}
                      title={m.origem === 'adotada' ? `adotada · lançamento ${idCurto(m.lancamentoId)}` : 'registrada pela operação'}>
                      {rotuloDaSituacao(ln.situacao, v)}
                    </td>
                    <td className={cn(TD, ALINHA.centro)}>
                      <span className="inline-flex items-center justify-center gap-1.5">
                        {!readOnly && comAdocao && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button type="button" disabled={api.saving} aria-label={`Ações da ${v.mov}`} data-testid="acoes-saida"
                                className="inline-flex h-4 w-5 items-center justify-center rounded hover:bg-muted disabled:opacity-50">
                                <MoreHorizontal className="h-3 w-3" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {m.origem === 'adotada'
                                ? <DropdownMenuItem onSelect={() => void desvincular(m.id)}>desvincular</DropdownMenuItem>
                                : <DropdownMenuItem onSelect={() => onEstornar(m.id)}>estornar</DropdownMenuItem>}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                        {!readOnly && !comAdocao && (
                          <button type="button" disabled={api.saving} onClick={() => onEstornar(m.id)}
                            className="text-[10px] text-muted-foreground hover:text-destructive disabled:cursor-not-allowed">estornar</button>
                        )}
                        {clip(l.loteId)}
                      </span>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={`pend-${l.loteId}`} className="bg-amber-50 [&>td]:shadow-[inset_0_-1px_0_hsl(var(--border)/0.6)] dark:bg-amber-950/20" data-linha="pendente">
                  <td className={cn(TD, ALINHA.centro)} title={tituloLote}>{l.ordem}</td>
                  <td className={TD} title={cat}>{cat}</td>
                  <td className={cn(TD, ALINHA.dir)}>{negCab}</td>
                  <td className={cn(TD, ALINHA.dir)}>{negKg}</td>
                  <td className={cn(TD, ALINHA.centro, 'text-muted-foreground')}>—</td>
                  <td className={cn(TD, ALINHA.dir, 'font-semibold text-amber-700')} data-testid="saldo-do-lote">{ln.falta != null ? ln.falta : '—'}</td>
                  <td className={cn(TD, ALINHA.dir, 'text-muted-foreground')}>—</td>
                  <td className={cn(TD, ALINHA.dir, 'text-muted-foreground')}>—</td>
                  <td className={cn(TD, ALINHA.dir, 'text-muted-foreground')}>—</td>
                  <td className={cn(TD, TOM_SITUACAO.falta)}>{rotuloDaSituacao('falta', v)}</td>
                  <td className={cn(TD, ALINHA.centro)}>
                    <span className="inline-flex items-center justify-center gap-1.5">
                      {!readOnly && comAdocao && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" disabled={api.saving} data-testid="acao-pendente" className={ACAO}>{v.verbo} ▾</button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => void abrirSeletor(l)}>Adotar {v.mov} já lançada</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => onRegistrarNova(l.loteId)}>Registrar nova {v.mov}</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      {!readOnly && !comAdocao && (
                        <button type="button" disabled={api.saving} onClick={() => onRegistrarNova(l.loteId)} data-testid="acao-pendente"
                          aria-label={`${v.Verbo} lote ${cat}`} className={ACAO}>{v.verbo}</button>
                      )}
                      {clip(l.loteId)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {!tot.semLote && (
            <tfoot className="sticky bottom-0 z-10">
              <tr className="bg-[#E8E6DF] font-semibold dark:bg-muted" data-testid="total-entrega">
                <td className={TD} colSpan={2}>Total</td>
                <td className={cn(TD, ALINHA.dir)}>{tot.negociado}</td>
                <td className={TD} />
                <td className={TD} />
                <td className={cn(TD, ALINHA.dir)}>{tot.cab}</td>
                <td className={cn(TD, ALINHA.dir)}>{tot.kgMedio != null ? formatNum(tot.kgMedio, 2) : '—'}</td>
                <td className={cn(TD, ALINHA.dir, tot.dif !== 0 ? 'text-amber-700' : '')}>{fmtDif(tot.dif)}</td>
                <td className={cn(TD, ALINHA.dir)}>{tot.valor != null ? formatNum(tot.valor, 2) : '—'}</td>
                <td className={TD} />
                <td className={TD} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {loteAdotando && (
        <Dialog open onOpenChange={o => { if (!o) fecharSeletor(); }}>
          <DialogContent className="max-w-2xl">
            <div data-testid="seletor-adocao" className="space-y-1">
              <DialogHeader><DialogTitle className="text-[12px]">Adotar {v.mov} já lançada · {catLabel(loteAdotando.categoria)}
                {loteAdotando.qtdNegociada != null ? `, ${Math.max(loteAdotando.qtdNegociada - loteAdotando.qtdRecebida, 0)} cab` : ''}</DialogTitle></DialogHeader>
              <div className="text-[10px] text-muted-foreground">
                mostrando {v.movs} da {fazendaNome ?? 'fazenda da operação'} de {catLabel(loteAdotando.categoria)}
                {contraparteNome ? v.contraparte(contraparteNome) : ''} ainda sem OC, as mais perto da data da operação primeiro
              </div>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className={TH}><span className="sr-only">Selecionar</span></th>
                    <th className={cn(TH, 'text-center')}>Data</th><th className={cn(TH, 'text-left')}>Categoria</th><th className={cn(TH, 'text-right')}>Cab</th>
                    <th className={cn(TH, 'text-right')}>Peso</th><th className={cn(TH, 'text-right')}>Valor</th><th className={cn(TH, 'text-left')}>Lançamento</th>
                  </tr>
                </thead>
                <tbody>
                  {carregando && (<tr><td colSpan={7} className={`${TD} text-center text-muted-foreground`}>Carregando…</td></tr>)}
                  {!carregando && saidas.length === 0 && !erroSeletor && (
                    <tr><td colSpan={7} className={`${TD} text-center text-muted-foreground`}>Nenhuma {v.mov} desta categoria disponível para adotar.</td></tr>
                  )}
                  {saidas.map(s => (
                    <tr key={s.lancamentoId} className="border-b border-border/60" data-adotavel={s.lancamentoId}>
                      <td className={`${TD} text-center`}>
                        <Checkbox checked={marcadas.has(s.lancamentoId)} onCheckedChange={() => alternar(s.lancamentoId)}
                          aria-label={`Selecionar ${v.mov} de ${fmtBr(s.data)}`} className="h-3.5 w-3.5" />
                      </td>
                      <td className={`${TD} text-center tabular-nums`}>{fmtBr(s.data)}</td>
                      <td className={TD}>{catLabel(s.categoria)}</td>
                      <td className={`${TD} text-right tabular-nums`}>{s.quantidade}</td>
                      <td className={`${TD} text-right tabular-nums`}>{s.pesoMedio != null ? `${formatNum(s.pesoMedio, 2)} kg` : '—'}</td>
                      <td className={`${TD} text-right tabular-nums`}>{s.valorTotal != null ? formatNum(s.valorTotal, 2) : '—'}</td>
                      <td className={TD}>{origemDoLancamento(s)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <DialogFooter className="items-center gap-2">
                {erroSeletor && <span className="text-[10px] text-destructive" role="alert">{erroSeletor}</span>}
                <Button type="button" variant="ghost" size="sm" className="h-[22px] px-[9px] text-[10px] font-medium" onClick={fecharSeletor}>Cancelar</Button>
                <Button type="button" size="sm" className="h-[22px] px-[9px] text-[10px] font-medium" disabled={api.saving}
                  onClick={() => void confirmarAdocao()}>
                  {api.saving ? 'Adotando…' : `Adotar ${marcadas.size} ${marcadas.size === 1 ? v.mov : v.movs}`}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function origemDoLancamento(s: SaidaAdotavel): string {
  const quando = s.criadoEm ? fmtBr(s.criadoEm.slice(0, 10)).slice(0, 5) : null;
  const como = s.origemRegistro === 'importacao_historica' ? 'importado' : 'lançado';
  return `${idCurto(s.lancamentoId)} · ${como}${quando ? ` ${quando}` : ''}`;
}

/* "<Verbo> todos": uma data POR LINHA, editavel, sem gravar no lote. Vazia fica vermelha com a frase embaixo e nada grava
   (UX-OBRIGATORIOS-01). */
export function EnviarTodosDialog({ lotes, dataPadrao, catLabel, saving, onConfirmar, onFechar, lado = 'venda' }: {
  lotes: LoteRecebimento[]; dataPadrao: string; catLabel: (slug: string | null | undefined) => string;
  saving: boolean; onConfirmar: (datas: Record<string, string>) => void; onFechar: () => void; lado?: LadoContaCorrente;
}) {
  const v = VOCABULARIO_ENTREGA[lado];
  const [itens, setItens] = useState(() => itensEnviarTodos(lotes, dataPadrao));
  const [cobrar, setCobrar] = useState(false);
  const faltando = datasFaltando(itens);
  const loteDe = (id: string) => lotes.find(l => l.loteId === id);
  const enviar = () => {
    if (faltando.size > 0) { setCobrar(true); return; }
    onConfirmar(Object.fromEntries(itens.map(i => [i.loteId, i.data])));
  };
  const TDD = 'px-1.5 py-1 align-top text-[11px]';
  const THD = 'px-1.5 py-1 text-[10px] font-medium text-muted-foreground';
  return (
    <Dialog open onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-[12px]">{v.Verbo} todos conforme negociado</DialogTitle></DialogHeader>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b"><th className={cn(THD, 'text-left')}>Lote</th><th className={cn(THD, 'text-right')}>Cab</th><th className={cn(THD, 'text-left')}>Data da {v.mov} *</th></tr>
          </thead>
          <tbody>
            {itens.map(i => {
              const lote = loteDe(i.loteId);
              const vermelho = cobrar && faltando.has(i.loteId);
              return (
                <tr key={i.loteId} className="border-b border-border/60" data-enviar={i.loteId}>
                  <td className={`${TDD} break-words`}>{catLabel(lote?.categoria)}{lote ? ` · ${precoDoContrato(lote)}` : ''}</td>
                  <td className={`${TDD} text-right tabular-nums`}>{i.falta}</td>
                  <td className={TDD}>
                    <DatePicker value={i.data} size="compact"
                      onChange={d => setItens(prev => prev.map(x => (x.loteId === i.loteId ? { ...x, data: d } : x)))}
                      className={vermelho ? 'border-destructive' : undefined} />
                    {vermelho && <div className="mt-0.5 text-[10px] text-destructive">Informe a data da {v.mov}.</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" className="h-[22px] px-[9px] text-[10px] font-medium" onClick={onFechar}>Cancelar</Button>
          <Button type="button" size="sm" className="h-[22px] px-[9px] text-[10px] font-medium" disabled={saving} onClick={enviar}>
            {`${v.Verbo} ${itens.length} lote${itens.length === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
