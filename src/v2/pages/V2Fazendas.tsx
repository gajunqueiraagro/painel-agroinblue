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
import { formatNum } from '@/lib/calculos/formatters';

// 'area' virou a aba "Cadastro" (Dados + Área fundidos). A CHAVE continua 'area'
// para não mexer no default de activeTab nem nos blocos condicionais.
type TabKey = 'area' | 'pastos';

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
  roteiro: string;
  /** ISO ou '' — NULL no banco significa "nunca conferida". Ver o cartão de topo. */
  matricula_conferida_em: string;
}

const EMPTY: CadastroRow = {
  municipio: '', estado: '', car: '', nirf: '',
  area_total_ha: '', area_pecuaria_ha: '', area_agricultura_ha: '',
  area_app_ha: '', area_reserva_ha: '', area_benfeitorias_ha: '', area_outras_ha: '',
  ie: '',
  status_operacional: 'ativa',
  roteiro: '',
  matricula_conferida_em: '',
};

const n = (v: string) => (v.trim() === '' ? 0 : Number(v));

// PR-AREA-MATRICULA-01 — área da matrícula no padrão BR (0.000,00).
// Input é TEXTO, não `type="number"`: number não exibe separador de milhar nem
// vírgula decimal. Digitação livre; a formatação acontece no blur.
//
// Mesmo idioma de PastosTab.tsx:46-56, declarado LOCAL de propósito: lá as duas
// funções não são exportadas, e extrair para lib/ com só dois consumidores seria
// criar módulo antes de haver o terceiro. Extrair quando ele aparecer.
function formatarAreaBR(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseAreaBR(texto: string): number | null {
  const limpo = texto.replace(/\./g, '').replace(',', '.').trim();
  if (!limpo) return null;
  const num = Number(limpo);
  return Number.isFinite(num) ? num : null;
}

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
        // PR-FIX-MATRICULA-PARSE-01 — entra JÁ FORMATADO em BR. Com String() o
        // state ficava em formato americano ("3665.54"), e o blur passava esse texto
        // por parseAreaBR, que trata o ponto como separador de MILHAR: 3665.54 virava
        // 366554. O valor era multiplicado por 100 a cada ciclo abrir-salvar.
        // O texto do state e o texto que parseAreaBR espera precisam ser o mesmo formato.
        area_total_ha: row.area_total_ha != null
          ? formatarAreaBR(Number(row.area_total_ha))
          : '',
        area_pecuaria_ha: (row as any).area_pecuaria_ha != null ? String((row as any).area_pecuaria_ha) : '',
        area_agricultura_ha: (row as any).area_agricultura_ha != null ? String((row as any).area_agricultura_ha) : '',
        area_app_ha: (row as any).area_app_ha != null ? String((row as any).area_app_ha) : '',
        area_reserva_ha: (row as any).area_reserva_ha != null ? String((row as any).area_reserva_ha) : '',
        area_benfeitorias_ha: (row as any).area_benfeitorias_ha != null ? String((row as any).area_benfeitorias_ha) : '',
        area_outras_ha: (row as any).area_outras_ha != null ? String((row as any).area_outras_ha) : '',
        status_operacional: (fazendaAtual as any).status_operacional ?? 'ativa',
        roteiro: (row as any).roteiro ?? '',
        matricula_conferida_em: (row as any).matricula_conferida_em ?? '',
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
      // PR-AREA-MATRICULA-01 — area_total_ha e a area da MATRICULA, documento
      // digitado, sem correspondente nos pastos. Antes era a soma das seis colunas
      // de area do cadastro, que deixaram de ser editaveis no 77cec994 — o valor
      // gravado era a soma de numeros congelados.
      area_total_ha: parseAreaBR(data.area_total_ha),
      ie: data.ie || null,
      area_pecuaria_ha: n(data.area_pecuaria_ha) || null,
      area_agricultura_ha: n(data.area_agricultura_ha) || null,
      area_produtiva_ha: areaProdutivaCalculada || null,
      area_app_ha: n(data.area_app_ha) || null,
      area_reserva_ha: n(data.area_reserva_ha) || null,
      area_benfeitorias_ha: n(data.area_benfeitorias_ha) || null,
      area_outras_ha: n(data.area_outras_ha) || null,
      roteiro: data.roteiro || null,
      matricula_conferida_em: data.matricula_conferida_em || null,
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

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'area', label: 'Cadastro' },
    { key: 'pastos', label: 'Pastos' },
  ];

  // ── Derivação por família/destino ───────────────────────────────────────────
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
  /** Destinos de uma família, já somados — o módulo devolve `.pastos`, não `.somaHa`. */
  const destinosDaFamilia = (grupo: string) =>
    (agrupado.familias.find(f => f.grupo === grupo)?.tipos ?? []).map(t => ({
      tipo: t.tipo,
      label: t.label,
      somaHa: t.pastos.reduce((acc, p) => acc + (p.area_produtiva_ha ?? 0), 0),
    }));
  /**
   * Percentual no idioma da lista de pastos: família sobre o total geral, destino
   * sobre a própria família. Base zero devolve `—`, nunca "0,0%" — sem denominador
   * não há proporção, e zero por cento afirmaria uma que não existe.
   */
  const pct = (valor: number, base: number) =>
    base > 0 ? `${formatNum((valor / base) * 100, 1)}%` : '—';
  const matriculaHa = parseAreaBR(data.area_total_ha);
  const diferencaMatricula = matriculaHa !== null ? matriculaHa - somaPastosTotal : null;
  const matriculaConferida = !!data.matricula_conferida_em;

  // PR-AREA-LAYOUT-01 — a coluna CADASTRO saiu: os valores digitados em
  // fazenda_cadastros foram conferidos contra os pastos e descartados como lixo.
  // A tela passa a exibir SÓ o derivado. As colunas do banco continuam sendo
  // gravadas pelo handleSave com o que veio do load — deixaram de ser exibidas,
  // não de existir. `areaField` saiu junto, órfão; `textField` segue em uso.
  // Rótulo | ha | %. Cor fica em título e subtítulo — nunca tint na linha inteira.
  // A hierarquia é peso e recuo: família semibold, destino menor, muted e recuado.
  // PR-AREA-LAYOUT-03 — o PERCENTUAL da família ganha o peso principal: é ele que
  // responde "como esta fazenda se reparte", que é a leitura para a qual a tabela
  // existe. O valor em ha vira apoio. Destinos encolhem (text-[9px], py-0) porque
  // são 10 linhas no pior caso e é neles que há altura a recuperar.
  const linhaArea = (rotulo: string, valor: number, base: number, opts?: { destino?: boolean }) => (
    <div key={rotulo} className={`grid grid-cols-[1fr_84px_58px] gap-1 items-baseline border-b border-border/30 last:border-b-0 ${opts?.destino ? 'py-0' : 'py-1'}`}>
      <span className={opts?.destino
        ? 'text-[9px] text-muted-foreground pl-4'
        : 'text-[11px] font-semibold text-foreground'}>
        {rotulo}
      </span>
      <span className={`tabular-nums text-right px-1 ${opts?.destino ? 'text-[9px] text-muted-foreground' : 'text-[11px] font-medium text-foreground'}`}>
        {formatNum(valor, 2)}
      </span>
      <span className={`tabular-nums text-right px-1 ${opts?.destino ? 'text-[9px] text-muted-foreground/70' : 'text-[11px] font-semibold text-foreground'}`}>
        {valor > 0 ? pct(valor, base) : '—'}
      </span>
    </div>
  );

  /** Família + seus destinos. Família com 0,00 continua aparecendo — é informação. */
  const blocoFamilia = (grupo: string, rotulo: string) => {
    const soma = somaFamilia(grupo);
    return (
      <div key={grupo}>
        {linhaArea(rotulo, soma, somaPastosTotal)}
        {destinosDaFamilia(grupo).map(d => linhaArea(d.label, d.somaHa, soma, { destino: true }))}
      </div>
    );
  };

  const textField = (label: string, key: keyof CadastroRow) => (
    <div className="space-y-0.5">
      <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </Label>
      {editing ? (
        <Input
          value={data[key]}
          onChange={e => setData(prev => ({ ...prev, [key]: e.target.value }))}
          className="h-6 text-[11px]"
        />
      ) : (
        <p className="text-[11px] font-medium px-2 py-0.5 rounded bg-muted/50 min-h-[24px]">
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
        // PR-AREA-LAYOUT-02 — composição à ESQUERDA, dados à DIREITA. A área é o que
        // o operador vem conferir; a identificação é referência.
        <div className="grid grid-cols-2 gap-4 items-start">

          {/* ── ESQUERDA — composição derivada dos pastos ───────────────────── */}
          <div className="space-y-2">
            {/* PR-AREA-CARD-CONFERIDA-01 — três colunas: rótulo | valor | estado.
                O estado da conferência é atributo DA MATRÍCULA, não informação de
                mesmo nível das outras duas linhas — por isso vai na terceira coluna
                da própria linha, e não numa quarta linha do card.
                A diferença é exibida SEMPRE, inclusive zero: informação permanente,
                não alerta. */}
            <div className="rounded-lg border border-border bg-muted/40 p-2 space-y-1">
              <div className="grid grid-cols-[1fr_112px_auto] gap-2 items-baseline">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Matrícula</span>
                <span className="text-[11px] font-medium tabular-nums text-right whitespace-nowrap">
                  {matriculaHa !== null
                    ? `${formatNum(matriculaHa, 2)} ha`
                    : <span className="text-muted-foreground italic">—</span>}
                </span>
                {/* PR-AREA-CARD-CONFERIDA-02 — sem o rótulo "Não conferida": o botão
                    já comunica o estado, porque só existe enquanto não foi conferida.
                    Rótulo e botão juntos comprimiam as trilhas de rótulo e valor e
                    empurravam os números para a esquerda. Texto em duas linhas para
                    o botão ocupar a largura da maior palavra, não da frase inteira. */}
                <span className="flex items-center justify-end">
                  {matriculaConferida ? (
                    <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                      Conferida em {new Date(data.matricula_conferida_em).toLocaleDateString('pt-BR')}
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-auto py-0.5 px-1.5 text-[10px] leading-tight text-amber-700 border-amber-300 hover:bg-amber-50 whitespace-normal"
                      onClick={() => setData(prev => ({ ...prev, matricula_conferida_em: new Date().toISOString() }))}
                    >
                      Marcar como<br />conferida
                    </Button>
                  )}
                </span>
              </div>
              <div className="grid grid-cols-[1fr_112px_auto] gap-2 items-baseline">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Soma dos pastos</span>
                <span className="text-base font-bold tabular-nums leading-tight text-right whitespace-nowrap">{formatNum(somaPastosTotal, 2)} ha</span>
                <span />
              </div>
              {/* Diferença é a menos consultada das três — peso menor que Matrícula
                  e Soma dos pastos. A cor (âmbar/verde) continua carregando o sinal. */}
              <div className="grid grid-cols-[1fr_112px_auto] gap-2 items-baseline py-0.5 border-t border-border/60">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Diferença</span>
                {/* VERDE só depois de conferida. Enquanto matricula_conferida_em for
                    NULL, Δ zero NÃO vira verde: as 12 fazendas herdaram em
                    area_total_ha o resíduo do cálculo antigo, que coincide com a soma
                    dos pastos em 9 delas. Verde ali seria conferência APARENTE. */}
                <span className={`text-[10px] font-semibold tabular-nums text-right whitespace-nowrap ${
                  diferencaMatricula === null ? ''
                    : matriculaConferida && Math.abs(diferencaMatricula) < 0.01 ? 'text-emerald-700'
                    : 'text-amber-700'
                }`}>
                  {diferencaMatricula === null
                    ? <span className="text-muted-foreground italic font-normal">—</span>
                    : `${diferencaMatricula > 0 ? '+' : ''}${formatNum(diferencaMatricula, 2)} ha`}
                </span>
                <span />
              </div>
            </div>

            <div>
              <div className="grid grid-cols-[1fr_84px_58px] gap-1 pb-0.5 border-b border-border">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Composição da Área
                </p>
                <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground text-right px-1">ha</p>
                <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground text-right px-1">%</p>
              </div>

              {blocoFamilia('pecuaria', 'Pecuária')}
              {blocoFamilia('agricultura', 'Agricultura')}
              {blocoFamilia('silvicultura', 'Silvicultura')}
              {blocoFamilia('ambiental', 'Ambiental')}
              {blocoFamilia('infraestrutura', 'Infraestrutura')}

              <div className="grid grid-cols-[1fr_84px_58px] gap-1 items-baseline pt-1 mt-1 border-t border-border">
                <span className="text-xs font-semibold uppercase tracking-wide">Total</span>
                <span className="text-xs font-semibold tabular-nums text-right px-1">{formatNum(somaPastosTotal, 2)}</span>
                <span className="text-[10px] tabular-nums text-right px-1 text-muted-foreground">
                  {somaPastosTotal > 0 ? '100,0%' : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* ── DIREITA — dados da fazenda ───────────────────────────────────── */}
          {/* PR-AREA-LAYOUT-03 — cabeçalho com borda inferior (mesmo tratamento de
              "Composição da Área") e separador sutil entre os grupos de campos: o
              bloco era opaco, sem hierarquia entre rótulo e conteúdo. */}
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground pb-1 border-b border-border">
              Dados da Fazenda
            </p>

            <div className="divide-y divide-border/40">
            <div className="grid grid-cols-2 gap-1.5 py-1">
              {/* NOME é SOMENTE LEITURA: quem grava é FazendasList.tsx. Um segundo
                  escritor recriaria o problema que esta frente desmontou. */}
              <div className="space-y-0.5">
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Nome da Fazenda
                </Label>
                <p className="text-[11px] font-medium px-2 py-0.5 rounded bg-muted/50 min-h-[24px]">
                  {fazendaAtual?.nome || <span className="text-muted-foreground italic">—</span>}
                </p>
              </div>
              <div className="space-y-0.5">
                <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Código da Fazenda
                </Label>
                {editing ? (
                  <Input
                    value={codigoFazenda}
                    onChange={e => setCodigoFazenda(e.target.value)}
                    className="h-6 text-[11px]"
                    placeholder="Ex: BG, 3M"
                  />
                ) : (
                  <p className="text-[11px] font-medium px-2 py-0.5 rounded bg-muted/50 min-h-[24px]">
                    {codigoFazenda || <span className="text-muted-foreground italic">—</span>}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5 py-1">
              {textField('Município', 'municipio')}
              {textField('Estado', 'estado')}
              {textField('CAR', 'car')}
            </div>

            <div className="grid grid-cols-2 gap-1.5 py-1">
              {textField('NIRF', 'nirf')}
              {textField('IE / Inscrição Estadual', 'ie')}
            </div>

              {/* Status Operacional — fonte: tabela fazendas */}
              <div className="space-y-0.5 py-1">
                <label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Status Operacional
                </label>
                {editing ? (
                  <select
                    value={data.status_operacional}
                    onChange={e => setData(prev => ({ ...prev, status_operacional: e.target.value }))}
                    className="h-6 text-[11px] w-full rounded-md border border-input bg-background px-3"
                  >
                    <option value="ativa">Ativa</option>
                    <option value="inativa">Inativa</option>
                    <option value="arrendada">Arrendada</option>
                    <option value="suspensa">Suspensa</option>
                  </select>
                ) : (
                  <p className={`text-[11px] font-medium px-2 py-0.5 rounded min-h-[24px] ${
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

            <div className="space-y-0.5 py-1">
              <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">
                Roteiro
              </Label>
              {editing ? (
                <textarea
                  value={data.roteiro}
                  onChange={e => setData(prev => ({ ...prev, roteiro: e.target.value }))}
                  className="h-12 w-full text-[11px] rounded-md border border-input bg-background px-2 py-1 resize-none"
                  placeholder="Roteiro de acesso à fazenda"
                />
              ) : (
                <p className="text-[11px] font-medium px-2 py-1 rounded bg-muted/50 min-h-[48px] whitespace-pre-wrap">
                  {data.roteiro || <span className="text-muted-foreground italic">—</span>}
                </p>
              )}
            </div>

            {/* A MATRÍCULA é documento, não derivado — terceira referência do sistema,
                ao lado dos pastos e do fechamento. Alterar o valor limpa a conferência:
                número novo é número não conferido. */}
            <div className="space-y-0.5 py-1">
              <Label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">
                Área da Matrícula (ha)
              </Label>
              {editing ? (
                <Input
                  value={data.area_total_ha}
                  onChange={e => setData(prev => ({ ...prev, area_total_ha: e.target.value, matricula_conferida_em: '' }))}
                  onBlur={e => setData(prev => ({ ...prev, area_total_ha: formatarAreaBR(parseAreaBR(e.target.value)) }))}
                  className="h-6 text-[11px] text-right tabular-nums"
                  placeholder="0,00"
                />
              ) : (
                <p className="text-[11px] font-medium px-2 py-0.5 rounded bg-muted/50 min-h-[24px] text-right tabular-nums">
                  {data.area_total_ha
                    ? formatarAreaBR(parseAreaBR(data.area_total_ha))
                    : <span className="text-muted-foreground italic">—</span>}
                </p>
              )}
            </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'pastos' && <PastosTab hostBarra={hostBarra} />}

    </div>
  );
}
