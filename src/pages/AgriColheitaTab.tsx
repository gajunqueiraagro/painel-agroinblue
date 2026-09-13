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
import {
  LIMITE_AFLATOXINA, totaisColheita, unidadeDaCultura, type CargaForm,
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
function Metrica({ rotulo, valor, sufixo, destaque, onAbrir }: {
  rotulo: string; valor: string; sufixo?: string; destaque?: boolean; onAbrir?: () => void;
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
        destaque ? 'text-[16px] font-medium text-foreground' : 'text-[13px] text-foreground')}>
        {valor}{sufixo && <span className="ml-0.5 text-[10px] text-muted-foreground">{sufixo}</span>}
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
   * O CONSOLIDADO É DA CULTURA — mudou no PR-POR-CULTURA-11.
   *
   * ⚠ ANTES ELE ERA DA SAFRA, e por isso a produtividade ficava em branco sempre que a safra
   * tinha duas culturas — que é o caso da 25/26. Com a cultura no seletor, o recorte tem uma
   * unidade só: as sacas por hectare voltam a significar alguma coisa, e a área é a SOMA dos
   * talhões daquela cultura (24/25 amendoim = 186,5 ha), não a da safra inteira.
   */
  const areaDaCultura = useMemo(
    () => talhoesDaCultura.reduce((s, t) => s + t.area_plantada_ha, 0), [talhoesDaCultura]);
  const idsDaCultura = useMemo(
    () => new Set(talhoesDaCultura.map(t => t.id)), [talhoesDaCultura]);

  const totais = useMemo(() => {
    const comoForm = linhas.filter(l => idsDaCultura.has(l.safra_area_id)).map(l => ({
      id: l.id, dataColheita: l.data_colheita ?? '', ticketBalanca: '', nfProdutor: '', filial: '',
      horaChegada: '',
      pesoVerdeKg: String(l.peso_verde_kg ?? ''), pesoSecoKg: String(l.peso_seco_kg ?? ''),
      umidadePct: '', aflatoxinaPpb: l.aflatoxina_ppb == null ? '' : String(l.aflatoxina_ppb),
      sacasBoas: String(l.sacas_boas ?? ''), graoRocaSacas: String(l.grao_roca_sacas ?? ''),
      graoRocaKg: String(l.grao_roca_kg ?? ''), rendaLiquidaPct: '',
      taxaSecagem: '', valorSecagem: String(l.valor_secagem ?? ''), observacoes: '',
    })) as CargaForm[];
    return totaisColheita(comoForm, culturaSel || null, areaDaCultura);
  }, [linhas, idsDaCultura, culturaSel, areaDaCultura]);

  const unidade = unidadeDaCultura(culturaSel || null);
  const safraLabel = safras.find(s => s.id === safraId);

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
        </div>
      </div>

      {/* ── FIXO: o consolidado da safra ── */}
      <div className="shrink-0 space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-6">
          <Metrica rotulo="Peso verde" valor={formatNum(totais.verdeKg, 2)} sufixo="kg" destaque />
          <Metrica rotulo="Peso seco" valor={totais.secoKg > 0 ? formatNum(totais.secoKg, 2) : '—'} sufixo={totais.secoKg > 0 ? 'kg' : undefined} destaque />
          <Metrica rotulo="Sacas boas" valor={formatNum(totais.sacasBoas, 2)} sufixo="sc" destaque />
          <Metrica rotulo="Quebra" valor={totais.quebraPct != null ? formatNum(totais.quebraPct, 1) : '—'} sufixo={totais.quebraPct != null ? '%' : undefined} />
          {/* ⚠ CUSTO QUE AINDA NÃO É LANÇAMENTO: a secagem aparece para o produtor conferir
              contra o romaneio, e não entra no DRE — ver PR-COLHEITA-SECAGEM-FINANCEIRO. */}
          <Metrica rotulo="Secagem"
            valor={totais.valorSecagem > 0 ? `R$ ${formatNum(totais.valorSecagem, 2)}` : '—'} />
          {/* ⚠ "LÍQUIDA" NO RÓTULO, e não é detalhe: este número é só de SACAS BOAS. A
              produtividade FINAL — boas mais grão de roça — é outra, maior, e é a que o
              produtor usa para comparar talhão. Sem a palavra, as duas se confundem, e a
              diferença é o refugo inteiro da safra. */}
          <Metrica rotulo="Produtividade"
            valor={totais.produtividade != null ? formatNum(totais.produtividade, 2) : '—'}
            sufixo={totais.produtividade != null ? `${unidade.unidadeProdutividade} líquida` : undefined}
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
          <span className="text-[10px] text-muted-foreground">
            {safraLabel?.codigo || safraLabel?.nome || '—'}
            {culturaSel && ` · ${labelDaCultura(culturaSel)}`}
            {' · '}{totais.cargas} {totais.cargas === 1 ? 'carga' : 'cargas'}
            {talhoesDaCultura.length > 1 && ` · ${talhoesDaCultura.length} talhões`}
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
        areaHa={areaDaCultura || null}
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
