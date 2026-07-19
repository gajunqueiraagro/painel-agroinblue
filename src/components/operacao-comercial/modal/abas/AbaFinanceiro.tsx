import { useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { ModalOCCtx, NaturezaParte, ParcelaDraft } from '../tipos';
import { planoTipoOperacao } from '@/hooks/usePlanoContasOC';

const NAT_LABEL: Record<NaturezaParte, string> = { principal: 'Receita', deducao: 'Dedução', acrescimo: 'Acréscimo' };
const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function AbaFinanceiro({ ctx }: { ctx: ModalOCCtx }) {
  const { draft, patch, plano, componentes } = ctx;
  const tipoPlano = planoTipoOperacao(draft.tipo_operacao, 'principal');
  const principal = draft.parcelas.find(p => p.natureza === 'principal') ?? null;

  // Semeia a parcela principal (valor 0, componente 'principal') como alvo da
  // classificação. O valor é preenchido pelo operador — o motor exige Σ principal > 0.
  useEffect(() => {
    if (!principal) {
      patch({ parcelas: [{
        key: 'principal', descricao: 'Principal', natureza: 'principal', componente: 'principal', valor: 0,
        incluso_no_total: true, macro_custo: null, grupo_custo: null, centro_custo: null, subcentro: null, plano_conta_id: null,
      }, ...draft.parcelas] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principal]);

  const updateParcela = (key: string, upd: Partial<ParcelaDraft>) =>
    patch({ parcelas: draft.parcelas.map(p => (p.key === key ? { ...p, ...upd } : p)) });
  const removeParcela = (key: string) => patch({ parcelas: draft.parcelas.filter(p => p.key !== key) });
  const addParcela = () => patch({ parcelas: [...draft.parcelas, {
    key: crypto.randomUUID(), descricao: '', natureza: 'deducao', componente: '', valor: 0, incluso_no_total: true,
    macro_custo: null, grupo_custo: null, centro_custo: null, subcentro: null, plano_conta_id: null,
  }] });

  // Cascata do plano (aplica à parcela principal).
  const setNivel = (nivel: 'macro' | 'grupo' | 'centro' | 'subcentro', value: string) => {
    if (!principal) return;
    if (nivel === 'macro') updateParcela(principal.key, { macro_custo: value, grupo_custo: null, centro_custo: null, subcentro: null, plano_conta_id: null });
    else if (nivel === 'grupo') updateParcela(principal.key, { grupo_custo: value, centro_custo: null, subcentro: null, plano_conta_id: null });
    else if (nivel === 'centro') updateParcela(principal.key, { centro_custo: value, subcentro: null, plano_conta_id: null });
    else {
      // Resolve pela hierarquia completa já selecionada (não por chave parcial).
      const resol = plano.resolvePlanoConta(tipoPlano, principal.macro_custo, principal.grupo_custo, principal.centro_custo, value);
      updateParcela(principal.key, {
        subcentro: value,
        // Só vincula quando há EXATAMENTE uma linha real; ambíguo/zero => não vincula.
        plano_conta_id: resol.status === 'ok' ? resol.item.id : null,
      });
    }
  };

  const c = principal;
  const macros = plano.cascata.macros(tipoPlano);
  const grupos = c?.macro_custo ? plano.cascata.grupos(tipoPlano, c.macro_custo) : [];
  const centros = c?.macro_custo && c?.grupo_custo ? plano.cascata.centros(tipoPlano, c.macro_custo, c.grupo_custo) : [];
  const subcentros = c?.macro_custo && c?.grupo_custo && c?.centro_custo ? plano.cascata.subcentros(tipoPlano, c.macro_custo, c.grupo_custo, c.centro_custo) : [];
  const resol = plano.resolvePlanoConta(tipoPlano, c?.macro_custo ?? null, c?.grupo_custo ?? null, c?.centro_custo ?? null, c?.subcentro ?? null);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-5">
        <h3 className="font-bold text-lg">Informações Financeiras</h3>
        <p className="text-sm text-muted-foreground mb-4">Revise e ajuste a classificação financeira da operação.</p>

        <div className="font-semibold text-sm mb-2">Classificação contábil</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SelectField label="Macro custo" required value={c?.macro_custo ?? ''} options={macros} disabled={!principal} onChange={v => setNivel('macro', v)} />
          <SelectField label="Grupo de custo" required value={c?.grupo_custo ?? ''} options={grupos} disabled={!c?.macro_custo} onChange={v => setNivel('grupo', v)} />
          <SelectField label="Centro de custo" required value={c?.centro_custo ?? ''} options={centros} disabled={!c?.grupo_custo} onChange={v => setNivel('centro', v)} />
          <SelectField label="Subcentro de custo" required value={c?.subcentro ?? ''} options={subcentros} disabled={!c?.centro_custo} onChange={v => setNivel('subcentro', v)} />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Tipo de operação <span className="text-destructive">*</span></Label>
            <Input value={tipoPlano} disabled className="h-9 bg-muted" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sinal <span className="text-destructive">*</span></Label>
            <Input value={tipoPlano === '1-Entradas' ? '+1 (Crédito / Entrada)' : '-1 (Débito / Saída)'} disabled className="h-9 bg-muted" />
          </div>
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs flex items-center justify-between">
            <div>
              <div className="text-muted-foreground">Plano de conta</div>
              <div className="font-medium">{c?.subcentro ? `${c.macro_custo ?? ''} › ${c.centro_custo ?? ''} › ${c.subcentro}` : 'Não classificado'}</div>
            </div>
            {resol.status === 'ok' && (
              <span className="flex items-center gap-1 text-green-600 text-[11px]"><CheckCircle2 className="h-3.5 w-3.5" /> Vinculado</span>
            )}
            {resol.status === 'ambiguous' && (
              <span className="flex items-center gap-1 text-destructive text-[11px]"><AlertTriangle className="h-3.5 w-3.5" /> Ambíguo ({resol.count}) — bloqueado</span>
            )}
            {resol.status === 'none' && c?.subcentro && (
              <span className="text-muted-foreground text-[11px]">Não vinculado</span>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5">
        <div className="flex items-center justify-between mb-1">
          <div>
            <div className="font-semibold">Parcelas financeiras</div>
            <div className="text-xs text-muted-foreground">Itens que compõem o valor financeiro da operação.</div>
          </div>
          <Button variant="outline" size="sm" onClick={addParcela} className="gap-1"><Plus className="h-4 w-4" /> Adicionar parcela</Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-2 font-medium">Descrição</th>
                <th className="text-left py-2 font-medium">Tipo</th>
                <th className="text-left py-2 font-medium">Componente</th>
                <th className="text-left py-2 font-medium">Valor (R$)</th>
                <th className="text-center py-2 font-medium">Incluso</th>
                <th className="text-right py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {draft.parcelas.length === 0 && (
                <tr><td colSpan={6} className="py-3 text-center text-xs text-muted-foreground">Defina a negociação para gerar a parcela principal.</td></tr>
              )}
              {draft.parcelas.map(p => {
                const compsNatureza = componentes.porNatureza(p.natureza);
                return (
                <tr key={p.key} className="border-b">
                  <td className="py-1.5 pr-2">
                    <Input value={p.descricao} onChange={e => updateParcela(p.key, { descricao: e.target.value })} className="h-8" placeholder="Descrição" />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Select value={p.natureza} onValueChange={v => updateParcela(p.key, { natureza: v as NaturezaParte, componente: '' })}>
                      <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(['principal', 'deducao', 'acrescimo'] as NaturezaParte[]).map(n => <SelectItem key={n} value={n}>{NAT_LABEL[n]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <Select value={p.componente || undefined} onValueChange={v => updateParcela(p.key, { componente: v })}>
                      <SelectTrigger className="h-8 w-[150px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {compsNatureza.map(comp => <SelectItem key={comp.codigo} value={comp.codigo}>{comp.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input type="number" inputMode="decimal" value={String(p.valor)} onChange={e => updateParcela(p.key, { valor: Number(e.target.value) || 0 })} className="h-8 w-[120px]" />
                  </td>
                  <td className="py-1.5 text-center">
                    <input type="checkbox" checked={p.incluso_no_total} onChange={e => updateParcela(p.key, { incluso_no_total: e.target.checked })} />
                  </td>
                  <td className="py-1.5 text-right">
                    <button onClick={() => removeParcela(p.key)} className="text-destructive/80 hover:text-destructive"><Trash2 className="h-4 w-4 inline" /></button>
                  </td>
                </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td colSpan={5} className="py-2 text-right">Total líquido da operação</td>
                <td className="py-2 text-right text-primary">{fmt(ctx.totalLiquido)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function SelectField({ label, required, value, options, disabled, onChange }: {
  label: string; required?: boolean; value: string; options: string[]; disabled?: boolean; onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label} {required && <span className="text-destructive">*</span>}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
