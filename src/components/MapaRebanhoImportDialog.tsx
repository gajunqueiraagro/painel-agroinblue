import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, X, Loader2, AlertTriangle, Image as ImageIcon, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Pasto, CategoriaRebanho } from '@/hooks/usePastos';

export interface MapaItemCategoria {
  categoria_id: string;
  quantidade: number;
  peso_medio_kg: number | null;
}

export interface MapaItem {
  pasto_id: string;
  pasto_nome: string;
  lote: string | null;
  categorias: MapaItemCategoria[];
}

interface ExtraidoCategoria {
  categoria: string;
  quantidade: number | null;
  peso_medio_kg: number | null;
}

interface ExtraidoPasto {
  pasto_nome: string;
  lote: string | null;
  categorias: ExtraidoCategoria[];
  pastoIdSelecionado: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pastos: Pasto[];
  categorias: CategoriaRebanho[];
  anoMes: string;
  onImportar: (dados: MapaItem[], anoMes: string) => void | Promise<void>;
}

const MESES_OPCOES = [
  { value: '01', label: 'Jan' }, { value: '02', label: 'Fev' }, { value: '03', label: 'Mar' },
  { value: '04', label: 'Abr' }, { value: '05', label: 'Mai' }, { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' }, { value: '08', label: 'Ago' }, { value: '09', label: 'Set' },
  { value: '10', label: 'Out' }, { value: '11', label: 'Nov' }, { value: '12', label: 'Dez' },
];

function normalize(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\bpasto\b/g, '')
    .replace(/\s+/g, '')
    .trim();
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

export function MapaRebanhoImportDialog({ open, onOpenChange, pastos, categorias, anoMes, onImportar }: Props) {
  const [imagem, setImagem] = useState<{ file: File; preview: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [extraidos, setExtraidos] = useState<ExtraidoPasto[]>([]);
  const [anoSel, setAnoSel] = useState(() => anoMes.split('-')[0] || String(new Date().getFullYear()));
  const [mesSel, setMesSel] = useState(() => anoMes.split('-')[1] || '01');
  const inputRef = useRef<HTMLInputElement>(null);

  const anosOpcoes = useMemo(() => {
    const anoAtual = new Date().getFullYear();
    const out: string[] = [];
    for (let y = anoAtual; y >= 2020; y--) out.push(String(y));
    return out;
  }, []);

  const pastosOpts = useMemo(
    () => [...pastos].filter(p => p.ativo).sort((a, b) => a.nome.localeCompare(b.nome)),
    [pastos],
  );

  const categoriaPorNome = useMemo(() => {
    const map = new Map<string, string>();
    categorias.forEach(c => map.set(c.nome.toLowerCase().trim(), c.id));
    return map;
  }, [categorias]);

  // Auto-match quando lista carrega
  const matchPasto = useCallback((nomeExtraido: string): string => {
    const target = normalize(nomeExtraido);
    if (!target) return '';
    const found = pastosOpts.find(p => normalize(p.nome) === target);
    return found?.id || '';
  }, [pastosOpts]);

  useEffect(() => {
    if (!open) {
      setImagem(null);
      setLoading(false);
      setExtraidos([]);
      if (inputRef.current) inputRef.current.value = '';
    } else {
      const [a, m] = anoMes.split('-');
      if (a) setAnoSel(a);
      if (m) setMesSel(m);
    }
  }, [open, anoMes]);

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
        body: { imageB64: b64, imageMime: mime, tipo: 'mapa_rebanho' },
      });
      if (error) {
        toast.error('Erro na extração: ' + (error as any).message);
        return;
      }
      const arr = Array.isArray(data?.data) ? data.data : [];
      if (arr.length === 0) {
        toast.error('Nenhum pasto extraído da imagem');
        return;
      }
      const mapped: ExtraidoPasto[] = arr.map((p: any) => {
        const nome = String(p?.pasto_nome ?? '').trim();
        return {
          pasto_nome: nome,
          lote: p?.lote ? String(p.lote).trim() : null,
          categorias: Array.isArray(p?.categorias)
            ? p.categorias.map((c: any) => ({
                categoria: String(c?.categoria ?? '').trim(),
                quantidade: c?.quantidade != null ? Number(c.quantidade) : null,
                peso_medio_kg: c?.peso_medio_kg != null ? Number(c.peso_medio_kg) : null,
              })).filter((c: ExtraidoCategoria) => c.categoria && c.quantidade != null && c.quantidade > 0)
            : [],
          pastoIdSelecionado: matchPasto(nome),
        };
      }).filter((p: ExtraidoPasto) => p.pasto_nome && p.categorias.length > 0);
      setExtraidos(mapped);
      const matched = mapped.filter(p => p.pastoIdSelecionado).length;
      toast.success(`${mapped.length} pasto(s) extraído(s) (${matched} com match automático)`);
    } catch (err: any) {
      toast.error('Erro: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const updatePastoId = (idx: number, pastoId: string) => {
    setExtraidos(prev => prev.map((p, i) => i === idx ? { ...p, pastoIdSelecionado: pastoId } : p));
  };

  const updateCategoria = (pastoIdx: number, catIdx: number, field: 'quantidade' | 'peso_medio_kg', value: string) => {
    const num = value === '' ? null : Number(value.replace(',', '.'));
    setExtraidos(prev => prev.map((p, i) => {
      if (i !== pastoIdx) return p;
      return {
        ...p,
        categorias: p.categorias.map((c, j) => j === catIdx ? { ...c, [field]: num } : c),
      };
    }));
  };

  const removerPasto = (idx: number) => {
    setExtraidos(prev => prev.filter((_, i) => i !== idx));
  };

  const algumSemMatch = extraidos.some(p => !p.pastoIdSelecionado);
  const algumSemCategoriaResolvida = extraidos.some(p =>
    p.categorias.some(c => !categoriaPorNome.has(c.categoria.toLowerCase().trim()))
  );

  const confirmar = async () => {
    if (importing) return;
    if (extraidos.length === 0) {
      toast.error('Nenhum pasto para importar');
      return;
    }
    if (algumSemMatch) {
      toast.error('Há pasto(s) sem match — selecione manualmente');
      return;
    }

    const dados: MapaItem[] = [];
    for (const p of extraidos) {
      const cats: MapaItemCategoria[] = [];
      for (const c of p.categorias) {
        const catId = categoriaPorNome.get(c.categoria.toLowerCase().trim());
        if (!catId || !c.quantidade || c.quantidade <= 0) continue;
        cats.push({
          categoria_id: catId,
          quantidade: c.quantidade,
          peso_medio_kg: c.peso_medio_kg,
        });
      }
      if (cats.length === 0) continue;
      dados.push({
        pasto_id: p.pastoIdSelecionado,
        pasto_nome: p.pasto_nome,
        lote: p.lote,
        categorias: cats,
      });
    }

    if (dados.length === 0) {
      toast.error('Nenhum item válido para importar');
      return;
    }

    setImporting(true);
    try {
      await onImportar(dados, `${anoSel}-${mesSel}`);
      onOpenChange(false);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            Importar Mapa do Rebanho com IA
            <div className="ml-2 flex items-center gap-1">
              <Select value={mesSel} onValueChange={setMesSel}>
                <SelectTrigger className="h-7 w-[72px] text-[11px] font-bold px-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES_OPCOES.map(m => (
                    <SelectItem key={m.value} value={m.value} className="text-[11px]">{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={anoSel} onValueChange={setAnoSel}>
                <SelectTrigger className="h-7 w-[72px] text-[11px] font-bold px-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {anosOpcoes.map(a => (
                    <SelectItem key={a} value={a} className="text-[11px]">{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* STEP 1: Upload */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              1. Foto do mapa
            </p>
            {!imagem ? (
              <div
                onDrop={onDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => inputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:bg-muted/30 transition-colors"
              >
                <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground">Arraste a foto aqui ou clique para selecionar</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }}
                />
              </div>
            ) : (
              <div className="border border-border rounded-lg p-3 flex items-start gap-3">
                <img src={imagem.preview} alt="preview" className="w-32 h-32 object-cover rounded border" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate flex items-center gap-1">
                    <ImageIcon className="h-3 w-3" /> {imagem.file.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {(imagem.file.size / 1024).toFixed(1)} KB
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" onClick={extrair} disabled={loading} className="h-7 text-[11px]">
                      {loading ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Extraindo...</> : <><Sparkles className="h-3 w-3 mr-1" /> Extrair com IA</>}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setImagem(null); setExtraidos([]); }} className="h-7 text-[11px]">
                      Trocar foto
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* STEP 2: Preview / Match */}
          {extraidos.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                2. Confira os dados extraídos ({extraidos.length} pasto(s))
              </p>
              <div className="space-y-2">
                {extraidos.map((p, idx) => {
                  const semMatch = !p.pastoIdSelecionado;
                  return (
                    <div key={idx} className={`rounded-lg border p-3 ${semMatch ? 'border-amber-300 bg-amber-50/40 dark:border-amber-700' : 'border-border bg-card'}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[11px] font-semibold text-foreground">Extraído: {p.pasto_nome}</span>
                            {p.lote && <Badge variant="outline" className="text-[9px] h-4">Lote: {p.lote}</Badge>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">→</span>
                            <Select value={p.pastoIdSelecionado || '__none__'} onValueChange={v => updatePastoId(idx, v === '__none__' ? '' : v)}>
                              <SelectTrigger className="h-7 text-[11px] w-[220px]">
                                <SelectValue placeholder="Selecione o pasto do sistema" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__" className="text-[11px] text-muted-foreground">— sem match —</SelectItem>
                                {pastosOpts.map(po => (
                                  <SelectItem key={po.id} value={po.id} className="text-[11px]">{po.nome}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {semMatch && (
                            <p className="text-[10px] text-amber-700 dark:text-amber-400 flex items-center gap-1 mt-1">
                              <AlertTriangle className="h-3 w-3" /> Pasto não identificado automaticamente — selecione manualmente
                            </p>
                          )}
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => removerPasto(idx)} className="h-6 w-6 shrink-0">
                          <X className="h-3 w-3" />
                        </Button>
                      </div>

                      <div className="space-y-1 mt-2">
                        <div className="grid grid-cols-[1.5fr_70px_70px] gap-2 text-[9px] font-semibold text-muted-foreground uppercase tracking-wide pb-1 border-b border-border/50">
                          <span>Categoria</span>
                          <span className="text-right">Qtd.</span>
                          <span className="text-right">Peso kg</span>
                        </div>
                        {p.categorias.map((c, cIdx) => {
                          const catKnown = categoriaPorNome.has(c.categoria.toLowerCase().trim());
                          return (
                            <div key={cIdx} className="grid grid-cols-[1.5fr_70px_70px] gap-2 items-center">
                              <span className={`text-[11px] ${catKnown ? 'text-foreground' : 'text-rose-600 italic'}`}>
                                {c.categoria}{!catKnown && ' (não reconhecida)'}
                              </span>
                              <Input
                                type="number"
                                value={c.quantidade ?? ''}
                                onChange={e => updateCategoria(idx, cIdx, 'quantidade', e.target.value)}
                                className="h-6 text-[11px] text-right tabular-nums px-1.5"
                              />
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={c.peso_medio_kg ?? ''}
                                onChange={e => updateCategoria(idx, cIdx, 'peso_medio_kg', e.target.value)}
                                className="h-6 text-[11px] text-right tabular-nums px-1.5"
                                placeholder="—"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {algumSemCategoriaResolvida && (
                <p className="text-[10px] text-rose-700 dark:text-rose-400 flex items-center gap-1 mt-2">
                  <AlertTriangle className="h-3 w-3" /> Categorias em vermelho não foram reconhecidas — serão ignoradas na importação
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t mt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={confirmar}
            disabled={extraidos.length === 0 || algumSemMatch || importing}
            className="gap-1"
          >
            {importing ? <><Loader2 className="h-3 w-3 animate-spin" /> Importando...</> : `Confirmar Importação (${extraidos.length})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
