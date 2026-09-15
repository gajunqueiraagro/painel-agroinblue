/**
 * A VENDA DO GRÃO NO BARTER — PR-AGRI-BARTER-TELA-C.
 *
 * ⚠ AS QUATRO CLASSES ESTÃO SEMPRE NA TELA, com ou sem venda. A lei do projeto é que nada muda
 * de lugar conforme o dado: linha que aparece e some conforme o operador digita faz o campo que
 * ele ia clicar andar debaixo do cursor. Classe com zero sacas simplesmente não é gravada.
 * ⚠ E CADA LINHA MOSTRA O QUE A SAFRA TEM. É a única defesa contra vender 40 mil sacas de uma
 * safra que colheu 4 mil — e ela AVISA, não trava: pode haver estoque de safra anterior na
 * cooperativa, e uma trava rígida impediria venda legítima.
 * ⚠ OS SELETORES SÃO OS DA CASA: a safra vem de `useSafrasLavoura` (a mesma lista da colheita e
 * da fatia B) e a cultura vem dos TALHÕES daquela safra — só se vende o que se plantou. O
 * plano de contas é o `PlanoSubcentroSelect`, agora com '1-Entradas', porque aqui é receita.
 */
import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { CampoMoeda, CampoNumero } from '@/components/ui/campo-moeda';
import { parseMoeda } from '@/lib/calculos/numeroBR';
import { PlanoSubcentroSelect } from '@/components/shared/PlanoSubcentroSelect';
import { Save, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { formatCasas } from '@/lib/calculos/numeroBR';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { useTalhoesDaSafra, type SafraLavoura } from '@/hooks/useAreaPlantada';
import { useColheita } from '@/hooks/useColheita';
import {
  CLASSES_VENDA, labelDaClasse, disponivelPorClasse, calcularEntregas, totaisVenda,
  deducaoPorAliquota, aliquotaDoValor, ALIQUOTA_DEDUCAO_PADRAO, subcentroSugerido, type EntregaForm,
} from '@/lib/agri/barterVenda';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import type { BarterVenda, VendaPayload } from '@/hooks/useBarterVenda';
import { NATUREZA_RECEITA } from '@/hooks/useBarterVenda';

const FOCO = 'focus-visible:ring-1 focus-visible:ring-offset-0';
const TH = 'bg-primary px-1.5 py-1 text-[9px] font-semibold text-primary-foreground';

/** O formulário nasce com as quatro classes, sempre na mesma ordem. */
const LINHAS_VAZIAS = (): EntregaForm[] =>
  CLASSES_VENDA.map(c => ({ classe: c.valor, sacas: '', precoSaca: '' }));

const hoje = () => new Date().toISOString().slice(0, 10);

export function BarterVendaModal({
  aberto, venda, clienteId, safras, classificacoes, salvando, onFechar, onSalvar,
}: {
  aberto: boolean;
  /** `null` = nova venda; preenchida = edição. */
  venda: BarterVenda | null;
  clienteId: string | null;
  safras: readonly SafraLavoura[];
  classificacoes: ClassificacaoItem[];
  salvando: boolean;
  onFechar: () => void;
  onSalvar: (payload: VendaPayload) => void;
}) {
  const [safraId, setSafraId] = useState('');
  const [cultura, setCultura] = useState('');
  const [data, setData] = useState(hoje());
  const [precificacao, setPrecificacao] = useState('fixo');
  const [linhas, setLinhas] = useState<EntregaForm[]>(LINHAS_VAZIAS);
  const [deducao, setDeducao] = useState<number | null>(null);
  /* ⚠ A ALÍQUOTA É ESTADO DE TELA, não do dado: o que se grava é o VALOR. Ela existe para
     calcular e para dizer que percentual o valor representa. */
  const [aliquota, setAliquota] = useState(String(ALIQUOTA_DEDUCAO_PADRAO).replace('.', ','));
  const [subcentro, setSubcentro] = useState('');
  const [planoId, setPlanoId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  /* ⚠ SUGESTÃO NÃO É ESCOLHA, e a tela precisa saber a diferença: só uma sugestão intocada pode
     ser trocada por outra quando a cultura muda. O que o operador escolheu fica. */
  const [contaSugerida, setContaSugerida] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setSafraId(venda?.safra_id ?? '');
    setCultura(venda?.cultura ?? '');
    setData(venda?.data_operacao ?? hoje());
    setPrecificacao(venda?.tipo_precificacao ?? 'fixo');
    setDeducao(venda?.descontos ?? null);
    /* ⚠ AO REABRIR, A % VEM DO VALOR GRAVADO — não do padrão. Mostrar 1,5% ao lado de um valor
       que é 1,7% do bruto seria o campo mentindo sobre o número ao lado dele. */
    setAliquota(String(ALIQUOTA_DEDUCAO_PADRAO).replace('.', ','));
    /* As quatro linhas sempre existem; a venda só preenche as que gravou. */
    setLinhas(LINHAS_VAZIAS().map(l => {
      const e = venda?.entregas.find(x => x.classe_aflatoxina === l.classe);
      if (!e) return l;
      /* ⚠ REABRE EM FORMATO BR COMPLETO, com milhar: `String(3706.37).replace('.', ',')` dava
         "3706,37", que é lido mas não é como o operador escreve. `formatCasas` devolve
         "3.706,37" — e `parseMoeda`, que lê o campo de volta, entende os dois (testado).
         ⚠⚠ E É `formatCasas(_, 4)`, NÃO `formatNum(_, 2)`: com duas casas, reabrir uma venda
         de 12.374,3519 sacas devolvia 12.374,35 ao CAMPO, e o próximo Salvar regravava o
         número cortado. O cálculo teria sido consertado e a segunda gravação o desfaria.
         ⚠ `formatCasas` tem MÍNIMO 2 e MÁXIMO 4, que é o que a tela quer: 12.374,35 continua
         "12.374,35" e não vira "12.374,3500". */
      return {
        classe: l.classe,
        sacas: e.sacas == null ? '' : formatCasas(e.sacas, 4),
        precoSaca: e.preco_saca == null ? '' : formatCasas(e.preco_saca, 4),
      };
    }));
    const receita = venda?.partes.find(p => p.natureza === NATUREZA_RECEITA);
    setPlanoId(receita?.plano_conta_id ?? null);
    /**
     * ⚠ A CAUSA DO "DIVIDENDOS" QUE VOLTOU TRÊS VEZES — e ela nunca esteve no filtro da lista.
     * `ClassificacaoItem.id` é OPCIONAL, e as entradas de dividendo têm `id: undefined` POR
     * DESIGN (`planoContasBuilder`: `id: i.is_dividendo ? undefined : i.id`, porque o id delas é
     * a string `dividendo-<uuid>`, que não é uuid e quebraria o save).
     * Num lançamento NOVO o `plano_conta_id` também é `undefined`. Então
     * `.find(c => c.id === undefined)` casava com a PRIMEIRA entrada de dividendo do array, e o
     * `subcentro` dela virava o valor inicial do campo — por FORA da lista filtrada, que sempre
     * esteve correta (medido três vezes: 53 contas agrícolas, zero dividendos).
     * ⚠ POR ISSO A GUARDA VEM ANTES DA BUSCA: sem id não há o que procurar, e procurar por
     * `undefined` num campo opcional acha o primeiro que não o tem.
     */
    setSubcentro(receita?.subcentro
      ?? (receita?.plano_conta_id
        ? (classificacoes.find(c => c.id === receita.plano_conta_id)?.subcentro ?? '')
        : ''));
    /* ⚠ O QUE ESTÁ GRAVADO NUNCA É SUGESTÃO — foi conferido por alguém no dia em que salvou. */
    setContaSugerida(false);
    setBusca('');
  }, [aberto, venda, classificacoes]);

  /* ── O QUE A SAFRA TEM, por classe ─────────────────────────────────────────────────── */
  const { talhoes } = useTalhoesDaSafra(clienteId, safraId || null);
  const culturasDaSafra = useMemo(
    () => Array.from(new Set(talhoes.map(t => t.cultura))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [talhoes]);
  /* Trocar de safra pode invalidar a cultura: ela pode não existir na nova. */
  useEffect(() => {
    if (culturasDaSafra.length === 0) return;
    if (!culturasDaSafra.includes(cultura)) setCultura(culturasDaSafra[0]);
  }, [culturasDaSafra, cultura]);

  const idsDaCultura = useMemo(
    () => talhoes.filter(t => t.cultura === cultura).map(t => t.id), [talhoes, cultura]);
  const { linhas: cargas } = useColheita(idsDaCultura);
  const disponivel = useMemo(() => disponivelPorClasse(cargas), [cargas]);

  /**
   * A CONTA DE RECEITA QUE A CULTURA PEDE — sugestão, nunca gravação silenciosa.
   *
   * ⚠ O FILTRO É O MESMO DO `PlanoSubcentroSelect` DESTA TELA (`1-Entradas`, escopo
   * `agricultura` obrigatório, só quem compõe o DRE). Sugerir por uma régua e listar por outra
   * poria no campo uma conta que o dropdown não mostra — e o operador não teria como voltar
   * a ela depois de trocar.
   */
  const receitasElegiveis = useMemo(
    () => classificacoes.filter(c =>
      c.tipo_operacao === '1-Entradas'
      && (c.escopo_negocio || '').trim() === 'agricultura'
      && c.compoe_dre === true
      && !!c.subcentro),
    [classificacoes]);
  const sugestaoReceita = useMemo(() => {
    const nome = subcentroSugerido(cultura, receitasElegiveis.map(c => c.subcentro));
    return nome ? (receitasElegiveis.find(c => c.subcentro === nome) ?? null) : null;
  }, [cultura, receitasElegiveis]);

  /**
   * ⚠ SÓ EM VENDA NOVA, e só por cima do vazio ou de outra sugestão. Uma venda gravada traz a
   * conta que alguém já conferiu, e trocá-la por palpite ao reabrir reclassificaria no DRE um
   * documento fechado — sem ninguém pedir.
   * ⚠ E ELE SETA O `planoId` JUNTO: o payload grava por `plano_conta_id`, e um subcentro sem
   * plano deixaria a receita meio classificada, com texto e sem chave.
   */
  useEffect(() => {
    if (!aberto || venda) return;
    /* O operador já escolheu: a sugestão não passa por cima. */
    if (subcentro !== '' && !contaSugerida) return;
    const nome = sugestaoReceita?.subcentro ?? '';
    /* ⚠ A GUARDA DE IGUALDADE É O QUE IMPEDE O LAÇO: `subcentro` está nas dependências para
       que a escolha do operador seja vista, e sem esta linha cada escrita reagendaria o efeito. */
    if (subcentro === nome) return;
    setSubcentro(nome);
    setPlanoId(sugestaoReceita?.id ?? null);
    setContaSugerida(!!sugestaoReceita);
  }, [aberto, venda, sugestaoReceita, subcentro, contaSugerida]);

  const calculadas = useMemo(() => calcularEntregas(linhas, disponivel), [linhas, disponivel]);
  const totais = useMemo(() => totaisVenda(calculadas, deducao ?? 0), [calculadas, deducao]);

  /**
   * O QUE FALTA PARA SALVAR — uma frase só, a PRIMEIRA pendência, como no `VendaGraosModal`.
   *
   * ⚠ A LISTA SAIU DE MEDIÇÃO, não do que a tela já marcava com asterisco. O banco sozinho
   * exige pouco: em `agri_operacoes_comerciais` só `cultura` é NOT NULL sem default, e
   * `safra_id` é NULÁVEL; em `agri_oc_partes` só `natureza` e `valor`. `subcentro` e
   * `plano_conta_id` da parte de receita também aceitam nulo. Ou seja: o que torna estes
   * cinco campos obrigatórios é a REGRA DO PRODUTO, não uma constraint — e por isso a trava
   * tem de morar aqui, onde se pode dizer o que falta.
   * ⚠ ANTES ISTO ERA `toast` DEPOIS DO CLIQUE, em `AgriBarterTab.gravarVenda`, e só para três
   * dos cinco. Contar o erro depois do gesto é pior que impedi-lo: o operador já acreditou que
   * salvou. Os toasts de lá continuam — são a segunda linha, para quem chamar o hook por fora.
   * ⚠ PRECIFICAÇÃO E DEDUÇÃO FICAM DE FORA, e não por esquecimento: a primeira nasce 'fixo' e
   * o Select não tem opção vazia; a segunda pode ser legitimamente zero.
   */
  const impedimento = !safraId ? 'Escolha a safra do grão.'
    : !cultura ? 'Escolha a cultura vendida.'
      : !data ? 'Informe a data da venda.'
        : !(totais.bruto > 0) ? 'Lance ao menos uma classe com sacas e preço.'
          : !subcentro ? 'Escolha a conta da receita.'
            : null;

  const mudar = (i: number, campo: 'sacas' | 'precoSaca', v: string) =>
    setLinhas(ls => ls.map((l, idx) => (idx === i ? { ...l, [campo]: v } : l)));

  const gravar = () => {
    /* ⚠ A GUARDA REPETE O BOTÃO de propósito: `disabled` é do mouse, e Enter num campo, um
       teclado ou um clique programático não passam por ele. */
    if (impedimento) return;
    const cls = classificacoes.find(c => c.id === planoId);
    onSalvar({
      cultura,
      safra_id: safraId || null,
      data_operacao: data,
      tipo_precificacao: precificacao,
      observacoes: null,
      valor_bruto: totais.bruto,
      descontos: totais.deducoes,
      valor_liquido: totais.liquido,
      /* Só entra o que tem saca: classe zerada não é venda. */
      entregas: calculadas.filter(e => e.sacas > 0).map(e => ({
        classe_aflatoxina: e.classe,
        sacas: e.sacas,
        preco_saca: e.precoSaca,
        valor: e.valor,
      })),
      receita: {
        plano_conta_id: planoId,
        macro_custo: cls?.macro_custo ?? null,
        grupo_custo: cls?.grupo_custo ?? null,
        centro_custo: cls?.centro_custo ?? null,
        subcentro: cls?.subcentro ?? subcentro ?? null,
      },
      deducao: { valor: totais.deducoes, descricao: totais.deducoes > 0 ? 'Senar / Funrural' : null },
    });
  };

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent
        onPointerDownOutside={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
        className="max-w-3xl gap-0 overflow-visible p-0 [&>button.absolute]:hidden">
        <div className="bg-primary px-4 py-2.5 text-primary-foreground">
          <h2 className="text-[15px] font-bold leading-tight">
            {venda ? 'Editar venda do grão' : 'Venda do grão'}
          </h2>
          <p className="mt-0.5 text-[11px] text-primary-foreground/80">
            O que o produtor entregou ao parceiro — a perna de receita do barter.
          </p>
        </div>

        <div className="space-y-2 p-4">
          <div className="grid grid-cols-4 gap-2">
            <div>
              <Label className="text-[10px]">Safra do grão <span className="text-destructive">*</span></Label>
              <Select value={safraId} onValueChange={setSafraId}>
                <SelectTrigger className={cn('mt-0.5 h-8 text-[12px]', FOCO)}>
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {safras.map(s => (
                    <SelectItem key={s.id} value={s.id} className="text-[12px]">{s.codigo || s.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              {/* ⚠ A CULTURA SAI DOS TALHÕES DAQUELA SAFRA, não de uma lista fixa: só se vende
                  o que se plantou, e o vazio aqui é informação — a safra não tem área. */}
              <Label className="text-[10px]">Cultura <span className="text-destructive">*</span></Label>
              <Select value={cultura} onValueChange={setCultura} disabled={culturasDaSafra.length === 0}>
                <SelectTrigger className={cn('mt-0.5 h-8 text-[12px]', FOCO)}>
                  <SelectValue placeholder={culturasDaSafra.length === 0 ? 'Safra sem área' : 'Escolha'} />
                </SelectTrigger>
                <SelectContent>
                  {culturasDaSafra.map(c => (
                    <SelectItem key={c} value={c} className="text-[12px]">{labelDaCultura(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              {/* ⚠ ASTERISCO NOVO, e ele é honesto: `data_operacao` é NOT NULL no banco, e o
                  campo já se defendia sozinho (`v || hoje()` nunca deixa vazio). O asterisco
                  só passou a dizer o que sempre foi verdade. */}
              <Label className="text-[10px]">Data da venda <span className="text-destructive">*</span></Label>
              <DatePicker value={data} onChange={v => setData(v || hoje())} className="mt-0.5" />
            </div>
            <div>
              <Label className="text-[10px]">Precificação</Label>
              <Select value={precificacao} onValueChange={setPrecificacao}>
                <SelectTrigger className={cn('mt-0.5 h-8 text-[12px]', FOCO)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixo" className="text-[12px]">Preço fixo</SelectItem>
                  <SelectItem value="a_fixar" className="text-[12px]">A fixar</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── AS ENTREGAS POR CLASSE ── */}
          <div className="overflow-hidden rounded-md border">
            <table className="w-full table-fixed border-collapse text-[10px] leading-tight">
              <colgroup>
                {['24%', '15%', '16%', '15%', '15%', '15%'].map((w, i) => <col key={i} style={{ width: w }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th className={cn(TH, 'text-left')}>Classe</th>
                  <th className={cn(TH, 'text-right')}>Tem na safra</th>
                  <th className={cn(TH, 'text-right')}>Sacas vendidas</th>
                  <th className={cn(TH, 'text-right')}>R$/saca</th>
                  <th className={cn(TH, 'text-right')}>Valor</th>
                  {/* ⚠ ÚLTIMA COLUNA — item 7. Ela é CONSEQUÊNCIA da venda, não insumo dela: no
                      meio da tabela separava os campos que se digitam do valor que resulta. No
                      fim, a linha se lê na ordem em que se pensa. Conversa com a frente de
                      ESTOQUE, mas aqui é só aritmética da tela: nada é gravado nem reservado. */}
                  <th className={cn(TH, 'text-right')}>Sacas restantes</th>
                </tr>
              </thead>
              <tbody>
                {calculadas.map((e, i) => (
                  <tr key={e.classe} className="border-t border-slate-100 odd:bg-[#1e3a5f]/[0.03]">
                    <td className="px-1.5 py-0.5">{labelDaClasse(e.classe)}</td>
                    {/* ⚠ A REFERÊNCIA É O QUE A COLHEITA MEDIU, e ela fica cinza de propósito:
                        é dado de apoio, não campo. Vermelho quando a venda passa dele. */}
                    <td className={cn('px-1.5 py-0.5 text-right tabular-nums',
                      e.excede ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
                      {/* ⚠ EXIBE DUAS, `title` LEVA AS QUATRO — a régua do F3. Sem o título aqui,
                          o "restante" ao lado mostraria quatro casas vindas de dois números que a
                          tela mostra com duas, e a subtração não fecharia aos olhos de quem lê. */}
                      <span title={formatCasas(e.disponivel, 4)}>{formatNum(e.disponivel, 2)}</span>
                      {e.excede && <AlertTriangle className="ml-1 inline h-3 w-3 align-[-2px]" />}
                    </td>
                    {/* ⚠ `CampoNumero` É A PEÇA DA CASA — item 6. Ele deixa digitar cru e
                        normaliza em pt-BR no blur ("10000" vira "10.000,00"), que é o que faltava:
                        o polish-2 já corrigiu a exibição ao REABRIR, mas ao DIGITAR o campo ficava
                        sem separador. Um `Input` solto aqui seria a terceira máscara da casa. */}
                    <td className="px-1 py-0.5">
                      {/* ⚠ `casas={4}` — F3. O romaneio da cooperativa traz saca e preço com até
                          quatro casas, e cortar em duas na digitação joga fora o que o comprador
                          de fato pagou. A EXIBIÇÃO do valor continua em duas: quem arredonda é o
                          total da linha, não a entrada. */}
                      <CampoNumero valor={linhas[i].sacas} onChange={v => mudar(i, 'sacas', v)}
                        casas={4} title={linhas[i].sacas}
                        className={cn('h-6 px-1 text-right font-mono text-[10px]', FOCO)} />
                    </td>
                    <td className="px-1 py-0.5">
                      <CampoNumero valor={linhas[i].precoSaca} onChange={v => mudar(i, 'precoSaca', v)}
                        casas={4} title={linhas[i].precoSaca}
                        className={cn('h-6 px-1 text-right font-mono text-[10px]', FOCO)} />
                    </td>
                    <td className="px-1.5 py-0.5 text-right tabular-nums">{formatMoeda(e.valor)}</td>
                    {/* ⚠ NEGATIVO EM VERMELHO: vender mais do que tem deixa o restante negativo, e
                        o número negativo é a mesma informação do aviso de excesso, na linha. */}
                    <td className={cn('px-1.5 py-0.5 text-right tabular-nums',
                      e.disponivel - e.sacas < 0 ? 'font-semibold text-destructive'
                        : 'text-muted-foreground')}>
                      <span title={formatCasas(e.disponivel - e.sacas, 4)}>
                        {formatNum(e.disponivel - e.sacas, 2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {/* ⚠ O TOTAL DO "TEM NA SAFRA" ALINHADO NA PRÓPRIA COLUNA — item 6a. Sem ele o
                    operador somava as quatro classes de cabeça para saber quanto a safra rendeu. */}
                <tr>
                  <td className={cn(TH, 'text-left')}>Total</td>
                  {/* ⚠ OS TOTAIS SOMAM O CRU E ARREDONDAM NA EXIBIÇÃO, nunca o contrário: somar
                      quatro parcelas já cortadas em duas casas erra até dois centavos de saca, e
                      é o mesmo erro do valor da linha em outra escala. */}
                  <td className={cn(TH, 'text-right tabular-nums')}
                    title={formatCasas(calculadas.reduce((t, e) => t + e.disponivel, 0), 4)}>
                    {formatNum(calculadas.reduce((t, e) => t + e.disponivel, 0), 2)}
                  </td>
                  <td className={cn(TH, 'text-right tabular-nums')}
                    title={formatCasas(calculadas.reduce((t, e) => t + e.sacas, 0), 4)}>
                    {formatNum(calculadas.reduce((t, e) => t + e.sacas, 0), 2)}
                  </td>
                  <td className={TH} />
                  <td className={cn(TH, 'text-right tabular-nums')}>{formatMoeda(totais.bruto)}</td>
                  <td className={cn(TH, 'text-right tabular-nums')}
                    title={formatCasas(calculadas.reduce((t, e) => t + (e.disponivel - e.sacas), 0), 4)}>
                    {formatNum(calculadas.reduce((t, e) => t + (e.disponivel - e.sacas), 0), 2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ⚠ O AVISO OCUPA ALTURA FIXA, com ou sem excesso: um alerta que aparece e some
              empurraria o rodapé do modal para baixo do cursor no meio da digitação. */}
          <div className="min-h-[16px] text-[10px] leading-tight">
            {totais.excedentes > 0 && (
              <span className="font-medium text-destructive">
                {totais.excedentes === 1
                  ? 'Uma classe vende mais do que a safra colheu.'
                  : `${totais.excedentes} classes vendem mais do que a safra colheu.`}
                {' '}Confira — ou siga, se o grão veio de outra safra.
              </span>
            )}
          </div>

          <div className="grid grid-cols-[1fr_1fr_1fr] items-end gap-2">
            <div>
              {/* ⚠ "SENAR / FUNRURAL" e a % EDITÁVEL — item 5. A alíquota muda por lei e por ano
                  (subiu para 1,7%), e uma constante no código faria o sistema discordar do
                  documento da cooperativa sem ninguém saber qual dos dois está certo.
                  ⚠ OS DOIS CAMPOS SÃO O MESMO NÚMERO POR DOIS CAMINHOS: digitar a % recalcula o
                  valor; digitar o valor recalcula a %. O que se GRAVA é o valor — quem retém é a
                  cooperativa, e o que vale no acerto é o papel dela. */}
              <Label className="text-[10px]">Dedução (Senar / Funrural)</Label>
              <div className="mt-0.5 flex items-center gap-1">
                <div className="relative w-[74px] shrink-0">
                  <CampoNumero valor={aliquota}
                    onChange={v => {
                      setAliquota(v);
                      const pct = parseMoeda(v);
                      if (pct != null) setDeducao(deducaoPorAliquota(totais.bruto, pct));
                    }}
                    className={cn('h-8 pr-5 text-right font-mono text-[12px]', FOCO)} />
                  <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
                </div>
                <CampoMoeda valor={deducao}
                  onChange={v => {
                    setDeducao(v);
                    /* ⚠ O INVERSO MANTÉM A % HONESTA: sem isto ela ficaria em 1,5% ao lado de um
                       valor que é outro percentual do bruto. */
                    setAliquota(formatNum(aliquotaDoValor(totais.bruto, v ?? 0), 2));
                  }}
                  className={cn('h-8 flex-1 text-right font-mono text-[12px]', FOCO)} />
              </div>
              <button type="button"
                className="mt-0.5 text-[9px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => {
                  const pct = parseMoeda(aliquota) ?? ALIQUOTA_DEDUCAO_PADRAO;
                  setDeducao(deducaoPorAliquota(totais.bruto, pct));
                }}>
                recalcular sobre o bruto ({formatMoeda(deducaoPorAliquota(totais.bruto, parseMoeda(aliquota) ?? 0))})
              </button>
            </div>
            <div className="rounded-md border bg-card px-2.5 py-1.5">
              <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Líquido</div>
              <div className="mt-0.5 text-[16px] font-medium leading-none tabular-nums">
                {formatMoeda(totais.liquido)}
              </div>
              <div className="mt-0.5 text-[9px] text-muted-foreground">bruto − dedução</div>
            </div>
            <div className="text-[9px] leading-snug text-muted-foreground">
              O líquido é o que entra no saldo do contrato: o Senar fica com a cooperativa e
              nunca chega ao produtor.
            </div>
          </div>

          {/* ⚠ O RÓTULO É DAQUI, não do `PlanoSubcentroSelect`: a prop `label` dele é `string` e
              o asterisco é JSX. Alargá-la para `ReactNode` mexeria num componente que o
              `LancamentoV2Dialog` e a Mesa também montam — fora do escopo deste defeito.
              ⚠ "• SUGERIDO" É O IDIOMA DA CASA, copiado do `MesaPareamentoModal` (text-amber-600,
              normal-case): ele diz que o campo está preenchido por palpite e pede conferência.
              Some no instante em que o operador escolhe — a partir daí a conta é dele. */}
          <Label className="text-[10px]">
            Conta da receita <span className="text-destructive">*</span>
            {contaSugerida && subcentro && (
              <span className="ml-1 font-normal normal-case text-amber-600">• sugerido</span>
            )}
          </Label>
          <PlanoSubcentroSelect
            value={subcentro}
            onChange={v => { setSubcentro(v); setContaSugerida(false); }}
            onSelected={(sub, cls) => { setSubcentro(sub); setPlanoId(cls?.id ?? null); setContaSugerida(false); }}
            classificacoes={classificacoes}
            tipoOperacao="1-Entradas"
            escopoNegocio="agricultura"
            escopoObrigatorio
            somenteCompoeDre
            search={busca}
            onSearchChange={setBusca}
          />
        </div>

        <div className="flex items-center justify-end gap-2 bg-primary px-4 py-2">
          {/* ⚠ O MOTIVO FICA AO LADO DO BOTÃO TRAVADO — regra da casa (a mesma da OC): o
              `disabled` é a única fonte de `title` e da frase, e um botão cinza sem explicação
              faz o operador procurar o que está errado em toda a tela. */}
          {impedimento && (
            <span className="mr-auto text-[10px] text-primary-foreground/80">{impedimento}</span>
          )}
          <Button variant="ghost" className="text-primary-foreground/90 hover:bg-white/10 hover:text-white"
            onClick={onFechar}>Fechar</Button>
          <Button className="gap-1 bg-white text-primary hover:bg-white/90"
            disabled={!!impedimento || salvando} title={impedimento ?? 'Salvar esta venda'}
            onClick={gravar}>
            <Save className="h-4 w-4" /> {salvando ? 'Salvando…' : 'Salvar venda'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
