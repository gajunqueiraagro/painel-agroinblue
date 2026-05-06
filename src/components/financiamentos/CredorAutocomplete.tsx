import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFazenda } from '@/contexts/FazendaContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ChevronsUpDown, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeFornecedorNome } from '@/lib/financeiro/normalizeFornecedorNome';

interface Props {
  value: string;
  onChange: (id: string) => void;
  clienteId: string;
  placeholder?: string;
  disabled?: boolean;
}

export function CredorAutocomplete({ value, onChange, clienteId, placeholder = 'Selecionar credor...', disabled }: Props) {
  const qc = useQueryClient();
  const { fazendas, fazendaAtual } = useFazenda();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [novoOpen, setNovoOpen] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [reativarTarget, setReativarTarget] = useState<{ id: string; nome: string } | null>(null);
  const [reativando, setReativando] = useState(false);

  const { data: fornecedores = [] } = useQuery({
    queryKey: ['credor-autocomplete', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data } = await supabase
        .from('financeiro_fornecedores')
        .select('id, nome')
        .eq('cliente_id', clienteId)
        .eq('ativo', true)
        .order('nome');
      return data ?? [];
    },
  });

  const selecionado = fornecedores.find(f => f.id === value);

  const credoresFiltrados = (() => {
    const s = search.trim().toLowerCase();
    const base = s
      ? fornecedores.filter(f => f.nome.toLowerCase().includes(s))
      : fornecedores;
    return base.slice(0, 50);
  })();

  const resolveFazendaId = (): string | null => {
    if (fazendaAtual?.id && fazendaAtual.id !== '__global__') return fazendaAtual.id;
    const first = fazendas.find(f => f.id !== '__global__');
    return first?.id ?? null;
  };

  const salvarNovo = async () => {
    const nome = novoNome.trim();
    if (!nome) {
      toast.error('Informe o nome do credor');
      return;
    }
    const fazendaId = resolveFazendaId();
    if (!fazendaId) {
      toast.error('Selecione uma fazenda antes de criar um credor');
      return;
    }

    // Pré-check: verificar duplicata por nome_normalizado (inclui inativos).
    // Index único no banco impede duplicata mesmo entre ativo/inativo.
    const normalizado = normalizeFornecedorNome(nome);
    const { data: existing } = await supabase
      .from('financeiro_fornecedores')
      .select('id, nome, ativo')
      .eq('cliente_id', clienteId)
      .eq('nome_normalizado', normalizado)
      .maybeSingle();

    if (existing) {
      if (existing.ativo) {
        // Já cadastrado e ativo — apenas selecionar e fechar.
        onChange(existing.id);
        toast.info(`Fornecedor "${existing.nome}" já cadastrado — selecionado.`);
        setNovoOpen(false);
        setNovoNome('');
        setOpen(false);
        return;
      }
      // Inativo → oferecer reativação.
      setReativarTarget({ id: existing.id, nome: existing.nome });
      return;
    }

    setSalvando(true);
    const { data, error } = await supabase
      .from('financeiro_fornecedores')
      .insert({ cliente_id: clienteId, fazenda_id: fazendaId, nome, ativo: true })
      .select('id, nome')
      .single();
    setSalvando(false);
    if (error) {
      toast.error('Erro ao criar credor: ' + error.message);
      return;
    }
    if (data) {
      qc.invalidateQueries({ queryKey: ['credor-autocomplete', clienteId] });
      onChange(data.id);
      toast.success('Credor criado');
      setNovoOpen(false);
      setNovoNome('');
      setOpen(false);
    }
  };

  const reativarExistente = async () => {
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
    qc.invalidateQueries({ queryKey: ['credor-autocomplete', clienteId] });
    onChange(reativarTarget.id);
    toast.success(`Fornecedor "${reativarTarget.nome}" reativado e selecionado`);
    setReativarTarget(null);
    setNovoOpen(false);
    setNovoNome('');
    setOpen(false);
  };

  return (
    <div className="flex gap-1">
      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setSearch('');
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={disabled}
            className="flex-1 justify-between font-normal"
          >
            {selecionado ? selecionado.nome : <span className="text-muted-foreground">{placeholder}</span>}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0 z-[100]"
          align="start"
          sideOffset={4}
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar credor..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList className="max-h-60">
              <CommandEmpty>Nenhum credor encontrado.</CommandEmpty>
              <CommandGroup>
                {credoresFiltrados.map(f => (
                  <CommandItem
                    key={f.id}
                    value={f.nome}
                    onSelect={() => { onChange(f.id); setOpen(false); setSearch(''); }}
                  >
                    {f.nome}
                  </CommandItem>
                ))}
              </CommandGroup>
              {search.trim() && fornecedores.filter(f => f.nome.toLowerCase().includes(search.trim().toLowerCase())).length > 50 && (
                <div className="px-2 py-1.5 text-[10px] text-muted-foreground">
                  Refine a busca — mostrando os 50 primeiros resultados.
                </div>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0"
        onClick={() => setNovoOpen(true)}
        disabled={disabled}
        title="Novo credor"
      >
        <Plus className="h-4 w-4" />
      </Button>

      <Dialog open={novoOpen} onOpenChange={(v) => { setNovoOpen(v); if (!v) setNovoNome(''); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Novo credor</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Nome *</Label>
            <Input
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              placeholder="Ex: Banco do Brasil"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') salvarNovo(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoOpen(false)} disabled={salvando}>Cancelar</Button>
            <Button onClick={salvarNovo} disabled={salvando}>{salvando ? 'Salvando...' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!reativarTarget} onOpenChange={(v) => { if (!v) setReativarTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Credor inativo já cadastrado</AlertDialogTitle>
            <AlertDialogDescription>
              Já existe um credor inativo com o nome <strong>"{reativarTarget?.nome}"</strong>.
              Em vez de criar uma duplicata, deseja reativá-lo e selecioná-lo neste financiamento?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reativando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={reativarExistente} disabled={reativando}>
              {reativando ? 'Reativando...' : 'Reativar e selecionar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
