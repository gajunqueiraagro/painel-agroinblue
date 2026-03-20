import { useState, useMemo } from 'react';
import {
  Lancamento,
  CATEGORIAS,
  TIPOS_ENTRADA,
  TIPOS_SAIDA,
  TODOS_TIPOS,
  TipoMovimentacao,
  Categoria,
  isEntrada,
  isReclassificacao,
  kgToArrobas,
} from '@/types/cattle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronRight } from 'lucide-react';
import { LancamentoDetalhe } from '@/components/LancamentoDetalhe';
import { ReclassificacaoForm } from '@/components/ReclassificacaoForm';
import { useFazenda } from '@/contexts/FazendaContext';

interface Props {
  lancamentos: Lancamento[];
  onAdicionar: (l: Omit<Lancamento, 'id'>) => void;
  onEditar: (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => void;
  onRemover: (id: string) => void;
}

type Aba = 'entrada' | 'saida' | 'reclassificacao' | 'historico';

/** Returns field config per movement type */
function getCamposFazenda(tipo: TipoMovimentacao, nomeFazenda: string) {
  switch (tipo) {
    case 'nascimento':
      return {
        origem: { show: false },
        destino: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Destino' },
      };
    case 'compra':
      return {
        origem: { show: true, auto: false, label: 'Fazenda Origem' },
        destino: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Destino' },
      };
    case 'transferencia_entrada':
      return {
        origem: { show: true, auto: false, label: 'Fazenda Origem', useSelect: true },
        destino: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Destino' },
      };
    case 'abate':
      return {
        origem: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Origem' },
        destino: { show: true, auto: false, label: 'Fazenda Destino' },
      };
    case 'venda':
      return {
        origem: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Origem' },
        destino: { show: true, auto: false, label: 'Fazenda Destino' },
      };
    case 'transferencia_saida':
      return {
        origem: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Origem' },
        destino: { show: true, auto: false, label: 'Fazenda Destino', useSelect: true },
      };
    case 'consumo':
      return {
        origem: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Origem' },
        destino: { show: true, auto: false, label: 'Motivo', placeholder: 'Ex: Consumo interno' },
      };
    case 'morte':
      return {
        origem: { show: true, auto: true, value: nomeFazenda, label: 'Fazenda Origem' },
        destino: { show: true, auto: false, label: 'Motivo da Morte', placeholder: 'Ex: Raio, Picada de cobra' },
      };
    default:
      return {
        origem: { show: true, auto: false, label: 'Fazenda Origem' },
        destino: { show: true, auto: false, label: 'Fazenda Destino' },
      };
  }
}

export function LancamentosTab({ lancamentos, onAdicionar, onEditar, onRemover }: Props) {
  const { fazendaAtual, fazendas } = useFazenda();
  const nomeFazenda = fazendaAtual?.nome || '';

  // Other fazendas for transfer dropdowns (exclude current)
  const outrasFazendas = useMemo(() => fazendas.filter(f => f.id !== fazendaAtual?.id), [fazendas, fazendaAtual]);

  const [aba, setAba] = useState<Aba>('entrada');
  const [tipo, setTipo] = useState<TipoMovimentacao>('nascimento');
  const [categoria, setCategoria] = useState<Categoria>('bois');
  const [quantidade, setQuantidade] = useState('');
  const [data, setData] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [fazendaOrigem, setFazendaOrigem] = useState('');
  const [fazendaDestino, setFazendaDestino] = useState('');
  const [pesoKg, setPesoKg] = useState('');
  const [preco, setPreco] = useState('');
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));
  const [mesFiltro, setMesFiltro] = useState('todos');

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => {
      try { anos.add(format(parseISO(l.data), 'yyyy')); } catch {}
    });
    return Array.from(anos).sort().reverse();
  }, [lancamentos]);

  const MESES = [
    { value: 'todos', label: 'Todos' },
    { value: '01', label: 'Jan' }, { value: '02', label: 'Fev' },
    { value: '03', label: 'Mar' }, { value: '04', label: 'Abr' },
    { value: '05', label: 'Mai' }, { value: '06', label: 'Jun' },
    { value: '07', label: 'Jul' }, { value: '08', label: 'Ago' },
    { value: '09', label: 'Set' }, { value: '10', label: 'Out' },
    { value: '11', label: 'Nov' }, { value: '12', label: 'Dez' },
  ];

  const historicoFiltrado = useMemo(() => {
    return lancamentos.filter(l => {
      try {
        const d = parseISO(l.data);
        if (format(d, 'yyyy') !== anoFiltro) return false;
        if (mesFiltro !== 'todos' && format(d, 'MM') !== mesFiltro) return false;
        return true;
      } catch { return false; }
    });
  }, [lancamentos, anoFiltro, mesFiltro]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quantidade || Number(quantidade) <= 0) return;

    const origemFinal = campos.origem.show
      ? (campos.origem.auto ? campos.origem.value : fazendaOrigem) || undefined
      : undefined;

    const destinoFinal = campos.destino.show
      ? (campos.destino.auto ? campos.destino.value : fazendaDestino) || undefined
      : undefined;

    onAdicionar({
      data,
      tipo,
      quantidade: Number(quantidade),
      categoria,
      fazendaOrigem: origemFinal,
      fazendaDestino: destinoFinal,
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

  const abas: { id: Aba; label: string }[] = [
    { id: 'entrada', label: '📥 Entradas' },
    { id: 'saida', label: '📤 Saídas' },
    { id: 'reclassificacao', label: '🔄 Reclass.' },
    { id: 'historico', label: '📋 Histórico' },
  ];

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 animate-fade-in pb-20">
      {/* Seletor de aba */}
      <div className="grid grid-cols-4 gap-1 bg-muted rounded-lg p-1">
        {abas.map(a => (
          <button
            key={a.id}
            onClick={() => {
              setAba(a.id);
              if (a.id === 'entrada') setTipo('nascimento');
              if (a.id === 'saida') setTipo('abate');
            }}
            className={`py-2 px-1 rounded-md text-xs font-bold transition-colors touch-target ${
              aba === a.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {aba === 'reclassificacao' ? (
        <ReclassificacaoForm onAdicionar={onAdicionar} />
      ) : aba !== 'historico' ? (
        <form onSubmit={handleSubmit} className="bg-card rounded-lg p-4 shadow-sm border space-y-4">
          {/* Tipo */}
          <div>
            <Label className="font-bold text-foreground">Tipo</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {tiposDisponiveis.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => { setTipo(t.value); setFazendaOrigem(''); setFazendaDestino(''); }}
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="font-bold text-foreground">Data</Label>
              <Input type="date" value={data} onChange={e => setData(e.target.value)} className="mt-1 touch-target text-base" />
            </div>
            <div>
              <Label className="font-bold text-foreground">Qtd. Cabeças</Label>
              <Input type="number" value={quantidade} onChange={e => setQuantidade(e.target.value)} placeholder="0" min="1" className="mt-1 touch-target text-base text-center font-bold text-lg" />
            </div>
          </div>

          <div>
            <Label className="font-bold text-foreground">Categoria</Label>
            <Select value={categoria} onValueChange={v => setCategoria(v as Categoria)}>
              <SelectTrigger className="mt-1 touch-target text-base"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value} className="text-base">{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Fazenda Origem / Destino - dinâmico por tipo */}
          <div className="grid grid-cols-2 gap-3">
            {campos.origem.show && (
              <div>
                <Label className="font-bold text-foreground">{campos.origem.label}</Label>
                {campos.origem.auto ? (
                  <Input value={campos.origem.value} readOnly className="mt-1 touch-target text-base bg-muted cursor-not-allowed" />
                ) : (campos.origem as any).useSelect && outrasFazendas.length > 0 ? (
                  <Select value={fazendaOrigem} onValueChange={setFazendaOrigem}>
                    <SelectTrigger className="mt-1 touch-target text-base"><SelectValue placeholder="Selecione a fazenda" /></SelectTrigger>
                    <SelectContent>
                      {outrasFazendas.map(f => (
                        <SelectItem key={f.id} value={f.nome}>{f.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={fazendaOrigem}
                    onChange={e => setFazendaOrigem(e.target.value)}
                    placeholder="Ex: Faz. Boa Vista"
                    className="mt-1 touch-target text-base"
                  />
                )}
              </div>
            )}
            {campos.destino.show && (
              <div>
                <Label className="font-bold text-foreground">{campos.destino.label}</Label>
                {campos.destino.auto ? (
                  <Input value={campos.destino.value} readOnly className="mt-1 touch-target text-base bg-muted cursor-not-allowed" />
                ) : (campos.destino as any).useSelect && outrasFazendas.length > 0 ? (
                  <Select value={fazendaDestino} onValueChange={setFazendaDestino}>
                    <SelectTrigger className="mt-1 touch-target text-base"><SelectValue placeholder="Selecione a fazenda" /></SelectTrigger>
                    <SelectContent>
                      {outrasFazendas.map(f => (
                        <SelectItem key={f.id} value={f.nome}>{f.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={fazendaDestino}
                    onChange={e => setFazendaDestino(e.target.value)}
                    placeholder={campos.destino.placeholder || 'Ex: Faz. Santa Cruz'}
                    className="mt-1 touch-target text-base"
                  />
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="font-bold text-foreground">Peso Médio (kg)</Label>
              <Input type="number" value={pesoKg} onChange={e => setPesoKg(e.target.value)} placeholder="0" className="mt-1 touch-target text-base" />
              {pesoKg && Number(pesoKg) > 0 && (
                <p className="text-xs text-muted-foreground mt-1">≈ {kgToArrobas(Number(pesoKg))} arrobas</p>
              )}
            </div>
            <div>
              <Label className="font-bold text-foreground">Preço/Cabeça (R$)</Label>
              <Input type="number" value={preco} onChange={e => setPreco(e.target.value)} placeholder="0,00" className="mt-1 touch-target text-base" />
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
              const reclass = isReclassificacao(l.tipo);
              const catLabel = CATEGORIAS.find(c => c.value === l.categoria)?.label;
              const catDestinoLabel = l.categoriaDestino ? CATEGORIAS.find(c => c.value === l.categoriaDestino)?.label : null;
              const tipoLabel = TODOS_TIPOS.find(t => t.value === l.tipo);
              return (
                <button
                  key={l.id}
                  onClick={() => setDetalheId(l.id)}
                  className="w-full bg-card rounded-lg p-3 border shadow-sm flex items-center gap-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="text-2xl">{tipoLabel?.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${entrada ? 'bg-success/20 text-success' : reclass ? 'bg-accent/20 text-accent-foreground' : 'bg-destructive/20 text-destructive'}`}>
                        {entrada ? '+' : reclass ? '↔' : '-'}{l.quantidade}
                      </span>
                      <span className="text-sm font-bold text-foreground truncate">{tipoLabel?.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {catLabel}{catDestinoLabel ? ` → ${catDestinoLabel}` : ''} • {format(parseISO(l.data), 'dd/MM/yyyy', { locale: ptBR })}
                      {l.pesoMedioKg ? ` • ${l.pesoMedioKg}kg` : ''}
                      {l.precoMedioCabeca ? ` • R$${l.precoMedioCabeca}` : ''}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              );
            })
          )}
        </div>
      )}

      {lancamentoDetalhe && (
        <LancamentoDetalhe
          lancamento={lancamentoDetalhe}
          open={!!detalheId}
          onClose={() => setDetalheId(null)}
          onEditar={onEditar}
          onRemover={onRemover}
        />
      )}
    </div>
  );
}
