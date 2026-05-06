import { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Eye, Merge, CheckCircle, Trash2, Ban } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { normalizeFornecedorNome } from '@/lib/financeiro/normalizeFornecedorNome';

interface Fornecedor {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  fazenda_id: string;
  ativo: boolean;
  tipo_recebimento?: string | null;
  pix_tipo_chave?: string | null;
  pix_chave?: string | null;
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  tipo_conta?: string | null;
  cpf_cnpj_pagamento?: string | null;
  nome_favorecido?: string | null;
  observacao_pagamento?: string | null;
}

interface Fazenda {
  id: string;
  nome: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  editing: Fornecedor | null;
  allFornecedores: Fornecedor[];
  fazendas: Fazenda[];
  clienteId: string;
  onSaved: () => void;
  onSelectExisting?: (fornecedor: Fornecedor) => void;
}

function normalize(s: string) {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordSimilarity(input: string, candidate: string): number {
  const ni = normalize(input);
  const nc = normalize(candidate);
  if (!ni || !nc) return 0;
  if (ni === nc) return 1;
  if (nc.includes(ni) || ni.includes(nc)) return 0.8;

  const wordsA = ni.split(' ').filter(w => w.length > 1);
  const wordsB = nc.split(' ').filter(w => w.length > 1);
  if (wordsA.length === 0) return 0;

  let matches = 0;
  for (const wa of wordsA) {
    for (const wb of wordsB) {
      if (wb.includes(wa) || wa.includes(wb)) {
        matches++;
        break;
      }
    }
  }
  return matches / Math.max(wordsA.length, 1);
}

export function FornecedorFormDialog({
  open, onClose, editing, allFornecedores, fazendas, clienteId, onSaved, onSelectExisting,
}: Props) {
  const [nome, setNome] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [fazendaId, setFazendaId] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [reativarTarget, setReativarTarget] = useState<Fornecedor | null>(null);
  const [reativando, setReativando] = useState(false);
  const [lancamentoCount, setLancamentoCount] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Payment fields
  const [tipoRecebimento, setTipoRecebimento] = useState('');
  const [pixTipoChave, setPixTipoChave] = useState('');
  const [pixChave, setPixChave] = useState('');
  const [banco, setBanco] = useState('');
  const [agencia, setAgencia] = useState('');
  const [conta, setConta] = useState('');
  const [tipoConta, setTipoConta] = useState('');
  const [cpfCnpjPagamento, setCpfCnpjPagamento] = useState('');
  const [nomeFavorecido, setNomeFavorecido] = useState('');
  const [observacaoPagamento, setObservacaoPagamento] = useState('');

  useEffect(() => {
    if (open) {
      if (editing) {
        setNome(editing.nome);
        setCpfCnpj(editing.cpf_cnpj || '');
        setFazendaId(editing.fazenda_id);
        setAtivo(editing.ativo);
        setTipoRecebimento(editing.tipo_recebimento || '');
        setPixTipoChave(editing.pix_tipo_chave || '');
        setPixChave(editing.pix_chave || '');
        setBanco(editing.banco || '');
        setAgencia(editing.agencia || '');
        setConta(editing.conta || '');
        setTipoConta(editing.tipo_conta || '');
        setCpfCnpjPagamento(editing.cpf_cnpj_pagamento || '');
        setNomeFavorecido(editing.nome_favorecido || '');
        setObservacaoPagamento(editing.observacao_pagamento || '');
        supabase.from('financeiro_lancamentos_v2')
          .select('id', { count: 'exact', head: true })
          .eq('favorecido_id', editing.id)
          .then(({ count }) => setLancamentoCount(count ?? 0));
      } else {
        setNome('');
        setCpfCnpj('');
        setFazendaId(fazendas[0]?.id || '');
        setAtivo(true);
        setLancamentoCount(null);
        setTipoRecebimento('');
        setPixTipoChave('');
        setPixChave('');
        setBanco('');
        setAgencia('');
        setConta('');
        setTipoConta('');
        setCpfCnpjPagamento('');
        setNomeFavorecido('');
        setObservacaoPagamento('');
      }
      setReviewId(null);
      setDeleting(false);
    }
  }, [open, editing, fazendas]);

  const suggestions = useMemo(() => {
    if (nome.trim().length < 3) return [];
    return allFornecedores
      .filter(f => !editing || f.id !== editing.id)
      .map(f => ({ ...f, score: wordSimilarity(nome, f.nome) }))
      .filter(f => f.score >= 0.35)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [nome, allFornecedores, editing]);

  const save = useCallback(async () => {
    if (saving) return;
    if (!clienteId || !nome.trim() || !fazendaId) {
      toast.error('Preencha nome e fazenda');
      return;
    }

    // Pré-check de duplicata por nome_normalizado (mesma lógica do trigger no banco).
    // Evita unique violation no índice idx_financeiro_fornecedores_cliente_nome_norm_unique
    // e oferece reativação quando há fornecedor inativo com o mesmo nome.
    if (!editing) {
      const normalizado = normalizeFornecedorNome(nome);
      const colidindo = allFornecedores.find(
        (f) => normalizeFornecedorNome(f.nome) === normalizado,
      );
      if (colidindo) {
        if (colidindo.ativo) {
          toast.error(`Já existe fornecedor ativo "${colidindo.nome}". Selecione-o em vez de criar um novo.`);
          return;
        }
        // Inativo → oferecer reativação via AlertDialog. Não cria duplicata.
        setReativarTarget(colidindo);
        return;
      }
    }

    setSaving(true);
    const payload: any = {
      cliente_id: clienteId,
      fazenda_id: fazendaId,
      nome: nome.trim(),
      cpf_cnpj: cpfCnpj.trim() || null,
      ativo,
      tipo_recebimento: tipoRecebimento || null,
      pix_tipo_chave: pixTipoChave || null,
      pix_chave: pixChave.trim() || null,
      banco: banco.trim() || null,
      agencia: agencia.trim() || null,
      conta: conta.trim() || null,
      tipo_conta: tipoConta || null,
      cpf_cnpj_pagamento: cpfCnpjPagamento.trim() || null,
      nome_favorecido: nomeFavorecido.trim() || null,
      observacao_pagamento: observacaoPagamento.trim() || null,
    };

    if (editing) {
      const { error } = await supabase.from('financeiro_fornecedores').update(payload).eq('id', editing.id);
      if (error) { toast.error('Erro ao atualizar: ' + error.message); setSaving(false); return; }
      toast.success('Fornecedor atualizado');
    } else {
      const { error } = await supabase.from('financeiro_fornecedores').insert(payload);
      if (error) { toast.error('Erro ao criar: ' + error.message); setSaving(false); return; }
      toast.success('Fornecedor criado');
    }
    setSaving(false);
    onClose();
    onSaved();
  }, [saving, clienteId, nome, cpfCnpj, fazendaId, ativo, editing, onClose, onSaved, allFornecedores, tipoRecebimento, pixTipoChave, pixChave, banco, agencia, conta, tipoConta, cpfCnpjPagamento, nomeFavorecido, observacaoPagamento]);

  const reativarExistente = useCallback(async () => {
    if (!reativarTarget) return;
    setReativando(true);
    const { error } = await supabase
      .from('financeiro_fornecedores')
      .update({ ativo: true })
      .eq('id', reativarTarget.id);
    setReativando(false);
    if (error) {
      toast.error('Erro ao reativar: ' + error.message);
      return;
    }
    toast.success(`Fornecedor "${reativarTarget.nome}" reativado`);
    setReativarTarget(null);
    onClose();
    onSaved();
  }, [reativarTarget, onClose, onSaved]);

  const handleMerge = useCallback(async (target: Fornecedor) => {
    if (!editing) return;
    // Move all lancamentos from current editing to target
    const { error: moveErr } = await supabase
      .from('financeiro_lancamentos_v2')
      .update({ favorecido_id: target.id })
      .eq('favorecido_id', editing.id);
    if (moveErr) { toast.error('Erro ao mesclar lançamentos'); return; }

    // Add current name as alias on the target
    const { data: targetData } = await supabase
      .from('financeiro_fornecedores')
      .select('aliases')
      .eq('id', target.id)
      .single();
    const currentAliases: string[] = (targetData as any)?.aliases || [];
    if (!currentAliases.includes(editing.nome)) {
      await supabase
        .from('financeiro_fornecedores')
        .update({ aliases: [...currentAliases, editing.nome] } as any)
        .eq('id', target.id);
    }

    // Deactivate the duplicate
    await supabase.from('financeiro_fornecedores').update({ ativo: false }).eq('id', editing.id);

    toast.success(`Mesclado com "${target.nome}". Lançamentos migrados.`);
    onClose();
    onSaved();
  }, [editing, onClose, onSaved]);

  const handleUseExisting = useCallback((target: Fornecedor) => {
    onSelectExisting?.(target);
    onClose();
  }, [onSelectExisting, onClose]);

  const reviewFornecedor = reviewId ? allFornecedores.find(f => f.id === reviewId) : null;
  const fazendaNome = (id: string) => fazendas.find(f => f.id === id)?.nome || '-';

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-base">{editing ? 'Editar Fornecedor' : 'Novo Fornecedor'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto flex-1 pr-1">
          <div>
            <Label className="text-xs">Nome *</Label>
            <Input
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Nome do fornecedor"
              className="h-9"
              autoFocus
            />
          </div>

          {/* Suggestions panel */}
          {suggestions.length > 0 && (
            <div className="border border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-700/40 rounded-md p-2 space-y-1.5">
              <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="text-[11px] font-semibold">Já existem cadastros semelhantes. Revise antes de criar um novo.</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Sugestões de cadastro semelhante:</p>
              <div className="space-y-1">
                {suggestions.map(s => (
                  <div key={s.id} className="flex items-center gap-1.5 bg-background/80 rounded px-2 py-1 border border-border/50">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium truncate" title={s.nome}>{s.nome}</p>
                      <p className="text-[9px] text-muted-foreground">{fazendaNome(s.fazenda_id)}</p>
                    </div>
                    <Badge variant={s.ativo ? 'default' : 'secondary'} className="text-[8px] px-1 py-0 shrink-0">
                      {s.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                    <div className="flex gap-0.5 shrink-0">
                      {!editing && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-5 text-[9px] px-1.5 gap-0.5"
                          onClick={() => handleUseExisting(s)}
                          title="Usar este cadastro existente"
                        >
                          <CheckCircle className="h-2.5 w-2.5" />Usar
                        </Button>
                      )}
                      {editing && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-5 text-[9px] px-1.5 gap-0.5"
                          onClick={() => handleMerge(s)}
                          title="Mesclar: mover lançamentos para este"
                        >
                          <Merge className="h-2.5 w-2.5" />Mesclar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 text-[9px] px-1.5 gap-0.5"
                        onClick={() => setReviewId(reviewId === s.id ? null : s.id)}
                        title="Ver detalhes"
                      >
                        <Eye className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Review detail */}
              {reviewFornecedor && (
                <div className="mt-1 bg-muted/50 rounded p-2 text-[10px] space-y-0.5 border border-border/30">
                  <p><strong>Nome:</strong> {reviewFornecedor.nome}</p>
                  <p><strong>CPF/CNPJ:</strong> {reviewFornecedor.cpf_cnpj || '-'}</p>
                  <p><strong>Fazenda:</strong> {fazendaNome(reviewFornecedor.fazenda_id)}</p>
                  <p><strong>Status:</strong> {reviewFornecedor.ativo ? 'Ativo' : 'Inativo'}</p>
                </div>
              )}
            </div>
          )}

          <div>
            <Label className="text-xs">CPF/CNPJ</Label>
            <Input value={cpfCnpj} onChange={e => setCpfCnpj(e.target.value)} className="h-9" placeholder="000.000.000-00" />
          </div>
          <div>
            <Label className="text-xs">Fazenda *</Label>
            <Select value={fazendaId} onValueChange={setFazendaId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {fazendas.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={ativo} onCheckedChange={setAtivo} />
            <Label className="text-xs">Ativo</Label>
          </div>

          {/* ── DADOS DE PAGAMENTO ── */}
          <div className="border-t border-border/30 pt-3 mt-1">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Dados de Pagamento</p>
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px]">Tipo de Recebimento</Label>
                  <Select value={tipoRecebimento || '__none_tipo__'} onValueChange={v => setTipoRecebimento(v === '__none_tipo__' ? '' : v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none_tipo__">Nenhum</SelectItem>
                      <SelectItem value="PIX">PIX</SelectItem>
                      <SelectItem value="Transferência Bancária">Transferência Bancária</SelectItem>
                      <SelectItem value="Boleto">Boleto</SelectItem>
                      <SelectItem value="Cartão">Cartão</SelectItem>
                      <SelectItem value="Débito Automático">Débito Automático</SelectItem>
                      <SelectItem value="Débito">Débito</SelectItem>
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px]">Tipo de Chave PIX</Label>
                  <Select value={pixTipoChave || '__none_pix__'} onValueChange={v => setPixTipoChave(v === '__none_pix__' ? '' : v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none_pix__">Nenhum</SelectItem>
                      <SelectItem value="CPF">CPF</SelectItem>
                      <SelectItem value="CNPJ">CNPJ</SelectItem>
                      <SelectItem value="Telefone">Telefone</SelectItem>
                      <SelectItem value="E-mail">E-mail</SelectItem>
                      <SelectItem value="Aleatória">Aleatória</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-[11px]">Chave PIX</Label>
                <Input value={pixChave} onChange={e => setPixChave(e.target.value)} className="h-8 text-xs" placeholder="CPF, CNPJ, telefone, email ou chave aleatória" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <Label className="text-[11px]">Banco</Label>
                  <Input value={banco} onChange={e => setBanco(e.target.value)} className="h-8 text-xs" placeholder="Ex: Sicredi" />
                </div>
                <div>
                  <Label className="text-[11px]">Agência</Label>
                  <Input value={agencia} onChange={e => setAgencia(e.target.value)} className="h-8 text-xs" placeholder="0000" />
                </div>
                <div>
                  <Label className="text-[11px]">Conta</Label>
                  <Input value={conta} onChange={e => setConta(e.target.value)} className="h-8 text-xs" placeholder="00000-0" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px]">Tipo de Conta</Label>
                  <Select value={tipoConta || '__none_tc__'} onValueChange={v => setTipoConta(v === '__none_tc__' ? '' : v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none_tc__">Nenhum</SelectItem>
                      <SelectItem value="Corrente">Corrente</SelectItem>
                      <SelectItem value="Poupança">Poupança</SelectItem>
                      <SelectItem value="Pagamento">Pagamento</SelectItem>
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px]">CPF/CNPJ Favorecido</Label>
                  <Input value={cpfCnpjPagamento} onChange={e => setCpfCnpjPagamento(e.target.value)} className="h-8 text-xs" placeholder="000.000.000-00" />
                </div>
              </div>
              <div>
                <Label className="text-[11px]">Nome do Favorecido</Label>
                <Input value={nomeFavorecido} onChange={e => setNomeFavorecido(e.target.value)} className="h-8 text-xs" placeholder="Nome para pagamento" />
              </div>
              <div>
                <Label className="text-[11px]">Observação para Pagamento</Label>
                <Input value={observacaoPagamento} onChange={e => setObservacaoPagamento(e.target.value)} className="h-8 text-xs" placeholder="Informações adicionais" />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-1 flex-wrap">
          {editing && lancamentoCount !== null && (
            lancamentoCount > 0 ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-amber-600 border-amber-300 hover:bg-amber-50 mr-auto gap-1">
                    <Ban className="h-3.5 w-3.5" />Inativar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Inativar fornecedor</AlertDialogTitle>
                    <AlertDialogDescription>
                      Este fornecedor possui <strong>{lancamentoCount}</strong> lançamento(s) vinculado(s). Ele não será apagado da base, apenas inativado. Os lançamentos serão preservados.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={async () => {
                      await supabase.from('financeiro_fornecedores').update({ ativo: false }).eq('id', editing.id);
                      toast.success('Fornecedor inativado');
                      onClose();
                      onSaved();
                    }}>Confirmar Inativação</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10 mr-auto gap-1">
                    <Trash2 className="h-3.5 w-3.5" />Excluir
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir fornecedor</AlertDialogTitle>
                    <AlertDialogDescription>
                      Este fornecedor não possui vínculos e pode ser excluído permanentemente. Essa ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
                      setDeleting(true);
                      const { error } = await supabase.from('financeiro_fornecedores').delete().eq('id', editing.id);
                      setDeleting(false);
                      if (error) { toast.error('Erro ao excluir'); return; }
                      toast.success('Fornecedor excluído');
                      onClose();
                      onSaved();
                    }}>Excluir Permanentemente</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )
          )}
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={save} disabled={saving || !nome.trim()}>
            {saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
      <AlertDialog open={!!reativarTarget} onOpenChange={(v) => { if (!v) setReativarTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fornecedor inativo já cadastrado</AlertDialogTitle>
            <AlertDialogDescription>
              Já existe um fornecedor inativo com o nome <strong>"{reativarTarget?.nome}"</strong>.
              Em vez de criar uma duplicata, deseja reativá-lo? Os dados existentes serão preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reativando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={reativarExistente} disabled={reativando}>
              {reativando ? 'Reativando...' : 'Reativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
