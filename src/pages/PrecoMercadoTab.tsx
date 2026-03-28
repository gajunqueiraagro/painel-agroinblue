/**
 * Preço de Mercado — define preços base mensais para cálculo do valor do rebanho.
 */
import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { MESES_NOMES } from '@/lib/calculos/labels';
import { usePrecoMercado, BLOCOS_PRECO, type PrecoMercadoItem } from '@/hooks/usePrecoMercado';
import { usePermissions } from '@/hooks/usePermissions';
import { Lock, Unlock, Save, CheckCircle, AlertTriangle } from 'lucide-react';

interface Props {
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
  onBack?: () => void;
}

const STATUS_CONFIG = {
  rascunho: { label: 'Rascunho', color: 'bg-amber-500/20 text-amber-700 border-amber-300', icon: AlertTriangle },
  parcial: { label: 'Parcial', color: 'bg-blue-500/20 text-blue-700 border-blue-300', icon: AlertTriangle },
  validado: { label: 'Validado', color: 'bg-emerald-500/20 text-emerald-700 border-emerald-300', icon: CheckCircle },
};

/** Extrai o peso médio (kg) a partir do nome da categoria */
const getPesoMedio = (categoria: string): number => {
  const match = categoria.match(/(\d+)\s*kg/);
  return match ? parseInt(match[1]) : 0;
};

export function PrecoMercadoTab({ filtroAnoInicial, filtroMesInicial, onBack }: Props) {
  const now = new Date();
  const [ano, setAno] = useState(filtroAnoInicial || String(now.getFullYear()));
  const [mes, setMes] = useState(String(filtroMesInicial || now.getMonth() + 1).padStart(2, '0'));
  const anoMes = `${ano}-${mes}`;

  const { itens, setItens, statusMes, loading, saving, isValidado, salvar, reabrir } = usePrecoMercado(anoMes);
  const { perfil } = usePermissions();
  const isAdmin = perfil === 'admin_agroinblue';

  const anos = useMemo(() => {
    const a: string[] = [];
    for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 3; y--) a.push(String(y));
    return a;
  }, []);

  const updateItem = (bloco: string, categoria: string, field: 'valor' | 'agio_perc', val: string) => {
    if (isValidado) return;
    setItens(prev => prev.map(i =>
      i.bloco === bloco && i.categoria === categoria
        ? { ...i, [field]: parseFloat(val) || 0 }
        : i
    ));
  };

  const frigorifico = itens.filter(i => i.bloco === 'frigorifico');
  const magroMacho = itens.filter(i => i.bloco === 'magro_macho');
  const magroFemea = itens.filter(i => i.bloco === 'magro_femea');

  // Preço boi gordo em R$/kg vivo (para cálculo de ágio automático do magro)
  const boiGordoArroba = frigorifico.find(i => i.categoria === 'Boi Gordo')?.valor || 0;
  const boiGordoKg = boiGordoArroba > 0 ? boiGordoArroba / 30 : 0;

  const stCfg = STATUS_CONFIG[statusMes.status];
  const StIcon = stCfg.icon;

  const temPreenchimento = itens.some(i => i.valor > 0);
  const todosPreenchidos = itens.every(i => i.valor > 0);

  const handleSalvar = (status: 'rascunho' | 'parcial' | 'validado') => {
    salvar(itens, status);
  };

  const calcAgioAuto = (precoKg: number): number => {
    if (boiGordoKg <= 0 || precoKg <= 0) return 0;
    return ((precoKg / boiGordoKg) - 1) * 100;
  };

  const renderFrigorifico = () => (
    <Card>
      <CardContent className="p-3 space-y-2">
        <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">🥩 Preço Base (Frigorífico no MS)</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-1 px-1 font-medium">Categoria</th>
              <th className="text-right py-1 px-1 font-medium w-24">Valor</th>
              <th className="text-right py-1 px-1 font-medium w-20">Ágio %</th>
              <th className="text-right py-1 px-1 font-medium w-24">R$/@</th>
            </tr>
          </thead>
          <tbody>
            {frigorifico.map((item, idx) => {
              const isBoi = item.categoria === 'Boi Gordo';
              const final_ = isBoi ? item.valor : item.valor * (1 + item.agio_perc / 100);
              return (
                <tr key={item.categoria} className={idx % 2 ? 'bg-muted/20' : ''}>
                  <td className="py-1 px-1 font-medium text-foreground whitespace-nowrap">{item.categoria}</td>
                  <td className="py-1 px-1">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.valor || ''}
                      onChange={e => updateItem(item.bloco, item.categoria, 'valor', e.target.value)}
                      disabled={isValidado}
                      className="h-7 text-xs text-right w-full"
                    />
                  </td>
                  <td className="py-1 px-1">
                    {isBoi ? (
                      <span className="block text-right text-muted-foreground">—</span>
                    ) : (
                      <Input
                        type="number"
                        step="0.1"
                        value={item.agio_perc || ''}
                        onChange={e => updateItem(item.bloco, item.categoria, 'agio_perc', e.target.value)}
                        disabled={isValidado}
                        className="h-7 text-xs text-right w-full"
                      />
                    )}
                  </td>
                  <td className="py-1 px-1 text-right font-semibold text-foreground">
                    {final_ > 0 ? final_.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );

  const renderMagro = (title: string, items: PrecoMercadoItem[]) => (
    <Card key={title}>
      <CardContent className="p-3 space-y-2">
        <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">{title}</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-1 px-1 font-medium">Categoria</th>
              <th className="text-right py-1 px-1 font-medium w-20">R$/kg</th>
              <th className="text-right py-1 px-1 font-medium w-24">R$/cab</th>
              <th className="text-right py-1 px-1 font-medium w-20">Ágio %</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const pesoMedio = getPesoMedio(item.categoria);
              const precoCab = item.valor > 0 && pesoMedio > 0 ? item.valor * pesoMedio : 0;
              const agioAuto = calcAgioAuto(item.valor);
              return (
                <tr key={`${item.bloco}-${item.categoria}`} className={idx % 2 ? 'bg-muted/20' : ''}>
                  <td className="py-1 px-1 font-medium text-foreground whitespace-nowrap text-[11px]">{item.categoria}</td>
                  <td className="py-1 px-1">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.valor || ''}
                      onChange={e => updateItem(item.bloco, item.categoria, 'valor', e.target.value)}
                      disabled={isValidado}
                      className="h-7 text-xs text-right w-full"
                    />
                  </td>
                  <td className="py-1 px-1 text-right text-foreground">
                    {precoCab > 0 ? precoCab.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '-'}
                  </td>
                  <td className="py-1 px-1 text-right text-muted-foreground">
                    {item.valor > 0 && boiGordoKg > 0
                      ? `${agioAuto >= 0 ? '+' : ''}${agioAuto.toFixed(1)}%`
                      : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );

  return (
    <div className="max-w-lg mx-auto animate-fade-in pb-24">
      <div className="p-4 space-y-3">
        {/* Filtro mês/ano + status */}
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={mes} onValueChange={setMes}>
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESES_NOMES.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1).padStart(2, '0')}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={ano} onValueChange={setAno}>
                <SelectTrigger className="w-20 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {anos.map(a => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="outline" className={`ml-auto text-[10px] px-2 py-0.5 ${stCfg.color}`}>
                <StIcon className="h-3 w-3 mr-1" />
                {stCfg.label}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
        ) : (
          <>
            {renderFrigorifico()}
            {renderMagro('🐂 Gado Magro — Machos', magroMacho)}
            {renderMagro('🐄 Gado Magro — Fêmeas', magroFemea)}

            {/* Actions */}
            {isAdmin && (
              <div className="flex flex-col gap-2 pt-2">
                {!isValidado && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => handleSalvar(temPreenchimento && !todosPreenchidos ? 'parcial' : 'rascunho')}
                      disabled={saving}
                    >
                      <Save className="h-3.5 w-3.5 mr-1" />
                      Salvar Rascunho
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" className="flex-1 text-xs" disabled={saving || !todosPreenchidos}>
                          <CheckCircle className="h-3.5 w-3.5 mr-1" />
                          Validar Mês
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Validar preços de {MESES_NOMES[Number(mes) - 1]}/{ano}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Ao validar, os preços serão travados e utilizados como base para o cálculo do valor do rebanho de todos os clientes neste mês.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleSalvar('validado')}>Validar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}

                {isValidado && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-xs">
                        <Unlock className="h-3.5 w-3.5 mr-1" />
                        Reabrir para Edição
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reabrir mês?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Os preços voltarão ao status rascunho e poderão ser editados novamente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={reabrir}>Reabrir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            )}

            {!isAdmin && (
              <div className="text-center py-4 text-muted-foreground text-xs flex items-center justify-center gap-1">
                <Lock className="h-3.5 w-3.5" />
                Apenas administradores podem editar preços de mercado
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
