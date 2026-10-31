/**
 * PATR-01 · PR B — aba DEPRECIAÇÃO: os parâmetros (vida útil, residual, início, método) e a tabela ano a ano.
 * ⚠ A SÉRIE É DO BANCO (`fn_patrimonio_depreciacao`, mês a mês; a tabela só agrupa por ano — `anoAAno`). A conta não mora na tela.
 * ⚠ MUDAR VIDA/RESIDUAL (decisão 2, D4): bem que ainda não depreciou → muda no formulário e grava no Salvar; bem que JÁ deprecia →
 * só "deste mês em diante", com motivo e a PRÉVIA da quota antes × depois (`fn_patrimonio_parametros_mudar`); os meses passados não
 * mudam. Campos AZUIS = o padrão da categoria (sugestão).
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CampoNumeroComConta } from '@/components/ui/campo-numero-com-conta';
import { BlocoFormulario, Rotulo, REGUA_CAMPO, GRADE_FORMULARIO } from '@/components/ui/bloco-formulario';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { cn } from '@/lib/utils';
import { usePatrimonioApi, useRelerPatrimonio, useSerieDoBem } from '@/hooks/usePatrimonio';
import { anoAAno, brl, mesBR, n2, type BemDaLista, type CategoriaBem } from '@/lib/patrimonio/patrimonio';
import type { FormBem } from '@/lib/patrimonio/patrimonioApi';
import { QUADRO_MODAL, TD_MODAL, TD_MODAL_NUM, TH_MODAL, TH_MODAL_NUM } from './pecas';

/** o último mês da vida útil (até onde a série vale a pena pedir) */
function fimDaVida(emUso: string, meses: number): string {
  const [a, m] = emUso.slice(0, 7).split('-').map(Number);
  const total = a * 12 + (m - 1) + meses;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-28`;
}

export function AbaDepreciacao({ bemId, clienteId, posicao, form, set, categoria, jaDeprecia, linha }: {
  bemId: string; clienteId: string; posicao: string; form: FormBem; set: <K extends keyof FormBem>(k: K, v: FormBem[K]) => void;
  categoria: CategoriaBem | null; jaDeprecia: boolean; linha: BemDaLista | null;
}) {
  const api = usePatrimonioApi();
  const reler = useRelerPatrimonio();
  const hoje = hojeLocal();
  const emUso = linha?.em_uso_desde ?? (form.situacao === 'em_uso' ? form.em_uso_desde : '');
  const vidaGravada = linha?.vida_util_meses ?? form.vida_util_meses;
  const ate = emUso && vidaGravada ? fimDaVida(emUso, vidaGravada) : posicao;
  const { data: serie = [] } = useSerieDoBem(clienteId, emUso ? bemId : null, ate > posicao ? ate : posicao);
  const anos = useMemo(() => anoAAno(serie), [serie]);
  const mesDaPosicao = serie.find(s => s.periodo === posicao.slice(0, 7));
  const anoDaPosicao = anos.find(a => a.ano === posicao.slice(0, 4));

  /* bem que já deprecia: a mudança é LOCAL até "Mudar vida útil" (com motivo); o formulário guarda o vigente */
  const [vidaNova, setVidaNova] = useState<number | null>(form.vida_util_meses);
  const [resNovo, setResNovo] = useState<number | null>(form.residual_pct);
  const [motivo, setMotivo] = useState('');
  const [previa, setPrevia] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const vida = jaDeprecia ? vidaNova : form.vida_util_meses;
  const residual = jaDeprecia ? resNovo : form.residual_pct;
  const mudou = jaDeprecia && (vidaNova !== form.vida_util_meses || resNovo !== form.residual_pct);
  const sugVida = categoria?.vida_util_anos != null && vida === Math.round(categoria.vida_util_anos * 12);
  const sugRes = categoria != null && residual === categoria.residual_pct;
  const mesAtual = `${hoje.slice(0, 7)}-01`;

  const setVida = (anosDigitados: number | null) => {
    const meses = anosDigitados == null ? null : Math.max(1, Math.round(anosDigitados * 12));
    if (jaDeprecia) { setVidaNova(meses); setPrevia(null); setErro(null); } else set('vida_util_meses', meses);
  };
  const setResidual = (v: number | null) => { if (jaDeprecia) { setResNovo(v); setPrevia(null); setErro(null); } else set('residual_pct', v); };

  const mudar = async (simular: boolean) => {
    if (vidaNova == null || resNovo == null) { setErro('Informe a vida útil e o residual.'); return; }
    if (!motivo.trim()) { setErro('Informe o motivo da mudança.'); return; }
    const r = await api.mudarParametros(bemId, mesAtual, vidaNova, resNovo, motivo.trim(), simular);
    if (!r.ok) { setErro(r.erro); return; }
    if (simular) {
      setPrevia(`A quota de ${mesBR(mesAtual)} passa de ${brl(Number(r.dados.quota_antes ?? 0))} para ${brl(Number(r.dados.quota_depois ?? 0))}; os meses anteriores não mudam.`);
      return;
    }
    toast.success('Vida útil mudada deste mês em diante.');
    set('vida_util_meses', vidaNova); set('residual_pct', resNovo);
    setMotivo(''); setPrevia(null);
    await reler();
  };

  return (
    <div className="flex min-h-0 flex-1 gap-1.5">
      <BlocoFormulario titulo="Parâmetros" className="w-[330px] shrink-0">
        <div className={cn(GRADE_FORMULARIO, 'grid-cols-2')}>
          <div>
            <Rotulo texto="Vida útil (anos)" />
            <CampoNumeroComConta casas={1} valor={vida != null ? vida / 12 : null} onChange={setVida}
              className={cn(REGUA_CAMPO, 'text-right', sugVida && 'border-sky-300 bg-sky-50')} />
          </div>
          <div>
            <Rotulo texto="Valor residual" />
            <CampoNumeroComConta percentual valor={residual} onChange={setResidual}
              className={cn(REGUA_CAMPO, 'text-right', sugRes && 'border-sky-300 bg-sky-50')} sufixoDentro="%" />
          </div>
          <div>
            <Rotulo texto="Início" />
            <div className={cn(REGUA_CAMPO, 'flex items-center rounded-md border bg-muted/60 px-2')}>{emUso ? mesBR(emUso) : 'no “em uso”'}</div>
          </div>
          <div>
            <Rotulo texto="Método" />
            <div className={cn(REGUA_CAMPO, 'flex items-center rounded-md border bg-muted/60 px-2')}>linear</div>
          </div>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
          {jaDeprecia ? 'o bem já deprecia: a mudança vale deste mês em diante e pede motivo' : 'campos azuis vêm do padrão da categoria; mudar aqui vale só para este bem — grava no Salvar'}
        </p>
        <div className="mt-1.5 grid grid-cols-2 overflow-hidden rounded border" data-testid="bem-dep-quota">
          <div className="border-r px-2 py-1"><div className="text-[9.5px] text-muted-foreground">no mês da posição</div>
            <div className="whitespace-nowrap text-right text-[11px] font-semibold tabular-nums">{mesDaPosicao ? brl(mesDaPosicao.quota) : '—'}</div></div>
          <div className="px-2 py-1"><div className="text-[9.5px] text-muted-foreground">no ano da posição</div>
            <div className="whitespace-nowrap text-right text-[11px] font-semibold tabular-nums">{anoDaPosicao ? brl(anoDaPosicao.depreciacao) : '—'}</div></div>
        </div>
        {/* A MUDANÇA COM VIGÊNCIA — o lugar existe sempre; liga só para bem que já deprecia */}
        <div className={cn('mt-1.5 flex flex-col gap-1', !jaDeprecia && 'invisible')} data-testid="bem-dep-mudar">
          <Rotulo texto={`Motivo da mudança — vale de ${mesBR(mesAtual)} em diante`} obrig />
          <Input value={motivo} onChange={e => { setMotivo(e.target.value); setErro(null); setPrevia(null); }} className={cn(REGUA_CAMPO, erro && 'border-destructive')} />
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="h-[24px] text-[10px]" disabled={!mudou} onClick={() => void mudar(true)}>Ver o efeito</Button>
            <Button size="sm" className="h-[24px] text-[10px]" disabled={!mudou || !previa} onClick={() => void mudar(false)} title={previa ? undefined : 'veja o efeito antes'}>Mudar vida útil</Button>
          </div>
          <p className={cn('h-[26px] text-[10px] leading-snug', erro ? 'text-destructive' : 'text-muted-foreground')}>{erro ?? previa ?? ''}</p>
        </div>
      </BlocoFormulario>

      <BlocoFormulario titulo="Depreciação ano a ano" dica="da série mensal do banco · a linha azul é o ano da posição" className="min-h-0 min-w-0 flex-1">
        <div className={QUADRO_MODAL} data-testid="bem-dep-anos">
          <table className="w-full table-fixed border-collapse">
            <colgroup><col style={{ width: 60 }} /><col style={{ width: 60 }} /><col /><col /><col /></colgroup>
            <thead className="text-primary-foreground">
              <tr className="h-[22px]"><th className={TH_MODAL}>Ano</th><th className={TH_MODAL_NUM}>Meses</th><th className={TH_MODAL_NUM}>Depreciação R$</th>
                <th className={TH_MODAL_NUM}>Acumulada R$</th><th className={TH_MODAL_NUM}>Contábil no fim R$</th></tr>
            </thead>
            <tbody>
              {anos.map(a => (
                <tr key={a.ano} className={cn('h-[19px] border-b border-border/40', a.ano === posicao.slice(0, 4) && 'bg-sky-50 font-semibold')}>
                  <td className={TD_MODAL}>{a.ano}</td><td className={TD_MODAL_NUM}>{a.meses}</td><td className={TD_MODAL_NUM}>{n2(a.depreciacao)}</td>
                  <td className={TD_MODAL_NUM}>{n2(a.acumulada)}</td><td className={TD_MODAL_NUM}>{n2(a.contabil)}</td>
                </tr>
              ))}
              {anos.length === 0 && (
                <tr className="h-[19px]"><td colSpan={5} className={cn(TD_MODAL, 'py-4 text-center text-muted-foreground')}>
                  {form.situacao === 'em_formacao' ? 'em formação: a depreciação começa no “em uso”' : 'sem série ainda'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </BlocoFormulario>
    </div>
  );
}
