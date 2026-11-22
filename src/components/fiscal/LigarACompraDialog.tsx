/**
 * ENTREGA-FUTURA-LIGAR-01 (Gabriel 19/11 08:55 + 22/11) — "Ligar à compra": as REMESSAS de entrega futura do mesmo emitente (as que citam
 * o mesmo faturamento) ficam guardadas na COMPRA — os lançamentos de saída do mesmo CPF/CNPJ —, sem criar lançamento e sem mudar valor.
 * A prévia diz o que já foi entregue: "Entregue R$ X de Y · P% · falta Z" e, nos grãos, kg e sacas de 60 kg.
 * O faturamento: na caixa → o nº; fora dela → "Buscar na Receita" (a consulta pela chave); nenhum citado → "sem NF de faturamento".
 * UI-LARGURA-FIXA-01: modal, colunas e quadros de tamanho FIXO (o corpo rola dentro dos quadros).
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { QUADRO_REGUA, TD_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA } from '@/components/ui/regua-tabela';
import { formatMoeda } from '@/lib/calculos/formatters';
import { dataBR } from '@/lib/datas/dataBR';
import { cn } from '@/lib/utils';
import type { NotaNaLista } from '@/lib/fiscal/notasDaReceita';
import { entregaDaCompra, grupoSugerido, gruposDaCompra, remessasDaMesmaCompra, type QuantidadeDaRemessa } from '@/lib/fiscal/entregaFutura';
import { lerRemessa, ligarRemessasACompra, type ResultadoDoLigar } from '@/lib/fiscal/ligarACompra';
import { lancamentosDoFornecedorNoPeriodo, type Consulta } from '@/lib/financeiro/nfeConsultas';
import type { LancamentoJaLancado } from '@/lib/financeiro/nfe/jaLancada';

const reais = (cent: number) => formatMoeda(cent / 100);
const num = (x: number, casas = 0) => x.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const somaDias = (iso: string, dias: number) => { const d = new Date(`${iso.slice(0, 10)}T12:00:00`); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10); };
const COL_REM = [26, 92, 78, 112, 110];
const COL_LANC = [26, 78, null, 104, 86];
const colgroup = (c: (number | null)[]) => <colgroup>{c.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}</colgroup>;

interface Remessa { n: NotaNaLista; xml: string | null; qtd: QuantidadeDaRemessa | null; ligada: boolean }

export function LigarACompraDialog({ n, lista, clienteId, lerXml, aoFechar, carregar = lancamentosDoFornecedorNoPeriodo, ligar = ligarRemessasACompra,
  buscarFaturamento }: {
  n: NotaNaLista;
  lista: readonly NotaNaLista[];
  clienteId: string;
  lerXml: (id: string) => Promise<string>;
  aoFechar: (ligou: boolean) => void;
  /** a bancada e os testes injetam */
  carregar?: (clienteId: string, documento: string, de: string, ate: string) => Promise<Consulta<LancamentoJaLancado[]>>;
  ligar?: (clienteId: string, remessas: { numero: string; chave: string; xml: string }[], ids: string[]) => Promise<ResultadoDoLigar>;
  /** o faturamento que não está na caixa: a consulta pela chave (com o titular da remessa) */
  buscarFaturamento?: (titularId: string, chave: string) => Promise<{ ok: boolean; frase: string }>;
}) {
  const doGrupo = useMemo(() => remessasDaMesmaCompra(lista, n), [lista, n]);
  const [remessas, setRemessas] = useState<Remessa[]>(() => doGrupo.map((x) => ({ n: x, xml: null, qtd: null, ligada: x.sit === 'no_sistema' })));
  const [marcadasR, setMarcadasR] = useState<ReadonlySet<string>>(() => new Set(doGrupo.filter((x) => x.sit !== 'no_sistema').map((x) => x.chave)));
  const [lancs, setLancs] = useState<LancamentoJaLancado[] | null>(null);
  const [marcadosL, setMarcadosL] = useState<ReadonlySet<string>>(new Set());
  const [frase, setFrase] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [buscando, setBuscando] = useState(false);

  /* os XMLs (a quantidade dos itens) e os lançamentos de saída do mesmo CPF/CNPJ (1 ano antes e depois das remessas) */
  useEffect(() => {
    let vivo = true;
    void Promise.all(doGrupo.map(async (x) => {
      try { const xml = await lerXml(x.id); const r = lerRemessa(x.chave, xml); return { chave: x.chave, xml, qtd: 'erro' in r ? null : r.qtd }; }
      catch { return { chave: x.chave, xml: null, qtd: null }; }
    })).then((lidos) => {
      if (!vivo) return;
      const m = new Map(lidos.map((l) => [l.chave, l]));
      setRemessas((rs) => rs.map((r) => ({ ...r, xml: m.get(r.n.chave)?.xml ?? null, qtd: m.get(r.n.chave)?.qtd ?? null })));
    });
    const datas = doGrupo.map((x) => x.emissao ?? '').filter(Boolean).sort();
    const de = somaDias(datas[0] ?? n.emissao ?? new Date().toISOString(), -365);
    const ate = somaDias(datas.at(-1) ?? n.emissao ?? new Date().toISOString(), 365);
    void carregar(clienteId, n.emitenteDocumento ?? '', de, ate).then((r) => {
      if (!vivo) return;
      if (r.ok === false) { setLancs([]); setFrase('Não consegui procurar os lançamentos deste CPF/CNPJ.'); return; }
      setLancs(r.valor);
      const entregue = doGrupo.reduce((s, x) => s + (x.valorCent ?? 0), 0);
      const g = grupoSugerido(gruposDaCompra(r.valor), entregue);
      if (g) setMarcadosL(new Set(g.ids));
    });
    return () => { vivo = false; };
  }, [doGrupo, clienteId, carregar, lerXml, n]);

  const compraCent = (lancs ?? []).filter((l) => marcadosL.has(l.id)).reduce((s, l) => s + l.valorCent, 0);
  const contam = remessas.filter((r) => r.ligada || marcadasR.has(r.n.chave));
  const ent = entregaDaCompra(contam.map((r) => ({ valorCent: r.n.valorCent, qtd: r.qtd })), compraCent);
  const novas = remessas.filter((r) => !r.ligada && marcadasR.has(r.n.chave));
  const faturamento = n.citadas.length === 0 ? null : n.citadas[0];
  const faturamentoNaCaixa = faturamento ? lista.some((x) => x.chave === n.refs[0]) : false;

  const alternar = (set: ReadonlySet<string>, k: string) => { const s = new Set(set); if (s.has(k)) s.delete(k); else s.add(k); return s; };
  const ligarAgora = async () => {
    const prontas = novas.flatMap((r) => (r.xml ? [{ numero: r.n.numero, chave: r.n.chave, xml: r.xml }] : []));
    if (prontas.length === 0 || marcadosL.size === 0) return;
    setGravando(true); setFrase(null);
    try {
      const r = await ligar(clienteId, prontas, (lancs ?? []).filter((l) => marcadosL.has(l.id)).map((l) => l.id));
      if (r.falhas.length === 0) { aoFechar(true); return; }
      setFrase(`${r.ligadas} ligadas · ${r.falhas.length} não: NF ${r.falhas[0].numero} — ${r.falhas[0].frase}`);
    } finally { setGravando(false); }
  };
  const buscar = async () => {
    if (!buscarFaturamento || !n.refs[0]) return;
    setBuscando(true);
    try { const r = await buscarFaturamento(n.titularId, n.refs[0]); setFrase(`Faturamento NF ${faturamento}: ${r.frase}`); } finally { setBuscando(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !gravando) aoFechar(false); }}>
      <DialogContent className="flex h-[min(560px,calc(100vh-16px))] w-[min(900px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button]:top-2.5 [&>button]:text-primary-foreground" data-testid="ligar-a-compra">
        <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 pr-10">
          <DialogTitle className="min-w-0 truncate text-[11px] font-semibold text-primary-foreground" title={n.emitenteNome ?? undefined}>
            Ligar à compra · {n.emitenteNome ?? '—'}
          </DialogTitle>
          <DialogDescription className="sr-only">As remessas de entrega futura ficam guardadas nos documentos dos lançamentos da compra, sem criar lançamento.</DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 bg-muted p-2 text-[10.5px]">
          {/* o faturamento */}
          <div className="flex h-5 shrink-0 items-center gap-2" data-testid="ligar-faturamento">
            {faturamento == null ? <span className="text-amber-800">Sem NF de faturamento (5922): a cobrança é a própria compra · ligue as remessas a ela.</span>
              : faturamentoNaCaixa ? <span>Faturamento: NF {faturamento} (na caixa da Receita).</span>
                : <>
                  <span className="text-amber-800">Faturamento NF {faturamento} fora da caixa.</span>
                  {buscarFaturamento && n.refs[0] && (
                    <button type="button" className="h-[16px] w-[104px] whitespace-nowrap rounded-[3px] border border-primary/40 bg-card px-1 text-[9.5px] font-semibold text-primary hover:bg-muted disabled:opacity-50"
                      disabled={buscando} onClick={() => { void buscar(); }} data-testid="ligar-buscar-faturamento"
                      title="Consulta a nota pela chave na Receita (o XML completo). A próxima busca automática deste produtor espera 1 h.">
                      {buscando ? 'Buscando…' : 'Buscar na Receita'}
                    </button>
                  )}
                </>}
          </div>
          {/* as remessas */}
          <div className="flex h-5 shrink-0 items-center text-[10px] font-semibold text-muted-foreground">Remessas ({remessas.length})</div>
          <div className={cn(QUADRO_REGUA, 'h-[168px] shrink-0')}>
            <table className="w-full shrink-0 table-fixed border-collapse bg-primary">{colgroup(COL_REM)}
              <thead><tr>{['', 'NF', 'Emissão', 'Quantidade', 'Valor'].map((h, i) => <th key={i} className={cn(TH_REGUA, i >= 3 ? 'text-right' : 'text-left')}>{h}</th>)}</tr></thead>
            </table>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <table className="w-full table-fixed border-collapse">{colgroup(COL_REM)}
                <tbody>
                  {remessas.map((r) => (
                    <tr key={r.n.chave} className="h-[19px] border-b border-border/50" data-testid="ligar-remessa">
                      <td className={TD_REGUA}>
                        {r.ligada ? <span className="text-[9px] text-[#1f7a45]" title="Já ligada à compra">✓</span>
                          : <Checkbox checked={marcadasR.has(r.n.chave)} onCheckedChange={() => setMarcadasR((s) => alternar(s, r.n.chave))} aria-label={`Ligar a NF ${r.n.numero}`} />}
                      </td>
                      <td className={TD_REGUA_NUM}>{r.n.numero}</td>
                      <td className={TD_REGUA}>{dataBR(r.n.emissao)}</td>
                      <td className={TD_REGUA_NUM}>{r.qtd?.kg != null ? `${num(r.qtd.kg)} kg` : '—'}</td>
                      <td className={TD_REGUA_NUM}>{r.n.valorCent == null ? '—' : reais(r.n.valorCent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {/* a compra */}
          <div className="flex h-5 shrink-0 items-center text-[10px] font-semibold text-muted-foreground">A compra · lançamentos de saída do mesmo CPF/CNPJ</div>
          <div className={cn(QUADRO_REGUA, 'min-h-0 flex-1')}>
            <table className="w-full shrink-0 table-fixed border-collapse bg-primary">{colgroup(COL_LANC)}
              <thead><tr>{['', 'Venc.', 'Descrição', 'Valor', 'Situação'].map((h, i) => <th key={i} className={cn(TH_REGUA, i === 3 ? 'text-right' : 'text-left')}>{h}</th>)}</tr></thead>
            </table>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <table className="w-full table-fixed border-collapse">{colgroup(COL_LANC)}
                <tbody>
                  {lancs == null && <tr><td colSpan={5} className={cn(TD_REGUA, 'text-muted-foreground')}>Procurando os lançamentos…</td></tr>}
                  {lancs?.length === 0 && <tr><td colSpan={5} className={cn(TD_REGUA, 'text-muted-foreground')}>Nenhum lançamento de saída deste CPF/CNPJ no período.</td></tr>}
                  {(lancs ?? []).map((l) => (
                    <tr key={l.id} className="h-[19px] border-b border-border/50" data-testid="ligar-lancamento">
                      <td className={TD_REGUA}><Checkbox checked={marcadosL.has(l.id)} onCheckedChange={() => setMarcadosL((s) => alternar(s, l.id))} aria-label="Lançamento da compra" /></td>
                      <td className={TD_REGUA}>{dataBR(l.vencimento)}</td>
                      <td className={TD_REGUA_TEXTO} title={l.descricao ?? undefined}>{l.descricao ?? '—'}</td>
                      <td className={TD_REGUA_NUM}>{reais(l.valorCent)}</td>
                      <td className={TD_REGUA_TEXTO}>{l.pagamento ? 'pago' : l.status ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {/* a prévia */}
          <div className="flex h-6 shrink-0 items-center gap-3 rounded border bg-card px-2 tabular-nums" data-testid="ligar-previa">
            {compraCent === 0 ? <span className="text-muted-foreground">Marque os lançamentos da compra.</span> : <>
              <span>Entregue <b>{reais(ent.entregueCent)}</b> de {reais(ent.compraCent)}</span>
              <span>{ent.pct}%</span>
              <span>falta {reais(ent.faltaCent)}</span>
              {ent.kg != null && ent.sacas != null && <span>{num(ent.kg)} kg ≈ {num(ent.sacas, 1)} sc de 60 kg</span>}
            </>}
          </div>
        </div>
        <div className="flex h-9 shrink-0 items-center gap-2 border-t bg-card px-3 text-[10.5px]">
          <span className="min-w-0 flex-1 truncate text-muted-foreground" title={frase ?? undefined} data-testid="ligar-frase">
            {frase ?? 'Não cria lançamento nem muda valor.'}
          </span>
          <Button type="button" size="sm" variant="outline" className="h-[24px] px-2.5 text-[10.5px]" disabled={gravando} onClick={() => aoFechar(false)}>Cancelar</Button>
          <Button type="button" size="sm" className="h-[24px] w-[120px] px-2.5 text-[10.5px]" data-testid="ligar-gravar"
            disabled={gravando || novas.length === 0 || marcadosL.size === 0 || novas.some((r) => !r.xml)} onClick={() => { void ligarAgora(); }}>
            {gravando ? 'Ligando…' : `Ligar (${novas.length})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
