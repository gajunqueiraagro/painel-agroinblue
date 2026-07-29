import { useEffect, useMemo, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Wallet, Lock, X, Check, ChevronLeft, ChevronRight, Trash2, Bookmark, Sparkles, Calendar, Building2, RotateCcw } from 'lucide-react';
import { useOperacaoComercial, type OcEnvelope, type OcPartePayload, type OcRascunhoPayload } from '@/hooks/useOperacaoComercial';
import { usePlanoContasOC } from '@/hooks/usePlanoContasOC';
import { useComponentesFinanceiros } from '@/hooks/useComponentesFinanceiros';
import type { DraftOC, ModalOCCtx, MovOption } from './tipos';
import { TIPO_OC_LABEL } from './tipos';
import { AbaOperacao } from './abas/AbaOperacao';
import { AbaLotes } from './abas/AbaLotes';
import { AbaNegociacao } from './abas/AbaNegociacao';
import { AbaFinanceiro } from './abas/AbaFinanceiro';
import { AbaDocumentos } from './abas/AbaDocumentos';
import { AbaAuditoria } from './abas/AbaAuditoria';

const WIZARD = [
  { n: 1, label: 'Operação' },
  { n: 2, label: 'Lotes Comerciais' },
  { n: 3, label: 'Negociação' },
  { n: 4, label: 'Financeiro' },
  { n: 5, label: 'Documentos' },
  { n: 6, label: 'Auditoria' },
];

const draftInicial = (): DraftOC => ({
  tipo_operacao: 'compra',
  data_operacao: new Date().toISOString().slice(0, 10),
  contraparte_id: null,
  contraparte_nome: null,
  observacoes: '',
  numero_documento: '',
  fazendaScopeId: null,
  fazenda_id: null,
  movimentacoes: [],
  tipo_precificacao: 'arroba_viva',
  preco_unitario: '',
  condicao_pagamento: '',
  data_pagamento_prevista: '',
  qtd_negociada: '',
  categoria_negociada: '',
  peso_negociado_kg: '',
  peso_negociado_soberano: 'medio',
  valor_estimado: '',
  valor_acordado: '',
  parcelas: [],
});

const num = (s: string): number => {
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export function ModalOperacaoComercial({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? '';
  const rpc = useOperacaoComercial();
  const plano = usePlanoContasOC(clienteId);
  const componentes = useComponentesFinanceiros();

  const [draft, setDraft] = useState<DraftOC>(draftInicial);
  const [op, setOp] = useState<OcEnvelope | null>(null);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [movs, setMovs] = useState<MovOption[]>([]);
  const [eventos, setEventos] = useState<Record<string, unknown>[]>([]);
  const [responsavelSnapshot, setResponsavelSnapshot] = useState<string | null>(null);

  const patch = useCallback((p: Partial<DraftOC>) => setDraft(prev => ({ ...prev, ...p })), []);

  const reset = useCallback(() => {
    setDraft(draftInicial());
    setOp(null);
    setStep(1);
    setMovs([]);
    setEventos([]);
    setResponsavelSnapshot(null);
  }, []);

  // Movimentações candidatas do tipo escolhido (o vínculo é feito na criação).
  useEffect(() => {
    if (!open || !clienteId) return;
    let cancelled = false;
    (supabase as any)
      .from('lancamentos')
      .select('id, data, quantidade, categoria, peso_medio_kg, fazenda_id, fazendas(nome)')
      .eq('cliente_id', clienteId)
      .eq('tipo', draft.tipo_operacao)
      .order('data', { ascending: false })
      .limit(100)
      .then(({ data, error }: { data: any[] | null; error: unknown }) => {
        if (cancelled) return;
        if (error) { setMovs([]); return; }
        setMovs((data ?? []).map((m) => {
          const pm = m.peso_medio_kg ?? null;
          return {
            id: m.id,
            data: m.data,
            categoria: m.categoria,
            quantidade: m.quantidade ?? 0,
            pesoMedioKg: pm,
            pesoTotalKg: pm != null ? pm * (m.quantidade ?? 0) : null,
            fazendaId: m.fazenda_id ?? null,
            fazendaNome: m.fazendas?.nome ?? null,
          } as MovOption;
        }));
      });
    return () => { cancelled = true; };
  }, [open, clienteId, draft.tipo_operacao]);

  // Derivados
  const selMovs = useMemo(() => movs.filter(m => draft.movimentacoes.includes(m.id)), [movs, draft.movimentacoes]);
  const fazendasDoLote = useMemo(
    () => Array.from(new Set(selMovs.map(m => m.fazendaNome).filter((v): v is string => !!v))),
    [selMovs],
  );
  const fazendaLabel = fazendasDoLote.length === 1 ? fazendasDoLote[0]
    : fazendasDoLote.length > 1 ? 'Múltiplas fazendas' : '—';

  // Resumos derivados SÓ das partes (espelham a derivação soberana do motor: valor_bruto =
  // Σ principal incluído; valor_total = bruto + acréscimos − descontos). O frontend NÃO
  // converte peso→arroba (fator de negócio): a precificação é apenas representada; qualquer
  // conversão de unidade permanece no domínio (RPC/backend) ou aguarda definição de produto.
  const totalDescontos = draft.parcelas.filter(p => p.incluso_no_total && p.natureza === 'deducao').reduce((a, p) => a + p.valor, 0);
  const totalAcrescimos = draft.parcelas.filter(p => p.incluso_no_total && p.natureza === 'acrescimo').reduce((a, p) => a + p.valor, 0);
  const valorBruto = draft.parcelas.filter(p => p.incluso_no_total && p.natureza === 'principal').reduce((a, p) => a + p.valor, 0);
  const totalLiquido = valorBruto + totalAcrescimos - totalDescontos;

  // Partes = fonte financeira soberana. componente = codigo do catálogo (identidade
  // estável). Sem sequência/quantidade/resumos: o motor os deriva por componente.
  const partesPayload = (): OcPartePayload[] =>
    draft.parcelas.map(p => ({
      natureza: p.natureza,
      componente: p.componente,
      valor: p.valor,
      incluso_no_total: p.incluso_no_total,
      descricao: p.descricao || null,
      plano_conta_id: p.plano_conta_id,
      macro_custo: p.macro_custo, grupo_custo: p.grupo_custo, centro_custo: p.centro_custo, subcentro: p.subcentro,
    }));

  // Payload no contrato vigente (§3). Chaves omitidas preservam o valor no banco (padrão
  // 02A); os 7 campos de abate (02B) NÃO são enviados. observacoes é fonte única (aba 1 e
  // aba Negociação escrevem no mesmo campo). peso: só o soberano leva o valor; o outro fica
  // NULL e o motor concilia. cenario fixo 'realizado' (fluxo atual do modal).
  const rascunhoPayload = (): OcRascunhoPayload => {
    const qtd = Math.trunc(num(draft.qtd_negociada));
    const peso = num(draft.peso_negociado_kg) || null;
    return {
      tipo_operacao: draft.tipo_operacao,
      data_operacao: draft.data_operacao,
      cenario: 'realizado',
      fazenda_id: draft.fazenda_id,
      contraparte_id: draft.contraparte_id,
      qtd_negociada: qtd > 0 ? qtd : null,
      categoria_negociada: draft.categoria_negociada.trim() || null,
      peso_medio_negociado_kg: peso != null && draft.peso_negociado_soberano === 'medio' ? peso : null,
      peso_total_negociado_kg: peso != null && draft.peso_negociado_soberano === 'total' ? peso : null,
      peso_negociado_soberano: peso != null ? draft.peso_negociado_soberano : null,
      tipo_precificacao: draft.tipo_precificacao || null,
      preco_unitario: num(draft.preco_unitario) || null,
      condicao_pagamento: draft.condicao_pagamento || null,
      data_pagamento_prevista: draft.data_pagamento_prevista || null,
      valor_estimado: num(draft.valor_estimado) || null,
      valor_acordado: num(draft.valor_acordado) || null,
      numero_documento: draft.numero_documento.trim() || null,
      observacoes: draft.observacoes.trim() || null,
      movimentacoes: draft.movimentacoes,
      partes: partesPayload(),
    };
  };

  // Campos do cadastro mínimo (§5) vazios no formulário — SÓ para a mensagem do aviso do
  // §8.4; a decisão de completude é sempre o `rascunho` do envelope, nunca este cálculo.
  const camposMinimosFaltantes = (): string[] => {
    const f: string[] = [];
    if (!draft.tipo_operacao) f.push('Tipo da operação');
    if (!draft.data_operacao) f.push('Data da operação');
    if (!draft.fazenda_id) f.push('Fazenda');
    if (!draft.contraparte_id) f.push('Contraparte');
    if (!(Math.trunc(num(draft.qtd_negociada)) > 0)) f.push('Quantidade negociada');
    if (!draft.categoria_negociada.trim()) f.push('Categoria negociada');
    if (!draft.tipo_precificacao) f.push('Tipo de precificação');
    if (!(num(draft.preco_unitario) > 0)) f.push('Preço unitário');
    return f;
  };

  const recarregarEstado = useCallback(async (operacaoId: string) => {
    const estado = await rpc.carregarOperacao(operacaoId, clienteId).catch(() => null);
    if (estado) {
      setEventos(estado.eventos);
      setResponsavelSnapshot(estado.operacao.responsavel_nome_snapshot ?? null);
    }
  }, [rpc, clienteId]);

  // Núcleo de persistência (passos 1–2 do §8): salva o rascunho, readota o envelope soberano
  // (setOp) e recarrega o estado. Não gerencia `saving` nem toast de sucesso — quem chama
  // decide (salvarRascunho: toast; concluir: encadeia o confirmar).
  const persistirRascunho = async (): Promise<OcEnvelope | null> => {
    if (!clienteId) return null;
    // PR-NAV-CONTEXTO-FAZENDA-01A — fazenda REAL obrigatória para persistir (Global abre normalmente,
    //   mas não cria registro órfão). draft.fazenda_id é null ou UUID válido — nunca '__global__'/'__atual__'.
    if (!draft.fazenda_id) { toast.error('Selecione a fazenda da operação antes de salvar.'); return null; }
    try {
      const env = await rpc.salvarRascunho(op?.operacao_id ?? null, clienteId, op?.versao ?? null, rascunhoPayload());
      setOp(env);
      await recarregarEstado(env.operacao_id);
      return env;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar rascunho.');
      return null;
    }
  };

  // Ação "Salvar rascunho" (separada): executa apenas os passos 1–2 do §8.
  const salvarRascunho = async (): Promise<OcEnvelope | null> => {
    setSaving(true);
    try {
      const env = await persistirRascunho();
      if (env) toast.success('Rascunho salvo.');
      return env;
    } finally {
      setSaving(false);
    }
  };

  // Reabrir: fechada -> programada. Bloqueada pelo motor se houver título soberano
  // (realizado/agendado/conciliado) — nesse caso a mensagem da RPC é exibida sem mutação.
  const reabrirOperacao = async () => {
    if (!op) return;
    setSaving(true);
    try {
      const env = await rpc.reabrir(op.operacao_id, clienteId, op.versao, 'Reaberta pelo operador');
      setOp(env);
      await recarregarEstado(env.operacao_id);
      if (env.status_comercial === 'programada') toast.success('Operação reaberta para edição.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao reabrir a operação.');
    } finally {
      setSaving(false);
    }
  };

  // Concluir (§8): 1 clique = salvar → readotar envelope → se completo (rascunho=false),
  // confirmar com a versão readotada e recarregar; se incompleto, aviso dos faltantes e NÃO
  // confirma. A decisão é SEMPRE o envelope; a lista de faltantes é só client-side para a
  // mensagem. Não chama sincronizar (fora do §8). Erro do motor no confirmar é exibido
  // verbatim (mensagem do P0001), sem retry.
  const concluir = async () => {
    setSaving(true);
    try {
      const env = await persistirRascunho();
      if (!env) return;
      if (env.rascunho === false) {
        const conf = await rpc.confirmar(env.operacao_id, clienteId, env.versao);
        setOp(conf);
        if (!conf.ok) { toast.error('Não foi possível confirmar a operação.'); return; }
        await recarregarEstado(conf.operacao_id);
        toast.success('Operação concluída (fechada).');
      } else {
        toast.warning(`Cadastro mínimo incompleto. Faltam: ${camposMinimosFaltantes().join(', ')}.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao concluir.');
    } finally {
      setSaving(false);
    }
  };

  const cancelarOperacao = async () => {
    if (!op) { onOpenChange(false); reset(); return; }
    setSaving(true);
    try {
      const env = await rpc.cancelar(op.operacao_id, clienteId, op.versao, 'Cancelada pelo operador');
      setOp(env);
      if (env.status_comercial === 'cancelada') { toast.success('Operação cancelada.'); onOpenChange(false); reset(); }
      else toast.warning(`Não foi possível cancelar: financeiro "${env.status_financeiro}".`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao cancelar.');
    } finally {
      setSaving(false);
    }
  };

  const ctx: ModalOCCtx = {
    clienteId, draft, patch, op, saving, responsavelSnapshot,
    movsReadonly: !!op, movs, eventos, plano, componentes,
    fazendaLabel, fazendasDoLote, valorBruto,
    totalDescontos, totalAcrescimos, totalLiquido,
    documentosDisponivel: false,
  };

  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const isLast = step === 6;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-6xl p-0 gap-0 overflow-hidden">
        {/* HEADER */}
        <div className="bg-primary text-primary-foreground px-6 py-4 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-yellow-400" />
              <h2 className="text-lg font-bold">Operação Comercial</h2>
              <span className="rounded-md border border-white/40 px-2 py-0.5 text-xs">{TIPO_OC_LABEL[draft.tipo_operacao]}</span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-white/80">
              <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {draft.data_operacao.split('-').reverse().join('/')}</span>
              <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {fazendaLabel}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-md border border-yellow-400 text-yellow-400 px-2 py-1 text-xs flex items-center gap-1">
              <Lock className="h-3 w-3" /> Mês fechado
            </span>
            <button onClick={() => { onOpenChange(false); reset(); }} className="text-white/80 hover:text-white"><X className="h-5 w-5" /></button>
          </div>
        </div>

        {/* WIZARD */}
        <div className="bg-card border-b px-6 py-3 flex items-center justify-between overflow-x-auto">
          {WIZARD.map(w => {
            const done = w.n < step;
            const active = w.n === step;
            return (
              <button key={w.n} onClick={() => setStep(w.n)} className="flex items-center gap-2 shrink-0 px-2">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  active ? 'bg-primary text-primary-foreground' : done ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                  {done ? <Check className="h-3.5 w-3.5" /> : w.n}
                </span>
                <span className={`text-sm ${active ? 'font-semibold text-primary border-b-2 border-primary pb-0.5' : 'text-muted-foreground'}`}>{w.label}</span>
              </button>
            );
          })}
        </div>

        {/* CORPO: área principal + painel lateral */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 p-6 max-h-[62vh] overflow-y-auto bg-muted/30">
          <div className="min-w-0">
            {step === 1 && <AbaOperacao ctx={ctx} />}
            {step === 2 && <AbaLotes ctx={ctx} />}
            {step === 3 && <AbaNegociacao ctx={ctx} />}
            {step === 4 && <AbaFinanceiro ctx={ctx} />}
            {step === 5 && <AbaDocumentos ctx={ctx} />}
            {step === 6 && <AbaAuditoria ctx={ctx} />}
          </div>

          {/* PAINEL LATERAL — Resumo da Operação */}
          <aside className="rounded-lg border bg-card p-4 h-fit">
            <h3 className="font-bold mb-3">Resumo da Operação</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Tipo</dt><dd className="font-medium">{TIPO_OC_LABEL[draft.tipo_operacao]}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Data</dt><dd className="font-medium">{draft.data_operacao.split('-').reverse().join('/')}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Fazenda</dt><dd className="font-medium">{fazendaLabel}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Contraparte</dt><dd className="font-medium truncate max-w-[160px]">{draft.contraparte_nome ?? '—'}</dd></div>
              <div className="flex justify-between items-center"><dt className="text-muted-foreground">Status</dt>
                <dd><span className="rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs">{op?.status_comercial ?? 'programada'}</span></dd></div>
            </dl>
            <div className="my-3 border-t" />
            {(totalDescontos > 0 || totalAcrescimos > 0) && (
              <dl className="space-y-1 text-sm mb-2">
                <div className="flex justify-between"><dt className="text-muted-foreground">Valor bruto</dt><dd>{brl(valorBruto)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Descontos</dt><dd className="text-destructive">- {brl(totalDescontos)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Acréscimos</dt><dd className="text-green-600">+ {brl(totalAcrescimos)}</dd></div>
              </dl>
            )}
            <div className="text-xs text-muted-foreground">Valor total da operação</div>
            <div className="text-2xl font-bold text-primary">{brl(totalLiquido)}</div>
          </aside>
        </div>

        {/* RODAPÉ */}
        <div className="bg-primary px-6 py-3 flex items-center justify-between gap-3">
          <Button variant="outline" onClick={cancelarOperacao} disabled={saving}
            className="border-destructive text-destructive hover:bg-destructive/10 gap-1.5 bg-transparent">
            <Trash2 className="h-4 w-4" /> Cancelar operação
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => { onOpenChange(false); reset(); }} className="text-white hover:bg-white/10">Fechar</Button>
            {op?.status_comercial === 'fechada' && (
              <Button variant="secondary" onClick={reabrirOperacao} disabled={saving} className="gap-1.5">
                <RotateCcw className="h-4 w-4" /> {saving ? 'Reabrindo…' : 'Reabrir'}
              </Button>
            )}
            {/* PR-NAV-CONTEXTO-FAZENDA-01A — sem fazenda real não persiste (evita registro órfão em Global);
                a mensagem fica no hint do campo Fazenda (padrão do projeto). */}
            <Button variant="secondary" onClick={salvarRascunho} disabled={saving || op?.status_comercial === 'fechada' || !draft.fazenda_id}
              className="gap-1.5 disabled:opacity-60">
              <Bookmark className="h-4 w-4" /> {saving ? 'Salvando…' : 'Salvar rascunho'}
            </Button>
            {!isLast ? (
              <div className="flex items-center gap-1 rounded-md bg-card px-1">
                <Button variant="ghost" size="sm" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1} className="gap-1"><ChevronLeft className="h-4 w-4" /> Anterior</Button>
                <Button variant="ghost" size="sm" onClick={() => setStep(s => Math.min(6, s + 1))} className="gap-1 text-primary">Próximo <ChevronRight className="h-4 w-4" /></Button>
              </div>
            ) : (
              <Button onClick={concluir} disabled={saving || !draft.fazenda_id} className="bg-white text-primary hover:bg-white/90 gap-1.5 disabled:opacity-60">
                Concluir operação <Check className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Botão de entrada do fluxo definitivo (substitui o modal MVP do OC-03).
export function NovaOperacaoComercialButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="default" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Sparkles className="h-4 w-4" /> Nova Operação Comercial
      </Button>
      <ModalOperacaoComercial open={open} onOpenChange={setOpen} />
    </>
  );
}
