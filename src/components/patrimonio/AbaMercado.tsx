/**
 * PATR-01 · PR B — aba VALOR DE MERCADO (decisão 8): avaliações opcionais e históricas (data, fonte, base, valor) e o contábil × mercado.
 * ⚠ TERRA: R$/ha × área, com a BASE (terra nua = VTN do ITR · terra formada = laudo); o total é do banco. Demais: o valor total.
 * Pastagem não tem mercado próprio (a aba fica apagada). A diferença é efeito de mercado — nunca resultado operacional (PATR-02).
 * ⚠ Registrar é imediato (`fn_patrimonio_avaliacao_salvar`); cancelar pede motivo (nada se apaga).
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import { CampoNumeroComConta } from '@/components/ui/campo-numero-com-conta';
import { Segmentado } from '@/components/ui/segmentado';
import { BlocoFormulario } from '@/components/ui/bloco-formulario';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { cn } from '@/lib/utils';
import { usePatrimonioApi, useRelerPatrimonio } from '@/hooks/usePatrimonio';
import { brl, dataBR, n2, type CategoriaBem } from '@/lib/patrimonio/patrimonio';
import type { Avaliacao } from '@/lib/patrimonio/patrimonioApi';
import { Barra, Link, PedirMotivo, QUADRO_MODAL, TD_MODAL, TD_MODAL_NUM, TD_MODAL_TEXTO, TH_MODAL, TH_MODAL_NUM } from './pecas';

const ROTULO_BASE: Record<string, string> = { terra_nua: 'terra nua', terra_formada: 'terra formada', bem: '—' };

export function AbaMercado({ bemId, avaliacoes, categoria, areaDoBem, contabil }: {
  bemId: string; avaliacoes: Avaliacao[]; categoria: CategoriaBem | null; areaDoBem: number | null; contabil: number | null;
}) {
  const api = usePatrimonioApi();
  const reler = useRelerPatrimonio();
  const terra = categoria?.base_mercado === 'terra';
  const [novo, setNovo] = useState(false);
  const [data, setData] = useState(hojeLocal());
  const [fonte, setFonte] = useState('');
  const [base, setBase] = useState<'terra_nua' | 'terra_formada'>('terra_nua');
  const [valorHa, setValorHa] = useState<number | null>(null);
  const [area, setArea] = useState<number | null>(areaDoBem);
  const [total, setTotal] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState<Avaliacao | null>(null);
  const ultima = avaliacoes[0] ?? null;

  const registrar = async () => {
    const r = await api.salvarAvaliacao(bemId, { data, fonte, base: terra ? base : 'bem', valor_ha: terra ? valorHa : null, area_ha: terra ? area : null, valor_total: terra ? null : total });
    if (!r.ok) { setErro(r.erro); return; }
    toast.success('Avaliação registrada.');
    setNovo(false); setFonte(''); setValorHa(null); setTotal(null); setErro(null);
    await reler();
  };

  return (
    <div className="flex min-h-0 flex-1 gap-1.5">
      <BlocoFormulario titulo="Avaliações" dica={terra ? 'terra: R$/ha × área, dizendo a base' : 'valor total do bem'} className="min-h-0 min-w-0 flex-1">
        <div className={QUADRO_MODAL} data-testid="bem-avaliacoes">
          <table className="w-full table-fixed border-collapse">
            <colgroup><col style={{ width: 74 }} /><col /><col style={{ width: 90 }} /><col style={{ width: 100 }} /><col style={{ width: 120 }} /><col style={{ width: 20 }} /></colgroup>
            <thead className="text-primary-foreground">
              <tr className="h-[22px]"><th className={TH_MODAL}>Data</th><th className={TH_MODAL}>Fonte</th><th className={TH_MODAL}>Base</th>
                <th className={TH_MODAL_NUM}>{terra ? 'R$ / ha' : ''}</th><th className={TH_MODAL_NUM}>Total R$</th><th className={TH_MODAL} /></tr>
            </thead>
            <tbody>
              {avaliacoes.map(a => (
                <tr key={a.id} className="h-[19px] border-b border-border/40">
                  <td className={cn(TD_MODAL_NUM, 'text-left text-[9.5px]')}>{dataBR(a.data)}</td>
                  <td className={TD_MODAL_TEXTO} title={a.fonte}>{a.fonte}</td>
                  <td className={cn(TD_MODAL, 'whitespace-nowrap')}>{ROTULO_BASE[a.base] ?? a.base}</td>
                  <td className={TD_MODAL_NUM}>{a.valor_ha != null ? n2(a.valor_ha) : ''}</td>
                  <td className={TD_MODAL_NUM}>{n2(a.valor_total)}</td>
                  <td className={cn(TD_MODAL, 'px-0 text-center')}>
                    <button type="button" className="text-muted-foreground hover:text-destructive" title="Cancelar esta avaliação" onClick={() => setCancelando(a)}>
                      <X className="mx-auto h-3 w-3" /></button>
                  </td>
                </tr>
              ))}
              {avaliacoes.length === 0 && (
                <tr className="h-[19px]"><td colSpan={6} className={cn(TD_MODAL, 'py-4 text-center text-muted-foreground')}>Nenhuma avaliação — o valor de mercado é opcional.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Barra><Link onClick={() => setNovo(true)} testId="bem-nova-avaliacao">+ nova avaliação</Link><span className="text-destructive">{erro ?? ''}</span></Barra>
        {/* A NOVA AVALIAÇÃO — linha fixa (invisível até "+ nova avaliação") */}
        <div className={cn('flex h-[28px] shrink-0 items-center gap-1.5', !novo && 'invisible')} data-testid="bem-form-avaliacao">
          <div className="w-[112px]"><DatePicker size="compact" value={data} onChange={setData} /></div>
          <Input value={fonte} onChange={e => setFonte(e.target.value)} placeholder={terra ? 'fonte (ITR 2025, laudo…)' : 'fonte (revenda, tabela FIPE…)'} className="h-[24px] min-w-0 flex-1 text-[11px]" />
          {terra ? (
            <>
              <Segmentado altura={24} valor={base} onEscolher={setBase} opcoes={[{ valor: 'terra_nua', rotulo: 'Terra nua' }, { valor: 'terra_formada', rotulo: 'Terra formada' }]} />
              <div className="w-[110px]"><CampoMoeda valor={valorHa} onChange={setValorHa} className="h-[24px] text-[11px]" /></div>
              <span className="text-[10px] text-muted-foreground">/ha ×</span>
              <div className="w-[80px]"><CampoNumeroComConta valor={area} onChange={setArea} className="h-[24px] text-[11px]" /></div>
              <span className="text-[10px] text-muted-foreground">ha</span>
            </>
          ) : (
            <div className="w-[130px]"><CampoMoeda valor={total} onChange={setTotal} className="h-[24px] text-[11px]" /></div>
          )}
          <Button size="sm" className="h-[24px] text-[10px]" onClick={() => void registrar()}>Registrar</Button>
        </div>
      </BlocoFormulario>

      <BlocoFormulario titulo="Contábil × mercado" className="w-[300px] shrink-0">
        <div className="overflow-hidden rounded border" data-testid="bem-contabil-mercado">
          {[
            { r: 'contábil na posição', v: contabil != null ? brl(contabil) : '—' },
            { r: ultima ? `mercado (avaliação de ${dataBR(ultima.data)})` : 'mercado (última avaliação)', v: ultima ? brl(ultima.valor_total) : '—', cor: 'text-emerald-800' },
            { r: 'diferença', v: ultima && contabil != null ? brl(ultima.valor_total - contabil) : '—', cor: 'text-emerald-800' },
          ].map(x => (
            <div key={x.r} className="border-b px-2 py-1 last:border-b-0">
              <div className="truncate text-[9.5px] text-muted-foreground" title={x.r}>{x.r}</div>
              <div className={cn('whitespace-nowrap text-right text-[12px] font-semibold tabular-nums', x.cor)}>{x.v}</div>
            </div>
          ))}
        </div>
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">a diferença é efeito de mercado — nunca entra no resultado operacional</p>
      </BlocoFormulario>

      <PedirMotivo aberto={cancelando != null} aoFechar={() => setCancelando(null)} titulo="Cancelar avaliação" rotuloDoBotao="Cancelar avaliação"
        frase="A avaliação sai do valor de mercado e fica no histórico. Por quê?"
        aoConfirmar={async motivo => {
          if (!cancelando) return null;
          const r = await api.cancelarAvaliacao(cancelando.id, motivo);
          if (!r.ok) return r.erro;
          await reler();
          return null;
        }} />
    </div>
  );
}
