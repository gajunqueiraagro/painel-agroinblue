/**
 * INFRA-FICHAS-PATR-01 — "Criar bem no Patrimônio" a partir da infraestrutura (no lugar do painel, mesma largura).
 * - O bem nasce na categoria do tipo (D2), com a descrição montada da ficha e a vida útil sugerida pelo material (D6) — tudo editável.
 * - D4: pede "em uso desde" (sem sugestão; o banco recusa vazio) e a atividade (Pecuária já escolhida). D5: valor "pelos lançamentos"
 *   (as notas se ligam depois no Patrimônio) ou "sem lançamento" (valor digitado).
 * - "Ver prévia" = `fn_infra_criar_bem` com simular (a resposta é a do escritor do Patrimônio); "Criar bem e ligar" grava os dois numa
 *   transação (D3). A recusa do banco fica aqui, nunca em toast; o botão desabilitado diz por quê.
 */
import { useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Segmentado } from '@/components/ui/segmentado';
import { DatePicker } from '@/components/ui/date-picker';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import { CampoNumeroComConta } from '@/components/ui/campo-numero-com-conta';
import type { Resposta } from '@/hooks/useInfraestruturas';
import { categoriaDoTipo, descricaoDaFicha, vidaUtilSugerida, type Ficha } from '@/lib/mapa/fichasDaInfra';
import { definicaoDoTipo, iconeDaInfra, type TipoInfra } from '@/lib/mapa/infraestrutura';
import { hojeLocal } from '@/lib/datas/hojeLocal';

type Atividade = 'pecuaria' | 'lavoura' | 'compartilhado';
type OrigemDoValor = 'lancamentos' | 'sem_lancamento';

export interface ArgumentoDoBem {
  categoria_codigo: string; descricao: string; em_uso_desde: string; atividade: Atividade; origem_valor: OrigemDoValor;
  valor_sem_lancamento?: number; vida_util_meses?: number; residual_pct?: number;
}

/** O `p_bem` da `fn_infra_criar_bem` (puro, para o teste): vida útil em MESES; o que ficou vazio não vai (vale o da categoria). */
export function argumentoDoBem(c: {
  tipo: TipoInfra; ficha: Ficha; descricao: string; emUsoDesde: string; atividade: Atividade; origem: OrigemDoValor; valor: number | null;
  vidaAnos: number | null; residual: number | null;
}): ArgumentoDoBem {
  return {
    categoria_codigo: categoriaDoTipo(c.tipo, c.ficha),
    descricao: c.descricao.trim(),
    em_uso_desde: c.emUsoDesde,
    atividade: c.atividade,
    origem_valor: c.origem,
    ...(c.origem === 'sem_lancamento' && c.valor != null ? { valor_sem_lancamento: c.valor } : {}),
    ...(c.vidaAnos != null && c.vidaAnos > 0 ? { vida_util_meses: Math.round(c.vidaAnos * 12) } : {}),
    ...(c.residual != null ? { residual_pct: c.residual } : {}),
  };
}

function linhaDaPrevia(d: unknown): string {
  const bem = typeof d === 'object' && d !== null ? Reflect.get(d, 'bem') : null;
  if (typeof bem !== 'object' || bem === null) return '';
  const cat = Reflect.get(bem, 'categoria'); const nomeCat = typeof cat === 'object' && cat !== null ? Reflect.get(cat, 'nome') : null;
  const meses = Reflect.get(bem, 'vida_util_meses'); const res = Reflect.get(bem, 'residual_pct'); const avisos = Reflect.get(bem, 'avisos');
  return [typeof nomeCat === 'string' ? `Nasce em ${nomeCat}` : '',
    typeof meses === 'number' ? `vida útil ${meses} meses (${(meses / 12).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} anos)` : '',
    typeof res === 'number' ? `residual ${res.toLocaleString('pt-BR')} %` : '', 'o código nasce ao gravar',
    ...(Array.isArray(avisos) ? avisos.filter((a): a is string => typeof a === 'string') : [])].filter(Boolean).join(' · ');
}

export function CriarBemDaInfra(p: {
  className: string;
  tipo: TipoInfra;
  ficha: Ficha;
  pasto: string | null;
  infraId: string;
  versao: number;
  criarBem: (infraId: string, versao: number, bem: Record<string, unknown>, simular: boolean) => Promise<Resposta>;
  onGravou: () => void;
  onVoltar: () => void;
}) {
  const def = definicaoDoTipo(p.tipo);
  const sugerida = vidaUtilSugerida(p.tipo, p.ficha);
  const [descricao, setDescricao] = useState(() => descricaoDaFicha(p.tipo, p.ficha, p.pasto));
  const [vidaAnos, setVidaAnos] = useState<number | null>(sugerida);
  const [residual, setResidual] = useState<number | null>(null);
  const [emUsoDesde, setEmUsoDesde] = useState('');
  const [atividade, setAtividade] = useState<Atividade>('pecuaria');
  const [origem, setOrigem] = useState<OrigemDoValor>('lancamentos');
  const [valor, setValor] = useState<number | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [recusa, setRecusa] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [tentou, setTentou] = useState(false);

  useEffect(() => { setPrevia(null); setRecusa(null); }, [descricao, vidaAnos, residual, emUsoDesde, atividade, origem, valor]);

  const pendencia = !descricao.trim() ? 'Informe a descrição.' : !emUsoDesde ? 'Informe desde quando está em uso.'
    : emUsoDesde > hojeLocal() ? '"Em uso desde" não pode ser no futuro.'
      : origem === 'sem_lancamento' && !(valor && valor > 0) ? 'Informe o valor do bem.' : null;
  const bem = () => argumentoDoBem({ tipo: p.tipo, ficha: p.ficha, descricao, emUsoDesde, atividade, origem, valor, vidaAnos, residual });

  const verPrevia = async () => {
    setTentou(true);
    if (pendencia) return;
    const r = await p.criarBem(p.infraId, p.versao, { ...bem() }, true);
    if (!r.ok) { setRecusa(r.motivo); return; }
    setPrevia(linhaDaPrevia(r.dado));
  };
  const gravar = async () => {
    setGravando(true);
    const r = await p.criarBem(p.infraId, p.versao, { ...bem() }, false);
    setGravando(false);
    if (!r.ok) { setRecusa(r.motivo); return; }
    p.onGravou();
  };
  const porQue = tentou && pendencia ? pendencia : !previa ? 'Veja a prévia antes.' : null;
  const vermelho = (campoPendente: boolean) => (tentou && campoPendente ? 'border-[#B03A2E]' : '');

  return (
    <div className={p.className} data-testid="mapa-painel-infra" data-modo="criar-bem">
      <div className="flex-none border-b border-black/[0.08] px-2 pb-1.5 pt-2">
        <div className="flex items-center gap-1.5">
          <button type="button" aria-label="Voltar" className="flex-none text-[#4A5361] hover:text-[#1d232b]" onClick={p.onVoltar}><ChevronLeft className="h-3.5 w-3.5" /></button>
          <span className="flex-none" dangerouslySetInnerHTML={{ __html: iconeDaInfra(p.tipo) }} />
          <b className="min-w-0 break-words text-[12px] leading-[15px]">Criar bem no Patrimônio</b>
        </div>
        {/* duas linhas reservadas: fora de tabela o texto quebra (nunca "…") e nada abaixo se desloca */}
        <div className="mt-0.5 h-[24px] overflow-hidden text-[9.5px] leading-[12px] text-[#4A5361]">{def?.rotulo} · a prévia vem do banco; nada gravado ainda</div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 py-1.5 text-[10px]" data-testid="infra-criar-bem">
        <label className="flex flex-col gap-0.5"><span className="text-[9.5px] text-[#5A6472]">Descrição</span>
          {/* a descrição montada da ficha é longa: área de 2 linhas que quebra (fora de tabela, nada de "…") */}
          <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2}
            className={`min-h-0 resize-none px-1.5 py-1 text-[10.5px] leading-[13px] ${vermelho(!descricao.trim())}`} /></label>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="flex flex-col gap-0.5"><span className="text-[9.5px] text-[#5A6472]">Vida útil</span>
            <CampoNumeroComConta valor={vidaAnos} onChange={setVidaAnos} casas={0} sufixoDentro="anos" className="h-[24px] text-[10.5px]" /></div>
          <div className="flex flex-col gap-0.5"><span className="text-[9.5px] text-[#5A6472]">Residual</span>
            <CampoNumeroComConta valor={residual} onChange={setResidual} casas={2} percentual sufixoDentro="%" placeholder="da categoria" className="h-[24px] text-[10.5px]" /></div>
        </div>
        <div className="text-[9.5px] leading-[12px] text-[#5A6472]" data-testid="infra-vida-sugerida">
          {sugerida != null ? `Sugestão pelo material: ${sugerida} anos.` : 'Sem sugestão para este material: vale a da categoria se ficar vazio.'}
        </div>
        <div className="flex flex-col gap-0.5"><span className="text-[9.5px] text-[#5A6472]">Em uso desde</span>
          <DatePicker value={emUsoDesde} onChange={setEmUsoDesde} size="compact" className={vermelho(!emUsoDesde || emUsoDesde > hojeLocal())} /></div>
        <div className="flex flex-col gap-0.5"><span className="text-[9.5px] text-[#5A6472]">Atividade</span>
          <Segmentado valor={atividade} onEscolher={setAtividade} altura={22} fonte={10}
            opcoes={[{ valor: 'pecuaria', rotulo: 'Pecuária' }, { valor: 'lavoura', rotulo: 'Lavoura' }, { valor: 'compartilhado', rotulo: 'Compartilhado' }]} /></div>
        <div className="flex flex-col gap-0.5"><span className="text-[9.5px] text-[#5A6472]">Valor</span>
          <Segmentado valor={origem} onEscolher={setOrigem} altura={22} fonte={10}
            opcoes={[{ valor: 'lancamentos', rotulo: 'Pelos lançamentos' }, { valor: 'sem_lancamento', rotulo: 'Sem lançamento' }]} /></div>
        {/* lugar reservado: a frase dos lançamentos ou o campo do valor, na mesma altura */}
        <div className="min-h-[26px]">
          {origem === 'lancamentos'
            ? <div className="text-[9.5px] leading-[12px] text-[#5A6472]">O valor e a depreciação vêm das notas ligadas ao bem no Patrimônio.</div>
            : <CampoMoeda valor={valor} onChange={setValor} className={`h-[24px] text-[10.5px] ${vermelho(!(valor && valor > 0))}`} />}
        </div>
        <div className="min-h-[26px] leading-[13px]" data-testid="infra-criar-bem-previa">
          {recusa ? <span className="text-[#B03A2E]">{recusa}</span> : tentou && pendencia ? <span className="text-[#B03A2E]">{pendencia}</span>
            : previa ? <span>{previa}</span> : null}
        </div>
      </div>
      <div className="flex flex-none items-center justify-end gap-1 border-t border-black/[0.08] px-2 py-1.5">
        {porQue && <span className="mr-auto text-[9.5px] text-[#5A6472]">{porQue}</span>}
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10.5px]" onClick={p.onVoltar}>Voltar</Button>
        {!previa
          ? <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[10.5px]" onClick={verPrevia}>Ver prévia</Button>
          : <Button type="button" size="sm" className="h-6 px-2 text-[10.5px]" onClick={gravar} disabled={!!recusa || gravando}>
            {gravando ? 'Gravando…' : 'Criar bem e ligar'}</Button>}
      </div>
    </div>
  );
}
