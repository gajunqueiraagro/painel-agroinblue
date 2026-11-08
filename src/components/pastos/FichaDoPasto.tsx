/**
 * PASTO-FICHA-01 PR B (Gabriel 09:36) — a FICHA do pasto: o MESMO modal no "+ Novo" e no lápis, pelo mock aprovado
 * (`ui-validar/mock-pastos-v2.html`): cabeçalho azul-marinho, faixa de resumo, TAMANHO FIXO (1000 × 580, teto na janela), as 6 abas
 * sempre no lugar — Cadastro · Infraestrutura · Avaliações · Reformas · Lotação · Documentos e fotos.
 *   · Gravar = a PRÉVIA do banco primeiro (o que muda, campo a campo), depois "Gravar" — cadastro e área por escritores separados;
 *   · no NOVO, as abas além do Cadastro ficam desligadas até salvar (D6): o pasto ainda não existe;
 *   · listas com busca e "digitar novo" = `CampoCatalogo`; mês = `CampoDoMes` (os do Code 4, um só de cada);
 *   · texto longo mora no ⓘ (`Ajuda`); rótulo curto, sem caixa alta; recusa do banco na faixa do rodapé, nunca toast.
 * As contas e as chamadas são da lib (`fichaDoPasto.ts`).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Segmentado } from '@/components/ui/segmentado';
import { Ajuda } from '@/components/ui/ajuda';
import { BlocoFormulario, Rotulo, REGUA_CAMPO } from '@/components/ui/bloco-formulario';
import { CampoNumeroComConta } from '@/components/ui/campo-numero-com-conta';
import { DatePicker } from '@/components/ui/date-picker';
import { TD_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA } from '@/components/ui/regua-tabela';
import { CampoCatalogo } from '@/components/catalogo/CampoCatalogo';
import { CampoDoMes, anosDoCampo } from '@/components/mapa-geo/CampoDoMes';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { cn } from '@/lib/utils';
import { formatarAreaBR } from '@/lib/areaBR';
import { TIPOS_USO_OPTIONS_AGRUPADAS, isTipoUsoValido, labelDoTipoUso } from '@/lib/pastos/tiposUso';
import type { ListaDoCatalogo } from '@/lib/catalogo/catalogo';
import {
  API_FICHA_DO_PASTO, FORM_VAZIO, areaMudou, camposDoForm, camposQueMudaram, lerMudancas, pendencias,
  type ApiFichaDoPasto, type AvaliacaoDoPasto, type FichaLida, type FormDaFicha, type InfraDoPasto, type LotacaoDoMes,
  type MudancaDaPrevia, type ReformaDoPasto, type Resultado,
} from '@/lib/pastos/fichaDoPasto';

type Aba = 'cadastro' | 'infra' | 'avaliacoes' | 'reformas' | 'lotacao' | 'documentos';

const dataBR = (d: string | null | undefined) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');
const mesBR = (am: string | null | undefined) => (am ? `${am.slice(5, 7)}/${am.slice(0, 4)}` : '—');
const dec2 = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const moeda = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

const ROTULO_DO_CAMPO: Record<string, string> = {
  nome: 'Nome', tipo_uso: 'Destino', data_inicio: 'Em uso desde', data_fim: 'Encerrado em', posse: 'Posse', observacoes: 'Observações',
  forrageira_principal_id: 'Forrageira principal', forrageira_secundaria_id: 'Forrageira secundária', forrageira_implantada_em: 'Implantada em',
  relevo_id: 'Relevo', textura_id: 'Textura do solo', drenagem_id: 'Drenagem', sombra_id: 'Sombra', sombra_cobertura: 'Cobertura da sombra',
  manejo: 'Manejo', sistema_id: 'Sistema', posse_contraparte_id: 'Posse · de quem', posse_desde: 'Posse · desde', posse_ate: 'Posse · até',
};
const ROTULO_DA_POSSE: Record<string, string> = { propria: 'Própria', arrendada_de_terceiro: 'Arrendada de terceiro', cedida_a_terceiro: 'Cedida a terceiro' };

export interface FichaDoPastoProps {
  /** nulo = pasto NOVO */
  pastoId: string | null;
  fazendaId: string;
  fazendaNome: string;
  clienteId: string | null;
  /** 'AAAA-MM' do mês de hoje */
  mesDeHoje: string;
  hoje: string;
  /** nº de piquetes do pasto (pai de grupo), só leitura */
  piquetes?: number;
  podeEditar: boolean;
  aoFechar: () => void;
  /** depois de gravar (a lista relê) */
  aoGravar: () => void;
  api?: ApiFichaDoPasto;
}

/* ── peças pequenas ────────────────────────────────────────────────────────────────────────────────────────────────────── */

function Campo({ rotulo, obrig, erro, ajuda, children, className }: {
  rotulo: string; obrig?: boolean; erro?: string; ajuda?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <div className={cn('relative min-w-0 pb-[11px]', className)}>
      <div className="flex h-[13px] items-center gap-1"><Rotulo texto={rotulo} obrig={obrig} className="mb-0 flex-1 text-[9.5px] leading-[13px]" />{ajuda}</div>
      {children}
      {/* a frase da pendência mora no vão de baixo, de altura FIXA (nada se desloca quando ela aparece) */}
      <p className="absolute inset-x-0 bottom-0 h-[11px] truncate text-[9.5px] leading-[11px] text-destructive" title={erro}>{erro ?? ''}</p>
    </div>
  );
}

function CelulaDaFaixa({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="min-w-0 border-r border-white/15 px-3 py-0.5 last:border-r-0">
      <div className="truncate text-[9.5px] text-white/70">{rotulo}</div>
      <div className="truncate text-[11.5px] font-semibold text-white">{valor}</div>
    </div>
  );
}

const ABAS: { v: Aba; rotulo: string }[] = [
  { v: 'cadastro', rotulo: 'Cadastro' }, { v: 'infra', rotulo: 'Infraestrutura' }, { v: 'avaliacoes', rotulo: 'Avaliações' },
  { v: 'reformas', rotulo: 'Reformas' }, { v: 'lotacao', rotulo: 'Lotação' }, { v: 'documentos', rotulo: 'Documentos e fotos' },
];

/* ── o modal ───────────────────────────────────────────────────────────────────────────────────────────────────────────── */

export function FichaDoPasto({
  pastoId, fazendaId, fazendaNome, clienteId, mesDeHoje, hoje, piquetes = 0, podeEditar, aoFechar, aoGravar, api = API_FICHA_DO_PASTO,
}: FichaDoPastoProps) {
  const novo = pastoId == null;
  const [aba, setAba] = useState<Aba>('cadastro');
  const [lida, setLida] = useState<FichaLida | null>(null);
  const [erroDeLeitura, setErroDeLeitura] = useState<string | null>(null);
  const [form, setForm] = useState<FormDaFicha>({ ...FORM_VAZIO, mesInicio: mesDeHoje, areaDesde: mesDeHoje });
  const [mostrarPendencias, setMostrarPendencias] = useState(false);
  const [previa, setPrevia] = useState<{ mudancas: MudancaDaPrevia[]; area: string | null } | null>(null);
  const [motivo, setMotivo] = useState('');
  const [faixa, setFaixa] = useState<{ texto: string; erro: boolean } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [contagem, setContagem] = useState<{ avaliacoes: number | null; reformas: number | null }>({ avaliacoes: null, reformas: null });

  useEffect(() => {
    if (novo) return;
    let vivo = true;
    void api.ler(pastoId, mesDeHoje).then((r) => {
      if (!vivo) return;
      if (r.ok) { setLida(r.dados); setForm(r.dados.form); } else setErroDeLeitura(r.erro);
    });
    return () => { vivo = false; };
  }, [api, novo, pastoId, mesDeHoje]);

  const base = lida?.form ?? FORM_VAZIO;
  const pend = useMemo(() => pendencias(form, novo), [form, novo]);
  const mudou = novo || Object.keys(camposQueMudaram(base, form)).length > 0 || areaMudou(base, form);
  const pede = (k: keyof FormDaFicha) => (mostrarPendencias ? pend[k] : undefined);
  const trocar = (patch: Partial<FormDaFicha>) => { setForm((f) => ({ ...f, ...patch })); setPrevia(null); setFaixa(null); };
  const anos = useMemo(() => anosDoCampo(mesDeHoje), [mesDeHoje]);
  const anosLongos = useMemo(() => Array.from({ length: 41 }, (_, i) => Number(mesDeHoje.slice(0, 4)) - 35 + i), [mesDeHoje]);
  const arrendado = form.posse === 'arrendada_de_terceiro' || form.posse === 'cedida_a_terceiro';
  const somenteLeitura = !podeEditar;

  /* ── gravar: prévia → confirmar ─────────────────────────────────────────────────────────────────────────────────────── */
  const pedirPrevia = async () => {
    if (Object.keys(pend).length > 0) { setMostrarPendencias(true); setFaixa({ texto: 'Falta preencher o que está em vermelho.', erro: true }); return; }
    setOcupado(true); setFaixa(null);
    if (novo) {
      const r = await api.criar(fazendaId, camposDoForm(form), form.area ?? 0, true);
      setOcupado(false);
      if (!r.ok) { setFaixa({ texto: r.erro, erro: true }); return; }
      setPrevia({ mudancas: lerMudancas(r.dados), area: `${formatarAreaBR(form.area)} ha desde ${mesBR(form.mesInicio)}` });
      return;
    }
    if (!lida) { setOcupado(false); return; }
    const campos = camposQueMudaram(base, form);
    let mudancas: MudancaDaPrevia[] = [];
    if (Object.keys(campos).length > 0) {
      const r = await api.salvar(pastoId, lida.versao, campos, null, true);
      if (!r.ok) { setOcupado(false); setFaixa({ texto: r.erro, erro: true }); return; }
      mudancas = lerMudancas(r.dados);
    }
    let area: string | null = null;
    if (areaMudou(base, form) && form.area != null) {
      const r = await api.area(pastoId, form.area, form.areaDesde ?? mesDeHoje, 'prévia', true);
      if (!r.ok) { setOcupado(false); setFaixa({ texto: r.erro, erro: true }); return; }
      area = `${formatarAreaBR(base.area)} → ${formatarAreaBR(form.area)} ha, de ${mesBR(form.areaDesde)} em diante`;
    }
    setOcupado(false);
    if (mudancas.length === 0 && !area) { setFaixa({ texto: 'Nada a gravar: a ficha já está assim.', erro: false }); return; }
    setPrevia({ mudancas, area });
  };

  const gravar = async () => {
    if (!previa) return;
    if (previa.area && !novo && !motivo.trim()) { setFaixa({ texto: 'Informe o motivo da troca de área.', erro: true }); return; }
    setOcupado(true);
    if (novo) {
      const r = await api.criar(fazendaId, camposDoForm(form), form.area ?? 0, false);
      setOcupado(false);
      if (!r.ok) { setFaixa({ texto: r.erro, erro: true }); return; }
      toast.success(`Pasto ${form.nome.trim()} criado.`);
      aoGravar(); return;
    }
    if (!lida) { setOcupado(false); return; }
    const campos = camposQueMudaram(base, form);
    if (Object.keys(campos).length > 0) {
      const r = await api.salvar(pastoId, lida.versao, campos, motivo.trim() || null, false);
      if (!r.ok) { setOcupado(false); setFaixa({ texto: r.erro, erro: true }); return; }
    }
    if (previa.area && form.area != null) {
      const r = await api.area(pastoId, form.area, form.areaDesde ?? mesDeHoje, motivo.trim(), false);
      if (!r.ok) { setOcupado(false); setFaixa({ texto: `O cadastro foi gravado; a área não: ${r.erro}`, erro: true }); aoGravar(); return; }
    }
    setOcupado(false);
    toast.success(`Pasto ${form.nome.trim()} gravado.`);
    aoGravar();
  };

  /* ── a faixa de resumo ──────────────────────────────────────────────────────────────────────────────────────────────── */
  const r = lida?.resumo;
  const titulo = novo ? `Novo pasto — ${fazendaNome}` : `${lida?.form.nome ?? '…'} — ${fazendaNome}`;

  const catalogo = (lista: ListaDoCatalogo, k: 'sistema' | 'forrageiraPrincipal' | 'forrageiraSecundaria' | 'relevo' | 'textura' | 'drenagem' | 'sombra', testid: string) => (
    <div data-testid={testid}>
      <CampoCatalogo lista={lista} clienteId={clienteId} valor={form[k]} aoMudar={(e) => trocar({ [k]: e })} disabled={somenteLeitura}
        pendente={!!pede(k)} triggerClassName={REGUA_CAMPO} />
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !ocupado) aoFechar(); }}>
      <DialogContent className="flex h-[580px] max-h-[94vh] w-[1000px] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 [&>button]:hidden" data-testid="ficha-do-pasto">
        {/* cabeçalho azul-marinho */}
        <div className="flex h-[32px] shrink-0 items-center justify-between bg-primary px-4 text-primary-foreground">
          <DialogTitle className="truncate text-[13px] font-semibold" title={titulo}>{titulo}</DialogTitle>
          <button type="button" onClick={aoFechar} disabled={ocupado} aria-label="Fechar" className="text-white/80 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <DialogDescription className="sr-only">Ficha do pasto: cadastro, infraestrutura, avaliações, reformas, lotação e documentos</DialogDescription>
        {/* a faixa de resumo (5 lugares fixos) */}
        <div className="grid h-[38px] shrink-0 grid-cols-5 bg-[hsl(var(--primary)/0.88)]" data-testid="ficha-faixa">
          <CelulaDaFaixa rotulo="área" valor={lida?.areaOficial != null ? `${formatarAreaBR(lida.areaOficial)} ha` : novo && form.area ? `${formatarAreaBR(form.area)} ha` : '—'} />
          <CelulaDaFaixa rotulo="forrageira" valor={r?.forrageira ?? form.forrageiraPrincipal.nome ?? '—'} />
          <CelulaDaFaixa rotulo="última reforma" valor={r?.reforma ? `${r.reforma.data.slice(0, 4)}${r.reforma.idadeAnos != null ? ` · ${r.reforma.idadeAnos} anos` : ''}` : '—'} />
          <CelulaDaFaixa rotulo={`suporte${r?.epoca ? ` (${r.epoca})` : ''} · UA/ha`} valor={dec2(r?.suporte)} />
          <CelulaDaFaixa rotulo="degradação · avaliação" valor={r?.avaliacao ? `${r.avaliacao.degradacao ?? '—'} · ${dataBR(r.avaliacao.data)}` : '—'} />
        </div>
        {/* as abas, sempre no lugar */}
        <div className="flex h-[28px] shrink-0 items-end gap-0.5 border-b bg-card px-3" role="tablist">
          {ABAS.map((a) => {
            const desligada = novo && a.v !== 'cadastro';
            const n = a.v === 'avaliacoes' ? contagem.avaliacoes : a.v === 'reformas' ? contagem.reformas : null;
            return (
              <button key={a.v} type="button" role="tab" aria-selected={aba === a.v} disabled={desligada}
                title={desligada ? 'Salve o pasto primeiro' : undefined} onClick={() => setAba(a.v)} data-testid={`ficha-aba-${a.v}`}
                className={cn('h-[26px] border-b-2 px-3 text-[10.5px]', aba === a.v ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
                  desligada && 'cursor-not-allowed opacity-40')}>
                {/* a largura do NEGRITO reservada em toda aba (a cópia invisível): a ativa engrossa sem empurrar as outras */}
                <span className="inline-grid">
                  <span className="invisible col-start-1 row-start-1 font-semibold" aria-hidden>{a.rotulo}</span>
                  <span className={cn('col-start-1 row-start-1', aba === a.v && 'font-semibold')}>{a.rotulo}</span>
                </span>
                {/* o lugar da contagem é RESERVADO nas abas que contam (as abas nunca se mexem quando ela chega) */}
                {(a.v === 'avaliacoes' || a.v === 'reformas') && (
                  <span className={cn('ml-1 inline-block min-w-[16px] rounded bg-muted px-1 text-center text-[9.5px] text-muted-foreground', !(n != null && n > 0) && 'invisible')}>{n ?? 0}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* o corpo: só ele rola */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted p-1.5" data-testid="ficha-corpo">
          {erroDeLeitura ? (
            <p className="p-4 text-[11px] text-destructive">{erroDeLeitura}</p>
          ) : aba === 'cadastro' ? (
            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex flex-col gap-1.5">
                <BlocoFormulario titulo="Identificação">
                  <div className="grid grid-cols-[1fr_96px_166px] gap-x-2">
                    <Campo rotulo="nome" obrig erro={pede('nome')}>
                      <Input value={form.nome} onChange={(e) => trocar({ nome: e.target.value })} disabled={somenteLeitura}
                        className={cn(REGUA_CAMPO, pede('nome') && 'border-destructive')} data-testid="ficha-nome" />
                    </Campo>
                    <Campo rotulo="área (ha)" obrig erro={pede('area')} ajuda={<Ajuda titulo="Área do pasto" oQueE="A área oficial do pasto, a que vale na lotação, no fechamento e na DRE."
                      porQue="Trocar a área não mexe nos meses para trás: a área nova vale do mês escolhido em diante."
                      comoFazer={`Digite a área e escolha "a partir de". Mês fechado não muda: reabra antes.${lida?.areaMapa != null ? ` A do mapa é ${formatarAreaBR(lida.areaMapa)} ha.` : ''}`} />}>
                      <CampoNumeroComConta valor={form.area} onChange={(n) => trocar({ area: n })} disabled={somenteLeitura} invalido={!!pede('area')}
                        className={REGUA_CAMPO} />
                    </Campo>
                    <Campo rotulo="a partir de">
                      <div className={cn((novo || !areaMudou(base, form)) && 'pointer-events-none opacity-50')} title={novo ? 'No pasto novo, a área vale desde o "em uso desde"' : undefined}>
                        <CampoDoMes valor={novo ? form.mesInicio : form.areaDesde} onMudar={(v) => trocar(novo ? { mesInicio: v } : { areaDesde: v })}
                          anos={anos} anoDeReferencia={Number(mesDeHoje.slice(0, 4))} testid="ficha-area-desde" />
                      </div>
                    </Campo>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2">
                    <Campo rotulo="destino" obrig erro={pede('tipoUso')}>
                      <Select value={form.tipoUso} onValueChange={(v) => trocar({ tipoUso: v })} disabled={somenteLeitura}>
                        <SelectTrigger className={REGUA_CAMPO} data-testid="ficha-destino"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {!isTipoUsoValido(form.tipoUso) && (
                            <SelectGroup><SelectLabel className="text-amber-700">Valor atual (legado)</SelectLabel>
                              <SelectItem value={form.tipoUso}>{labelDoTipoUso(form.tipoUso)} — legado</SelectItem></SelectGroup>
                          )}
                          {TIPOS_USO_OPTIONS_AGRUPADAS.map((g) => (
                            <SelectGroup key={g.grupo}><SelectLabel>{g.label}</SelectLabel>
                              {g.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                    </Campo>
                    <Campo rotulo="sistema" ajuda={<Ajuda titulo="Sistema" oQueE="Como o pasto é manejado: pasto, pasto intensivo / irrigado ou confinamento."
                      porQue="Confinamento não tem potencial de lotação em UA/ha." comoFazer="Escolha na lista ou digite uma opção nova." />}>
                      {catalogo('sistema_pasto', 'sistema', 'ficha-sistema')}
                    </Campo>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2">
                    <Campo rotulo="em uso desde" obrig={novo} erro={pede('mesInicio')} ajuda={<Ajuda titulo="Em uso desde" oQueE="O primeiro mês em que o pasto existe."
                      porQue="Vazio = todos os meses. Preenchido, o pasto passa a existir a partir desse mês (gera card no fechamento e entra na área)."
                      comoFazer="Escolha o mês e o ano. No pasto novo, a área nasce com vigência desde esse mês." />}>
                      <CampoDoMes valor={form.mesInicio} onMudar={(v) => trocar({ mesInicio: v })} anos={anosLongos} anoDeReferencia={Number(mesDeHoje.slice(0, 4))}
                        permiteAberto={!novo} testid="ficha-inicio" invalido={!!pede('mesInicio')} />
                    </Campo>
                    <Campo rotulo="encerrado em" erro={pede('mesFim')} ajuda={<Ajuda titulo="Encerrado em" oQueE="O último mês de uso do pasto."
                      porQue="Depois dele o pasto não gera card no fechamento nem entra na conta de área. Os meses antes ficam como estão."
                      comoFazer="Em aberto = sem fim previsto." />}>
                      <CampoDoMes valor={form.mesFim} onMudar={(v) => trocar({ mesFim: v })} anos={anos} anoDeReferencia={Number(mesDeHoje.slice(0, 4))}
                        permiteAberto testid="ficha-fim" invalido={!!pede('mesFim')} />
                    </Campo>
                  </div>
                </BlocoFormulario>
                <BlocoFormulario titulo="Posse">
                  <div className="grid grid-cols-[auto_1fr] gap-x-2">
                    <Campo rotulo="posse">
                      <Segmentado altura={28} fonte={10.5} valor={form.posse ?? 'propria'} onEscolher={(v) => trocar({ posse: v })} opcoes={[
                        { valor: 'propria', rotulo: 'Própria' }, { valor: 'arrendada_de_terceiro', rotulo: 'Arrendada' },
                        { valor: 'cedida_a_terceiro', rotulo: 'Cedida' }]} />
                    </Campo>
                    <Campo rotulo={form.posse === 'cedida_a_terceiro' ? 'cedido a' : 'arrendado de'} className={cn(!arrendado && 'pointer-events-none opacity-40')}
                      ajuda={/* (c) a área de pasto arrendado/cedido não conta na matrícula (lugar reservado: some sem mexer nada) */
                        <span className={cn('whitespace-nowrap text-[9.5px] leading-[13px] text-amber-800', !arrendado && 'invisible')} data-testid="ficha-conta-matricula">conta na matrícula: não</span>}>
                      <FavorecidoSelect value={form.posseContraparteId} onChange={(id) => trocar({ posseContraparteId: id })} clienteId={clienteId}
                        disabled={!arrendado || somenteLeitura} triggerClassName={REGUA_CAMPO} limpavel placeholder="Escolha" linhaDoDocumento={false} />
                    </Campo>
                  </div>
                  <div className={cn('grid grid-cols-2 gap-x-2', !arrendado && 'pointer-events-none opacity-40')} aria-disabled={!arrendado}>
                    <Campo rotulo="desde">
                      <CampoDoMes valor={form.posseDesde} onMudar={(v) => trocar({ posseDesde: v })} anos={anosLongos}
                        anoDeReferencia={Number(mesDeHoje.slice(0, 4))} permiteAberto testid="ficha-posse-desde" />
                    </Campo>
                    <Campo rotulo="até" erro={pede('posseAte')}>
                      <CampoDoMes valor={form.posseAte} onMudar={(v) => trocar({ posseAte: v })} anos={anos}
                        anoDeReferencia={Number(mesDeHoje.slice(0, 4))} permiteAberto testid="ficha-posse-ate" invalido={!!pede('posseAte')} />
                    </Campo>
                  </div>
                </BlocoFormulario>
              </div>
              <div className="flex flex-col gap-1.5">
                <BlocoFormulario titulo="Forrageira">
                  <Campo rotulo="principal">{catalogo('forrageira', 'forrageiraPrincipal', 'ficha-forrageira')}</Campo>
                  <div className="grid grid-cols-[1fr_166px] gap-x-2">
                  <Campo rotulo="secundária / consórcio" erro={pede('forrageiraSecundaria')}>{catalogo('forrageira', 'forrageiraSecundaria', 'ficha-forrageira-2')}</Campo>
                  <Campo rotulo="implantada em" ajuda={<Ajuda titulo="Implantada em" oQueE="O mês da formação ou da última reforma com esta forrageira."
                    porQue="A idade da pastagem na lista sai daqui (sem ele, da última reforma do Patrimônio)." comoFazer="Escolha o mês e o ano." />}>
                    <CampoDoMes valor={form.implantadaEm} onMudar={(v) => trocar({ implantadaEm: v })} anos={anosLongos}
                      anoDeReferencia={Number(mesDeHoje.slice(0, 4))} permiteAberto testid="ficha-implantada" />
                  </Campo>
                  </div>
                </BlocoFormulario>
                <BlocoFormulario titulo="Solo, relevo e manejo">
                  {/* o relevo leva a linha (o maior nome do catálogo, "Forte ondulado (20–45%)", não cabe em 1/3); nada corta */}
                  <div className="grid grid-cols-[1fr_136px] gap-x-2">
                    <Campo rotulo="relevo">{catalogo('relevo', 'relevo', 'ficha-relevo')}</Campo>
                    <Campo rotulo="drenagem">{catalogo('drenagem', 'drenagem', 'ficha-drenagem')}</Campo>
                  </div>
                  <div className="grid grid-cols-[136px_auto_1fr] items-start gap-x-2">
                    <Campo rotulo="textura do solo">{catalogo('textura_solo', 'textura', 'ficha-textura')}</Campo>
                    <Campo rotulo="manejo" ajuda={piquetes > 0 ? <span className="whitespace-nowrap text-[9.5px] leading-[13px] text-muted-foreground">{piquetes} piq.</span> : undefined}>
                      <Segmentado altura={28} fonte={10.5} valor={form.manejo ?? 'continuo'} onEscolher={(v) => trocar({ manejo: v })}
                        sugestao={form.manejo == null} opcoes={[{ valor: 'continuo', rotulo: 'Contínuo' }, { valor: 'rotacionado', rotulo: 'Rotacionado' }]} />
                    </Campo>
                    <Campo rotulo="observações">
                      <Input value={form.observacoes} onChange={(e) => trocar({ observacoes: e.target.value })} disabled={somenteLeitura}
                        aria-label="Observações" className={REGUA_CAMPO} data-testid="ficha-observacoes" />
                    </Campo>
                  </div>
                </BlocoFormulario>
              </div>
            </div>
          ) : aba === 'infra' && pastoId ? (
            <AbaInfra api={api} pastoId={pastoId} form={form} trocar={trocar} clienteId={clienteId} somenteLeitura={somenteLeitura} />
          ) : aba === 'avaliacoes' && pastoId ? (
            <AbaAvaliacoes api={api} pastoId={pastoId} hoje={hoje} podeEditar={podeEditar}
              aoContar={(n) => setContagem((c) => ({ ...c, avaliacoes: n }))} aoGravar={aoGravar} />
          ) : aba === 'reformas' && pastoId ? (
            <AbaReformas api={api} pastoId={pastoId} aoContar={(n) => setContagem((c) => ({ ...c, reformas: n }))} />
          ) : aba === 'lotacao' && pastoId ? (
            <AbaLotacao api={api} pastoId={pastoId} ate={lida?.anoMes || mesDeHoje} />
          ) : aba === 'documentos' ? (
            <BlocoFormulario titulo="Documentos e fotos">
              <p className="py-6 text-center text-[11px] text-muted-foreground">Em breve: análise de solo, fotos, croqui, laudo e o contrato de arrendamento.</p>
            </BlocoFormulario>
          ) : null}

          {/* a PRÉVIA do banco (o que muda), antes de gravar */}
          {previa && aba === 'cadastro' && (
            <section className="mt-2 rounded-lg border border-primary/40 bg-card px-2.5 py-1.5" data-testid="ficha-previa">
              <h3 className="text-[11px] font-semibold">O que muda</h3>
              <table className="w-full table-fixed text-[10px]">
                <colgroup><col style={{ width: 170 }} /><col /><col /></colgroup>
                <tbody>
                  {previa.mudancas.map((m) => (
                    <tr key={m.campo} className="border-t border-border/40">
                      <td className="py-0.5 text-muted-foreground">{ROTULO_DO_CAMPO[m.campo] ?? m.campo}</td>
                      <td className="truncate py-0.5" title={m.antes ?? '—'}>{textoDoValor(m.campo, m.antes)}</td>
                      <td className="truncate py-0.5 font-medium" title={m.depois ?? '—'}>→ {textoDoValor(m.campo, m.depois)}</td>
                    </tr>
                  ))}
                  {previa.area && <tr className="border-t border-border/40"><td className="py-0.5 text-muted-foreground">Área</td><td colSpan={2} className="py-0.5 font-medium">{previa.area}</td></tr>}
                </tbody>
              </table>
              {!novo && (
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">motivo{previa.area ? ' *' : ''}</span>
                  <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder="Ex.: medido com GPS"
                    className="h-6 flex-1 text-[11px]" data-testid="ficha-motivo" />
                </div>
              )}
            </section>
          )}
        </div>

        {/* o rodapé: a frase (lugar fixo) e os botões */}
        <div className="flex h-[40px] shrink-0 items-center gap-2 border-t bg-card px-4">
          <p className={cn('min-w-0 flex-1 truncate text-[10.5px]', faixa?.erro ? 'text-destructive' : 'text-muted-foreground')} title={faixa?.texto} data-testid="ficha-frase">
            {faixa?.texto ?? (previa ? 'Confira o que muda e grave.' : '')}
          </p>
          <Button variant="outline" size="sm" className="h-7 w-[90px] text-[11px]" onClick={aoFechar} disabled={ocupado}>Cancelar</Button>
          {podeEditar && (previa ? (
            <Button size="sm" className="h-7 w-[110px] text-[11px]" onClick={gravar} disabled={ocupado} data-testid="ficha-gravar">{ocupado ? 'Gravando' : 'Gravar'}</Button>
          ) : (
            <Button size="sm" className="h-7 w-[110px] text-[11px]" onClick={pedirPrevia} disabled={ocupado || !mudou || aba !== 'cadastro'}
              title={aba !== 'cadastro' ? 'O Salvar é do Cadastro' : !mudou ? 'Nada mudou' : undefined} data-testid="ficha-salvar">{ocupado ? 'Conferindo' : 'Salvar'}</Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function textoDoValor(campo: string, v: string | null): string {
  if (v == null || v === '') return '—';
  if (campo === 'posse') return ROTULO_DA_POSSE[v] ?? v;
  if (campo === 'tipo_uso') return labelDoTipoUso(v);
  if (/^data_|_em$|^posse_(desde|ate)$/.test(campo)) return /^\d{4}-\d{2}/.test(v) ? mesBR(v) : v;
  return v;
}

/* ── as outras abas ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

function useLeitura<T>(ler: () => Promise<Resultado<T>>, chave: string) {
  const [estado, setEstado] = useState<{ dados: T | null; erro: string | null }>({ dados: null, erro: null });
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    let vivo = true;
    void ler().then((r) => { if (vivo) setEstado({ dados: r.ok ? r.dados : null, erro: r.ok ? null : r.erro }); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, versao]);
  return { ...estado, reler: () => setVersao((v) => v + 1) };
}

const TH = cn(TH_REGUA, 'sticky top-0 z-10 bg-primary text-left');
function Quadro({ children, testid }: { children: ReactNode; testid: string }) {
  return <div className="overflow-hidden rounded-lg border bg-card" data-testid={testid}>{children}</div>;
}

const ROTULO_INFRA: Record<string, string> = { bebedouro: 'Bebedouro', caixa_dagua: "Caixa d'água", cocho: 'Cocho', porteira: 'Porteira', represa_acude: 'Represa / açude', saleiro: 'Saleiro' };

function AbaInfra({ api, pastoId, form, trocar, clienteId, somenteLeitura }: {
  api: ApiFichaDoPasto; pastoId: string; form: FormDaFicha; trocar: (p: Partial<FormDaFicha>) => void; clienteId: string | null; somenteLeitura: boolean;
}) {
  const l = useLeitura<InfraDoPasto[]>(() => api.infra(pastoId), pastoId);
  return (
    <div className="grid grid-cols-[1fr_320px] gap-2">
      <BlocoFormulario titulo="Água, cocho e cerca" dica="vêm do mapa (as fichas da infraestrutura do pasto)">
        <Quadro testid="ficha-infra">
          <table className="w-full table-fixed border-collapse">
            <colgroup><col style={{ width: 130 }} /><col /><col /></colgroup>
            <thead><tr><th className={TH}>Tipo</th><th className={TH}>Nome</th><th className={TH}>Observação</th></tr></thead>
            <tbody>
              {(l.dados ?? []).map((i) => (
                <tr key={i.id} className="border-b border-border/40">
                  <td className={TD_REGUA_TEXTO}>{ROTULO_INFRA[i.tipo] ?? i.tipo}</td>
                  <td className={TD_REGUA_TEXTO} title={i.nome ?? undefined}>{i.nome ?? '—'}</td>
                  <td className={TD_REGUA_TEXTO} title={i.observacao ?? undefined}>{i.observacao ?? '—'}</td>
                </tr>
              ))}
              {l.dados && l.dados.length === 0 && <tr><td colSpan={3} className={cn(TD_REGUA, 'h-8 text-center text-muted-foreground')}>Nenhuma infraestrutura ligada a este pasto no mapa.</td></tr>}
              {l.erro && <tr><td colSpan={3} className={cn(TD_REGUA, 'h-8 text-center text-destructive')}>{l.erro}</td></tr>}
            </tbody>
          </table>
        </Quadro>
        <p className="mt-1 text-[10px] text-muted-foreground">O estado das cercas, da água e dos cochos se registra na aba Avaliações, com data.</p>
      </BlocoFormulario>
      <BlocoFormulario titulo="Sombra">
        <Campo rotulo="tipo">
          <div data-testid="ficha-sombra">
            <CampoCatalogo lista="sombra" clienteId={clienteId} valor={form.sombra} aoMudar={(e) => trocar({ sombra: e })} disabled={somenteLeitura} triggerClassName={REGUA_CAMPO} />
          </div>
        </Campo>
        <Campo rotulo="cobertura">
          <Segmentado altura={28} valor={form.sombraCobertura ?? 'parcial'} sugestao={form.sombraCobertura == null} onEscolher={(v) => trocar({ sombraCobertura: v })}
            opcoes={[{ valor: 'insuficiente', rotulo: 'Insuficiente' }, { valor: 'parcial', rotulo: 'Parcial' }, { valor: 'suficiente', rotulo: 'Suficiente' }]} />
        </Campo>
        <p className="text-[10px] text-muted-foreground">Sombra e manejo gravam com o Salvar do Cadastro.</p>
      </BlocoFormulario>
    </div>
  );
}

/** o valor do banco como se lê na tela (o banco guarda sem acento) */
const NIVEL_DO_BANCO: Record<string, string> = { medio: 'médio', media: 'média' };
const NIVEL3: { valor: string; rotulo: string }[] = [{ valor: 'bom', rotulo: 'Bom' }, { valor: 'regular', rotulo: 'Regular' }, { valor: 'ruim', rotulo: 'Ruim' }];
const NIVEL_BMA: { valor: string; rotulo: string }[] = [{ valor: 'baixo', rotulo: 'Baixo' }, { valor: 'medio', rotulo: 'Médio' }, { valor: 'alto', rotulo: 'Alto' }];

function AbaAvaliacoes({ api, pastoId, hoje, podeEditar, aoContar, aoGravar }: {
  api: ApiFichaDoPasto; pastoId: string; hoje: string; podeEditar: boolean; aoContar: (n: number) => void; aoGravar: () => void;
}) {
  const l = useLeitura<AvaliacaoDoPasto[]>(() => api.avaliacoes(pastoId), pastoId);
  useEffect(() => { if (l.dados) aoContar(l.dados.length); }, [l.dados, aoContar]);
  const [nova, setNova] = useState<Record<string, string | number | null> | null>(null);
  const [frase, setFrase] = useState<{ t: string; erro: boolean } | null>(null);
  const campo = (k: string) => (nova ? nova[k] ?? null : null);
  const por = (k: string, v: string | number | null) => setNova((n) => ({ ...(n ?? {}), [k]: v }));
  const gravar = async () => {
    if (!nova) return;
    const pr = await api.salvarAvaliacao(pastoId, nova, true);
    if (!pr.ok) { setFrase({ t: pr.erro, erro: true }); return; }
    const r = await api.salvarAvaliacao(pastoId, nova, false);
    if (!r.ok) { setFrase({ t: r.erro, erro: true }); return; }
    setNova(null); setFrase({ t: 'Avaliação gravada.', erro: false }); l.reler(); aoGravar();
  };
  const COL = 'whitespace-nowrap';
  return (
    <div className="flex flex-col gap-2">
      <BlocoFormulario titulo="Avaliações de campo" dica="a mais recente vale para a ficha e para a lista"
        acao={podeEditar && !nova ? <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => setNova({ data: hoje })} data-testid="ficha-nova-avaliacao">+ nova avaliação</Button> : undefined}>
        <Quadro testid="ficha-avaliacoes">
          <table className="w-full table-fixed border-collapse">
            <colgroup><col style={{ width: 74 }} /><col style={{ width: 56 }} /><col style={{ width: 56 }} /><col style={{ width: 56 }} /><col style={{ width: 62 }} />
              <col style={{ width: 54 }} /><col style={{ width: 54 }} /><col style={{ width: 80 }} /><col style={{ width: 56 }} /><col style={{ width: 58 }} /><col style={{ width: 58 }} /><col /></colgroup>
            <thead><tr>{['Data', 'Cercas', 'Água', 'Cochos', 'Invasoras', 'Cupins', 'Erosão', 'Degradação', 'Cobertura', 'Sup. águas', 'Sup. seca', 'Avaliador / obs.'].map((h, i) =>
              <th key={h} className={cn(TH, COL, (i === 0 || (i >= 8 && i <= 10)) && 'text-right')}>{h}</th>)}</tr></thead>
            <tbody>
              {(l.dados ?? []).map((a) => (
                <tr key={a.id} className="border-b border-border/40">
                  <td className={TD_REGUA_NUM}>{dataBR(a.data)}</td>
                  {[a.cercas, a.agua, a.cochos, a.invasoras, a.cupins, a.erosao, a.degradacao].map((v, i) => { const t = v == null ? '—' : (NIVEL_DO_BANCO[v] ?? v); return <td key={i} className={TD_REGUA_TEXTO} title={t}>{t}</td>; })}
                  <td className={TD_REGUA_NUM}>{a.cobertura == null ? '—' : `${a.cobertura}%`}</td>
                  <td className={TD_REGUA_NUM}>{dec2(a.suporteAguas)}</td>
                  <td className={TD_REGUA_NUM}>{dec2(a.suporteSeca)}</td>
                  <td className={TD_REGUA_TEXTO} title={[a.avaliador, a.observacoes].filter(Boolean).join(' · ') || undefined}>{[a.avaliador, a.observacoes].filter(Boolean).join(' · ') || '—'}</td>
                </tr>
              ))}
              {l.dados && l.dados.length === 0 && <tr><td colSpan={12} className={cn(TD_REGUA, 'h-8 text-center text-muted-foreground')}>Nenhuma avaliação ainda.</td></tr>}
              {l.erro && <tr><td colSpan={12} className={cn(TD_REGUA, 'h-8 text-center text-destructive')}>{l.erro}</td></tr>}
            </tbody>
          </table>
        </Quadro>
      </BlocoFormulario>
      {nova && (
        <BlocoFormulario titulo="Nova avaliação" testId="ficha-avaliacao-form">
          <div className="grid grid-cols-4 gap-x-3">
            <Campo rotulo="data"><DatePicker value={String(campo('data') ?? '')} onChange={(v) => por('data', v)} size="compact" /></Campo>
            <Campo rotulo="degradação">
              <Select value={String(campo('degradacao') ?? '')} onValueChange={(v) => por('degradacao', v)}>
                <SelectTrigger className={REGUA_CAMPO}><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{['sem', 'leve', 'moderada', 'forte', 'muito forte'].map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </Campo>
            <Campo rotulo="suporte nas águas (UA/ha)"><CampoNumeroComConta valor={typeof campo('suporte_aguas_ua_ha') === 'number' ? Number(campo('suporte_aguas_ua_ha')) : null} onChange={(n) => por('suporte_aguas_ua_ha', n)} className={REGUA_CAMPO} /></Campo>
            <Campo rotulo="suporte na seca (UA/ha)"><CampoNumeroComConta valor={typeof campo('suporte_seca_ua_ha') === 'number' ? Number(campo('suporte_seca_ua_ha')) : null} onChange={(n) => por('suporte_seca_ua_ha', n)} className={REGUA_CAMPO} /></Campo>
          </div>
          <div className="grid grid-cols-3 gap-x-3">
            {['cercas', 'agua', 'cochos'].map((k) => (
              <Campo key={k} rotulo={k === 'agua' ? 'água' : k}>
                <Segmentado altura={24} valor={String(campo(k) ?? '')} onEscolher={(v) => por(k, v)} opcoes={NIVEL3} />
              </Campo>
            ))}
            {['invasoras', 'cupins'].map((k) => (
              <Campo key={k} rotulo={k}>
                <Segmentado altura={24} valor={String(campo(k) ?? '')} onEscolher={(v) => por(k, v)} opcoes={NIVEL_BMA} />
              </Campo>
            ))}
            <Campo rotulo="avaliador"><Input value={String(campo('avaliador') ?? '')} onChange={(e) => por('avaliador', e.target.value || null)} placeholder="quem avaliou (vazio = você)" className={REGUA_CAMPO} /></Campo>
          </div>
          <div className="flex items-center gap-2">
            <p className={cn('min-w-0 flex-1 truncate text-[10px]', frase?.erro ? 'text-destructive' : 'text-muted-foreground')} title={frase?.t}>{frase?.t ?? ''}</p>
            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => { setNova(null); setFrase(null); }}>Cancelar</Button>
            <Button size="sm" className="h-6 px-2 text-[10px]" onClick={gravar} data-testid="ficha-gravar-avaliacao">Gravar avaliação</Button>
          </div>
        </BlocoFormulario>
      )}
    </div>
  );
}

function AbaReformas({ api, pastoId, aoContar }: { api: ApiFichaDoPasto; pastoId: string; aoContar: (n: number) => void }) {
  const l = useLeitura<ReformaDoPasto[]>(() => api.reformas(pastoId), pastoId);
  useEffect(() => { if (l.dados) aoContar(l.dados.length); }, [l.dados, aoContar]);
  return (
    <BlocoFormulario titulo="Formações e reformas" dica="vêm do Patrimônio (bens com este pasto ligado)">
      <Quadro testid="ficha-reformas">
        <table className="w-full table-fixed border-collapse">
          <colgroup><col style={{ width: 80 }} /><col /><col style={{ width: 80 }} /><col style={{ width: 110 }} /><col style={{ width: 90 }} /><col style={{ width: 110 }} /></colgroup>
          <thead><tr>{['Data', 'Intervenção', 'Área ha', 'Custo R$', 'R$ / ha', 'Contábil hoje R$'].map((h, i) =>
            <th key={h} className={cn(TH, (i === 0 || i >= 2) && 'text-right')}>{h}</th>)}</tr></thead>
          <tbody>
            {(l.dados ?? []).map((r) => (
              <tr key={r.bemId} className="border-b border-border/40">
                <td className={TD_REGUA_NUM}>{dataBR(r.data)}</td>
                <td className={TD_REGUA_TEXTO} title={r.descricao ?? undefined}>{r.descricao ?? '—'}</td>
                <td className={TD_REGUA_NUM}>{formatarAreaBR(r.areaHa) || '—'}</td>
                <td className={TD_REGUA_NUM}>{moeda(r.custo)}</td>
                <td className={TD_REGUA_NUM}>{moeda(r.rsHa)}</td>
                <td className={TD_REGUA_NUM}>{moeda(r.contabil)}</td>
              </tr>
            ))}
            {l.dados && l.dados.length === 0 && <tr><td colSpan={6} className={cn(TD_REGUA, 'h-8 text-center text-muted-foreground')}>Nenhuma reforma no Patrimônio ligada a este pasto.</td></tr>}
            {l.erro && <tr><td colSpan={6} className={cn(TD_REGUA, 'h-8 text-center text-destructive')}>{l.erro}</td></tr>}
          </tbody>
        </table>
      </Quadro>
      <p className="mt-1 text-[10px] text-muted-foreground">Para registrar uma reforma: Patrimônio › novo bem (categoria com pastos) e ligue este pasto.</p>
    </BlocoFormulario>
  );
}

function AbaLotacao({ api, pastoId, ate }: { api: ApiFichaDoPasto; pastoId: string; ate: string }) {
  const l = useLeitura<LotacaoDoMes[]>(() => api.lotacao(pastoId, ate), `${pastoId}|${ate}`);
  const meses = [...(l.dados ?? [])].sort((a, b) => a.anoMes.localeCompare(b.anoMes));
  const teto = Math.max(1, ...meses.map((m) => Math.max(m.uaHa ?? 0, m.suporte ?? 0)));
  return (
    <div className="grid grid-cols-[1fr_380px] gap-2">
      <BlocoFormulario titulo="Lotação × suporte" dica="do fechamento mensal de pastos">
        <Quadro testid="ficha-lotacao">
          <table className="w-full table-fixed border-collapse">
            <colgroup><col style={{ width: 70 }} /><col /><col /><col /><col /><col style={{ width: 60 }} /><col style={{ width: 70 }} /></colgroup>
            <thead><tr>{['Mês', 'Cabeças', 'UA', 'UA / ha', 'Suporte', 'Época', 'Situação'].map((h, i) =>
              <th key={h} className={cn(TH, i <= 4 && 'text-right')}>{h}</th>)}</tr></thead>
            <tbody>
              {[...meses].reverse().map((m) => (
                <tr key={m.anoMes} className="border-b border-border/40">
                  <td className={TD_REGUA_NUM}>{mesBR(m.anoMes)}</td>
                  <td className={TD_REGUA_NUM}>{m.cabecas == null ? '—' : m.cabecas.toLocaleString('pt-BR')}</td>
                  <td className={TD_REGUA_NUM}>{dec2(m.ua)}</td>
                  <td className={cn(TD_REGUA_NUM, m.acima && 'font-semibold text-red-700')}>{dec2(m.uaHa)}</td>
                  <td className={TD_REGUA_NUM}>{dec2(m.suporte)}</td>
                  <td className={TD_REGUA_TEXTO}>{m.epoca ?? '—'}</td>
                  <td className={cn(TD_REGUA_TEXTO, m.acima ? 'text-red-700' : 'text-muted-foreground')}>{m.uaHa == null ? '—' : m.acima ? 'acima' : m.suporte == null ? 'sem suporte' : 'dentro'}</td>
                </tr>
              ))}
              {l.dados && l.dados.length === 0 && <tr><td colSpan={7} className={cn(TD_REGUA, 'h-8 text-center text-muted-foreground')}>Sem fechamento nos últimos 12 meses.</td></tr>}
              {l.erro && <tr><td colSpan={7} className={cn(TD_REGUA, 'h-8 text-center text-destructive')}>{l.erro}</td></tr>}
            </tbody>
          </table>
        </Quadro>
      </BlocoFormulario>
      <BlocoFormulario titulo="UA/ha por mês">
        <svg viewBox="0 0 360 170" className="h-[180px] w-full" role="img" aria-label="Lotação por mês" data-testid="ficha-grafico">
          {meses.map((m, i) => {
            const w = 360 / Math.max(12, meses.length); const x = i * w + 4; const h = ((m.uaHa ?? 0) / teto) * 140;
            const hs = ((m.suporte ?? 0) / teto) * 140;
            return (
              <g key={m.anoMes}>
                <rect x={x} y={150 - h} width={w - 8} height={h} className={m.acima ? 'fill-red-500' : 'fill-emerald-500'} />
                {m.suporte != null && <line x1={x - 2} x2={x + w - 6} y1={150 - hs} y2={150 - hs} className="stroke-slate-500" strokeWidth={1.5} strokeDasharray="3 2" />}
                <text x={x + (w - 8) / 2} y={164} textAnchor="middle" className="fill-muted-foreground text-[9.5px]">{m.anoMes.slice(5)}</text>
              </g>
            );
          })}
        </svg>
        <p className="text-[10px] text-muted-foreground">verde = dentro do suporte · vermelho = acima · tracejado = suporte da época</p>
      </BlocoFormulario>
    </div>
  );
}
