/**
 * Preços Previstos — mesma estrutura do Preço de Mercado, para cenário meta.
 */
import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { MESES_NOMES } from '@/lib/calculos/labels';
import { BLOCOS_PRECO, type PrecoMercadoItem } from '@/hooks/usePrecoMercado';
import { useMetaPrecoMercado } from '@/hooks/useMetaPrecoMercado';
import { usePermissions } from '@/hooks/usePermissions';
import { Lock, Unlock, Save, CheckCircle, AlertTriangle, Copy } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  onBack?: () => void;
}

const STATUS_CONFIG = {
  rascunho: { label: 'Rascunho', color: 'bg-amber-500/20 text-amber-700 border-amber-300', icon: AlertTriangle },
  parcial: { label: 'Parcial', color: 'bg-blue-500/20 text-blue-700 border-blue-300', icon: AlertTriangle },
  validado: { label: 'Validado', color: 'bg-emerald-500/20 text-emerald-700 border-emerald-300', icon: CheckCircle },
};

const getPesoMedio = (categoria: string): number => {
  const match = categoria.match(/(\d+)\s*kg/);
  return match ? parseInt(match[1]) : 0;
};

export function MetaPrecoTab({ onBack }: Props) {
  const now = new Date();
  const [ano, setAno] = useState(String(now.getFullYear()));
  const [mes, setMes] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const anoMes = `${ano}-${mes}`;

  const { itens, setItens, statusMes, loading, saving, isValidado, salvar, reabrir, copiarMesAnterior } = useMetaPrecoMercado(anoMes);
  const { perfil } = usePermissions();
  const isAdmin = perfil === 'admin_agroinblue';
  const [showCopiarDialog, setShowCopiarDialog] = useState(false);
  const [copiando, setCopiando] = useState(false);

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

  const agioColor = (val: number) =>
    val > 0 ? 'text-emerald-600' : val < 0 ? 'text-red-600' : 'text-muted-foreground';

  const renderFrigorifico = () => (
    <Card>
      <CardContent className="p-3 space-y-2">
        <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">🥩 Preço Base Previsto (Frigorífico)</h3>
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
              const agioAuto = !isBoi && boiGordoArroba > 0 && item.valor > 0
                ? ((item.valor / boiGordoArroba) - 1) * 100
                : 0;
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
                  <td className="py-1 px-1 text-right">
                    {isBoi ? (
                      <span className="text-muted-foreground">—</span>
                    ) : item.valor > 0 && boiGordoArroba > 0 ? (
                      <span className={agioColor(agioAuto)}>
                        {agioAuto >= 0 ? '+' : ''}{agioAuto.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="py-1 px-1 text-right font-semibold text-foreground">
                    {item.valor > 0 ? item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
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
              <th className="text-right py-1 px-1 font-medium w-20">Ágio %</th>
              <th className="text-right py-1 px-1 font-medium w-24">R$/cab</th>
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
                  <td className="py-1 px-1 text-right">
                    {item.valor > 0 && boiGordoKg > 0 ? (
                      <span className={agioColor(agioAuto)}>
                        {agioAuto >= 0 ? '+' : ''}{agioAuto.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="py-1 px-1 text-right font-semibold text-foreground">
                    {precoCab > 0 ? precoCab.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '-'}
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
    <div className="w-full px-4 animate-fade-in pb-24">
      <div className="p-4 space-y-3">
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
              {!isValidado && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-8"
                  onClick={() => setShowCopiarDialog(true)}
                  disabled={copiando || loading}
                >
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  Mês Anterior
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <AlertDialog open={showCopiarDialog} onOpenChange={setShowCopiarDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Replicar valores do mês anterior?</AlertDialogTitle>
              <AlertDialogDescription>
                {temPreenchimento
                  ? 'Já existem valores preenchidos. Deseja sobrescrever?'
                  : 'Replicar valores previstos do mês anterior?'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={async () => {
                setCopiando(true);
                setShowCopiarDialog(false);
                const dados = await copiarMesAnterior(anoMes);
                if (dados) {
                  setItens(dados);
                  toast.success('Valores carregados. Salve para confirmar.');
                }
                setCopiando(false);
              }}>
                {temPreenchimento ? 'Sobrescrever' : 'Replicar'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
        ) : (
          <>
            {renderFrigorifico()}
            {renderMagro('🐂 Gado Magro — Machos (Previsto)', magroMacho)}
            {renderMagro('🐄 Gado Magro — Fêmeas (Previsto)', magroFemea)}

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
                        <AlertDialogTitle>Validar preços previstos de {MESES_NOMES[Number(mes) - 1]}/{ano}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Os preços previstos serão travados para este mês.
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
                        Os preços voltarão ao status rascunho e poderão ser editados.
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
          </>
        )}
      </div>
    </div>
  );
}
