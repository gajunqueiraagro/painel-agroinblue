/**
 * AS CARGAS DE UM TALHÃO — AGRI-COLHEITA-TELA-01, em modal desde o MODAL-04.
 *
 * ⚠ UM BLOCO, DOIS LUGARES: a tela de Produção › Lançar › Agricultura e o painel de área do
 * cadastro montam ESTE componente. Escrever a lista duas vezes deixaria as duas livres para
 * divergir — e a que diverge em silêncio neste repo é sempre a segunda cópia.
 * ⚠ O HOOK VEM DE FORA, de propósito. Na tela de Produção o consolidado da safra e a lista do
 * talhão têm de ser a MESMA leitura: com o hook aqui dentro seriam duas consultas e dois
 * estados, e salvar uma carga mudaria a lista sem mudar o total logo acima dela.
 * ⚠ A LISTA SÓ MOSTRA O RESUMO DA CARGA. Os treze campos moram no modal; o form inline que
 * havia aqui empurrava a lista para fora da tela toda vez que se ia lançar — e é a lista o
 * que se veio conferir.
 * ⚠ CABEÇALHO FIXO, SÓ AS LINHAS ROLAM (A21). A rolagem está no container da tabela, não na
 * página: quem confere uma carga precisa do nome da coluna à vista.
 */
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
/* ⚠ `parseMoeda`, como no validador: a derivação lê o MESMO texto que a gravação vai ler.
   Com dois parsers, "26.560" viraria 1.062 sacas num lugar e 1 no outro. */
import { parseMoeda } from '@/lib/calculos/numeroBR';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { CargaModal } from '@/components/agri/CargaModal';
import {
  cargaVazia, validarCarga, sacasDoPeso, unidadeDaCultura, faixaAflatoxina, totaisColheita,
  type CargaForm,
} from '@/lib/agri/colheita';
import type { ColheitaRow, useColheita } from '@/hooks/useColheita';
import { useOrdenacaoTabela, type ColunaOrdenavel } from '@/hooks/useOrdenacaoTabela';
import { ThOrdenavel } from '@/components/ui/th-ordenavel';

/**
 * A linha do banco vira campo de texto — JÁ FORMATADO em pt-BR.
 *
 * ⚠ `String(26180)` DAVA "26180" NA CARA DO OPERADOR: o `CampoNumero` formata no blur, e
 * abrir uma carga para editar não dispara blur nenhum. O campo mostrava o número cru
 * justamente na hora em que se está conferindo contra o romaneio — e "26180" ao lado de
 * "26.180,00" no papel é exatamente o tipo de diferença que faz duvidar do sistema.
 */
const texto = (v: number | null): string => (v == null ? '' : formatNum(v, 2));

const doBanco = (r: ColheitaRow): CargaForm => ({
  id: r.id,
  dataColheita: r.data_colheita ?? '',
  /* `time` do Postgres vem "14:55:00"; o campo de hora do navegador quer "14:55". */
  horaChegada: (r.hora_chegada ?? '').slice(0, 5),
  ticketBalanca: r.ticket_balanca ?? '',
  nfProdutor: r.nf_produtor ?? '',
  filial: r.filial ?? '',
  pesoVerdeKg: texto(r.peso_verde_kg),
  pesoSecoKg: texto(r.peso_seco_kg),
  umidadePct: texto(r.umidade_pct),
  aflatoxinaPpb: texto(r.aflatoxina_ppb),
  sacasBoas: texto(r.sacas_boas),
  graoRocaSacas: texto(r.grao_roca_sacas),
  graoRocaKg: texto(r.grao_roca_kg),
  rendaLiquidaPct: texto(r.renda_liquida_pct),
  taxaSecagem: texto(r.taxa_secagem),
  valorSecagem: texto(r.valor_secagem),
  observacoes: r.observacoes ?? '',
});

/**
 * O CABEÇALHO DA LISTA, na ordem em que a cooperativa lê o romaneio — e a régua de ordenação
 * de cada coluna (PR-TABELA-SORT-01).
 *
 * ⚠ O TIPO É DA COLUNA, NÃO DO VALOR, e é o que faz 180 vir depois de 27: como texto, "180"
 * viria antes de "27" porque "1" < "2". Data e hora ordenam como texto de propósito — vêm em
 * ISO (`yyyy-mm-dd`) e `HH:MM`, onde a ordem alfabética É a cronológica, sem construir mil
 * `Date` a cada render.
 */
const COLUNAS_BASE: ReadonlyArray<ColunaOrdenavel<ColheitaRow, string> & { h: string; direita?: boolean }> = [
  { coluna: 'data', h: 'Data', tipo: 'data', valor: l => l.data_colheita },
  { coluna: 'hora', h: 'Hora', tipo: 'data', valor: l => l.hora_chegada },
  { coluna: 'ticket', h: 'Ticket', tipo: 'texto', valor: l => l.ticket_balanca },
  { coluna: 'nf', h: 'NF', tipo: 'texto', valor: l => l.nf_produtor },
  { coluna: 'verde', h: 'Verde (kg)', tipo: 'numero', direita: true, valor: l => l.peso_verde_kg },
  { coluna: 'seco', h: 'Seco (kg)', tipo: 'numero', direita: true, valor: l => l.peso_seco_kg },
  { coluna: 'umidade', h: 'Umid. %', tipo: 'numero', direita: true, valor: l => l.umidade_pct },
  { coluna: 'aflatoxina', h: 'Afla. ppb', tipo: 'numero', direita: true, valor: l => l.aflatoxina_ppb },
  { coluna: 'sacas', h: 'Sacas boas', tipo: 'numero', direita: true, valor: l => l.sacas_boas },
  { coluna: 'roca', h: 'Roça (sc)', tipo: 'numero', direita: true, valor: l => l.grao_roca_sacas },
];

/**
 * ⚠ A FAZENDA VEM ANTES DO TALHÃO, e o código curto ("PUR", "BG") sai da coluna `codigo` das
 * fazendas — não das três primeiras letras do nome, que dariam "Faz" para quase todas.
 * ⚠ A COLUNA TALHÃO É A PRIMEIRA DEPOIS DELA, E SEMPRE — decisão do Gabriel. Mesmo com um talhão só ela
 * fica: uma coluna que aparece e some conforme a seleção obriga o operador a reaprender a
 * tabela a cada troca, e a lista deixa de se ler igual de um dia para o outro (A23).
 * ⚠ ELA ORDENA PELO NOME DO PASTO, que é o que se vê — não pelo id, que ninguém lê. Ordenar
 * por ela agrupa a cultura visualmente em "Todos os talhões".
 */
const colunasCom = (nomePorId: Map<string, string>, fazPorId: Map<string, string>) => ([
  {
    coluna: 'fazenda', h: 'Faz', tipo: 'texto' as const,
    valor: (l: ColheitaRow) => fazPorId.get(l.safra_area_id) ?? '',
  },
  {
    coluna: 'talhao', h: 'Talhão', tipo: 'texto' as const,
    valor: (l: ColheitaRow) => nomePorId.get(l.safra_area_id) ?? '',
  },
  ...COLUNAS_BASE,
]);

/**
 * ⚠ CABEÇALHO ESCURO, COMO O DA CENTRAL DE OPERAÇÕES — `bg-primary` com
 * `text-primary-foreground`, o padrão que a casa já usa em tabela densa
 * (`CentralOperacoesComerciais:811`). Não é cor solta: é o mesmo azul do cabeçalho dos modais.
 * Sobre ele o hover é `primary-foreground/10`, também de lá — um hover escuro sumiria.
 * ⚠ O FUNDO PRECISA SER OPACO porque o cabeçalho gruda: translúcido, as linhas passariam por
 * baixo do nome da coluna. `bg-primary` é sólido.
 */
/**
 * ⚠ `hover:brightness-110`, NUNCA `hover:bg-…`: uma classe de background no hover SUBSTITUI o
 * `bg-primary` em vez de se somar a ele — o `primary-foreground/10` que estava aqui pintava o
 * `<th>` de branco a 10% sobre o card, e o cabeçalho inteiro clareava a ponto de sumir. Filtro
 * clareia o azul mantendo o azul.
 * ⚠ SEM `uppercase`: "Primeira maiúscula, resto minúsculo" (decisão do Gabriel) — e o rótulo
 * já vem escrito assim em `COLUNAS`, então a classe é que sobrava.
 */
const TH = 'sticky top-0 z-10 bg-primary px-1 py-0.5 text-[9px] font-semibold'
  + ' text-primary-foreground transition-[filter] hover:brightness-110';

/** O rodapé de totais: mesmo fundo do cabeçalho, para as duas bordas da lista se lerem juntas. */
/** ⚠ O RÓTULO NO MESMO TOM DOS NÚMEROS: ele era `text-muted-foreground` sobre azul — escuro
 *  demais, mais apagado que os valores que deveria apresentar. */
const TFOOT = 'sticky bottom-0 z-10 bg-primary px-1 py-0.5 text-[9px] font-bold tabular-nums'
  + ' text-primary-foreground';

/** O talhão como esta lista precisa conhecê-lo. */
export interface TalhaoDaLista {
  id: string;
  cultura: string;
  area_plantada_ha: number;
  pastoNome: string;
  fazendaNome?: string | null;
  fazendaCodigo?: string | null;
}

export function CargasDaArea({
  clienteId, talhoes, talhoesDaCultura, talhaoDestino, cultura, safraRotulo,
  linhas, salvarCarga, excluirCarga, somenteLeitura, rotuloTotal,
}: {
  clienteId: string | null | undefined;
  /**
   * ⚠ UM OU VÁRIOS — PR-POR-CULTURA-11. Com "Todos os talhões" a lista mostra as cargas da
   * cultura inteira, e a coluna Talhão é o que diz de qual pasto veio cada uma. Manter a
   * assinatura de um talhão só obrigaria a montar N listas empilhadas, cada uma com seu
   * cabeçalho — e a ordenação por data deixaria de existir entre elas.
   */
  talhoes: readonly TalhaoDaLista[];
  /**
   * TODAS as áreas da cultura — o que o seletor do modal oferece (PR-TALHAO-NO-MODAL-12).
   *
   * ⚠ SEPARADA DE `talhoes` DE PROPÓSITO: aquela é o RECORTE (o que a lista mostra e o que o
   * rodapé soma); esta é o universo para onde a carga pode ir. Com um talhão selecionado, o
   * recorte tem um e o universo tem todos — e é só por isso que dá para mover a carga para
   * fora da lista que se está vendo.
   */
  talhoesDaCultura?: readonly TalhaoDaLista[];
  /**
   * Onde uma carga NOVA cai. `null` em "Todos os talhões" — e aí não há como lançar.
   *
   * ⚠ O BOTÃO DESLIGA COM O MOTIVO ESCRITO AO LADO, a regra da OC: a FK da carga aponta para
   * UM talhão, e escolher "o primeiro" gravaria no pasto errado sem avisar. Editar continua
   * funcionando em "Todos" — a carga gravada já sabe de onde é.
   */
  talhaoDestino: TalhaoDaLista | null;
  cultura: string;
  safraRotulo?: string;
  /** "Total do talhão" ou "Total da cultura", conforme o recorte. */
  rotuloTotal?: string;
  /** Só as cargas DO RECORTE — quem filtra é quem chama, que é dono da leitura. */
  linhas: readonly ColheitaRow[];
  salvarCarga: ReturnType<typeof useColheita>['salvarCarga'];
  excluirCarga: ReturnType<typeof useColheita>['excluirCarga'];
  somenteLeitura?: boolean;
}) {
  /** `null` = modal fechado. */
  const [form, setForm] = useState<CargaForm | null>(null);
  /** A área da carga aberta. `''` em "Todos os talhões" antes de o operador escolher. */
  const [areaId, setAreaId] = useState('');
  const [salvando, setSalvando] = useState(false);
  const temSaca = unidadeDaCultura(cultura).kgPorSaca != null;
  const areasParaEscolha = talhoesDaCultura ?? talhoes;
  const nomePorId = useMemo(
    () => new Map(talhoes.map(t => [t.id, t.pastoNome])), [talhoes]);
  const fazPorId = useMemo(
    () => new Map(talhoes.map(t => [t.id, t.fazendaCodigo || ''])), [talhoes]);
  const COLUNAS = useMemo(() => colunasCom(nomePorId, fazPorId), [nomePorId, fazPorId]);
  /* A área do recorte: um talhão, ou a soma dos da cultura em "Todos". */
  const areaDoRecorte = useMemo(
    () => talhoes.reduce((acc, t) => acc + t.area_plantada_ha, 0), [talhoes]);
  const comoTexto = (v: number | null) => (v == null ? '' : String(v).replace('.', ','));

  /**
   * A REGRA DE DERIVAÇÃO — refeita no POLISH-08.
   *
   * ⚠ MEXEU NO PESO, DERIVA. MEXEU NA SACA, A SACA VENCE. É sequencial, e por isso não há
   * mais estado a guardar: quem mudou por último manda. O PR-02 tinha um `Set` de "campos
   * escritos à mão", e ao REABRIR uma carga ele marcava os dois derivados — para não
   * sobrescrever o romaneio conferido. O efeito era o defeito: editar o peso seco de uma
   * carga gravada não recalculava mais nada, e as sacas ficavam com o valor velho para
   * sempre. Um estado que existia para proteger o dado passou a congelá-lo.
   * ⚠ E O ROMANEIO CONTINUA PROTEGIDO, pelo caminho mais simples: o valor salvo carrega no
   * campo e só muda se alguém mexer no peso — que é justamente quando ele TEM de mudar.
   */
  const editar = (campo: keyof CargaForm, valor: string) => {
    setForm(f => {
      if (!f) return f;
      const novo = { ...f, [campo]: valor };
      /* ⚠ A DERIVAÇÃO É SÓ DO PESO PARA A SACA, nunca o contrário: o peso é o que a balança
         mediu, e recalcular o peso a partir da saca inventaria quilo que ninguém pesou. */
      if (temSaca && campo === 'pesoSecoKg') {
        novo.sacasBoas = comoTexto(sacasDoPeso(parseMoeda(valor), cultura));
      }
      if (temSaca && campo === 'graoRocaKg') {
        novo.graoRocaSacas = comoTexto(sacasDoPeso(parseMoeda(valor), cultura));
      }
      return novo;
    });
  };

  const gravar = async () => {
    if (!form || !clienteId) return;
    /* ⚠ O DESTINO É O QUE O SELETOR DIZ, e não mais o contexto da tela: é isso que permite
       corrigir uma carga lançada no talhão errado sem apagá-la. Vazio não grava — carga sem
       talhão não tem onde existir (a FK é obrigatória). */
    const destino = areaId;
    if (!destino) { toast.error('Escolha o talhão desta carga antes de salvar.'); return; }
    const v = validarCarga(form);
    /* ⚠ O ERRO APARECE, SEMPRE. Botão que diz "salvo" sem gravar é o pior defeito que esta
       tela poderia ter: o romaneio é documento, e o operador não tem como desconfiar. */
    if (!v.ok || !v.payload) { toast.error(v.erro ?? 'Carga inválida.'); return; }
    setSalvando(true);
    try {
      const r = await salvarCarga(destino, form.id, v.payload, clienteId);
      if (!r.ok) { toast.error(r.erro ?? 'Não foi possível salvar a carga.'); return; }
      toast.success(form.id ? 'Carga atualizada.' : 'Carga lançada.');
      setForm(null);
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (l: ColheitaRow) => {
    const r = await excluirCarga(l.id);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível excluir a carga.'); return; }
    toast.success('Carga excluída.');
    if (form?.id === l.id) setForm(null);
  };

  /**
   * ⚠ A MESMA FUNÇÃO DO CONSOLIDADO, sobre as linhas DESTE talhão. O rodapé da lista e a faixa
   * de métricas respondem perguntas diferentes — um talhão contra a safra —, mas pela MESMA
   * régua: somar à mão aqui criaria um segundo total, e seria ele que o operador compararia
   * com o papel.
   */
  const totaisDoTalhao = useMemo(
    () => totaisColheita(linhas.map(doBanco), cultura, areaDoRecorte),
    [linhas, cultura, areaDoRecorte]);

  /* ⚠ SÓ EXIBIÇÃO: o `tfoot` continua somando `linhas`, não `ordenadas` — soma não muda com a
     ordem, e ligá-la à lista ordenada sugeriria que muda. */
  const { ordem, alternar, ordenadas } = useOrdenacaoTabela<ColheitaRow, string>(
    linhas, COLUNAS, { coluna: 'data', direcao: 'asc' });

  const dataBR = (iso: string | null) => (iso && iso.length >= 10
    ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── FIXO: identidade do talhão e a ação ── */}
      <div className="mb-1 flex shrink-0 items-center gap-2">
        <span className="text-[11px] font-bold text-foreground">{labelDaCultura(cultura)}</span>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {formatNum(areaDoRecorte, 2)} ha
          {talhoes.length > 1 && ` · ${talhoes.length} talhões`}
          {' · '}{linhas.length} {linhas.length === 1 ? 'carga' : 'cargas'}
        </span>
        <div className="flex-1" />
        {/* ⚠ O BOTÃO VOLTOU A FICAR LIGADO EM "TODOS OS TALHÕES" — PR-TALHAO-NO-MODAL-12. Ele
            ficava apagado porque a FK precisa de UM talhão e o contexto não tinha qual; agora
            quem responde isso é o seletor do modal, que abre vazio e exige escolha. */}
        <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]"
          disabled={somenteLeitura}
          onClick={() => { setAreaId(talhaoDestino?.id ?? ''); setForm(cargaVazia()); }}>
          <Plus className="h-3 w-3" /> Nova carga
        </Button>
      </div>

      {/* ── ROLA: só as linhas ── */}
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        {/* ⚠ UM TAMANHO SÓ, DECLARADO NA TABELA: as células não repetem `text-[…]`, senão duas
            classes arbitrárias disputam por ordem no CSS e não por especificidade — a lição do
            `TD` da Central. Aqui tudo é 10px. */}
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr>
              {COLUNAS.map(c => (
                <ThOrdenavel key={c.coluna} coluna={c.coluna} rotulo={c.h} ordem={ordem}
                  onOrdenar={alternar} className={TH} alinhaDireita={c.direita} />
              ))}
              {/* A coluna de ações não ordena: não há o que comparar num par de botões. */}
              <th className={cn(TH, 'text-right')} />
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr><td colSpan={COLUNAS.length + 1} className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                Nenhuma carga lançada neste talhão.
              </td></tr>
            )}
            {ordenadas.map(l => (
              <tr key={l.id} className="border-t border-slate-100 odd:bg-[#1e3a5f]/[0.03]">
                <td className="whitespace-nowrap px-1 py-0">{fazPorId.get(l.safra_area_id) || '—'}</td>
                <td className="whitespace-nowrap px-1 py-0">{nomePorId.get(l.safra_area_id) ?? '—'}</td>
                <td className="whitespace-nowrap px-1 py-0 tabular-nums">{dataBR(l.data_colheita)}</td>
                <td className="whitespace-nowrap px-1 py-0 tabular-nums">{(l.hora_chegada ?? '').slice(0, 5) || '—'}</td>
                <td className="px-1 py-0">{l.ticket_balanca || '—'}</td>
                {/* ⚠ A NF FALTAVA AQUI, e era o bug do cabeçalho deslocado: no PR-SORT-01 a
                    coluna entrou no cabeçalho e não na linha, então o `<thead>` tinha onze
                    células e o `<tbody>` dez — cada rótulo caía uma coluna adiante e "Roça"
                    aparecia sobre os botões de ação. Os dados sempre estiveram certos; o que
                    estava errado era a contagem. */}
                <td className="px-1 py-0">{l.nf_produtor || '—'}</td>
                <td className="px-1 py-0 text-right tabular-nums">{l.peso_verde_kg != null ? formatNum(l.peso_verde_kg, 2) : '—'}</td>
                <td className="px-1 py-0 text-right tabular-nums">{l.peso_seco_kg != null ? formatNum(l.peso_seco_kg, 2) : '—'}</td>
                <td className="px-1 py-0 text-right tabular-nums">{l.umidade_pct != null ? formatNum(l.umidade_pct, 2) : '—'}</td>
                {/* ⚠ A COR SAI DE `faixaAflatoxina`, o MESMO corte que o consolidado usa — nunca
                    de um `> 20` escrito aqui. No dia em que a cooperativa mudar o limite, a
                    célula e o total têm de mudar juntos, senão a lista pinta de verde a carga
                    que o rodapé conta como fora de faixa.
                    ⚠ SEM LAUDO CONTINUA CINZA: ausência não é aprovação. */}
                <td className={cn('px-1 py-0 text-right tabular-nums',
                  faixaAflatoxina(l.aflatoxina_ppb) === 'ate' ? 'text-success'
                    : faixaAflatoxina(l.aflatoxina_ppb) === 'acima' ? 'text-destructive'
                      : 'text-muted-foreground')}>
                  {l.aflatoxina_ppb != null ? formatNum(l.aflatoxina_ppb, 2) : '—'}
                </td>
                {/* ⚠ SACA INTEIRA NA CÉLULA, DECIMAL NO BANCO — é o que a Casul faz, e é o que
                    faz o consolidado fechar: cada carga se lê arredondada, o total soma o valor
                    cheio. Somar os arredondados perderia centésimos a cada linha. */}
                <td className="px-1 py-0 text-right tabular-nums" title={l.sacas_boas != null ? `${formatNum(l.sacas_boas, 2)} sc` : undefined}>{l.sacas_boas != null ? formatNum(l.sacas_boas, 0) : '—'}</td>
                {/* ⚠ ROÇA É SEMPRE VERMELHO: ela é refugo, e o vermelho aqui não julga uma
                    faixa — diz o que aquele grão é. Vale onde ele aparecer, na lista e no
                    consolidado. */}
                <td className={cn('px-1 py-0 text-right tabular-nums',
                  l.grao_roca_sacas ? 'text-destructive' : 'text-muted-foreground')}
                  title={l.grao_roca_sacas != null ? `${formatNum(l.grao_roca_sacas, 2)} sc` : undefined}>
                  {l.grao_roca_sacas != null ? formatNum(l.grao_roca_sacas, 0) : '—'}
                </td>
                <td className="whitespace-nowrap px-1 py-0 text-right">
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    disabled={somenteLeitura} title="Editar esta carga"
                    /* A carga abre com os valores salvos — inclusive o talhão dela, que agora
                       é campo editável e não mais o contexto da tela. */
                    onClick={() => { setAreaId(l.safra_area_id); setForm(doBanco(l)); }}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    disabled={somenteLeitura} title="Excluir esta carga"
                    onClick={() => { void remover(l); }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          {/* ── O TOTAL DO TALHÃO, NO RODAPÉ DA PRÓPRIA TABELA ──
              ⚠ `<tfoot>` E NÃO UMA FAIXA ABAIXO: assim cada total cai EMBAIXO DA SUA COLUNA
              por construção, sem replicar larguras que sairiam do lugar no primeiro ajuste
              de coluna. Verde sob Verde, Seco sob Seco — e as colunas que não somam ficam
              vazias, porque somar ticket ou umidade não quer dizer nada.
              ⚠ O `sticky` VAI NAS CÉLULAS, nunca no `<tfoot>`: com `border-collapse` o
              navegador não gruda `tfoot` nem `tr`, só a célula. É a mesma lição do cabeçalho,
              e o fundo tem de ser opaco pelo mesmo motivo. */}
          <tfoot>
            <tr>
              {/* ⚠ `colSpan` ACOMPANHA O CABEÇALHO: são CINCO colunas de identificação antes
                  do primeiro número (fazenda, talhão, data, hora, ticket, NF). Um `colSpan`
                  desatualizado desalinha o total inteiro — foi o defeito do FIX-CABECALHO, e
                  a coluna nova o traria de volta.
                  ⚠ TALHÃO NÃO SOMA: nome não soma, e por isso ele entra no `colSpan` do rótulo
                  em vez de ganhar uma célula de total vazia. */}
              <td className={cn(TFOOT, 'text-left font-semibold')} colSpan={6}>
                {rotuloTotal ?? 'Total do talhão'}
              </td>
              <td className={cn(TFOOT, 'text-right')}>{formatNum(totaisDoTalhao.verdeKg, 2)}</td>
              <td className={cn(TFOOT, 'text-right')}>
                {totaisDoTalhao.secoKg > 0 ? formatNum(totaisDoTalhao.secoKg, 2) : '—'}
              </td>
              <td className={TFOOT} />
              <td className={TFOOT} />
              <td className={cn(TFOOT, 'text-right')}>{formatNum(totaisDoTalhao.sacasBoas, 2)}</td>
              <td className={cn(TFOOT, 'text-right')}>{formatNum(totaisDoTalhao.graoRocaSacas, 2)}</td>
              <td className={TFOOT} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ⚠ O MODAL É IRMÃO DA LISTA, nunca filho de uma linha: assim editar e criar são o
          mesmo componente, e fechar não desmonta a tabela por baixo. */}
      <CargaModal
        aberto={!!form}
        form={form}
        cultura={cultura}
        areas={areasParaEscolha}
        areaId={areaId}
        onAreaChange={setAreaId}
        talhaoRotulo={talhaoDestino
          ? `${talhaoDestino.pastoNome} · ${formatNum(talhaoDestino.area_plantada_ha, 2)} ha`
          : (nomePorId.get(linhas.find(l => l.id === form?.id)?.safra_area_id ?? '') ?? '—')}
        safraRotulo={safraRotulo ?? ''}
        fazendaNome={talhaoDestino?.fazendaNome ?? talhoes[0]?.fazendaNome ?? null}
        salvando={salvando}
        onChange={editar}
        onFechar={() => setForm(null)}
        onSalvar={() => { void gravar(); }}
      />
    </div>
  );
}
