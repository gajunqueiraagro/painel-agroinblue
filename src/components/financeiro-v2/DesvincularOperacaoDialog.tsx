/**
 * "DESVINCULAR DA OPERACAO COMERCIAL" — OC-DESVINCULAR-01.
 *
 * O lancamento FICA — valor, pagamento e conciliacao nao mudam; ele deixa de ser titulo da OC. O
 * compromisso do item e' cancelado (parcela unica) ou reduzido (varias), e o recebido da OC cai.
 * D4: "Reclassificar para" e' OPCIONAL; vazio mantem a classificacao atual.
 * ⚠ QUEM DECIDE E' O BANCO: o aside vem de `oc_desvincular_lancamento` com `p_simular` — o mesmo
 *   caminho da gravacao, desfeito. Esta tela so' mostra e escolhe.
 * ⚠ NASCEU DO DIALOGO DO VINCULAR, nao do zero: selo, secao e par vem de `modalVinculoOC` (movidos de
 *   la' verbatim), e a escala e' a mesma (cabecalho 36px navy, aside ~270px, rodape 32px navy).
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Unlink, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { notificarLancamentosMudaram, type ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import { PlanoSubcentroSelect } from '@/components/shared/PlanoSubcentroSelect';
import { loadPlanoContasCompleto, planoToClassificacoes } from '@/lib/financeiro/planoContasBuilder';
import { Secao, Par } from '@/components/financeiro-v2/modalVinculoOC';
import { rotuloOC, dataBr, mensagemDeErro } from '@/lib/oc/vincularLancamento';
import {
  desvincularLancamentoOC, resumoDoDesvinculo, ehDesvinculo, ehRecusaDesvinculo,
  type RespostaDesvinculo, type DesvinculoFeito,
} from '@/lib/oc/desvincularLancamento';

interface Props {
  open: boolean;
  lancamentoId: string;
  operacaoId: string;
  clienteId: string;
  onClose: () => void;
  /** Depois de gravar: o chamador recarrega o que e' dele (a OC, o detalhe do lancamento). */
  onDesvinculado?: (r: DesvinculoFeito) => void;
}

interface CabecalhoLanc { descricao: string | null; tipo_operacao: string; valor: number; data_competencia: string | null; subcentro: string | null }
interface CabecalhoOC { numero_documento: string | null; data_operacao: string }

const brl = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function DesvincularOperacaoDialog({ open, lancamentoId, operacaoId, clienteId, onClose, onDesvinculado }: Props) {
  const [lanc, setLanc] = useState<CabecalhoLanc | null>(null);
  const [oc, setOc] = useState<CabecalhoOC | null>(null);
  const [plano, setPlano] = useState<ClassificacaoItem[]>([]);
  const [subcentroNovo, setSubcentroNovo] = useState('');
  const [planoNovoId, setPlanoNovoId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [sim, setSim] = useState<RespostaDesvinculo | null>(null);
  const [simulando, setSimulando] = useState(false);
  const [erroSim, setErroSim] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [gravando, setGravando] = useState(false);

  /* Carga: cabecalho do lancamento, da OC e o plano (so' linhas COM chave — a RPC recebe `plano_conta_id`). */
  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    setLanc(null); setOc(null); setSubcentroNovo(''); setPlanoNovoId(null); setBusca(''); setMotivo(''); setSim(null); setErroSim(null);
    (async () => {
      const [l, o, p] = await Promise.all([
        supabase.from('financeiro_lancamentos_v2')
          .select('descricao, tipo_operacao, valor, data_competencia, subcentro').eq('id', lancamentoId).maybeSingle(),
        supabase.from('zoo_operacoes_comerciais')
          .select('numero_documento, data_operacao').eq('id', operacaoId).maybeSingle(),
        loadPlanoContasCompleto(clienteId),
      ]);
      if (cancelado) return;
      if (l.data) setLanc({ descricao: l.data.descricao, tipo_operacao: l.data.tipo_operacao, valor: Number(l.data.valor),
        data_competencia: l.data.data_competencia, subcentro: l.data.subcentro });
      if (o.data) setOc({ numero_documento: o.data.numero_documento, data_operacao: o.data.data_operacao });
      setPlano(planoToClassificacoes(p).filter(c => !!c.id));
    })().catch(e => { if (!cancelado) setErroSim(mensagemDeErro(e)); });
    return () => { cancelado = true; };
  }, [open, lancamentoId, operacaoId, clienteId]);

  /* Simulacao: refeita a cada troca da conta nova. */
  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    setSimulando(true); setErroSim(null);
    desvincularLancamentoOC({ operacaoId, versao: 0, lancamentoId, motivo: null, planoContaId: planoNovoId, simular: true })
      .then(r => { if (!cancelado) setSim(r); })
      .catch(e => { if (!cancelado) { setSim(null); setErroSim(mensagemDeErro(e)); } })
      .finally(() => { if (!cancelado) setSimulando(false); });
    return () => { cancelado = true; };
  }, [open, operacaoId, lancamentoId, planoNovoId]);

  const rotulo = oc ? rotuloOC(oc) : 'a OC';
  const pronto = ehDesvinculo(sim);
  const motivoOk = motivo.trim().length > 0;
  const resumo = useMemo(() => (ehDesvinculo(sim) ? resumoDoDesvinculo(sim, rotulo) : []), [sim, rotulo]);

  function escolherConta(sub: string, cls?: ClassificacaoItem) {
    setSubcentroNovo(sub);
    /* Mesma direcao do lancamento: o seletor ja' filtra por `tipoOperacao`, e a RPC recusa de novo. */
    setPlanoNovoId(cls?.id ?? null);
  }

  async function confirmar() {
    if (!ehDesvinculo(sim) || !motivoOk) return;
    setGravando(true);
    try {
      const r = await desvincularLancamentoOC({
        operacaoId, versao: sim.operacao_versao, lancamentoId, motivo: motivo.trim(), planoContaId: planoNovoId,
      });
      if (!ehDesvinculo(r)) { setSim(r); toast.error('O lançamento já não está nesta operação.'); return; }
      /* FIN-V2-REFRESH-02: escrita por fora do hook avisa a lista, e so' no sucesso. */
      notificarLancamentosMudaram(clienteId);
      toast.success(`Lançamento desvinculado da ${rotulo}.`);
      onClose();
      onDesvinculado?.(r);
    } catch (e) {
      toast.error(mensagemDeErro(e));
    } finally {
      setGravando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !gravando) onClose(); }}>
      <DialogContent
        className="w-[96vw] max-w-[860px] max-h-[calc(100vh-32px)] p-0 gap-0 overflow-hidden flex flex-col [&>button.absolute]:hidden"
        aria-describedby={undefined}
      >
        {/* cabecalho 36px */}
        <div className="h-9 shrink-0 bg-primary text-primary-foreground px-4 flex items-center gap-3">
          <Unlink className="h-3.5 w-3.5 shrink-0" />
          <DialogTitle className="shrink-0 text-[13px] font-semibold leading-none">Desvincular da operação comercial</DialogTitle>
          <span className="min-w-0 truncate text-[10px] text-primary-foreground/80">
            O lançamento fica — valor, pagamento e conciliação não mudam. Ele deixa de pertencer à {rotulo}.
          </span>
          <button type="button" onClick={onClose} disabled={gravando} className="ml-auto shrink-0 text-white/80 hover:text-white"
            title="Fechar" aria-label="Fechar"><X className="h-3.5 w-3.5" /></button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[1fr_270px]">
          <div className="min-h-0 overflow-y-auto px-4 py-3 space-y-4">
            {lanc && (
              <Secao titulo="Lançamento">
                <div className="grid grid-cols-4 gap-x-3 gap-y-1.5 rounded-md border bg-muted/20 px-2.5 py-2">
                  <div className="col-span-2"><Par rotulo="Descrição" valor={lanc.descricao ?? '—'} /></div>
                  <Par rotulo="Valor" valor={<span className="font-medium tabular-nums">{brl(lanc.valor)}</span>} />
                  <Par rotulo="Competência" valor={dataBr(lanc.data_competencia)} />
                  <div className="col-span-2"><Par rotulo="Subcentro atual" valor={lanc.subcentro ?? '—'} /></div>
                  <div className="col-span-2"><Par rotulo="Operação" valor={rotulo} /></div>
                </div>
              </Secao>
            )}

            {lanc && (
              <Secao titulo="Reclassificar para" extra={<span className="text-[10px] text-muted-foreground">opcional — vazio mantém a atual</span>}>
                <div className="flex items-center gap-2" data-testid="desv-reclassificar">
                  <div className="w-[340px]">
                    <PlanoSubcentroSelect
                      value={subcentroNovo}
                      onChange={setSubcentroNovo}
                      onSelected={escolherConta}
                      classificacoes={plano}
                      tipoOperacao={lanc.tipo_operacao}
                      search={busca}
                      onSearchChange={setBusca}
                      size="compact"
                    />
                  </div>
                  {planoNovoId && (
                    <button type="button" className="text-[10px] text-muted-foreground underline" data-testid="desv-manter"
                      onClick={() => { setSubcentroNovo(''); setPlanoNovoId(null); }}>
                      manter a atual
                    </button>
                  )}
                </div>
              </Secao>
            )}

            <Secao titulo="Motivo">
              <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} data-testid="desv-motivo"
                placeholder="Por que este lançamento não é desta operação (obrigatório — vai para a trilha da OC)"
                className="min-h-0 text-[11px]" />
            </Secao>
          </div>

          <aside className="flex min-h-0 flex-col border-l bg-card text-[10px]" data-testid="desv-resumo">
            <div className="shrink-0 border-b bg-accent/40 px-2.5 py-[5px] text-[10px] font-medium uppercase tracking-wide text-primary">
              O que vai acontecer
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2 space-y-2">
              {simulando && <p className="flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Calculando…</p>}
              {!simulando && erroSim && <p className="text-destructive">{erroSim}</p>}
              {!simulando && ehRecusaDesvinculo(sim) && <p className="text-destructive">Este lançamento não está nesta operação.</p>}
              {!simulando && pronto && (
                <dl className="space-y-1">
                  {resumo.map(l => (
                    <div key={l.rotulo} className="flex justify-between gap-2">
                      <dt className="text-muted-foreground shrink-0">{l.rotulo}</dt>
                      <dd className={cn('text-right', l.tom === 'ambar' && 'text-amber-800 dark:text-amber-300 font-medium')}>{l.valor}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </aside>
        </div>

        {/* rodape 32px */}
        <div className="h-8 shrink-0 bg-primary px-2 flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={gravando}
            className="h-[22px] px-[9px] text-[10px] text-white/90 hover:bg-white/10 hover:text-white">Cancelar</Button>
          <div className="flex items-center gap-2">
            {pronto && !motivoOk && <span className="text-[10px] text-white/80">Informe o motivo</span>}
            <Button type="button" variant="secondary" onClick={confirmar} data-testid="desv-confirmar"
              disabled={!pronto || !motivoOk || gravando || simulando}
              title={!pronto ? 'Aguarde a simulação' : !motivoOk ? 'Informe o motivo' : undefined}
              className="h-[22px] px-[9px] text-[10px] gap-1">
              {gravando && <Loader2 className="h-3 w-3 animate-spin" />}
              {`Desvincular da ${rotulo}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
