import { useState, useEffect, useCallback } from 'react';
import { useAnaliseConsultor, type AnaliseConsultor } from '@/hooks/useAnaliseConsultor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ClipboardList, Plus, Lock, Unlock, ChevronLeft, Edit3, Save } from 'lucide-react';
import { toast } from 'sonner';

const MESES_OPTIONS = [
  { value: '1', label: 'Janeiro' }, { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Março' }, { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' }, { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' }, { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' }, { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  rascunho: { label: 'Rascunho', color: 'bg-amber-100 text-amber-800' },
  revisado: { label: 'Revisado', color: 'bg-blue-100 text-blue-800' },
  fechado: { label: 'Finalizado', color: 'bg-green-100 text-green-800' },
};

const BLOCOS = Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(3, '0'));

export function AnaliseConsultorTab() {
  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [editingBloco, setEditingBloco] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const {
    analises, analiseAtual, loading, saving,
    loadAnalises, criarAnalise, salvarBlocos,
    alterarStatus, setAnaliseAtual,
  } = useAnaliseConsultor();

  useEffect(() => {
    loadAnalises(ano);
  }, [ano, loadAnalises]);

  const blocos = analiseAtual?.json_blocos || {};
  const isFechado = analiseAtual?.status_fechamento === 'fechado';

  const handleGerar = useCallback(async () => {
    await criarAnalise(ano, mes);
    loadAnalises(ano);
    setView('detail');
  }, [criarAnalise, ano, mes, loadAnalises]);

  const startEdit = (key: string) => {
    setEditingBloco(key);
    setEditValue(blocos[key] || '');
  };

  const handleSave = useCallback(async () => {
    if (!analiseAtual || !editingBloco) return;
    const novosBlocos = { ...blocos, [editingBloco]: editValue };
    await salvarBlocos(analiseAtual.id, novosBlocos);
    setEditingBloco(null);
  }, [analiseAtual, editingBloco, editValue, blocos, salvarBlocos]);

  // ── LIST VIEW ──
  if (view === 'list') {
    return (
      <div className="p-4 pb-24 space-y-4 max-w-lg mx-auto animate-fade-in">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Análise do Consultor
          </h2>
        </div>

        <div className="flex gap-2">
          <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026, 2027].map(a => (
                <SelectItem key={a} value={String(a)}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(mes)} onValueChange={v => setMes(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MESES_OPTIONS.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleGerar} disabled={saving} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          {saving ? 'Gerando...' : 'Gerar Análise do Consultor'}
        </Button>

        {loading ? (
          <p className="text-center text-muted-foreground py-8">Carregando...</p>
        ) : analises.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <ClipboardList className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>Nenhuma análise encontrada para {ano}</p>
              <p className="text-sm">Selecione o mês e clique em "Gerar Análise"</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {analises.map(a => {
              const st = STATUS_LABELS[a.status_fechamento] || STATUS_LABELS.rascunho;
              return (
                <Card
                  key={a.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => { setAnaliseAtual(a); setView('detail'); }}
                >
                  <CardContent className="py-3 flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{a.periodo_texto}</p>
                      <p className="text-xs text-muted-foreground">v{a.versao} • {new Date(a.data_geracao).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <Badge className={st.color}>{st.label}</Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── DETAIL VIEW ──
  if (!analiseAtual) return null;

  const st = STATUS_LABELS[analiseAtual.status_fechamento] || STATUS_LABELS.rascunho;

  return (
    <div className="p-4 pb-24 space-y-4 max-w-lg mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => { setView('list'); setAnaliseAtual(null); }}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold">{analiseAtual.periodo_texto}</h2>
          <p className="text-xs text-muted-foreground">v{analiseAtual.versao} • Análise do Consultor</p>
        </div>
        <Badge className={st.color}>{st.label}</Badge>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {!isFechado && (
          <>
            {analiseAtual.status_fechamento === 'rascunho' && (
              <Button size="sm" variant="outline" onClick={() => alterarStatus(analiseAtual.id, 'revisado')}>
                Marcar Revisado
              </Button>
            )}
            <Button size="sm" variant="default" onClick={() => alterarStatus(analiseAtual.id, 'fechado')}>
              <Lock className="h-3 w-3 mr-1" />Finalizar
            </Button>
          </>
        )}
        {isFechado && (
          <Button size="sm" variant="outline" onClick={() => alterarStatus(analiseAtual.id, 'rascunho')}>
            <Unlock className="h-3 w-3 mr-1" />Reabrir
          </Button>
        )}
      </div>

      {/* Blocos numerados */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Blocos de Análise
          </CardTitle>
          <p className="text-[10px] text-muted-foreground">
            Área técnica para observações, conciliação e interpretação de dados.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {BLOCOS.map(num => {
            const text = blocos[num] || '';
            const isEditing = editingBloco === num;

            if (isEditing) {
              return (
                <div key={num} className="space-y-2 rounded-lg border border-primary/40 bg-muted/20 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-primary tabular-nums">{num}</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => setEditingBloco(null)}>Cancelar</Button>
                      <Button size="sm" onClick={handleSave} disabled={saving}>
                        <Save className="h-3 w-3 mr-1" />Salvar
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    rows={4}
                    className="text-sm"
                    placeholder="Digite a análise para este bloco..."
                  />
                </div>
              );
            }

            return (
              <div
                key={num}
                className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3"
              >
                <span className="text-xs font-bold text-primary tabular-nums mt-0.5">{num}</span>
                <div className="flex-1 min-w-0">
                  {text ? (
                    <p className="text-sm text-foreground whitespace-pre-wrap">{text}</p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground italic">Bloco vazio — clique para editar</p>
                  )}
                </div>
                {!isFechado && (
                  <Button size="sm" variant="ghost" className="shrink-0" onClick={() => startEdit(num)}>
                    <Edit3 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
