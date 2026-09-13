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
import {
  LIMITE_AFLATOXINA, totaisColheita, unidadeDaCultura, type CargaForm,
} from '@/lib/agri/colheita';

/** Um número do consolidado. Sempre no mesmo lugar, mesmo quando é zero (A23). */
function Metrica({ rotulo, valor, sufixo, destaque }: {
  rotulo: string; valor: string; sufixo?: string; destaque?: boolean;
}) {
  return (
    <div className="rounded-md border bg-card px-2.5 py-1.5">
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
  const [talhaoId, setTalhaoId] = useState('');

  /* A safra mais recente abre por padrão — a lista vem em ordem cronológica crescente. */
  useEffect(() => {
    if (!safraId && safras.length > 0) setSafraId(safras[safras.length - 1].id);
  }, [safras, safraId]);

  const { talhoes } = useTalhoesDaSafra(clienteId, safraId || null);

  /* Trocar de safra invalida o talhão escolhido: ele pertencia à safra anterior. */
  useEffect(() => {
    if (talhoes.length === 0) { setTalhaoId(''); return; }
    if (!talhoes.some(t => t.id === talhaoId)) setTalhaoId(talhoes[0].id);
  }, [talhoes, talhaoId]);

  /**
   * ⚠ UMA LEITURA SÓ PARA OS DOIS: o consolidado soma a safra e a lista mostra o talhão, mas
   * ambos saem deste hook. Com duas instâncias, salvar uma carga mudaria a lista e deixaria o
   * total logo acima dela com o número velho — na mesma tela, ao mesmo tempo.
   */
  const idsDaSafra = useMemo(() => talhoes.map(t => t.id), [talhoes]);
  const { linhas, salvarCarga, excluirCarga } = useColheita(idsDaSafra);

  const talhao = talhoes.find(t => t.id === talhaoId) ?? null;
  const doTalhao = useMemo(
    () => linhas.filter(l => l.safra_area_id === talhaoId),
    [linhas, talhaoId]);

  /**
   * O consolidado da safra.
   *
   * ⚠ A CULTURA E A ÁREA SÃO AS DO TALHÃO ABERTO, e isso limita a produtividade: somar
   * amendoim com mandioca numa produtividade só não significa nada. Enquanto a safra tiver
   * mais de uma cultura, o número por hectare fica em branco em vez de misturar as duas.
   */
  const culturasNaSafra = useMemo(
    () => Array.from(new Set(talhoes.map(t => t.cultura))), [talhoes]);
  const areaDaSafra = useMemo(
    () => talhoes.reduce((s, t) => s + t.area_plantada_ha, 0), [talhoes]);
  const umaCulturaSo = culturasNaSafra.length === 1;

  const totais = useMemo(() => {
    const comoForm = linhas.map(l => ({
      id: l.id, dataColheita: l.data_colheita ?? '', ticketBalanca: '', nfProdutor: '', filial: '',
      horaChegada: '',
      pesoVerdeKg: String(l.peso_verde_kg ?? ''), pesoSecoKg: String(l.peso_seco_kg ?? ''),
      umidadePct: '', aflatoxinaPpb: l.aflatoxina_ppb == null ? '' : String(l.aflatoxina_ppb),
      sacasBoas: String(l.sacas_boas ?? ''), graoRocaSacas: String(l.grao_roca_sacas ?? ''),
      graoRocaKg: String(l.grao_roca_kg ?? ''), rendaLiquidaPct: '',
      taxaSecagem: '', valorSecagem: String(l.valor_secagem ?? ''), observacoes: '',
    })) as CargaForm[];
    return totaisColheita(comoForm, umaCulturaSo ? culturasNaSafra[0] : null,
      umaCulturaSo ? areaDaSafra : null);
  }, [linhas, umaCulturaSo, culturasNaSafra, areaDaSafra]);

  const unidade = unidadeDaCultura(umaCulturaSo ? culturasNaSafra[0] : null);
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
          <div className="w-[260px]">
            <Label className="text-[10px]">Talhão</Label>
            <Select value={talhaoId} onValueChange={setTalhaoId} disabled={talhoes.length === 0}>
              <SelectTrigger className="mt-0.5 h-8 text-[12px]">
                <SelectValue placeholder={talhoes.length === 0 ? 'Safra sem área cadastrada' : 'Selecione'} />
              </SelectTrigger>
              <SelectContent>
                {talhoes.map(t => (
                  <SelectItem key={t.id} value={t.id} className="text-[12px]">
                    {labelDaCultura(t.cultura)} · {t.pastoNome} · {formatNum(t.area_plantada_ha, 2)} ha
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
            sufixo={totais.produtividade != null ? `${unidade.unidadeProdutividade} líquida` : undefined} />
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
            {safraLabel?.codigo || safraLabel?.nome || '—'} · {totais.cargas} {totais.cargas === 1 ? 'carga' : 'cargas'}
            {!umaCulturaSo && culturasNaSafra.length > 1 && ' · safra com mais de uma cultura'}
          </span>
        </div>
      </div>

      {/* ── ROLA: as cargas do talhão ── */}
      {talhao ? (
        <CargasDaArea
          key={talhao.id}
          clienteId={clienteId}
          safraAreaId={talhao.id}
          cultura={talhao.cultura}
          areaHa={talhao.area_plantada_ha}
          pastoNome={talhao.pastoNome}
          fazendaNome={talhao.fazendaNome}
          safraRotulo={safraLabel?.codigo || safraLabel?.nome || ''}
          linhas={doTalhao}
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
