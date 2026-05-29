import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const MOTIVOS = [
  { value: 'banco_extrato', label: 'Diferença por banco/extrato' },
  { value: 'desconto',      label: 'Desconto' },
  { value: 'comissao',      label: 'Comissão' },
  { value: 'taxa',          label: 'Taxa' },
  { value: 'arredondamento',label: 'Arredondamento' },
  { value: 'permuta',       label: 'Permuta' },
  { value: 'parcial',       label: 'Pagamento parcial' },
  { value: 'outro',         label: 'Outro' },
];

export function BlocoExplicacaoDiferenca() {
  // State LOCAL — não persiste. Reset ao desmontar/remontar modal.
  const [motivo, setMotivo] = useState<string>('');
  const [descricao, setDescricao] = useState<string>('');

  return (
    <section className="rounded-lg border border-amber-200 dark:border-amber-900/60 overflow-hidden">
      <header className="bg-amber-500/10 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60 px-4 py-2.5 flex items-center gap-2">
        <HelpCircle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
        <h3 className="text-xs font-semibold text-amber-900 dark:text-amber-100 uppercase tracking-wide">
          3. Explicação da Diferença
        </h3>
      </header>
      <div className="p-3 bg-card space-y-2">
        <div>
          <Label className="text-[11px] text-muted-foreground">Motivo da Diferença</Label>
          <Select value={motivo} onValueChange={setMotivo}>
            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>
              {MOTIVOS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">Descrição / Observação</Label>
          <Textarea
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            placeholder="Explique o motivo da diferença entre valor da movimentação e o financeiro."
            className="mt-1 min-h-[60px] text-xs"
          />
        </div>
        <p className="text-[10px] text-muted-foreground italic">
          Disponível em fase futura — alterações neste bloco não são salvas no banco.
        </p>
      </div>
    </section>
  );
}
