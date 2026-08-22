import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda, GLOBAL_FAZENDA } from '@/contexts/FazendaContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useCliente } from '@/contexts/ClienteContext';
import { usePastos } from '@/hooks/usePastos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Save, Pencil, ArrowLeft, Plus } from 'lucide-react';
import { PastosTab } from '@/pages/PastosTab';
import { agruparPastosPorFamilia } from '@/lib/pastos/agruparPorFamilia';
import { formatarAreaBR, parseAreaBR } from '@/lib/areaBR';
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

export function V2Fazendas() {
  const { fazendaAtual, isGlobal, fazendas, setFazendaAtual, reloadFazendas, criarFazenda } = useFazenda();
  const { clienteAtual } = useCliente();
  const { pastos } = usePastos();

  // PR-AREA-DERIVADA-01 — repartição derivada do cadastro de PASTOS, para o operador
  // comparar lado a lado com o que está digitado e achar a divergência. Sem query
  // nova: usePastos já está carregado acima.
  //
  // Só ATIVOS: agruparPastosPorFamilia não filtra por decisão declarada no módulo —
  // quem chama decide. Esta é tela de cadastro e quer o conjunto vigente.
  //
  // MÊS CORRENTE, declarado: a tela não tem seletor de mês nem de ano, e antes
  // não passava mês nenhum — pasto encerrado por data_fim entrava na soma para
  // sempre. Isso REVERTE a decisão anterior ("não inventar um mês"), por dois
  // motivos medidos em 22/08/2026: o modal de edição já PROMETE que depois da
  // data_fim o pasto "não entra na conta de área", e sem o filtro a Pureza
  // acusava divergência de 69,76 ha contra a própria matrícula — exatamente os
  // 4 pastos desmembrados para o Retiro Agricultura em 2025-05.
  // Esta é tela de cadastro ATUAL: o mês corrente é a referência honesta.
  const mesCorrente = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);
  const agrupado = useMemo(
    () => agruparPastosPorFamilia(pastos.filter(p => p.ativo !== false), mesCorrente),
    [pastos, mesCorrente],
  );

  // ── MODO GLOBAL — consolidado transposto ───────────────────────────────────
  // Uma COLUNA por fazenda, uma LINHA por família/destino. Mesma fonte e mesma
  // função do individual, só que aplicada por fazenda: nenhuma conta nova, e por
  // construção a coluna de uma fazenda é idêntica ao que a tela dela mostra.
  //
  // `mesRef` vai em TODAS as chamadas. Sem ele, pasto encerrado por data_fim
  // contaria para sempre e o consolidado divergiria do individual — que passou a
  // filtrar em 98a1eebf. Uma vigência aplicada só de um lado é pior que nenhuma:
  // produz dois números defensáveis para a mesma pergunta.
  //
  // Só fazendas COM pasto vigente ganham coluna. Fazenda sem nenhum apareceria
  // como uma coluna inteira de zeros, afirmando "zero hectare" onde o fato é
  // "não cadastrou pasto" — a sentinela do projeto proíbe.
  const fazendasDoConsolidado = useMemo(() => {
    const comPasto = new Set(
      pastos.filter(p => p.ativo !== false).map(p => p.fazenda_id),
    );
    return fazendas
      .filter(f => f.id !== '__global__' && comPasto.has(f.id))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [pastos, fazendas]);

  const agrupadoPorFazenda = useMemo(
    () => new Map(fazendasDoConsolidado.map(f => [
      f.id,
      agruparPastosPorFamilia(
        pastos.filter(p => p.fazenda_id === f.id && p.ativo !== false),
        mesCorrente,
      ),
    ])),
    [fazendasDoConsolidado, pastos, mesCorrente],
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
  const [nomeFazenda, setNomeFazenda] = useState('');

  /* Criacao de fazenda — estado do dialog do consolidado. Fica aqui, no topo,
     e nao dentro do ramo `isGlobal`: hook e estado nao podem nascer depois de
     um early return. */
  const [novaOpen, setNovaOpen] = useState(false);
  const [novaNome, setNovaNome] = useState('');
  const [novaCodigo, setNovaCodigo] = useState('');
  const [criando, setCriando] = useState(false);

  const loadData = useCallback(async () => {
    if (isGlobal || !fazendaAtual?.id || fazendaAtual.id === '__global__' || !clienteAtual?.id) {
      setData(EMPTY);
      setCodigoFazenda('');
      setNomeFazenda('');
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
    setNomeFazenda(fazendaAtual.nome ?? '');
    setLoading(false);
  }, [fazendaAtual, clienteAtual?.id, isGlobal]);

  useEffect(() => { loadData(); }, [loadData]);

  /* Caminho (ii) do briefing: formulario minimo chamando `criarFazenda` do
     CONTEXTO — que ja e o escritor real e ja faz cliente_id, owner_id, codigo +
     codigo_importacao, recarga do contexto e navegacao para a fazenda nova
     (FazendaContext:150-167). Nao ha insert novo aqui.
     O (i) foi descartado: `FazendaSetup` e uma PAGINA de onboarding —
     `min-h-screen`, emoji 5xl e titulo "Cadastre sua Fazenda" — e caberia num
     dialog so alterando-o, o que o anti-escopo proibe.
     `criarFazenda` valida o CODIGO (FazendaContext:152) mas nao o NOME; a
     guarda do nome e a mesma forma da aba Cadastro: trim, toast, return. */
  const handleCriarFazenda = async () => {
    if (!novaNome.trim()) {
      toast.error('Nome é obrigatório.');
      return;
    }
    setCriando(true);
    const criada = await criarFazenda(novaNome.trim(), novaCodigo.trim());
    setCriando(false);
    if (!criada) return;
    setNovaNome('');
    setNovaCodigo('');
    setNovaOpen(false);
  };

  const handleSave = async () => {
    if (!fazendaAtual?.id || !clienteAtual?.id) {
      toast.error('Cliente ou fazenda não selecionado.');
      return;
    }

    /* Mesma forma da regra que ja existe em FazendasList:47-51 — trim, toast e
       return antes de qualquer escrita. Restrita ao NOME de proposito: a regra
       de la e "Nome e Codigo sao obrigatorios", e o codigo aqui e OPCIONAL
       desde sempre (`codigo_importacao: codigoFazenda || null`, logo abaixo).
       Exigi-lo agora mudaria o comportamento de um campo fora do escopo. */
    if (!nomeFazenda.trim()) {
      toast.error('Nome é obrigatório.');
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
      .update({ nome: nomeFazenda.trim(), codigo_importacao: codigoFazenda || null, status_operacional: data.status_operacional } as any)
      .eq('id', fazendaAtual.id);
    if (fazendaError) {
      toast.error('Erro ao salvar código da fazenda: ' + fazendaError.message);
      setSaving(false);
      return;
    }

    /* `fazendas` vive no contexto, nao em loadData — sem recarregar, o seletor
       lateral e o proprio cabecalho desta tela seguiriam no nome antigo ate um
       refresh. Mesmo gesto do handleUpdate da FazendasList:70. */
    await reloadFazendas();

    toast.success('Área salva com sucesso!');
    setEditing(false);
    await loadData();
    setSaving(false);
  };

  /* A guarda unica virou DOIS ramos, porque os dois casos deixaram de ter a
     mesma resposta:
       Global        -> consolidado transposto (abaixo)
       sem fazenda   -> a lista de hoje, intacta (mais abaixo)
     Antes os dois caiam em <FazendasList />. Fundi-los de novo apagaria o
     consolidado no dia em que o contexto devolver null por um instante. */

  // Cinco familias, MESMA ordem e MESMOS rotulos do individual — as cinco
  // chamadas literais de blocoFamilia mais abaixo. Duas listas para a mesma
  // taxonomia e' divida declarada; unifica-las e' refatoracao, nao este PR.
  const FAMILIAS_CONSOLIDADO: [string, string][] = [
    ['pecuaria', 'Pecuária'],
    ['agricultura', 'Agricultura'],
    ['silvicultura', 'Silvicultura'],
    ['ambiental', 'Ambiental'],
    ['infraestrutura', 'Infraestrutura'],
  ];

  /* Leitores sobre um agrupamento qualquer — o de UMA fazenda ou o consolidado.
     Sao os mesmos calculos de somaFamilia/somaDestino/somaPastosTotal do modo
     individual, parametrizados pelo agrupamento em vez de fechados sobre
     `agrupado`. Nao ha conta nova em lugar nenhum deste PR. */
  type Agrupamento = ReturnType<typeof agruparPastosPorFamilia>;
  const somaFamDe = (ag: Agrupamento | undefined, grupo: string) =>
    ag?.familias.find(f => f.grupo === grupo)?.somaHa ?? 0;
  const somaTipoDe = (ag: Agrupamento | undefined, tipo: string) => {
    for (const f of ag?.familias ?? []) {
      const t = f.tipos.find(x => x.tipo === tipo);
      if (t) return t.pastos.reduce((acc, p) => acc + (p.area_produtiva_ha ?? 0), 0);
    }
    return 0;
  };
  const totalDe = (ag: Agrupamento | undefined) =>
    (ag?.familias ?? []).reduce((acc, f) => acc + f.somaHa, 0);

  if (isGlobal) {
    /* Uma coluna de rotulo + uma por fazenda + TOTAL. O template e derivado da
       contagem: com 4 fazendas (maximo medido no cliente NJ) sao 6 colunas. */
    const gridConsolidado =
      `minmax(140px,1.6fr) repeat(${fazendasDoConsolidado.length + 1}, minmax(0,1fr))`;
    /* Sem coluna de %: no transposto o denominador deixa de ser obvio —
       "% da fazenda" e "% do consolidado" seriam leituras diferentes na
       mesma celula. Nao "completar" a tabela depois sem resolver isso. */
    return (
      <div className="px-4 py-4 w-full max-w-[1100px]">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-foreground">Fazendas e Pastos</h2>
            <p className="text-[10px] text-muted-foreground">
              Composição da área por fazenda — clique no nome de uma coluna para entrar nela
            </p>
          </div>
          <Dialog open={novaOpen} onOpenChange={(o) => { setNovaOpen(o); if (!o) { setNovaNome(''); setNovaCodigo(''); } }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs shrink-0">
                <Plus className="h-3 w-3 mr-1" /> Adicionar fazenda
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-sm font-semibold">Nova fazenda</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold text-foreground uppercase tracking-wide">
                    Nome da Fazenda
                  </Label>
                  <Input
                    value={novaNome}
                    onChange={e => setNovaNome(e.target.value)}
                    placeholder="Ex: Faz. 3 Muchachas"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold text-foreground uppercase tracking-wide">
                    Código da Fazenda
                  </Label>
                  <Input
                    value={novaCodigo}
                    onChange={e => setNovaCodigo(e.target.value)}
                    placeholder="Ex: 3M, BG, ADM"
                    className="h-8 text-xs uppercase"
                    maxLength={20}
                  />
                  {/* O codigo vira MAIUSCULO dentro de criarFazenda (FazendaContext:153)
                      e alimenta a coluna "Fazenda" do Excel financeiro. */}
                  <p className="text-[10px] text-muted-foreground">
                    Código único, usado na importação financeira.
                  </p>
                </div>
                <Button
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={handleCriarFazenda}
                  disabled={criando || !novaNome.trim() || !novaCodigo.trim()}
                >
                  <Save className="h-3 w-3 mr-1" /> {criando ? 'Criando...' : 'Criar fazenda'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {fazendasDoConsolidado.length === 0 ? (
          <p className="text-xs text-muted-foreground mb-4">
            Nenhuma fazenda com pasto vigente neste mês.
          </p>
        ) : (
          <div className="border rounded-md overflow-hidden mb-4">
            {/* A10 — cabecalho e TOTAL em bg-primary. NENHUM texto sobre azul pode
                ficar em text-foreground ou text-muted-foreground: a linha inteira
                leva primary-foreground e as celulas nao redefinem cor. */}
            <div className="grid gap-1 py-1 bg-primary text-primary-foreground items-baseline"
                 style={{ gridTemplateColumns: gridConsolidado }}>
              <span className="text-[10px] font-semibold uppercase tracking-wide pl-1">
                Composição da Área
              </span>
              {fazendasDoConsolidado.map(f => (
                /* Entrar na fazenda e' setFazendaAtual do PROPRIO contexto — sem
                   estado de navegacao paralelo, entao o seletor lateral acompanha
                   sozinho. Um estado local aqui faria a tela e o seletor divergirem. */
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFazendaAtual(f)}
                  title={`Abrir ${f.nome}`}
                  className="text-[10px] font-semibold text-right px-1 truncate cursor-pointer rounded-sm hover:bg-primary-foreground/20"
                >
                  {f.nome}
                </button>
              ))}
              <span className="text-[10px] font-semibold uppercase tracking-wide text-right px-1">
                Total
              </span>
            </div>

            {FAMILIAS_CONSOLIDADO.map(([grupo, rotulo]) => (
              <div key={grupo}>
                <div className="grid gap-1 py-1 bg-primary/10 items-baseline"
                     style={{ gridTemplateColumns: gridConsolidado }}>
                  <span className="text-[11px] font-medium text-foreground pl-1">{rotulo}</span>
                  {fazendasDoConsolidado.map(f => (
                    <span key={f.id} className="text-[11px] font-medium text-foreground tabular-nums text-right px-1">
                      {formatNum(somaFamDe(agrupadoPorFazenda.get(f.id), grupo), 2)}
                    </span>
                  ))}
                  <span className="text-[11px] font-semibold text-foreground tabular-nums text-right px-1">
                    {formatNum(somaFamDe(agrupado, grupo), 2)}
                  </span>
                </div>
                {/* Zebra por INDICE em JS, nunca odd:/even: — cada familia e um
                    <div> proprio e as variantes do CSS contam irmaos do mesmo pai,
                    entao a alternancia reiniciaria em cada bloco. Mesma decisao de
                    7a6fd296 no individual, e o indice reinicia por familia
                    exatamente como la. */}
                {(agrupado.familias.find(f => f.grupo === grupo)?.tipos ?? []).map((t, i) => (
                  <div key={t.tipo}
                       className={`grid gap-1 py-0 items-baseline ${i % 2 === 0 ? 'bg-muted/30' : 'bg-card'}`}
                       style={{ gridTemplateColumns: gridConsolidado }}>
                    <span className="text-[9px] text-muted-foreground pl-4 truncate">{t.label}</span>
                    {fazendasDoConsolidado.map(f => (
                      <span key={f.id} className="text-[9px] text-muted-foreground tabular-nums text-right px-1">
                        {formatNum(somaTipoDe(agrupadoPorFazenda.get(f.id), t.tipo), 2)}
                      </span>
                    ))}
                    <span className="text-[9px] text-muted-foreground tabular-nums text-right px-1">
                      {formatNum(somaTipoDe(agrupado, t.tipo), 2)}
                    </span>
                  </div>
                ))}
              </div>
            ))}

            <div className="grid gap-1 py-1 bg-primary text-primary-foreground items-baseline"
                 style={{ gridTemplateColumns: gridConsolidado }}>
              <span className="text-[11px] font-bold uppercase tracking-wide pl-1">Total</span>
              {fazendasDoConsolidado.map(f => (
                <span key={f.id} className="text-[11px] font-bold tabular-nums text-right px-1">
                  {formatNum(totalDe(agrupadoPorFazenda.get(f.id)), 2)}
                </span>
              ))}
              <span className="text-[11px] font-bold tabular-nums text-right px-1">
                {formatNum(totalDe(agrupado), 2)}
              </span>
            </div>
          </div>
        )}

        {/* FazendasList fora do /v2: criar tem destino no botao do cabecalho, e
            renomear na aba Cadastro desde 91c8352d. O componente continua vivo no
            app legado (CadastrosTab:286). */}

        {/* Fazenda sem pasto NAO vira coluna — a regra de e821e4ab continua de pe,
            porque uma coluna de zeros afirmaria "zero hectare" onde o fato e "nao
            cadastrou pasto". Mas ela tambem nao pode sumir da tela: fazenda recem
            criada ficaria invisivel, e o Administrativo ja estava. Entao ela vira
            NOME, sem numero nenhum — o que e exatamente o que se sabe dela. Clicavel,
            para ser a porta de entrada que os cards eram. */}
        {(() => {
          const semPasto = fazendas
            .filter(f => f.id !== '__global__' && !fazendasDoConsolidado.some(x => x.id === f.id))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
          if (semPasto.length === 0) return null;
          return (
            <p className="text-[10px] text-muted-foreground">
              Sem pasto cadastrado:{' '}
              {semPasto.map((f, i) => (
                <span key={f.id}>
                  {i > 0 && ' · '}
                  <button
                    type="button"
                    onClick={() => setFazendaAtual(f)}
                    title={`Abrir ${f.nome}`}
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    {f.nome}
                  </button>
                </span>
              ))}
            </p>
          );
        })()}
      </div>
    );
  }

  if (!fazendaAtual) {
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
  /* Hierarquia de TRES niveis, padrao A10 do PADROES-UI:
       cabecalho e TOTAL -> bg-primary (azul, texto branco)
       FAMILIA           -> bg-primary/10 (azul claro)
       TIPO              -> zebra odd:bg-muted/30 even:bg-card
     `idx` so existe para a zebra dos tipos: `odd:`/`even:` do CSS contam
     filhos do mesmo pai, e cada familia e um <div> proprio — a alternancia
     reiniciaria em cada bloco. */
  const linhaArea = (
    rotulo: string, valor: number, base: number,
    opts?: { destino?: boolean; idx?: number },
  ) => (
    <div key={rotulo} className={`grid grid-cols-[1fr_84px_58px] gap-1 items-baseline ${
      opts?.destino
        ? `py-0 ${(opts.idx ?? 0) % 2 === 0 ? 'bg-muted/30' : 'bg-card'}`
        : 'py-1 bg-primary/10'
    }`}>
      <span className={opts?.destino
        ? 'text-[9px] text-muted-foreground pl-4'
        : 'text-[11px] font-medium text-foreground pl-1'}>
        {rotulo}
      </span>
      <span className={`tabular-nums text-right px-1 ${opts?.destino ? 'text-[9px] text-muted-foreground' : 'text-[11px] font-medium text-foreground'}`}>
        {formatNum(valor, 2)}
      </span>
      <span className={`tabular-nums text-right px-1 ${opts?.destino ? 'text-[9px] text-muted-foreground/70' : 'text-[11px] font-medium text-foreground'}`}>
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
        {destinosDaFamilia(grupo).map((d, i) => linhaArea(d.label, d.somaHa, soma, { destino: true, idx: i }))}
      </div>
    );
  };

  /* 10px, nao 9, nos DEZ rotulos de "Dados da Fazenda": a cor ja e
     --foreground (222 47% 11%, quase preto), tem definicao unica no projeto e
     e a MESMA que os valores herdam — nao ha tom mais escuro para onde ir.
     O que lia como cinza era o traco fino de 9px em uppercase com
     tracking-wide. Tamanho ataca a causa; cor nao tinha alavanca.
     Custo aceito: ~1px de altura por rotulo. */
  const textField = (label: string, key: keyof CadastroRow) => (
    <div className="space-y-0.5">
      <Label className="text-[10px] font-semibold text-foreground uppercase tracking-wide">
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
        <div className="flex items-center gap-1.5">
          {/* Voltar ao Global. Condiciona em fazendas.length > 1, NAO em isGlobal:
              cliente de fazenda unica nunca entra em Global — FazendaContext:108 e
              :110 caem direto em list[0] nos dois ramos, o do localStorage e o do
              default — e o botao levaria a lugar nenhum.
              O sentinela GLOBAL_FAZENDA vem do proprio contexto; construir um
              objeto equivalente aqui criaria uma segunda definicao de "Global". */}
          {fazendas.filter(f => f.id !== '__global__').length > 1 && (
            <button
              type="button"
              onClick={() => setFazendaAtual(GLOBAL_FAZENDA)}
              title="Voltar ao consolidado de todas as fazendas"
              className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div>
            <h2 className="text-sm font-bold text-foreground">{fazendaAtual.nome}</h2>
            <p className="text-[10px] text-muted-foreground">Cadastro da fazenda</p>
          </div>
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
                {/* PR-AREA-CONFERIDA-BOTAO-01 — o botão só existe no modo de EDIÇÃO.
                    Ele escreve apenas no state; a persistência é do handleSave. Fora
                    da edição não há Salvar na tela, então clicar e sair perdia a
                    marcação em silêncio — o botão parecia ação imediata e não é.
                    Oferecido só onde há Salvar visível, a expectativa não se cria.
                    O ESTADO continua legível nas duas situações: o que muda é se há
                    ou não o que fazer a respeito dele aqui.

                    PR-AREA-CARD-CONFERIDA-02 — quando o botão aparece, ele dispensa o
                    rótulo: só existe enquanto não foi conferida. Texto em duas linhas
                    para ocupar a largura da maior palavra, não da frase inteira. */}
                <span className="flex items-center justify-end">
                  {matriculaConferida ? (
                    <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                      Conferida em {new Date(data.matricula_conferida_em).toLocaleDateString('pt-BR')}
                    </span>
                  ) : editing ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-auto py-0.5 px-1.5 text-[10px] leading-tight text-amber-700 border-amber-300 hover:bg-amber-50 whitespace-normal"
                      onClick={() => setData(prev => ({ ...prev, matricula_conferida_em: new Date().toISOString() }))}
                    >
                      Marcar como<br />conferida
                    </Button>
                  ) : (
                    <span className="text-[9px] font-semibold text-amber-700 whitespace-nowrap">
                      Não conferida
                    </span>
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
              {/* A10: cabecalho em bg-primary. NENHUM texto sobre azul pode ficar
                  em text-foreground ou text-muted-foreground — o <tr> inteiro leva
                  primary-foreground e as celulas nao redefinem cor. */}
              <div className="grid grid-cols-[1fr_84px_58px] gap-1 py-1 bg-primary text-primary-foreground">
                <p className="text-[9px] font-semibold uppercase tracking-wide pl-1">
                  Composição da Área
                </p>
                <p className="text-[9px] font-semibold uppercase tracking-wide text-right px-1">ha</p>
                <p className="text-[9px] font-semibold uppercase tracking-wide text-right px-1">%</p>
              </div>

              {blocoFamilia('pecuaria', 'Pecuária')}
              {blocoFamilia('agricultura', 'Agricultura')}
              {blocoFamilia('silvicultura', 'Silvicultura')}
              {blocoFamilia('ambiental', 'Ambiental')}
              {blocoFamilia('infraestrutura', 'Infraestrutura')}

              <div className="grid grid-cols-[1fr_84px_58px] gap-1 items-baseline py-1 bg-primary text-primary-foreground">
                <span className="text-xs font-semibold uppercase tracking-wide pl-1">Total</span>
                <span className="text-xs font-semibold tabular-nums text-right px-1">{formatNum(somaPastosTotal, 2)}</span>
                <span className="text-[10px] tabular-nums text-right px-1">
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
              {/* NOME editavel: esta tela e a escritora de `fazendas` no /v2 — ja
                  grava codigo_importacao e status_operacional no mesmo update. A
                  restricao anterior existia para impedir dois escritores enquanto a
                  FazendasList vivia no /v2; ela sai em PR proprio, e ate la os dois
                  gravam o mesmo campo pelo mesmo caminho, sem conflito de fonte. */}
              <div className="space-y-0.5">
                <Label className="text-[10px] font-semibold text-foreground uppercase tracking-wide">
                  Nome da Fazenda
                </Label>
                {editing ? (
                  <Input
                    value={nomeFazenda}
                    onChange={e => setNomeFazenda(e.target.value)}
                    className="h-6 text-[11px]"
                    placeholder="Ex: Faz. 3 Muchachas"
                  />
                ) : (
                  <p className="text-[11px] font-medium px-2 py-0.5 rounded bg-muted/50 min-h-[24px]">
                    {nomeFazenda || <span className="text-muted-foreground italic">—</span>}
                  </p>
                )}
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px] font-semibold text-foreground uppercase tracking-wide">
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
                <label className="text-[10px] font-semibold text-foreground uppercase tracking-wide">
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
              <Label className="text-[10px] font-semibold text-foreground uppercase tracking-wide">
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
              <Label className="text-[10px] font-semibold text-foreground uppercase tracking-wide">
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
