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
  const [tipoPeso, setTipoPeso] = useState<string>('vivo');

  useEffect(() => {
    if (lancamento) {
      setMode('detail');
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

  const SUB_ABA_LABELS: Record<string, { label: string; icon: string }> = {
    nascimento: { label: 'Nascimento', icon: '🐄' },
    compra: { label: 'Compra', icon: '🛒' },
    transferencia_entrada: { label: 'Transf. Entrada', icon: '📥' },
    abate: { label: 'Abate', icon: '🔪' },
    venda: { label: 'Venda', icon: '💰' },
    transferencia_saida: { label: 'Transf. Saída', icon: '📤' },
    consumo: { label: 'Consumo', icon: '🍖' },
    morte: { label: 'Morte', icon: '💀' },
  };
  const tipoInfo = SUB_ABA_LABELS[lancamento.tipo] || { label: lancamento.tipo, icon: '📋' };
  const catInfo = CATEGORIAS.find(c => c.value === lancamento.categoria);
  const indicadores = calcIndicadoresLancamento(lancamento);

  // ===== DETAIL VIEW MODE =====
  if (mode === 'detail') {
    return (
      <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="text-xl">{tipoInfo.icon}</span>
              {tipoInfo.label}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {fazendaNome && (
              <div className="text-sm bg-muted/50 rounded-lg p-2.5">
                <span className="text-muted-foreground">Fazenda:</span> <strong className="text-foreground">{fazendaNome}</strong>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Data</p>
                <p className="font-bold text-foreground">
                  {(() => { try { return format(parseISO(lancamento.data), 'dd/MM/yyyy', { locale: ptBR }); } catch { return lancamento.data; } })()}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Quantidade</p>
                <p className="font-bold text-foreground">{lancamento.quantidade} cab.</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Categoria</p>
                <p className="font-bold text-foreground">{catInfo?.label ?? lancamento.categoria}</p>
              </div>
              {lancamento.pesoMedioKg != null && lancamento.pesoMedioKg > 0 && (
                <div>
                  <p className="text-muted-foreground text-xs">Peso Vivo</p>
                  <p className="font-bold text-foreground">{lancamento.pesoMedioKg} kg</p>
                </div>
              )}
              {lancamento.fazendaOrigem && (
                <div>
                  <p className="text-muted-foreground text-xs">Origem</p>
                  <p className="font-bold text-foreground">{lancamento.fazendaOrigem}</p>
                </div>
              )}
              {lancamento.fazendaDestino && (
                <div>
                  <p className="text-muted-foreground text-xs">Destino</p>
                  <p className="font-bold text-foreground">{lancamento.fazendaDestino}</p>
                </div>
              )}
              {lancamento.notaFiscal && (
                <div>
                  <p className="text-muted-foreground text-xs">Nota Fiscal</p>
                  <p className="font-bold text-foreground">{lancamento.notaFiscal}</p>
                </div>
              )}
            </div>

            {/* Indicadores calculados */}
            {indicadores.valorFinal > 0 && (
              <>
                <Separator />
                <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between text-base font-bold">
                    <span>Valor Total</span>
                    <span className="text-primary">R$ {fmt(indicadores.valorFinal)}</span>
                  </div>
                  {indicadores.liqArroba > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">R$/líq @</span>
                      <strong>R$ {fmt(indicadores.liqArroba)}</strong>
                    </div>
                  )}
                  {indicadores.liqCabeca > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Líq/Cabeça</span>
                      <strong>R$ {fmt(indicadores.liqCabeca)}</strong>
                    </div>
                  )}
                  {isAbate && indicadores.rendimento > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Rendimento</span>
                      <strong>{indicadores.rendimento.toFixed(1)}%</strong>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <LancamentoShareButtons
                lancamento={lancamento}
                fazendaNome={fazendaNome}
              />
              <Button variant="outline" className="flex-1 touch-target" onClick={() => setMode('edit')}>
                <Pencil className="h-4 w-4 mr-1" /> Editar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ===== EDIT MODE =====
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setMode('detail')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            Editar {tipoInfo.label}
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

          {/* 1. Preço base da arroba */}
          <div>
            <Label className="text-xs">Preço base da arroba (R$)</Label>
            <Input type="number" value={precoArroba} onChange={e => setPrecoArroba(e.target.value)} placeholder="0,00" className="h-9" />
          </div>

          {/* 2. Valor bruto calculado */}
          <div className="bg-muted/30 rounded-lg p-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor total bruto</span>
              <strong>R$ {fmt(calc.valorBruto)}</strong>
            </div>
          </div>

          {/* 3. Ajustes: Acréscimos e Deduções */}
          {isAbate ? (
            <>
              <h4 className="text-xs font-bold text-muted-foreground uppercase">Bônus / Acréscimos (R$)</h4>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Acréscimos (R$)</Label>
                <Input type="number" value={acrescimos} onChange={e => setAcrescimos(e.target.value)} placeholder="0" className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Deduções (R$)</Label>
                <Input type="number" value={deducoes} onChange={e => setDeducoes(e.target.value)} placeholder="0" className="h-9" />
              </div>
            </div>
          )}

          {/* 4. Valor líquido final */}
          <div className="bg-primary/10 rounded-lg p-3">
            <div className="flex justify-between text-base font-bold">
              <span>Valor líquido final</span>
              <span className="text-primary">R$ {fmt(calc.valorTotal)}</span>
            </div>
            {calc.liqArroba > 0 && (
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted-foreground">R$/líq @</span>
                <strong>R$ {fmt(calc.liqArroba)}</strong>
              </div>
            )}
          </div>

          {/* Override manual do valor total */}
          <div>
            <Label className="text-xs text-muted-foreground">Ou informe o valor total manualmente (R$)</Label>
            <Input type="number" value={calc.valorTotal > 0 ? String(calc.valorTotal) : ''} onChange={e => {
              const vt = parseFloat(e.target.value);
              if (!isNaN(vt) && calc.pesoTotalArrobas > 0) {
                const totalAcr = isAbate ? (num(bonusPrecoce) ?? 0) + (num(bonusQualidade) ?? 0) + (num(bonusListaTrace) ?? 0) : (num(acrescimos) ?? 0);
                const totalDes = isAbate ? (num(descontoQualidade) ?? 0) + (num(descontoFunrural) ?? 0) + (num(outrosDescontos) ?? 0) : (num(deducoes) ?? 0);
                const bruto = vt - totalAcr + totalDes;
                setPrecoArroba(String((bruto / calc.pesoTotalArrobas).toFixed(4)));
              }
            }} placeholder="Valor total líquido" className="h-9" />
          </div>
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
