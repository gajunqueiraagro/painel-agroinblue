/**
 * PATR-01 · PR B — aba LANÇAMENTOS do bem: os ligados (a soma é o valor de aquisição), ligar, desligar e o valor sem lançamento.
 * ⚠ LIGAR SÓ LIGA (decisão 5): nada do lançamento muda. "a conferir" (a parte sumiu, deixou de ser investimento, lançamento cancelado)
 * aparece com "—" e não soma; o SELO (o lançamento foi dividido de outro jeito depois de ligado) segue somando. Previsto fora de
 * contrato fica "a realizar". As frases vêm do banco (`fn_patrimonio_bem_lancamentos`).
 * ⚠ O VALOR SEM LANÇAMENTO (bem anterior ao sistema) e a ESTIMATIVA (pasto antigo, R$/ha × área) são do cadastro do bem: mudam
 * aqui e gravam no Salvar do modal — também no bem NOVO, antes do 1º Salvar (a terra num passo); só o LIGAR pede o bem gravado.
 */
import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import { CampoNumeroComConta } from '@/components/ui/campo-numero-com-conta';
import { Segmentado } from '@/components/ui/segmentado';
import { BlocoFormulario } from '@/components/ui/bloco-formulario';
import { useFazenda } from '@/contexts/FazendaContext';
import { cn } from '@/lib/utils';
import { usePatrimonioApi, useRelerPatrimonio } from '@/hooks/usePatrimonio';
import { brl, dataBR, mesBR, n2, type BemDaLista } from '@/lib/patrimonio/patrimonio';
import type { FormBem, LancamentoDoBem } from '@/lib/patrimonio/patrimonioApi';
import { Barra, Link, PedirMotivo, QUADRO_MODAL, TD_MODAL, TD_MODAL_NUM, TD_MODAL_TEXTO, TFOOT_MODAL, TH_MODAL, TH_MODAL_NUM } from './pecas';
import { LigarLancamentosDialog } from './LigarLancamentosDialog';

const ROTULO_STATUS: Record<string, string> = { realizado: 'realizado', previsto: 'previsto', programado: 'programado', agendado: 'agendado' };

export function AbaLancamentos({ bemId, clienteId, form, set, lancamentos, linha, ehPastagem, areaDosPastos, erroValor }: {
  bemId: string | null; clienteId: string; form: FormBem; set: <K extends keyof FormBem>(k: K, v: FormBem[K]) => void;
  lancamentos: LancamentoDoBem[]; linha: BemDaLista | null; ehPastagem: boolean; areaDosPastos: number; erroValor?: boolean;
}) {
  const api = usePatrimonioApi();
  const reler = useRelerPatrimonio();
  const { fazendas } = useFazenda();
  const codigoDa = useMemo(() => new Map(fazendas.map(f => [f.id, f.codigo ?? f.nome])), [fazendas]);
  const [ligando, setLigando] = useState(false);
  const [desligando, setDesligando] = useState<LancamentoDoBem | null>(null);
  const [editandoValor, setEditandoValor] = useState(form.origem_valor !== 'lancamentos' || !bemId);

  const soma = lancamentos.reduce((t, l) => t + (l.estado === 'soma' ? l.valor ?? 0 : 0), 0);
  const aRealizar = lancamentos.reduce((t, l) => t + (l.estado === 'a_realizar' ? l.valor ?? 0 : 0), 0);
  const valorExtra = form.origem_valor === 'sem_lancamento' ? form.valor_sem_lancamento ?? 0
    : form.origem_valor === 'estimativa' ? Math.round((form.estimativa_rs_ha ?? 0) * (form.estimativa_area_ha ?? 0) * 100) / 100 : 0;

  return (
    <BlocoFormulario titulo="Lançamentos ligados a este bem" dica="a soma é o valor de aquisição — ligar só liga, o lançamento não muda" className="min-h-0 flex-1">
      <div className={QUADRO_MODAL} data-testid="bem-lancamentos">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            {/* Subcentro 210 a 9,5 px: os subcentros de Investimento cabem (o maior comum, "Investimento Máquinas e Equip. Silvicultura", 200) */}
            <col style={{ width: 52 }} /><col style={{ width: 66 }} /><col /><col style={{ width: 140 }} /><col style={{ width: 210 }} />
            <col style={{ width: 40 }} /><col style={{ width: 80 }} /><col style={{ width: 84 }} /><col style={{ width: 70 }} /><col style={{ width: 20 }} />
          </colgroup>
          <thead className="text-primary-foreground">
            <tr className="h-[22px]">
              <th className={TH_MODAL}>Comp.</th><th className={TH_MODAL}>Pgto</th><th className={TH_MODAL}>Descrição</th><th className={TH_MODAL}>Fornecedor</th>
              <th className={TH_MODAL}>Subcentro</th><th className={TH_MODAL}>Faz.</th><th className={TH_MODAL}>NF</th><th className={TH_MODAL_NUM}>Valor R$</th>
              <th className={TH_MODAL}>Status</th><th className={TH_MODAL} />
            </tr>
          </thead>
          <tbody>
            {valorExtra > 0 && (
              <tr className="h-[19px] border-b border-border/40" data-testid="bem-valor-sem-lancamento">
                <td className={TD_MODAL} /><td className={TD_MODAL} />
                <td colSpan={5} className={cn(TD_MODAL_TEXTO, 'text-muted-foreground')}>
                  {form.origem_valor === 'estimativa'
                    ? `estimativa — ${n2(form.estimativa_rs_ha ?? 0)} R$/ha × ${n2(form.estimativa_area_ha ?? 0)} ha (sem custo registrado)`
                    : 'sem lançamento no sistema — valor informado (bem anterior ao sistema)'}
                </td>
                <td className={TD_MODAL_NUM}>{n2(valorExtra)}</td><td className={TD_MODAL}>informado</td><td className={TD_MODAL} />
              </tr>
            )}
            {lancamentos.map(l => {
              const conferir = l.estado === 'a_conferir';
              return (
                <tr key={l.vinculo_id} className={cn('h-[19px] border-b border-border/40', conferir && 'bg-amber-50/60')} data-testid="bem-lancamento">
                  <td className={cn(TD_MODAL_NUM, 'text-left text-[9.5px]')}>{mesBR(l.data)}</td>
                  <td className={cn(TD_MODAL_NUM, 'text-left text-[9.5px]')}>{dataBR(l.data_pagamento)}</td>
                  <td className={TD_MODAL_TEXTO} title={`${l.descricao ?? ''}${l.partes_total && l.partes_total > 1 ? ` · parte ${l.parte_ordem} de ${l.partes_total}` : ''}`}>
                    {l.descricao ?? '—'}{l.partes_total && l.partes_total > 1 ? ` · parte ${l.parte_ordem}/${l.partes_total}` : ''}
                  </td>
                  <td className={TD_MODAL_TEXTO} title={l.fornecedor ?? undefined}>{l.fornecedor ?? '—'}</td>
                  <td className={cn(TD_MODAL_TEXTO, 'text-[9.5px]')} title={l.subcentro ?? undefined}>{l.subcentro ?? '—'}</td>
                  <td className={cn(TD_MODAL, 'whitespace-nowrap')}>{l.fazenda_id ? codigoDa.get(l.fazenda_id) ?? '—' : '—'}</td>
                  <td className={cn(TD_MODAL_NUM, 'text-left text-[9.5px]')} title={l.numero_documento ?? undefined}>{l.numero_documento ?? '—'}</td>
                  <td className={TD_MODAL_NUM}>{l.valor != null ? n2(l.valor) : '—'}</td>
                  <td className={cn(TD_MODAL, 'whitespace-nowrap overflow-hidden')} title={l.motivo ?? l.selo ?? (l.de_contrato ? 'parcela da compra: soma pelo total do contrato' : undefined)}>
                    {conferir ? <span className="text-amber-700">a conferir</span>
                      : <>{l.estado === 'a_realizar' ? <span className="text-muted-foreground">a realizar</span> : ROTULO_STATUS[l.status_transacao ?? ''] ?? l.status_transacao ?? '—'}
                          {l.selo && <span className="ml-1 text-amber-700">!</span>}{l.repetida && <span className="ml-1 text-amber-700" title="possível repetição">≈</span>}</>}
                  </td>
                  <td className={cn(TD_MODAL, 'px-0 text-center')}>
                    <button type="button" className="text-muted-foreground hover:text-destructive" title="Desligar deste bem (o lançamento não muda)"
                      onClick={() => setDesligando(l)}><X className="mx-auto h-3 w-3" /></button>
                  </td>
                </tr>
              );
            })}
            {lancamentos.length === 0 && valorExtra === 0 && (
              <tr className="h-[19px]"><td colSpan={10} className={cn(TD_MODAL, 'py-4 text-center text-muted-foreground')}>Nenhum lançamento ligado — use “+ ligar lançamento”.</td></tr>
            )}
          </tbody>
          <tfoot className={TFOOT_MODAL}>
            <tr className="h-[22px]">
              <td colSpan={2} className="px-1 text-[10px]" />
              <td colSpan={5} className="truncate px-1 text-[10px]">
                {lancamentos.length} {lancamentos.length === 1 ? 'lançamento' : 'lançamentos'}{valorExtra > 0 ? ' + valor informado' : ''}
                {aRealizar > 0 ? ` · a realizar ${brl(aRealizar)}` : ''}
              </td>
              <td className="whitespace-nowrap px-1 text-right text-[10px] tabular-nums">{n2(soma + valorExtra)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      <Barra>
        <Link onClick={() => setLigando(true)} disabled={!bemId} title={bemId ? undefined : 'salve o bem antes de ligar lançamentos'} testId="bem-ligar">+ ligar lançamento</Link>
        <Link onClick={() => { setEditandoValor(true); if (form.origem_valor === 'lancamentos') set('origem_valor', 'sem_lancamento'); }}>
          + valor sem lançamento (bem anterior ao sistema)
        </Link>
        <span className="flex-1" />
        {linha && linha.n_a_conferir + linha.n_selo > 0 && (
          <span className="text-amber-700">{linha.n_a_conferir + linha.n_selo} a conferir</span>
        )}
      </Barra>
      {/* O VALOR SEM LANÇAMENTO / A ESTIMATIVA — linha fixa; grava no Salvar do modal */}
      <div className={cn('flex h-[30px] shrink-0 items-center gap-2 text-[10px]', !editandoValor && 'invisible')} data-testid="bem-editor-valor">
        <Segmentado altura={24} valor={form.origem_valor} onEscolher={v => set('origem_valor', v)} opcoes={[
          { valor: 'lancamentos', rotulo: 'Só lançamentos' },
          { valor: 'sem_lancamento', rotulo: 'Valor sem lançamento' },
          { valor: 'estimativa', rotulo: 'Estimativa R$/ha × área', desabilitada: !ehPastagem, title: ehPastagem ? undefined : 'só para pastagem antiga sem custo registrado' },
        ]} />
        {form.origem_valor === 'sem_lancamento' && (
          <div className="w-[150px]"><CampoMoeda valor={form.valor_sem_lancamento} onChange={v => set('valor_sem_lancamento', v)} className={cn('h-[24px] text-[11px]', erroValor && 'border-destructive')} /></div>
        )}
        {form.origem_valor === 'estimativa' && (
          <>
            <div className="w-[120px]"><CampoMoeda valor={form.estimativa_rs_ha} onChange={v => set('estimativa_rs_ha', v)} className={cn('h-[24px] text-[11px]', erroValor && 'border-destructive')} /></div>
            <span className="text-muted-foreground">R$/ha ×</span>
            <div className="w-[90px]"><CampoNumeroComConta valor={form.estimativa_area_ha ?? (areaDosPastos > 0 ? areaDosPastos : null)} onChange={v => set('estimativa_area_ha', v)} className="h-[24px] text-[11px]" /></div>
            <span className="text-muted-foreground">ha</span>
          </>
        )}
        <span className="text-muted-foreground">grava no Salvar</span>
      </div>

      {ligando && bemId && <LigarLancamentosDialog bemId={bemId} clienteId={clienteId} aoFechar={() => setLigando(false)} />}
      <PedirMotivo aberto={desligando != null} aoFechar={() => setDesligando(null)} titulo="Desligar lançamento"
        frase="O lançamento volta para “Investimentos sem bem” e não muda em nada. Por que desligar?" rotuloDoBotao="Desligar"
        aoConfirmar={async motivo => {
          if (!desligando) return null;
          const r = await api.desligar(bemId, [{ lancamento_id: desligando.lancamento_id, parte_ordem: desligando.parte_ordem }], motivo);
          if (!r.ok) return r.erro;
          toast.success('Lançamento desligado do bem.');
          await reler();
          return null;
        }} />
    </BlocoFormulario>
  );
}
