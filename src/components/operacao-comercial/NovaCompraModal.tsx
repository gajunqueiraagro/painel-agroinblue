import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { FornecedorSelect } from '@/components/shared/FornecedorSelect';
import { useOperacaoComercial, type OcEnvelope } from '@/hooks/useOperacaoComercial';
import { Sparkles } from 'lucide-react';

// PR-OC-03 — Primeiro fluxo do novo modal sobre o motor da Operação Comercial.
// MVP funcional: cada ação do usuário = UMA chamada de RPC (oc_criar_rascunho ->
// oc_confirmar -> oc_sincronizar). Sem legado, sem replace, sem gravações paralelas.
//
// Compatibilidade com a evolução (Lotes Comerciais / Ordens de Compra): entre a
// operação e as movimentações existe uma camada natural de LOTE. Este MVP já nasce
// nessa nomenclatura — trabalha com UM lote que agrupa uma ou mais movimentações —
// para não precisar redesenhar o modal quando os lotes forem oficializados.
interface MovOption {
  id: string;
  label: string;
}

export function NovaCompraModal() {
  const { clienteAtual } = useCliente();
  const { criarRascunho, confirmar, sincronizar } = useOperacaoComercial();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [op, setOp] = useState<OcEnvelope | null>(null);

  // Formulário (mínimo do MVP)
  const [dataOperacao, setDataOperacao] = useState(() => new Date().toISOString().slice(0, 10));
  const [numeroNf, setNumeroNf] = useState<string>('');
  const [contraparteId, setContraparteId] = useState<string | null>(null);
  const [loteMovIds, setLoteMovIds] = useState<string[]>([]);
  const [valor, setValor] = useState<string>('');
  const [condicaoPagamento, setCondicaoPagamento] = useState<string>('');
  const [observacoes, setObservacoes] = useState<string>('');
  const [movs, setMovs] = useState<MovOption[]>([]);

  const clienteId = clienteAtual?.id ?? '';

  // Carrega movimentações de compra existentes do cliente (o motor vincula
  // movimentações já registradas — a operação não cria o fato físico).
  useEffect(() => {
    if (!open || !clienteId) return;
    let cancelled = false;
    supabase
      .from('lancamentos')
      .select('id, data, quantidade, categoria')
      .eq('cliente_id', clienteId)
      .eq('tipo', 'compra')
      .order('data', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { toast.error('Erro ao carregar compras: ' + error.message); return; }
        setMovs((data ?? []).map(m => ({
          id: m.id,
          label: `${m.data} · ${m.quantidade} cab · ${m.categoria}`,
        })));
      });
    return () => { cancelled = true; };
  }, [open, clienteId]);

  const toggleMov = (id: string) =>
    setLoteMovIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const resetTudo = () => {
    setOp(null);
    setNumeroNf('');
    setContraparteId(null);
    setLoteMovIds([]);
    setValor('');
    setCondicaoPagamento('');
    setObservacoes('');
    setDataOperacao(new Date().toISOString().slice(0, 10));
  };

  const formValido =
    !!clienteId && !!dataOperacao && !!contraparteId && loteMovIds.length > 0 && Number(valor) > 0;

  const handleSalvarRascunho = async () => {
    if (!formValido || saving) return;
    setSaving(true);
    try {
      const env = await criarRascunho(clienteId, {
        tipo_operacao: 'compra',
        data_operacao: dataOperacao,
        contraparte_id: contraparteId,
        condicao_pagamento: condicaoPagamento || null,
        // NF vai como dado estruturado (a RPC ignora por ora; sem coluna ainda).
        // observacoes fica APENAS com o texto livre do operador — contrato limpo.
        numero_nf: numeroNf.trim() || null,
        observacoes: observacoes.trim() || null,
        movimentacoes: loteMovIds, // Lote 1: uma ou mais movimentações
        partes: [{ natureza: 'principal', componente: 'principal', valor: Number(valor) }],
      });
      setOp(env);
      toast.success('Rascunho criado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao criar rascunho.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmar = async () => {
    if (!op || saving) return;
    setSaving(true);
    try {
      const env = await confirmar(op.operacao_id, clienteId, op.versao);
      setOp(env);
      toast.success('Operação confirmada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao confirmar.');
    } finally {
      setSaving(false);
    }
  };

  const handleSincronizar = async () => {
    if (!op || saving) return;
    setSaving(true);
    try {
      const env = await sincronizar(op.operacao_id, clienteId, op.versao);
      setOp(env);
      if (env.status_financeiro === 'sincronizado') {
        toast.success('Financeiro sincronizado — títulos gerados pelo novo motor.');
      } else if (env.status_financeiro === 'divergente') {
        toast.warning(env.multi_fazenda
          ? 'Sincronizado com fazenda a classificar (múltiplas fazendas).'
          : 'Sincronização divergente — verifique o Financeiro Oficial.');
      } else {
        toast.info(`Sincronização retornou status ${env.status_financeiro}.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao sincronizar.');
    } finally {
      setSaving(false);
    }
  };

  const mesTitulos = dataOperacao.slice(0, 7);

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetTudo(); }}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm" className="gap-1.5">
          <Sparkles className="h-4 w-4" /> Nova Compra (novo motor)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Compra — Operação Comercial</DialogTitle>
          <DialogDescription>
            Fluxo novo, sobre o motor transacional. Cada passo é uma chamada única ao banco.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {op && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
              <div>Operação <span className="font-mono">{op.operacao_id.slice(0, 8)}…</span></div>
              <div>Comercial: <b>{op.status_comercial}</b> · Financeiro: <b>{op.status_financeiro}</b> · v{op.versao}</div>
            </div>
          )}

          {!op && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Data da operação</Label>
                  <Input type="date" value={dataOperacao} onChange={e => setDataOperacao(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Número da NF</Label>
                  <Input value={numeroNf} onChange={e => setNumeroNf(e.target.value)} className="h-9" placeholder="ex.: 12345" />
                  <p className="text-[9px] text-muted-foreground">Ainda não persistido nesta etapa</p>
                </div>
              </div>

              <div className="space-y-1">
                <FornecedorSelect
                  fornecedorId={contraparteId}
                  onFornecedorChange={(id) => setContraparteId(id)}
                  clienteId={clienteId}
                  label="Contraparte (fornecedor)"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Lote 1 (Ordem de Compra) — movimentações</Label>
                <p className="text-[10px] text-muted-foreground">
                  Um lote agrupa uma ou mais movimentações de compra. Nesta etapa o modal trabalha com um lote.
                </p>
                <div className="max-h-40 overflow-y-auto rounded-md border divide-y">
                  {movs.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma compra registrada</div>
                  )}
                  {movs.map(m => (
                    <label key={m.id} className="flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer hover:bg-muted/40">
                      <input type="checkbox" checked={loteMovIds.includes(m.id)} onChange={() => toggleMov(m.id)} />
                      <span>{m.label}</span>
                    </label>
                  ))}
                </div>
                {loteMovIds.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">{loteMovIds.length} movimentação(ões) no lote</p>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Valor principal (R$)</Label>
                <Input type="number" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} className="h-9" placeholder="0,00" />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Condição de pagamento (opcional)</Label>
                <Input value={condicaoPagamento} onChange={e => setCondicaoPagamento(e.target.value)} className="h-9" placeholder="ex.: à vista, 30 dias" />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Observações (opcional)</Label>
                <Input value={observacoes} onChange={e => setObservacoes(e.target.value)} className="h-9" />
              </div>
            </>
          )}

          {op && op.status_financeiro === 'sincronizado' && (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
              Títulos gerados pelo novo motor. Abra o <b>Financeiro</b> no mês <b>{mesTitulos}</b> para visualizá-los.
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {!op && (
            <Button onClick={handleSalvarRascunho} disabled={!formValido || saving}>
              {saving ? 'Salvando…' : 'Salvar rascunho'}
            </Button>
          )}
          {op && op.status_comercial === 'rascunho' && (
            <Button onClick={handleConfirmar} disabled={saving}>
              {saving ? 'Confirmando…' : 'Confirmar operação'}
            </Button>
          )}
          {op && op.status_comercial === 'confirmada' && op.status_financeiro !== 'sincronizado' && (
            <Button onClick={handleSincronizar} disabled={saving}>
              {saving ? 'Sincronizando…' : 'Sincronizar financeiro'}
            </Button>
          )}
          {op && (op.status_financeiro === 'sincronizado' || op.status_comercial === 'cancelada') && (
            <Button variant="outline" onClick={resetTudo}>Nova compra</Button>
          )}
          <Button variant="ghost" onClick={() => { setOpen(false); resetTudo(); }}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
