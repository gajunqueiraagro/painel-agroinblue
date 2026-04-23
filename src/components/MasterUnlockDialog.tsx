import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anoMes: string;
  onUnlock: (anoMes: string, senha: string) => Promise<boolean>;
}

export function MasterUnlockDialog({ open, onOpenChange, anoMes, onUnlock }: Props) {
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!senha) return;
    setLoading(true);
    try {
      const ok = await onUnlock(anoMes, senha);
      if (ok) {
        toast.success(`Mês ${anoMes} desbloqueado nesta sessão`);
        setSenha('');
        onOpenChange(false);
      } else {
        toast.error('Senha master incorreta');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
      className="max-w-md"
      onInteractOutside={(e) => e.stopPropagation()}
      onEscapeKeyDown={(e) => e.stopPropagation()}
    >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            Solicitar desbloqueio master
          </DialogTitle>
          <DialogDescription>
            Mês <strong>{anoMes}</strong> está fechado. Informe a senha master para liberar
            edições temporariamente nesta sessão.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="master-pass">Senha master</Label>
          <Input
            id="master-pass"
            type="password"
            autoFocus
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm();
            }}
            placeholder="••••••••"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!senha || loading}>
            {loading ? 'Validando...' : 'Desbloquear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
