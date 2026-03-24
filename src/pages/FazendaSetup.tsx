import { useState } from 'react';
import { useFazenda } from '@/contexts/FazendaContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function FazendaSetup() {
  const { criarFazenda } = useFazenda();
  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !codigo.trim()) return;
    setLoading(true);
    await criarFazenda(nome.trim(), codigo.trim().toUpperCase());
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <span className="text-5xl">🏡</span>
          <h1 className="text-2xl font-extrabold text-foreground mt-2">Cadastre sua Fazenda</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Informe o nome e o código da fazenda para começar
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Nome da Fazenda</Label>
            <Input
              type="text"
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Ex: Faz. 3 Muchachas"
              className="text-center text-lg font-bold"
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Código da Fazenda</Label>
            <Input
              type="text"
              value={codigo}
              onChange={e => setCodigo(e.target.value)}
              placeholder="Ex: 3M, BG, ADM"
              className="text-center text-lg font-bold uppercase"
              required
              maxLength={20}
            />
            <p className="text-xs text-muted-foreground text-center">
              Código usado na importação financeira (Excel)
            </p>
          </div>
          <Button type="submit" className="w-full font-bold touch-target" disabled={loading || !codigo.trim()}>
            {loading ? 'Criando...' : 'Criar Fazenda'}
          </Button>
        </form>
      </div>
    </div>
  );
}
