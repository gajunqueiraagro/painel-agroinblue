/**
 * "RECLASSIFICAR ITEM DA OPERACAO COMERCIAL" — OC-RECLASSIFICAR-ITEM-01 (27/09/2026, decisoes do Gabriel).
 *
 * Troca a conta do plano (e, quando a conta pede, o componente) de um item da OC — compromisso, partes vivas e titulos
 * vivos juntos. Valor, datas, pagamento, conciliacao, liquidacao, rebanho e favorecido nao mudam. Vale com a OC fechada.
 * ⚠ IRMAO DO `DesvincularOperacaoDialog`: mesma escala (cabecalho 36px navy, aside ~270px, rodape 32px navy), mesmas
 *   pecas (`Secao`, `Par`) e o mesmo seletor de subcentro da casa. O aside e' a RPC com `p_simular`.
 * ⚠ SEM TOAST (UX-TOAST-01): recusa da simulacao no aside, recusa da gravacao ao lado do botao, motivo ao lado do botao.
 * ⚠ O SELETOR ABRE O PLANO INTEIRO DA DIRECAO DO ITEM (decisao 2) — saida com saida, entrada com entrada. A direcao e' a
 *   da conta atual do compromisso; a RPC confere de novo.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Tags, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { notificarLancamentosMudaram, type ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import { PlanoSubcentroSelect } from '@/components/shared/PlanoSubcentroSelect';
import { DIVIDENDO_MACRO, loadPlanoContasCompleto, planoToClassificacoes } from '@/lib/financeiro/planoContasBuilder';
import { Secao, Par } from '@/components/financeiro-v2/modalVinculoOC';
import { rotuloComponente, mensagemDeErro } from '@/lib/oc/vincularLancamento';
import {
  reclassificarItemOC, resumoDaReclassificacao, ehReclassificacao, carregarMapaOC, opcoesDeComponente,
  type RespostaReclassificacao, type LinhaMapaOC,
} from '@/lib/oc/reclassificarItem';

export interface ItemReclassificavel {
  compromissoId: string;
  descricao: string | null;
  natureza: string | null;
  componente: string | null;
  planoContaId: string | null;
  valor: number;
}

interface Props {
  open: boolean;
  item: ItemReclassificavel;
  /** "a OC" ou o rotulo que a aba ja' usa — vai no cabecalho. */
  rotuloOperacao: string;
  clienteId: string;
  onClose: () => void;
  /** Depois de gravar: o chamador rele a OC (versao nova) e a negociacao. */
  onReclassificado?: () => void;
}

const brl = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function ReclassificarItemDialog({ open, item, rotuloOperacao, clienteId, onClose, onReclassificado }: Props) {
  const [plano, setPlano] = useState<ClassificacaoItem[]>([]);
  const [mapa, setMapa] = useState<LinhaMapaOC[]>([]);
  const [subcentroNovo, setSubcentroNovo] = useState('');
  const [planoNovoId, setPlanoNovoId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [componente, setComponente] = useState<string | null>(null);
  const [sim, setSim] = useState<RespostaReclassificacao | null>(null);
  const [simulando, setSimulando] = useState(false);
  const [erroSim, setErroSim] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [erroGravar, setErroGravar] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  /* Carga: o plano (so' linhas COM chave — a RPC recebe `plano_conta_id`) e o mapa de componentes. */
  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    setSubcentroNovo(''); setPlanoNovoId(null); setBusca(''); setComponente(null);
    setMotivo(''); setSim(null); setErroSim(null); setErroGravar(null);
    Promise.all([loadPlanoContasCompleto(clienteId), carregarMapaOC()])
      .then(([p, m]) => {
        if (cancelado) return;
        setPlano(planoToClassificacoes(p).filter(c => !!c.id && c.macro_custo !== DIVIDENDO_MACRO));
        setMapa(m);
      })
      .catch(e => { if (!cancelado) setErroSim(mensagemDeErro(e)); });
    return () => { cancelado = true; };
  }, [open, clienteId]);

  /* A conta atual do item diz a DIRECAO que o seletor oferece. */
  const contaAtual = useMemo(() => plano.find(c => c.id === item.planoContaId) ?? null, [plano, item.planoContaId]);
  const direcao = contaAtual?.tipo_operacao ?? null;
  const opcoes = useMemo(() => opcoesDeComponente(mapa, subcentroNovo || null, item.natureza),
    [mapa, subcentroNovo, item.natureza]);
  /* Um componente so': ele, sem pergunta; varios: o operador escolhe (o atual ja' marcado se for uma das opcoes). */
  const componenteEfetivo = opcoes.length === 1 ? opcoes[0] : opcoes.length > 1 ? componente : null;
  const faltaComponente = opcoes.length > 1 && !componente;

  /* Simulacao: refeita a cada troca da conta ou do componente. */
  useEffect(() => {
    if (!open || !planoNovoId || faltaComponente) { setSim(null); return; }
    let cancelado = false;
    setSimulando(true); setErroSim(null);
    reclassificarItemOC({ compromissoId: item.compromissoId, planoContaId: planoNovoId, componente: componenteEfetivo,
      motivo: null, simular: true })
      .then(r => { if (!cancelado) setSim(r); })
      .catch(e => { if (!cancelado) { setSim(null); setErroSim(mensagemDeErro(e)); } })
      .finally(() => { if (!cancelado) setSimulando(false); });
    return () => { cancelado = true; };
  }, [open, item.compromissoId, planoNovoId, componenteEfetivo, faltaComponente]);

  const pronto = ehReclassificacao(sim);
  const semMudanca = !!sim && sim.acao === 'sem_mudanca';
  const motivoOk = motivo.trim().length > 0;
  const resumo = useMemo(() => (ehReclassificacao(sim) ? resumoDaReclassificacao(sim) : []), [sim]);

  function escolherConta(sub: string, cls?: ClassificacaoItem) {
    setSubcentroNovo(sub);
    setPlanoNovoId(cls?.id ?? null);
    const novas = opcoesDeComponente(mapa, sub, item.natureza);
    setComponente(item.componente && novas.includes(item.componente) ? item.componente : null);
    setErroGravar(null);
  }

  async function confirmar() {
    if (!ehReclassificacao(sim) || !motivoOk || !planoNovoId) return;
    setGravando(true); setErroGravar(null);
    try {
      const r = await reclassificarItemOC({ compromissoId: item.compromissoId, planoContaId: planoNovoId,
        componente: componenteEfetivo, motivo: motivo.trim() });
      if (!ehReclassificacao(r)) { setSim(r); return; }
      /* FIN-V2-REFRESH-02: escrita por fora do hook avisa a lista do Financeiro, e so' no sucesso. */
      notificarLancamentosMudaram(clienteId);
      onClose();
      onReclassificado?.();
    } catch (e) {
      setErroGravar(mensagemDeErro(e));
    } finally {
      setGravando(false);
    }
  }

  const dicaRodape = !planoNovoId ? 'Escolha a conta nova'
    : faltaComponente ? 'Escolha o componente'
      : semMudanca ? 'A conta e o componente já são estes'
        : pronto && !motivoOk ? 'Informe o motivo' : null;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !gravando) onClose(); }}>
      <DialogContent
        className="w-[96vw] max-w-[860px] max-h-[calc(100vh-32px)] p-0 gap-0 overflow-hidden flex flex-col [&>button.absolute]:hidden"
        aria-describedby={undefined}
      >
        {/* cabecalho 36px */}
        <div className="h-9 shrink-0 bg-primary text-primary-foreground px-4 flex items-center gap-3">
          <Tags className="h-3.5 w-3.5 shrink-0" />
          <DialogTitle className="shrink-0 text-[13px] font-semibold leading-none">Reclassificar item da operação</DialogTitle>
          <span className="min-w-0 truncate text-[10px] text-primary-foreground/80">
            Muda só a conta do plano — valor, datas, pagamento e conciliação não mudam.
          </span>
          <button type="button" onClick={onClose} disabled={gravando} className="ml-auto shrink-0 text-white/80 hover:text-white"
            title="Fechar" aria-label="Fechar"><X className="h-3.5 w-3.5" /></button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[1fr_270px]">
          <div className="min-h-0 overflow-y-auto px-4 py-3 space-y-4">
            <Secao titulo="Item">
              <div className="grid grid-cols-4 gap-x-3 gap-y-1.5 rounded-md border bg-muted/20 px-2.5 py-2">
                <div className="col-span-2"><Par rotulo="Descrição" valor={item.descricao ?? rotuloComponente(item.componente ?? '—')} /></div>
                <Par rotulo="Valor" valor={<span className="font-medium tabular-nums">{brl(item.valor)}</span>} />
                <Par rotulo="Componente" valor={rotuloComponente(item.componente ?? '—')} />
                <div className="col-span-2"><Par rotulo="Subcentro atual" valor={contaAtual?.subcentro ?? '—'} /></div>
                <div className="col-span-2"><Par rotulo="Operação" valor={rotuloOperacao} /></div>
              </div>
            </Secao>

            <Secao titulo="Nova conta"
              extra={<span className="text-[10px] text-muted-foreground">
                {direcao === '1-Entradas' ? 'contas de entrada' : direcao === '2-Saídas' ? 'contas de saída' : ''}
              </span>}>
              <div className="flex items-center gap-2" data-testid="recl-conta">
                <div className="w-[340px]">
                  <PlanoSubcentroSelect
                    value={subcentroNovo}
                    onChange={setSubcentroNovo}
                    onSelected={escolherConta}
                    classificacoes={plano}
                    tipoOperacao={direcao ?? ''}
                    search={busca}
                    onSearchChange={setBusca}
                    size="compact"
                    disabled={!direcao}
                  />
                </div>
                {opcoes.length > 1 && (
                  <Select value={componente ?? undefined} onValueChange={v => { setComponente(v); setErroGravar(null); }}>
                    <SelectTrigger className="h-5 w-[200px] px-1.5 text-[11px]" data-testid="recl-componente">
                      <SelectValue placeholder="Escolha o componente" />
                    </SelectTrigger>
                    <SelectContent>
                      {opcoes.map(c => <SelectItem key={c} value={c}>{rotuloComponente(c)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {faltaComponente && (
                <p className="text-[10px] text-destructive" data-testid="recl-falta-componente">
                  Esta conta tem mais de um componente — escolha qual é este item.
                </p>
              )}
            </Secao>

            <Secao titulo="Motivo">
              <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} data-testid="recl-motivo"
                placeholder="Por que este item muda de conta (obrigatório — vai para a trilha da OC)"
                className="min-h-0 text-[11px]" />
            </Secao>
          </div>

          <aside className="flex min-h-0 flex-col border-l bg-card text-[10px]" data-testid="recl-resumo">
            <div className="shrink-0 border-b bg-accent/40 px-2.5 py-[5px] text-[10px] font-medium uppercase tracking-wide text-primary">
              O que vai acontecer
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2 space-y-2">
              {!planoNovoId && !erroSim && <p className="text-muted-foreground">Escolha a conta nova para ver o efeito.</p>}
              {planoNovoId && faltaComponente && <p className="text-muted-foreground">Escolha o componente para ver o efeito.</p>}
              {simulando && <p className="flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Calculando…</p>}
              {!simulando && erroSim && <p className="text-destructive" data-testid="recl-erro-sim">{erroSim}</p>}
              {!simulando && semMudanca && <p className="text-muted-foreground">A conta e o componente já são estes — nada a mudar.</p>}
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
          <div className="flex min-w-0 items-center gap-2">
            {erroGravar
              ? <span className="min-w-0 truncate text-[10px] text-red-200" title={erroGravar} data-testid="recl-erro-gravar">{erroGravar}</span>
              : dicaRodape && <span className="text-[10px] text-white/80">{dicaRodape}</span>}
            <Button type="button" variant="secondary" onClick={confirmar} data-testid="recl-confirmar"
              disabled={!pronto || !motivoOk || gravando || simulando}
              title={dicaRodape ?? undefined}
              className="h-[22px] px-[9px] text-[10px] gap-1">
              {gravando && <Loader2 className="h-3 w-3 animate-spin" />}
              Reclassificar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
