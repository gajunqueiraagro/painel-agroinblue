/**
 * COLHEITA DA LAVOURA — Produção › Lançar › Agricultura (AGRI-COLHEITA-TELA-01).
 *
 * ⚠ O TALHÃO É O SELETOR, NÃO A CULTURA. A FK de `agri_colheita` aponta para
 * `agri_safra_area`, que é cultura × pasto — e medido no Proto em 13/09/2026, quase toda
 * cultura tem mais de um: 2 talhões de amendoim na 24/25, 2 na 25/26, 2 de mandioca, 3 na
 * 26/27. Um seletor por cultura não teria onde pendurar a carga, e escolher "o primeiro"
 * gravaria no talhão errado sem avisar ninguém.
 * ⚠ O CONSOLIDADO É DA SAFRA INTEIRA, e o talhão aberto é só onde se lança. É assim que o
 * relatório da cooperativa fecha: o produtor entrega por carga e recebe por safra.
 * ⚠ UM SCROLLPORT SÓ, E ELE É A LISTA (A21). Seletores, consolidado, botão e cabeçalho de
 * coluna ficam fixos; rolam apenas as cargas.
 */
import { useEffect, useMemo, useState } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { useSafrasLavoura, useTalhoesDaSafra } from '@/hooks/useAreaPlantada';
import { useColheita } from '@/hooks/useColheita';
import { CargasDaArea } from '@/components/agri/CargasDaArea';
import { AnaliseProducaoModal } from '@/components/agri/AnaliseProducaoModal';
import { FaixaEntregaDireta } from '@/components/agri/FaixaEntregaDireta';
import {
  exportarEntregaDiretaXlsx, exportarEntregaDiretaPdf,
} from '@/lib/agri/exportEntregaDireta';
import { agruparCargas } from '@/components/agri/CargasEntregaDireta';
import { ehEntregaDireta } from '@/lib/agri/modeloComercial';
import { usePainelSafra } from '@/hooks/usePainelSafra';
import { ExportarColheita } from '@/components/agri/ExportarColheita';
import {
  exportarColheitaXlsx, exportarColheitaPdf, type LinhaExport,
} from '@/lib/agri/exportColheita';
import {
  LIMITE_AFLATOXINA, totaisColheita, unidadeDaCultura, type CargaForm, sacasDoPeso, pesoDasSacas,
} from '@/lib/agri/colheita';

/**
 * ⚠ SENTINELA, NÃO STRING VAZIA: `''` é o que o `Select` usa para "nada escolhido", e os dois
 * estados são diferentes — "ainda não escolhi" abre vazio, "todos" agrega. Um valor nomeado
 * também impede que um id de talhão chamado "todos" colida algum dia.
 */
const TODOS = '__todos__';

/**
 * Um número do consolidado. Sempre no mesmo lugar, mesmo quando é zero (A23).
 *
 * ⚠ SÓ A PRODUTIVIDADE ABRE DETALHE, e por isso o clique é opcional: um card que não leva a
 * lugar nenhum não deve ter cursor de mão. Sem `onAbrir`, ele continua exatamente como era.
 */
/**
 * UM CARD DA RÉGUA — PR-COLHEITA-TELA-PRINCIPAL-REORG.
 *
 * ⚠ QUATRO FAIXAS DE ALTURA FIXA, iguais em todos os cards: rótulo (reservado para DUAS linhas),
 * valor, primeira sublinha (kg) e segunda (sc/ha). É `gridTemplateRows` declarado, não
 * empilhamento livre — com empilhamento, um rótulo de uma linha sobe o número e a régua se
 * quebra entre vizinhos. "Quebra" e "Secagem" não têm sc/ha e mantêm a quarta faixa VAZIA.
 *
 * ⚠ A UNIDADE ENCOLHE, O NÚMERO NÃO — lei anti-estouro. O que estoura um card é o dígito, não a
 * unidade: uma safra de 44 mil sacas escreve "1.192.660,00" no quilo. Encolher a unidade devolve
 * largura ao número sem tirar destaque dele. `tabular-nums` em tudo, para todo dígito ocupar o
 * mesmo espaço e a régua não dançar quando o valor muda.
 * ⚠ E NADA QUEBRA LINHA: `whitespace-nowrap` nas quatro faixas. Um número partido em duas linhas
 * empurraria as sublinhas e desalinharia a régua inteira — pior do que apertado.
 */
function Metrica({ rotulo, valor, sufixo, segunda, terceira, destaque, cor, onAbrir }: {
  rotulo: string;
  valor: string;
  /** sc, kg, %, R$ — sempre menor que o número. */
  sufixo?: string;
  /** A primeira sublinha: o quilo. */
  segunda?: string;
  /** A segunda sublinha: o por-hectare. Vazia em Quebra e Secagem, com a faixa reservada. */
  terceira?: string;
  destaque?: boolean;
  cor?: string;
  onAbrir?: () => void;
}) {
  return (
    <div onClick={onAbrir}
      onKeyDown={onAbrir ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(); } } : undefined}
      tabIndex={onAbrir ? 0 : undefined}
      role={onAbrir ? 'button' : undefined}
      title={onAbrir ? 'Abrir a análise de produção da safra' : undefined}
      className={cn('grid min-w-0 rounded-md border px-2 py-1.5',
        destaque ? 'border-primary bg-primary text-primary-foreground' : 'bg-card',
        onAbrir && 'cursor-pointer transition-colors hover:border-primary hover:bg-accent/40')}
      style={{ gridTemplateRows: '20px 18px 12px 12px' }}>
      <div className={cn('overflow-hidden text-[9px] font-medium uppercase leading-[10px] tracking-wide',
        destaque ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
        {rotulo}
      </div>
      <div className={cn('self-end truncate whitespace-nowrap text-[16px] font-medium leading-none tabular-nums',
        destaque ? 'text-primary-foreground' : cor ?? 'text-foreground')}>
        {valor}
        {/* ⚠ 9px CONTRA 16px: a unidade some do caminho do dígito sem sumir da leitura. */}
        {sufixo && <span className={cn('ml-0.5 text-[9px] font-normal',
          destaque ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{sufixo}</span>}
      </div>
      <div className={cn('truncate whitespace-nowrap text-[9px] leading-none tabular-nums',
        destaque ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
        {segunda ?? ''}
      </div>
      <div className={cn('truncate whitespace-nowrap text-[9px] leading-none tabular-nums',
        destaque ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
        {terceira ?? ''}
      </div>
    </div>
  );
}

export function AgriColheitaTab() {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  const { safras } = useSafrasLavoura(clienteId);
  const [safraId, setSafraId] = useState('');
  const [culturaSel, setCulturaSel] = useState('');
  /** `TODOS` agrega os talhões da cultura; qualquer outro valor é o id de um talhão. */
  const [talhaoId, setTalhaoId] = useState(TODOS);
  const [analiseAberta, setAnaliseAberta] = useState(false);

  /* A safra mais recente abre por padrão — a lista vem em ordem cronológica crescente. */
  useEffect(() => {
    if (!safraId && safras.length > 0) setSafraId(safras[safras.length - 1].id);
  }, [safras, safraId]);

  const { talhoes } = useTalhoesDaSafra(clienteId, safraId || null);

  /**
   * AS CULTURAS DA SAFRA — o nível do meio do seletor.
   *
   * ⚠ MULTI-TALHÃO POR CULTURA É O CASO COMUM, não a exceção: medido no Proto, só a 23/24 tem
   * talhão único; 24/25 e 25/26 têm dois de amendoim, a 26/27 tem três. Escolher cultura e
   * depois talhão é a ordem em que o produtor pensa — ele colhe amendoim, não "Ind 02".
   */
  const culturasDaSafra = useMemo(
    () => Array.from(new Set(talhoes.map(t => t.cultura))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [talhoes]);

  /* Trocar de safra invalida a cultura escolhida: ela pode não existir na nova. */
  useEffect(() => {
    if (culturasDaSafra.length === 0) { setCulturaSel(''); return; }
    if (!culturasDaSafra.includes(culturaSel)) setCulturaSel(culturasDaSafra[0]);
  }, [culturasDaSafra, culturaSel]);

  const talhoesDaCultura = useMemo(
    () => talhoes.filter(t => t.cultura === culturaSel), [talhoes, culturaSel]);

  /* Trocar de cultura invalida o talhão: ele era de outra. Volta para "Todos". */
  useEffect(() => {
    if (talhaoId !== TODOS && !talhoesDaCultura.some(t => t.id === talhaoId)) setTalhaoId(TODOS);
  }, [talhoesDaCultura, talhaoId]);

  /**
   * ⚠ UMA LEITURA SÓ PARA OS DOIS: o consolidado soma a safra e a lista mostra o talhão, mas
   * ambos saem deste hook. Com duas instâncias, salvar uma carga mudaria a lista e deixaria o
   * total logo acima dela com o número velho — na mesma tela, ao mesmo tempo.
   */
  const idsDaSafra = useMemo(() => talhoes.map(t => t.id), [talhoes]);
  const { linhas, vendaPorCarga, industriaPorId, carregar, salvarCarga, excluirCarga } = useColheita(idsDaSafra);

  const talhaoSel = talhoesDaCultura.find(t => t.id === talhaoId) ?? null;
  /** Os talhões que a lista mostra: o escolhido, ou todos os da cultura. */
  const talhoesDaLista = talhaoSel ? [talhaoSel] : talhoesDaCultura;
  const idsDaLista = useMemo(() => new Set(talhoesDaLista.map(t => t.id)), [talhoesDaLista]);
  const doRecorte = useMemo(
    () => linhas.filter(l => idsDaLista.has(l.safra_area_id)), [linhas, idsDaLista]);

  /**
   * O CONSOLIDADO É DO RECORTE — o MESMO da lista (PR-AGRI-COLHEITA-CARDS-FILTRO-TALHAO).
   *
   * ⚠ ELE ERA DA CULTURA INTEIRA, E ISSO ERA DEFEITO. A lista filtrava por `idsDaLista`, que
   * respeita o talhão escolhido, e os cards somavam `idsDaCultura`, que ignora: com o Ind 02
   * selecionado a lista mostrava 14 cargas e 14.503,74 sc enquanto os cards logo acima diziam
   * 28.156 sc — os dois talhões. Duas respostas para a mesma pergunta, na mesma tela, e a de
   * cima é a que o operador lê primeiro.
   * ⚠ E A PRODUTIVIDADE ERRAVA DUAS VEZES: sacas da cultura inteira divididas pela área da
   * cultura inteira. Com um talhão filtrado, nem o numerador nem o denominador eram dele.
   * ⚠ AGORA HÁ UMA FONTE SÓ: `doRecorte` alimenta a lista E o consolidado, e a área é a dos
   * talhões que o recorte contém. "Todos os talhões" continua dando o total da cultura, porque
   * aí `talhoesDaLista` É `talhoesDaCultura` — o caso geral não precisou de exceção.
   */
  const areaDoRecorte = useMemo(
    () => talhoesDaLista.reduce((s, t) => s + t.area_plantada_ha, 0), [talhoesDaLista]);

  const totais = useMemo(() => {
    const comoForm = doRecorte.map(l => ({
      id: l.id, dataColheita: l.data_colheita ?? '', ticketBalanca: '', nfProdutor: '', filial: '',
      horaChegada: '',
      pesoVerdeKg: String(l.peso_verde_kg ?? ''), pesoSecoKg: String(l.peso_seco_kg ?? ''),
      umidadePct: '', aflatoxinaPpb: l.aflatoxina_ppb == null ? '' : String(l.aflatoxina_ppb),
      sacasBoas: String(l.sacas_boas ?? ''), graoRocaSacas: String(l.grao_roca_sacas ?? ''),
      graoRocaKg: String(l.grao_roca_kg ?? ''), rendaLiquidaPct: '',
      taxaSecagem: '', valorSecagem: String(l.valor_secagem ?? ''), observacoes: '',
    })) as CargaForm[];
    return totaisColheita(comoForm, culturaSel || null, areaDoRecorte);
  }, [doRecorte, culturaSel, areaDoRecorte]);

  /**
   * O PAINEL DA SAFRA — só na entrega direta, e é o mapa que decide.
   *
   * ⚠ A CULTURA VAI NULA NO AMENDOIM, e isso DESLIGA a consulta (`enabled: !!cultura` no hook):
   * a tela da saca estocável não ganha nem uma ida ao banco. O consolidado dela continua vindo de
   * `totaisColheita`, sobre as linhas que já estavam carregadas.
   * ⚠ E É A MESMA RPC DO DRE, de propósito: a faixa do Colheita e o DRE da Lavoura têm de dizer a
   * mesma tonelada. Somar as cargas aqui criaria um segundo número para a mesma safra.
   */
  const entregaDireta = ehEntregaDireta(culturaSel || null);
  const { painel, recarregar: recarregarPainel } = usePainelSafra(
    clienteId, safraId || null, entregaDireta ? (culturaSel || null) : null);
  /* ⚠ AS INDÚSTRIAS SE CONTAM DAS CARGAS CARREGADAS, não de uma consulta nova: `por_nf` da RPC não
     traz o comprador (o contrato é `nf, data, cargas, toneladas, rendimento_g, valor`), e este
     número é do recorte que já está na tela. */
  const nIndustrias = useMemo(
    () => new Set(doRecorte.map(l => l.industria_id).filter(Boolean)).size, [doRecorte]);

  const unidade = unidadeDaCultura(culturaSel || null);
  /**
   * ⚠ A SEGUNDA LINHA É VAZIA QUANDO NÃO HÁ CONVERSÃO, nunca zero. Soja, milho e cana não têm
   * peso de saca decidido (`kgPorSaca: null` em `colheita.ts`, de propósito): inventar "0 sc"
   * ali afirmaria uma conversão que ninguém confirmou.
   */
  /**
   * OS RÓTULOS DO CABEÇALHO DA ANÁLISE — fazenda e talhão do RECORTE.
   *
   * ⚠ SAEM DO MESMO ESTADO DOS SELETORES, não de consulta nova: `talhaoSel` é o talhão escolhido
   * (ou `null` em "Todos") e `talhoesDaCultura` é a MESMA lista cujo tamanho o seletor já
   * escreve em "Todos os talhões (N)". Dois lugares contando talhão dariam dois números.
   * ⚠ NOME, NUNCA ID — regra da casa. O `TalhaoDaSafra` já traz `pastoNome` e `fazendaNome`
   * resolvidos; o uuid não chega a esta camada.
   * ⚠ A FAZENDA RESOLVE O PLURAL em vez de escolher a primeira: o modelo permite duas fazendas
   * na mesma cultura de uma safra (o talhão pertence ao pasto, e o pasto à fazenda). Hoje não
   * acontece — medido —, mas afirmar "Faz. Pureza" sobre um recorte de duas seria mentir num
   * cabeçalho que existe para dizer de onde veio o número.
   */
  const fazendasDoRecorte = useMemo(
    () => Array.from(new Set(talhoesDaLista.map(t => t.fazendaNome).filter(Boolean))) as string[],
    [talhoesDaLista]);
  const fazendaRotulo = fazendasDoRecorte.length === 1 ? fazendasDoRecorte[0]
    : fazendasDoRecorte.length > 1 ? `${fazendasDoRecorte.length} fazendas`
      : undefined;
  const talhaoRotulo = talhaoSel ? `Talhão ${talhaoSel.pastoNome}`
    : talhoesDaCultura.length > 0 ? `Todos os talhões (${talhoesDaCultura.length})`
      : undefined;

  /* ⚠ O sc/ha SAI DO MESMO `sacas ÷ área` que produz 138,07 e 127,83 — nenhum cálculo novo. */
  const scHa = (sacas: number | null) => (sacas != null && areaDoRecorte > 0
    ? `${formatNum(sacas / areaDoRecorte, 2)} ${unidade.unidadeProdutividade}` : undefined);
  /** A água que saiu na secagem, em sacas — o verde menos o que sobrou de bom. */
  const aguaEmSacas = totais.verdeEmSacas != null && totais.secoKg > 0
    ? totais.verdeEmSacas - totais.sacasBoas : null;
  const emKg = (sacas: number) => {
    const kg = pesoDasSacas(sacas, culturaSel || null);
    return kg == null ? undefined : `${formatNum(kg, 2)} kg`;
  };
  const safraLabel = safras.find(s => s.id === safraId);

  /**
   * O QUE VAI PARA O ARQUIVO — o recorte da tela, resolvido para nomes.
   *
   * ⚠ AS MESMAS LINHAS E O MESMO `totais` QUE A TELA MOSTRA. O export não busca nada: se
   * buscasse, o papel poderia divergir do que está à vista, e ninguém confere um PDF contra a
   * tela antes de levá-lo para a cooperativa.
   */
  const linhasParaExport: LinhaExport[] = useMemo(() => {
    const nome = new Map(talhoesDaLista.map(t => [t.id, t.pastoNome]));
    const faz = new Map(talhoesDaLista.map(t => [t.id, t.fazendaCodigo || '']));
    /* ⚠ O TERCEIRO MAPA, PELA MESMA CHAVE: `safra_area_id` é a área EXATA da carga, e é o que
       distingue OL3 de BRS 421 dentro do mesmo Ind 01. O papel herda o elo da tela inteiro. */
    const cultivar = new Map(talhoesDaLista.map(t => [t.id, t.variedade || '']));
    return doRecorte.map(l => ({
      fazenda: faz.get(l.safra_area_id) || '',
      talhao: nome.get(l.safra_area_id) || '',
      variedade: cultivar.get(l.safra_area_id) || '',
      data: l.data_colheita ?? '',
      hora: (l.hora_chegada ?? '').slice(0, 5),
      ticket: l.ticket_balanca ?? '',
      nf: l.nf_produtor ?? '',
      pesoFazendaKg: l.peso_fazenda_kg,
      verdeKg: l.peso_verde_kg,
      secoKg: l.peso_seco_kg,
      umidadePct: l.umidade_pct,
      aflatoxinaPpb: l.aflatoxina_ppb,
      sacasBoas: l.sacas_boas,
      graoRocaSacas: l.grao_roca_sacas,
    }));
  }, [doRecorte, talhoesDaLista]);

  const exportar = async (formato: 'xlsx' | 'pdf', comAnalise: boolean) => {
    const ctx = {
      cliente: clienteAtual?.nome ?? '—',
      safra: safraLabel?.codigo || safraLabel?.nome || '',
      cultura: culturaSel,
      talhao: talhaoSel ? talhaoSel.pastoNome : 'Todos os talhões',
      /* A área do RECORTE: do talhão aberto, ou a soma dos da cultura em "Todos". */
      areaHa: areaDoRecorte || null,
      comAnalise,
    };
    /**
     * ⚠ DOIS RELATÓRIOS, UMA ESCOLHA — e ela é do MAPA, como tudo nesta frente. O documento da
     * entrega direta não é o da saca com colunas escondidas: são outras perguntas (tonelada,
     * rendimento em amido, nota da indústria) e uma LINHA POR CARGA, não por metade de talhão.
     * ⚠ O PAPEL LÊ AS MESMAS FONTES DA TELA: `painel.entrega` e a MESMA `agruparCargas` que a
     * lista monta. Buscar de novo aqui deixaria o PDF livre para divergir do que está à vista.
     */
    if (entregaDireta && painel?.entrega) {
      const cargas = agruparCargas(
        doRecorte, vendaPorCarga, industriaPorId,
        new Map(talhoesDaLista.map(t => [t.id, t.pastoNome])),
        new Map(talhoesDaLista.map(t => [t.id, t.fazendaCodigo || ''])),
      );
      /* ⚠ A PRODUTIVIDADE VAI JUNTO, vinda da RPC — o papel mostra o MESMO t/ha da faixa da tela,
         nunca um recalculado sobre a área do recorte. */
      if (formato === 'xlsx') exportarEntregaDiretaXlsx(cargas, painel.entrega, ctx, painel.sacas_ha);
      else await exportarEntregaDiretaPdf(cargas, painel.entrega, ctx, painel.sacas_ha);
      return;
    }
    if (formato === 'xlsx') exportarColheitaXlsx(linhasParaExport, totais, ctx);
    else await exportarColheitaPdf(linhasParaExport, totais, ctx);
  };

  return (
    /* `h-[calc(100vh-...)]` não: a altura vem do pai do shell, e `min-h-0` é o que deixa a
       lista encolher e rolar em vez de empurrar a página. */
    <div className="flex h-full min-h-0 w-full flex-col gap-2 p-4 pb-4 animate-fade-in">
      {/* ── FIXO: identidade e seletores ── */}
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Colheita</h2>
          <p className="text-xs text-muted-foreground">{clienteAtual?.nome ?? '—'}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-[170px]">
            <Label className="text-[10px]">Safra</Label>
            <Select value={safraId} onValueChange={setSafraId}>
              <SelectTrigger className="mt-0.5 h-8 text-[12px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {safras.map(s => (
                  <SelectItem key={s.id} value={s.id} className="text-[12px]">{s.codigo || s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* ⚠ TRÊS NÍVEIS, NA ORDEM EM QUE O PRODUTOR PENSA: ele colhe amendoim numa safra, e
              só depois lembra em que pasto. Medido no Proto, multi-talhão por cultura é o caso
              COMUM — só a 23/24 tem talhão único —, então o nível do meio não é enfeite. */}
          <div className="w-[150px]">
            <Label className="text-[10px]">Cultura</Label>
            <Select value={culturaSel} onValueChange={setCulturaSel} disabled={culturasDaSafra.length === 0}>
              <SelectTrigger className="mt-0.5 h-8 text-[12px]">
                <SelectValue placeholder={culturasDaSafra.length === 0 ? 'Safra sem área' : 'Selecione'} />
              </SelectTrigger>
              <SelectContent>
                {culturasDaSafra.map(c => (
                  <SelectItem key={c} value={c} className="text-[12px]">{labelDaCultura(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[230px]">
            <Label className="text-[10px]">Talhão</Label>
            <Select value={talhaoId} onValueChange={setTalhaoId} disabled={talhoesDaCultura.length === 0}>
              <SelectTrigger className="mt-0.5 h-8 text-[12px]">
                <SelectValue placeholder={talhoesDaCultura.length === 0 ? 'Cultura sem talhão' : 'Selecione'} />
              </SelectTrigger>
              <SelectContent>
                {/* ⚠ "TODOS" NO TOPO, e é o padrão ao entrar: a pergunta que o produtor faz
                    primeiro é sobre a cultura inteira; o talhão é o detalhe de quem vai lançar. */}
                <SelectItem value={TODOS} className="text-[12px]">
                  Todos os talhões{talhoesDaCultura.length > 0 && ` (${talhoesDaCultura.length})`}
                </SelectItem>
                {talhoesDaCultura.map(t => (
                  <SelectItem key={t.id} value={t.id} className="text-[12px]">
                    {t.pastoNome} · {formatNum(t.area_plantada_ha, 2)} ha
                    {t.status === 'abertura' && ' (abertura)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* ⚠ O BOTÃO FICA SEMPRE, mesmo sem carga: desabilitado e com o motivo escrito. Um
              "Exportar" que some conforme o dado faz procurar um botão que se jura ter visto —
              é o defeito que o `ExportMenu` do Financeiro já pagou. */}
          <ExportarColheita
            desabilitado={linhasParaExport.length === 0}
            motivo={linhasParaExport.length === 0 ? 'sem carga para exportar' : undefined}
            onExportar={exportar} />
        </div>
      </div>

      {/* ── FIXO: o consolidado da safra ── */}
      {/* ⚠ DUAS GRAMÁTICAS, UMA ESCOLHA — a mesma do `CargasDaArea`, e pelo MAPA. A faixa da saca
          conta verde → seco → sacas boas → roça → quebra → secagem; a da entrega direta conta
          tonelada → rendimento → preço → serviços → receita. Não são a mesma faixa com campos
          diferentes: são perguntas diferentes, e tecer condicionais nos seis cards produziria
          cards que não sabem de quem são. */}
      <div className="shrink-0 space-y-1.5">
        {entregaDireta ? (
          <FaixaEntregaDireta entrega={painel?.entrega ?? null}
            produtividade={painel?.sacas_ha ?? null} nIndustrias={nIndustrias}
            onAbrirAnalise={() => setAnaliseAberta(true)} />
        ) : (
        <>
        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-6">
          {/* ⚠ SEIS CARDS, UMA LINHA, RÉGUA BATIDA — espelha a matriz do modal (c90915fb).
              ⚠ "PESO SECO" SAIU: mostrava as mesmas sacas de "Sacas boas" e o fluxo caía verde →
              seco e depois SUBIA para o final aproveitado. E o card avulso de PRODUTIVIDADE saiu
              também: o sc/ha virou a quarta faixa DE CADA card, que é onde ele se compara com o
              vizinho em vez de flutuar sozinho no fim da linha.
              ⚠ A CONVERSÃO USA `sacasDoPeso`/`pesoDasSacas`, que leem o kg por saca da CULTURA —
              25 kg no amendoim, e `null` em quem não tem saca (aí a faixa fica vazia, não zero). */}
          <Metrica rotulo="Peso verde"
            valor={totais.verdeEmSacas != null ? formatNum(totais.verdeEmSacas, 2) : '—'} sufixo="sc"
            segunda={`${formatNum(totais.verdeKg, 2)} kg`}
            terceira={scHa(totais.verdeEmSacas)} />
          <Metrica rotulo="Final aproveitado" destaque
            valor={formatNum(totais.sacasFinais, 2)} sufixo="sc"
            segunda={emKg(totais.sacasFinais)}
            terceira={totais.produtividadeFinal != null
              ? `${formatNum(totais.produtividadeFinal, 2)} ${unidade.unidadeProdutividade}` : undefined}
            onAbrir={() => setAnaliseAberta(true)} />
          <Metrica rotulo="Sacas boas"
            valor={formatNum(totais.sacasBoas, 2)} sufixo="sc"
            segunda={emKg(totais.sacasBoas)}
            terceira={totais.produtividade != null
              ? `${formatNum(totais.produtividade, 2)} ${unidade.unidadeProdutividade}` : undefined} />
          {/* ⚠ VERMELHO NOS DOIS ANDARES: a roça é receita, mas é o número que se quer ver cair. */}
          <Metrica rotulo="Grão de roça" cor="text-destructive"
            valor={formatNum(totais.graoRocaSacas, 2)} sufixo="sc"
            segunda={emKg(totais.graoRocaSacas)}
            terceira={scHa(totais.graoRocaSacas)} />
          {/* ⚠ A ÁGUA EM SACAS, como no modal: o resto da tela conta em sacas, e só esta linha
              falava em quilo. A quarta faixa fica VAZIA e reservada — nada sobe. */}
          <Metrica rotulo="Quebra" cor="text-destructive"
            valor={totais.quebraPct != null ? formatNum(totais.quebraPct, 1) : '—'}
            sufixo={totais.quebraPct != null ? '%' : undefined}
            segunda={aguaEmSacas != null ? `${formatNum(aguaEmSacas, 2)} sc de água` : undefined} />
          {/* ⚠ CUSTO QUE AINDA NÃO É LANÇAMENTO: a secagem aparece para o produtor conferir
              contra o romaneio, e não entra no DRE — ver PR-COLHEITA-SECAGEM-FINANCEIRO. */}
          <Metrica rotulo="Secagem" cor="text-destructive"
            valor={totais.valorSecagem > 0 ? formatNum(totais.valorSecagem, 2) : '—'}
            sufixo={totais.valorSecagem > 0 ? 'R$' : undefined}
            segunda="custo · à indústria" />
        </div>
        {/* ⚠ A FAIXA VEM DO ppb DE CADA CARGA, e o grão de roça fica FORA das duas: ele já é
            refugo, e somá-lo a qualquer faixa faria o lote bom parecer maior do que a
            cooperativa vai pagar. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border bg-muted/30 px-2.5 py-1.5 text-[11px]">
          <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            Classificação
          </span>
          <span className="text-muted-foreground">
            até {LIMITE_AFLATOXINA} ppb: <b className="tabular-nums text-success">{formatNum(totais.sacasAteLimite, 2)} sc</b>
          </span>
          {/* ⚠ VERMELHO ONDE O GRÃO NÃO VALE O PREÇO CHEIO — acima do corte e roça. O verde da
              primeira faixa e o vermelho destas duas saem do MESMO `LIMITE_AFLATOXINA` que
              separa as sacas; se o corte mudar, a cor e a conta mudam juntas. */}
          <span className="text-muted-foreground">
            acima de {LIMITE_AFLATOXINA} ppb: <b className="tabular-nums text-destructive">{formatNum(totais.sacasAcimaLimite, 2)} sc</b>
          </span>
          <span className="text-muted-foreground">
            grão de roça: <b className="tabular-nums text-destructive">{formatNum(totais.graoRocaSacas, 2)} sc</b>
            {totais.graoRocaKg > 0 && <span className="text-destructive"> ({formatNum(totais.graoRocaKg, 2)} kg)</span>}
          </span>
          {/* ⚠ SEM ppb NÃO É "ATÉ 20": a carga que ainda não voltou do laudo aparece à parte,
              porque somá-la ao lote bom venderia um número que não existe. */}
          {totais.sacasSemClasse > 0 && (
            <span className="text-amber-700 dark:text-amber-400">
              sem laudo: <b className="tabular-nums">{formatNum(totais.sacasSemClasse, 2)} sc</b>
            </span>
          )}
          <div className="flex-1" />
          {/* ⚠ A LINHA DIZ O QUE CONTA — item 3a. "Amendoim · 60,60 ha · 10 cargas" sozinho não
              informa se são as cargas da safra, do talhão ou do filtro; o rótulo responde antes
              de o operador perguntar. */}
          <span className="text-[10px] text-muted-foreground">
            <span className="mr-1 font-semibold uppercase tracking-wide">Cargas colhidas:</span>
            {safraLabel?.codigo || safraLabel?.nome || '—'}
            {culturaSel && ` · ${labelDaCultura(culturaSel)}`}
            {' · '}{totais.cargas} {totais.cargas === 1 ? 'carga' : 'cargas'}
            {/* ⚠ CONTA OS TALHÕES DO RECORTE, não os da cultura: com o Ind 02 filtrado a linha
                dizia "2 talhões" ao lado de números de um só. */}
            {talhoesDaLista.length > 1 && ` · ${talhoesDaLista.length} talhões`}
            {talhaoSel && ` · ${talhaoSel.pastoNome}`}
          </span>
        </div>
        </>
        )}
      </div>

      {/* ⚠ O PAINEL LÊ O MESMO `totais` DA FAIXA ACIMA — não um segundo cálculo. Se algum dia
          divergirem, é porque alguém somou de novo em algum lugar.
          ⚠ A ÁREA É A REAL CADASTRADA (60,6 e não 61): é ela que divide as duas
          produtividades, e arredondar aqui mudaria o índice na terceira casa. */}
      <AnaliseProducaoModal
        aberto={analiseAberta}
        onFechar={() => setAnaliseAberta(false)}
        totais={totais}
        cultura={culturaSel || null}
        areaHa={areaDoRecorte || null}
        safraRotulo={safraLabel?.codigo || safraLabel?.nome || ''}
        fazendaRotulo={fazendaRotulo}
        talhaoRotulo={talhaoRotulo}
        /* ⚠ SÓ NA ENTREGA DIRETA: `entrega` nulo deixa o modal exatamente como era. */
        entrega={entregaDireta ? (painel?.entrega ?? null) : null}
        produtividadeEntrega={painel?.sacas_ha ?? null}
        talhoesEntrega={painel?.talhoes ?? []}
      />

      {/* ── ROLA: as cargas do recorte ── */}
      {talhoesDaLista.length > 0 ? (
        <CargasDaArea
          /* ⚠ A CHAVE É O RECORTE INTEIRO: trocar de talhão ou entrar em "Todos" recomeça a
             lista — e com ela a ordenação, que é do recorte anterior. */
          key={`${culturaSel}-${talhaoId}`}
          clienteId={clienteId}
          talhoes={talhoesDaLista}
          /* ⚠ O UNIVERSO É A CULTURA: a lista mostra o recorte, mas a carga pode ser movida
             para qualquer talhão da mesma cultura — inclusive um que não está na tela. */
          talhoesDaCultura={talhoesDaCultura}
          talhaoDestino={talhaoSel}
          cultura={culturaSel}
          rotuloTotal={talhaoSel ? 'Total do talhão' : 'Total da cultura'}
          safraRotulo={safraLabel?.codigo || safraLabel?.nome || ''}
          linhas={doRecorte}
          vendaPorCarga={vendaPorCarga}
          industriaPorId={industriaPorId}
          rendimentoMedioG={painel?.entrega?.rendimento_medio_g ?? null}
          /* ⚠ AS DUAS LEITURAS SE RECARREGAM JUNTAS: a RPC de carga mexe na colheita E nos
             lançamentos, então a lista e a faixa mudam no mesmo gesto. Recarregar só uma deixaria
             o rodapé discordando do total logo acima dele. */
          aoGravarCarga={() => { void carregar(); recarregarPainel(); }}
          salvarCarga={salvarCarga}
          excluirCarga={excluirCarga}
        />
      ) : (
        <div className="rounded-md border border-dashed p-6 text-center text-[12px] text-muted-foreground">
          Esta safra ainda não tem área cadastrada — cadastre a área plantada antes de lançar a colheita.
        </div>
      )}
    </div>
  );
}
