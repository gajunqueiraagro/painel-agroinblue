/**
 * MAPA-CRIAR-PIQUETES-01 fatia 2b (Gabriel 02/11/2026, D8) — o CAMINHO DE VOLTA dos piquetes, três diálogos de prévia com o mini-mapa
 * (`PreviaComMapa`): "Mover linha" (`fn_piquetes_mover_linha`), "Juntar com…" (`fn_piquetes_juntar`, A absorve B) e "Desfazer piquetes"
 * (`fn_piquetes_desfazer`). A PRÉVIA é a própria função com `p_simular = true` (o que ela mostra é o que grava); o Gravar chama a mesma com false.
 * Recusa do banco = a frase pronta DENTRO do diálogo (lugar reservado; nunca toast), o diálogo não fecha. Os números são os do banco.
 * Layout fixo (nada se desloca): ~60% do diálogo é o mapa, a tabela ao lado, altura fixa, sem rolagem.
 * PIQUETE-VIGENCIA-01 (Gabriel 05/11): o 4º, "Mudar mês de início" (`fn_piquetes_mudar_inicio`, antecipar OU adiar) com o caminho de volta DELE no
 * mesmo diálogo ("Desfazer a última mudança", `fn_piquetes_mudar_inicio_desfazer`); mês fechado = a recusa do banco + o link do Reabrir (D3).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA } from '@/components/ui/regua-tabela';
import { PreviaComMapa } from '@/components/mapa-geo/PreviaComMapa';
import { ReabrirP1Dialog } from '@/components/ReabrirP1Dialog';
import { ReabrirMesNaOC } from '@/components/operacao-comercial/ReabrirMesNaOC';
import {
  desfazerMudancaDeInicio, desfazerPiquetes, gravarDesfazerInicio, gravarMudancaDeInicio, juntarDivisoes, lerIniciosDoGrupo, moverLinha, mudarInicio,
  versoesDosPoligonos, type RespostaDaVolta,
} from '@/hooks/usePiquetesVolta';
import type { Consulta } from '@/lib/financeiro/nfeConsultas';
import { dataBr, haBr, mesesDeInicio } from '@/lib/mapa/piquetesEmEspera';
import {
  inicioDoGrupo, itensDoMapaDoInicio, mesBr, mesesParaMudarInicio, nomesDosPiquetes,
  type InicioDoPiquete, type ItemDaPreviaComMapa, type PreviaDesfazer, type PreviaDesfazerInicio, type PreviaJuntar, type PreviaMoverLinha, type PreviaMudarInicio,
} from '@/lib/mapa/piquetesVolta';
import { cn } from '@/lib/utils';

/** A prévia não grava nada, mas as três funções exigem um motivo: ela roda com este até a pessoa digitar o dela (o Gravar exige o dela). */
const MOTIVO_DA_PREVIA = 'prévia';

// --- o que os três diálogos têm em comum ----------------------------------------------------------------------------------------------
/* `pronto` false = a prévia ainda não pode ser pedida (o "Mudar mês de início" lê antes o início dos piquetes no banco) */
function usePreviaEGravar<T>(buscar: (motivo: string, simular: boolean) => Promise<RespostaDaVolta<T>>, chaveDaPrevia: string, pronto = true) {
  const buscarRef = useRef(buscar);
  buscarRef.current = buscar;
  const [motivo, setMotivo] = useState('');
  const [previa, setPrevia] = useState<T | null>(null);
  const [recusa, setRecusa] = useState<string | null>(null);
  /** o mês FECHADO que barrou a recusa (o HINT do banco): acende o link do Reabrir (D3) */
  const [mesFechado, setMesFechado] = useState<string | null>(null);
  const [lendo, setLendo] = useState(true);
  const [gravando, setGravando] = useState(false);
  useEffect(() => {
    let vivo = true;
    setLendo(true); setRecusa(null); setMesFechado(null); setPrevia(null);
    if (!pronto) return () => { vivo = false; };
    void buscarRef.current(MOTIVO_DA_PREVIA, true).then((r) => {
      if (!vivo) return;
      setLendo(false);
      if ('motivo' in r) { setRecusa(r.motivo); setMesFechado(r.mesFechado ?? null); } else setPrevia(r.valor);
    });
    return () => { vivo = false; };
  }, [chaveDaPrevia, pronto]);
  const gravar = async (aoGravar: (v: T) => void) => {
    if (!previa || !motivo.trim() || gravando) return;
    setGravando(true); setRecusa(null); setMesFechado(null);
    const r = await buscarRef.current(motivo.trim(), false);
    setGravando(false);
    if ('motivo' in r) { setRecusa(r.motivo); setMesFechado(r.mesFechado ?? null); } else aoGravar(r.valor);
  };
  const motivoDoBloqueio = lendo ? 'Lendo a prévia…' : !previa ? 'Sem prévia: leia a frase em vermelho.' : !motivo.trim() ? 'Diga o motivo para gravar.' : null;
  return { motivo, setMotivo, previa, recusa, mesFechado, lendo, gravando, gravar, motivoDoBloqueio };
}

function QuadroDaVolta({ testid, titulo, descricao, mapa, controles, tabela, frase, recusa, abaixoDaRecusa, larguraGravar, corpoAoMeio, gravando, motivoDoBloqueio, rotuloGravar, aoGravar, aoFechar }: {
  testid: string; titulo: string; descricao: string;
  mapa: ReactNode; controles: ReactNode; tabela: ReactNode; frase: string | null; recusa: string | null;
  /** uma linha de 18px RESERVADA logo abaixo da recusa (só quem passa a prop; o link do Reabrir do "Mudar mês de início") */
  abaixoDaRecusa?: ReactNode;
  /** largura FIXA do Gravar quando o rótulo muda com o modo (o Cancelar ao lado não anda) */
  larguraGravar?: number;
  /** o mapa e a coluna da direita meio a meio (o "Mudar mês de início": a tabela de 5 colunas não cabia em 40% a 918) */
  corpoAoMeio?: boolean;
  gravando: boolean; motivoDoBloqueio: string | null; rotuloGravar: string; aoGravar: () => void; aoFechar: () => void;
}) {
  return (
    <Dialog open onOpenChange={(v) => { if (!v && !gravando) aoFechar(); }}>
      <DialogContent className="flex h-[min(500px,95vh)] w-[min(1040px,95vw)] max-w-none flex-col gap-0 overflow-hidden p-0" data-testid={testid}>
        <div className="flex-none px-4 pb-1.5 pt-3">
          <DialogTitle className="text-[13px]">{titulo}</DialogTitle>
          <DialogDescription className="min-h-[26px] text-[10px] leading-[13px]">{descricao}</DialogDescription>
        </div>
        <div className={cn('grid min-h-0 flex-1 gap-3 px-4 pb-2', corpoAoMeio ? 'grid-cols-[50%_minmax(0,1fr)]' : 'grid-cols-[60%_minmax(0,1fr)]')}>
          <div className="min-h-0">{mapa}</div>
          <div className="flex min-h-0 min-w-0 flex-col gap-2">
            {controles}
            <div className="min-h-0 flex-1">{tabela}</div>
            <p className="h-[42px] flex-none overflow-hidden text-[10px] leading-[14px] text-muted-foreground" data-testid="volta-frase">{frase ?? ''}</p>
            {/* a recusa do banco tem lugar reservado: aparecer não desloca nada */}
            <p className="h-[42px] flex-none overflow-hidden text-[11px] font-medium leading-[14px] text-destructive" role={recusa ? 'alert' : undefined} data-testid="volta-recusa">
              {recusa ?? ''}
            </p>
            {abaixoDaRecusa !== undefined && (
              <div className="flex h-[18px] flex-none items-center gap-1 text-[10px] text-destructive" data-testid="volta-abaixo-da-recusa">{abaixoDaRecusa}</div>
            )}
          </div>
        </div>
        <div className="flex flex-none items-center gap-2 border-t border-border px-4 py-2">
          <span className="min-w-0 flex-1 text-[10px] text-muted-foreground" data-testid="volta-bloqueio">{motivoDoBloqueio ?? ''}</span>
          <Button variant="outline" size="sm" onClick={aoFechar} disabled={gravando} data-testid="volta-cancelar">Cancelar</Button>
          <Button size="sm" disabled={!!motivoDoBloqueio || gravando} title={motivoDoBloqueio ?? undefined} onClick={aoGravar} data-testid="volta-gravar"
            style={larguraGravar ? { width: larguraGravar } : undefined}>
            {gravando ? 'Gravando…' : rotuloGravar}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CampoMesEMotivo({ meses, mes, setMes, motivo, setMotivo, comMes, gravando, mesNoLugar }: {
  meses: { valor: string; rotulo: string }[]; mes: string; setMes: (v: string) => void; motivo: string; setMotivo: (v: string) => void; comMes: boolean; gravando: boolean;
  /** PIQUETE-VIGENCIA-01: sem o mês, a linha dele fica no lugar (22px) com esta frase: trocar de modo não desloca o motivo nem a tabela */
  mesNoLugar?: ReactNode;
}) {
  return (
    <div className="grid flex-none gap-1.5">
      {comMes && (
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-muted-foreground">Vale a partir de</span>
          <Segmentado valor={mes} onEscolher={setMes} altura={22} opcoes={meses.map(m => ({ valor: m.valor, rotulo: m.rotulo }))} />
        </div>
      )}
      {!comMes && mesNoLugar !== undefined && (
        <div className="flex h-[22px] items-center text-[10px] text-muted-foreground" data-testid="volta-mes-no-lugar">{mesNoLugar}</div>
      )}
      <Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (obrigatório)" disabled={gravando}
        className="h-7 text-[11px]" data-testid="volta-motivo" />
    </div>
  );
}

/* `primeira` = largura fixa da 1ª coluna (sem ela, a 1ª é a flexível); `null` em `colunas` = coluna flexível */
function TabelaDaVolta({ colunas, cabecalho, primeira, children }: { colunas: (number | null)[]; cabecalho: [string, boolean][]; primeira?: number; children: ReactNode }) {
  return (
    <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
      <colgroup><col style={primeira ? { width: primeira } : undefined} />{colunas.map((w, i) => <col key={i} style={w == null ? undefined : { width: w }} />)}</colgroup>
      <thead className="bg-primary">
        <tr>{cabecalho.map(([t, num], i) => <th key={t} className={cn(TH_REGUA, num ? 'text-right' : 'text-left')} data-col={i}>{t}</th>)}</tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

const sinal = (v: number) => `${v > 0 ? '+' : ''}${haBr(v)}`;
const haOuTraco = (v: number | null) => (v == null ? '—' : haBr(v));

// --- Mover linha ---------------------------------------------------------------------------------------------------------------------
export interface DivisaoDaLinha { pastoId: string; geoId: string; nome: string; antes: GeoJSON.Geometry; depois: GeoJSON.Geometry }

export function MoverLinhaDialog({ fazendaId, a, b, hoje, aoFechar, aoGravar }: {
  fazendaId: string; a: DivisaoDaLinha; b: DivisaoDaLinha; hoje?: Date; aoFechar: () => void; aoGravar: () => void;
}) {
  const meses = useMemo(() => mesesDeInicio(hoje ?? new Date()), [hoje]);
  const [mes, setMes] = useState(meses[meses.length - 1].valor);
  const [acesa, setAcesa] = useState<string | null>(null);
  const v = usePreviaEGravar<PreviaMoverLinha>(async (motivo, simular) => {
    const versoes = await versoesDosPoligonos([a.geoId, b.geoId]);
    if ('motivo' in versoes) return versoes;
    return moverLinha({
      fazendaId, mes, motivo, simular,
      alterar: [{ id: a.geoId, versao: versoes.valor.get(a.geoId) ?? 0, geojson: a.depois }, { id: b.geoId, versao: versoes.valor.get(b.geoId) ?? 0, geojson: b.depois }],
    });
  }, mes);
  const itens = useMemo<ItemDaPreviaComMapa[]>(() => [
    { chave: a.pastoId, nome: a.nome, antes: a.antes, depois: a.depois },
    { chave: b.pastoId, nome: b.nome, antes: b.antes, depois: b.depois, vizinho: true },
  ], [a, b]);
  const p = v.previa;
  return (
    <QuadroDaVolta testid="mover-linha-dialogo" titulo={`Mover a linha entre ${a.nome} e ${b.nome}`}
      descricao="A divisa muda nas duas divisões, num gesto só, e a área oficial das duas passa a valer a do mapa a partir do mês escolhido. Nada foi gravado ainda."
      mapa={<PreviaComMapa itens={itens} acesa={acesa} aoPassar={setAcesa} />}
      controles={<CampoMesEMotivo meses={meses} mes={mes} setMes={setMes} motivo={v.motivo} setMotivo={v.setMotivo} comMes gravando={v.gravando} />}
      tabela={p && (
        <TabelaDaVolta colunas={[72, 72, 72]} cabecalho={[['Divisão', false], ['Antes (ha)', true], ['Mapa (ha)', true], ['Dif. (ha)', true]]}>
          {p.itens.map((i) => (
            <tr key={i.pastoId ?? i.nome} onMouseEnter={() => setAcesa(i.pastoId)} onMouseLeave={() => setAcesa(null)}
              className={cn(i.pastoId && i.pastoId === acesa && 'bg-primary/10')} data-divisao={i.nome} title={i.motivo ?? undefined}>
              <td className={TD_REGUA_TEXTO} title={i.nome}>{i.nome}</td>
              <td className={TD_REGUA_NUM}>{haOuTraco(i.areaAntesHa)}</td>
              <td className={TD_REGUA_NUM}>{haOuTraco(i.areaMapaHa)}</td>
              <td className={TD_REGUA_NUM} title={i.difPct == null ? undefined : `${i.difPct.toLocaleString('pt-BR')}%`}>{i.difHa == null ? '—' : sinal(i.difHa)}</td>
            </tr>
          ))}
          <tr className="font-semibold" data-linha="soma">
            <td className={TD_REGUA_TEXTO}>Soma das duas</td>
            <td className={TD_REGUA_NUM}>{haBr(p.somaAntesHa)}</td>
            <td className={TD_REGUA_NUM}>{haBr(p.somaDepoisHa)}</td>
            <td className={TD_REGUA_NUM}>{p.difSomaHa == null ? '—' : sinal(p.difSomaHa)}</td>
          </tr>
        </TabelaDaVolta>
      )}
      frase={p?.frase ?? null} recusa={v.recusa} gravando={v.gravando} motivoDoBloqueio={v.motivoDoBloqueio} rotuloGravar="Gravar a linha"
      aoGravar={() => void v.gravar(() => { toast.success('Linha movida.'); aoGravar(); aoFechar(); })} aoFechar={aoFechar} />
  );
}

// --- Juntar --------------------------------------------------------------------------------------------------------------------------
export interface DivisaoParaJuntar { pastoId: string; geoId: string; nome: string; geojson: GeoJSON.Geometry }

export function JuntarDialog({ fica, sai, uniao, hoje, aoFechar, aoGravar }: {
  fica: DivisaoParaJuntar; sai: DivisaoParaJuntar; uniao: GeoJSON.Polygon; hoje?: Date; aoFechar: () => void; aoGravar: () => void;
}) {
  const meses = useMemo(() => mesesDeInicio(hoje ?? new Date()), [hoje]);
  const [mes, setMes] = useState(meses[meses.length - 1].valor);
  const [acesa, setAcesa] = useState<string | null>(null);
  const v = usePreviaEGravar<PreviaJuntar>(async (motivo, simular) => {
    const versoes = await versoesDosPoligonos([fica.geoId, sai.geoId]);
    if ('motivo' in versoes) return versoes;
    return juntarDivisoes({
      ficaPastoId: fica.pastoId, saiPastoId: sai.pastoId, mes, uniao, motivo, simular,
      versaoFica: versoes.valor.get(fica.geoId) ?? 0, versaoSai: versoes.valor.get(sai.geoId) ?? 0,
    });
  }, mes);
  const itens = useMemo<ItemDaPreviaComMapa[]>(() => [
    { chave: fica.pastoId, nome: fica.nome, antes: fica.geojson, depois: uniao },
    { chave: sai.pastoId, nome: sai.nome, antes: sai.geojson, depois: null },
  ], [fica, sai, uniao]);
  const p = v.previa;
  return (
    <QuadroDaVolta testid="juntar-dialogo" titulo={`Juntar ${sai.nome} em ${fica.nome}`}
      descricao={`${fica.nome} absorve ${sai.nome}: o desenho vira a união das duas e ${sai.nome} encerra no mês anterior (o histórico fica). Nada foi gravado ainda.`}
      mapa={<PreviaComMapa itens={itens} acesa={acesa} aoPassar={setAcesa} />}
      controles={<CampoMesEMotivo meses={meses} mes={mes} setMes={setMes} motivo={v.motivo} setMotivo={v.setMotivo} comMes gravando={v.gravando} />}
      tabela={p && (
        <TabelaDaVolta colunas={[84, 84]} cabecalho={[['Divisão', false], ['Antes (ha)', true], ['Depois (ha)', true]]}>
          <tr onMouseEnter={() => setAcesa(fica.pastoId)} onMouseLeave={() => setAcesa(null)} className={cn(acesa === fica.pastoId && 'bg-primary/10')} data-divisao={p.fica.nome}>
            <td className={TD_REGUA_TEXTO} title={`${p.fica.nome} (fica)`}>{p.fica.nome} (fica)</td>
            <td className={TD_REGUA_NUM}>{haOuTraco(p.fica.areaAntesHa)}</td>
            <td className={TD_REGUA_NUM}>{haOuTraco(p.fica.areaDepoisHa)}</td>
          </tr>
          <tr onMouseEnter={() => setAcesa(sai.pastoId)} onMouseLeave={() => setAcesa(null)} className={cn(acesa === sai.pastoId && 'bg-primary/10')} data-divisao={p.sai.nome}
            title={p.sai.encerraEm ? `Encerra em ${dataBr(p.sai.encerraEm)}` : undefined}>
            <td className={TD_REGUA_TEXTO} title={`${p.sai.nome} (sai)`}>{p.sai.nome} (sai)</td>
            <td className={TD_REGUA_NUM}>{haOuTraco(p.sai.areaAntesHa)}</td>
            <td className={TD_REGUA_NUM}>{p.sai.encerraEm ? `até ${dataBr(p.sai.encerraEm)}` : '—'}</td>
          </tr>
        </TabelaDaVolta>
      )}
      frase={p?.frase ?? null} recusa={v.recusa} gravando={v.gravando} motivoDoBloqueio={v.motivoDoBloqueio} rotuloGravar="Juntar"
      aoGravar={() => void v.gravar(() => { toast.success('Divisões juntadas.'); aoGravar(); aoFechar(); })} aoFechar={aoFechar} />
  );
}

// --- Desfazer piquetes ---------------------------------------------------------------------------------------------------------------
const LINHAS_DA_LISTA = 10;

export function DesfazerPiquetesDialog({ grupoId, nomeDoPai, geoDoPai, desenhos, aoFechar, aoGravar }: {
  grupoId: string; nomeDoPai: string; geoDoPai: GeoJSON.Geometry | null; desenhos: ReadonlyMap<string, GeoJSON.Geometry>;
  aoFechar: () => void; aoGravar: () => void;
}) {
  const [acesa, setAcesa] = useState<string | null>(null);
  const v = usePreviaEGravar<PreviaDesfazer>((motivo, simular) => desfazerPiquetes({ grupoId, motivo, simular }), grupoId);
  const p = v.previa;
  const itens = useMemo<ItemDaPreviaComMapa[]>(() => {
    if (!p) return [];
    const saida: ItemDaPreviaComMapa[] = [];
    if (geoDoPai) saida.push({ chave: p.pai.id, nome: p.pai.nome, antes: geoDoPai, depois: geoDoPai });
    for (const x of p.poligonos) {
      const g = desenhos.get(x.id) ?? null;
      saida.push({ chave: x.id, nome: x.nome, antes: g, depois: x.destino === 'soltar' ? g : null });
    }
    for (const x of p.areas) saida.push({ chave: x.id, nome: x.nome, antes: desenhos.get(x.id) ?? null, depois: null });
    return saida;
  }, [p, geoDoPai, desenhos]);
  const linhas = useMemo(() => (p ? [
    ...p.poligonos.map(x => ({ chave: x.id, nome: x.nome, destino: x.destino === 'apagar' ? 'sai do mapa' : 'fica sem classificação' })),
    ...p.areas.map(x => ({ chave: x.id, nome: x.nome, destino: x.tipo ? `sai do mapa (${x.tipo})` : 'sai do mapa' })),
  ] : []), [p]);
  const vistas = linhas.slice(0, LINHAS_DA_LISTA);
  const restam = linhas.length - vistas.length;
  const inativas = p ? p.divisoes.filter(d => d.ficaInativo).map(d => d.nome).join(', ') : '';
  return (
    <QuadroDaVolta testid="desfazer-dialogo" titulo={`Desfazer os piquetes de ${nomeDoPai}`}
      descricao={`${nomeDoPai} volta a ser um pasto só: só vale enquanto nenhuma divisão tem nada lançado. O cadastro não se apaga. Nada foi gravado ainda.`}
      mapa={<PreviaComMapa itens={itens} acesa={acesa} aoPassar={setAcesa} />}
      controles={<CampoMesEMotivo meses={[]} mes="" setMes={() => {}} motivo={v.motivo} setMotivo={v.setMotivo} comMes={false} gravando={v.gravando} />}
      tabela={p && (
        <div className="grid gap-1.5">
          <TabelaDaVolta colunas={[128]} cabecalho={[['Desenho', false], ['O que acontece', false]]}>
            {vistas.map((l) => (
              <tr key={l.chave} onMouseEnter={() => setAcesa(l.chave)} onMouseLeave={() => setAcesa(null)} className={cn(acesa === l.chave && 'bg-primary/10')} data-desenho={l.nome}>
                <td className={TD_REGUA_TEXTO} title={l.nome}>{l.nome}</td>
                <td className={TD_REGUA_TEXTO} title={l.destino}>{l.destino}</td>
              </tr>
            ))}
            {restam > 0 && (
              <tr><td colSpan={2} className={TD_REGUA_TEXTO} title={linhas.slice(LINHAS_DA_LISTA).map(l => l.nome).join(', ')}>… e mais {restam}</td></tr>
            )}
          </TabelaDaVolta>
          <p className="h-[28px] overflow-hidden text-[10px] leading-[14px] text-foreground" data-testid="desfazer-inativas" title={inativas || undefined}>
            {inativas ? `Divisões que ficam inativas: ${inativas}.` : 'Nenhuma divisão fica inativa: só os desenhos voltam a ficar sem classificação.'}
          </p>
        </div>
      )}
      frase={p?.frase ?? null} recusa={v.recusa} gravando={v.gravando} motivoDoBloqueio={v.motivoDoBloqueio} rotuloGravar="Desfazer piquetes"
      aoGravar={() => void v.gravar(() => { toast.success('Piquetes desfeitos.'); aoGravar(); aoFechar(); })} aoFechar={aoFechar} />
  );
}

// --- Mudar mês de início (PIQUETE-VIGENCIA-01) ---------------------------------------------------------------------------------------
export interface PiqueteDoGrupo { pastoId: string; nome: string; geojson: GeoJSON.Geometry | null }
type ModoDoInicio = 'mudar' | 'desfazer';
/* a GRAVAÇÃO tem a resposta dela (`gravou`); a prévia é a dos dois modos */
type PreviaDoInicio = { tipo: 'mudar'; p: PreviaMudarInicio } | { tipo: 'desfazer'; p: PreviaDesfazerInicio } | { tipo: 'gravou'; trilhaId: string };
const LINHAS_DE_MES = 6;

/**
 * O 4º gesto de volta, no pai de um grupo nascido do "Concluir piquetes": os piquetes passam a começar noutro mês dos últimos 4 (D1, a partir de
 * hoje) — antes do início de hoje antecipa, depois adia (FECH-PASTO-UNIDADE-01: o pai segue sendo o pasto e o card; adiar recusa se um piquete tem linha marcada
 * nesses meses: D2). "Desfazer a última mudança" é o caminho de volta do próprio gesto. Mês fechado: a recusa do banco e o link do Reabrir ao lado
 * (D3: nunca reabre sozinho; o Reabrir é o diálogo de sempre, com a cadeia dele). A prévia é a própria função com `p_simular`.
 * Bug do P9/P17 (Gabriel 06/11 17:11/17:13): o início dos piquetes vem do BANCO (`lerIniciosDoGrupo`, a tabela que a função lê), nunca da lista
 * da tela; a gravação tem o leitor dela (`lerGravouInicio`).
 */
export function MudarInicioDialog({ grupoId, fazendaId, nomeDoPai, paiPastoId, geoDoPai, piquetes, hoje, aoFechar, aoGravar }: {
  grupoId: string; fazendaId: string; nomeDoPai: string; paiPastoId: string; geoDoPai: GeoJSON.Geometry | null;
  piquetes: readonly PiqueteDoGrupo[]; hoje?: Date; aoFechar: () => void; aoGravar: () => void;
}) {
  const [releitura, setReleitura] = useState(0);
  const [inicios, setInicios] = useState<Consulta<InicioDoPiquete[]> | null>(null);
  useEffect(() => {
    let vivo = true;
    setInicios(null);
    void lerIniciosDoGrupo(grupoId).then((r) => { if (vivo) setInicios(r); });
    return () => { vivo = false; };
  }, [grupoId, releitura]);
  const doBanco = inicios && 'valor' in inicios ? inicioDoGrupo(inicios.valor) : null;
  const inicioAtual = doBanco?.mes ?? null;
  const meses = useMemo(() => (doBanco ? mesesParaMudarInicio(mesesDeInicio(hoje ?? new Date()), inicioAtual) : []), [doBanco !== null, hoje, inicioAtual]);
  const [modo, setModo] = useState<ModoDoInicio>('mudar');
  const [mes, setMes] = useState('');
  useEffect(() => {
    if (meses.length && !meses.some(m => m.valor === mes)) setMes(meses[meses.length - 1].valor);
  }, [meses, mes]);
  const [reabrindo, setReabrindo] = useState<string | null>(null);
  const v = usePreviaEGravar<PreviaDoInicio>(async (motivo, simular): Promise<RespostaDaVolta<PreviaDoInicio>> => {
    if (!simular) {
      const g = modo === 'desfazer' ? await gravarDesfazerInicio({ grupoId, motivo }) : await gravarMudancaDeInicio({ grupoId, mes, motivo });
      if ('motivo' in g) return { ok: false, motivo: g.motivo, mesFechado: g.mesFechado ?? null };
      return { ok: true, valor: { tipo: 'gravou', trilhaId: g.valor.trilhaId } };
    }
    if (modo === 'desfazer') {
      const r = await desfazerMudancaDeInicio({ grupoId, motivo, simular });
      if ('motivo' in r) return { ok: false, motivo: r.motivo, mesFechado: r.mesFechado ?? null };
      return { ok: true, valor: { tipo: 'desfazer', p: r.valor } };
    }
    const r = await mudarInicio({ grupoId, mes, motivo, simular });
    if ('motivo' in r) return { ok: false, motivo: r.motivo, mesFechado: r.mesFechado ?? null };
    return { ok: true, valor: { tipo: 'mudar', p: r.valor } };
  }, `${modo}:${mes}:${releitura}`, modo === 'desfazer' || (!!doBanco && !!mes));
  const prev = v.previa && v.previa.tipo !== 'gravou' ? v.previa : null;
  const direcao = prev?.p.direcao ?? null;
  const ordenados = useMemo(() => [...piquetes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })), [piquetes]);
  const nomesPiq = nomesDosPiquetes(prev?.tipo === 'mudar' ? prev.p.pastos.map(x => x.nome) : ordenados.map(x => x.nome));
  /* com a prévia, os meses que mudam; sem ela, o que vale hoje — o mapa sempre aproxima no pasto */
  const itens = useMemo<ItemDaPreviaComMapa[]>(() => itensDoMapaDoInicio(direcao, { chave: paiPastoId, nome: nomeDoPai, geojson: geoDoPai }, ordenados),
    [direcao, paiPastoId, nomeDoPai, geoDoPai, ordenados]);
  const semDesenho = !geoDoPai && ordenados.every(q => !q.geojson);
  const haPai = prev?.tipo === 'mudar' ? prev.p.areaPaiHa : null;
  const haGrupo = prev?.tipo === 'mudar' ? prev.p.areaGrupoHa : null;
  const mesesDaPrevia = prev?.p.meses ?? [];
  const vistos = mesesDaPrevia.slice(0, LINHAS_DE_MES);
  const restam = mesesDaPrevia.length - vistos.length;
  const rotuloMes = mes ? mesBr(mes) : '—';
  const falhaDosInicios = inicios && 'motivo' in inicios ? inicios.motivo : null;
  const desencontrados = !!doBanco?.desencontrados && inicios && 'valor' in inicios ? [...inicios.valor].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })) : null;
  const textoDoInicio = !inicios ? '' : falhaDosInicios ? 'início —' : desencontrados ? 'inícios diferentes' : inicioAtual ? `início ${mesBr(inicioAtual)}` : 'início —';
  const tituloDoInicio = desencontrados ? desencontrados.map(i => `${i.nome}: ${i.inicio ? mesBr(i.inicio) : '—'}`).join(' · ') : undefined;
  return (
    <>
      <QuadroDaVolta testid="mudar-inicio-dialogo" titulo={`Mês de início dos piquetes de ${nomeDoPai}`} corpoAoMeio
        descricao={modo === 'mudar'
          ? `Os piquetes passam a começar no mês escolhido: antes do início de hoje antecipa, depois adia. Os mesmos pastos e a mesma área; mês fechado não muda. Nada foi gravado ainda.`
          : `Volta ao que era antes da última mudança de início: os piquetes, o fim de ${nomeDoPai}, a área oficial e os cards que o gesto moveu. Nada foi gravado ainda.`}
        mapa={semDesenho
          ? <div className="flex h-full items-center justify-center rounded bg-muted/40 px-4 text-center text-[11px] text-muted-foreground" data-testid="mudar-inicio-sem-desenho">
              {nomeDoPai} e os piquetes não têm desenho no mapa: a prévia vale pelo cadastro.
            </div>
          : <PreviaComMapa itens={itens} acesa={null} aoPassar={() => {}} />}
        controles={(
          <div className="grid flex-none gap-1.5">
            <div className="flex items-center gap-2 text-[10px]">
              <Segmentado valor={modo} onEscolher={(m) => setModo(m === 'desfazer' ? 'desfazer' : 'mudar')} altura={22}
                opcoes={[{ valor: 'mudar', rotulo: 'Mudar o mês' }, { valor: 'desfazer', rotulo: 'Desfazer a última mudança' }]} />
              {/* lugar fixo à direita (regra de corte: fora de tabela nada de "…"; o texto é curto e nunca quebra); o início é o do BANCO */}
              <span className="ml-auto flex-none whitespace-nowrap text-muted-foreground" data-testid="mudar-inicio-hoje" title={tituloDoInicio}>
                {textoDoInicio}
              </span>
            </div>
            <CampoMesEMotivo meses={meses} mes={mes} setMes={setMes} motivo={v.motivo} setMotivo={v.setMotivo} comMes={modo === 'mudar'} gravando={v.gravando}
              mesNoLugar="O mês volta ao de antes da última mudança." />
          </div>
        )}
        tabela={prev ? (
          /* um dado por coluna (Gabriel 06/11 17:13: "P17-A–P17-D (4) · 1…" cortava): Mês · Antes · ha · Depois · ha */
          <TabelaDaVolta primeira={56} colunas={[null, 64, null, 64]} cabecalho={[['Mês', false], ['Antes', false], ['ha', true], ['Depois', false], ['ha', true]]}>
            {vistos.map((m) => {
              const ant = direcao === 'antecipar';
              const antes = ant ? nomeDoPai : nomesPiq, antesHa = ant ? haPai : haGrupo;
              const depois = ant ? nomesPiq : nomeDoPai, depoisHa = ant ? haGrupo : haPai;
              return (
                <tr key={m} data-mes={m}>
                  <td className={TD_REGUA_TEXTO}>{mesBr(m)}</td>
                  <td className={TD_REGUA_TEXTO} title={antes}>{antes}</td>
                  <td className={TD_REGUA_NUM}>{haOuTraco(antesHa)}</td>
                  <td className={TD_REGUA_TEXTO} title={depois}>{depois}</td>
                  <td className={TD_REGUA_NUM}>{haOuTraco(depoisHa)}</td>
                </tr>
              );
            })}
            {restam > 0 && (
              <tr><td colSpan={5} className={TD_REGUA_TEXTO} title={mesesDaPrevia.slice(LINHAS_DE_MES).map(mesBr).join(', ')}>… e mais {restam}</td></tr>
            )}
          </TabelaDaVolta>
        ) : desencontrados ? (
          /* os piquetes não começam todos no mesmo mês: cada um com o seu início (o banco recusa o gesto até eles se alinharem) */
          <TabelaDaVolta colunas={[72]} cabecalho={[['Piquete', false], ['Início', false]]}>
            {desencontrados.map(i => (
              <tr key={i.pastoId} data-piquete={i.nome}>
                <td className={TD_REGUA_TEXTO} title={i.nome}>{i.nome}</td>
                <td className={TD_REGUA_TEXTO}>{i.inicio ? mesBr(i.inicio) : '—'}</td>
              </tr>
            ))}
          </TabelaDaVolta>
        ) : null}
        frase={prev?.p.frase ?? null} recusa={falhaDosInicios ?? v.recusa}
        abaixoDaRecusa={falhaDosInicios ? (
          <Button variant="link" size="sm" className="h-auto p-0 text-[10px]" onClick={() => setReleitura(n => n + 1)} data-testid="mudar-inicio-tentar">Tentar de novo</Button>
        ) : v.mesFechado ? (
          <>
            <span>{mesBr(v.mesFechado)} está fechado:</span>
            <ReabrirMesNaOC forma="link" onAbrir={() => setReabrindo(v.mesFechado)} />
          </>
        ) : null}
        gravando={v.gravando} motivoDoBloqueio={!inicios && modo === 'mudar' ? 'Lendo o início dos piquetes…' : v.motivoDoBloqueio} larguraGravar={128}
        rotuloGravar={modo === 'mudar' ? `Mudar para ${rotuloMes}` : 'Desfazer a mudança'}
        aoGravar={() => void v.gravar(() => {
          toast.success(modo === 'mudar' ? 'Mês de início mudado.' : 'Mudança de início desfeita.');
          aoGravar(); aoFechar();
        })} aoFechar={aoFechar} />
      {reabrindo && (
        <ReabrirP1Dialog open onOpenChange={(o) => { if (!o) setReabrindo(null); }} fazendaId={fazendaId} anoMes={reabrindo}
          onReaberto={() => { setReabrindo(null); setReleitura(n => n + 1); }} />
      )}
    </>
  );
}

// --- Juntar com… : escolher a vizinha (o popover do painel; o clique no mapa faz o mesmo) ---------------------------------------------
export function EscolherVizinhaParaJuntar({ nome, irmas, recusa, aoEscolher }: {
  nome: string; irmas: readonly { id: string; nome: string; ha: string }[]; recusa: string | null; aoEscolher: (id: string) => void;
}) {
  return (
    <div className="grid gap-1 text-[10px]" data-testid="juntar-escolher">
      <span className="font-semibold text-foreground">Juntar {nome} com…</span>
      <span className="text-muted-foreground">{nome} fica e absorve a escolhida. Clique no mapa numa divisão destacada ou escolha aqui.</span>
      {irmas.length === 0
        ? <span className="font-medium text-destructive">Nenhuma divisão do mesmo grupo encosta em {nome}.</span>
        : irmas.map(i => (
          <Button key={i.id} variant="outline" size="sm" className="h-6 justify-between px-2 text-[10px]" onClick={() => aoEscolher(i.id)} data-juntar-com={i.nome}>
            <span className="truncate" title={i.nome}>{i.nome}</span><span className="tabular-nums text-muted-foreground">{i.ha}</span>
          </Button>
        ))}
      <p className="min-h-[28px] text-[10px] font-medium text-destructive" role={recusa ? 'alert' : undefined} data-testid="juntar-recusa">{recusa ?? ''}</p>
    </div>
  );
}
