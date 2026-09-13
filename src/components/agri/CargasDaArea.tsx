/**
 * AS CARGAS DE UM TALHÃO — AGRI-COLHEITA-TELA-01.
 *
 * ⚠ UM BLOCO, DOIS LUGARES: a tela de Produção › Lançar › Agricultura e o painel de área do
 * cadastro montam ESTE componente. Escrever a lista duas vezes deixaria as duas livres para
 * divergir — e a que diverge em silêncio neste repo é sempre a segunda cópia.
 * ⚠ O HOOK VEM DE FORA, de propósito. Na tela de Produção o consolidado da safra e a lista do
 * talhão têm de ser a MESMA leitura: com o hook aqui dentro seriam duas consultas e dois
 * estados, e salvar uma carga mudaria a lista sem mudar o total logo acima dela.
 * ⚠ CABEÇALHO E FORM FIXOS, SÓ AS LINHAS ROLAM (A21). A rolagem está no container da tabela,
 * não na página: é o mesmo arranjo do drill do DRE, e pelo mesmo motivo — quem confere uma
 * carga precisa do nome da coluna à vista.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Plus, Trash2, Pencil, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import {
  LIMITE_AFLATOXINA, cargaVazia, validarCarga, type CargaForm,
} from '@/lib/agri/colheita';
import type { ColheitaRow, useColheita } from '@/hooks/useColheita';

/** A linha do banco vira campo de texto — vírgula decimal, porque é o que se digita. */
const texto = (v: number | null): string => (v == null ? '' : String(v).replace('.', ','));

const doBanco = (r: ColheitaRow): CargaForm => ({
  id: r.id,
  dataColheita: r.data_colheita ?? '',
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
  observacoes: r.observacoes ?? '',
});

/** O cabeçalho da lista, na ordem em que a cooperativa lê o romaneio. */
const COLUNAS = [
  { h: 'Data', a: 'text-left' }, { h: 'Ticket', a: 'text-left' }, { h: 'NF', a: 'text-left' },
  { h: 'Verde (kg)', a: 'text-right' }, { h: 'Seco (kg)', a: 'text-right' },
  { h: 'Umid. %', a: 'text-right' }, { h: 'Afla. ppb', a: 'text-right' },
  { h: 'Sacas boas', a: 'text-right' }, { h: 'Roça (sc)', a: 'text-right' },
  { h: '', a: 'text-right' },
] as const;

const TH = 'sticky top-0 z-10 bg-[#f1f3f5] shadow-[inset_0_-1px_0_#e2e8f0] px-1.5 py-1'
  + ' text-[9px] font-semibold uppercase tracking-wide text-[#1e3a5f]';

function Campo({ rotulo, valor, onChange, numerico, obrigatorio, dica }: {
  rotulo: string; valor: string; onChange: (v: string) => void;
  numerico?: boolean; obrigatorio?: boolean; dica?: string;
}) {
  return (
    <div>
      <Label className="text-[10px]">
        {rotulo}{obrigatorio && <span className="text-destructive"> *</span>}
      </Label>
      <Input value={valor} onChange={e => onChange(e.target.value)} title={dica}
        inputMode={numerico ? 'decimal' : undefined}
        className={cn('mt-0.5 h-7 text-[11px]', numerico && 'text-right font-mono')} />
    </div>
  );
}

export function CargasDaArea({
  clienteId, safraAreaId, cultura, areaHa, linhas, salvarCarga, excluirCarga, somenteLeitura,
}: {
  clienteId: string | null | undefined;
  safraAreaId: string;
  cultura: string;
  areaHa: number;
  /** Só as cargas DESTE talhão — quem filtra é quem chama, que é dono da leitura. */
  linhas: readonly ColheitaRow[];
  salvarCarga: ReturnType<typeof useColheita>['salvarCarga'];
  excluirCarga: ReturnType<typeof useColheita>['excluirCarga'];
  somenteLeitura?: boolean;
}) {
  /** `null` = nenhum form aberto. */
  const [form, setForm] = useState<CargaForm | null>(null);
  const [salvando, setSalvando] = useState(false);

  const editar = (campo: keyof CargaForm, valor: string) =>
    setForm(f => (f ? { ...f, [campo]: valor } : f));

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── FIXO: ação e form ── */}
      <div className="shrink-0">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[11px] font-bold text-foreground">{labelDaCultura(cultura)}</span>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {formatNum(areaHa, 2)} ha · {linhas.length} {linhas.length === 1 ? 'carga' : 'cargas'}
          </span>
          <div className="flex-1" />
          <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]"
            disabled={somenteLeitura || !!form}
            onClick={() => setForm(cargaVazia())}>
            <Plus className="h-3 w-3" /> Nova carga
          </Button>
        </div>

        {form && (
          /* ⚠ GRADE, NÃO PILHA: são treze campos, e um embaixo do outro eles empurrariam a
             lista para fora da tela — que é a coisa que se veio conferir. */
          <div className="mb-2 rounded-md border bg-muted/20 p-2">
            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 md:grid-cols-4">
              <div>
                <Label className="text-[10px]">Data <span className="text-destructive">*</span></Label>
                <DatePicker value={form.dataColheita} onChange={v => editar('dataColheita', v)}
                  size="compact" className="mt-0.5" />
              </div>
              <Campo rotulo="Ticket balança" valor={form.ticketBalanca} onChange={v => editar('ticketBalanca', v)} />
              <Campo rotulo="NF produtor" valor={form.nfProdutor} onChange={v => editar('nfProdutor', v)} />
              <Campo rotulo="Filial" valor={form.filial} onChange={v => editar('filial', v)} />

              <Campo rotulo="Peso verde (kg)" valor={form.pesoVerdeKg} numerico
                dica="O que embarcou na fazenda." onChange={v => editar('pesoVerdeKg', v)} />
              <Campo rotulo="Peso seco (kg)" valor={form.pesoSecoKg} numerico
                dica="O que a cooperativa devolveu depois de secar — chega dias depois, e fica em branco até chegar."
                onChange={v => editar('pesoSecoKg', v)} />
              <Campo rotulo="Umidade (%)" valor={form.umidadePct} numerico onChange={v => editar('umidadePct', v)} />
              <Campo rotulo="Aflatoxina (ppb)" valor={form.aflatoxinaPpb} numerico
                dica={`O corte da cooperativa é ${LIMITE_AFLATOXINA} ppb — o número entra aqui como veio do laudo.`}
                onChange={v => editar('aflatoxinaPpb', v)} />

              <Campo rotulo="Sacas boas" valor={form.sacasBoas} numerico onChange={v => editar('sacasBoas', v)} />
              <Campo rotulo="Grão de roça (sc)" valor={form.graoRocaSacas} numerico onChange={v => editar('graoRocaSacas', v)} />
              <Campo rotulo="Grão de roça (kg)" valor={form.graoRocaKg} numerico onChange={v => editar('graoRocaKg', v)} />
              <Campo rotulo="Renda líquida (%)" valor={form.rendaLiquidaPct} numerico onChange={v => editar('rendaLiquidaPct', v)} />

              <div className="col-span-2 md:col-span-4">
                <Label className="text-[10px]">Observações</Label>
                <Input value={form.observacoes} onChange={e => editar('observacoes', e.target.value)}
                  className="mt-0.5 h-7 text-[11px]" />
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1" />
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-[11px]"
                disabled={salvando} onClick={() => setForm(null)}>
                <X className="h-3 w-3" /> Cancelar
              </Button>
              <Button size="sm" className="h-7 gap-1 text-[11px]" disabled={salvando} onClick={gravar}>
                <Save className="h-3 w-3" /> {salvando ? 'Salvando…' : 'Salvar carga'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── ROLA: só as linhas ── */}
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr>
              {COLUNAS.map(c => <th key={c.h} className={cn(TH, c.a)}>{c.h}</th>)}
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr><td colSpan={COLUNAS.length} className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                Nenhuma carga lançada neste talhão.
              </td></tr>
            )}
            {linhas.map(l => (
              <tr key={l.id} className="border-t border-slate-100 odd:bg-[#1e3a5f]/[0.03]">
                <td className="whitespace-nowrap px-1.5 py-1 tabular-nums">
                  {l.data_colheita ? l.data_colheita.slice(8, 10) + '/' + l.data_colheita.slice(5, 7) + '/' + l.data_colheita.slice(2, 4) : '—'}
                </td>
                <td className="px-1.5 py-1">{l.ticket_balanca || '—'}</td>
                <td className="px-1.5 py-1">{l.nf_produtor || '—'}</td>
                <td className="px-1.5 py-1 text-right tabular-nums">{l.peso_verde_kg != null ? formatNum(l.peso_verde_kg, 2) : '—'}</td>
                <td className="px-1.5 py-1 text-right tabular-nums">{l.peso_seco_kg != null ? formatNum(l.peso_seco_kg, 2) : '—'}</td>
                <td className="px-1.5 py-1 text-right tabular-nums">{l.umidade_pct != null ? formatNum(l.umidade_pct, 2) : '—'}</td>
                {/* ⚠ SEM COR NA AFLATOXINA: a faixa é da cooperativa e aparece no consolidado.
                    Pintar a linha aqui faria a tela julgar a carga antes do laudo fechar. */}
                <td className="px-1.5 py-1 text-right tabular-nums">{l.aflatoxina_ppb != null ? formatNum(l.aflatoxina_ppb, 2) : '—'}</td>
                <td className="px-1.5 py-1 text-right tabular-nums">{l.sacas_boas != null ? formatNum(l.sacas_boas, 2) : '—'}</td>
                <td className="px-1.5 py-1 text-right tabular-nums">{l.grao_roca_sacas != null ? formatNum(l.grao_roca_sacas, 2) : '—'}</td>
                <td className="whitespace-nowrap px-1.5 py-1 text-right">
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    disabled={somenteLeitura} title="Editar esta carga"
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
        </table>
      </div>
    </div>
  );
}
