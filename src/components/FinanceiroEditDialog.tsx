import { useState, useMemo, useEffect } from 'react';
import { Lancamento, CATEGORIAS, Categoria } from '@/types/cattle';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LancamentoShareButtons } from '@/components/FinanceiroExportMenu';
import { useFazenda } from '@/contexts/FazendaContext';
import { Trash2, Pencil, ArrowLeft } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { calcIndicadoresLancamento } from '@/lib/calculos/economicos';

interface Props {
  lancamento: Lancamento | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => void;
  onDelete: (id: string) => void;
}

function num(v: string): number | undefined {
  const n = parseFloat(v);
  return isNaN(n) ? undefined : n;
}

function fmt(v?: number, decimals = 2) {
  if (v === undefined || v === null || isNaN(v)) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function pct(v?: number) {
  if (v === undefined || v === null || isNaN(v)) return '-';
  return (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}

type DialogMode = 'detail' | 'edit';

export function FinanceiroEditDialog({ lancamento, open, onClose, onSave, onDelete }: Props) {
  const { fazendaAtual } = useFazenda();
  const [mode, setMode] = useState<DialogMode>('detail');
  const [data, setData] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [categoria, setCategoria] = useState<Categoria>('bois');
  const [local, setLocal] = useState('');
  const [pesoMedioKg, setPesoMedioKg] = useState('');
  const [pesoCarcacaKg, setPesoCarcacaKg] = useState('');
  const [precoArroba, setPrecoArroba] = useState('');
  const [bonusPrecoce, setBonusPrecoce] = useState('');
  const [bonusQualidade, setBonusQualidade] = useState('');
  const [bonusListaTrace, setBonusListaTrace] = useState('');
  const [descontoQualidade, setDescontoQualidade] = useState('');
  const [descontoFunrural, setDescontoFunrural] = useState('');
  const [outrosDescontos, setOutrosDescontos] = useState('');
  const [acrescimos, setAcrescimos] = useState('');
  const [deducoes, setDeducoes] = useState('');
  const [notaFiscal, setNotaFiscal] = useState('');
  const [tipoPeso, setTipoPeso] = useState<'vivo' | 'morto'>('vivo');

  useEffect(() => {
    if (lancamento) {
      setData(lancamento.data ?? '');
      setQuantidade(String(lancamento.quantidade ?? ''));
      setCategoria(lancamento.categoria as Categoria);
      setLocal(lancamento.tipo === 'compra' ? (lancamento.fazendaOrigem ?? '') : (lancamento.fazendaDestino ?? ''));
      setPesoMedioKg(lancamento.pesoMedioKg?.toString() ?? '');
      setPesoCarcacaKg(lancamento.pesoCarcacaKg?.toString() ?? '');
      setPrecoArroba(lancamento.precoArroba?.toString() ?? '');
      setBonusPrecoce(lancamento.bonusPrecoce?.toString() ?? '');
      setBonusQualidade(lancamento.bonusQualidade?.toString() ?? '');
      setBonusListaTrace(lancamento.bonusListaTrace?.toString() ?? '');
      setDescontoQualidade(lancamento.descontoQualidade?.toString() ?? '');
      setDescontoFunrural(lancamento.descontoFunrural?.toString() ?? '');
      setOutrosDescontos(lancamento.outrosDescontos?.toString() ?? '');
      setAcrescimos(lancamento.acrescimos?.toString() ?? '');
      setDeducoes(lancamento.deducoes?.toString() ?? '');
      setNotaFiscal(lancamento.notaFiscal ?? '');
      setTipoPeso(lancamento.tipoPeso ?? 'vivo');
    }
  }, [lancamento]);

  const isAbate = lancamento?.tipo === 'abate';

  const quantidadeNum = useMemo(() => {
    const parsed = Number(quantidade);
    if (isNaN(parsed) || parsed <= 0) return 0;
    return Math.floor(parsed);
  }, [quantidade]);

  const localLabel = lancamento?.tipo === 'compra' ? 'Origem' : 'Destino';

  const calc = useMemo(() => {
    if (!lancamento) return null;
    const qtd = quantidadeNum;
    const pesoVivo = num(pesoMedioKg) ?? 0;
    const pesoCarcaca = num(pesoCarcacaKg) ?? 0;
    const preco = num(precoArroba) ?? 0;

    const pesoTotalKg = pesoVivo * qtd;
    let pesoArroba = 0;
    let rendimentoCarcaca: number | undefined;

    if (isAbate) {
      pesoArroba = pesoCarcaca > 0 ? pesoCarcaca / 15 : 0;
      rendimentoCarcaca = pesoVivo > 0 && pesoCarcaca > 0 ? pesoCarcaca / pesoVivo : undefined;
    } else {
      pesoArroba = pesoVivo > 0 ? pesoVivo / 30 : 0;
    }

    const pesoTotalArrobas = pesoArroba * qtd;
    const valorBruto = pesoTotalArrobas * preco;

    const totalAcrescimos = isAbate
      ? (num(bonusPrecoce) ?? 0) + (num(bonusQualidade) ?? 0) + (num(bonusListaTrace) ?? 0)
      : (num(acrescimos) ?? 0);

    const totalDescontos = isAbate
      ? (num(descontoQualidade) ?? 0) + (num(descontoFunrural) ?? 0) + (num(outrosDescontos) ?? 0)
      : (num(deducoes) ?? 0);

    const valorTotal = valorBruto + totalAcrescimos - totalDescontos;
    const liqArroba = pesoTotalArrobas > 0 ? valorTotal / pesoTotalArrobas : 0;
    const liqCabeca = qtd > 0 ? valorTotal / qtd : 0;
    const liqKgVivo = pesoTotalKg > 0 ? valorTotal / pesoTotalKg : 0;

    return {
      pesoArroba,
      pesoTotalKg,
      pesoTotalArrobas,
      rendimentoCarcaca,
      valorBruto,
      totalAcrescimos,
      totalDescontos,
      valorTotal,
      liqArroba,
      liqCabeca,
      liqKgVivo,
    };
  }, [lancamento, quantidadeNum, pesoMedioKg, pesoCarcacaKg, precoArroba, bonusPrecoce, bonusQualidade, bonusListaTrace, descontoQualidade, descontoFunrural, outrosDescontos, acrescimos, deducoes, isAbate]);

  if (!lancamento || !calc) return null;

  const fazendaNome = fazendaAtual?.nome ?? '';

  const handleSave = () => {
    if (!data || quantidadeNum <= 0) return;

    const dados: Partial<Omit<Lancamento, 'id'>> = {
      data,
      quantidade: quantidadeNum,
      categoria,
      pesoMedioKg: num(pesoMedioKg) ?? null as any,
      precoArroba: num(precoArroba) ?? null as any,
      notaFiscal: notaFiscal || null as any,
      tipoPeso,
      fazendaOrigem: lancamento.tipo === 'compra' ? (local || undefined) : undefined,
      fazendaDestino: lancamento.tipo !== 'compra' ? (local || undefined) : undefined,
    };

    if (isAbate) {
      Object.assign(dados, {
        pesoCarcacaKg: num(pesoCarcacaKg) ?? null,
        bonusPrecoce: num(bonusPrecoce) ?? null,
        bonusQualidade: num(bonusQualidade) ?? null,
        bonusListaTrace: num(bonusListaTrace) ?? null,
        descontoQualidade: num(descontoQualidade) ?? null,
        descontoFunrural: num(descontoFunrural) ?? null,
        outrosDescontos: num(outrosDescontos) ?? null,
      });
    } else {
      Object.assign(dados, {
        acrescimos: num(acrescimos) ?? null,
        deducoes: num(deducoes) ?? null,
      });
    }

    // Always save the calculated valor_total
    dados.valorTotal = calc.valorTotal > 0 ? calc.valorTotal : null as any;

    onSave(lancamento.id, dados);
    onClose();
  };

  const handleDelete = () => {
    onDelete(lancamento.id);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            Editar {isAbate ? 'Abate' : lancamento.tipo === 'compra' ? 'Compra' : 'Venda'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {fazendaNome && (
            <div className="text-sm bg-muted/50 rounded-lg p-3">
              <span className="text-muted-foreground">Fazenda:</span> <strong>{fazendaNome}</strong>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" value={data} onChange={e => setData(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Quantidade</Label>
              <Input type="number" min="1" value={quantidade} onChange={e => setQuantidade(e.target.value)} className="h-9" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Categoria</Label>
            <Select value={categoria} onValueChange={v => setCategoria(v as Categoria)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">{localLabel}</Label>
            <Input value={local} onChange={e => setLocal(e.target.value)} placeholder={`Informe ${localLabel.toLowerCase()}`} className="h-9" />
          </div>

          <Separator />

          <h4 className="text-xs font-bold text-muted-foreground uppercase">Nota Fiscal</h4>
          <Input value={notaFiscal} onChange={e => setNotaFiscal(e.target.value)} placeholder="Nº da nota fiscal" className="h-9" />

          <Separator />

          <h4 className="text-xs font-bold text-muted-foreground uppercase">Pesos</h4>

          {isAbate && (
            <div>
              <Label className="text-xs">Tipo de Peso Negociado</Label>
              <Select value={tipoPeso} onValueChange={(v: 'vivo' | 'morto') => setTipoPeso(v)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vivo">Peso Vivo</SelectItem>
                  <SelectItem value="morto">Peso Morto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Peso Vivo (kg)</Label>
              <Input type="number" value={pesoMedioKg} onChange={e => setPesoMedioKg(e.target.value)} placeholder="0" className="h-9" />
            </div>
            {isAbate && (
              <div>
                <Label className="text-xs">Peso Carcaça (kg)</Label>
                <Input type="number" value={pesoCarcacaKg} onChange={e => setPesoCarcacaKg(e.target.value)} placeholder="0" className="h-9" />
              </div>
            )}
          </div>

          <Separator />

          <h4 className="text-xs font-bold text-muted-foreground uppercase">Valor da Operação</h4>
          <div>
            <Label className="text-xs font-bold">Valor Total Final (R$)</Label>
            <Input type="number" value={calc.valorTotal > 0 ? String(calc.valorTotal) : ''} onChange={e => {
              // When user types valorTotal directly, we back-calculate precoArroba
              const vt = parseFloat(e.target.value);
              if (!isNaN(vt) && calc.pesoTotalArrobas > 0) {
                const totalAcr = isAbate ? (num(bonusPrecoce) ?? 0) + (num(bonusQualidade) ?? 0) + (num(bonusListaTrace) ?? 0) : (num(acrescimos) ?? 0);
                const totalDes = isAbate ? (num(descontoQualidade) ?? 0) + (num(descontoFunrural) ?? 0) + (num(outrosDescontos) ?? 0) : (num(deducoes) ?? 0);
                const bruto = vt - totalAcr + totalDes;
                setPrecoArroba(String((bruto / calc.pesoTotalArrobas).toFixed(4)));
              }
            }} placeholder="Valor total líquido" className="h-10 text-base font-bold" />
          </div>
          {calc.liqArroba > 0 && (
            <div className="bg-primary/10 rounded-lg p-2 text-sm font-bold flex justify-between">
              <span>R$/líq @</span>
              <span className="text-primary">R$ {fmt(calc.liqArroba)}</span>
            </div>
          )}
          <div>
            <Label className="text-xs text-muted-foreground">Preço referência por arroba (R$)</Label>
            <Input type="number" value={precoArroba} onChange={e => setPrecoArroba(e.target.value)} placeholder="0,00" className="h-9" />
          </div>

          <Separator />

          {isAbate ? (
            <>
              <h4 className="text-xs font-bold text-muted-foreground uppercase">Bônus (R$)</h4>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Precoce</Label>
                  <Input type="number" value={bonusPrecoce} onChange={e => setBonusPrecoce(e.target.value)} placeholder="0" className="h-9" />
                </div>
                <div>
                  <Label className="text-xs">Qualidade</Label>
                  <Input type="number" value={bonusQualidade} onChange={e => setBonusQualidade(e.target.value)} placeholder="0" className="h-9" />
                </div>
                <div>
                  <Label className="text-xs">Lista Trace</Label>
                  <Input type="number" value={bonusListaTrace} onChange={e => setBonusListaTrace(e.target.value)} placeholder="0" className="h-9" />
                </div>
              </div>

              <h4 className="text-xs font-bold text-muted-foreground uppercase">Descontos (R$)</h4>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Qualidade</Label>
                  <Input type="number" value={descontoQualidade} onChange={e => setDescontoQualidade(e.target.value)} placeholder="0" className="h-9" />
                </div>
                <div>
                  <Label className="text-xs">Funrural</Label>
                  <Input type="number" value={descontoFunrural} onChange={e => setDescontoFunrural(e.target.value)} placeholder="0" className="h-9" />
                </div>
                <div>
                  <Label className="text-xs">Outros</Label>
                  <Input type="number" value={outrosDescontos} onChange={e => setOutrosDescontos(e.target.value)} placeholder="0" className="h-9" />
                </div>
              </div>
            </>
          ) : (
            <>
              <h4 className="text-xs font-bold text-muted-foreground uppercase">Ajustes (R$)</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Acréscimos</Label>
                  <Input type="number" value={acrescimos} onChange={e => setAcrescimos(e.target.value)} placeholder="0" className="h-9" />
                </div>
                <div>
                  <Label className="text-xs">Deduções</Label>
                  <Input type="number" value={deducoes} onChange={e => setDeducoes(e.target.value)} placeholder="0" className="h-9" />
                </div>
              </div>
            </>
          )}
        </div>

        <Separator />

        <div className="space-y-2">
          <h4 className="text-xs font-bold text-muted-foreground uppercase">Valores Calculados</h4>
          <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
            {isAbate && calc.rendimentoCarcaca !== undefined && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rendimento carcaça</span>
                <strong>{pct(calc.rendimentoCarcaca)}</strong>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Peso em @ (por cab)</span>
              <strong>{fmt(calc.pesoArroba)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Peso total (kg)</span>
              <strong>{fmt(calc.pesoTotalKg, 0)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Peso total (@)</span>
              <strong>{fmt(calc.pesoTotalArrobas)}</strong>
            </div>

            <Separator className="my-2" />

            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor bruto</span>
              <span>R$ {fmt(calc.valorBruto)}</span>
            </div>
            {calc.totalAcrescimos > 0 && (
              <div className="flex justify-between text-success">
                <span>+ Acréscimos/Bônus</span>
                <span>R$ {fmt(calc.totalAcrescimos)}</span>
              </div>
            )}
            {calc.totalDescontos > 0 && (
              <div className="flex justify-between text-destructive">
                <span>- Descontos</span>
                <span>R$ {fmt(calc.totalDescontos)}</span>
              </div>
            )}

            <Separator className="my-2" />

            <div className="flex justify-between text-base font-bold">
              <span>Valor Total Líquido</span>
              <span className="text-primary">R$ {fmt(calc.valorTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Líquido por @</span>
              <strong>R$ {fmt(calc.liqArroba)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Líquido por cabeça</span>
              <strong>R$ {fmt(calc.liqCabeca)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Líquido por kg vivo</span>
              <strong>R$ {fmt(calc.liqKgVivo)}</strong>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="destructive" size="icon" onClick={handleDelete} aria-label="Excluir lançamento">
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button onClick={handleSave} className="flex-1">Salvar</Button>
          <LancamentoShareButtons
            lancamento={{
              ...lancamento,
              data,
              quantidade: quantidadeNum || lancamento.quantidade,
              categoria,
              fazendaOrigem: lancamento.tipo === 'compra' ? local : lancamento.fazendaOrigem,
              fazendaDestino: lancamento.tipo !== 'compra' ? local : lancamento.fazendaDestino,
              pesoMedioKg: num(pesoMedioKg),
              pesoCarcacaKg: num(pesoCarcacaKg),
              precoArroba: num(precoArroba),
              bonusPrecoce: num(bonusPrecoce),
              bonusQualidade: num(bonusQualidade),
              bonusListaTrace: num(bonusListaTrace),
              descontoQualidade: num(descontoQualidade),
              descontoFunrural: num(descontoFunrural),
              outrosDescontos: num(outrosDescontos),
              acrescimos: num(acrescimos),
              deducoes: num(deducoes),
              notaFiscal,
              tipoPeso,
            }}
            fazendaNome={fazendaNome}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
