import { useState } from 'react';
import { useFazenda } from '@/contexts/FazendaContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function FazendaSetup() {
  const { criarFazenda } = useFazenda();
  const [nome, setNome] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;
    setLoading(true);
    await criarFazenda(nome.trim());
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <span className="text-5xl">🏡</span>
          <h1 className="text-2xl font-extrabold text-foreground mt-2">Cadastre sua Fazenda</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Informe o nome da fazenda para começar
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="text"
            value={nome}
            onChange={e => setNome(e.target.value)}
            placeholder="Nome da Fazenda"
            className="text-center text-lg font-bold"
            required
          />
          <Button type="submit" className="w-full font-bold touch-target" disabled={loading}>
            {loading ? 'Criando...' : 'Criar Fazenda'}
          </Button>
        </form>
      </div>
    </div>
  );
}
