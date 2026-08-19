import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { agruparPastosPorFamilia } from '@/lib/pastos/agruparPorFamilia';
import { FazendasList } from '@/components/FazendasList';

// 'area' virou a aba "Cadastro" (Dados + Área fundidos). A CHAVE continua 'area'
// para não mexer no default de activeTab nem nos blocos condicionais.
type TabKey = 'area' | 'pastos' | 'roteiro';

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
  ie: string;
  status_operacional: string;
}

const EMPTY: CadastroRow = {
  municipio: '', estado: '', car: '', nirf: '',
  area_total_ha: '', area_pecuaria_ha: '', area_agricultura_ha: '',
  area_app_ha: '', area_reserva_ha: '', area_benfeitorias_ha: '', area_outras_ha: '',
  ie: '',
  status_operacional: 'ativa',
};

const n = (v: string) => (v.trim() === '' ? 0 : Number(v));

export function V2Fazendas() {
  const { fazendaAtual, isGlobal } = useFazenda();
  const { clienteAtual } = useCliente();
  const { pastos } = usePastos();

  // PR-AREA-DERIVADA-01 — repartição derivada do cadastro de PASTOS, para o operador
  // comparar lado a lado com o que está digitado e achar a divergência. Sem query
  // nova: usePastos já está carregado acima.
  //
  // Só ATIVOS: agruparPastosPorFamilia não filtra por decisão declarada no módulo —
  // quem chama decide. Esta é tela de cadastro e quer o conjunto vigente.
  //
  // SEM mês: esta tela não tem seletor de mês nem de ano, e a vigência NÃO é
  // aplicada aqui — pasto encerrado por data_fim ainda entra na soma. Limitação
  // conhecida; não inventar um mês para dar à conferência uma precisão que ela não tem.
  const agrupado = useMemo(
    () => agruparPastosPorFamilia(pastos.filter(p => p.ativo !== false)),
    [pastos],
  );

  // Callback ref, NÃO useRef: useRef não dispara re-render quando o nó monta, e o
  // portal do PastosTab renderizaria contra null na primeira passada.
  const [hostBarra, setHostBarra] = useState<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('area');
  const [data, setData] = useState<CadastroRow>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [codigoFazenda, setCodigoFazenda] = useState('');

  const loadData = useCallback(async () => {
    if (isGlobal || !fazendaAtual?.id || fazendaAtual.id === '__global__' || !clienteAtual?.id) {
      setData(EMPTY);
      setCodigoFazenda('');
      return;
    }
    setLoading(true);
    const { data: row, error } = await supabase
      .from('fazenda_cadastros')
      .select('*')
      .eq('fazenda_id', fazendaAtual.id)
      .eq('cliente_id', clienteAtual.id)
      .maybeSingle();
    if (error) {
      toast.error('Erro ao carregar cadastro da fazenda: ' + error.message);
      setLoading(false);
      return;
    }
    if (row) {
      setData({
        id: row.id,
        municipio: (row as any).municipio ?? '',
        estado: (row as any).estado ?? '',
        car: (row as any).car ?? '',
        nirf: (row as any).nirf ?? '',
        ie: (row as any).ie ?? '',
        area_total_ha: row.area_total_ha != null ? String(row.area_total_ha) : '',
        area_pecuaria_ha: (row as any).area_pecuaria_ha != null ? String((row as any).area_pecuaria_ha) : '',
        area_agricultura_ha: (row as any).area_agricultura_ha != null ? String((row as any).area_agricultura_ha) : '',
        area_app_ha: (row as any).area_app_ha != null ? String((row as any).area_app_ha) : '',
        area_reserva_ha: (row as any).area_reserva_ha != null ? String((row as any).area_reserva_ha) : '',
        area_benfeitorias_ha: (row as any).area_benfeitorias_ha != null ? String((row as any).area_benfeitorias_ha) : '',
        area_outras_ha: (row as any).area_outras_ha != null ? String((row as any).area_outras_ha) : '',
        status_operacional: (fazendaAtual as any).status_operacional ?? 'ativa',
      });
      setEditing(false);
    } else {
      setData({ ...EMPTY, status_operacional: (fazendaAtual as any).status_operacional ?? 'ativa' });
      setEditing(true);
    }
    setCodigoFazenda((fazendaAtual as any).codigo_importacao ?? (fazendaAtual as any).codigo ?? '');
    setLoading(false);
  }, [fazendaAtual, clienteAtual?.id, isGlobal]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async () => {
    if (!fazendaAtual?.id || !clienteAtual?.id) {
      toast.error('Cliente ou fazenda não selecionado.');
      return;
    }

    const areaTotalCalculada =
      n(data.area_pecuaria_ha) +
      n(data.area_agricultura_ha) +
      n(data.area_app_ha) +
      n(data.area_reserva_ha) +
      n(data.area_benfeitorias_ha) +
      n(data.area_outras_ha);

    // area_produtiva_ha alimenta fn_gerar_area_de_snapshot, que lança
    // 'fazenda_cadastros_sem_area' quando o valor é NULL — sem ele a fazenda não
    // fecha P1. Até aqui a coluna só era escrita pela CadastrosTab legada, então
    // fazenda cadastrada por esta tela nascia travada. Produtiva = pecuária +
    // agricultura; APP, reserva, benfeitorias e outras entram só no total.
    const areaProdutivaCalculada =
      n(data.area_pecuaria_ha) + n(data.area_agricultura_ha);

    setSaving(true);
    const payload = {
      fazenda_id: fazendaAtual.id,
      cliente_id: clienteAtual.id,
      municipio: data.municipio || null,
      estado: data.estado || null,
      car: data.car || null,
      nirf: data.nirf || null,
      area_total_ha: areaTotalCalculada || null,
      ie: data.ie || null,
      area_pecuaria_ha: n(data.area_pecuaria_ha) || null,
      area_agricultura_ha: n(data.area_agricultura_ha) || null,
      area_produtiva_ha: areaProdutivaCalculada || null,
      area_app_ha: n(data.area_app_ha) || null,
      area_reserva_ha: n(data.area_reserva_ha) || null,
      area_benfeitorias_ha: n(data.area_benfeitorias_ha) || null,
      area_outras_ha: n(data.area_outras_ha) || null,
    };
    const { data: saved, error } = await supabase
      .from('fazenda_cadastros')
      .upsert(payload as any, { onConflict: 'cliente_id,fazenda_id' })
      .select()
      .single();
    if (saved) {
      setData(prev => ({ ...prev, id: (saved as any).id }));
    }
    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
      setSaving(false);
      return;
    }

    const { error: fazendaError } = await supabase
      .from('fazendas')
      .update({ codigo_importacao: codigoFazenda || null, status_operacional: data.status_operacional } as any)
      .eq('id', fazendaAtual.id);
    if (fazendaError) {
      toast.error('Erro ao salvar código da fazenda: ' + fazendaError.message);
      setSaving(false);
      return;
    }

    toast.success('Área salva com sucesso!');
    setEditing(false);
    await loadData();
    setSaving(false);
  };

  if (!fazendaAtual || isGlobal || fazendaAtual.id === '__global__') {
    return (
      <div className="px-4 py-4">
        <FazendasList />
      </div>
    );
  }

  if (loading) {
    return <div className="px-4 py-6 text-xs text-muted-foreground">Carregando...</div>;
  }

  const areaTotalCalculada =
    n(data.area_pecuaria_ha) +
    n(data.area_agricultura_ha) +
    n(data.area_app_ha) +
    n(data.area_reserva_ha) +
    n(data.area_benfeitorias_ha) +
    n(data.area_outras_ha);

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'area', label: 'Cadastro' },
    { key: 'pastos', label: 'Pastos' },
    { key: 'roteiro', label: 'Roteiro' },
  ];

  // PR-AREA-DERIVADA-01 — o rótulo saiu: agora ele é a primeira coluna da tabela de
  // comparação, e este helper renderiza só a célula CADASTRO. Segue EDITÁVEL: é com
  // ele que o operador corrige a divergência que a coluna PASTOS revela.
  const areaField = (key: keyof CadastroRow) => (
    editing ? (
      <Input
        type="number"
        step="0.01"
        value={data[key] as string}
        onChange={e => setData(prev => ({ ...prev, [key]: e.target.value }))}
        className="h-6 text-xs text-right tabular-nums px-1"
        placeholder="0.00"
      />
    ) : (
      <p className="text-xs font-medium px-2 py-1 rounded bg-muted/50 text-right tabular-nums">
        {data[key]
          ? Number(data[key]).toFixed(2)
          : <span className="text-muted-foreground italic">—</span>}
      </p>
    )
  );

  // ── Derivação por família/destino, para a tabela de comparação ──────────────
  // familias[].tipos[] traz `.pastos`, não `.somaHa` — o módulo devolve a forma
  // canônica e a tela soma do lado dela, como o próprio comentário dele autoriza.
  const somaFamilia = (grupo: string) =>
    agrupado.familias.find(f => f.grupo === grupo)?.somaHa ?? 0;
  const somaDestino = (tipo: string) => {
    for (const f of agrupado.familias) {
      const t = f.tipos.find(x => x.tipo === tipo);
      if (t) return t.pastos.reduce((acc, p) => acc + (p.area_produtiva_ha ?? 0), 0);
    }
    return 0;
  };
  const somaPastosTotal = agrupado.familias.reduce((acc, f) => acc + f.somaHa, 0);

  /**
   * Uma linha da tabela CADASTRO × PASTOS × Δ.
   *
   * `col` ausente = família SEM coluna no banco (Silvicultura). `derivado` null =
   * coluna SEM família correspondente (Outras). Os dois casos são divergência REAL
   * e aparecem como tal — não escondê-los.
   */
  const linhaArea = (
    rotulo: string,
    col: keyof CadastroRow | null,
    derivado: number | null,
    opts?: { destino?: boolean },
  ) => {
    const cadastro = col ? n(data[col] as string) : null;
    const delta = cadastro !== null && derivado !== null ? derivado - cadastro : null;
    return (
      <div key={rotulo} className="grid grid-cols-[1fr_110px_90px_90px] gap-2 items-center py-0.5 border-b border-border/30 last:border-b-0">
        <span className={opts?.destino
          ? 'text-[10px] text-muted-foreground pl-3'
          : 'text-[11px] font-semibold'}>
          {rotulo}
        </span>
        <div>
          {col ? areaField(col) : (
            <p className="text-xs px-2 py-1 text-right text-muted-foreground italic">sem coluna</p>
          )}
        </div>
        <span className="text-xs tabular-nums text-right px-2">
          {derivado !== null
            ? derivado.toFixed(2)
            : <span className="text-muted-foreground italic">—</span>}
        </span>
        <span className={`text-xs tabular-nums text-right px-2 ${
          delta === null ? '' : Math.abs(delta) < 0.01 ? 'text-emerald-700' : 'text-amber-700 font-semibold'
        }`}>
          {delta === null
            ? <span className="text-muted-foreground italic">—</span>
            : Math.abs(delta) < 0.01 ? '✓' : `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`}
        </span>
      </div>
    );
  };

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
    // PR-PASTOS-LISTA-01 — largura alinhada ao padrao do V2ImportLancamentosExcel:
    // max-w em PIXEL (nao %) e sem mx-auto. O max-w-2xl anterior (672px) vinha de uma
    // versao anterior e sufocava a aba Pastos, que lista dezenas de linhas.
    <div className="px-4 py-4 w-full max-w-[1100px]">
      {/* PR-UI-PADROES-01 / A3 — cabeçalho FIXO: título, subtítulo, ações e abas
          permanecem visíveis ao rolar. A aba Pastos lista dezenas de linhas; sem isso
          o operador perde de vista em que fazenda está. Um bloco só (título + abas)
          para que nada deslize por baixo do outro. */}
      <div className="sticky top-0 z-30 bg-background pt-1 -mx-4 px-4">
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

      <div className="flex items-end justify-between gap-4 mb-4 border-b border-border">
        <div className="flex gap-0.5">
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
        {/* Slot da barra da aba ativa. Vazio nas demais abas — não ocupa espaço. */}
        <div ref={setHostBarra} className="pb-1" />
      </div>
      </div>

      {activeTab === 'area' && (
        <div className="space-y-4">
          {/* PR-AREA-DERIVADA-01 — os campos vinham da aba 'Dados', removida. Dados e
              Área compartilhavam state, handleSave e botão Editar: a separação obrigava
              o operador a alternar entre duas abas do mesmo formulário. Movidos VERBATIM. */}
          <div className="grid grid-cols-2 gap-2">
          <div className="space-y-0.5">
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Código da Fazenda
            </Label>
            {editing ? (
              <Input
                value={codigoFazenda}
                onChange={e => setCodigoFazenda(e.target.value)}
                className="h-7 text-xs"
                placeholder="Ex: BG, 3M"
              />
            ) : (
              <p className="text-xs font-medium px-2 py-1 rounded bg-muted/50 min-h-[28px]">
                {codigoFazenda || <span className="text-muted-foreground italic">—</span>}
              </p>
            )}
          </div>
          {textField('Município', 'municipio')}
          {textField('Estado', 'estado')}
          {textField('CAR', 'car')}
          {textField('NIRF', 'nirf')}
          {textField('IE / Inscrição Estadual', 'ie')}
          {/* Status Operacional — fonte: tabela fazendas */}
          <div className="space-y-0.5 col-span-2">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Status Operacional
            </label>
            {editing ? (
              <select
                value={data.status_operacional}
                onChange={e => setData(prev => ({ ...prev, status_operacional: e.target.value }))}
                className="h-7 text-xs w-full rounded-md border border-input bg-background px-3"
              >
                <option value="ativa">Ativa</option>
                <option value="inativa">Inativa</option>
                <option value="arrendada">Arrendada</option>
                <option value="suspensa">Suspensa</option>
              </select>
            ) : (
              <p className={`text-xs font-medium px-2 py-1 rounded min-h-[28px] ${
                data.status_operacional === 'ativa'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700'
              }`}>
                {data.status_operacional === 'ativa' ? '✅ Ativa'
                  : data.status_operacional === 'arrendada' ? '⚠️ Arrendada'
                  : data.status_operacional === 'inativa' ? '⚠️ Inativa'
                  : '⚠️ Suspensa'}
              </p>
            )}
          </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Área Total Calculada
            </p>
            <p className="text-lg font-bold text-foreground">
              {areaTotalCalculada.toFixed(2)} ha
            </p>
            <p className="text-[10px] text-muted-foreground">
              Soma de pecuária, agricultura, APP, reserva, benfeitorias e outras.
            </p>
          </div>

          {/* Composição: CADASTRO (digitado) × PASTOS (derivado) × Δ. É o instrumento de
              descoberta — a soma dos pastos é a base do sistema e o cadastro puxa dela,
              então a coluna Δ é o que o operador tem para achar pasto faltando, número
              errado ou área que mudou de fazenda por desmembramento.
              O quadro "Pastos vs Pecuária" saiu: virou a primeira linha desta tabela.
              validarAreaPastosPecuarios continua em lib/validacoes/areaFazenda.ts. */}
          <div>
            <div className="grid grid-cols-[1fr_110px_90px_90px] gap-2 pb-1 border-b border-border">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Composição da Área
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-right px-2">Cadastro</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-right px-2">Pastos</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-right px-2">Δ</p>
            </div>

            {linhaArea('Pecuária', 'area_pecuaria_ha', somaFamilia('pecuaria'))}
            {linhaArea('Agricultura', 'area_agricultura_ha', somaFamilia('agricultura'))}
            {/* Silvicultura NÃO tem coluna em fazenda_cadastros. A linha existe e mostra
                o cadastro vazio: é divergência real, não lacuna a esconder. */}
            {linhaArea('Silvicultura', null, somaFamilia('silvicultura'))}
            {linhaArea('Ambiental', null, somaFamilia('ambiental'))}
            {linhaArea('Reserva Legal', 'area_reserva_ha', somaDestino('reserva'), { destino: true })}
            {linhaArea('APP', 'area_app_ha', somaDestino('app'), { destino: true })}
            {linhaArea('Infraestrutura', null, somaFamilia('infraestrutura'))}
            {linhaArea('Benfeitorias', 'area_benfeitorias_ha', somaDestino('benfeitorias'), { destino: true })}
            {/* Outras: coluna SEM família correspondente na taxonomia. Mesma razão
                inversa da Silvicultura — aparece com PASTOS vazio. */}
            {linhaArea('Outras', 'area_outras_ha', null)}

            <div className="grid grid-cols-[1fr_110px_90px_90px] gap-2 items-center pt-1 mt-1 border-t border-border">
              <span className="text-xs font-bold uppercase tracking-wide">Total</span>
              <span className="text-xs font-bold tabular-nums text-right px-2">{areaTotalCalculada.toFixed(2)}</span>
              <span className="text-xs font-bold tabular-nums text-right px-2">{somaPastosTotal.toFixed(2)}</span>
              <span className={`text-xs font-bold tabular-nums text-right px-2 ${
                Math.abs(somaPastosTotal - areaTotalCalculada) < 0.01 ? 'text-emerald-700' : 'text-amber-700'
              }`}>
                {Math.abs(somaPastosTotal - areaTotalCalculada) < 0.01
                  ? '✓'
                  : `${somaPastosTotal - areaTotalCalculada > 0 ? '+' : ''}${(somaPastosTotal - areaTotalCalculada).toFixed(2)}`}
              </span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'pastos' && <PastosTab hostBarra={hostBarra} />}

      {activeTab === 'roteiro' && (
        <div className="py-4">
          <p className="text-xs text-muted-foreground">Roteiro de acesso será implementado em fase futura.</p>
        </div>
      )}
    </div>
  );
}
