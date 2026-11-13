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
import { Save, ArrowLeft, Plus } from 'lucide-react';
import { Segmentado } from '@/components/ui/segmentado';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { BlocoFormulario, Rotulo, REGUA_CAMPO } from '@/components/ui/bloco-formulario';
import { BlocoArea, BlocoHistorico, BlocoResumoDeHoje, FaixaDePendencias, type LinhaDoUso } from '@/components/fazendas/BlocosDoCadastro';
import { useResumoDaFazenda } from '@/hooks/useResumoDaFazenda';
import { camposQueMudaram, ehUf, emUsoDesde, mesAnoBR, UFS } from '@/lib/fazendas/cadastroDaFazenda';
import { isPastoAtivoNoMes } from '@/hooks/usePastos';
import { PastosTab } from '@/pages/PastosTab';
import { agruparPastosPorFamilia } from '@/lib/pastos/agruparPorFamilia';
import { formatarAreaBR, parseAreaBR } from '@/lib/areaBR';
import { FazendasList } from '@/components/FazendasList';
import { formatNum } from '@/lib/calculos/formatters';
import { SaldoInicialForm } from '@/components/SaldoInicialForm';
import { useLancamentos } from '@/hooks/useLancamentos';
import { useStatusPilares } from '@/hooks/useStatusPilares';
import { ListaDeFazendas } from '@/components/fazendas/ListaDeFazendas';
import { useListaDeFazendas } from '@/hooks/useListaDeFazendas';
import { linhasDaLista, pastosDaArea, pendenciasDoCadastro, rotuloDaSituacao, totaisDaLista } from '@/lib/fazendas/listaDeFazendas';
import { fazendaAdministrativa } from '@/lib/financeiro/escopoDoSubcentro';

// 'area' virou a aba "Cadastro" (Dados + Área fundidos). A CHAVE continua 'area'
// para não mexer no default de activeTab nem nos blocos condicionais.
/* ⚠ 'rebanho' É A TERCEIRA — FAZ-ATIVIDADE-01a. O rebanho de partida da fazenda não tinha onde ser
   cadastrado: o `SaldoInicialForm` existia, gravava certo em `saldos_iniciais`, e só era montado
   por `pages/Index.tsx`, que saiu das rotas no PR-BARRA-UNICA-01a. Ficou órfão — código vivo sem
   pai, como o `ResumoPastosTab`. Ele volta aqui, ao lado de Pastos, porque é a mesma pergunta:
   o que esta fazenda tem. Nenhum formulário novo foi escrito. */
type TabKey = 'area' | 'pastos' | 'rebanho';

interface CadastroRow {
  id?: string;
  municipio: string;
  estado: string;
  car: string;
  nirf: string;
  /** FAZENDA-CADASTRO-01 · F1b — a coluna já existia em `fazenda_cadastros` e não tinha tela */
  ccir: string;
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
  municipio: '', estado: '', car: '', nirf: '', ccir: '',
  area_total_ha: '', area_pecuaria_ha: '', area_agricultura_ha: '',
  area_app_ha: '', area_reserva_ha: '', area_benfeitorias_ha: '', area_outras_ha: '',
  ie: '',
  status_operacional: 'ativa',
  roteiro: '',
  matricula_conferida_em: '',
};

const n = (v: string) => (v.trim() === '' ? 0 : Number(v));

/** PASTO-CADASTRO-GEO-01 P2 — a ficha do pasto que a volta do Geo reabre (abre direto na aba Pastos) e a ida ao Geo */
export interface V2FazendasProps {
  fichaDoPastoParaAbrir?: string | null;
  onFichaDoPastoAberta?: () => void;
  aoAbrirPastoNoMapa?: (pastoId: string, desenhar: boolean) => void;
}
export function V2Fazendas({ fichaDoPastoParaAbrir = null, onFichaDoPastoAberta, aoAbrirPastoNoMapa }: V2FazendasProps = {}) {
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
    /* FAZENDA-CADASTRO-01: sem piquete — ele é subárea do pai, que já tem a área dele (FECH-PASTO-UNIDADE-01); somar os dois
       contava a mesma terra duas vezes (Pureza 6.471,92 × 4.650,61 ha, medido 13/11) */
    () => agruparPastosPorFamilia(pastosDaArea(pastos), mesCorrente),
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
        pastosDaArea(pastos.filter(p => p.fazenda_id === f.id)),
        mesCorrente,
      ),
    ])),
    [fazendasDoConsolidado, pastos, mesCorrente],
  );

  // Callback ref, NÃO useRef: useRef não dispara re-render quando o nó monta, e o
  // portal do PastosTab renderizaria contra null na primeira passada.
  const [hostBarra, setHostBarra] = useState<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>(fichaDoPastoParaAbrir ? 'pastos' : 'area');
  const [data, setData] = useState<CadastroRow>(EMPTY);
  /* FAZENDA-CADASTRO-01 · F1b — sem modo "Editar": a tela é o formulário. O que se LEU fica guardado; o Salvar acende só quando algo
     difere disso, e o Cancelar volta ao lido. Erro nunca vai ao toast (UX-TOAST-01 / OC-ABRIR-LENTO-01): fica ao lado do Salvar. */
  const [lido, setLido] = useState<{ data: CadastroRow; nome: string; codigo: string }>({ data: EMPTY, nome: '', codigo: '' });
  const [erroDoCadastro, setErroDoCadastro] = useState<string | null>(null);
  const [versaoDoCadastro, setVersaoDoCadastro] = useState(0);
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

  /* FAZENDA-CADASTRO-01 · F1a — a lista de fazendas (só no Global). Hook aqui em cima: nunca depois de um early return. */
  const dadosDaLista = useListaDeFazendas(clienteAtual?.id, pastos, isGlobal);
  const administrativa = useMemo(() => {
    const adm = fazendaAdministrativa(fazendas.filter(f => f.id !== '__global__'));
    return adm && !pastos.some(p => p.fazenda_id === adm.id && p.ativo !== false)
      ? { id: adm.id, nome: adm.nome, codigo: adm.codigo_importacao ?? adm.codigo ?? null } : null;
  }, [fazendas, pastos]);
  const lista = useMemo(() => {
    const linhas = linhasDaLista({
      fazendas: fazendas.filter(f => f.id !== '__global__' && f.id !== administrativa?.id)
        .map(f => ({ id: f.id, nome: f.nome, codigo: f.codigo_importacao ?? f.codigo ?? null, status: f.status_operacional ?? null })),
      cadastros: dadosDaLista.cadastros, pastos, desenhados: dadosDaLista.desenhados, fechamentos: dadosDaLista.fechamentos,
      comRebanhoInicial: dadosDaLista.comRebanhoInicial, mesRef: mesCorrente,
    });
    const pec = agrupado.familias.find(f => f.grupo === 'pecuaria')?.somaHa ?? null;
    return { linhas, totais: totaisDaLista(linhas, pec) };
  }, [fazendas, administrativa, dadosDaLista, pastos, mesCorrente, agrupado]);

  /* FAZENDA-CADASTRO-01 · F1b — o que a tela do cadastro lê além do cadastro (último fechamento, chuva, sede, desenho, histórico) */
  const resumo = useResumoDaFazenda(clienteAtual?.id, isGlobal ? null : fazendaAtual?.id, pastos, mesCorrente, versaoDoCadastro);

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
      console.error('[cadastro da fazenda] leitura', error);
      setErroDoCadastro('Não consegui ler o cadastro da fazenda. Tente de novo em instantes.');
      setLoading(false);
      return;
    }
    setErroDoCadastro(null);
    const codigoLido = (fazendaAtual as any).codigo_importacao ?? (fazendaAtual as any).codigo ?? '';
    const nomeLido = fazendaAtual.nome ?? '';
    if (row) {
      const lidoAgora: CadastroRow = {
        id: row.id,
        municipio: (row as any).municipio ?? '',
        estado: (row as any).estado ?? '',
        car: (row as any).car ?? '',
        nirf: (row as any).nirf ?? '',
        ccir: (row as any).ccir ?? '',
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
        /* Sem `as any` e sem `?? 'ativa'`: o campo agora vem tipado do contexto.
           Ausencia vira STRING VAZIA, nunca 'ativa' — era esse default silencioso
           que regravava 'ativa' por cima de 'inativa' a cada save. */
        status_operacional: fazendaAtual.status_operacional ?? '',
        roteiro: (row as any).roteiro ?? '',
        matricula_conferida_em: (row as any).matricula_conferida_em ?? '',
      };
      setData(lidoAgora);
      setLido({ data: lidoAgora, nome: nomeLido, codigo: codigoLido });
    } else {
      const novo = { ...EMPTY, status_operacional: fazendaAtual.status_operacional ?? '' };
      setData(novo);
      setLido({ data: novo, nome: nomeLido, codigo: codigoLido });
    }
    setCodigoFazenda(codigoLido);
    setNomeFazenda(nomeLido);
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
      setErroDoCadastro('Escolha o cliente e a fazenda antes de salvar.');
      return;
    }

    /* Mesma forma da regra que ja existe em FazendasList:47-51 — trim, toast e
       return antes de qualquer escrita. Restrita ao NOME de proposito: a regra
       de la e "Nome e Codigo sao obrigatorios", e o codigo aqui e OPCIONAL
       desde sempre (`codigo_importacao: codigoFazenda || null`, logo abaixo).
       Exigi-lo agora mudaria o comportamento de um campo fora do escopo. */
    if (!nomeFazenda.trim()) {
      setErroDoCadastro('Falta o nome da fazenda.');
      return;
    }
    setErroDoCadastro(null);

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
      ccir: data.ccir || null,
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
      console.error('[cadastro da fazenda] gravar cadastro', error);
      setErroDoCadastro('Não consegui gravar o cadastro. Nada mudou; tente de novo.');
      setSaving(false);
      return;
    }

    const { error: fazendaError } = await supabase
      .from('fazendas')
      /* `|| null` no status: com a leitura corrigida, string vazia so aparece se a
         coluna estiver NULL no banco (0 linhas hoje). Gravar '' inventaria um
         status que nao existe; null devolve a ausencia que se leu.
         O `as any` PERMANECE e nao e escolha: o Update gerado de `fazendas` em
         types.ts nao tem status_operacional — mesma defasagem que obrigou os dois
         casts no FazendaContext. Sai quando types.ts for regenerado. */
      .update({ nome: nomeFazenda.trim(), codigo_importacao: codigoFazenda || null, status_operacional: data.status_operacional || null } as any)
      .eq('id', fazendaAtual.id);
    if (fazendaError) {
      console.error('[cadastro da fazenda] gravar nome/código/situação', fazendaError);
      setErroDoCadastro('O cadastro foi gravado; o nome, o código e a situação não. Tente salvar de novo.');
      setSaving(false);
      return;
    }

    /* `fazendas` vive no contexto, nao em loadData — sem recarregar, o seletor
       lateral e o proprio cabecalho desta tela seguiriam no nome antigo ate um
       refresh. Mesmo gesto do handleUpdate da FazendasList:70. */
    await reloadFazendas();

    toast.success('Cadastro salvo.');
    await loadData();
    setVersaoDoCadastro(v => v + 1);
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
            <h2 className="text-sm font-bold text-foreground">Fazendas e pastos</h2>
            <p className="text-[10px] text-muted-foreground">
              {lista.totais.fazendas} fazenda{lista.totais.fazendas === 1 ? '' : 's'} · {lista.totais.ativas} ativa{lista.totais.ativas === 1 ? '' : 's'} · clique na fazenda para abrir o cadastro
            </p>
          </div>
          <Dialog open={novaOpen} onOpenChange={(o) => { setNovaOpen(o); if (!o) { setNovaNome(''); setNovaCodigo(''); } }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs shrink-0">
                <Plus className="h-3 w-3 mr-1" /> Fazenda
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

        <div className="mb-4">
          <ListaDeFazendas linhas={lista.linhas} totais={lista.totais} administrativa={administrativa} erro={dadosDaLista.erro}
            carregando={dadosDaLista.carregando} onAbrir={id => { const f = fazendas.find(x => x.id === id); if (f) setFazendaAtual(f); }} />
        </div>

        {/* a composição de hoje, embaixo (P1): mesma tabela, sem coluna de % (D1) e com as famílias zeradas (D2) */}
        <p className="mb-1 text-[11px] font-semibold text-foreground">
          Composição da área por fazenda <span className="font-normal text-muted-foreground">· ha · clique no nome de uma coluna para entrar nela</span>
        </p>
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

        {/* FAZENDA-CADASTRO-01 · F1a: a fazenda sem pasto deixou de ser só um NOME aqui embaixo — virou LINHA da tabela de fazendas (com
            "—" na área, nunca zero), e a unidade administrativa tem a linha à parte dela. No pivô ela continua sem coluna (e821e4ab). */}
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

  /* FAZENDA-CADASTRO-01 · F1b — os contadores das abas: pastos VIGENTES no mês, sem piquete e sem a Divergência (D6), e as cabeças da partida */
  const pastosVigentes = pastosDaArea(pastos).filter(p => p.fazenda_id === fazendaAtual.id && isPastoAtivoNoMes(p, mesCorrente)
    && p.tipo_uso !== 'divergencia').length;
  const TABS: { key: TabKey; label: string }[] = [
    { key: 'area', label: 'Cadastro' },
    { key: 'pastos', label: `Pastos ${pastosVigentes}` },
    { key: 'rebanho', label: resumo.partida ? `Rebanho inicial ${formatNum(resumo.partida.cabecas, 0)} cab` : 'Rebanho inicial' },
  ];

  // ── Derivação por família/destino ───────────────────────────────────────────
  // familias[].tipos[] traz `.pastos`, não `.somaHa` — o módulo devolve a forma
  // canônica e a tela soma do lado dela, como o próprio comentário dele autoriza.
  const somaPastosTotal = agrupado.familias.reduce((acc, f) => acc + f.somaHa, 0);
  /* "Uso da área": família sobre o total, destino sobre a própria família (D3); família com 0,00 continua aparecendo — é informação (D2) */
  const FAMILIAS_DO_CADASTRO: [string, string][] = [
    ['pecuaria', 'Pecuária'], ['agricultura', 'Agricultura'], ['silvicultura', 'Silvicultura'], ['ambiental', 'Ambiental'], ['infraestrutura', 'Infraestrutura'],
  ];
  const usoDaArea: LinhaDoUso[] = FAMILIAS_DO_CADASTRO.flatMap(([grupo, rotulo]) => {
    const fam = agrupado.familias.find(f => f.grupo === grupo);
    const somaFam = fam?.somaHa ?? 0;
    const tipos = fam?.tipos ?? [];
    return [
      { rotulo, ha: somaFam, base: somaPastosTotal, pastos: tipos.reduce((s, t) => s + t.pastos.length, 0) },
      ...tipos.map(t => ({ rotulo: t.label, ha: t.pastos.reduce((acc, p) => acc + (p.area_produtiva_ha ?? 0), 0), base: somaFam, pastos: t.pastos.length,
        destino: true })),
    ];
  });
  const totalDePastosNoUso = usoDaArea.filter(l => !l.destino).reduce((s, l) => s + l.pastos, 0);
  const matriculaHa = parseAreaBR(data.area_total_ha);
  const matriculaConferida = !!data.matricula_conferida_em;

  /* o Salvar acende só com mudança; o Cancelar volta ao que se leu */
  const mudancas = [...camposQueMudaram({ ...lido.data }, { ...data }), ...(nomeFazenda !== lido.nome ? ['nome'] : []),
    ...(codigoFazenda !== lido.codigo ? ['codigo'] : [])];
  const mudou = mudancas.length > 0;
  const cancelar = () => { setData(lido.data); setNomeFazenda(lido.nome); setCodigoFazenda(lido.codigo); setErroDoCadastro(null); };
  const fraseDoSalvar = erroDoCadastro ?? (saving ? 'Gravando…' : mudou ? 'Há mudança não salva.' : 'Nada a salvar: o cadastro já está assim.');
  const pendencias = pendenciasDoCadastro(
    { id: fazendaAtual.id, nome: nomeFazenda, codigo: codigoFazenda || null, status: data.status_operacional || null },
    { fazenda_id: fazendaAtual.id, municipio: data.municipio, estado: data.estado, car: data.car, nirf: data.nirf, ie: data.ie, roteiro: data.roteiro,
      area_total_ha: matriculaHa },
    !!resumo.partida,
  );
  const desde = emUsoDesde(resumo.partida?.anoMes ?? null, pastos.filter(p => p.fazenda_id === fazendaAtual.id).map(p => p.data_inicio));
  const opcoesUf = [
    ...(data.estado && !ehUf(data.estado) ? [{ value: data.estado, label: `${data.estado} (valor inexistente)` }] : []),
    ...UFS.map(u => ({ value: u, label: u })),
  ];
  const situacaoLida = data.status_operacional || 'ativa';

  /* um campo de texto do cadastro (a régua da casa: rótulo em cima, campo de 28px) */
  const campo = (rotulo: string, key: keyof CadastroRow, testid: string) => (
    <div className="min-w-0">
      <Rotulo texto={rotulo} />
      <Input value={data[key]} onChange={e => setData(prev => ({ ...prev, [key]: e.target.value }))} className={REGUA_CAMPO}
        placeholder="não informado" data-testid={testid} />
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
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex min-w-0 items-center gap-1.5">
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
              title="Voltar à lista de fazendas"
              className="flex h-6 flex-none items-center gap-0.5 rounded px-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
              data-testid="cadastro-voltar"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Fazendas
            </button>
          )}
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
              {lido.codigo && <span className="text-muted-foreground">{lido.codigo}</span>}
              <span className="truncate" title={fazendaAtual.nome}>{fazendaAtual.nome}</span>
              <span className={`flex-none rounded px-1.5 py-px text-[9.5px] font-medium ${situacaoLida === 'ativa' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
                data-testid="cadastro-situacao-selo">
                {rotuloDaSituacao(lido.data.status_operacional || null)}
              </span>
            </h2>
            <p className="truncate text-[10px] text-muted-foreground">
              {[lido.data.municipio, lido.data.estado].filter(Boolean).join(' · ') || 'município não informado'}
              {' · '}{matriculaHa != null ? `${formatNum(matriculaHa, 2)} ha na matrícula` : 'matrícula não informada'}
            </p>
          </div>
        </div>
        {activeTab === 'area' && (
          <div className="flex flex-none items-center gap-1.5">
            <span className={`w-[300px] truncate text-right text-[10px] ${erroDoCadastro ? 'text-red-700' : 'text-muted-foreground'}`} title={fraseDoSalvar}
              data-testid="cadastro-frase-salvar">
              {fraseDoSalvar}
            </span>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={cancelar} disabled={!mudou || saving} data-testid="cadastro-cancelar">
              Cancelar
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={!mudou || saving} data-testid="cadastro-salvar">
              <Save className="h-3 w-3 mr-1" /> {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-end justify-between gap-4 mb-3 border-b border-border">
        <div className="flex gap-0.5">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                activeTab === t.key
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              data-testid={`cadastro-aba-${t.key}`}
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
        <div data-testid="cadastro-da-fazenda">
          <FaixaDePendencias pendencias={pendencias} />
          {resumo.erro && <p className="mb-1 text-[10px] text-red-700" data-testid="cadastro-erro-leitura">{resumo.erro}</p>}
          <div className="grid grid-cols-2 gap-3 items-start">
            {/* ── ESQUERDA — o que se digita ─────────────────────────────────────── */}
            <div className="space-y-2">
              <BlocoFormulario titulo="Identificação" testId="cadastro-identificacao">
                <div className="grid grid-cols-[1fr_110px] gap-x-3 gap-y-1">
                  {/* NOME editavel: esta tela e a escritora de `fazendas` no /v2 — grava codigo_importacao e status_operacional no mesmo update. */}
                  <div className="min-w-0">
                    <Rotulo texto="Nome da fazenda" obrig />
                    <Input value={nomeFazenda} onChange={e => setNomeFazenda(e.target.value)} placeholder="Ex: Faz. 3 Muchachas" data-testid="cadastro-nome"
                      className={`${REGUA_CAMPO} ${!nomeFazenda.trim() ? 'border-red-500' : ''}`} />
                  </div>
                  <div className="min-w-0">
                    <Rotulo texto="Código" />
                    <Input value={codigoFazenda} onChange={e => setCodigoFazenda(e.target.value)} placeholder="Ex: BG, 3M" className={REGUA_CAMPO}
                      data-testid="cadastro-codigo" />
                  </div>
                </div>
                <div className="mt-1">
                  <Rotulo texto="Situação" />
                  {/* as 4 opções de hoje continuam (inventário: status com 4 opções) — Segmentado da casa, nunca seletor nativo */}
                  <Segmentado valor={data.status_operacional || 'ativa'} onEscolher={v => setData(prev => ({ ...prev, status_operacional: v }))} altura={24}
                    opcoes={[{ valor: 'ativa', rotulo: 'Ativa' }, { valor: 'inativa', rotulo: 'Inativa' }, { valor: 'arrendada', rotulo: 'Arrendada' },
                      { valor: 'suspensa', rotulo: 'Suspensa' }]} />
                </div>
                <div className="mt-1 grid grid-cols-[1fr_96px_96px] gap-x-3">
                  {campo('Município', 'municipio', 'cadastro-municipio')}
                  <div className="min-w-0">
                    <Rotulo texto="Estado" />
                    <SearchableSelect value={data.estado} onValueChange={v => setData(prev => ({ ...prev, estado: v }))} options={opcoesUf} semTodos
                      placeholder="UF" className={REGUA_CAMPO} />
                  </div>
                  <div className="min-w-0">
                    <Rotulo texto="Em uso desde" />
                    <p className="flex h-7 items-center rounded border bg-muted/40 px-2 text-[11px] tabular-nums" title="o mês de partida do rebanho; sem ele, o início mais antigo dos pastos">
                      {mesAnoBR(desde)}
                    </p>
                  </div>
                </div>
                <p className="mt-1 text-[9.5px] text-muted-foreground">O código aparece em todas as tabelas do sistema. Fazenda inativa mantém o histórico.</p>
              </BlocoFormulario>

              {/* A MATRÍCULA é documento, não derivado — terceira referência do sistema, ao lado dos pastos e do fechamento. Alterar o valor
                  limpa a conferência: número novo é número não conferido. */}
              <BlocoFormulario titulo="Matrícula" dica="área do documento; mudar a área limpa a conferência" testId="cadastro-matricula">
                <div className="grid grid-cols-[140px_1fr] items-end gap-x-3">
                  <div>
                    <Rotulo texto="Área da matrícula (ha)" />
                    <Input
                      value={data.area_total_ha}
                      onChange={e => setData(prev => ({ ...prev, area_total_ha: e.target.value, matricula_conferida_em: '' }))}
                      onBlur={e => setData(prev => ({ ...prev, area_total_ha: formatarAreaBR(parseAreaBR(e.target.value)) }))}
                      className={`${REGUA_CAMPO} text-right tabular-nums`}
                      placeholder="0,00"
                      data-testid="cadastro-matricula-area"
                    />
                  </div>
                  <div className="flex h-7 items-center">
                    {matriculaConferida ? (
                      <span className="text-[10px] text-muted-foreground">Conferida em {new Date(data.matricula_conferida_em).toLocaleDateString('pt-BR')}</span>
                    ) : (
                      /* grava no Salvar, que agora fica sempre à vista e acende com a marcação */
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] text-amber-700 border-amber-300 hover:bg-amber-50"
                        onClick={() => setData(prev => ({ ...prev, matricula_conferida_em: new Date().toISOString() }))} data-testid="cadastro-marcar-conferida">
                        Marcar como conferida
                      </Button>
                    )}
                  </div>
                </div>
              </BlocoFormulario>

              <BlocoFormulario titulo="Documentos e inscrições" testId="cadastro-documentos">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {campo('CAR', 'car', 'cadastro-car')}
                  {campo('NIRF', 'nirf', 'cadastro-nirf')}
                  {campo('CCIR', 'ccir', 'cadastro-ccir')}
                  {campo('Inscrição estadual', 'ie', 'cadastro-ie')}
                </div>
                <p className="mt-1 text-[9.5px] text-muted-foreground">Produtores e inscrições usados nas notas ficam em Cadastros › Produtores, ligados à fazenda.</p>
              </BlocoFormulario>

              <BlocoFormulario titulo="Acesso e localização" testId="cadastro-acesso">
                <div>
                  <Rotulo texto="Sede no mapa" />
                  <p className="flex h-7 items-center rounded border bg-muted/40 px-2 text-[11px] tabular-nums"
                    title="o ponto da sede desenhado no Geo pastos (latitude · longitude)" data-testid="cadastro-sede">
                    {resumo.sede?.texto ?? <span className="text-muted-foreground">sem sede marcada no mapa</span>}
                  </p>
                </div>
                <div className="mt-1">
                  <Rotulo texto="Roteiro de acesso" />
                  <textarea
                    value={data.roteiro}
                    onChange={e => setData(prev => ({ ...prev, roteiro: e.target.value }))}
                    className="h-14 w-full resize-none rounded-md border border-input bg-background px-2 py-1 text-[11px]"
                    placeholder="como chegar, para visitas, transportadoras e frigoríficos"
                    data-testid="cadastro-roteiro"
                  />
                </div>
              </BlocoFormulario>
            </div>

            {/* ── DIREITA — o que se lê ─────────────────────────────────────────── */}
            <div className="space-y-2">
              <BlocoArea matriculaHa={matriculaHa} pastosHa={somaPastosTotal} desenho={resumo.desenho} uso={usoDaArea} total={somaPastosTotal}
                totalPastos={totalDePastosNoUso}
                conferida={matriculaConferida ? new Date(data.matricula_conferida_em).toLocaleDateString('pt-BR') : null}
                acaoConferir={<span className="font-medium text-amber-700">não conferida</span>} />
              <BlocoResumoDeHoje resumo={resumo} />
              <BlocoHistorico historico={resumo.historico} />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'pastos' && <PastosTab hostBarra={hostBarra} fichaInicial={fichaDoPastoParaAbrir} onFichaInicialAberta={onFichaDoPastoAberta}
        aoAbrirPastoNoMapa={aoAbrirPastoNoMapa} />}

      {activeTab === 'rebanho' && <AbaRebanhoInicial />}

    </div>
  );
}

/**
 * O REBANHO DE PARTIDA DA FAZENDA — FAZ-ATIVIDADE-01a.
 *
 * ⚠ NENHUM FORMULÁRIO NOVO: o `SaldoInicialForm` já existia, já gravava em `saldos_iniciais` pelo
 * `setSaldoInicial` do `useLancamentos`, e estava órfão desde que `pages/Index.tsx` saiu das rotas.
 * O que faltava era um pai. Duplicar o upsert criaria a segunda dona da mesma escrita — e duas
 * cópias divergem no primeiro ajuste.
 * ⚠ A LISTA VEM ANTES DO BOTÃO porque a primeira pergunta do operador é "o que já está lá?". Vazia,
 * ela diz "—", que é ausência declarada; some, seria "não existe tela".
 */
function AbaRebanhoInicial() {
  const { fazendaAtual, isGlobal } = useFazenda();
  const { saldosIniciais, setSaldoInicial, lancamentos } = useLancamentos();

  /* ⚠ O QUE A FAZENDA JÁ TEM, por (ano, mês): o hook traz o recorte da fazenda selecionada. */
  const porPeriodo = useMemo(() => {
    const mapa = new Map<string, { ano: number; mes: number; cab: number; valor: number }>();
    for (const s of saldosIniciais) {
      const mes = s.mes || 1;
      const k = `${s.ano}-${String(mes).padStart(2, '0')}`;
      const atual = mapa.get(k) ?? { ano: s.ano, mes, cab: 0, valor: 0 };
      atual.cab += s.quantidade;
      /* ⚠ SÓ SOMA VALOR QUANDO HÁ PESO E PREÇO: sem um dos dois o produto seria zero, e zero aqui
         leria como "rebanho sem valor" em vez de "valor não informado". */
      atual.valor += (s.pesoMedioKg ?? 0) * (s.precoKg ?? 0) * s.quantidade;
      mapa.set(k, atual);
    }
    return [...mapa.values()].sort((a, b) => (a.ano - b.ano) || (a.mes - b.mes));
  }, [saldosIniciais]);

  /* ⚠ SÓ O PRIMEIRO ANO APARECE — ZOOT-CACHE-DOBRO-01, adendo 2 item 8c.
     Saldo inicial se CADASTRA uma vez, no primeiro mês da fazenda no sistema. O janeiro dos anos
     seguintes é o saldo de dezembro anterior, MATERIALIZADO por
     `propagar_saldo_inicial_pos_dezembro` — é resultado do motor, não cadastro. Listá-lo aqui
     convidava a editar o que o fechamento já decidiu, e a edição duraria até o próximo dezembro.
     ⚠ ESCONDER, NUNCA APAGAR: as linhas dos anos seguintes continuam no banco porque são elas que
       `fn_zoot_categoria_mensal` lê para abrir cada ano. Some da tela, fica no motor.
     ⚠ E O SELO PERDEU A ALTERNATIVA: com uma linha só, "abertura do ano" virou ramo inalcançável e
       saiu. Quem voltar a listar vários anos precisa dele de volta. */
  const linhasDoCadastro = porPeriodo.length > 0 ? [porPeriodo[0]] : [];

  /* REBANHO-INICIAL-EDITAR-01 (4): o formulário recebe o que precisa para a confirmação
     ("Existem N movimentações…") e o selo "Mês fechado — só preço editável" — daqui nunca apareciam.
     Mês fechado = o P1 do janeiro de partida oficial (`get_status_pilares_fechamento`, a autoridade). */
  const partida = linhasDoCadastro[0];
  const { status: pilaresDaPartida } = useStatusPilares(
    fazendaAtual?.id, partida ? `${partida.ano}-${String(partida.mes).padStart(2, '0')}` : undefined, !!partida && !isGlobal);
  const partidaFechada = pilaresDaPartida.p1_mapa_pastos.status === 'oficial';

  if (isGlobal || !fazendaAtual) {
    return (
      <div className="px-4 py-6 text-[11px] text-muted-foreground">
        Selecione uma fazenda para cadastrar o rebanho de partida.
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[12px] font-medium">Rebanho inicial · {fazendaAtual.nome}</div>
          <div className="text-[10px] text-muted-foreground">
            O rebanho de partida da fazenda, por categoria. Onde já existe fechamento do mês, o
            fechamento prevalece.
          </div>
        </div>
        <SaldoInicialForm saldosIniciais={saldosIniciais} onSetSaldo={setSaldoInicial} alwaysVisible
          totalLancamentos={lancamentos.length} mesFechado={partidaFechada} />
      </div>

      <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
        <table className="w-full border-collapse text-[11px] leading-none">
          <thead>
            <tr className="bg-[#3a4864]" style={{ height: 22 }}>
              <th className="px-[7px] text-left text-[10px] font-medium text-white">Período</th>
              <th className="px-[7px] text-right text-[10px] font-medium text-white">Cabeças</th>
              <th className="px-[7px] text-right text-[10px] font-medium text-white">Valor</th>
            </tr>
          </thead>
          <tbody>
            {linhasDoCadastro.length === 0 ? (
              <tr style={{ height: 20 }}>
                <td colSpan={3} className="px-[7px] text-center text-muted-foreground" style={{ fontSize: 10 }}>
                  —
                </td>
              </tr>
            ) : linhasDoCadastro.map(p => (
              <tr key={`${p.ano}-${p.mes}`} className="bg-card" style={{ height: 20 }}>
                <td className="px-[7px] truncate" style={{ fontSize: 11 }}>
                  {String(p.mes).padStart(2, '0')}/{p.ano}
                  <span className="ml-1 text-muted-foreground" style={{ fontSize: 9 }}>
                    · início do histórico
                  </span>
                </td>
                <td className="px-[7px] text-right tabular-nums" style={{ fontSize: 11 }}>{formatNum(p.cab, 0)}</td>
                <td className="px-[7px] text-right tabular-nums text-muted-foreground" style={{ fontSize: 10 }}>
                  {p.valor > 0 ? formatNum(p.valor, 2) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
