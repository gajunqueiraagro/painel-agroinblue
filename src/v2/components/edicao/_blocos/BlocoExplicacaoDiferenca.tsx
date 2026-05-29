import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function BlocoExplicacaoDiferenca() {
  // State LOCAL — não persiste.
  const [motivo, setMotivo] = useState<string>('');
  const [descricao, setDescricao] = useState<string>('');

  return (
    <section className="rounded-lg border border-amber-300 bg-white overflow-hidden h-full">
      <header className="bg-amber-100 border-b border-amber-300 px-3 py-1.5 flex items-center gap-2 text-amber-900">
        <HelpCircle className="w-3.5 h-3.5" />
        <h3 className="text-[13px] font-bold uppercase tracking-wide">
          3. Explicação da Diferença
        </h3>
      </header>
      <div className="p-2.5 grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] uppercase text-slate-500 font-medium">Motivo</Label>
          <Select value={motivo} onValueChange={setMotivo}>
            <SelectTrigger className="mt-0.5 h-7 text-[11px]">
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="banco_extrato">Banco / Extrato</SelectItem>
              <SelectItem value="desconto">Desconto</SelectItem>
              <SelectItem value="comissao">Comissão</SelectItem>
              <SelectItem value="taxa">Taxas / Impostos</SelectItem>
              <SelectItem value="frete">Frete</SelectItem>
              <SelectItem value="permuta">Permuta</SelectItem>
              <SelectItem value="parcial">Pagamento parcial</SelectItem>
              <SelectItem value="arredondamento">Arredondamento</SelectItem>
              <SelectItem value="outro">Outro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] uppercase text-slate-500 font-medium">Descrição</Label>
          <Input
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            placeholder="Explique o motivo…"
            className="mt-0.5 h-7 text-[11px]"
          />
        </div>
        <p className="col-span-2 text-[10px] text-slate-500 italic">
          Informativa — não persistida nesta fase.
        </p>
      </div>
    </section>
  );
}
