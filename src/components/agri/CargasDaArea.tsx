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
const COLUNAS: ReadonlyArray<ColunaOrdenavel<ColheitaRow, string> & { h: string; direita?: boolean }> = [
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
 * ⚠ CABEÇALHO ESCURO, COMO O DA CENTRAL DE OPERAÇÕES — `bg-primary` com
 * `text-primary-foreground`, o padrão que a casa já usa em tabela densa
 * (`CentralOperacoesComerciais:811`). Não é cor solta: é o mesmo azul do cabeçalho dos modais.
 * Sobre ele o hover é `primary-foreground/10`, também de lá — um hover escuro sumiria.
 * ⚠ O FUNDO PRECISA SER OPACO porque o cabeçalho gruda: translúcido, as linhas passariam por
 * baixo do nome da coluna. `bg-primary` é sólido.
 */
const TH = 'sticky top-0 z-10 bg-primary px-1.5 py-1 text-[9px] font-semibold uppercase'
  + ' tracking-wide text-primary-foreground hover:bg-primary-foreground/10';

/** O rodapé de totais: mesmo fundo do cabeçalho, para as duas bordas da lista se lerem juntas. */
const TFOOT = 'sticky bottom-0 z-10 bg-primary px-1.5 py-1 text-[10px] font-bold tabular-nums'
  + ' text-primary-foreground';

export function CargasDaArea({
  clienteId, safraAreaId, cultura, areaHa, pastoNome, fazendaNome, safraRotulo,
  linhas, salvarCarga, excluirCarga, somenteLeitura,
}: {
  clienteId: string | null | undefined;
  safraAreaId: string;
  cultura: string;
  areaHa: number;
  pastoNome?: string;
  fazendaNome?: string | null;
  safraRotulo?: string;
  /** Só as cargas DESTE talhão — quem filtra é quem chama, que é dono da leitura. */
  linhas: readonly ColheitaRow[];
  salvarCarga: ReturnType<typeof useColheita>['salvarCarga'];
  excluirCarga: ReturnType<typeof useColheita>['excluirCarga'];
  somenteLeitura?: boolean;
}) {
  /** `null` = modal fechado. */
  const [form, setForm] = useState<CargaForm | null>(null);
  const [salvando, setSalvando] = useState(false);
  const temSaca = unidadeDaCultura(cultura).kgPorSaca != null;
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
    const v = validarCarga(form);
    /* ⚠ O ERRO APARECE, SEMPRE. Botão que diz "salvo" sem gravar é o pior defeito que esta
       tela poderia ter: o romaneio é documento, e o operador não tem como desconfiar. */
    if (!v.ok || !v.payload) { toast.error(v.erro ?? 'Carga inválida.'); return; }
    setSalvando(true);
    try {
      const r = await salvarCarga(safraAreaId, form.id, v.payload, clienteId);
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
    () => totaisColheita(linhas.map(doBanco), cultura, areaHa), [linhas, cultura, areaHa]);

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
          {formatNum(areaHa, 2)} ha · {linhas.length} {linhas.length === 1 ? 'carga' : 'cargas'}
        </span>
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]"
          disabled={somenteLeitura}
          onClick={() => setForm(cargaVazia())}>
          <Plus className="h-3 w-3" /> Nova carga
        </Button>
      </div>

      {/* ── ROLA: só as linhas ── */}
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
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
                <td className="whitespace-nowrap px-1.5 py-[1px] tabular-nums">{dataBR(l.data_colheita)}</td>
                <td className="whitespace-nowrap px-1.5 py-[1px] tabular-nums">{(l.hora_chegada ?? '').slice(0, 5) || '—'}</td>
                <td className="px-1.5 py-[1px]">{l.ticket_balanca || '—'}</td>
                <td className="px-1.5 py-[1px] text-right tabular-nums">{l.peso_verde_kg != null ? formatNum(l.peso_verde_kg, 2) : '—'}</td>
                <td className="px-1.5 py-[1px] text-right tabular-nums">{l.peso_seco_kg != null ? formatNum(l.peso_seco_kg, 2) : '—'}</td>
                <td className="px-1.5 py-[1px] text-right tabular-nums">{l.umidade_pct != null ? formatNum(l.umidade_pct, 2) : '—'}</td>
                {/* ⚠ A COR SAI DE `faixaAflatoxina`, o MESMO corte que o consolidado usa — nunca
                    de um `> 20` escrito aqui. No dia em que a cooperativa mudar o limite, a
                    célula e o total têm de mudar juntos, senão a lista pinta de verde a carga
                    que o rodapé conta como fora de faixa.
                    ⚠ SEM LAUDO CONTINUA CINZA: ausência não é aprovação. */}
                <td className={cn('px-1.5 py-[1px] text-right tabular-nums',
                  faixaAflatoxina(l.aflatoxina_ppb) === 'ate' ? 'text-success'
                    : faixaAflatoxina(l.aflatoxina_ppb) === 'acima' ? 'text-destructive'
                      : 'text-muted-foreground')}>
                  {l.aflatoxina_ppb != null ? formatNum(l.aflatoxina_ppb, 2) : '—'}
                </td>
                {/* ⚠ SACA INTEIRA NA CÉLULA, DECIMAL NO BANCO — é o que a Casul faz, e é o que
                    faz o consolidado fechar: cada carga se lê arredondada, o total soma o valor
                    cheio. Somar os arredondados perderia centésimos a cada linha. */}
                <td className="px-1.5 py-[1px] text-right tabular-nums" title={l.sacas_boas != null ? `${formatNum(l.sacas_boas, 2)} sc` : undefined}>{l.sacas_boas != null ? formatNum(l.sacas_boas, 0) : '—'}</td>
                {/* ⚠ ROÇA É SEMPRE VERMELHO: ela é refugo, e o vermelho aqui não julga uma
                    faixa — diz o que aquele grão é. Vale onde ele aparecer, na lista e no
                    consolidado. */}
                <td className={cn('px-1.5 py-[1px] text-right tabular-nums',
                  l.grao_roca_sacas ? 'text-destructive' : 'text-muted-foreground')}
                  title={l.grao_roca_sacas != null ? `${formatNum(l.grao_roca_sacas, 2)} sc` : undefined}>
                  {l.grao_roca_sacas != null ? formatNum(l.grao_roca_sacas, 0) : '—'}
                </td>
                <td className="whitespace-nowrap px-1.5 py-[1px] text-right">
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    disabled={somenteLeitura} title="Editar esta carga"
                    /* A carga abre com os valores salvos; nada é recalculado só por abrir. */
                    onClick={() => setForm(doBanco(l))}>
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
              <td className={cn(TFOOT, 'text-left font-semibold uppercase tracking-wide text-muted-foreground')} colSpan={3}>
                Total do talhão
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
        talhaoRotulo={`${pastoNome ?? '—'} · ${formatNum(areaHa, 2)} ha`}
        safraRotulo={safraRotulo ?? ''}
        fazendaNome={fazendaNome ?? null}
        salvando={salvando}
        onChange={editar}
        onFechar={() => setForm(null)}
        onSalvar={() => { void gravar(); }}
      />
    </div>
  );
}
