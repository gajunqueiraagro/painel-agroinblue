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
 * ⚠ DUAS LINHAS ALINHADAS — Grupo 2 do LAYOUT. O peso vive em duas unidades ao mesmo tempo: o
 * romaneio vem em quilo e o acerto com a cooperativa é em saca. Mostrar só uma obrigava o
 * produtor a converter de cabeça no meio da conferência.
 * ⚠ A SEGUNDA LINHA OCUPA ALTURA SEMPRE, com ou sem conteúdo: cards com e sem conversão na mesma
 * grade teriam alturas diferentes, e a régua de cima dançaria ao trocar de safra.
 */
function Metrica({ rotulo, valor, sufixo, segunda, destaque, cor, onAbrir }: {
  rotulo: string; valor: string; sufixo?: string;
  /** A mesma grandeza na outra unidade — menor, embaixo. */
  segunda?: string;
  destaque?: boolean;
  /** Classe de cor do número principal. Secagem é custo: vermelho. */
  cor?: string;
  onAbrir?: () => void;
}) {
  return (
    <div onClick={onAbrir}
      onKeyDown={onAbrir ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(); } } : undefined}
      tabIndex={onAbrir ? 0 : undefined}
      role={onAbrir ? 'button' : undefined}
      title={onAbrir ? 'Abrir a análise de produção da safra' : undefined}
      className={cn('rounded-md border bg-card px-2.5 py-1.5',
        onAbrir && 'cursor-pointer transition-colors hover:border-primary hover:bg-accent/40')}>
      <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</div>
      <div className={cn('mt-0.5 tabular-nums leading-none',
        destaque ? 'text-[16px] font-medium' : 'text-[13px]', cor ?? 'text-foreground')}>
        {valor}{sufixo && <span className="ml-0.5 text-[10px] text-muted-foreground">{sufixo}</span>}
      </div>
      <div className="mt-0.5 min-h-[12px] text-[10px] leading-none tabular-nums text-muted-foreground">
        {segunda ?? ''}
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
  const { linhas, salvarCarga, excluirCarga } = useColheita(idsDaSafra);

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

  const unidade = unidadeDaCultura(culturaSel || null);
  /**
   * ⚠ A SEGUNDA LINHA É VAZIA QUANDO NÃO HÁ CONVERSÃO, nunca zero. Soja, milho e cana não têm
   * peso de saca decidido (`kgPorSaca: null` em `colheita.ts`, de propósito): inventar "0 sc"
   * ali afirmaria uma conversão que ninguém confirmou.
   */
  const emSacas = (kg: number, sufixo: string) => {
    const sc = sacasDoPeso(kg, culturaSel || null);
    return sc == null ? undefined : `${formatNum(sc, 2)} ${sufixo}`;
  };
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
    return doRecorte.map(l => ({
      fazenda: faz.get(l.safra_area_id) || '',
      talhao: nome.get(l.safra_area_id) || '',
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
      <div className="shrink-0 space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-6">
          {/* ⚠ KG EM CIMA, SACA EMBAIXO nos dois pesos; nas "sacas boas" o inverso, porque o
              número nativo dela é a saca. A conversão usa `sacasDoPeso`/`pesoDasSacas`, que leem
              o kg por saca da CULTURA — 25 kg no amendoim, e `null` em quem não tem saca (aí a
              segunda linha fica vazia, não zero). */}
          <Metrica rotulo="Peso verde" valor={formatNum(totais.verdeKg, 2)} sufixo="kg" destaque
            segunda={emSacas(totais.verdeKg, 'sc')} />
          <Metrica rotulo="Peso seco" valor={totais.secoKg > 0 ? formatNum(totais.secoKg, 2) : '—'}
            sufixo={totais.secoKg > 0 ? 'kg' : undefined} destaque
            segunda={emSacas(totais.secoKg, 'sc')} />
          <Metrica rotulo="Sacas boas" valor={formatNum(totais.sacasBoas, 2)} sufixo="sc" destaque
            segunda={emKg(totais.sacasBoas)} />
          <Metrica rotulo="Quebra" valor={totais.quebraPct != null ? formatNum(totais.quebraPct, 1) : '—'} sufixo={totais.quebraPct != null ? '%' : undefined} />
          {/* ⚠ CUSTO QUE AINDA NÃO É LANÇAMENTO: a secagem aparece para o produtor conferir
              contra o romaneio, e não entra no DRE — ver PR-COLHEITA-SECAGEM-FINANCEIRO. */}
          <Metrica rotulo="Secagem" cor="text-destructive"
            valor={totais.valorSecagem > 0 ? `R$ ${formatNum(totais.valorSecagem, 2)}` : '—'} />
          {/* ⚠ "LÍQUIDA" NO RÓTULO, e não é detalhe: este número é só de SACAS BOAS. A
              produtividade FINAL — boas mais grão de roça — é outra, maior, e é a que o
              produtor usa para comparar talhão. Sem a palavra, as duas se confundem, e a
              diferença é o refugo inteiro da safra. */}
          {/* ⚠ O SUFIXO DESCEU PARA A SEGUNDA LINHA: "127,83 sc/ha líquida" numa linha só fazia o
              número, que é o que se compara entre safras, dividir espaço com três palavras. */}
          <Metrica rotulo="Produtividade" destaque
            valor={totais.produtividade != null ? formatNum(totais.produtividade, 2) : '—'}
            segunda={totais.produtividade != null ? `${unidade.unidadeProdutividade} líquida` : undefined}
            onAbrir={() => setAnaliseAberta(true)} />
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
