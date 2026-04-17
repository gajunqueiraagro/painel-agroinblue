import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Upload, Sparkles, Save, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';

type AbaTipo = 'entradas' | 'saidas' | 'nascimentos' | 'mortes_consumo' | 'chuvas';

const ABAS: { id: AbaTipo; label: string }[] = [
  { id: 'entradas', label: 'Entradas' },
  { id: 'saidas', label: 'Saídas' },
  { id: 'nascimentos', label: 'Nascimentos' },
  { id: 'mortes_consumo', label: 'Mortes/Consumo' },
  { id: 'chuvas', label: 'Chuvas' },
];

const COLUNAS_POR_ABA: Record<AbaTipo, string[]> = {
  entradas: ['data', 'tipo_op', 'categoria', 'quantidade', 'peso_medio_kg', 'preco_medio_cabeca', 'fazenda_origem', 'observacao'],
  saidas: ['data', 'tipo_op', 'categoria', 'quantidade', 'peso_medio_kg', 'peso_carcaca_kg', 'preco_medio_cabeca', 'fazenda_destino', 'observacao'],
  nascimentos: ['data', 'categoria', 'quantidade', 'observacao'],
  mortes_consumo: ['data', 'evento', 'categoria', 'quantidade', 'observacao'],
  chuvas: ['data', 'mm', 'observacao'],
};

type Linha = Record<string, string | number | null>;

const TIPO_OP_OPCOES_ENTRADAS = ['Compra', 'Transferência'];
const TIPO_OP_OPCOES_SAIDAS = ['Venda', 'Transferência', 'Abate', 'Abate+Venda'];
const CATEGORIA_OPCOES = [
  'Touro', 'Vaca',
  'Mamote M', 'Mamote F',
  'Desmama M', 'Desmama F',
  'Novilha 1', 'Novilha 2',
  'Garrote 1', 'Garrote 2',
  'Boi',
];

// Converte YYYY-MM-DD <-> DD/MM/AAAA
function isoToBr(iso: string): string {
  const s = (iso ?? '').toString().trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
function brToIso(br: string): string {
  const s = (br ?? '').toString().trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return s; // mantém entrada para usuário corrigir
  return `${m[3]}-${m[2]}-${m[1]}`;
}
// Limpa "Sexo M/F" e prefixos similares de observações
function limparObservacao(v: unknown): string {
  if (v == null) return '';
  let s = String(v).trim();
  s = s.replace(/sexo\s*[:\-]?\s*[mf]\b\.?/gi, '').trim();
  s = s.replace(/^[\s,;.\-/|]+|[\s,;.\-/|]+$/g, '').trim();
  return s;
}

function fileToBase64(file: File): Promise<{ b64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [meta, data] = result.split(',');
      const mime = meta.match(/data:([^;]+)/)?.[1] || file.type || 'image/jpeg';
      resolve({ b64: data, mime });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isUncertain(value: unknown): boolean {
  return typeof value === 'string' && value.trim().startsWith('?');
}

function stripUncertain(value: unknown): string {
  if (typeof value !== 'string') return String(value ?? '');
  return value.trim().startsWith('?') ? value.trim().slice(1).trim() : value;
}

export default function CadernoImportTab() {
  const navigate = useNavigate();
  const { fazendas, fazendaAtual } = useFazenda();
  const { clienteAtual } = useCliente();
  const fazendasList = useMemo(
    () => fazendas.filter((f) => f.id !== '__global__').sort((a, b) => a.nome.localeCompare(b.nome)),
    [fazendas]
  );

  const [fazendaId, setFazendaId] = useState<string>(
    fazendaAtual && fazendaAtual.id !== '__global__' ? fazendaAtual.id : (fazendasList[0]?.id ?? '')
  );
  const [aba, setAba] = useState<AbaTipo>('entradas');
  const [linhasPorAba, setLinhasPorAba] = useState<Record<AbaTipo, Linha[]>>({
    entradas: [], saidas: [], nascimentos: [], mortes_consumo: [], chuvas: [],
  });
  const [imagem, setImagem] = useState<{ file: File; preview: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const linhas = linhasPorAba[aba];
  const colunas = COLUNAS_POR_ABA[aba];

  const onFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem');
      return;
    }
    const preview = URL.createObjectURL(file);
    setImagem({ file, preview });
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }, [onFile]);

  const extrair = async () => {
    if (!imagem) {
      toast.error('Selecione uma foto primeiro');
      return;
    }
    setLoading(true);
    try {
      const { b64, mime } = await fileToBase64(imagem.file);
      const { data, error } = await supabase.functions.invoke('extract-caderno', {
        body: { imageB64: b64, imageMime: mime, tipo: aba },
      });
      if (error) {
        // Tenta extrair detalhe do corpo da resposta da edge function
        let detalhe = '';
        try {
          const ctx = (error as any).context;
          if (ctx?.body) {
            const txt = typeof ctx.body === 'string' ? ctx.body : await new Response(ctx.body).text();
            const j = JSON.parse(txt);
            detalhe = j?.detalhe || j?.error || '';
          }
        } catch { /* ignore */ }
        if (detalhe.includes('credit balance is too low')) {
          toast.error('Sem créditos na conta Anthropic. Adicione créditos em console.anthropic.com → Plans & Billing.');
        } else {
          toast.error(detalhe || (error as Error).message || 'Erro ao extrair');
        }
        return;
      }
      const arr = (data?.data ?? []) as Linha[];
      // Sanitiza: remove "Sexo M/F" da observação que algumas IAs injetam
      const limpas = arr.map((l) => ({
        ...l,
        observacao: l.observacao ? limparObservacao(l.observacao) : l.observacao ?? '',
      }));
      setLinhasPorAba((prev) => ({ ...prev, [aba]: [...prev[aba], ...limpas] }));
      toast.success(`${limpas.length} linha(s) extraída(s)`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Erro ao extrair');
    } finally {
      setLoading(false);
    }
  };

  const updateCell = (idx: number, col: string, valor: string) => {
    setLinhasPorAba((prev) => {
      const novo = [...prev[aba]];
      novo[idx] = { ...novo[idx], [col]: valor };
      return { ...prev, [aba]: novo };
    });
  };

  const removeRow = (idx: number) => {
    setLinhasPorAba((prev) => ({ ...prev, [aba]: prev[aba].filter((_, i) => i !== idx) }));
  };

  const mapLinhaToLancamento = (l: Linha): any | null => {
    if (!fazendaId || !clienteAtual) return null;
    const data = stripUncertain(l.data);
    const categoria = stripUncertain(l.categoria);
    const quantidade = Number(stripUncertain(l.quantidade)) || 0;
    if (!data || quantidade <= 0) return null;

    const base = {
      fazenda_id: fazendaId,
      cliente_id: clienteAtual.id,
      data,
      categoria,
      quantidade,
      peso_medio_kg: l.peso_medio_kg ? Number(stripUncertain(l.peso_medio_kg)) : null,
      observacao: l.observacao ? stripUncertain(l.observacao) : null,
      origem: 'caderno_ia' as const,
      cenario: 'realizado' as const,
      status_operacional: 'realizado' as const,
    };

    if (aba === 'entradas') {
      const tipoOp = stripUncertain(l.tipo_op).toLowerCase();
      if (tipoOp.includes('transfer')) return null; // ignora — entrada de transferência é gerada pela saída
      return {
        ...base,
        tipo: 'compra',
        preco_medio_cabeca: l.preco_medio_cabeca ? Number(stripUncertain(l.preco_medio_cabeca)) : null,
        fazenda_origem: l.fazenda_origem ? stripUncertain(l.fazenda_origem) : null,
      };
    }
    if (aba === 'saidas') {
      const tipoOp = stripUncertain(l.tipo_op).toLowerCase();
      let tipo = 'venda';
      if (tipoOp.includes('abate')) tipo = 'abate';
      else if (tipoOp.includes('transfer')) tipo = 'transferencia_saida';
      return {
        ...base,
        tipo,
        peso_carcaca_kg: l.peso_carcaca_kg ? Number(stripUncertain(l.peso_carcaca_kg)) : null,
        preco_medio_cabeca: l.preco_medio_cabeca ? Number(stripUncertain(l.preco_medio_cabeca)) : null,
        fazenda_destino: l.fazenda_destino ? stripUncertain(l.fazenda_destino) : null,
      };
    }
    if (aba === 'nascimentos') return { ...base, tipo: 'nascimento' };
    if (aba === 'mortes_consumo') {
      const evento = stripUncertain(l.evento).toLowerCase();
      let tipo = 'morte';
      if (evento.includes('consumo')) tipo = 'consumo';
      else if (evento.includes('doa')) tipo = 'venda'; // doação como saída sem valor
      return { ...base, tipo };
    }
    return null;
  };

  const confirmar = async () => {
    if (!fazendaId || !clienteAtual) {
      toast.error('Selecione uma fazenda');
      return;
    }
    if (linhas.length === 0) {
      toast.error('Sem linhas para salvar');
      return;
    }
    setSalvando(true);
    try {
      if (aba === 'chuvas') {
        const registros = linhas
          .map((l) => {
            const data = stripUncertain(l.data);
            const mm = Number(stripUncertain(l.mm));
            if (!data || isNaN(mm)) return null;
            return {
              fazenda_id: fazendaId,
              cliente_id: clienteAtual.id,
              data,
              milimetros: mm,
              observacao: l.observacao ? stripUncertain(l.observacao) : null,
            };
          })
          .filter(Boolean) as any[];
          if (registros.length === 0) throw new Error('Nenhuma linha válida');
          const { error } = await supabase.from('chuvas').insert(registros);
          if (error) throw error;
          toast.success(`${registros.length} chuva(s) salvas`);
      } else {
        const registros = linhas.map(mapLinhaToLancamento).filter(Boolean) as any[];
        if (registros.length === 0) throw new Error('Nenhuma linha válida (verifique data, categoria e quantidade)');
        const { error } = await supabase.from('lancamentos').insert(registros);
        if (error) throw error;
        toast.success(`${registros.length} lançamento(s) salvos`);
      }
      setLinhasPorAba((prev) => ({ ...prev, [aba]: [] }));
      setImagem(null);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <h1 className="text-xl font-bold">📓 Importação de Caderno</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Fazenda:</span>
            <Select value={fazendaId} onValueChange={setFazendaId}>
              <SelectTrigger className="w-[220px] h-8 text-xs">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {fazendasList.map((f) => (
                  <SelectItem key={f.id} value={f.id} className="text-xs">{f.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={aba} onValueChange={(v) => setAba(v as AbaTipo)}>
          <TabsList className="h-9">
            {ABAS.map((a) => (
              <TabsTrigger key={a.id} value={a.id} className="text-xs">{a.label}</TabsTrigger>
            ))}
          </TabsList>

          {ABAS.map((a) => (
            <TabsContent key={a.id} value={a.id} className="space-y-3">
              <Card className="p-4">
                <div
                  onDrop={onDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => inputRef.current?.click()}
                  className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:bg-muted/30 transition-colors"
                >
                  {imagem ? (
                    <div className="flex flex-col items-center gap-2">
                      <img src={imagem.preview} alt="caderno" className="max-h-48 rounded-md" />
                      <span className="text-xs text-muted-foreground">{imagem.file.name}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Upload className="h-8 w-8" />
                      <span className="text-sm">Arraste a foto do caderno aqui ou clique para selecionar</span>
                    </div>
                  )}
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onFile(f);
                    }}
                  />
                </div>

                <div className="flex justify-end gap-2 mt-3">
                  {imagem && (
                    <Button variant="outline" size="sm" onClick={() => setImagem(null)}>Trocar</Button>
                  )}
                  <Button size="sm" onClick={extrair} disabled={!imagem || loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Extrair com IA
                  </Button>
                </div>
              </Card>

              {linhas.length > 0 && (
                <Card className="p-3">
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {colunas.map((c) => (
                            <TableHead key={c} className="capitalize">{c.replace(/_/g, ' ')}</TableHead>
                          ))}
                          <TableHead className="w-12"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {linhas.map((l, idx) => (
                          <TableRow key={idx}>
                            {colunas.map((c) => {
                              const v = l[c];
                              const uncertain = isUncertain(v);
                              return (
                                <TableCell key={c} className={cn(uncertain && 'bg-amber-100 dark:bg-amber-950/40')}>
                                  <Input
                                    value={v == null ? '' : String(v)}
                                    onChange={(e) => updateCell(idx, c, e.target.value)}
                                    className="h-7 text-xs"
                                  />
                                </TableCell>
                              );
                            })}
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRow(idx)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex justify-between items-center mt-3">
                    <span className="text-xs text-muted-foreground">
                      {linhas.length} linha(s) • células amarelas = valores incertos (revisar antes de salvar)
                    </span>
                    <Button size="sm" onClick={confirmar} disabled={salvando || !fazendaId}>
                      {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Confirmar e Salvar
                    </Button>
                  </div>
                </Card>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
