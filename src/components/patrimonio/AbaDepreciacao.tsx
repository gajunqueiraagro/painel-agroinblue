/**
 * PATR-01 · PR B — aba DEPRECIAÇÃO: os parâmetros (vida útil, residual, início, método) e a tabela ano a ano.
 * ⚠ A SÉRIE É DO BANCO (`fn_patrimonio_depreciacao`, mês a mês; a tabela só agrupa por ano — `anoAAno`). A conta não mora na tela.
 * ⚠ MUDAR VIDA/RESIDUAL (decisão 2, D4): bem que ainda não depreciou → muda no formulário e grava no Salvar; bem que JÁ deprecia →
 * dois gestos (PATR-01c / SALVAR-TRAVA item 2, Gabriel 01/11/2026), escolhidos no Segmentado:
 *   · MUDANÇA DE ESTIMATIVA (`fn_patrimonio_parametros_mudar`): deste mês em diante; os meses passados não mudam. A mudança que não
 *     altera nenhum mês (o bem já todo depreciado) o banco recusa, e a prévia já avisa — com o atalho para "Corrigir cadastro".
 *   · CORRIGIR CADASTRO (`fn_patrimonio_parametros_corrigir`): o cadastro estava errado desde o "em uso" — a série inteira se refaz
 *     (as mudanças posteriores saem; a trilha do banco guarda a cópia).
 *   Os dois pedem motivo e a PRÉVIA ("Ver o efeito") antes de gravar; a prévia troca a tabela da direita por HOJE × DEPOIS, ano a ano
 *   (`comparacaoAnoAAno`, do resumo que o banco devolve). Gravar devolve a versão nova do bem, que o modal adota (SALVAR-TRAVA).
 * Campos AZUIS = o padrão da categoria (sugestão).
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { CampoNumeroComConta } from '@/components/ui/campo-numero-com-conta';
import { BlocoFormulario, Rotulo, REGUA_CAMPO, GRADE_FORMULARIO } from '@/components/ui/bloco-formulario';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { cn } from '@/lib/utils';
import { usePatrimonioApi, useRelerPatrimonio, useSerieDoBem } from '@/hooks/usePatrimonio';
import {
  anoAAno, brl, comparacaoAnoAAno, ladoDaPrevia, mesBR, n2, type BemDaLista, type CategoriaBem, type LadoDaPrevia,
} from '@/lib/patrimonio/patrimonio';
import type { FormBem } from '@/lib/patrimonio/patrimonioApi';
import { QUADRO_MODAL, TD_MODAL, TD_MODAL_NUM, TH_MODAL, TH_MODAL_NUM } from './pecas';

/** o último mês da vida útil (até onde a série vale a pena pedir) */
function fimDaVida(emUso: string, meses: number): string {
  const [a, m] = emUso.slice(0, 7).split('-').map(Number);
  const total = a * 12 + (m - 1) + meses;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-28`;
}

type Modo = 'estimativa' | 'correcao';
interface Previa { modo: Modo; frase: string; semEfeito: boolean; depois: LadoDaPrevia }

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

  /* bem que já deprecia: a mudança é LOCAL até gravar (com motivo e prévia); o formulário guarda o vigente */
  const [modo, setModo] = useState<Modo>('estimativa');
  const [vidaNova, setVidaNova] = useState<number | null>(form.vida_util_meses);
  const [resNovo, setResNovo] = useState<number | null>(form.residual_pct);
  const [motivo, setMotivo] = useState('');
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);
  const vida = jaDeprecia ? vidaNova : form.vida_util_meses;
  const residual = jaDeprecia ? resNovo : form.residual_pct;
  /* a estimativa só faz sentido se algo mudou; a correção vale mesmo com o valor vigente (a linha inicial pode ser outra) */
  const pode = jaDeprecia && vidaNova != null && resNovo != null
    && (modo === 'correcao' || vidaNova !== form.vida_util_meses || resNovo !== form.residual_pct);
  const sugVida = categoria?.vida_util_anos != null && vida === Math.round(categoria.vida_util_anos * 12);
  const sugRes = categoria != null && residual === categoria.residual_pct;
  const mesAtual = `${hoje.slice(0, 7)}-01`;
  const comparacao = useMemo(() => (previa ? comparacaoAnoAAno(anos, previa.depois) : null), [anos, previa]);

  const limpar = () => { setPrevia(null); setErro(null); };
  const setVida = (anosDigitados: number | null) => {
    const meses = anosDigitados == null ? null : Math.max(1, Math.round(anosDigitados * 12));
    if (jaDeprecia) { setVidaNova(meses); limpar(); } else set('vida_util_meses', meses);
  };
  const setResidual = (v: number | null) => { if (jaDeprecia) { setResNovo(v); limpar(); } else set('residual_pct', v); };
  const escolherModo = (m: Modo) => { setModo(m); limpar(); };

  const executar = async (simular: boolean) => {
    if (vidaNova == null || resNovo == null) { setErro('Informe a vida útil e o residual.'); return; }
    if (!motivo.trim()) { setErro(modo === 'correcao' ? 'Informe o motivo da correção.' : 'Informe o motivo da mudança.'); return; }
    setIndo(true); setErro(null);
    const r = modo === 'correcao'
      ? await api.corrigirParametros(bemId, form.versao, vidaNova, resNovo, motivo.trim(), simular)
      : await api.mudarParametros(bemId, form.versao, mesAtual, vidaNova, resNovo, motivo.trim(), simular);
    setIndo(false);
    if (!r.ok) { setErro(r.erro); return; }
    if (simular) {
      const antes = ladoDaPrevia(r.dados.antes); const depois = ladoDaPrevia(r.dados.depois);
      const semEfeito = r.dados.sem_efeito === true;
      const removidas = Number(r.dados.linhas_removidas ?? 0);
      const frase = semEfeito ? (typeof r.dados.aviso === 'string' ? r.dados.aviso : 'Esta mudança não altera nada.')
        : modo === 'correcao'
          ? `Desde ${mesBR(emUso)}: acumulada hoje ${brl(antes.hoje?.acumulada ?? 0)} → ${brl(depois.hoje?.acumulada ?? 0)}; contábil ${brl(antes.hoje?.contabil ?? 0)} → ${brl(depois.hoje?.contabil ?? 0)}.${removidas > 0 ? ` ${removidas === 1 ? 'A mudança posterior sai' : `As ${removidas} mudanças posteriores saem`} (fica na trilha).` : ''}`
          : `A quota de ${mesBR(mesAtual)} passa de ${brl(Number(r.dados.quota_antes ?? 0))} para ${brl(Number(r.dados.quota_depois ?? 0))}; os meses anteriores não mudam.`;
      setPrevia({ modo, frase, semEfeito, depois });
      return;
    }
    const versao = typeof r.dados.versao === 'number' ? r.dados.versao : null;
    if (versao != null) set('versao', versao);
    set('vida_util_meses', vidaNova); set('residual_pct', resNovo);
    setMotivo(''); setPrevia(null);
    toast.success(modo === 'correcao' ? 'Vida útil corrigida desde o início.' : 'Vida útil mudada deste mês em diante.');
    void reler();
  };

  const rotuloGravar = modo === 'correcao' ? 'Corrigir cadastro' : 'Mudar vida útil';
  const atalhoCorrigir = previa?.semEfeito === true && previa.modo === 'estimativa';

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
        <p className="mt-1 h-[26px] text-[10px] leading-snug text-muted-foreground">
          {!jaDeprecia ? 'campos azuis vêm do padrão da categoria; mudar aqui vale só para este bem — grava no Salvar'
            : modo === 'correcao' ? 'o cadastro estava errado: a depreciação se refaz desde o “em uso”, inclusive os meses passados'
              : 'a estimativa mudou: vale deste mês em diante; os meses passados ficam'}
        </p>
        <div className="mt-1 grid grid-cols-2 overflow-hidden rounded border" data-testid="bem-dep-quota">
          <div className="border-r px-2 py-1"><div className="text-[9.5px] text-muted-foreground">no mês da posição</div>
            <div className="whitespace-nowrap text-right text-[11px] font-semibold tabular-nums">{mesDaPosicao ? brl(mesDaPosicao.quota) : '—'}</div></div>
          <div className="px-2 py-1"><div className="text-[9.5px] text-muted-foreground">no ano da posição</div>
            <div className="whitespace-nowrap text-right text-[11px] font-semibold tabular-nums">{anoDaPosicao ? brl(anoDaPosicao.depreciacao) : '—'}</div></div>
        </div>
        {/* A MUDANÇA DO BEM QUE JÁ DEPRECIA — o lugar existe sempre; liga só para bem que já deprecia */}
        <div className={cn('mt-1.5 flex flex-col gap-1', !jaDeprecia && 'invisible')} aria-hidden={!jaDeprecia || undefined} data-testid="bem-dep-mudar">
          <Segmentado altura={22} valor={modo} onEscolher={escolherModo} opcoes={[
            { valor: 'estimativa', rotulo: 'Mudança de estimativa', title: 'a vida útil mudou: vale deste mês em diante' },
            { valor: 'correcao', rotulo: 'Corrigir cadastro', title: 'o cadastro estava errado desde o início: refaz a depreciação inteira' },
          ]} />
          <Rotulo texto={modo === 'correcao' ? `Motivo da correção — refaz desde ${emUso ? mesBR(emUso) : 'o “em uso”'}` : `Motivo da mudança — vale de ${mesBR(mesAtual)} em diante`} obrig />
          <Input value={motivo} onChange={e => { setMotivo(e.target.value); limpar(); }} className={cn(REGUA_CAMPO, erro && 'border-destructive')} data-testid="bem-dep-motivo" />
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="h-[24px] text-[10px]" disabled={!pode || indo} onClick={() => void executar(true)} data-testid="bem-dep-ver">Ver o efeito</Button>
            <Button size="sm" className="h-[24px] w-[104px] text-[10px]" disabled={!pode || indo || !previa || previa.semEfeito || previa.modo !== modo}
              onClick={() => void executar(false)} title={previa ? undefined : 'veja o efeito antes'} data-testid="bem-dep-gravar">{rotuloGravar}</Button>
            <Button size="sm" variant="link" className={cn('ml-auto h-[24px] px-0 text-[10px]', !atalhoCorrigir && 'invisible')} tabIndex={atalhoCorrigir ? 0 : -1}
              aria-hidden={!atalhoCorrigir || undefined} onClick={() => escolherModo('correcao')} data-testid="bem-dep-ir-corrigir">Corrigir cadastro →</Button>
          </div>
          <p className={cn('h-[39px] overflow-hidden text-[10px] leading-[13px]', erro ? 'text-destructive' : previa?.semEfeito ? 'text-amber-700' : 'text-muted-foreground')}
            title={erro ?? previa?.frase ?? undefined} data-testid="bem-dep-frase">{erro ?? previa?.frase ?? ''}</p>
        </div>
      </BlocoFormulario>

      <BlocoFormulario titulo="Depreciação ano a ano"
        dica={comparacao ? `prévia — hoje × ${previa?.modo === 'correcao' ? 'corrigido' : 'com a mudança'} · nada gravado ainda` : 'da série mensal do banco · a linha azul é o ano da posição'}
        className="min-h-0 min-w-0 flex-1">
        <div className={QUADRO_MODAL} data-testid="bem-dep-anos">
          {comparacao ? (
            <table className="w-full table-fixed border-collapse" data-testid="bem-dep-comparacao">
              <colgroup><col style={{ width: 48 }} /><col /><col /><col /><col /></colgroup>
              <thead className="text-primary-foreground">
                <tr className="h-[22px]"><th className={TH_MODAL}>Ano</th><th className={TH_MODAL_NUM}>Depreciação hoje R$</th><th className={TH_MODAL_NUM}>Depreciação depois R$</th>
                  <th className={TH_MODAL_NUM}>Acumulada depois R$</th><th className={TH_MODAL_NUM}>Contábil depois R$</th></tr>
              </thead>
              <tbody>
                {comparacao.map(a => (
                  <tr key={a.ano} className={cn('h-[19px] border-b border-border/40', a.ano === posicao.slice(0, 4) && 'bg-sky-50')}>
                    <td className={TD_MODAL}>{a.ano}</td>
                    <td className={TD_MODAL_NUM}>{a.hoje != null ? n2(a.hoje) : '—'}</td>
                    <td className={cn(TD_MODAL_NUM, a.hoje !== a.depois && 'font-semibold text-amber-800')}>{n2(a.depois)}</td>
                    <td className={TD_MODAL_NUM}>{n2(a.acumulada)}</td><td className={TD_MODAL_NUM}>{n2(a.contabil)}</td>
                  </tr>
                ))}
                {comparacao.length === 0 && (
                  <tr className="h-[19px]"><td colSpan={5} className={cn(TD_MODAL, 'py-4 text-center text-muted-foreground')}>a prévia não trouxe a série</td></tr>
                )}
              </tbody>
            </table>
          ) : (
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
          )}
        </div>
      </BlocoFormulario>
    </div>
  );
}
