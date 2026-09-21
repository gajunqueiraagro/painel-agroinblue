/**
 * O MODAL DE UMA CARGA DE ENTREGA DIRETA — mandioca industrial, AGRI-MANDIOCA-01c §1.
 *
 * ⚠ MODAL IRMÃO, pelo mesmo motivo da lista: o `CargaModal` da saca estocável tem treze campos do
 * romaneio da cooperativa (verde, seco, umidade, aflatoxina, renda líquida, roça, secagem) e três
 * abas. Nenhum deles existe aqui, e quase todos os daqui não existem lá. Tecer os dois num
 * arquivo só produziria um componente em que cada campo pergunta "de quem eu sou" — e a tela do
 * amendoim, que funciona, pagaria a conta do experimento.
 * ⚠ A CASCA É A MESMA (`LancamentoModalEnvelope`): o que muda é a gramática do dado, não a da casa.
 *
 * ⚠ NENHUMA CONTA, COM UMA EXCEÇÃO DECLARADA. O peso líquido é `bruto − desconto`, e ele é a única
 * derivação permitida — o operador precisa ver a tonelada antes de salvar, e ela é subtração de
 * dois números que ele acabou de digitar. O VALOR BRUTO não se calcula: fica "—" até a RPC
 * responder, e depois mostra o que ela gravou. Multiplicar `t × g × R$/g` aqui daria um segundo
 * número para a mesma carga — e, no dia do arredondamento discordante, seria a tela contra o banco.
 */
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Segmentado } from '@/components/ui/segmentado';
import { FornecedorSelect } from '@/components/shared/FornecedorSelect';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import { BlocoTopoAba } from '@/components/ui/bloco-topo-aba';
import { useCompromissosDaCarga, useAlterarCompromisso } from '@/hooks/useCargaMandioca';
import {
  montarCompromissos, resultadoDaCarga, topoFinanceiro, ehImposto,
  type StatusCompromisso,
} from '@/lib/agri/compromissosDaCarga';
import { useContasBancariasLeves } from '@/hooks/useContasBancariasLeves';
import { Save, AlertTriangle, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatNum, formatMoeda, formatarNF } from '@/lib/calculos/formatters';
import { CampoNumero, CampoMoeda } from '@/components/ui/campo-moeda';
import { parseMoeda } from '@/lib/calculos/numeroBR';
import { observacoesDoOperador, temMetadadoDeMigracao } from '@/lib/agri/observacoesDaCarga';
import { reconstruirCarga } from '@/lib/agri/compromissosDaCarga';
import { LancamentoModalEnvelope } from '@/components/lancamento/LancamentoModalEnvelope';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';
import { useFinanceiroV2, type LancamentoV2 } from '@/hooks/useFinanceiroV2';
import { useFazenda } from '@/contexts/FazendaContext';
import {
  TIPOS_SERVICO, type ServicoDaCarga, type LancamentoTravado,
} from '@/hooks/useCargaMandioca';

/** O mesmo foco fino do modal irmão — anel de 1px, sem o halo de 4. */
const FOCO = 'focus-visible:ring-1 focus-visible:ring-offset-0 focus:ring-1 focus:ring-offset-0';

/* ⚠ O MESMO PARSER DA GRAVAÇÃO (`parseMoeda`): a lateral tem de ler "26.560" igual ao que vai ao
   banco, senão o resumo mostra 26,56 enquanto a RPC recebe 26.560. */
const num = (t: string): number | null => (t.trim() ? parseMoeda(t) : null);

/**
 * O QUE O MODAL EDITA.
 *
 * ⚠ `ids` NO PLURAL, e é o §3 aparecendo aqui: uma carga do backfill tem duas colheitas, e as duas
 * são corrigidas ou canceladas juntas. Guardar um `id` só deixaria a outra metade viva apontando
 * para um lançamento cancelado.
 */
/** As três abas do modal — PR-CARGA-MANDIOCA-MODAL-OC-01, fase 1. */
export type AbaCarga = 'colheita' | 'servicos' | 'financeiro';

/**
 * ⚠ TRÊS CORES DISTINTAS, e é correção declarada do molde. A OC dá `variant="secondary"` a
 * `Pago`, `Parcial`, `Lançado` e `Programado` — quatro estados na mesma cor, distinguíveis só
 * pelo texto. Copiar isso seria copiar o defeito junto com o padrão.
 * ⚠ 'parcial' AINDA NÃO NASCE nesta fase (falta ler o valor aplicado); está aqui porque a fase 2
 * o liga, e estado que chega depois sem cor reservada chega com a cor de outro.
 */
/**
 * DD/MM, como o resto da conciliação.
 * ⚠ O ANO É REDUNDANTE numa carga cujo cabeçalho já anuncia a data — e a coluna é estreita.
 */
const diaMes = (iso: string): string => {
  const p = iso.slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}` : iso;
};

const PILULA: Record<StatusCompromisso, { rotulo: string; classe: string }> = {
  programado: { rotulo: 'Programado', classe: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' },
  parcial: { rotulo: 'Parcial', classe: 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300' },
  pago: { rotulo: 'Pago', classe: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' },
};

export interface CargaMandiocaForm {
  ids: string[];
  dataColheita: string;
  industriaId: string | null;
  industriaNome: string | null;
  nf: string;
  ticket: string;
  pesoBrutoKg: string;
  descontoKg: string;
  rendimentoG: string;
  precoG: string;
  servicos: ServicoDaCarga[];
  icms: string;
  funrural: string;
  /** Retido da venda, como o Funrural. */
  inss: string;
  /** Custo sobre o frete — não é o ICMS da venda, e não mora no mesmo subcentro. */
  icmsTransporte: string;
  /** ⚠ A conta que paga a carga: sem ela o compromisso não aparece na conciliação. */
  contaId: string | null;
  observacoes: string;
  /** O que a RPC devolveu na última gravação. `null` enquanto não se salvou. */
  valorBruto: number | null;
}

export const cargaMandiocaVazia = (): CargaMandiocaForm => ({
  ids: [],
  dataColheita: new Date().toISOString().slice(0, 10),
  industriaId: null,
  industriaNome: null,
  nf: '',
  ticket: '',
  pesoBrutoKg: '',
  descontoKg: '',
  rendimentoG: '',
  precoG: '',
  servicos: TIPOS_SERVICO.map(s => ({ tipo: s.tipo, fornecedor_id: null, preco_t: null })),
  icms: '',
  funrural: '',
  inss: '',
  icmsTransporte: '',
  contaId: null,
  observacoes: '',
  valorBruto: null,
});

/** O peso líquido em toneladas — a ÚNICA derivação desta tela. */
export function toneladasDaCarga(brutoKg: string, descontoKg: string): number | null {
  const bruto = num(brutoKg);
  if (bruto == null) return null;
  return Math.round(((bruto - (num(descontoKg) ?? 0)) / 1000) * 100) / 100;
}

function Campo({ rotulo, valor, onChange, numerico, casas = 2, obrigatorio, dica }: {
  rotulo: string; valor: string; onChange: (v: string) => void;
  numerico?: boolean; casas?: number; obrigatorio?: boolean; dica?: string;
}) {
  return (
    <div>
      <Label className="text-[10px]">
        {rotulo}{obrigatorio && <span className="text-destructive"> *</span>}
      </Label>
      {numerico ? (
        <CampoNumero valor={valor} onChange={onChange} casas={casas} title={dica}
          className={cn('mt-0.5 h-8 text-right font-mono text-[12px]', FOCO)} />
      ) : (
        <Input value={valor} onChange={e => onChange(e.target.value)} title={dica}
          className={cn('mt-0.5 h-8 text-[12px]', FOCO)} />
      )}
    </div>
  );
}

/**
 * A NOTA FISCAL EM 000.000.000 — A25, e a máscara é SÓ DE TELA.
 *
 * ⚠ O DADO VAI CRU, e isto não é detalhe de estilo: `p_nf` entra na RPC como veio e
 * `icmsJaNaNota` faz `.eq('nf_produtor', nf.trim())`. No banco a nota desta carga é `9287581` —
 * sete dígitos, sem pontos. Gravar `009.287.581` faria a consulta do ICMS não achar a própria
 * nota, e o imposto seria lançado duas vezes na mesma NF.
 * ⚠ OS ZEROS ENTRAM EM REPOUSO, nunca enquanto se digita — é o que o `formatarNF` documenta:
 * teclar "7" viraria "000.000.007" e o cursor saltaria para o fim a cada tecla. Por isso o campo
 * mostra o texto cru enquanto tem foco e a máscara quando o perde.
 */
function CampoNF({ valor, onChange, dica }: {
  valor: string; onChange: (v: string) => void; dica?: string;
}) {
  const [focado, setFocado] = useState(false);
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">NF</Label>
      <Input
        value={focado ? valor : formatarNF(valor)}
        onFocus={() => setFocado(true)}
        onBlur={() => setFocado(false)}
        /* ⚠ SÓ DÍGITOS NO ESTADO: se o operador colar "009.287.581", o que se guarda é
           "009287581". A máscara é reconstruída na exibição a partir do número. */
        onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
        title={dica}
        className={cn('mt-0.5 h-8 text-[12px]', FOCO)} />
    </div>
  );
}

/**
 * Um número que a tela NÃO deixa digitar — moldura tracejada, como no modal irmão.
 *
 * ⚠ A BORDA TRACEJADA É O AVISO: um campo derivado com cara de `<input>` convida a corrigir o que
 * o sistema deduziu, e aqui a correção não teria onde ser gravada.
 */
function Derivado({ rotulo, valor, sufixo, dica }: {
  rotulo: string; valor: number | null; sufixo?: string; dica?: string;
}) {
  return (
    <div>
      <Label className="text-[10px]">{rotulo}</Label>
      <div title={dica}
        className={cn('mt-0.5 flex h-8 items-center justify-end gap-1 rounded-md border border-dashed',
          'bg-muted/30 px-2 font-mono text-[12px] tabular-nums',
          valor == null && 'text-muted-foreground')}>
        {valor != null ? formatNum(valor, 2) : '—'}
        {sufixo && <span className="text-[9px] text-muted-foreground">{sufixo}</span>}
      </div>
    </div>
  );
}

/** Um par rótulo–valor do resumo lateral, no idioma do modal irmão. */
function Par({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-3 py-0.5">
      <span className="text-[10px] text-muted-foreground">{rotulo}</span>
      <span className={cn('tabular-nums', forte ? 'text-[12px] font-bold text-foreground' : 'text-[11px] text-foreground')}>
        {valor}
      </span>
    </div>
  );
}

export function CargaMandiocaModal({
  aberto, form, clienteId, areas, areaId, safraRotulo, fazendaNome, salvando,
  icmsTravado, talhoesDaCarga, travados, onAreaChange, onChange, onFechar, onSalvar,
}: {
  aberto: boolean;
  form: CargaMandiocaForm | null;
  clienteId: string | null | undefined;
  areas: readonly { id: string; pastoNome: string; area_plantada_ha: number }[];
  areaId: string;
  safraRotulo: string;
  fazendaNome: string | null;
  salvando: boolean;
  /**
   * A NF desta carga já tem ICMS lançado por outra carga.
   *
   * ⚠ TRAVAR É DIZER A VERDADE SOBRE O QUE VAI SER GRAVADO: a RPC lança o ICMS UMA VEZ por nota e
   * descarta o repetido em silêncio. Sem a trava, o operador digitaria o valor na segunda carga da
   * mesma nota e a tela teria prometido um lançamento que nunca existiria.
   */
  icmsTravado: boolean;
  /**
   * Os talhões da carga INTEIRA, já unidos ("IND.05 · IND.06"), ou `null` numa carga nova.
   * ⚠ NÃO SE DERIVA DE `areaId`: ele cabe um só, e uma carga dividida tem dois. Quem junta é
   * `CargaAgrupada.talhao`, o mesmo texto da lista — não um segundo.
   */
  talhoesDaCarga: string | null;
  /** Os lançamentos que impediram a última tentativa — a RPC recusou e nada mudou. */
  travados: LancamentoTravado[];
  onAreaChange: (id: string) => void;
  onChange: (f: CargaMandiocaForm) => void;
  onFechar: () => void;
  onSalvar: () => void;
}) {
  /* ⚠ ABA ÚNICA, E ELA EXISTE: o envelope reserva a altura da faixa de abas, e sem nada ali o
     modal abriria com uma tira vazia no topo. Uma aba só também nomeia o que se está lançando. */
  const [aba, setAba] = useState<AbaCarga>('colheita');
  /* ⚠ O MODAL BUSCA AS CONTAS, como a `AbaCompromissosOC` faz: elas são do cliente, não da carga,
     e passá-las por prop obrigaria a `CargasDaArea` a carregá-las só para repassar. */
  const { contas } = useContasBancariasLeves(clienteId);
  /**
   * ⚠ TODOS OS HOOKS ANTES DO `if (!form) return null` — regra dos Hooks, e esta linha já custou
   * uma tela branca (React #310, 21/09/2026). Ela nasceu junto das três abas e ficou ABAIXO do
   * early return: com o modal fechado (`form === null`) o componente chamava dois hooks, com ele
   * aberto chamava três, e o React aborta na transição.
   * ⚠ `form?.ids ?? []` É O PREÇO DE SUBIR, e é barato: o hook trata lista vazia sem consultar o
   * banco (a chave de dependência é o texto dos ids, não o array). Condicionar a CHAMADA seria
   * repetir o defeito; condicionar o ARGUMENTO é o que a regra pede.
   * ⚠ LÊ PELOS IDS DA CARGA INTEIRA. Ler por uma metade faria o ICMS sumir em metade das cargas:
   * medido na NF 9287581, os elos de `icms` e `funrural` pendiam só da metade IND.05.
   */
  const { linhas: lancamentosDaCarga, carregando: carregandoFin, recarregar: recarregarFin } =
    useCompromissosDaCarga(form?.ids ?? []);
  /* ⚠ TAMBÉM ANTES DO EARLY RETURN — regra dos Hooks, e o `check:hooks` agora reprova o PR que a
     quebrar. Foi exatamente esta linha, na fase 1, que derrubou a Colheita em tela branca. */
  const { alterar: alterarCompromisso, salvando: salvandoFin } = useAlterarCompromisso();
  /**
   * O compromisso aberto no modal do Financeiro. `null` = nenhum.
   *
   * ⚠ ELE SUBSTITUIU A EDIÇÃO INLINE de vencimento e conta (fase 2), e a troca é de escopo, não
   * de aparência: a linha inline mudava DUAS colunas, e o frete desta carga tinha o favorecido
   * errado — "Emerson" numa despesa paga ao "Silvio". Nenhuma das duas colunas respondia a isso.
   * ⚠ UM CAMINHO SÓ PARA EDITAR COMPROMISSO, e é o do Financeiro. Manter os dois deixaria o
   * operador escolhendo entre uma edição que muda tudo e outra que muda duas coisas, sem a tela
   * dizer qual usar — e a inline salvava direto, sem confirmação, enquanto o diálogo pede Salvar.
   */
  const [editandoLanc, setEditandoLanc] = useState<LancamentoV2 | null>(null);
  /** Qual carga já teve serviços e impostos reconstruídos — a chave são os ids dela. */
  const reconstruidaRef = useRef<string | null>(null);
  /* ⚠ AS FAZENDAS SÃO DO CONTEXTO, como no `AgriDreLavouraTab`: o diálogo as exige e a carga não
     as tem. */
  const { fazendas } = useFazenda();
  /* ⚠ TAMBÉM ACIMA DO EARLY RETURN — o `check:hooks` reprova o PR que descer qualquer um destes. */
  const fin = useFinanceiroV2();
  /**
   * OS QUATRO CATÁLOGOS DO `LancamentoV2Dialog` — e é a ausência deles que já foi defeito.
   *
   * ⚠ ELES NÃO SE CARREGAM SOZINHOS. `useFinanceiroV2` nasce com `contasBancarias`,
   * `fornecedores`, `classificacoes` e `safras` VAZIOS e só os preenche quando alguém chama os
   * `load*`. Lista vazia é lista válida: nenhum tipo acusa, o build passa, e o modal abre com
   * "Selecione fornecedor…" e Conta em branco num lançamento que tem os dois — e Salvar grava
   * nulo por cima. Esta é a QUARTA tela a copiar o aviso: `AgriBarterTab`, `AgriDreCulturaTab` e
   * `AgriDreLavouraTab` o escreveram antes, com estas palavras.
   */
  useEffect(() => {
    void fin.loadContas();
    void fin.loadClassificacoes();
    void fin.loadFornecedores();
    void fin.loadSafras();
  }, [fin.loadContas, fin.loadClassificacoes, fin.loadFornecedores, fin.loadSafras]);
  /* Os quatro prontos — sem eles o formulário mente sobre o que o lançamento tem. */
  const catalogosProntos = fin.contasBancarias.length > 0 && fin.fornecedores.length > 0
    && fin.safras.length > 0 && fin.classificacoes.length > 0;

  /* ⚠ O VALOR GRAVADO SOME QUANDO O ROMANEIO MUDA: ele é a resposta da RPC para os números
     ANTERIORES, e mantê-lo na tela depois de mexer no peso mostraria o valor de uma carga que não
     é mais esta. "—" diz "salve para saber", que é a verdade. */
  /* Fechar devolve a aba à primeira: reabrir noutra carga na aba Financeiro esconderia os campos
     que o operador veio ver. */
  useEffect(() => {
    if (!aberto) { setAba('colheita'); reconstruidaRef.current = null; }
  }, [aberto]);

  /**
   * A CARGA VOLTA A SABER COM QUE NÚMEROS FOI FEITA — e é isto que autoriza o Salvar a existir.
   *
   * ⚠ A AUSÊNCIA DISTO APAGOU DINHEIRO. Em 21/09/2026 a 9287581 foi corrigida e perdeu 28,19 t e
   * R$ 16.402,85 em cinco lançamentos. `agri_carga_mandioca_corrigir` é `cancelar + registrar`, e
   * o formulário reabria com `servicos: []`, `icms: ''` e `funrural: ''`: o payload de volta
   * descrevia uma carga menor que a existente, e a RPC obedeceu — ela não tinha como distinguir
   * "não tem serviço" de "esqueci de ler os serviços".
   * ⚠ POR ISSO O PREENCHIMENTO VEM ANTES DA DESTRAVA, nesta ordem e não na inversa. A trava do
   * front era contenção enquanto o formulário fosse cego.
   *
   * ⚠ UMA VEZ POR CARGA, pelo `reconstruidaRef`: sem ele o `onChange` re-renderiza o pai, o efeito
   * roda de novo e sobrescreveria o que o operador acabou de digitar — a cada tecla.
   * ⚠ E SÓ PARA CARGA EXISTENTE (`ids.length > 0`). Carga nova não tem o que reconstruir, e é a
   * `proposta()` que a preenche, com o contrato âmbar de sugestão.
   */
  useEffect(() => {
    if (!form || form.ids.length === 0) return;
    const chave = form.ids.join(',');
    if (reconstruidaRef.current === chave) return;
    if (carregandoFin || lancamentosDaCarga.length === 0) return;

    const t = toneladasDaCarga(form.pesoBrutoKg, form.descontoKg);
    const rec = reconstruirCarga(lancamentosDaCarga, t);
    /* ⚠ MARCA ANTES DE CHAMAR: o `onChange` é síncrono e reentra neste efeito. */
    reconstruidaRef.current = chave;

    const txt = (n: number | null): string => (n == null ? '' : String(n));
    onChange({
      ...form,
      servicos: rec.servicos,
      icms: txt(rec.icms),
      funrural: txt(rec.funrural),
      inss: txt(rec.inss),
      icmsTransporte: txt(rec.icmsTransporte),
      /* ⚠ `valorBruto` NÃO se zera aqui. Ele é o que a RPC gravou, e reconstruir não é editar:
         zerá-lo faria a carga recém-aberta dizer "salve para saber" sobre um valor que ela tem. */
    });
  }, [form, carregandoFin, lancamentosDaCarga, onChange]);

  if (!form) return null;

  const campo = (k: keyof CargaMandiocaForm, v: string) => onChange({ ...form, [k]: v, valorBruto: null });

  /**
   * Abre UM compromisso no modal do Financeiro.
   *
   * ⚠ NÃO PASSA PELA CARGA: é a edição do lançamento, não uma reconstrução. Por isso não esbarra
   * na trava do salvar nem na guarda do `corrigir` — e por isso a aba Financeiro é editável
   * enquanto o resto do modal segue em leitura.
   * ⚠ O LOADER É O DO FINANCEIRO, não um `select` próprio: `buscarLancamentoPorId` faz a mesma
   * consulta, e ter as duas é ter duas donas do mesmo `select` — a coluna que uma ganhar, a outra
   * não ganha.
   */
  const abrirCompromisso = async (lancamentoId: string) => {
    const linha = await fin.buscarLancamentoPorId(lancamentoId);
    if (linha) setEditandoLanc(linha);
    else toast.error('Não foi possível abrir este compromisso.');
  };
  /**
   * ⚠ CORRIGIR ESTÁ TRAVADO — PR-CARGA-MANDIOCA-TRAVAR-CORRIGIR, e isto é contenção, não desenho.
   *
   * `agri_carga_mandioca_corrigir` é `cancelar + registrar`: ela apaga a carga e a recria com o
   * que o formulário mandar. E o formulário reaberto NÃO tem o que recriar — os serviços voltam
   * em branco por decisão declarada, e `abrirCargaMandioca` nunca leu `icms` nem `funrural`.
   * Salvar uma carga reaberta apagava frete, trator, mão de obra, ICMS e Funrural, sem aviso.
   * ⚠ E FUNDIA AS METADES: `corrigir` usa `ids[0]` como principal, manda o peso da METADE que a
   * tela mostra e cancela o resto. Medido em 21/09/2026 na NF 9287581 — 40,34 t viraram 12,15 t,
   * seis lançamentos viraram um, R$ 16.402,85 sumiram. 20 das 21 cargas vivas têm duas metades.
   * ⚠ O DEFEITO É ANTIGO; o que mudou foi a barreira que o escondia. Até o conserto da leitura do
   * peso (PR-CARGA-MANDIOCA-PESO-P0-01) o campo abria vazio e a RPC recusava com "peso bruto
   * obrigatorio" — corrigir simplesmente não funcionava. Com o peso preenchido, passou a gravar.
   * ⚠ `ids.length > 0` É O MESMO DISCRIMINADOR QUE O GRAVADOR USA (`CargasDaArea`, no despacho
   * entre `corrigir` e `registrar`). Travar por outro critério abriria uma terceira resposta para
   * a pergunta "esta carga já existe?".
   * A trava sai quando o modal souber editar a carga INTEIRA e devolver serviços e impostos.
   */
  const corrigindo = form.ids.length > 0;
  const t = toneladasDaCarga(form.pesoBrutoKg, form.descontoKg);
  /* ⚠ O DIVISOR DO R$/t É `t`, que agora é a CARGA INTEIRA (o form carrega o peso somado).
     Com a metade, 5.647,60 / 12,15 daria 464,82 R$/t — um preço que ninguém contratou. */
  const compromissos = montarCompromissos(lancamentosDaCarga, t, num(form.precoG));
  const resultado = resultadoDaCarga(compromissos);
  const topoFin = topoFinanceiro(compromissos);
  const traco = (v: number | null, casas = 2, sufixo = '') =>
    (v == null ? '—' : `${formatNum(v, casas)}${sufixo}`);

  const servico = (tipo: ServicoDaCarga['tipo']) =>
    form.servicos.find(s => s.tipo === tipo) ?? { tipo, fornecedor_id: null, preco_t: null };
  const mudarServico = (tipo: ServicoDaCarga['tipo'], patch: Partial<ServicoDaCarga>) => {
    onChange({
      ...form,
      servicos: TIPOS_SERVICO.map(s => (s.tipo === tipo
        ? { ...servico(tipo), ...patch }
        : servico(s.tipo))),
      valorBruto: null,
    });
  };

  /* ⚠ O TOTAL DOS SERVIÇOS É O DA PROPOSTA, e a tela o marca como tal: `preço × tonelada` do que
     está NA CAIXA, para o operador conferir a ordem de grandeza antes de salvar. Quem grava é a
     RPC, e é o número dela que a lista vai mostrar depois. */
  const servicosT = form.servicos.reduce((a, s) => a + (s.preco_t ?? 0), 0);
  const servicosPrevisto = t != null ? Math.round(servicosT * t * 100) / 100 : null;
  const notaTotal = (num(form.icms) ?? 0) + (num(form.funrural) ?? 0);

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent
        onPointerDownOutside={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
        className="max-w-5xl gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        <LancamentoModalEnvelope
          titulo={`Carga · Mandioca${safraRotulo ? ` · Safra ${safraRotulo}` : ''}`}
          data={form.dataColheita}
          fazendaNome={fazendaNome}
          onFechar={onFechar}
          acao={(
            <Button type="button" variant="acao" onClick={onSalvar}
              /* ⚠ A JANELA CEGA CONTINUA TRAVADA, e é a única que sobra. A trava saiu porque o
                 formulário passou a reconstruir serviços e impostos — mas ele só os tem DEPOIS de
                 `useCompromissosDaCarga` responder. Salvar antes disso manda exatamente o payload
                 vazio que apagou R$ 16.402,85 da 9287581. São milissegundos, e é neles que o dano
                 mora.
                 ⚠ E O MOTIVO VAI NO `title` — regra da OC: botão desabilitado diz por quê, com a
                 mesma frase que o aviso do corpo. */
              disabled={salvando || (corrigindo && carregandoFin)}
              title={corrigindo && carregandoFin
                ? 'Lendo os serviços e os impostos desta carga — é deles que ela é refeita.'
                : undefined}
              className="gap-1">
              <Save className="h-4 w-4" /> {salvando ? 'Salvando…' : 'Salvar carga'}
            </Button>
          )}
          resumo={(
            /* ⚠ O RESUMO NÃO MUDA COM A ABA — Lei de Estabilidade Visual. Ele descreve a CARGA, e
                a carga é a mesma nas três; trocar o conteúdo ao trocar de aba faria o operador
                reaprender onde o número mora a cada clique.
                ⚠ E ELE DESCREVE A CARGA INTEIRA: o peso é o somado das metades e os talhões vêm
                juntos ("IND.05 · IND.06"). Era aqui que 12,15 t brigava com R$ 20.585,50 — a
                metade no peso e a carga inteira no valor, na mesma coluna. */
            <div className="divide-y">
              <div className="py-1">
                <div className="px-3 pb-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Carga
                </div>
                <Par rotulo="Peso líquido" valor={traco(t, 2, ' t')} forte />
                <Par rotulo="Talhões" valor={talhoesDaCarga
                  ?? (areas.find(a => a.id === areaId)?.pastoNome || '—')} />
                <Par rotulo="Rendimento" valor={traco(num(form.rendimentoG), 0, ' g')} />
                <Par rotulo="Comprador" valor={form.industriaNome || '—'} />
              </div>
              <div className="py-1">
                <div className="px-3 pb-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Faturamento
                </div>
                <Par rotulo="Venda" valor={resultado.venda > 0 ? formatMoeda(resultado.venda) : '—'} />
                <Par rotulo="Impostos" valor={resultado.impostos > 0 ? `−${formatMoeda(resultado.impostos)}` : '—'} />
              </div>
              <div className="py-1">
                <div className="px-3 pb-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Serviços
                </div>
                {TIPOS_SERVICO.map(({ tipo, rotulo }) => {
                  /* ⚠ SOMA OS DOIS NOMES DO MESMO SERVIÇO: as cargas do backfill guardam
                     'arranquio' e 'carregamento', a RPC nova grava 'mao_obra' e 'trator'. O
                     rótulo é um só, e a linha tem de somar os dois — senão a carga antiga mostra
                     "—" num serviço que ela pagou. */
                  const soma = compromissos
                    .filter(c => c.rotulo === rotulo)
                    .reduce((acc, c) => acc + Math.abs(c.valor), 0);
                  return (
                    <Par key={tipo} rotulo={rotulo}
                      valor={soma > 0 ? `−${formatMoeda(soma)}` : '—'} />
                  );
                })}
              </div>
              <div className="py-1">
                <div className="px-3 pb-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Resultado da carga
                </div>
                {/* ⚠ VENDA − IMPOSTOS − SERVIÇOS, sobre o que está GRAVADO. É "quanto esta carga
                    rendeu", não "quanto já entrou no caixa" — essa é a pergunta da conciliação, e
                    responder as duas no mesmo número seria o erro que o DRE já pagou uma vez. */}
                <Par rotulo="Líquido"
                  valor={compromissos.length === 0 ? '—' : formatMoeda(resultado.liquido)} forte />
              </div>
            </div>
          )}>

          {/* ⚠ A ROLAGEM DESCE PARA O NÍVEL CERTO — A21, e o conserto NÃO é um `sticky` no cabeçalho
              azul. Ele já não rolava: é irmão do scrollport do envelope, não filho. Quem subia
              eram a faixa de abas e as quatro caixas de totais, porque moravam DENTRO da coluna
              que rola (`LancamentoModalEnvelope:92`). Trocar de aba com a lista rolada deixava o
              operador sem as abas na tela.
              ⚠ `h-full` É O QUE DÁ ALTURA A ISTO. Sem ela o filho cresce à vontade e o
              `overflow-y-auto` de baixo nunca tem o que conter — era o caso. Em telas estreitas o
              grid do envelope é de uma coluna e não passa altura: ali a rolagem continua sendo a
              de fora, como hoje. */}
          <div className="flex h-full min-h-0 flex-col">
            {/* ⚠ O SEGMENTADO DA CASA, não os botões manuais da OC — e aqui a diferença é
                decisão, não gosto. Os três shells da OC marcam a aba aberta de DUAS formas
                diferentes entre si (sublinhado na Compra, pílula na Venda e no Abate), e o mock
                desta tela desenhou uma terceira. A regra permanente do CLAUDE.md diz que seleção
                se marca com navy preenchido e que aba nova usa este componente — então é ele.
                ⚠ ALTURA 22, a das réguas de cabeçalho: a faixa já existia com uma aba só e não
                pode crescer, senão as três abas custam altura da lista que elas servem. */}
            <div className="shrink-0 border-b pb-1">
              <Segmentado valor={aba} onEscolher={setAba} altura={22}
                opcoes={[
                  { valor: 'colheita', rotulo: 'Colheita' },
                  { valor: 'servicos', rotulo: 'Serviços' },
                  { valor: 'financeiro', rotulo: 'Financeiro' },
                ]} />
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-b-md border border-t-0 bg-card p-2.5">
              {/* ⚠ A RECUSA APARECE INTEIRA E NO TOPO. `_cancelar` devolve a lista de lançamentos
                  já realizados ou conciliados e NÃO muda nada; dizer só "não foi possível" deixaria
                  o operador sem saber qual baixa desfazer no Financeiro. */}
              {/* ⚠ O AVISO DE RECONSTRUÇÃO SAIU com a trava — a carga edita. Enquanto os
                  compromissos não chegam, porém, o formulário AINDA não sabe os serviços: salvar
                  nesse instante mandaria o payload cego que apagou a 9287581. O aviso abaixo
                  ocupa exatamente essa janela, e some sozinho. */}
              {corrigindo && carregandoFin && (
                <div className="rounded-md border border-amber-500/50 bg-amber-50 p-2 dark:border-amber-500/40 dark:bg-amber-950/30">
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-3 w-3" />
                    Lendo os serviços e os impostos desta carga…
                  </div>
                  <p className="mt-1 text-[10px] leading-snug text-amber-800/90 dark:text-amber-300/90">
                    Espere os números aparecerem antes de salvar: é deles que a carga é refeita.
                  </p>
                </div>
              )}

              {travados.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2">
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-destructive">
                    <AlertTriangle className="h-3 w-3" />
                    A carga não foi alterada — há lançamento realizado ou conciliado
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {travados.map(l => (
                      <li key={l.lancamento_id} className="text-[10px] text-muted-foreground">
                        {l.descricao || l.lancamento_id}
                        {l.status && <span className="text-destructive"> · {l.status}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {aba === 'colheita' && (
                <>
                <div className="grid grid-cols-[1.1fr_2fr] gap-2">
                  <div>
                    <Label className="text-[10px]">Data <span className="text-destructive">*</span></Label>
                    <DatePicker value={form.dataColheita}
                      onChange={v => onChange({ ...form, dataColheita: v, valorBruto: null })}
                      className="mt-0.5" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Talhão <span className="text-destructive">*</span></Label>
                    <Select value={areaId} onValueChange={onAreaChange}>
                      <SelectTrigger className={cn('mt-0.5 h-8 text-[12px]', FOCO)}>
                        <SelectValue placeholder="Escolha o talhão desta carga" />
                      </SelectTrigger>
                      <SelectContent>
                        {areas.map(a => (
                          <SelectItem key={a.id} value={a.id} className="text-[12px]">
                            {a.pastoNome} · {formatNum(a.area_plantada_ha, 2)} ha
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* ⚠ "COMPRADOR", NÃO "FORNECEDOR": quem paga a carga é a indústria, e o rótulo tem
                    de dizer o papel dela nesta operação. O cadastro por trás é o mesmo — um
                    `financeiro_fornecedores` —, e é ele que a RPC exige em `p_industria_id`. */}
                {/* ⚠ A CONTA ENTROU NESTA LINHA, e ela não é detalhe: sem conta o compromisso não
                    aparece na conciliação — `fn_extrato_conciliar_mes` escolhe candidatos por
                    `conta_efetiva_id`. A RPC grava por direção; aqui se escolhe uma vez, para os
                    seis lançamentos da carga.
                    ⚠ E NÃO SE INFERE: o NJ tem dez contas correntes ativas. O que vem pronto é a
                    conta da ÚLTIMA carga deste talhão, no mesmo contrato âmbar dos preços de
                    serviço — proposta que o operador confere, nunca decisão da tela. */}
                <div className="grid grid-cols-[2fr_1.4fr_1fr_1fr] items-end gap-2">
                  {/* ⚠ O RÓTULO É DAQUI, NÃO DO SELETOR — A16, mesma altura na mesma linha. O
                      `FornecedorSelect` separa rótulo e controle com `space-y-1` (4px) e todo o
                      resto desta linha usa `mt-0.5` (2px): dois pixels, e o bloco do Comprador
                      subia acima dos três vizinhos.
                      ⚠ CEDE O LOCAL, NÃO O COMPARTILHADO: o seletor é usado em dezenas de telas e
                      mudar o espaçamento dele para acertar esta linha mexeria em todas. Sem `label`
                      ele não imprime rótulo nenhum, e o `space-y-1` com um filho só não separa
                      nada — então o alinhamento passa a ser o dos vizinhos. O `*` vem junto porque
                      era o `required` do seletor que o desenhava. */}
                  {clienteId ? (
                    <div>
                      <Label className="text-[10px] text-muted-foreground">
                        Comprador<span className="ml-0.5 text-destructive">*</span>
                      </Label>
                      <div className="mt-0.5">
                        <FornecedorSelect
                          clienteId={clienteId}
                          placeholder="A indústria que recebe a carga"
                          fornecedorId={form.industriaId}
                          onFornecedorChange={(id, nome) =>
                            onChange({ ...form, industriaId: id, industriaNome: nome, valorBruto: null })}
                        />
                      </div>
                    </div>
                  ) : <div />}
                  <div>
                    <Label className="text-[10px] text-muted-foreground">
                      Conta<span className="ml-0.5 text-destructive">*</span>
                    </Label>
                    <ContaBancariaSelect
                      value={form.contaId ?? '__none__'}
                      onValueChange={v => onChange({ ...form, contaId: v === '__none__' ? null : v, valorBruto: null })}
                      contas={contas.map(c => ({
                        id: c.id, nome_conta: c.nome_conta, nome_exibicao: c.nome_exibicao,
                        tipo_conta: c.tipo_conta ?? null,
                      }))}
                      placeholder="Quem paga"
                      className={cn('mt-0.5 h-8 text-[12px]', FOCO)}
                    />
                  </div>
                  <CampoNF valor={form.nf} onChange={v => campo('nf', v)}
                    dica="A nota da indústria — é ela que agrupa o ICMS." />
                  <Campo rotulo="Ticket" valor={form.ticket} onChange={v => campo('ticket', v)} />
                </div>

                <div className="grid grid-cols-5 gap-2">
                  <Campo rotulo="Peso bruto (kg)" valor={form.pesoBrutoKg} numerico obrigatorio
                    dica="O que a balança da indústria pesou."
                    onChange={v => campo('pesoBrutoKg', v)} />
                  <Campo rotulo="Desconto (kg)" valor={form.descontoKg} numerico
                    dica="Terra e impureza descontados no ticket."
                    onChange={v => campo('descontoKg', v)} />
                  {/* ⚠ A ÚNICA CONTA DA TELA — ver o cabeçalho do arquivo. */}
                  <Derivado rotulo="Peso líquido (t)" valor={t} sufixo="t"
                    dica="Peso bruto menos o desconto, em toneladas." />
                  <Campo rotulo="Rendimento (g)" valor={form.rendimentoG} numerico casas={0} obrigatorio
                    dica="Gramas de amido por 5 kg de raiz, do laudo da indústria."
                    onChange={v => campo('rendimentoG', v)} />
                  <Campo rotulo="Preço (R$/g)" valor={form.precoG} numerico obrigatorio
                    dica="O preço negociado por grama de rendimento."
                    onChange={v => campo('precoG', v)} />
                </div>

                <div className="grid grid-cols-[1fr_1fr] gap-2">
                  {/* ⚠ O VALOR BRUTO NÃO SE DIGITA NEM SE CALCULA: ele é o que a RPC gravou. */}
                  <Derivado rotulo="Valor bruto (R$)" valor={form.valorBruto}
                    dica={form.valorBruto == null
                      ? 'A indústria fecha o valor: ele aparece depois de salvar, como a RPC gravou.'
                      : 'O valor do lançamento de venda desta carga.'} />
                  {/* ⚠ O CAMPO MOSTRA O QUE O OPERADOR ESCREVEU, não o que a migração escreveu.
                      As 21 cargas ativas trazem "dividida por area entre IND.05 e IND.06 ...
                      backfill 16/09/2026" e nenhuma tem palavra de gente — e depois da fusão essa
                      frase virou mentira, porque a carga é UMA.
                      ⚠ ESCONDER NÃO É APAGAR, e a dica diz isso: o texto continua na coluna, para
                      quem for auditar o backfill. Limpar o banco é um UPDATE, e é decisão do
                      Gabriel — o front só parou de repetir o metadado. */}
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Observações</Label>
                    <Input
                      value={observacoesDoOperador(form.observacoes)}
                      onChange={e => campo('observacoes', e.target.value)}
                      title={temMetadadoDeMigracao(form.observacoes)
                        ? 'Esta carga tem uma nota do backfill guardada no banco, que a tela não '
                          + 'mostra. O que você escrever aqui substitui o que aparece.'
                        : undefined}
                      className={cn('mt-0.5 h-8 text-[12px]', FOCO)} />
                  </div>
                </div>

                {/* ── NOTA ── */}
                <div className="rounded-md border p-2">
                  <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Nota
                  </div>
                  {/* ⚠ QUATRO COLUNAS, E A ORDEM SEGUE A NATUREZA: os três primeiros são retidos da
                      VENDA (dedução de receita); o ICMS de transporte é CUSTO sobre o frete e fica
                      por último, separado, porque cai noutro subcentro do DRE. */}
                  <div className="grid grid-cols-[1fr_1fr_1fr_1fr] items-end gap-2">
                    <div>
                      <Label className="flex items-center gap-1 text-[10px]">
                        ICMS (R$)
                        {icmsTravado && <Lock className="h-2.5 w-2.5 text-muted-foreground" />}
                      </Label>
                      <CampoMoeda valor={icmsTravado ? 0 : num(form.icms)}
                        disabled={icmsTravado}
                        onChange={n => campo('icms', n == null ? '' : String(n))}
                        className={cn('mt-0.5 h-8 text-right font-mono text-[12px]', FOCO,
                          icmsTravado && 'bg-muted text-muted-foreground')} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Funrural (R$)</Label>
                      <CampoMoeda valor={num(form.funrural)}
                        onChange={n => campo('funrural', n == null ? '' : String(n))}
                        className={cn('mt-0.5 h-8 text-right font-mono text-[12px]', FOCO)} />
                    </div>
                    <div>
                      <Label className="text-[10px]">INSS (R$)</Label>
                      <CampoMoeda valor={num(form.inss)}
                        onChange={n => campo('inss', n == null ? '' : String(n))}
                        className={cn('mt-0.5 h-8 text-right font-mono text-[12px]', FOCO)} />
                    </div>
                    <div>
                      {/* ⚠ "DO FRETE" NO RÓTULO, e não é zelo: sem isso ele lê como o ICMS de cima e
                          o operador digita o mesmo número duas vezes. Este vai para Transporte
                          Agrícola (13090), junto do frete que ele tributa. */}
                      <Label className="text-[10px]">ICMS do frete (R$)</Label>
                      <CampoMoeda valor={num(form.icmsTransporte)}
                        onChange={n => campo('icmsTransporte', n == null ? '' : String(n))}
                        className={cn('mt-0.5 h-8 text-right font-mono text-[12px]', FOCO)} />
                    </div>
                  </div>
                  {/* ⚠ O MOTIVO DE ESTAR DESLIGADO FICA ESCRITO ABAIXO, não só no `title` — a
                      regra da OC. Aqui ele diz QUAL nota já levou o imposto.
                      ⚠ E SAIU DA GRADE: com quatro campos não sobra coluna para a frase, e espremê-la
                      cortaria justamente o número da nota, que é o que ela veio dizer. */}
                  <div className="mt-1">
                    <span className="text-[10px] leading-snug text-muted-foreground">
                      {icmsTravado
                        ? `ICMS da venda já lançado na NF ${form.nf || '—'} — uma vez por nota. O do frete é por carga.`
                        : ''}
                    </span>
                  </div>
                </div>
                </>
              )}

              {aba === 'servicos' && (
                <>
                {/* ── SERVIÇOS POR TONELADA ── */}
                <div className="rounded-md border p-2">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Serviços por tonelada
                    </span>
                    {/* ⚠ O ÂMBAR DIZ "PROPOSTA, CONFIRA": os preços vêm da última carga da safra, e
                        o operador é quem sabe se o arranquio desta semana mudou. */}
                    <span className="text-[9px] text-amber-700">
                      proposta da última carga · confira
                    </span>
                    <div className="flex-1" />
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {servicosPrevisto != null ? `≈ ${formatMoeda(servicosPrevisto)}` : '—'}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {TIPOS_SERVICO.map(({ tipo, rotulo }) => {
                      const s = servico(tipo);
                      /* ⚠ ÂMBAR SÓ ENQUANTO FOR PROPOSTA — a carga gravada não tem proposta
                         nenhuma, e pintar de âmbar um número já conferido mentiria sobre o estado. */
                      const proposto = form.ids.length === 0 && s.preco_t != null;
                      return (
                        <div key={tipo} className="grid grid-cols-[0.6fr_2fr_1fr] items-end gap-2">
                          <span className="pb-2 text-[10px] text-muted-foreground">{rotulo}</span>
                          {clienteId ? (
                            <FornecedorSelect
                              clienteId={clienteId}
                              label=""
                              placeholder="Prestador"
                              fornecedorId={s.fornecedor_id}
                              onFornecedorChange={id => mudarServico(tipo, { fornecedor_id: id })}
                            />
                          ) : <div />}
                          <div>
                            <Label className="text-[10px]">R$/t</Label>
                            <CampoMoeda valor={s.preco_t}
                              onChange={n => mudarServico(tipo, { preco_t: n })}
                              className={cn('mt-0.5 h-8 text-right font-mono text-[12px]', FOCO,
                                proposto && 'border-amber-500 bg-amber-50 text-amber-900')} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                </>
              )}

              {/* ═══ FINANCEIRO — os compromissos que a carga criou ══════════════════
                  ⚠ SÓ LEITURA NESTA FASE. Cada linha é um lançamento que a RPC já gravou; editar
                  banco e data é a fase 2, e mandar o payload completo (o que destrava o corrigir)
                  é a fase 3. Mostrar sem deixar agir é deliberado: o operador precisa CONFERIR o
                  que a carga gerou antes de a edição voltar.
                  ⚠ E É AQUI QUE O MODELO FICA VISÍVEL: cada serviço e cada imposto é um
                  compromisso a pagar, que a conciliação vira "Pago" sozinha pelo gatilho. */}
              {aba === 'financeiro' && (
                <>
                  {/* ⚠ OS TOTAIS FICAM — A21, "cabeçalho e totais fixos, só o corpo rolando".
                      E aqui o `sticky` FUNCIONA porque o scrollport passou a existir logo acima:
                      ele ancora no ascendente que rola, e esta tela agora tem um. Escrever este
                      mesmo `sticky` antes daquela mudança não teria feito nada — foi o que já
                      aconteceu duas vezes na casa, na lista de movimentações e na prévia do
                      custeio.
                      ⚠ FUNDO OPACO E `z` ACIMA, pela mesma regra: transparente é pior que não
                      fixar, porque as linhas passariam por baixo do número que se confere.
                      O `-m*`/`p*` devolve a borda de sangria que o padding do container comeria. */}
                  <div className="sticky top-0 z-10 -mx-2.5 -mt-2.5 bg-card px-2.5 pt-2.5">
                    <BlocoTopoAba itens={[
                      { rotulo: 'A receber', valor: topoFin.aReceber > 0 ? formatMoeda(topoFin.aReceber) : null },
                      { rotulo: 'Recebido', valor: topoFin.recebido > 0 ? formatMoeda(topoFin.recebido) : null },
                      { rotulo: 'Despesas', valor: topoFin.despesas > 0 ? formatMoeda(topoFin.despesas) : null },
                      { rotulo: 'Pagas', valor: topoFin.pagas > 0 ? formatMoeda(topoFin.pagas) : null },
                    ]} />
                  </div>

                  {carregandoFin ? (
                    <p className="px-1 py-6 text-center text-[11px] text-muted-foreground">
                      Lendo os compromissos da carga…
                    </p>
                  ) : compromissos.length === 0 ? (
                    <p className="px-1 py-6 text-center text-[11px] text-muted-foreground">
                      {corrigindo
                        ? 'Esta carga não tem lançamento ativo.'
                        : 'Os compromissos aparecem depois de salvar a carga.'}
                    </p>
                  ) : (
                    <div className="rounded-md border divide-y divide-border/60">
                      {compromissos.map(c => (
                        <div key={c.lancamentoId}>
                        {/* ⚠ A LINHA INTEIRA ABRE O COMPROMISSO — Decisão B. O alvo é a linha e
                            não um ícone de 12px na ponta: é nela que o operador já está olhando
                            quando decide que o número está errado.
                            ⚠ `<div role="button">` E NÃO `<button>`: a linha contém a pílula com
                            `title` e os números alinhados, e um `<button>` os achataria para o seu
                            próprio alinhamento de texto. O `tabIndex` e o Enter/Espaço devolvem o
                            teclado que o elemento nativo daria.
                            ⚠ CATÁLOGO VAZIO NÃO ABRE: sem os quatro `load*`, o diálogo mostraria
                            fornecedor e conta em branco num lançamento que os tem — e Salvar
                            gravaria nulo por cima. Enquanto carregam, a linha não é clicável e o
                            cursor não promete o que a tela não pode cumprir. */}
                        <div
                          {...(c.editavel && catalogosProntos ? {
                            role: 'button' as const,
                            tabIndex: 0,
                            onClick: () => { void abrirCompromisso(c.lancamentoId); },
                            onKeyDown: (e: React.KeyboardEvent) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                void abrirCompromisso(c.lancamentoId);
                              }
                            },
                            title: 'Abrir o compromisso no Financeiro',
                          } : {})}
                          className={cn('flex items-center gap-2 px-2.5 py-[7px] leading-[1.35]',
                            c.editavel && catalogosProntos
                              && 'cursor-pointer hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none')}>
                          {/* O ponto repete a cor da pílula: a linha se lê de longe sem ler o texto. */}
                          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full',
                            c.status === 'pago' ? 'bg-emerald-500'
                              : c.status === 'parcial' ? 'bg-orange-500' : 'bg-amber-500')} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12px] font-medium">
                              {c.rotulo}
                              {c.favorecido && <span className="text-muted-foreground"> · {c.favorecido}</span>}
                            </div>
                            <div className="truncate text-[10px] text-muted-foreground">
                              {c.falta > 0 && (
                                <span className="font-medium text-amber-700 dark:text-amber-500">
                                  {c.entrada ? 'falta receber' : 'falta pagar'} {formatMoeda(c.falta)}
                                </span>
                              )}
                              {c.falta > 0 && (c.dataVencimento || c.conta) && ' · '}
                              {c.dataVencimento && `vence ${diaMes(c.dataVencimento)}`}
                              {c.dataVencimento && c.conta && ' · '}
                              {c.conta}
                            </div>
                          </div>
                          {/* ⚠ LARGURA FIXA NOS DOIS NÚMEROS — A19. O R$/t e o total não refluem
                              quando um valor cresce, e o total nunca trunca: são eles que o
                              operador confere contra o extrato. */}
                          <span className="w-[86px] shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                            {c.unitario ?? (ehImposto(c.papel) ? 'imposto' : '')}
                          </span>
                          <span className={cn('w-[104px] shrink-0 text-right text-[12px] font-medium tabular-nums',
                            c.entrada ? 'text-emerald-700 dark:text-emerald-500' : 'text-rose-700 dark:text-rose-400')}>
                            {c.entrada ? '+' : '−'}{formatMoeda(Math.abs(c.valor))}
                          </span>
                          <span className={cn('shrink-0 rounded px-1.5 py-px text-[9px] font-semibold',
                            PILULA[c.status].classe)}
                            title={c.status === 'parcial'
                              ? `${formatMoeda(c.pago)} de ${formatMoeda(Math.abs(c.valor))}` : undefined}>
                            {PILULA[c.status].rotulo}
                            {/* ⚠ O QUANTO FALTA VAI NA PRÓPRIA PÍLULA quando é parcial: "Parcial"
                                sozinho diz que falta algo e esconde quanto, e é o quanto que o
                                operador precisa para decidir se cobra ou espera. */}
                            {c.status === 'parcial' && ` · falta ${formatMoeda(c.falta)}`}
                          </span>
                          {/* ⚠ O CADEADO SÓ NO QUE NÃO PODE MUDAR, e com o motivo no `title` — a
                              mesma regra do ICMS travado da aba Colheita: avisar ANTES de o
                              operador tentar, não depois de a RPC recusar.
                              ⚠ E O `⋯` SAIU: a linha inteira é o botão, então um segundo alvo de
                              clique ao lado dela só criaria a dúvida sobre qual dos dois abre o
                              quê. Quem não é editável não vira botão e mostra o cadeado. */}
                          {!c.editavel && (
                            <span className="shrink-0 px-1" title={c.motivoTravado ?? undefined}>
                              <Lock className="h-2.5 w-2.5 text-muted-foreground" />
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    </div>
                  )}
                </>
              )}

            </div>
          </div>
        </LancamentoModalEnvelope>
      </DialogContent>

      {/* ⚠ IRMÃO DO `DialogContent`, NÃO FILHO — o padrão do `ConciliarExtratoDialog` (linha 635),
          que é o outro diálogo da casa a abrir este por cima de si. Dentro do conteúdo ele herdaria
          o `onInteractOutside` que este modal bloqueia, e fechar o de cima fecharia os dois.
          ⚠ `carregando` ENQUANTO OS CATÁLOGOS NÃO CHEGAM: formulário editável com seletor vazio é
          o caminho para gravar nulo por cima de dado bom. Esqueleto e Salvar travado até os quatro
          estarem na mão. */}
      <LancamentoV2Dialog
        open={!!editandoLanc}
        carregando={!catalogosProntos}
        onClose={() => setEditandoLanc(null)}
        onSave={async (formLanc, id) => {
          const ok = id ? await fin.editarLancamento(id, formLanc) : false;
          /* ⚠ RECARREGA A CARGA INTEIRA, não só a linha: valor, favorecido e vencimento alimentam
             as quatro caixas do topo, o resumo lateral e o resultado da carga. Atualizar só a
             lista deixaria o total dizendo um número e a linha dele, outro, na mesma tela. */
          if (ok) recarregarFin();
          return ok;
        }}
        lancamento={editandoLanc}
        fazendas={fazendas}
        contas={fin.contasBancarias}
        classificacoes={fin.classificacoes}
        fornecedores={fin.fornecedores}
        safras={fin.safras}
        onCriarFornecedor={fin.criarFornecedor}
      />
    </Dialog>
  );
}
