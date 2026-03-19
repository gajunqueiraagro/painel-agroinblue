import { useState } from 'react';
import {
  Lancamento,
  CATEGORIAS,
  TIPOS_ENTRADA,
  TIPOS_SAIDA,
  TipoMovimentacao,
  Categoria,
  isEntrada,
  kgToArrobas,
} from '@/types/cattle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Trash2 } from 'lucide-react';

interface Props {
  lancamentos: Lancamento[];
  onAdicionar: (l: Omit<Lancamento, 'id'>) => void;
  onRemover: (id: string) => void;
}

type Aba = 'entrada' | 'saida' | 'historico';

export function LancamentosTab({ lancamentos, onAdicionar, onRemover }: Props) {
  const [aba, setAba] = useState<Aba>('entrada');
  const [tipo, setTipo] = useState<TipoMovimentacao>('nascimento');
  const [categoria, setCategoria] = useState<Categoria>('bois');
  const [quantidade, setQuantidade] = useState('');
  const [data, setData] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [fazendaOrigem, setFazendaOrigem] = useState('');
  const [fazendaDestino, setFazendaDestino] = useState('');
  const [pesoKg, setPesoKg] = useState('');
  const [preco, setPreco] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quantidade || Number(quantidade) <= 0) return;

    onAdicionar({
      data,
      tipo,
      quantidade: Number(quantidade),
      categoria,
      fazendaOrigem: fazendaOrigem || undefined,
      fazendaDestino: fazendaDestino || undefined,
      pesoMedioKg: pesoKg ? Number(pesoKg) : undefined,
      pesoMedioArrobas: pesoKg ? kgToArrobas(Number(pesoKg)) : undefined,
      precoMedioCabeca: preco ? Number(preco) : undefined,
    });

    setQuantidade('');
    setPesoKg('');
    setPreco('');
    setFazendaOrigem('');
    setFazendaDestino('');
  };

  const tiposDisponiveis = aba === 'entrada' ? TIPOS_ENTRADA : TIPOS_SAIDA;

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 animate-fade-in pb-20">
      {/* Seletor de aba */}
      <div className="grid grid-cols-3 gap-1 bg-muted rounded-lg p-1">
        {(['entrada', 'saida', 'historico'] as Aba[]).map(a => (
          <button
            key={a}
            onClick={() => {
              setAba(a);
              if (a === 'entrada') setTipo('nascimento');
              if (a === 'saida') setTipo('abate');
            }}
            className={`py-2.5 px-2 rounded-md text-sm font-bold transition-colors touch-target ${
              aba === a
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground'
            }`}
          >
            {a === 'entrada' ? '📥 Entradas' : a === 'saida' ? '📤 Saídas' : '📋 Histórico'}
          </button>
        ))}
      </div>

      {aba !== 'historico' ? (
        <form onSubmit={handleSubmit} className="bg-card rounded-lg p-4 shadow-sm border space-y-4">
          {/* Tipo */}
          <div className="grid grid-cols-1 gap-2">
            <Label className="font-bold text-foreground">Tipo</Label>
            <div className="grid grid-cols-2 gap-2">
              {tiposDisponiveis.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTipo(t.value)}
                  className={`p-3 rounded-lg text-sm font-bold border-2 transition-all touch-target ${
                    tipo === t.value
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border text-muted-foreground'
                  }`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Data e Quantidade */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="font-bold text-foreground">Data</Label>
              <Input
                type="date"
                value={data}
                onChange={e => setData(e.target.value)}
                className="mt-1 touch-target text-base"
              />
            </div>
            <div>
              <Label className="font-bold text-foreground">Qtd. Cabeças</Label>
              <Input
                type="number"
                value={quantidade}
                onChange={e => setQuantidade(e.target.value)}
                placeholder="0"
                min="1"
                className="mt-1 touch-target text-base text-center font-bold text-lg"
              />
            </div>
          </div>

          {/* Categoria */}
          <div>
            <Label className="font-bold text-foreground">Categoria</Label>
            <Select value={categoria} onValueChange={v => setCategoria(v as Categoria)}>
              <SelectTrigger className="mt-1 touch-target text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map(c => (
                  <SelectItem key={c.value} value={c.value} className="text-base">
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fazendas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="font-bold text-foreground">Fazenda Origem</Label>
              <Input
                value={fazendaOrigem}
                onChange={e => setFazendaOrigem(e.target.value)}
                placeholder="Ex: Faz. Boa Vista"
                className="mt-1 touch-target text-base"
              />
            </div>
            <div>
              <Label className="font-bold text-foreground">Fazenda Destino</Label>
              <Input
                value={fazendaDestino}
                onChange={e => setFazendaDestino(e.target.value)}
                placeholder="Ex: Faz. Santa Cruz"
                className="mt-1 touch-target text-base"
              />
            </div>
          </div>

          {/* Peso e Preço */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="font-bold text-foreground">Peso Médio (kg)</Label>
              <Input
                type="number"
                value={pesoKg}
                onChange={e => setPesoKg(e.target.value)}
                placeholder="0"
                className="mt-1 touch-target text-base"
              />
              {pesoKg && Number(pesoKg) > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  ≈ {kgToArrobas(Number(pesoKg))} arrobas
                </p>
              )}
            </div>
            <div>
              <Label className="font-bold text-foreground">Preço/Cabeça (R$)</Label>
              <Input
                type="number"
                value={preco}
                onChange={e => setPreco(e.target.value)}
                placeholder="0,00"
                className="mt-1 touch-target text-base"
              />
            </div>
          </div>

          <Button type="submit" className="w-full touch-target text-base font-bold" size="lg">
            {aba === 'entrada' ? '📥 Registrar Entrada' : '📤 Registrar Saída'}
          </Button>
        </form>
      ) : (
        <div className="space-y-2">
          {lancamentos.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">Nenhum lançamento registrado</p>
          ) : (
            lancamentos.slice(0, 50).map(l => {
              const entrada = isEntrada(l.tipo);
              const catLabel = CATEGORIAS.find(c => c.value === l.categoria)?.label;
              const tipoLabel = [...TIPOS_ENTRADA, ...TIPOS_SAIDA].find(t => t.value === l.tipo);
              return (
                <div key={l.id} className="bg-card rounded-lg p-3 border shadow-sm flex items-center gap-3">
                  <div className="text-2xl">{tipoLabel?.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${entrada ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}>
                        {entrada ? '+' : '-'}{l.quantidade}
                      </span>
                      <span className="text-sm font-bold text-foreground truncate">{tipoLabel?.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {catLabel} • {format(parseISO(l.data), 'dd/MM/yyyy', { locale: ptBR })}
                      {l.pesoMedioKg ? ` • ${l.pesoMedioKg}kg` : ''}
                    </p>
                  </div>
                  <button onClick={() => onRemover(l.id)} className="touch-target flex items-center justify-center text-destructive/60 hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
