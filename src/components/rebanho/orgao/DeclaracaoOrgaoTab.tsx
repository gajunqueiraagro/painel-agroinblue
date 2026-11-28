/**
 * REBANHO-ORGAO-01 (F3 v3) — Produção › Rebanho › Declaração ao órgão. Mock v3 APROVADO (Gabriel 27/11): `ui-validar/rebanho-orgao-01-ref/
 * mock-v3-sugestao.html`. O estado e os gestos: `useDeclaracaoOrgao`; a conta: `propostaDaDeclaracao` (F2, uma só para a tela e o relatório).
 *   · Etapa = Ano + mês (maio/novembro), INDEPENDENTE da fazenda; a encerrada (ou a fazenda declarada) abre SÓ LEITURA, com os números
 *     congelados e o comprovante.
 *   · Fazenda = o seletor da casa com busca, com o status de cada uma (a declarar · declarada · sem rebanho); a sem rebanho mostra o
 *     estado vazio DENTRO do quadro (nada some, nada trava).
 *   · Órgão × sistema NA MESMA DATA (a do comprovante). O que não fecha fica em vermelho com ⓘ → o modal das causas (nunca sugere morte;
 *     a quantidade da GTA/nota diferente do embarque manda retificar a GTA e acertar a nota).
 *   · Exportar ▾ Excel/PDF = o relatório de sugestão para o declarante. NADA É DECLARADO PELO SISTEMA; "Marcar como declarado" é discreto,
 *     depois do relatório (congela + comprovante; desfazer pede motivo).
 * ⚠ Sem número = "—" (nunca 0). Editado = amarelo + ↺. Layout fixo: `colgroup` em px; lado direito 300px; cabeçalho e total presos.
 */
import { Fragment, useState, type ReactNode } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { Button } from '@/components/ui/button';
import { Segmentado } from '@/components/ui/segmentado';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import { CampoNumeroComConta } from '@/components/ui/campo-numero-com-conta';
import { ConfirmarComMotivo } from '@/components/ui/confirmar-com-motivo';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { TD_REGUA, TD_REGUA_NUM, TH_REGUA } from '@/components/ui/regua-tabela';
import { cn } from '@/lib/utils';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { extrairLinhasPdf } from '@/lib/oc/leitura/linhasDoPdf';
import type { RegraDeAceite } from '@/lib/arquivo/aceitarArquivo';
import { useDeclaracaoOrgao, type DaFazenda, type LerLinhasDoPdf } from '@/hooks/useDeclaracaoOrgao';
import type { DeclaracaoApi } from '@/lib/rebanho/orgao/declaracaoApi';
import { FAIXAS, ROTULO_DA_FAIXA, type Sexo } from '@/lib/rebanho/orgao/tipos';
import type { Explicacao, GrupoDoSistema, LinhaDaProposta } from '@/lib/rebanho/orgao/propostaDaDeclaracao';
import { diasAte, prazoDaEtapa, type CelulaEditavel } from '@/lib/rebanho/orgao/montarDeclaracao';
import { ROTULO_DO_STATUS, type StatusDaFazenda } from '@/lib/rebanho/orgao/etapaDaTela';
import { baixarRelatorioExcel, baixarRelatorioPdf, type Relatorio } from '@/lib/rebanho/orgao/relatorioDaDeclaracao';

const REGRA_DO_PDF: RegraDeAceite = { tipos: ['pdf'], tamanhoMaxBytes: 10 * 1024 * 1024 };
const lerPdfDoApp: LerLinhasDoPdf = async (f) => (await extrairLinhasPdf(f)).linhas;
const dataBR = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const n0 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('pt-BR'));
const comSinal = (v: number) => (v > 0 ? `+${v.toLocaleString('pt-BR')}` : v.toLocaleString('pt-BR'));
const NOME: Record<Sexo, string> = { F: 'Fêmea', M: 'Macho' };
const GRUPO: Record<Sexo, string> = { F: 'Fêmeas', M: 'Machos' };
/* as colunas do mock v3 (somam 756px) */
const COLS = [44, 112, 52, 72, 72, 72, 46, 56, 56, 50];
const LARGURA = COLS.reduce((a, c) => a + c, 0);
const TH = cn(TH_REGUA, 'sticky top-0 z-10 bg-primary text-right');
const COR_DO_STATUS: Record<StatusDaFazenda, string> = {
  a_declarar: 'bg-amber-100 text-amber-900', declarada: 'bg-emerald-100 text-emerald-800', sem_rebanho: 'bg-slate-200 text-slate-600',
};
const CLASSE: Record<Explicacao['classe'], string> = {
  a: 'morte/consumo não declarado', b: 'contagem sem registro', c: 'saída sem eGTA', d: 'sexo declarado antes', e: 'GTA/nota ≠ embarque',
};
const faixaDoGrupo = (g: GrupoDoSistema) => (g.de === g.ate ? ROTULO_DA_FAIXA[g.de] : `${ROTULO_DA_FAIXA[g.de]} a ${ROTULO_DA_FAIXA[g.ate]}`);
const difs = (f: DaFazenda) => (f.proposta ? (['F', 'M'] as const).flatMap((s) => (f.proposta?.sistema[s] ?? [])
  .filter((g) => g.dif !== null && g.dif !== 0).map((g) => ({ s, g }))) : []);
const causasDe = (f: DaFazenda, s: Sexo) => f.explicacoes.filter((x) => x.sexo === s || x.sexo === null);

/** A tela do menu: o cliente vem do contexto. */
export function DeclaracaoOrgaoTab() {
  const { clienteAtual } = useCliente();
  return <DeclaracaoOrgao clienteId={clienteAtual?.id ?? null} clienteNome={clienteAtual?.nome ?? ''} />;
}

/** A tela de verdade (monta isolada na bancada e no teste: a API, o leitor do PDF e o "hoje" injetáveis). */
export function DeclaracaoOrgao(props: { clienteId: string | null; clienteNome: string; api?: DeclaracaoApi; lerPdf?: LerLinhasDoPdf; hoje?: string }) {
  const { clienteId, clienteNome } = props;
  const hoje = props.hoje ?? hojeLocal();
  const d = useDeclaracaoOrgao({ clienteId, hoje, api: props.api, lerPdf: props.lerPdf ?? lerPdfDoApp });
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [frase, setFrase] = useState<string | null>(null);
  const [causa, setCausa] = useState<{ s: Sexo; g: GrupoDoSistema } | null>(null);
  const atual = d.porFazenda.find((f) => f.fazenda.id === escolhida) ?? d.porFazenda.find((f) => f.status === 'a_declarar') ?? d.porFazenda[0] ?? null;

  if (!clienteId) return <Vazio texto="Escolha o cliente." />;
  if (d.erro) return <Vazio texto={d.erro} />;
  if (d.carregando) return <Vazio texto="Carregando…" />;
  if (!d.uf) return <Vazio texto="Nenhuma fazenda tem a UF no cadastro: cadastre a UF para ver a etapa do órgão." />;
  if (!d.ano || !d.mes) return <Vazio texto={`Sem etapa de declaração cadastrada para ${d.uf}.`} />;

  const etapa = d.etapa;
  const prazo = etapa ? prazoDaEtapa(etapa) : null;
  const faltam = prazo ? diasAte(hoje, prazo) : null;
  const orgao = etapa ? `${etapa.orgao} (${etapa.uf})` : d.uf;
  const rotuloEtapa = `${d.mes}/${d.ano}`;
  const agir = (p: Promise<string | null>) => { setFrase(null); void p.then(setFrase); };
  const declarada = atual?.declaracao?.status === 'declarada';
  const exportar = (tipo: 'excel' | 'pdf') => {
    const r: Relatorio = { cliente: clienteNome, etapa: rotuloEtapa, orgao, emitidoEm: dataBR(hoje), fazendas: d.porFazenda
      .filter((f) => f.proposta).map((f) => ({ nome: f.fazenda.nome, dataDoSaldo: f.comprovante ? dataBR(f.dataDosNumeros) : null, proposta: f.proposta, explicacoes: f.explicacoes })) };
    const nome = `Sugestao_declaracao_${d.ano}-${d.mes}_${clienteNome.replace(/[^\p{L}\p{N}]+/gu, '_')}`;
    agir((tipo === 'excel' ? baixarRelatorioExcel(`${nome}.xlsx`, r) : baixarRelatorioPdf(`${nome}.pdf`, r))
      .then(() => null, (e: unknown) => { console.error('[declaração ao órgão] relatório', e); return 'Não consegui gerar o relatório. Tente de novo.'; }));
  };
  const pill = declarada ? `declarada em ${dataBR(atual?.declaracao?.declaradaEm?.slice(0, 10))} · só leitura`
    : d.encerrada ? `etapa encerrada em ${dataBR(prazo)} · só leitura`
    : faltam === null ? 'sem etapa no calendário' : faltam >= 0 ? `prazo ${dataBR(prazo).slice(0, 5)} · faltam ${faltam} ${faltam === 1 ? 'dia' : 'dias'}`
    : `venceu há ${-faltam} ${faltam === -1 ? 'dia' : 'dias'}`;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3 text-[11px]" data-testid="declaracao-orgao">
      <div className="flex h-[40px] shrink-0 items-center gap-3 rounded-md bg-primary px-3 text-primary-foreground">
        <span className="shrink-0 text-[13px] font-semibold">Declaração do rebanho</span>
        <span className="min-w-0 flex-1 truncate" title={`${clienteNome} · ${orgao} · etapa de ${rotuloEtapa}`}>{clienteNome} · {orgao} · etapa de {rotuloEtapa}</span>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', declarada || d.encerrada ? 'bg-slate-200 text-slate-700' : 'bg-amber-300 text-amber-950')}
          data-testid="prazo">{pill}</span>
      </div>

      <div className="flex h-[28px] shrink-0 items-center gap-2">
        <span className="shrink-0 text-[10px] text-muted-foreground">Etapa</span>
        <div className="w-[76px] shrink-0" data-testid="seletor-ano">
          <SearchableSelect value={d.ano} onValueChange={(v) => { d.escolherEtapa(v, d.mes ?? ''); setFrase(null); }} semTodos
            options={d.anos.map((a) => ({ value: a, label: a }))} triggerClassName="h-[26px] text-[10.5px]" />
        </div>
        <Segmentado valor={d.mes} onEscolher={(m) => { d.escolherEtapa(d.ano ?? '', m); setFrase(null); }}
          opcoes={d.meses.map((m) => ({ valor: m, rotulo: m }))} />
        <span className="shrink-0 text-[10px] text-muted-foreground">Fazenda</span>
        <div className="flex w-[260px] shrink-0 items-center gap-1" data-testid="seletor-fazenda">
          <div className="min-w-0 flex-1">
            <SearchableSelect value={atual?.fazenda.id ?? ''} onValueChange={(v) => { setEscolhida(v); setFrase(null); }} semTodos placeholder="Fazenda"
              options={d.porFazenda.map((f) => ({ value: f.fazenda.id, label: f.fazenda.nome, hint: ROTULO_DO_STATUS[f.status] }))}
              triggerClassName="h-[26px] text-[10.5px] font-semibold" nomeInteiro />
          </div>
          {atual && <span className={cn('w-[66px] shrink-0 rounded-full py-px text-center text-[9.5px] font-semibold', COR_DO_STATUS[atual.status])}
            data-testid="status-da-fazenda">{ROTULO_DO_STATUS[atual.status]}</span>}
        </div>
        {atual && <ChipDivergencias f={atual} />}
        <span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground" data-testid="fora-da-uf" title={d.foraDaUf.length ? `fora desta UF: ${d.foraDaUf.map((f) => `${f.nome} (${f.uf ?? 'sem UF — cadastre'})`).join(', ')}` : undefined}>
          {d.foraDaUf.length > 0 ? `${d.foraDaUf.length} fora da UF` : ''}
        </span>
        <span className="min-w-0 flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-[26px] shrink-0 text-[10.5px]" disabled={!d.porFazenda.some((f) => f.proposta)} data-testid="exportar">Exportar ▾</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[270px]">
            <DropdownMenuItem onSelect={() => exportar('excel')} data-testid="exportar-excel">
              <span className="flex flex-col"><span>Relatório de sugestão · Excel</span><span className="opacity-75">.xlsx · uma aba por fazenda + diferenças</span></span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => exportar('pdf')} data-testid="exportar-pdf">
              <span className="flex flex-col"><span>Relatório de sugestão · PDF</span><span className="opacity-75">para o contador ou o declarante</span></span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {!etapa || !atual ? <Vazio texto={!etapa ? `Sem etapa de ${rotuloEtapa} no calendário de ${d.uf}.` : `Nenhuma fazenda em ${d.uf}.`} /> : (
        <>
          <Passos f={atual} encerrada={d.encerrada} />
          {atual.soLeitura ? (
            <div className="flex h-[28px] shrink-0 items-center gap-2 rounded-md border bg-slate-100 px-3 text-[10.5px]" data-testid="faixa-so-leitura">
              <b className="shrink-0 font-semibold">Só leitura</b>
              <span className="min-w-0 flex-1 truncate" title={declarada ? 'os números desta etapa estão congelados' : 'o prazo desta etapa passou'}>
                {declarada ? `declarada em ${dataBR(atual.declaracao?.declaradaEm?.slice(0, 10))} · os números desta etapa estão congelados`
                  : `etapa encerrada em ${dataBR(prazo)} · sem declaração marcada no sistema para ${atual.fazenda.nome}`}
              </span>
              {(atual.declaracao?.comprovanteArquivo || atual.declaracao?.saldoArquivo) && (
                <button type="button" className="shrink-0 text-blue-700 hover:underline" onClick={() => agir(d.abrirComprovante(atual.fazenda.id))}
                  data-testid="abrir-comprovante">{atual.declaracao?.comprovanteArquivo ? 'comprovante declarado ↗' : 'saldo do órgão ↗'}</button>
              )}
            </div>
          ) : (
            <AreaDeArquivo regra={REGRA_DO_PDF} className="h-7 shrink-0" testId="soltar-pdf-orgao" inputTestId="input-pdf-orgao"
              convite={`Solte aqui o saldo do órgão de ${atual.fazenda.nome}, ou clique para escolher`} detalhe="PDF do e-Saniagro · lido no navegador"
              desabilitado={!!d.ocupado} motivoDesabilitado="Gravando…"
              onArquivos={(arqs) => { if (arqs[0]) agir(d.soltarPdf(atual.fazenda.id, arqs[0])); }} />
          )}
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px] gap-3">
            <Quadro f={atual} encerrada={d.encerrada} ocupado={!!d.ocupado} aoEditar={(c, v) => agir(d.editar(atual.fazenda.id, c, v))}
              aoCausa={(s, g) => setCausa({ s, g })} />
            <div className="flex min-h-0 min-w-0 flex-col gap-2.5 overflow-y-auto">
              <Sugestao f={atual} ocupado={!!d.ocupado} aoDeclarar={(arq) => agir(d.declarar(atual.fazenda.id, arq))}
                aoDesfazer={(m) => agir(d.desfazer(atual.fazenda.id, m))} />
              <Diferencas f={atual} aoCausa={(s, g) => setCausa({ s, g })} />
              <CardBrucelose f={atual} />
            </div>
          </div>
          <ModalDaCausa f={atual} aberto={causa} aoFechar={() => setCausa(null)}
            aoEditar={(s) => { setCausa(null); document.querySelector<HTMLInputElement>(`[data-testid="mc-${s}-3"] input`)?.focus(); }} />
        </>
      )}
      <div className="h-[16px] shrink-0 truncate text-[10px] text-muted-foreground" data-testid="frase-da-declaracao" title={frase ?? undefined}>{frase ?? ''}</div>
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <div className="m-6 rounded-md border border-dashed p-6 text-center text-[11px] text-muted-foreground" data-testid="declaracao-vazia">{texto}</div>;
}

function ChipDivergencias({ f }: { f: DaFazenda }) {
  const n = difs(f).length;
  const semCausa = difs(f).filter(({ s }) => causasDe(f, s).length === 0).length;
  const texto = f.status === 'sem_rebanho' ? 'sem rebanho nesta etapa' : f.declaracao?.status === 'declarada' ? 'declarada · números congelados'
    : !f.comprovante ? 'sem comprovante lido' : !f.proposta ? '—' : n ? `${n} ${n === 1 ? 'diferença' : 'diferenças'}${semCausa ? ` · ${semCausa} sem causa no sistema` : ''}` : 'nenhuma diferença';
  const cor = f.status === 'sem_rebanho' || ((!f.proposta || !f.comprovante) && f.declaracao?.status !== 'declarada') ? 'bg-slate-200 text-slate-600'
    : f.declaracao?.status === 'declarada' || n === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700';
  return <span className={cn('inline-flex h-[20px] w-[220px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold', cor)}
    data-testid="chip-divergencias">{texto}</span>;
}

function Passo({ n, estado, titulo, detalhe, testid }: { n: number; estado: 'ok' | 'agora' | 'falta'; titulo: string; detalhe: string; testid: string }) {
  return (
    <div className="flex h-[44px] min-w-0 flex-1 items-center gap-2 rounded-md border bg-card px-2.5" data-testid={testid}>
      <span className={cn('flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white',
        estado === 'ok' ? 'bg-emerald-600' : estado === 'agora' ? 'bg-amber-600' : 'bg-slate-400')}>{estado === 'ok' ? '✓' : n}</span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[11px] font-semibold" title={titulo}>{titulo}</span>
        <span className="truncate text-[9.5px] text-muted-foreground" title={detalhe}>{detalhe}</span>
      </span>
    </div>
  );
}

function Passos({ f, encerrada }: { f: DaFazenda; encerrada: boolean }) {
  const declarada = f.declaracao?.status === 'declarada';
  const n = difs(f).length;
  const total = f.proposta ? (['F', 'M'] as const).reduce((a, s) => a + (f.proposta?.sistema[s] ?? []).reduce((b, g) => b + g.cab, 0), 0) : null;
  const casadas = f.casamento ? f.casamento.casados.reduce((a, x) => a + x.documentos.length, 0) : null;
  const semRebanho = f.status === 'sem_rebanho';
  return (
    <div className="flex shrink-0 gap-2">
      <Passo n={1} testid="passo-saldo" estado={f.comprovante ? 'ok' : 'falta'} titulo="Saldo do órgão"
        detalhe={f.comprovante ? `Comprovante ${dataBR(f.comprovante.saldoEm.slice(0, 10))} ${f.comprovante.saldoEm.slice(11, 16)} · lido`
          : semRebanho ? 'sem bovinos no comprovante' : encerrada ? 'etapa encerrada' : 'solte o Comprovante de Saldo (PDF)'} />
      <Passo n={2} testid="passo-sistema" estado={f.proposta ? 'ok' : 'falta'} titulo="Sistema na mesma data"
        detalhe={semRebanho ? `sem bovinos em ${dataBR(f.dataDosNumeros).slice(0, 5)}`
          : `rebanho em ${dataBR(f.dataDosNumeros)} · ${n0(total)} cab${casadas !== null ? ` · ${casadas} eGTA casadas` : ''}`} />
      <Passo n={3} testid="passo-conferir" estado={declarada || (f.proposta && n === 0) ? 'ok' : f.proposta ? 'agora' : 'falta'} titulo="Conferir e editar"
        detalhe={semRebanho ? 'nada a conferir' : f.proposta ? `${n} ${n === 1 ? 'diferença' : 'diferenças'}` : '—'} />
      <Passo n={4} testid="passo-relatorio" estado={declarada ? 'ok' : 'falta'} titulo="Relatório para o declarante"
        detalhe={declarada ? `declarada em ${dataBR(f.declaracao?.declaradaEm?.slice(0, 10))}` : semRebanho ? 'nada a declarar' : 'Exportar · Excel ou PDF'} />
    </div>
  );
}

/* ═══ a tabela ═══ */
function CelulaEditada({ valor, sugerido, editavel, aoMudar, testid }: {
  valor: number | null; sugerido: number | null; editavel: boolean; aoMudar: (v: number | null) => void; testid: string;
}) {
  const editado = valor !== sugerido;
  if (!editavel) return <span className="tabular-nums" data-testid={testid}>{n0(valor)}</span>;
  return (
    <span className="inline-flex items-center justify-end gap-0.5" data-testid={testid}>
      <CampoNumeroComConta valor={valor} casas={0} soAoSair onChange={(v) => aoMudar(v === null ? null : Math.max(0, Math.round(v)))}
        placeholder="—" title={valor === null ? 'o sistema não sabe: preencha' : editado ? `editado · sugerido ${n0(sugerido)}` : 'sugerido pelo sistema · editável'}
        className={cn('h-[17px] w-[52px] text-right text-[10px]', editado && 'bg-amber-100', valor === null && 'border-amber-500 bg-amber-50')} />
      <button type="button" className={cn('w-[10px] text-[10px] text-muted-foreground hover:text-foreground', !editado && 'invisible')}
        title={`voltar ao sugerido (${n0(sugerido)})`} onClick={() => aoMudar(null)} data-testid={`${testid}-voltar`}>↺</button>
    </span>
  );
}

function Info({ aoClicar, titulo, testid }: { aoClicar: () => void; titulo: string; testid: string }) {
  return (
    <button type="button" onClick={aoClicar} title={titulo} data-testid={testid}
      className="ml-1 inline-flex h-[13px] w-[13px] items-center justify-center rounded-full border border-current align-middle text-[8.5px] font-bold">i</button>
  );
}

function Quadro({ f, encerrada, ocupado, aoEditar, aoCausa }: {
  f: DaFazenda; encerrada: boolean; ocupado: boolean; aoEditar: (c: CelulaEditavel, v: number | null) => void; aoCausa: (s: Sexo, g: GrupoDoSistema) => void;
}) {
  const p = f.proposta;
  const editavel = !!p && !ocupado && !f.soLeitura && !!f.comprovante;
  const dataCurta = dataBR(f.dataDosNumeros);
  const total = (sel: (l: LinhaDaProposta) => number | null) => {
    if (!p) return null;
    const xs = (['F', 'M'] as const).flatMap((s) => p.linhas[s].map(sel));
    return xs.some((x) => x === null) ? null : xs.reduce<number>((a, x) => a + (x ?? 0), 0);
  };
  const sistemaSoma = (sel: (g: GrupoDoSistema) => number | null) => {
    if (!p) return null;
    const xs = (['F', 'M'] as const).flatMap((s) => p.sistema[s].map(sel));
    return xs.some((x) => x === null) ? null : xs.reduce<number>((a, x) => a + (x ?? 0), 0);
  };
  const totalSistema = sistemaSoma((g) => g.cab);
  const totalDif = sistemaSoma((g) => g.dif);
  const colgroup = <colgroup>{COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>;
  const vazio = f.status === 'sem_rebanho' ? { b: 'Sem rebanho nesta etapa', t: `Nem o sistema nem o comprovante do órgão têm bovinos de ${f.fazenda.nome} em ${dataBR(f.dataDosNumeros)}.`,
    t2: f.soLeitura ? '' : 'Se o órgão tiver, solte o comprovante acima.' }
    : !p ? (encerrada ? { b: 'Etapa encerrada', t: 'Não há declaração marcada no sistema para esta fazenda nesta etapa.', t2: '' }
      : { b: 'Falta o saldo do órgão', t: 'Solte acima o Comprovante de Saldo do e-Saniagro: o sistema compara na mesma data.', t2: '' }) : null;
  return (
    <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card" data-testid="tabela-evolucao">
      <div className="flex h-[30px] shrink-0 items-center gap-2 px-2.5">
        <span className="shrink-0 whitespace-nowrap text-[12px] font-semibold">Sugestão de evolução por sexo e faixa · bovinos</span>
        <span className="min-w-0 flex-1 truncate text-right text-[10px] text-muted-foreground"
          title={f.depois.lancamentos ? `${f.depois.lancamentos} lançamento(s) depois do saldo do órgão (${n0(f.depois.cab)} cab) não entram: baixe o comprovante de hoje no e-Saniagro` : undefined}>
          {f.depois.lancamentos > 0 && <span className="text-amber-700">{f.depois.lancamentos} lançamento(s) depois de {dataCurta} · </span>}
          órgão em {dataCurta} × sistema em {dataCurta}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {vazio ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground" data-testid="quadro-vazio">
            <b className="text-[12px] font-semibold text-foreground">{vazio.b}</b><span>{vazio.t}</span>{vazio.t2 && <span>{vazio.t2}</span>}
          </div>
        ) : p && (
          <table className="table-fixed border-separate border-spacing-0" style={{ width: LARGURA }}>
            {colgroup}
            <thead><tr>
              <th className={cn(TH, 'text-left')}>Sexo</th><th className={cn(TH, 'text-left')}>Faixa (órgão)</th>
              <th className={TH} title={`o comprovante do órgão em ${dataBR(f.dataDosNumeros)}`}>Órgão</th>
              <th className={TH} title="Nascimentos: lançados no sistema desde a última declaração · editável">Nasc.</th>
              <th className={TH} title="Mortes/consumo · editável">Mortes</th>
              <th className={TH} title="Passa p/ próxima faixa (sobe 1 faixa) · editável">Passa</th>
              <th className={TH} title="da faixa anterior">Entra</th>
              <th className={TH}>Sugerido</th>
              <th className={TH} title={`Sistema em ${dataBR(f.dataDosNumeros)}: último fechamento + movimentos até a data do saldo`}>Sistema</th>
              <th className={TH} title="Diferença = sistema − sugerido">Dif.</th>
            </tr></thead>
            <tbody>
              {(['F', 'M'] as const).map((s) => (
                <Fragment key={s}>
                  <tr className="h-[20px] bg-muted"><td colSpan={10} className={cn(TD_REGUA, 'font-semibold')}>{GRUPO[s]}</td></tr>
                  {FAIXAS.map((k) => {
                    const l = p.linhas[s][k];
                    const g = p.sistema[s].find((x) => k >= x.de && k <= x.ate) ?? null;
                    const primeira = !!g && g.de === k;
                    const alt = g ? g.ate - g.de + 1 : 1;
                    const naoFecha = !!g && g.dif !== null && g.dif !== 0;
                    const fundo = naoFecha ? 'bg-red-50' : '';
                    return (
                      <tr key={k} className="h-[19px]" data-testid={`linha-${s}-${k}`}>
                        <td className={cn(TD_REGUA, 'border-b border-border/40', fundo)}>{NOME[s]}</td>
                        <td className={cn(TD_REGUA, 'border-b border-border/40', fundo)}>{ROTULO_DA_FAIXA[k]}</td>
                        <td className={cn(TD_REGUA_NUM, 'border-b border-border/40', fundo)}>{n0(l.iagro)}</td>
                        <td className={cn(TD_REGUA_NUM, 'border-b border-border/40', fundo)}>{k === 0 ? (
                          <CelulaEditada valor={l.nascimentos} sugerido={l.sugerido.nascimentos} editavel={editavel} testid={`nasc-${s}`}
                            aoMudar={(v) => aoEditar({ sexo: s, campo: 'nascimentos' }, v)} />) : '—'}</td>
                        <td className={cn(TD_REGUA_NUM, 'border-b border-border/40', fundo)}>
                          <CelulaEditada valor={l.mortesConsumo} sugerido={l.sugerido.mortesConsumo} editavel={editavel} testid={`mc-${s}-${k}`}
                            aoMudar={(v) => aoEditar({ sexo: s, campo: 'mortesConsumo', faixa: k }, v)} /></td>
                        <td className={cn(TD_REGUA_NUM, 'border-b border-border/40', fundo)}>{k === 3 ? '—' : (
                          <CelulaEditada valor={l.passa} sugerido={l.sugerido.passa} editavel={editavel} testid={`passa-${s}-${k}`}
                            aoMudar={(v) => aoEditar({ sexo: s, campo: 'passa', faixa: k === 0 ? 0 : k === 1 ? 1 : 2 }, v)} />)}</td>
                        <td className={cn(TD_REGUA_NUM, 'border-b border-border/40', fundo)}>{k === 0 ? '—' : n0(l.entra)}</td>
                        <td className={cn(TD_REGUA_NUM, 'border-b border-border/40 font-semibold', naoFecha ? 'bg-red-100/70' : 'bg-blue-50')}>{n0(l.proposto)}</td>
                        {(!g || primeira) && (
                          <td rowSpan={g ? alt : 1} className={cn(TD_REGUA_NUM, 'border-b border-border/40', fundo, alt > 1 && 'border-l bg-slate-50')}
                            title={alt > 1 ? `o sistema não separa ${faixaDoGrupo(g ?? { de: 1, ate: 3, cab: 0, proposto: null, dif: null })}: a diferença é do bloco` : undefined}
                            data-testid={`sistema-${s}-${k}`}>{g ? n0(g.cab) : '—'}</td>
                        )}
                        {(!g || primeira) && (
                          <td rowSpan={g ? alt : 1} data-testid={`dif-${s}-${k}`}
                            className={cn(TD_REGUA_NUM, 'border-b border-border/40 font-semibold', fundo, alt > 1 && 'bg-slate-50',
                              !g || g.dif === null ? '' : g.dif < 0 ? 'text-red-600' : g.dif > 0 ? 'text-amber-700' : 'text-emerald-700')}>
                            {!g || g.dif === null ? '—' : comSinal(g.dif)}
                            {g && naoFecha && <Info aoClicar={() => aoCausa(s, g)} titulo="não fecha: ver a causa" testid={`causa-${s}-${k}`} />}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="shrink-0 border-t bg-primary text-primary-foreground" data-testid="linha-total">
        <table className="table-fixed border-separate border-spacing-0" style={{ width: LARGURA }}>
          {colgroup}
          <tbody><tr className="h-[23px] font-semibold">
            <td className={TD_REGUA} colSpan={2}>Total bovinos</td>
            <td className={TD_REGUA_NUM}>{n0(total((l) => l.iagro))}</td>
            <td className={TD_REGUA_NUM}>{n0(total((l) => (l.faixa === 0 ? l.nascimentos : 0)))}</td>
            <td className={TD_REGUA_NUM}>{n0(total((l) => l.mortesConsumo))}</td>
            <td className={TD_REGUA_NUM}>{n0(total((l) => (l.faixa < 3 ? l.passa : 0)))}</td>
            <td className={TD_REGUA_NUM}>{n0(total((l) => l.entra))}</td>
            <td className={TD_REGUA_NUM}>{n0(total((l) => l.proposto))}</td>
            <td className={TD_REGUA_NUM}>{n0(totalSistema)}</td>
            <td className={TD_REGUA_NUM}>{totalDif === null ? '—' : comSinal(totalDif)}</td>
          </tr></tbody>
        </table>
      </div>
      <p className="shrink-0 border-t px-2.5 py-1.5 text-[9.5px] leading-snug text-muted-foreground">
        <b>Sugerido</b> = órgão + nascimentos − mortes/consumo + o que entra da faixa anterior − o que passa para a próxima. Vendas, abates e
        transferências com eGTA já estão no órgão. Faixa em laranja: o sistema não sabe, preencha. Valor editado fica amarelo com ↺.
        <b> Diferença</b> = sistema − sugerido: ⓘ abre a causa.
      </p>
    </div>
  );
}

/* ═══ o lado direito ═══ */
function Card({ titulo, selo, children, testid }: { titulo: string; selo?: ReactNode; children: ReactNode; testid: string }) {
  return (
    <div className="shrink-0 rounded-lg border bg-card px-2.5 py-2" data-testid={testid}>
      <div className="mb-1 flex h-[20px] items-center gap-1.5"><span className="flex-1 text-[12px] font-semibold">{titulo}</span>{selo}</div>
      {children}
    </div>
  );
}
function Linha({ rotulo, valor, recuo }: { rotulo: string; valor: string; recuo?: boolean }) {
  return (
    <div className={cn('flex h-[20px] items-center border-b border-border/40 text-[10.5px]', recuo && 'pl-3 text-muted-foreground')}>
      <span className="min-w-0 flex-1 truncate" title={rotulo}>{rotulo}</span><span className="w-[60px] shrink-0 text-right font-semibold tabular-nums text-foreground">{valor}</span>
    </div>
  );
}

function Sugestao({ f, ocupado, aoDeclarar, aoDesfazer }: { f: DaFazenda; ocupado: boolean; aoDeclarar: (arq: File | null) => void; aoDesfazer: (motivo: string) => void }) {
  const [marcar, setMarcar] = useState<{ arquivo: File | null } | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const p = f.proposta;
  const declarada = f.declaracao?.status === 'declarada';
  const nasc = (s: Sexo) => p?.linhas[s][0].nascimentos ?? null;
  const mcs = p ? (['F', 'M'] as const).flatMap((s) => p.linhas[s].filter((l) => l.mortesConsumo > 0).map((l) => ({ s, l }))) : [];
  const aPreencher = p ? (['F', 'M'] as const).reduce((a, s) => a + p.linhas[s].filter((l) => l.faixa < 3 && l.passa === null).length, 0) : null;
  const troca = p ? (['F', 'M'] as const).reduce<number | null>((a, s) => p.linhas[s].reduce<number | null>((b, l) => (b === null || (l.faixa < 3 && l.passa === null) ? null : b + (l.faixa < 3 ? l.passa ?? 0 : 0)), a), 0) : null;
  const total = (xs: (number | null)[]) => (xs.some((x) => x === null) ? null : xs.reduce<number>((a, x) => a + (x ?? 0), 0));
  const por = !f.comprovante ? 'leia o comprovante do órgão' : p?.recusas.length ? 'há faixa negativa: corrija' : null;
  return (
    <Card titulo={declarada ? 'O que foi declarado' : 'Sugestão para declarar'} testid="sugestao">
      <Linha rotulo="Nascimentos" valor={n0(p ? total([nasc('F'), nasc('M')]) : null)} />
      <Linha rotulo="fêmeas" valor={n0(nasc('F'))} recuo /><Linha rotulo="machos" valor={n0(nasc('M'))} recuo />
      <Linha rotulo="Mortes e consumo" valor={n0(p ? mcs.reduce((a, x) => a + x.l.mortesConsumo, 0) : null)} />
      {/* 3 lugares fixos (nada se desloca: o que vem abaixo fica no lugar com 0, 1, 2 ou 3 faixas com mortes) */}
      {[0, 1, 2].map((i) => {
        const x = mcs[i];
        return x ? <Linha key={`${x.s}${x.l.faixa}`} recuo rotulo={`${NOME[x.s].toLowerCase()} ${ROTULO_DA_FAIXA[x.l.faixa]}`} valor={n0(x.l.mortesConsumo)} />
          : <div key={`vazio${i}`} className="h-[20px]" aria-hidden />;
      })}
      {declarada ? <Linha rotulo="Troca de faixa" valor={n0(troca)} /> : <Linha rotulo="Troca de faixa a preencher" valor={n0(aPreencher)} />}
      {!f.soLeitura && (
        <div className="mt-1.5 flex h-[22px] items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">Depois do relatório:</span>
          <Button variant="outline" size="sm" className="h-[22px] shrink-0 px-2 text-[10px]" disabled={ocupado || !!por}
            title={por ?? 'congela os números desta etapa e guarda o comprovante da declaração; desfazer pede motivo'}
            onClick={() => setMarcar({ arquivo: null })} data-testid="marcar-declarado">Marcar como declarado</Button>
        </div>
      )}
      {declarada && (motivo === null ? (
        <div className="mt-1.5 flex h-[22px] items-center justify-end">
          <Button variant="outline" size="sm" className="h-[22px] px-2 text-[10px]" disabled={ocupado} onClick={() => setMotivo('')}
            title="volta a rascunho; pede o motivo (fica na trilha)" data-testid="desfazer-declarado">Desfazer o declarado</Button>
        </div>
      ) : (
        <ConfirmarComMotivo titulo="Desfazer o declarado" motivo={motivo} onMotivoChange={setMotivo} onVoltar={() => setMotivo(null)} confirmando={ocupado}
          onConfirmar={() => { aoDesfazer(motivo); setMotivo(null); }} className="mt-1.5" />
      ))}
      <Dialog open={!!marcar} onOpenChange={(o) => { if (!o) setMarcar(null); }}>
        <DialogContent className="w-[460px] max-w-[95vw] gap-0 p-0 text-[11px] [&>button.absolute]:hidden" data-testid="modal-marcar" aria-describedby={undefined}>
          <div className="flex h-[40px] items-center bg-primary px-3.5 text-primary-foreground">
            <DialogTitle className="text-[12.5px] font-semibold">Marcar {f.fazenda.nome} como declarada</DialogTitle>
          </div>
          <div className="flex flex-col gap-2 px-3.5 py-3">
            <p className="text-[10.5px] leading-snug">Os números desta etapa ficam congelados como estão na tela. O sistema não declara nada ao órgão: marque depois de declarar no e-Saniagro.</p>
            <AreaDeArquivo regra={REGRA_DO_PDF} className="h-8" testId="soltar-comprovante" convite="Comprovante da declaração (opcional)"
              detalhe={marcar?.arquivo ? marcar.arquivo.name : 'PDF'} onArquivos={(arqs) => setMarcar({ arquivo: arqs[0] ?? null })} />
          </div>
          <div className="flex h-[46px] items-center justify-end gap-2 border-t px-3.5">
            <Button variant="outline" size="sm" onClick={() => setMarcar(null)}>Voltar</Button>
            <Button size="sm" disabled={ocupado} onClick={() => { aoDeclarar(marcar?.arquivo ?? null); setMarcar(null); }} data-testid="confirmar-declarado">Marcar como declarado</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Diferencas({ f, aoCausa }: { f: DaFazenda; aoCausa: (s: Sexo, g: GrupoDoSistema) => void }) {
  const ds = difs(f);
  return (
    <Card titulo="Diferenças" testid="diferencas"
      selo={ds.length && !f.soLeitura ? <span className="shrink-0 rounded-full bg-red-100 px-1.5 text-[9.5px] font-semibold text-red-700">conferir antes</span> : undefined}>
      {/* altura fixa de 4 linhas de 24 px (rola se houver mais): o card de baixo nunca se desloca; as linhas mudam de propósito com o comprovante */}
      <div className="h-[96px] overflow-y-auto" data-desloca-livre data-testid="diferencas-linhas">
      {!f.proposta ? <p className="text-[10px] text-muted-foreground">{f.status === 'sem_rebanho' ? 'Nada a conferir nesta etapa.' : '—'}</p>
        : ds.length === 0 ? <p className="text-[10px] text-emerald-700">Órgão e sistema batem em todas as faixas.</p>
        : ds.map(({ s, g }) => {
          const causas = causasDe(f, s);
          const faixa = `${NOME[s]} ${g.de === g.ate ? ROTULO_DA_FAIXA[g.de] : g.ate === 3 ? `${['0', '13', '25', '37'][g.de]} meses ou mais` : faixaDoGrupo(g)}`;
          const causa = causas.length ? CLASSE[causas[0].classe] : 'sem causa';
          return (
            <div key={`${s}${g.de}`} className="flex h-[24px] items-center gap-1 text-[10px]" data-testid={`diferenca-${s}-${g.de}`}>
              <span className="flex min-w-0 flex-1 flex-col leading-[11px]" title={`${faixa} · ${causa}`}>
                <span className="whitespace-nowrap">{faixa}</span><span className="whitespace-nowrap text-[9.5px] text-muted-foreground">{causa}</span>
              </span>
              <span className={cn('w-[36px] shrink-0 text-right font-semibold tabular-nums', causas.length === 0 && 'text-red-600')}>{comSinal(g.dif ?? 0)}</span>
              <Info aoClicar={() => aoCausa(s, g)} titulo="ver a causa" testid={`ver-causa-${s}-${g.de}`} />
            </div>
          );
        })}
      </div>
      {f.proposta && <p className="mt-1 text-[9.5px] leading-snug text-muted-foreground">Nada é declarado pelo sistema: o relatório leva a sugestão, o que você editou e cada diferença com a causa.</p>}
    </Card>
  );
}

function ModalDaCausa({ f, aberto, aoFechar, aoEditar }: { f: DaFazenda; aberto: { s: Sexo; g: GrupoDoSistema } | null; aoFechar: () => void; aoEditar: (s: Sexo) => void }) {
  const [verMov, setVerMov] = useState(false);
  const causas = aberto ? causasDe(f, aberto.s) : [];
  const movs = f.casamento?.movimentoSemEgta ?? [];
  return (
    <Dialog open={!!aberto} onOpenChange={(o) => { if (!o) { setVerMov(false); aoFechar(); } }}>
      <DialogContent className="w-[560px] max-w-[95vw] gap-0 p-0 text-[11px] [&>button.absolute]:hidden" data-testid="modal-causa" aria-describedby={undefined}>
        {aberto && (
          <>
            <div className="flex h-[40px] items-center gap-2 bg-primary px-3.5 text-primary-foreground">
              <DialogTitle className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{NOME[aberto.s]} de {faixaDoGrupo(aberto.g)} · não fecha</DialogTitle>
              <button type="button" className="shrink-0" onClick={() => { setVerMov(false); aoFechar(); }} title="Fechar">✕</button>
            </div>
            <div className="flex flex-col gap-2.5 px-3.5 py-3">
              <div className="grid grid-cols-3 gap-2">
                {[['Sugerido para o órgão', n0(aberto.g.proposto)], [`Sistema em ${dataBR(f.dataDosNumeros).slice(0, 5)}`, n0(aberto.g.cab)],
                  ['Diferença', comSinal(aberto.g.dif ?? 0)]].map(([r, v], i) => (
                  <div key={r} className="flex h-[46px] flex-col justify-center rounded-md border px-2.5">
                    <small className="whitespace-nowrap text-[9.5px] text-muted-foreground">{r}</small>
                    <b className={cn('text-[13px] tabular-nums', i === 2 && 'text-red-600')}>{v}</b>
                  </div>
                ))}
              </div>
              {causas.length === 0 ? <p className="text-[10.5px]">O sistema não tem causa registrada para esta diferença. Ela vai ao relatório como "sem causa no sistema".</p>
                : causas.map((c, i) => (
                  <div key={i} className="grid grid-cols-[36px_150px_minmax(0,1fr)] items-start gap-2 border-b border-border/40 pb-1.5 text-[10.5px]">
                    <span className="text-right font-bold tabular-nums text-red-600">{comSinal(c.cab)}</span>
                    <span className="truncate rounded bg-muted px-1.5 text-[9.5px] font-semibold" title={CLASSE[c.classe]}>{CLASSE[c.classe]}</span>
                    <p className="leading-snug">{c.texto}</p>
                  </div>
                ))}
              {verMov && (
                <ul className="flex flex-col gap-0.5 text-[10px]" data-testid="movimentos-da-causa">
                  {movs.length === 0 ? <li className="text-muted-foreground">Nenhuma saída ou entrada sem eGTA nesta fazenda.</li>
                    : movs.map((m) => <li key={m.id}>{m.sentido === 'saida' ? 'Saída' : 'Entrada'} de {m.cab} cab em {dataBR(m.data)}{m.numeroDocumento ? ` · nº ${m.numeroDocumento}` : ' · sem nº de GTA'}</li>)}
                </ul>
              )}
              <p className="text-[9.5px] leading-snug text-muted-foreground">O sistema não decide e não sugere morte. Morte só entra se você editar Mortes/consumo; o que ficar vai ao relatório com a causa.</p>
            </div>
            <div className="flex h-[46px] items-center justify-end gap-2 border-t px-3.5">
              <Button variant="outline" size="sm" onClick={() => setVerMov((v) => !v)} data-testid="ver-movimentos">{verMov ? 'Esconder os movimentos' : 'Ver os movimentos'}</Button>
              {!f.soLeitura && <Button variant="outline" size="sm" onClick={() => aoEditar(aberto.s)} data-testid="editar-mortes">Editar mortes/consumo</Button>}
              <Button size="sm" onClick={() => { setVerMov(false); aoFechar(); }}>Fechar</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CardBrucelose({ f }: { f: DaFazenda }) {
  const b = f.brucelose;
  return (
    <Card titulo="Brucelose" testid="brucelose"
      selo={b && b.aVacinar !== null ? <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[9.5px] font-semibold text-amber-900">{b.aVacinar} a vacinar</span> : undefined}>
      <Linha rotulo="Última vacinação (órgão)" valor={dataBR(b?.ultimaVacina ?? f.comprovante?.vacinaBrucelose)} />
      <Linha rotulo="Vacinar até" valor={dataBR(b?.vacinarAte)} />
    </Card>
  );
}
