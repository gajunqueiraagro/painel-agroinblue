/**
 * BPO-APROVACAO-01 — a tela do APROVADOR (mock-bpo-aprovacao-01-v1, aprovado 17/11; D1–D10). Celular primeiro: a fila por dia de
 * vencimento, o saldo de cada conta depois dos pagamentos (o banco pelo Open Finance; sem leitura, "—"), aprovar em lote (prévia →
 * confirmar) ou um a um, recusar com motivo. Quem grava e quem pode é o BANCO (118160: só o aprovador marcado decide; a recusa sem motivo
 * e o "não está mais aguardando" vêm de lá). Abas: Fila · Aprovados · Recusados · Alertas (pago sem aprovação, aprovado e não pago, pago
 * diferente — calculados, só leitura). O BPO NASCE DESLIGADO: sem a configuração ligada, a tela diz isso e não mostra nada.
 */
import { GuiaDaAprovacao } from '@/components/financeiro-v2/GuiaDaAprovacao';
import { HelpCircle } from 'lucide-react';
import { jaViuOGuia, marcarGuiaVisto } from '@/lib/financeiro/guiaDaAprovacao';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Segmentado } from '@/components/ui/segmentado';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatMoeda } from '@/lib/calculos/formatters';
import { dataBR as brData } from '@/lib/datas/dataBR';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  FRASE_BPO_DESLIGADO, FRASE_DECIDIR_FALHOU, FRASE_LER_FALHOU, FRASE_SO_APROVADOR, fraseDaRecusaSemMotivo, lerLinhasDaAprovacao,
  porDiaDeVencimento, saldosDepoisDosPagamentos, somaDe, type LinhaDaAprovacao,
} from '@/lib/financeiro/aprovacao';

type Aba = 'fila' | 'aprovado' | 'recusado' | 'alertas';
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const diaDaSemana = (d: string) => DIAS[new Date(`${d}T12:00:00Z`).getUTCDay()];
const hojeEmBrasilia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const ROTULO_DO_ALERTA: Record<string, string> = {
  pago_sem_aprovacao: 'Pago sem aprovação', aprovado_nao_pago: 'Aprovado e não pago', pago_diferente: 'Pago diferente do aprovado',
};
interface Alerta { alerta: string; lancamentoId: string; data: string | null; valor: number; valorAprovado: number | null; fornecedor: string | null }
function lerAlertas(rows: unknown): Alerta[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((r): Alerta[] => {
    if (typeof r !== 'object' || r === null) return [];
    const o = Object.fromEntries(Object.entries(r));
    const id = typeof o.lancamento_id === 'string' ? o.lancamento_id : null;
    if (!id || typeof o.alerta !== 'string') return [];
    return [{ alerta: o.alerta, lancamentoId: id, data: typeof o.data === 'string' ? o.data.slice(0, 10) : null, valor: Number(o.valor) || 0,
      valorAprovado: o.valor_aprovado == null ? null : Number(o.valor_aprovado), fornecedor: typeof o.fornecedor === 'string' ? o.fornecedor : null }];
  });
}
/** a mensagem do banco (a recusa da RPC já vem pronta, "BPO: …"); o resto vira a frase de sempre */
const fraseDoErro = (e: { message?: string } | null, padrao: string) => (e?.message?.startsWith('BPO: ') ? e.message.slice(5) : padrao);

export default function AprovarPagamentosPage() {
  const { clienteAtual, isAdmin } = useCliente();
  const { user } = useAuth();
  const clienteId = clienteAtual?.id ?? null;
  const [ligado, setLigado] = useState<boolean | null>(null);
  const [aprovador, setAprovador] = useState(false);
  const [linhas, setLinhas] = useState<LinhaDaAprovacao[] | null>(null);
  const [doBanco, setDoBanco] = useState<Map<string, { saldo: number; em: string | null }>>(new Map());
  const [alertas, setAlertas] = useState<Alerta[] | null>(null);
  const [aba, setAba] = useState<Aba>('fila');
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [aberta, setAberta] = useState<LinhaDaAprovacao | null>(null);
  const [recusando, setRecusando] = useState<LinhaDaAprovacao | null>(null);
  const [motivo, setMotivo] = useState('');
  const [motivoErro, setMotivoErro] = useState<string | null>(null);
  const [previa, setPrevia] = useState<{ ids: string[]; n: number; total: number } | null>(null);
  const [frase, setFrase] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /* BPO-GUIA-01 — o guia "Como funciona": abre sozinho na 1ª visita de cada usuário (guardado no navegador) e pelo botão */
  const [guia, setGuia] = useState<{ aberto: boolean; passo: number }>({ aberto: false, passo: 0 });
  useEffect(() => { if (user?.id && !jaViuOGuia(user.id)) setGuia({ aberto: true, passo: 0 }); }, [user?.id]);
  const fecharGuia = (naoMostrar: boolean) => { if (naoMostrar) marcarGuiaVisto(user?.id); setGuia((g) => ({ ...g, aberto: false })); };

  const ler = useCallback(async () => {
    if (!clienteId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: as tabelas e RPCs da 118160 ainda não estão no types.ts
    const sb = supabase as any;
    const [cfg, apr, lista, saldos] = await Promise.all([
      sb.from('financeiro_bpo_config').select('ativo').eq('cliente_id', clienteId).limit(1),
      user?.id ? sb.from('financeiro_aprovadores').select('id').eq('cliente_id', clienteId).eq('user_id', user.id).eq('ativo', true).limit(1) : Promise.resolve({ data: [], error: null }),
      sb.rpc('fn_aprovacao_lista', { p_cliente: clienteId, p_situacoes: null, p_venc_ate: null }),
      sb.from('openfinance_saldos').select('conta_bancaria_id, saldo, saldo_em, lido_em').eq('cliente_id', clienteId).order('lido_em', { ascending: false }).limit(200),
    ]);
    const on = !cfg.error && Array.isArray(cfg.data) && cfg.data.length === 1 && cfg.data[0]?.ativo === true;
    setLigado(on);
    setAprovador(!apr.error && Array.isArray(apr.data) && apr.data.length === 1);
    if (!on) { setLinhas([]); return; }
    if (lista.error) { setLinhas([]); setFrase({ tipo: 'erro', texto: FRASE_LER_FALHOU }); return; }
    setLinhas(lerLinhasDaAprovacao(lista.data));
    const m = new Map<string, { saldo: number; em: string | null }>();
    for (const s of Array.isArray(saldos.data) ? saldos.data : []) {
      const id = typeof s?.conta_bancaria_id === 'string' ? s.conta_bancaria_id : null;
      if (id && !m.has(id) && Number.isFinite(Number(s.saldo))) m.set(id, { saldo: Number(s.saldo), em: typeof s.saldo_em === 'string' ? s.saldo_em : null });
    }
    setDoBanco(m);
    setMarcadas(new Set());
  }, [clienteId, user?.id]);

  /* a frase do resultado sobrevive à releitura depois de gravar; só a troca de cliente/usuário a limpa */
  useEffect(() => { setLigado(null); setLinhas(null); setAlertas(null); setFrase(null); void ler(); }, [ler]);

  useEffect(() => {
    if (aba !== 'alertas' || !clienteId || alertas !== null) return;
    void (async () => {
      const hoje = hojeEmBrasilia();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
      const { data, error } = await (supabase as any).rpc('fn_aprovacao_alertas', { p_cliente: clienteId, p_de: `${hoje.slice(0, 7)}-01`, p_ate: hoje });
      setAlertas(error ? [] : lerAlertas(data));
    })();
  }, [aba, clienteId, alertas]);

  const fila = useMemo(() => (linhas ?? []).filter((l) => l.situacao === 'aguardando'), [linhas]);
  const daAba = useMemo(() => (linhas ?? []).filter((l) => l.situacao === aba), [linhas, aba]);
  const saldos = useMemo(() => saldosDepoisDosPagamentos(linhas ?? [], doBanco), [linhas, doBanco]);
  const selecionadas = fila.filter((l) => marcadas.has(l.lancamentoId));

  const decidir = async (ids: string[], aprovar: boolean, texto: string | null, simular: boolean) => {
    if (!clienteId) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
    return (supabase as any).rpc('fn_aprovacao_decidir', { p_cliente: clienteId, p_ids: ids, p_aprovar: aprovar, p_motivo: texto, p_simular: simular });
  };
  const pedirPrevia = async (ids: string[]) => {
    setOcupado(true);
    try {
      const r = await decidir(ids, true, null, true);
      if (!r || r.error) { setFrase({ tipo: 'erro', texto: fraseDoErro(r?.error ?? null, FRASE_DECIDIR_FALHOU) }); return; }
      setPrevia({ ids, n: Number(r.data?.n) || ids.length, total: Number(r.data?.total) || 0 });
    } catch { setFrase({ tipo: 'erro', texto: FRASE_DECIDIR_FALHOU }); } finally { setOcupado(false); }
  };
  const confirmarAprovar = async () => {
    if (!previa) return;
    setOcupado(true);
    try {
      const r = await decidir(previa.ids, true, null, false);
      if (!r || r.error) { setFrase({ tipo: 'erro', texto: fraseDoErro(r?.error ?? null, FRASE_DECIDIR_FALHOU) }); setPrevia(null); return; }
      setFrase({ tipo: 'ok', texto: `${previa.n} ${previa.n === 1 ? 'pagamento aprovado' : 'pagamentos aprovados'} · ${formatMoeda(previa.total)}.` });
      setPrevia(null); setAberta(null);
      await ler();
    } catch { setFrase({ tipo: 'erro', texto: FRASE_DECIDIR_FALHOU }); } finally { setOcupado(false); }
  };
  const confirmarRecusa = async () => {
    if (!recusando) return;
    if (motivo.trim().length < 3) { setMotivoErro(fraseDaRecusaSemMotivo); return; }
    setOcupado(true);
    try {
      const r = await decidir([recusando.lancamentoId], false, motivo.trim(), false);
      if (!r || r.error) { setMotivoErro(fraseDoErro(r?.error ?? null, FRASE_DECIDIR_FALHOU)); return; }
      setFrase({ tipo: 'ok', texto: 'Pagamento recusado. O motivo volta para quem lançou.' });
      setRecusando(null); setAberta(null); setMotivo(''); setMotivoErro(null);
      await ler();
    } catch { setMotivoErro(FRASE_DECIDIR_FALHOU); } finally { setOcupado(false); }
  };

  if (!clienteId) return <div className="p-4 text-[12px] text-muted-foreground">Escolha o cliente.</div>;
  if (ligado === null || linhas === null) return <div className="p-4 text-[12px] text-muted-foreground" data-testid="aprovar-lendo">Lendo a fila…</div>;
  if (!ligado) return (
    <div className="flex flex-wrap items-center gap-2 p-4 text-[12px] text-muted-foreground" data-testid="aprovar-desligado">
      <span className="whitespace-nowrap">{FRASE_BPO_DESLIGADO}</span>
      <Button size="sm" variant="outline" className="h-7 text-[12px]" onClick={() => setGuia({ aberto: true, passo: 0 })} data-testid="aprovar-como-funciona">Como funciona</Button>
      {isAdmin && <Button size="sm" className="h-7 text-[12px]" onClick={() => setGuia({ aberto: true, passo: 5 })} data-testid="aprovar-ligar">Ligar neste cliente</Button>}
      <GuiaDaAprovacao aberto={guia.aberto} passoInicial={guia.passo} onFechar={fecharGuia} ehAdmin={isAdmin} clienteId={clienteId}
        ligado={ligado === true} onLigou={(t) => { setFrase({ tipo: 'ok', texto: t }); void ler(); }} />
    </div>
  );

  /* zero cast: o tipo das opções vem declarado (era `as const`) */
  const opcoes: { valor: Aba; rotulo: string }[] = [
    { valor: 'fila', rotulo: `Fila (${fila.length})` },
    { valor: 'aprovado', rotulo: 'Aprovados' },
    { valor: 'recusado', rotulo: 'Recusados' },
    { valor: 'alertas', rotulo: 'Alertas' },
  ];
  return (
    <div className="flex h-full w-full flex-col" data-testid="aprovar-pagamentos">
      <GuiaDaAprovacao aberto={guia.aberto} passoInicial={guia.passo} onFechar={fecharGuia} ehAdmin={isAdmin} clienteId={clienteId}
        ligado={ligado === true} onLigou={(t) => { setFrase({ tipo: 'ok', texto: t }); void ler(); }} />
      <div className="flex-none bg-primary px-3 py-2 text-primary-foreground">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 whitespace-nowrap text-[14px] font-semibold">Pagamentos para aprovar</div>
          <button type="button" onClick={() => setGuia({ aberto: true, passo: 0 })} data-testid="aprovar-como-funciona"
            title="Como funciona" aria-label="Como funciona"
            className="flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-white/30 px-1.5 text-[11px] font-medium hover:bg-white/10">
            {/* no celular só o ícone: com o texto, o botão cobria o título a 390 px (gate de cortes) */}
            <HelpCircle className="h-3.5 w-3.5" aria-hidden /><span className="hidden sm:inline">Como funciona</span>
          </button>
        </div>
        <div className="text-[11px] opacity-85 tabular-nums">{clienteAtual?.nome ?? ''} · {fila.length} aguardando · {formatMoeda(somaDe(fila))}</div>
      </div>
      <div className="flex-none px-2 pt-2"><Segmentado valor={aba} onEscolher={setAba} opcoes={opcoes} altura={28} fonte={10} /></div>
      {!aprovador && <div className="flex-none px-3 pt-1 text-[11px] text-muted-foreground" data-testid="aprovar-so-leitura">{FRASE_SO_APROVADOR}</div>}
      <div className="h-[16px] flex-none truncate px-3 text-[11px]" data-testid="aprovar-frase" title={frase?.texto}>
        {frase && <span className={frase.tipo === 'erro' ? 'text-destructive' : 'text-muted-foreground'}>{frase.texto}</span>}
      </div>

      {aba === 'fila' && saldos.length > 0 && (
        <div className="flex flex-none gap-2 overflow-x-auto px-2 pb-1" data-testid="aprovar-saldos">
          {saldos.map((s) => (
            <div key={s.contaId} className={`min-w-[160px] flex-none rounded-lg border px-2 py-1 text-[11px] ${s.negativo ? 'border-amber-300 bg-amber-50' : ''}`}
              title={s.banco === null ? 'Sem leitura do banco pelo Open Finance para esta conta.' : `Banco (Open Finance): ${formatMoeda(s.banco)} − ${formatMoeda(s.pagamentos)} da fila`}>
              <div className="truncate">{s.conta} · depois da fila</div>
              <div className="text-[13px] font-semibold tabular-nums">{s.depois === null ? '—' : formatMoeda(s.depois)}</div>
              <div className={s.negativo ? 'text-amber-800' : 'text-muted-foreground'}>{s.negativo ? 'fica negativo' : s.banco === null ? 'sem leitura do banco' : 'pelo banco'}</div>
            </div>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-20" data-testid="aprovar-lista">
        {aba === 'alertas' ? <ListaDeAlertas alertas={alertas} />
          : (aba === 'fila' ? fila : daAba).length === 0
            ? <div className="p-3 text-[12px] text-muted-foreground">{aba === 'fila' ? 'Nada aguardando aprovação.' : aba === 'aprovado' ? 'Nenhum aprovado ainda.' : 'Nenhum recusado.'}</div>
            : porDiaDeVencimento(aba === 'fila' ? fila : daAba).map((d) => (
              <div key={d.dia ?? 'sem'}>
                <div className="mb-1 mt-2 flex justify-between text-[11px] font-semibold text-primary">
                  <span>{d.dia ? `${diaDaSemana(d.dia)} ${brData(d.dia)}` : 'Sem vencimento'} · {d.linhas.length}</span>
                  <span className="tabular-nums">{formatMoeda(d.total)}</span>
                </div>
                {d.linhas.map((l) => (
                  <div key={l.lancamentoId} className={GRADE_DO_ITEM} data-testid="aprovar-item">
                    {aba === 'fila' && aprovador
                      ? <Checkbox aria-label={`Marcar ${l.fornecedor ?? l.descricao ?? 'pagamento'}`} className="mt-0.5 h-[18px] w-[18px]"
                          checked={marcadas.has(l.lancamentoId)} onCheckedChange={(v) => setMarcadas((s) => { const n = new Set(s); if (v === true) n.add(l.lancamentoId); else n.delete(l.lancamentoId); return n; })} />
                      : <span />}
                    <button type="button" className="min-w-0 break-words text-left font-semibold" title={l.fornecedor ?? l.descricao ?? ''} onClick={() => setAberta(l)}>
                      {l.fornecedor ?? l.descricao ?? 'Sem fornecedor'}
                    </button>
                    <span className="whitespace-nowrap text-right font-semibold tabular-nums md:order-last">{formatMoeda(Math.abs(l.valor))}</span>
                    <span className="md:hidden" />
                    <span className="col-span-2 break-words text-[11px] text-muted-foreground md:col-span-1" data-testid="aprovar-item-onde"
                      title={[l.fazenda, l.conta, l.descricao].filter(Boolean).join(' · ')}>
                      {[l.fazenda, l.conta].filter(Boolean).join(' · ')}
                      {l.vencimento ? <span className="whitespace-nowrap md:hidden">{l.fazenda || l.conta ? ' · ' : ''}vence {brData(l.vencimento)}</span> : null}
                    </span>
                    <span className="hidden whitespace-nowrap text-[11px] tabular-nums text-muted-foreground md:inline" data-testid="aprovar-item-vence">{l.vencimento ? brData(l.vencimento) : '—'}</span>
                    <span className="md:hidden" />
                    <span className="col-span-2 flex gap-1.5 pt-0.5 md:col-span-1 md:min-w-0 md:pt-0">
                      <span className={`flex-none rounded-full border px-2 text-[10.5px] ${l.temNota ? '' : 'border-rose-300 text-rose-800'}`}>{l.temNota ? 'Nota' : 'sem nota'}</span>
                      <span className={`flex-none rounded-full border px-2 text-[10.5px] ${l.temBoleto ? '' : 'border-rose-300 text-rose-800'}`}>{l.temBoleto ? 'Boleto' : 'sem boleto'}</span>
                      {l.situacao === 'recusado' && l.motivo && <span className="min-w-0 break-words text-[10.5px] text-rose-800" title={l.motivo}>{l.motivo}</span>}
                      {l.observacao && l.situacao !== 'recusado' && <span className="min-w-0 break-words text-[10.5px] text-muted-foreground" title={l.observacao}>{l.observacao}</span>}
                    </span>
                  </div>
                ))}
              </div>
            ))}
      </div>

      {aba === 'fila' && aprovador && (
        <div className="sticky bottom-0 flex flex-none gap-2 border-t bg-card px-2 py-2">
          <Button className="h-11 flex-1 text-[13px] font-semibold" disabled={ocupado || selecionadas.length === 0} data-testid="aprovar-lote"
            onClick={() => void pedirPrevia(selecionadas.map((l) => l.lancamentoId))}>
            {selecionadas.length === 0 ? 'Marque o que aprovar' : `Aprovar ${selecionadas.length} · ${formatMoeda(somaDe(selecionadas))}`}
          </Button>
        </div>
      )}

      {/* o item a um toque */}
      <Dialog open={aberta !== null && recusando === null && previa === null} onOpenChange={(v) => { if (!v) setAberta(null); }}>
        <DialogContent className="max-w-[420px]" data-testid="aprovar-detalhe">
          {aberta && (
            <>
              <DialogHeader>
                <DialogTitle className="truncate text-[14px]" title={aberta.fornecedor ?? ''}>{aberta.fornecedor ?? aberta.descricao ?? 'Pagamento'}</DialogTitle>
                <DialogDescription className="text-[11px]">{aberta.situacao === 'aguardando' ? 'Aguardando aprovação' : aberta.situacao === 'aprovado' ? 'Aprovado' : 'Recusado'}{aberta.observacao ? ` · ${aberta.observacao}` : ''}</DialogDescription>
              </DialogHeader>
              <div className="text-[22px] font-bold tabular-nums">{formatMoeda(Math.abs(aberta.valor))}</div>
              <div className="grid grid-cols-[110px_1fr] gap-y-1 text-[12px]">
                <span className="text-muted-foreground">Vencimento</span><span>{aberta.vencimento ? `${brData(aberta.vencimento)} (${diaDaSemana(aberta.vencimento)})` : '—'}</span>
                <span className="text-muted-foreground">Conta</span><span className="truncate" title={aberta.conta ?? ''}>{aberta.conta ?? '—'}</span>
                <span className="text-muted-foreground">Fazenda</span><span className="truncate">{aberta.fazenda ?? '—'}</span>
                <span className="text-muted-foreground">Descrição</span><span className="truncate" title={aberta.descricao ?? ''}>{aberta.descricao ?? '—'}</span>
                <span className="text-muted-foreground">Nota · Boleto</span><span>{aberta.temNota ? 'nota ligada' : 'sem nota'} · {aberta.temBoleto ? 'boleto ligado' : 'sem boleto'}</span>
                {aberta.motivo && <><span className="text-muted-foreground">Motivo</span><span className="text-rose-800">{aberta.motivo}</span></>}
              </div>
              {aberta.situacao === 'aguardando' && aprovador && (
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="h-11 w-[120px] text-rose-700" disabled={ocupado} data-testid="aprovar-recusar"
                    onClick={() => { setRecusando(aberta); setMotivo(''); setMotivoErro(null); }}>Recusar</Button>
                  <Button className="h-11 flex-1" disabled={ocupado} data-testid="aprovar-um" onClick={() => void pedirPrevia([aberta.lancamentoId])}>Aprovar</Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* recusar com motivo (obrigatório; a mensagem fica no campo, nunca em toast) */}
      <Dialog open={recusando !== null} onOpenChange={(v) => { if (!v && !ocupado) setRecusando(null); }}>
        <DialogContent className="max-w-[420px]" data-testid="aprovar-recusa">
          <DialogHeader>
            <DialogTitle className="text-[14px]">Recusar o pagamento</DialogTitle>
            <DialogDescription className="text-[11px] tabular-nums">{recusando ? `${recusando.fornecedor ?? 'Pagamento'} · ${formatMoeda(Math.abs(recusando.valor))}${recusando.vencimento ? ` · ${brData(recusando.vencimento)}` : ''}` : ''}</DialogDescription>
          </DialogHeader>
          <label className="text-[12px]" htmlFor="motivo-da-recusa">Por que não aprovar? <b>(obrigatório)</b></label>
          <Textarea id="motivo-da-recusa" className={`h-[80px] w-full text-[12px] ${motivoErro ? 'border-destructive' : ''}`}
            value={motivo} onChange={(e) => { setMotivo(e.target.value); setMotivoErro(null); }} data-testid="aprovar-motivo" />
          <div className="h-[14px] text-[11px] text-destructive" data-testid="aprovar-motivo-erro">{motivoErro ?? ''}</div>
          <div className="text-[11px] text-muted-foreground">O lançamento não é cancelado: volta para quem lançou com o motivo. Corrigido, entra de novo na fila.</div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="h-11 w-[120px]" disabled={ocupado} onClick={() => setRecusando(null)}>Voltar</Button>
            <Button variant="destructive" className="h-11 flex-1" disabled={ocupado} data-testid="aprovar-confirmar-recusa" onClick={() => void confirmarRecusa()}>Recusar com o motivo</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* a prévia do aprovar (a RPC com p_simular): o que vai ser aprovado, antes de gravar */}
      <Dialog open={previa !== null} onOpenChange={(v) => { if (!v && !ocupado) setPrevia(null); }}>
        <DialogContent className="max-w-[420px]" data-testid="aprovar-previa">
          <DialogHeader>
            <DialogTitle className="text-[14px]">Aprovar {previa?.n ?? 0} {previa?.n === 1 ? 'pagamento' : 'pagamentos'}?</DialogTitle>
            <DialogDescription className="text-[12px] tabular-nums">Total {formatMoeda(previa?.total ?? 0)}. Depois, libere no app do banco.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="h-11 w-[120px]" disabled={ocupado} onClick={() => setPrevia(null)}>Voltar</Button>
            <Button className="h-11 flex-1" disabled={ocupado} data-testid="aprovar-confirmar" onClick={() => void confirmarAprovar()}>Confirmar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* a linha da fila: celular = cartão (☐ | fornecedor | valor; embaixo onde/vence e os selos); md+ = uma linha (26px; o nome comprido QUEBRA, nunca "…" fora de tabela) em colunas fixas (px
   medidos: data dd/mm/aaaa 74, os selos com o motivo 260, o valor no teto "R$ 99.999.999,99" 112), o fornecedor e o "onde" cedem quebrando */
const GRADE_DO_ITEM = 'mb-1.5 grid grid-cols-[22px_1fr_auto] gap-x-1.5 rounded-lg border px-2 py-1.5 text-[12px] '
  + 'md:mb-1 md:min-h-[26px] md:grid-cols-[22px_minmax(0,1fr)_minmax(0,320px)_74px_260px_112px] md:items-center md:py-1';

function ListaDeAlertas({ alertas }: { alertas: Alerta[] | null }) {
  if (alertas === null) return <div className="p-3 text-[12px] text-muted-foreground">Lendo os alertas…</div>;
  if (alertas.length === 0) return <div className="p-3 text-[12px] text-muted-foreground" data-testid="aprovar-sem-alerta">Nenhum alerta neste mês.</div>;
  return (
    <div data-testid="aprovar-alertas">
      {alertas.map((a, i) => (
        <div key={`${a.alerta}-${a.lancamentoId}-${i}`} className="mb-1.5 grid grid-cols-[1fr_auto] gap-x-2 rounded-lg border px-2 py-1.5 text-[12px]">
          <span className={`font-semibold ${a.alerta === 'pago_sem_aprovacao' ? 'text-rose-800' : 'text-amber-800'}`}>{ROTULO_DO_ALERTA[a.alerta] ?? a.alerta}</span>
          <span className="whitespace-nowrap text-right tabular-nums">{formatMoeda(Math.abs(a.valor))}</span>
          <span className="min-w-0 break-words text-[11px] text-muted-foreground" title={a.fornecedor ?? ''}>{a.fornecedor ?? 'Sem fornecedor'}{a.data ? <span className="whitespace-nowrap"> · {brData(a.data)}</span> : null}</span>
          <span className="whitespace-nowrap text-right text-[11px] tabular-nums text-muted-foreground">
            {a.alerta === 'pago_diferente' && a.valorAprovado !== null ? `aprovado ${formatMoeda(Math.abs(a.valorAprovado))}` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}
