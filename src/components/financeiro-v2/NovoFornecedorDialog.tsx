import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (nome: string, cpfCnpj?: string) => Promise<void>;
  defaultNome?: string;
}

export function NovoFornecedorDialog({ open, onClose, onSave, defaultNome }: Props) {
  const [nome, setNome] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setNome(defaultNome || '');
      setCpfCnpj('');
    }
  }, [open, defaultNome]);

  const handleSubmit = async () => {
    if (!nome.trim()) return;
    setSaving(true);
    await onSave(nome.trim(), cpfCnpj.trim() || undefined);
    setSaving(false);
    setNome('');
    setCpfCnpj('');
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); setNome(''); setCpfCnpj(''); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Novo Fornecedor</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Cadastre um novo fornecedor ou frigorífico.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nome *</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} className="h-9" placeholder="Nome do fornecedor" autoFocus />
          </div>
          <div>
            <Label className="text-xs">CPF/CNPJ</Label>
            <Input value={cpfCnpj} onChange={e => setCpfCnpj(e.target.value)} className="h-9" placeholder="Opcional" />
          </div>
          <Button onClick={handleSubmit} disabled={saving || !nome.trim()} className="w-full">
            {saving ? 'Salvando...' : 'Salvar Fornecedor'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
