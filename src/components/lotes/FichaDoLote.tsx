/**
 * LOTES-03 F1 — a FICHA MÍNIMA do lote (mock lotes-03-assistente.html): cabeçalho (código, nome do campeiro, fazenda, situação) com
 * Editar identidade / Encerrar-Reabrir / Cancelar; a faixa "do sistema" (números lidos do fechamento, nunca digitados); as abas
 * Resumo (identidade, perfil e metas editáveis no bloco) e Histórico (a trilha, com Desfazer). As abas de estratégia são da F2.
 * Toda gravação passa pela RPC (`fn_lote_salvar` / `fn_lote_situacao`, com a versão), avisa as outras telas e relê.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { CampoNumeroComConta } from '@/components/ui/campo-numero-com-conta';
import { DatePicker } from '@/components/ui/date-picker';
import { Ajuda } from '@/components/ui/ajuda';
import { TH_REGUA, TD_REGUA, TD_REGUA_TEXTO } from '@/components/ui/regua-tabela';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { notificarLotesMudaram } from '@/hooks/useLotesDaFazenda';
import { useHistoricoDoLote } from '@/hooks/useHistoricoDoLote';
import { dataBr, mapaDoCadastro, motivoDoDesfazer, mudancasDaTrilha, nomeDe, oQueDaTrilha, type MudancaDoHistorico } from '@/lib/lotes/lista';
import type { CadastroDoLote, CamposDoLote, LoteDaLista, SituacaoDoLote, TipoDoCadastro } from '@/lib/lotes/tipos';

/** A altura da ficha: fixa, cabe em 1126×579 (a página nunca rola por causa dela). */
export const ALTURA_DA_FICHA = 'h-[min(560px,calc(100vh-16px))]';

const ROTULO_SITUACAO: Record<SituacaoDoLote, string> = { ativo: 'Ativo', encerrado: 'Encerrado', cancelado: 'Cancelado' };
const n0 = (v: number | null) => (v == null ? '—' : formatNum(v, 0));
const n3 = (v: number | null) => (v == null ? '—' : formatNum(v, 3));

/** A frase do banco (P0001/40001 vêm prontas em pt-BR); outro erro = frase da casa, o texto no console. */
export function fraseDoErro(e: unknown): string {
  const code = typeof e === 'object' && e !== null ? Reflect.get(e, 'code') : null;
  const msg = typeof e === 'object' && e !== null ? Reflect.get(e, 'message') : null;
  if ((code === 'P0001' || code === '40001') && typeof msg === 'string' && msg) return msg;
  console.error('[lotes] gravar', e);
  return 'Não consegui gravar o lote. Nada foi gravado.';
}

/** Dias de hoje até a data alvo (aaaa-mm-dd); passada = 0. */
export function diasAte(alvoIso: string, hojeIso: string): number {
  const d = (s: string) => { const [a, m, dd] = s.split('-').map(Number); return Date.UTC(a, m - 1, dd); };
  return Math.max(0, Math.round((d(alvoIso) - d(hojeIso)) / 864e5));
}

/** A projeção: peso de hoje + GMD do fechamento × dias até a data alvo. Sem peso, GMD, meta ou data = nula. */
export function projecaoDoLote(l: Pick<LoteDaLista, 'pesoMedioKg' | 'gmdKg' | 'metaPesoKg' | 'metaData'>, hojeIso: string):
  { pesoNaData: number; chega: boolean } | null {
  if (l.pesoMedioKg == null || l.gmdKg == null || l.metaPesoKg == null || !l.metaData) return null;
  const pesoNaData = l.pesoMedioKg + l.gmdKg * diasAte(l.metaData, hojeIso);
  return { pesoNaData, chega: pesoNaData >= l.metaPesoKg };
}

interface Faixa { texto: string; erro?: boolean; acao?: { rotulo: string; fazer: () => void } }

export interface PropsDaFicha {
  open: boolean;
  lote: LoteDaLista | null;
  clienteId: string | null;
  fazendaId: string;
  fazendaCodigo: string;
  cadastros: readonly CadastroDoLote[];
  onFechar: () => void;
  onEditarIdentidade: (l: LoteDaLista) => void;
}

export function FichaDoLote({ open, lote, clienteId, fazendaId, fazendaCodigo, cadastros, onFechar, onEditarIdentidade }: PropsDaFicha) {
  const [aba, setAba] = useState<'resumo' | 'historico'>('resumo');
  const [faixa, setFaixa] = useState<Faixa | null>(null);
  const [gravando, setGravando] = useState(false);
  useEffect(() => { if (open) { setAba('resumo'); setFaixa(null); } }, [open, lote?.id]);
  const nomes = useMemo(() => mapaDoCadastro(cadastros), [cadastros]);
  const hist = useHistoricoDoLote(clienteId, open ? lote?.id ?? null : null, lote?.versao ?? 0);

  if (!lote) return null;
  const l = lote;

  const depoisDeGravar = () => { notificarLotesMudaram(fazendaId); hist.recarregar(); };

  const salvarCampos = async (campos: CamposDoLote, motivo?: string): Promise<boolean> => {
    setGravando(true);
    const { error } = await (supabase as any).rpc('fn_lote_salvar', {
      p_id: l.id, p_fazenda: null, p_campos: campos, p_versao: l.versao, p_motivo: motivo ?? null, p_simular: false,
    });
    setGravando(false);
    if (error) { setFaixa({ texto: fraseDoErro(error), erro: true }); return false; }
    depoisDeGravar();
    return true;
  };

  const mudarSituacao = async (situacao: SituacaoDoLote, versao: number, motivo?: string): Promise<boolean> => {
    setGravando(true);
    const { error } = await (supabase as any).rpc('fn_lote_situacao', {
      p_id: l.id, p_situacao: situacao, p_versao: versao, p_motivo: motivo ?? null, p_simular: false,
    });
    setGravando(false);
    if (error) { setFaixa({ texto: fraseDoErro(error), erro: true }); return false; }
    depoisDeGravar();
    return true;
  };

  const encerrar = async () => {
    if (await mudarSituacao('encerrado', l.versao)) {
      setFaixa({ texto: 'Lote encerrado · sai das listas de ativos', acao: { rotulo: 'Desfazer', fazer: () => { void mudarSituacao('ativo', l.versao + 1, 'desfazer: encerrar'); setFaixa(null); } } });
    }
  };
  const clicarEncerrar = () => {
    if (l.situacao !== 'ativo') { void mudarSituacao('ativo', l.versao).then(ok => ok && setFaixa({ texto: 'Lote reaberto' })); return; }
    if ((l.cabecas ?? 0) > 0) {
      setFaixa({ texto: `Encerrar ${l.codigo} com ${n0(l.cabecas)} cab. no fechamento? Primeiro mova ou dê saída nas cabeças.`,
        acao: { rotulo: 'Encerrar mesmo assim (fim do mês)', fazer: () => { void encerrar(); } } });
      return;
    }
    void encerrar();
  };
  const cancelar = async () => {
    if (await mudarSituacao('cancelado', l.versao)) {
      const versaoDepois = l.versao + 1;
      onFechar();
      toast.success(`Lote ${l.codigo} cancelado (não tinha lançamentos)`, {
        action: { label: 'Desfazer', onClick: () => {
          void (async () => {
            const { error } = await (supabase as any).rpc('fn_lote_situacao', { p_id: l.id, p_situacao: 'ativo', p_versao: versaoDepois, p_motivo: 'desfazer: cancelar', p_simular: false });
            if (error) toast.error(fraseDoErro(error)); else notificarLotesMudaram(fazendaId);
          })();
        } },
      });
    }
  };

  const desfazer = async (m: MudancaDoHistorico) => {
    if (!m.desfazer) return;
    const ok = m.desfazer.tipo === 'situacao'
      ? await mudarSituacao(m.desfazer.situacao, l.versao, motivoDoDesfazer(m))
      : await salvarCampos(m.desfazer.campos, motivoDoDesfazer(m));
    if (ok) setFaixa({ texto: `Desfeito · ${m.campo} voltou para ${m.antes}` });
  };

  const pesoTotal = l.cabecas != null && l.pesoMedioKg != null ? l.cabecas * l.pesoMedioKg : null;
  const mesDoDado = l.anoMesDado ? `fechamento ${l.anoMesDado.slice(5)}/${l.anoMesDado.slice(2, 4)}` : 'sem fechamento ainda';
  const gmdOk = l.gmdKg != null && l.metaGmdKg != null ? l.gmdKg >= l.metaGmdKg * 0.97 : null;
  const kpis: { rotulo: string; valor: string; unidade?: string; detalhe: string; tom?: 'ok' | 'alerta'; title?: string }[] = [
    { rotulo: 'Cabeças', valor: n0(l.cabecas), detalhe: mesDoDado },
    { rotulo: 'Peso médio', valor: n0(l.pesoMedioKg), unidade: l.pesoMedioKg == null ? undefined : 'kg', detalhe: l.metaPesoKg != null && l.pesoMedioKg != null ? `meta ${n0(l.metaPesoKg)} kg` : '—' },
    { rotulo: 'GMD', valor: n3(l.gmdKg), unidade: l.gmdKg == null ? undefined : 'kg/dia',
      detalhe: gmdOk == null ? (l.gmdKg == null && l.cabecas != null ? 'precisa de 2 meses' : '—') : `meta ${n3(l.metaGmdKg)} · ${gmdOk ? 'ok' : 'abaixo'}`,
      tom: gmdOk == null ? undefined : gmdOk ? 'ok' : 'alerta' },
    { rotulo: 'Idade média', valor: l.idadeMediaMeses == null ? '—' : String(l.idadeMediaMeses), unidade: l.idadeMediaMeses == null ? undefined : 'meses',
      detalhe: l.carimbo ? `carimbo ${l.carimbo}` : 'informada na ficha' },
    { rotulo: 'Pasto', valor: l.pastos.length === 0 ? '—' : l.pastos.length === 1 ? l.pastos[0] : `${l.pastos.length} pastos`,
      detalhe: l.pastos.length > 1 ? l.pastos.join(' · ') : l.pastos.length ? 'do fechamento' : '—', title: l.pastos.join(' · ') || undefined },
    { rotulo: 'Peso total', valor: n0(pesoTotal), unidade: pesoTotal == null ? undefined : 'kg',
      detalhe: pesoTotal == null ? '—' : `${n0(l.cabecas)} cab. × ${n0(l.pesoMedioKg)} kg` },
  ];

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className={cn(ALTURA_DA_FICHA, 'flex w-[min(1000px,calc(100vw-20px))] max-w-none flex-col gap-0 bg-muted p-0 [&>button:last-child]:hidden')}
        data-testid="ficha-do-lote">
        <DialogTitle className="sr-only">Ficha do lote {l.codigo}</DialogTitle>
        <DialogDescription className="sr-only">Identidade, perfil, metas e histórico do lote.</DialogDescription>
        {/* cabeçalho */}
        <div className="flex h-[48px] flex-none items-center gap-3 whitespace-nowrap bg-primary pl-3.5 pr-2 text-primary-foreground">
          <span className="text-[19px] font-extrabold" data-testid="ficha-codigo">{l.codigo}</span>
          <span className="min-w-0 max-w-[260px] truncate text-[11.5px] opacity-85" title={l.nomeCampeiro ?? undefined}>{l.nomeCampeiro ?? 'sem nome do campeiro'}</span>
          <span className="rounded bg-white/15 px-1.5 text-[10px] font-semibold">{fazendaCodigo}</span>
          <span className={cn('rounded px-1.5 text-[10px] font-semibold', l.situacao === 'ativo' ? 'bg-[#2f8a5b]' : 'bg-[#6b7280]')} data-testid="ficha-situacao">
            {ROTULO_SITUACAO[l.situacao]}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <BotaoDoCabecalho onClick={() => onEditarIdentidade(l)} disabled={gravando} testid="ficha-editar-identidade">✎ Editar identidade</BotaoDoCabecalho>
            <BotaoDoCabecalho onClick={clicarEncerrar} disabled={gravando} testid="ficha-encerrar">{l.situacao === 'ativo' ? 'Encerrar lote' : 'Reabrir lote'}</BotaoDoCabecalho>
            <BotaoDoCabecalho onClick={() => { void cancelar(); }} disabled={gravando} testid="ficha-cancelar">Cancelar lote</BotaoDoCabecalho>
            <button type="button" onClick={onFechar} title="Fechar (Esc)" aria-label="Fechar"
              className="h-[26px] w-[26px] rounded text-[15px] opacity-75 hover:bg-white/10 hover:opacity-100">✕</button>
          </div>
        </div>
        {/* a faixa: lugar fixo de 26px (nunca empurra), a frase do banco inteira */}
        <div className="flex h-[26px] flex-none items-center gap-2 px-3 text-[11px]" data-testid="ficha-faixa">
          {!faixa && l.conferir && (
            <>
              <span className="min-w-0 flex-1 truncate font-medium text-[#92400e]" title={l.conferir} data-testid="ficha-conferir">Conferir: {l.conferir}</span>
              <button type="button" disabled={gravando} className="flex-none font-semibold text-[#24508f] hover:underline disabled:opacity-50" data-testid="ficha-conferido"
                onClick={() => { void salvarCampos({ conferir: '' }, 'conferido'); }}>Conferido</button>
            </>
          )}
          {faixa && (
            <>
              <span className={cn('min-w-0 flex-1 truncate', faixa.erro ? 'font-medium text-[#9a3a2f]' : 'text-foreground')} title={faixa.texto}>{faixa.texto}</span>
              {faixa.acao && <button type="button" className="flex-none font-semibold text-[#24508f] hover:underline" onClick={faixa.acao.fazer}>{faixa.acao.rotulo}</button>}
              <button type="button" aria-label="Fechar aviso" className="flex-none text-muted-foreground" onClick={() => setFaixa(null)}>✕</button>
            </>
          )}
        </div>
        {/* números do sistema */}
        <div className="grid flex-none grid-cols-6 gap-2 px-2.5" data-testid="ficha-kpis">
          {kpis.map(k => (
            <div key={k.rotulo} className="min-w-0 rounded-md border bg-card px-2 py-1" title={k.title}>
              <div className="h-[13px] whitespace-nowrap text-[9.5px] text-muted-foreground">{k.rotulo}</div>
              <div className="truncate whitespace-nowrap text-[16px] font-bold leading-[21px] tabular-nums">
                {k.valor}{k.unidade && <small className="ml-0.5 text-[10.5px] font-medium text-muted-foreground">{k.unidade}</small>}
              </div>
              <div className={cn('h-[13px] truncate whitespace-nowrap text-[9.5px]', k.tom === 'ok' ? 'text-[#22693f]' : k.tom === 'alerta' ? 'text-[#8a5212]' : 'text-muted-foreground')}>{k.detalhe}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-none items-end gap-2 px-2.5 pb-1.5 pt-2">
          <Segmentado valor={aba} onEscolher={setAba} altura={24}
            opcoes={[{ valor: 'resumo', rotulo: 'Resumo' }, { valor: 'historico', rotulo: 'Histórico' }]} />
          <span className="ml-auto flex items-center gap-1 pb-1 text-[10px] text-muted-foreground">
            <span className="rounded bg-[#e3edfb] px-1 text-[9px] font-semibold text-[#24508f]">do sistema</span> números do fechamento
            <Ajuda titulo="Números do sistema" oQueE="Cabeças, peso, GMD e pasto lidos do fechamento do mês."
              porQue="A ficha nunca guarda uma segunda versão: o fechamento é a fonte única." comoFazer="Para mudar, corrija o fechamento do pasto." lado="left" />
          </span>
        </div>
        <div className="mx-2.5 mb-2.5 min-h-0 flex-1 overflow-hidden rounded-md border bg-card p-2" data-testid="ficha-corpo">
          {aba === 'resumo'
            ? <AbaResumo lote={l} nomes={nomes} cadastros={cadastros} gravando={gravando} salvar={salvarCampos} />
            : <AbaHistorico eventos={hist.eventos} erro={hist.erro} carregando={hist.carregando} nomes={nomes} gravando={gravando} onDesfazer={m => { void desfazer(m); }} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BotaoDoCabecalho({ children, onClick, disabled, testid }: { children: ReactNode; onClick: () => void; disabled?: boolean; testid: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={testid}
      className="h-[26px] rounded-md border border-white/25 bg-white/10 px-2.5 text-[11px] hover:bg-white/20 disabled:opacity-50">{children}</button>
  );
}

function Bloco({ titulo, ajuda, acao, children, className, testid }: { titulo: string; ajuda: string; acao?: ReactNode; children: ReactNode; className?: string; testid?: string }) {
  return (
    <div className={cn('flex min-h-0 min-w-0 flex-col rounded-md border bg-card px-2.5 pb-2 pt-1.5', className)} data-testid={testid}>
      <div className="mb-1 flex h-[22px] items-center gap-1.5 whitespace-nowrap border-b pb-1 text-[11px] font-semibold">
        {titulo}<Ajuda titulo={titulo} oQueE={ajuda} porQue="O lote guarda só identidade e estratégia." comoFazer="Use ✎ Editar no próprio bloco." />
        <span className="ml-auto flex gap-1">{acao}</span>
      </div>
      {children}
    </div>
  );
}

const Par = ({ rotulo, children, title }: { rotulo: string; children: ReactNode; title?: string }) => (
  <>
    <span className="text-muted-foreground">{rotulo}</span>
    <span className="min-w-0 truncate font-medium" title={title}>{children}</span>
  </>
);
const KV = 'grid grid-cols-[104px_minmax(0,1fr)] items-center gap-y-0.5 text-[11px] leading-[20px] whitespace-nowrap';
const LINK = 'rounded px-1 text-[10.5px] font-medium text-[#24508f] hover:bg-[#eef3fa] disabled:opacity-50';

function opcoesDe(cadastros: readonly CadastroDoLote[], tipo: TipoDoCadastro, atual: string | null) {
  return cadastros.filter(c => c.tipo === tipo && (c.ativo || c.id === atual)).map(c => ({ value: c.id, label: c.nome }));
}

function AbaResumo({ lote: l, nomes, cadastros, gravando, salvar }: {
  lote: LoteDaLista; nomes: ReturnType<typeof mapaDoCadastro>; cadastros: readonly CadastroDoLote[]; gravando: boolean;
  salvar: (c: CamposDoLote) => Promise<boolean>;
}) {
  const sigla = (id: string) => { const c = nomes.get(id); return c ? `${c.sigla ?? ''} · ${c.nome}` : '—'; };
  const [perfil, setPerfil] = useState<null | { sistema: string; programa: string; destino: string; safra: string; carimbo: string; idade: number | null }>(null);
  const [metas, setMetas] = useState<null | { peso: number | null; gmd: number | null; data: string }>(null);
  const [erroPerfil, setErroPerfil] = useState<string | null>(null);
  const proj = projecaoDoLote(l, hojeLocal());

  const salvarPerfil = async () => {
    if (!perfil) return;
    if (perfil.safra && !/^\d{2}\/\d{2}$/.test(perfil.safra)) { setErroPerfil('Safra: no formato 26/27.'); return; }
    if (perfil.carimbo && !/^(1[0-2]|[1-9])\.[1-9]\d?$/.test(perfil.carimbo)) { setErroPerfil('Carimbo: mês.lote, ex.: 7.1.'); return; }
    const campos: CamposDoLote = {};
    if (perfil.sistema !== (l.sistemaId ?? '')) campos.sistema_id = perfil.sistema;
    if (perfil.programa !== (l.programaId ?? '')) campos.programa_id = perfil.programa;
    if (perfil.destino !== (l.destinoId ?? '')) campos.destino_id = perfil.destino;
    if (perfil.safra !== (l.safra ?? '')) campos.safra = perfil.safra;
    if (perfil.carimbo !== (l.carimbo ?? '')) campos.carimbo = perfil.carimbo;
    if (perfil.idade !== l.idadeMediaMeses) campos.idade_media_meses = perfil.idade == null ? '' : String(Math.round(perfil.idade));
    if (Object.keys(campos).length === 0) { setPerfil(null); return; }
    if (await salvar(campos)) setPerfil(null);
  };
  const salvarMetas = async () => {
    if (!metas) return;
    const campos: CamposDoLote = {};
    if (metas.peso !== l.metaPesoKg) campos.meta_peso_kg = metas.peso == null ? '' : String(metas.peso);
    if (metas.gmd !== l.metaGmdKg) campos.meta_gmd_kg = metas.gmd == null ? '' : String(metas.gmd);
    if (metas.data !== (l.metaData ?? '')) campos.meta_data = metas.data;
    if (Object.keys(campos).length === 0) { setMetas(null); return; }
    if (await salvar(campos)) setMetas(null);
  };

  const editarSalvar = (editando: boolean, abrir: () => void, fechar: () => void, gravar: () => void, testid: string) => (editando
    ? <><button type="button" className={LINK} onClick={fechar} disabled={gravando}>Cancelar</button>
        <button type="button" className={cn(LINK, 'font-bold')} onClick={gravar} disabled={gravando} data-testid={`${testid}-salvar`}>Salvar</button></>
    : <button type="button" className={LINK} onClick={abrir} data-testid={`${testid}-editar`}>✎ Editar</button>);

  return (
    <div className="grid h-full grid-cols-3 gap-2" data-testid="aba-resumo">
      <Bloco titulo="Identidade" ajuda="Código, categoria, raça e atividade. Editar identidade reabre o assistente; se a categoria, a raça ou a atividade mudar, o código muda e o antigo fica no histórico e na busca.">
        <div className={KV}>
          <Par rotulo="Código">{l.codigo}</Par>
          <Par rotulo="Categoria">{sigla(l.categoriaId)}</Par>
          <Par rotulo="Raça">{sigla(l.racaId)}</Par>
          <Par rotulo="Atividade">{sigla(l.atividadeId)}</Par>
          <Par rotulo="Nome do campeiro" title={l.nomeCampeiro ?? undefined}>{l.nomeCampeiro ?? '—'}</Par>
          <Par rotulo="Formado em">{dataBr(l.formadoEm)}</Par>
          <Par rotulo="Códigos antigos" title={l.codigosAntigos.join(' · ') || undefined}>{l.codigosAntigos.length ? l.codigosAntigos.join(' · ') : '—'}</Par>
        </div>
      </Bloco>
      <Bloco titulo="Perfil" ajuda="Sistema, programa e destino puxam a estratégia do lote; a safra amarra o lote ao ano-safra do custo." testid="bloco-perfil"
        acao={editarSalvar(perfil !== null,
          () => { setErroPerfil(null); setPerfil({ sistema: l.sistemaId ?? '', programa: l.programaId ?? '', destino: l.destinoId ?? '', safra: l.safra ?? '', carimbo: l.carimbo ?? '', idade: l.idadeMediaMeses }); },
          () => { setPerfil(null); setErroPerfil(null); }, () => { void salvarPerfil(); }, 'perfil')}>
        {perfil ? (
          <div className={KV}>
            <span className="text-muted-foreground">Sistema</span>
            <SearchableSelect value={perfil.sistema} onValueChange={v => setPerfil({ ...perfil, sistema: v })} options={opcoesDe(cadastros, 'sistema', l.sistemaId)} semTodos dense placeholder="—" />
            <span className="text-muted-foreground">Programa</span>
            <SearchableSelect value={perfil.programa} onValueChange={v => setPerfil({ ...perfil, programa: v })} options={opcoesDe(cadastros, 'programa', l.programaId)} semTodos dense placeholder="—" />
            <span className="text-muted-foreground">Destino</span>
            <SearchableSelect value={perfil.destino} onValueChange={v => setPerfil({ ...perfil, destino: v })} options={opcoesDe(cadastros, 'destino', l.destinoId)} semTodos dense placeholder="—" />
            <span className="text-muted-foreground">Safra</span>
            <Input className={cn('h-[20px] px-1 text-[11px]', erroPerfil?.startsWith('Safra') && 'border-red-500')} value={perfil.safra} maxLength={5} placeholder="26/27"
              onChange={e => { setErroPerfil(null); setPerfil({ ...perfil, safra: e.target.value }); }} />
            <span className="text-muted-foreground">Carimbo</span>
            <Input className={cn('h-[20px] px-1 text-[11px]', erroPerfil?.startsWith('Carimbo') && 'border-red-500')} value={perfil.carimbo} maxLength={5} placeholder="—"
              onChange={e => { setErroPerfil(null); setPerfil({ ...perfil, carimbo: e.target.value }); }} />
            <span className="text-muted-foreground">Idade média</span>
            <CampoNumeroComConta valor={perfil.idade} onChange={n => setPerfil({ ...perfil, idade: n })} casas={0} sufixoDentro="meses" className="h-[20px] text-[11px]" />
            <span />
            <span className="h-[14px] truncate text-[10px] leading-[14px] text-red-600" data-testid="perfil-erro">{erroPerfil ?? ''}</span>
          </div>
        ) : (
          <div className={KV}>
            <Par rotulo="Sistema">{nomeDe(nomes, l.sistemaId) ?? '—'}</Par>
            <Par rotulo="Programa">{nomeDe(nomes, l.programaId) ?? '—'}</Par>
            <Par rotulo="Destino">{nomeDe(nomes, l.destinoId) ?? '—'}</Par>
            <Par rotulo="Safra">{l.safra ?? '—'}</Par>
            <Par rotulo="Carimbo">{l.carimbo ?? '—'}</Par>
            <Par rotulo="Idade média">{l.idadeMediaMeses == null ? '—' : `${l.idadeMediaMeses} meses`}</Par>
          </div>
        )}
      </Bloco>
      <Bloco titulo="Metas e projeção" ajuda="Compara o peso do fechamento com a meta e projeta, no GMD atual, o peso na data alvo." testid="bloco-metas"
        acao={editarSalvar(metas !== null, () => setMetas({ peso: l.metaPesoKg, gmd: l.metaGmdKg, data: l.metaData ?? '' }),
          () => setMetas(null), () => { void salvarMetas(); }, 'metas')}>
        {metas ? (
          <div className={KV}>
            <span className="text-muted-foreground">Peso meta</span>
            <CampoNumeroComConta valor={metas.peso} onChange={n => setMetas({ ...metas, peso: n })} casas={0} sufixoDentro="kg" className="h-[20px] text-[11px]" />
            <span className="text-muted-foreground">GMD meta</span>
            <CampoNumeroComConta valor={metas.gmd} onChange={n => setMetas({ ...metas, gmd: n })} casas={3} sufixoDentro="kg/dia" className="h-[20px] text-[11px]" />
            <span className="text-muted-foreground">Data alvo</span>
            <DatePicker value={metas.data} onChange={v => setMetas({ ...metas, data: v })} size="compact" />
          </div>
        ) : (
          <>
            <div className={KV}>
              <Par rotulo="Peso meta">{l.metaPesoKg == null ? '—' : `${n0(l.metaPesoKg)} kg`}</Par>
              <Par rotulo="GMD meta">{l.metaGmdKg == null ? '—' : `${n3(l.metaGmdKg)} kg/dia`}</Par>
              <Par rotulo="Data alvo">{l.metaData ? dataBr(l.metaData) : '—'}</Par>
            </div>
            <div className="mt-2 flex h-[16px] items-center gap-1.5 whitespace-nowrap text-[10.5px]" data-testid="projecao">
              {proj ? (
                <>
                  <span className={cn('rounded px-1.5 text-[9.5px] font-semibold', proj.chega ? 'bg-[#e8f5ec] text-[#22693f]' : 'bg-[#fdf1e3] text-[#8a5212]')}>
                    {proj.chega ? 'No caminho' : 'Abaixo da meta'}
                  </span>
                  <span className="truncate text-muted-foreground">≈ {n0(proj.pesoNaData)} kg em {dataBr(l.metaData ?? '')}</span>
                </>
              ) : <span className="truncate text-muted-foreground">A projeção aparece com peso e GMD no fechamento e a meta preenchida.</span>}
            </div>
          </>
        )}
      </Bloco>
    </div>
  );
}

function AbaHistorico({ eventos, erro, carregando, nomes, gravando, onDesfazer }: {
  eventos: ReturnType<typeof useHistoricoDoLote>['eventos']; erro: string | null; carregando: boolean;
  nomes: ReturnType<typeof mapaDoCadastro>; gravando: boolean; onDesfazer: (m: MudancaDoHistorico) => void;
}) {
  /* só a mudança mais recente de cada campo tem Desfazer (as anteriores já foram cobertas por ela) */
  const linhas = useMemo(() => {
    const vistos = new Set<string>();
    return eventos.flatMap(ev => {
      const ms = mudancasDaTrilha(ev, nomes);
      const quando = new Date(ev.criadoEm);
      const base = { id: ev.id, data: quando.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        hora: quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), quem: ev.autor ?? '—', oQue: oQueDaTrilha(ev) };
      if (ms.length === 0) return [{ ...base, chave: `${ev.id}`, m: null, podeDesfazer: false }];
      return ms.map(m => {
        const primeiro = !vistos.has(m.chave); vistos.add(m.chave);
        return { ...base, chave: `${ev.id}:${m.chave}`, m, podeDesfazer: primeiro && m.desfazer !== null && !/^desfazer/i.test(base.oQue) };
      });
    });
  }, [eventos, nomes]);
  const TH = cn(TH_REGUA, 'sticky top-0 z-[1] bg-primary text-left');
  return (
    <div className="h-full overflow-y-auto" data-testid="aba-historico">
      <table className="w-full table-fixed border-collapse">
        <colgroup><col style={{ width: 80 }} /><col style={{ width: 44 }} /><col style={{ width: 84 }} /><col /><col style={{ width: 110 }} /><col style={{ width: 130 }} /><col style={{ width: 130 }} /><col style={{ width: 66 }} /></colgroup>
        <thead><tr><th className={TH}>Data</th><th className={TH}>Hora</th><th className={TH}>Quem</th><th className={TH}>O que</th><th className={TH}>Campo</th><th className={TH}>Antes</th><th className={TH}>Depois</th><th className={TH} /></tr></thead>
        <tbody>
          {linhas.map(r => (
            <tr key={r.chave} className="border-b border-border/60" data-testid="linha-historico">
              <td className={cn(TD_REGUA, 'tabular-nums whitespace-nowrap')}>{r.data}</td>
              <td className={cn(TD_REGUA, 'tabular-nums whitespace-nowrap')}>{r.hora}</td>
              <td className={TD_REGUA_TEXTO} title={r.quem}>{r.quem}</td>
              <td className={TD_REGUA_TEXTO} title={r.oQue}>{r.oQue}</td>
              <td className={TD_REGUA_TEXTO} title={r.m?.campo}>{r.m?.campo ?? '—'}</td>
              <td className={TD_REGUA_TEXTO} title={r.m?.antes}>{r.m?.antes ?? '—'}</td>
              <td className={TD_REGUA_TEXTO} title={r.m?.depois}>{r.m?.depois ?? '—'}</td>
              <td className={cn(TD_REGUA, 'text-center')}>
                {r.podeDesfazer && r.m && (
                  <button type="button" className={LINK} disabled={gravando} onClick={() => r.m && onDesfazer(r.m)} data-testid="historico-desfazer">Desfazer</button>
                )}
              </td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr><td colSpan={8} className="h-[60px] text-center text-[11px] text-muted-foreground">{erro ?? (carregando ? 'Lendo o histórico…' : 'Nenhuma mudança registrada.')}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
