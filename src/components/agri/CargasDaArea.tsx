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

/** A linha do banco vira campo de texto — vírgula decimal, porque é o que se digita. */
const texto = (v: number | null): string => (v == null ? '' : String(v).replace('.', ','));

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

/** O cabeçalho da lista, na ordem em que a cooperativa lê o romaneio. */
const COLUNAS = [
  { h: 'Data', a: 'text-left' }, { h: 'Hora', a: 'text-left' }, { h: 'Ticket', a: 'text-left' },
  { h: 'Verde (kg)', a: 'text-right' }, { h: 'Seco (kg)', a: 'text-right' },
  { h: 'Umid. %', a: 'text-right' }, { h: 'Afla. ppb', a: 'text-right' },
  { h: 'Sacas boas', a: 'text-right' }, { h: 'Roça (sc)', a: 'text-right' },
  { h: '', a: 'text-right' },
] as const;

const TH = 'sticky top-0 z-10 bg-[#f1f3f5] shadow-[inset_0_-1px_0_#e2e8f0] px-1.5 py-1'
  + ' text-[9px] font-semibold uppercase tracking-wide text-[#1e3a5f]';

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
  /**
   * OS CAMPOS QUE O OPERADOR ESCREVEU À MÃO.
   *
   * ⚠ O CÁLCULO SUGERE, O OPERADOR DECIDE — e depois que ele decide, o sistema não desmancha.
   * Sem esta marca, corrigir o peso seco depois de ajustar as sacas jogaria fora o número que
   * a cooperativa mandou, e ninguém veria acontecer.
   */
  const [aMao, setAMao] = useState<Set<keyof CargaForm>>(new Set());
  const temSaca = unidadeDaCultura(cultura).kgPorSaca != null;
  const comoTexto = (v: number | null) => (v == null ? '' : String(v).replace('.', ','));

  const editar = (campo: keyof CargaForm, valor: string) => {
    setForm(f => {
      if (!f) return f;
      const novo = { ...f, [campo]: valor };
      /* ⚠ A DERIVAÇÃO É SÓ DO PESO PARA A SACA, nunca o contrário: o peso é o que a balança
         mediu, e recalcular o peso a partir da saca inventaria quilo que ninguém pesou. */
      if (temSaca && campo === 'pesoSecoKg' && !aMao.has('sacasBoas')) {
        novo.sacasBoas = comoTexto(sacasDoPeso(parseMoeda(valor), cultura));
      }
      if (temSaca && campo === 'graoRocaKg' && !aMao.has('graoRocaSacas')) {
        novo.graoRocaSacas = comoTexto(sacasDoPeso(parseMoeda(valor), cultura));
      }
      return novo;
    });
    if (campo === 'sacasBoas' || campo === 'graoRocaSacas') {
      setAMao(prev => new Set(prev).add(campo));
    }
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
          onClick={() => { setAMao(new Set()); setForm(cargaVazia()); }}>
          <Plus className="h-3 w-3" /> Nova carga
        </Button>
      </div>

      {/* ── ROLA: só as linhas ── */}
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr>{COLUNAS.map(c => <th key={c.h} className={cn(TH, c.a)}>{c.h}</th>)}</tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr><td colSpan={COLUNAS.length} className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                Nenhuma carga lançada neste talhão.
              </td></tr>
            )}
            {linhas.map(l => (
              <tr key={l.id} className="border-t border-slate-100 odd:bg-[#1e3a5f]/[0.03]">
                <td className="whitespace-nowrap px-1.5 py-0.5 tabular-nums">{dataBR(l.data_colheita)}</td>
                <td className="whitespace-nowrap px-1.5 py-0.5 tabular-nums">{(l.hora_chegada ?? '').slice(0, 5) || '—'}</td>
                <td className="px-1.5 py-0.5">{l.ticket_balanca || '—'}</td>
                <td className="px-1.5 py-0.5 text-right tabular-nums">{l.peso_verde_kg != null ? formatNum(l.peso_verde_kg, 2) : '—'}</td>
                <td className="px-1.5 py-0.5 text-right tabular-nums">{l.peso_seco_kg != null ? formatNum(l.peso_seco_kg, 2) : '—'}</td>
                <td className="px-1.5 py-0.5 text-right tabular-nums">{l.umidade_pct != null ? formatNum(l.umidade_pct, 2) : '—'}</td>
                {/* ⚠ A COR SAI DE `faixaAflatoxina`, o MESMO corte que o consolidado usa — nunca
                    de um `> 20` escrito aqui. No dia em que a cooperativa mudar o limite, a
                    célula e o total têm de mudar juntos, senão a lista pinta de verde a carga
                    que o rodapé conta como fora de faixa.
                    ⚠ SEM LAUDO CONTINUA CINZA: ausência não é aprovação. */}
                <td className={cn('px-1.5 py-0.5 text-right tabular-nums',
                  faixaAflatoxina(l.aflatoxina_ppb) === 'ate' ? 'text-success'
                    : faixaAflatoxina(l.aflatoxina_ppb) === 'acima' ? 'text-destructive'
                      : 'text-muted-foreground')}>
                  {l.aflatoxina_ppb != null ? formatNum(l.aflatoxina_ppb, 2) : '—'}
                </td>
                {/* ⚠ SACA INTEIRA NA CÉLULA, DECIMAL NO BANCO — é o que a Casul faz, e é o que
                    faz o consolidado fechar: cada carga se lê arredondada, o total soma o valor
                    cheio. Somar os arredondados perderia centésimos a cada linha. */}
                <td className="px-1.5 py-0.5 text-right tabular-nums" title={l.sacas_boas != null ? `${formatNum(l.sacas_boas, 2)} sc` : undefined}>{l.sacas_boas != null ? formatNum(l.sacas_boas, 0) : '—'}</td>
                <td className="px-1.5 py-0.5 text-right tabular-nums" title={l.grao_roca_sacas != null ? `${formatNum(l.grao_roca_sacas, 2)} sc` : undefined}>{l.grao_roca_sacas != null ? formatNum(l.grao_roca_sacas, 0) : '—'}</td>
                <td className="whitespace-nowrap px-1.5 py-0.5 text-right">
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    disabled={somenteLeitura} title="Editar esta carga"
                    /* ⚠ A CARGA GRAVADA ABRE COM TUDO "À MÃO": os números dela vieram do
                       romaneio e já foram conferidos; recalcular ao reabrir sobrescreveria o
                       que a cooperativa mandou. */
                    onClick={() => {
                      setAMao(new Set(['sacasBoas', 'graoRocaSacas'] as Array<keyof CargaForm>));
                      setForm(doBanco(l));
                    }}>
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
        </table>
      </div>

      {/* ── FIXO: a linha de totais, fora da área que rola ──
          ⚠ ELA NÃO ROLA COM AS LINHAS, e é o mesmo arranjo do TOTAL do drill do DRE: quem
          confere uma lista de trinta cargas precisa do total à vista enquanto percorre o
          meio dela. As colunas alinham com as da tabela acima. */}
      <div className="mt-1 flex shrink-0 items-center gap-3 rounded-md border bg-muted/40 px-2 py-1 text-[10px]">
        <span className="font-semibold uppercase tracking-wide text-muted-foreground">Total do talhão</span>
        <div className="flex-1" />
        <span className="text-muted-foreground">
          verde <b className="tabular-nums text-foreground">{formatNum(totaisDoTalhao.verdeKg, 2)} kg</b>
        </span>
        <span className="text-muted-foreground">
          seco <b className="tabular-nums text-foreground">
            {totaisDoTalhao.secoKg > 0 ? `${formatNum(totaisDoTalhao.secoKg, 2)} kg` : '—'}
          </b>
        </span>
        <span className="text-muted-foreground">
          sacas boas <b className="tabular-nums text-foreground">{formatNum(totaisDoTalhao.sacasBoas, 2)}</b>
        </span>
        <span className="text-muted-foreground">
          roça <b className="tabular-nums text-foreground">{formatNum(totaisDoTalhao.graoRocaSacas, 2)} sc</b>
        </span>
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
