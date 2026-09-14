/**
 * ESTOQUE DE GRÃOS — Produção › Agricultura › Estoque de Grãos (PR-ESTOQUE-GRAOS-F1).
 *
 * ⚠ A PERGUNTA É UMA SÓ: quanto grão ainda está comigo, e quanto ele vale. A colheita diz o que
 * entrou e o barter diz o que saiu; até aqui a diferença entre os dois — o que o produtor tem
 * em mãos para vender — não estava em tela nenhuma.
 * ⚠ FATIA 1 É LEITURA. Registrar saída e baixar por quebra são as fatias 2 e 3; os botões já
 * existem desabilitados porque a tela precisa mostrar, desde o primeiro dia, o que ela vai
 * saber fazer — um saldo sem saída aparente parece um número que ninguém pode mexer.
 *
 * ⚠ SAFRA + CULTURA, como o Painel da Safra. A primeira versão desta tela tinha só a safra,
 * porque a RPC não aceitava cultura e um seletor que não muda número nenhum é pior que seletor
 * nenhum; a RPC ganhou o parâmetro e o filtro veio junto.
 * ⚠ A CULTURA SAI DOS TALHÕES DAQUELA SAFRA, não de uma lista fixa: só se estoca o que se
 * plantou, e oferecer milho numa safra que só teve amendoim abriria a tela zerada sem dizer
 * por quê.
 */
import { useState, useEffect, useMemo } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Plus, TrendingDown, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { useSafrasLavoura, useTalhoesDaSafra } from '@/hooks/useAreaPlantada';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { labelDaClasse, corDaClasse } from '@/lib/agri/barterVenda';
import { useEstoqueGraos, totaisDoEstoque } from '@/hooks/useEstoqueGraos';

/**
 * ⚠ O MESMO CINZA DOS MODAIS DO BARTER (#3a4864), e de propósito: esta tela lê a mesma operação
 * que aquelas listas — o grão que entrou e o que saiu. Um azul próprio faria parecer outro
 * assunto.
 */
const TH = 'bg-[#3a4864] px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-white';

/**
 * ⚠ O CARTÃO É O DO PAINEL DA SAFRA, com a unidade miúda ao lado do número e `nowrap` — a mesma
 * lei anti-quebra: "R$" sozinho numa segunda linha é a quebra clássica destes cartões.
 */
function Cartao({ rotulo, valor, unidade, titulo, cor }: {
  rotulo: string; valor: string; unidade?: string; titulo?: string; cor?: string;
}) {
  return (
    <div className="min-w-0 rounded-md border bg-card px-2.5 py-1">
      <div className="truncate text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1 truncate whitespace-nowrap" title={titulo}>
        {unidade && (
          <span className="shrink-0 text-[11px] font-medium leading-none text-muted-foreground">
            {unidade}
          </span>
        )}
        <span className={cn('truncate text-[16px] font-medium leading-[1.1] tabular-nums', cor)}>
          {valor}
        </span>
      </div>
    </div>
  );
}

export function AgriEstoqueGraosTab() {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  const { safras } = useSafrasLavoura(clienteId);
  const [safraId, setSafraId] = useState('');

  /* A safra mais recente abre por padrão — a lista vem em ordem cronológica crescente. */
  useEffect(() => {
    if (!safraId && safras.length > 0) setSafraId(safras[safras.length - 1].id);
  }, [safras, safraId]);

  /* ⚠ AS CULTURAS SAEM DOS TALHÕES, o mesmo caminho da colheita e do Painel da Safra. */
  const { talhoes } = useTalhoesDaSafra(clienteId, safraId || null);
  const culturasDaSafra = useMemo(
    () => Array.from(new Set(talhoes.map(t => t.cultura))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [talhoes]);
  const [cultura, setCultura] = useState('');
  useEffect(() => {
    if (culturasDaSafra.length === 0) { setCultura(''); return; }
    if (!culturasDaSafra.includes(cultura)) setCultura(culturasDaSafra[0]);
  }, [culturasDaSafra, cultura]);

  const { linhas, carregando, erro } = useEstoqueGraos(clienteId, safraId || null, cultura || null);
  const t = useMemo(() => totaisDoEstoque(linhas), [linhas]);

  /* ⚠ A ORDEM DAS CLASSES É A DA QUALIDADE, não a do valor: bom, fora de faixa, refugo. É como o
     produtor pensa o lote, e é a mesma ordem das entregas do barter. */
  const ordem = ['ate_20', 'acima_20', 'roca'];
  const ordenadas = useMemo(
    () => [...linhas].sort((a, b) => ordem.indexOf(a.classe) - ordem.indexOf(b.classe)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [linhas]);

  /** ⚠ ZERO EM SACAS É DADO ("colheu e entregou tudo"); zero em DINHEIRO é ausência. */
  const dinheiro = (v: number, saldo: number) => (saldo > 0 ? formatMoeda(v) : '—');

  return (
    <div className="w-full space-y-2 p-4 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-[15px] font-bold text-foreground">Estoque de Grãos</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-[170px]">
            <Label className="text-[10px]">Safra</Label>
            <Select value={safraId} onValueChange={setSafraId}>
              <SelectTrigger className="mt-0.5 h-8 text-[12px]">
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                {safras.map(s => (
                  <SelectItem key={s.id} value={s.id} className="text-[12px]">
                    {s.codigo || s.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[150px]">
            <Label className="text-[10px]">Cultura</Label>
            <Select value={cultura} onValueChange={setCultura}
              disabled={culturasDaSafra.length === 0}>
              <SelectTrigger className="mt-0.5 h-8 text-[12px]">
                <SelectValue placeholder={culturasDaSafra.length === 0 ? 'Safra sem área' : 'Escolha'} />
              </SelectTrigger>
              <SelectContent>
                {culturasDaSafra.map(c => (
                  <SelectItem key={c} value={c} className="text-[12px]">{labelDaCultura(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ── OS TRÊS NÚMEROS DO TOPO ──
          ⚠ ELES SOMAM O MESMO ARRAY QUE A TABELA MOSTRA, nunca uma segunda consulta: é o que
          garante que o cartão e a linha de total não possam discordar. */}
      <div className="grid gap-1.5 md:grid-cols-3">
        <Cartao rotulo="Em estoque" unidade="sc" valor={formatNum(t.saldo, 2)} />
        <Cartao rotulo="Valor estimado" unidade="R$" valor={formatNum(t.valor, 2)}
          titulo={formatMoeda(t.valor)} cor="text-success" />
        {/* ⚠ O "% PARADO" NÃO GANHA COR: estoque alto não é bom nem ruim por si — depende do
            preço que o produtor está esperando. Pintá-lo de vermelho seria dar um conselho que
            a tela não tem como sustentar. */}
        <Cartao rotulo="% colhido parado" unidade="%" valor={formatNum(t.pctParado, 1)} />
      </div>

      <div className="overflow-hidden rounded-md border">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            {['24%', '14%', '14%', '12%', '13%', '10%', '13%'].map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className={cn(TH, 'text-left')}>Classe</th>
              <th className={cn(TH, 'text-right')}>Colhido</th>
              <th className={cn(TH, 'text-right')}>Entregue</th>
              <th className={cn(TH, 'text-right')}>Quebra</th>
              <th className={cn(TH, 'text-right')}>Saldo sc</th>
              <th className={cn(TH, 'text-right')}>R$ / sc</th>
              <th className={cn(TH, 'text-right')}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {/* ⚠ OS TRÊS ESTADOS SEPARADOS, a lição das listas do barter: uma falha de leitura
                renderizada como "nenhum grão" afirmaria que não há o que vender. */}
            {erro ? (
              <tr><td colSpan={7} className="px-2 py-6 text-center">
                <span className="inline-flex items-center gap-1.5 text-[11px] text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Não foi possível carregar o estoque.
                </span>
                <div className="mt-1 text-[10px] text-muted-foreground" title={erro.message}>
                  O saldo não foi lido — o dado continua no banco.
                </div>
              </td></tr>
            ) : carregando ? (
              <tr><td colSpan={7} className="px-2 py-6 text-center text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
                </span>
              </td></tr>
            ) : ordenadas.length === 0 ? (
              <tr><td colSpan={7} className="px-2 py-6 text-center text-[10px] text-muted-foreground">
                Esta cultura ainda não tem colheita lançada nesta safra.
              </td></tr>
            ) : ordenadas.map(l => (
              <tr key={l.classe} className="border-t border-slate-100">
                <td className="truncate px-2 py-0.5 text-[11px]">
                  {/* ⚠ O PONTO ACOMPANHA O RÓTULO, nunca o substitui: quem não distingue as
                      cores continua lendo "Acima de 20 ppb". A cor é a mesma da composição do
                      barter — o mesmo grão, o mesmo código visual. */}
                  <span className={cn('mr-1.5 inline-block h-2 w-2 rounded-full align-[-1px]',
                    corDaClasse(l.classe))} />
                  {labelDaClasse(l.classe)}
                </td>
                <td className="px-2 py-0.5 text-right text-[11px] tabular-nums">
                  {formatNum(l.colhido, 2)}
                </td>
                <td className="px-2 py-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
                  {formatNum(l.entregue, 2)}
                </td>
                {/* ⚠ QUEBRA É SEMPRE ZERO NESTA FATIA — a baixa por quebra é a F2. A coluna já
                    existe para a tabela não mudar de forma quando ela chegar, e o zero aqui é
                    verdade: nada foi baixado ainda. */}
                <td className="px-2 py-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
                  {formatNum(0, 2)}
                </td>
                <td className={cn('px-2 py-0.5 text-right text-[11px] font-medium tabular-nums',
                  l.saldo > 0 && 'text-success')}>
                  {formatNum(l.saldo, 2)}
                </td>
                <td className="px-2 py-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
                  {dinheiro(l.preco_ref, l.saldo)}
                </td>
                <td className="px-2 py-0.5 text-right text-[11px] font-medium tabular-nums">
                  {dinheiro(l.valor, l.saldo)}
                </td>
              </tr>
            ))}
            {ordenadas.length > 0 && !erro && !carregando && (
              <tr className="bg-[#3a4864] text-white">
                <td className="px-2 py-1 text-[11px] font-bold">Total</td>
                <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                  {formatNum(t.colhido, 2)}
                </td>
                <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                  {formatNum(t.entregue, 2)}
                </td>
                <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                  {formatNum(0, 2)}
                </td>
                <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                  {formatNum(t.saldo, 2)}
                </td>
                {/* ⚠ O TOTAL NÃO TEM R$/sc: a média de três preços de classes diferentes não é
                    um preço que alguém pratica. Vazio aqui é mais honesto que um número. */}
                <td className="px-2 py-1" />
                <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                  {t.saldo > 0 ? formatMoeda(t.valor) : '—'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ⚠ OS DOIS BOTÕES NASCEM DESABILITADOS E DIZEM POR QUÊ — a regra da OC: o motivo fica
          escrito, não só no `title`. Eles existem desde já porque um saldo sem nenhuma ação à
          vista parece um número que ninguém pode mexer, e o operador iria procurar a saída em
          outra tela. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="acao" className="h-8 gap-1 px-2 text-[11px]" disabled
          title="Em breve — o registro de saída avulsa é a próxima fatia.">
          <Plus className="h-3.5 w-3.5" /> Registrar saída (venda avulsa)
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1 px-2 text-[11px]" disabled
          title="Em breve — a baixa por quebra é a próxima fatia.">
          <TrendingDown className="h-3.5 w-3.5" /> Baixar por quebra
        </Button>
        <span className="text-[10px] text-muted-foreground">Em breve</span>
      </div>

      <p className="text-[10px] leading-snug text-muted-foreground">
        {/* ⚠ A RESSALVA DA SAFRA INTEIRA SAIU COM O FILTRO: enquanto a RPC não aceitava cultura,
            as sacas de duas culturas colhidas somavam na mesma classe e a nota tinha de avisar.
            Agora o recorte é o que o topo diz, e repetir o aviso confundiria. */}
        Saldo = Colhido − Entregue (barter/venda) − Quebra, por safra, cultura e classe.
      </p>
    </div>
  );
}
