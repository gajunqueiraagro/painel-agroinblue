import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { usePastos } from '@/hooks/usePastos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Save, Pencil } from 'lucide-react';
import { PastosTab } from '@/pages/PastosTab';
import {
  validarComposicaoAreaFazenda,
  validarAreaPastosPecuarios,
} from '@/lib/validacoes/areaFazenda';

type TabKey = 'dados' | 'area' | 'pastos' | 'roteiro';

interface CadastroRow {
  id?: string;
  municipio: string;
  estado: string;
  car: string;
  nirf: string;
  area_total_ha: string;
  area_pecuaria_ha: string;
  area_agricultura_ha: string;
  area_app_ha: string;
  area_reserva_ha: string;
  area_benfeitorias_ha: string;
  area_outras_ha: string;
}

const EMPTY: CadastroRow = {
  municipio: '', estado: '', car: '', nirf: '',
  area_total_ha: '', area_pecuaria_ha: '', area_agricultura_ha: '',
  area_app_ha: '', area_reserva_ha: '', area_benfeitorias_ha: '', area_outras_ha: '',
};

const n = (v: string) => (v.trim() === '' ? 0 : Number(v));

export function V2Fazendas() {
  const { fazendaAtual, isGlobal } = useFazenda();
  const { clienteAtual } = useCliente();
  const { pastos } = usePastos();

  const [activeTab, setActiveTab] = useState<TabKey>('area');
  const [data, setData] = useState<CadastroRow>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!fazendaAtual?.id) return;
    setLoading(true);
    const { data: row } = await supabase
      .from('fazenda_cadastros')
      .select('*')
      .eq('fazenda_id', fazendaAtual.id)
      .maybeSingle();
    if (row) {
      setData({
        id: row.id,
        municipio: (row as any).municipio ?? '',
        estado: (row as any).estado ?? '',
        car: (row as any).car ?? '',
        nirf: (row as any).nirf ?? '',
        area_total_ha: row.area_total_ha != null ? String(row.area_total_ha) : '',
        area_pecuaria_ha: (row as any).area_pecuaria_ha != null ? String((row as any).area_pecuaria_ha) : '',
        area_agricultura_ha: (row as any).area_agricultura_ha != null ? String((row as any).area_agricultura_ha) : '',
        area_app_ha: (row as any).area_app_ha != null ? String((row as any).area_app_ha) : '',
        area_reserva_ha: (row as any).area_reserva_ha != null ? String((row as any).area_reserva_ha) : '',
        area_benfeitorias_ha: (row as any).area_benfeitorias_ha != null ? String((row as any).area_benfeitorias_ha) : '',
        area_outras_ha: (row as any).area_outras_ha != null ? String((row as any).area_outras_ha) : '',
      });
    } else {
      setData(EMPTY);
      setEditing(true);
    }
    setLoading(false);
  }, [fazendaAtual?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async () => {
    if (!fazendaAtual?.id || !clienteAtual?.id) return;

    if (n(data.area_total_ha) > 0) {
      const composicao = validarComposicaoAreaFazenda({
        areaTotalHa: n(data.area_total_ha),
        areaPecuariaHa: n(data.area_pecuaria_ha),
        areaAgriculturaHa: n(data.area_agricultura_ha),
        areaAppHa: n(data.area_app_ha),
        areaReservaHa: n(data.area_reserva_ha),
        areaBenfeitoriasHa: n(data.area_benfeitorias_ha),
        areaOutrasHa: n(data.area_outras_ha),
      });
      if (!composicao.ok) {
        toast.error(
          `Soma dos blocos (${composicao.soma.toFixed(2)} ha) difere da área total (${n(data.area_total_ha).toFixed(2)} ha). Corrija antes de salvar.`,
        );
        return;
      }
    }

    setSaving(true);
    const payload = {
      fazenda_id: fazendaAtual.id,
      cliente_id: clienteAtual.id,
      municipio: data.municipio || null,
      estado: data.estado || null,
      car: data.car || null,
      nirf: data.nirf || null,
      area_total_ha: n(data.area_total_ha) || null,
      area_pecuaria_ha: n(data.area_pecuaria_ha) || null,
      area_agricultura_ha: n(data.area_agricultura_ha) || null,
      area_app_ha: n(data.area_app_ha) || null,
      area_reserva_ha: n(data.area_reserva_ha) || null,
      area_benfeitorias_ha: n(data.area_benfeitorias_ha) || null,
      area_outras_ha: n(data.area_outras_ha) || null,
    };
    let error;
    if (data.id) {
      ({ error } = await supabase
        .from('fazenda_cadastros')
        .update(payload as any)
        .eq('id', data.id));
    } else {
      const res = await supabase
        .from('fazenda_cadastros')
        .insert(payload as any)
        .select()
        .single();
      error = res.error;
      if (res.data) setData(prev => ({ ...prev, id: (res.data as any).id }));
    }
    if (error) { toast.error('Erro ao salvar: ' + error.message); }
    else { toast.success('Área salva com sucesso!'); setEditing(false); }
    setSaving(false);
  };

  if (!fazendaAtual || isGlobal) {
    return (
      <div className="px-4 py-6">
        <p className="text-sm text-muted-foreground">Selecione uma fazenda para editar o cadastro.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="px-4 py-6 text-xs text-muted-foreground">Carregando...</div>;
  }

  const composicaoVal = validarComposicaoAreaFazenda({
    areaTotalHa: n(data.area_total_ha),
    areaPecuariaHa: n(data.area_pecuaria_ha),
    areaAgriculturaHa: n(data.area_agricultura_ha),
    areaAppHa: n(data.area_app_ha),
    areaReservaHa: n(data.area_reserva_ha),
    areaBenfeitoriasHa: n(data.area_benfeitorias_ha),
    areaOutrasHa: n(data.area_outras_ha),
  });
  const pastosVal = validarAreaPastosPecuarios(
    pastos.map(p => ({
      areaHa: Number((p as any).area || 0),
      tipoUso: (p as any).tipo_uso,
      situacao: (p as any).situacao,
      ativo: p.ativo,
    })),
    n(data.area_pecuaria_ha),
  );
  const hasAreaTotal = n(data.area_total_ha) > 0;

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'dados', label: 'Dados' },
    { key: 'area', label: 'Área' },
    { key: 'pastos', label: 'Pastos' },
    { key: 'roteiro', label: 'Roteiro' },
  ];

  const areaField = (label: string, key: keyof CadastroRow) => (
    <div className="space-y-0.5">
      <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </Label>
      {editing ? (
        <Input
          type="number"
          step="0.01"
          value={data[key]}
          onChange={e => setData(prev => ({ ...prev, [key]: e.target.value }))}
          className="h-7 text-xs"
          placeholder="0.00"
        />
      ) : (
        <p className="text-xs font-medium px-2 py-1 rounded bg-muted/50 min-h-[28px]">
          {data[key]
            ? `${Number(data[key]).toFixed(2)} ha`
            : <span className="text-muted-foreground italic">—</span>}
        </p>
      )}
    </div>
  );

  const textField = (label: string, key: keyof CadastroRow) => (
    <div className="space-y-0.5">
      <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </Label>
      {editing ? (
        <Input
          value={data[key]}
          onChange={e => setData(prev => ({ ...prev, [key]: e.target.value }))}
          className="h-7 text-xs"
        />
      ) : (
        <p className="text-xs font-medium px-2 py-1 rounded bg-muted/50 min-h-[28px]">
          {data[key] || <span className="text-muted-foreground italic">—</span>}
        </p>
      )}
    </div>
  );

  return (
    <div className="px-4 py-4 max-w-2xl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-bold text-foreground">{fazendaAtual.nome}</h2>
          <p className="text-[10px] text-muted-foreground">Cadastro da fazenda</p>
        </div>
        <div className="flex gap-1.5">
          {!editing && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditing(true)}>
              <Pencil className="h-3 w-3 mr-1" /> Editar
            </Button>
          )}
          {editing && (
            <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>
              <Save className="h-3 w-3 mr-1" /> {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-0.5 mb-4 border-b border-border">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
              activeTab === t.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'dados' && (
        <div className="grid grid-cols-2 gap-2">
          {textField('Município', 'municipio')}
          {textField('Estado', 'estado')}
          {textField('CAR', 'car')}
          {textField('NIRF', 'nirf')}
        </div>
      )}

      {activeTab === 'area' && (
        <div className="space-y-4">
          <div>{areaField('Área Total (ha)', 'area_total_ha')}</div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Composição da Área
            </p>
            <div className="grid grid-cols-2 gap-2">
              {areaField('Área Pecuária', 'area_pecuaria_ha')}
              {areaField('Área Agricultura', 'area_agricultura_ha')}
              {areaField('APP', 'area_app_ha')}
              {areaField('Reserva Legal', 'area_reserva_ha')}
              {areaField('Benfeitorias', 'area_benfeitorias_ha')}
              {areaField('Outras', 'area_outras_ha')}
            </div>
          </div>
          {hasAreaTotal && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className={`rounded-lg border p-3 ${composicaoVal.ok ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Blocos vs Total</p>
                <p className="text-xs font-medium">Soma: {composicaoVal.soma.toFixed(2)} ha</p>
                <p className={`text-xs mt-0.5 ${composicaoVal.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                  {composicaoVal.ok ? '✅ Conciliado' : `❌ Diferença: ${composicaoVal.diferenca > 0 ? '+' : ''}${composicaoVal.diferenca.toFixed(2)} ha`}
                </p>
              </div>
              <div className={`rounded-lg border p-3 ${pastosVal.ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Pastos vs Pecuária</p>
                <p className="text-xs font-medium">Soma: {pastosVal.somaPastos.toFixed(2)} ha ({pastosVal.quantidadePastos} pastos)</p>
                <p className={`text-xs mt-0.5 ${pastosVal.ok ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {pastosVal.ok ? '✅ Conciliado' : `⚠️ Diferença: ${pastosVal.diferenca > 0 ? '+' : ''}${pastosVal.diferenca.toFixed(2)} ha`}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'pastos' && <PastosTab />}

      {activeTab === 'roteiro' && (
        <div className="py-4">
          <p className="text-xs text-muted-foreground">Roteiro de acesso será implementado em fase futura.</p>
        </div>
      )}
    </div>
  );
}
