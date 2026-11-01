/**
 * FECH-ROTACAO-01 · FATIA 2 — "Grupos" no cadastro de pastos: a lista dos grupos de pastejo da fazenda e o modal de criar/editar.
 *
 * O grupo junta pastos que JÁ existem (casos P10A/P10B/P10C); o pasto não muda de nome e a área do grupo é a soma das áreas,
 * calculada. O modal mostra a PRÉVIA do banco (`fn_pasto_grupo_salvar` com `p_simular`) a cada mudança e o Salvar grava só o que a
 * prévia mostrou: nome e pastos iguais aos da última prévia, sem recusa. Desativar também passa pela prévia antes de gravar.
 * Regras do Gabriel (01/11): desativar SOLTA os pastos (o grupo fica na lista como inativo; reativar = salvar de novo com os pastos);
 * o nome de um inativo não se repete; mínimo 2 pastos; pasto inativo não entra. Quem recusa é o banco — a frase dele vai inteira.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { BlocoFormulario, CorpoFormulario, Rotulo, REGUA_CAMPO } from '@/components/ui/bloco-formulario';
import { ThOrdenavel } from '@/components/ui/th-ordenavel';
import { useOrdenacaoTabela, type ColunaOrdenavel } from '@/hooks/useOrdenacaoTabela';
import { formatarAreaBR } from '@/lib/areaBR';
import {
  API_GRUPOS_DE_PASTEJO, areaDoGrupo, membrosPorGrupo, pastosQuePodemEntrar,
  type ApiGruposDePastejo, type GrupoDePastejo, type PastoDoGrupo, type PreviaDoGrupo,
} from '@/lib/pastos/gruposDePastejo';

/* ── os grupos da fazenda (a tela de pastos usa também para a etiqueta do pasto) ────────────────────────────────────────── */

export function useGruposDePastejo(fazendaId: string | null, api: ApiGruposDePastejo = API_GRUPOS_DE_PASTEJO) {
  const [grupos, setGrupos] = useState<GrupoDePastejo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const recarregar = useCallback(async () => {
    if (!fazendaId) { setGrupos([]); return; }
    setCarregando(true);
    const r = await api.listar(fazendaId);
    setCarregando(false);
    if (r.ok) { setGrupos(r.dados); setErro(null); } else setErro(r.erro);
  }, [fazendaId, api]);
  useEffect(() => { void recarregar(); }, [recarregar]);
  return { grupos, erro, carregando, recarregar };
}

/* ── a lista ────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

interface LinhaGrupo { grupo: GrupoDePastejo; pastos: PastoDoGrupo[]; area: number | null }
type ColunaGrupo = 'nome' | 'pastos' | 'area' | 'situacao';

const COLUNAS: readonly ColunaOrdenavel<LinhaGrupo, ColunaGrupo>[] = [
  { coluna: 'nome', tipo: 'texto', valor: (l) => l.grupo.nome },
  { coluna: 'pastos', tipo: 'numero', valor: (l) => l.pastos.length },
  { coluna: 'area', tipo: 'numero', valor: (l) => l.area },
  { coluna: 'situacao', tipo: 'texto', valor: (l) => (l.grupo.ativo ? 'Ativo' : 'Inativo') },
];

const TH = 'sticky top-0 z-10 bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted/70';

export function GruposDePastejo({
  fazendaId, fazendaCodigo, pastos, grupos, carregando, erro, mostrarInativos, podeEditar, api = API_GRUPOS_DE_PASTEJO, aoGravar,
}: {
  fazendaId: string;
  fazendaCodigo: string | null;
  pastos: readonly PastoDoGrupo[];
  grupos: readonly GrupoDePastejo[];
  carregando: boolean;
  erro: string | null;
  mostrarInativos: boolean;
  podeEditar: boolean;
  api?: ApiGruposDePastejo;
  /** depois de gravar: recarregar grupos e pastos */
  aoGravar: () => void;
}) {
  const [editando, setEditando] = useState<GrupoDePastejo | 'novo' | null>(null);
  const membros = useMemo(() => membrosPorGrupo(pastos), [pastos]);
  const linhas = useMemo<LinhaGrupo[]>(() => grupos
    .filter((g) => mostrarInativos || g.ativo)
    .map((g) => { const ps = membros.get(g.id) ?? []; return { grupo: g, pastos: ps, area: areaDoGrupo(ps) }; }),
  [grupos, membros, mostrarInativos]);
  const { ordem, alternar, ordenadas } = useOrdenacaoTabela(linhas, COLUNAS, { coluna: 'nome', direcao: 'asc' });
  const inativosEscondidos = grupos.filter((g) => !g.ativo).length;

  return (
    <div className="space-y-1" data-testid="grupos-de-pastejo">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-muted-foreground">Grupos de pastejo</p>
        {podeEditar && (
          <Button size="sm" className="h-6 px-2 text-[10px]" onClick={() => setEditando('novo')} data-testid="grupo-novo">Novo grupo</Button>
        )}
      </div>
      {erro && <p className="text-[11px] text-destructive" data-testid="grupos-erro">{erro}</p>}
      {!erro && !carregando && linhas.length === 0 ? (
        <p className="rounded border bg-card px-3 py-6 text-center text-[11px] text-muted-foreground" data-testid="grupos-vazio">
          {grupos.length === 0
            ? 'Nenhum grupo de pastejo nesta fazenda. Um grupo junta pastos que já existem; o nome de cada pasto não muda.'
            : `Nenhum grupo ativo. ${inativosEscondidos} inativo${inativosEscondidos === 1 ? '' : 's'}: ligue "Inativos" para ver.`}
        </p>
      ) : (
        <div className="rounded border bg-card overflow-hidden">
          <table className="w-full table-fixed text-[10px]" data-testid="grupos-tabela">
            <colgroup><col style={{ width: '24%' }} /><col /><col style={{ width: 96 }} /><col style={{ width: 72 }} /></colgroup>
            <thead>
              <tr>
                <ThOrdenavel coluna="nome" rotulo="Grupo" ordem={ordem} onOrdenar={alternar} className={TH} />
                <ThOrdenavel coluna="pastos" rotulo="Pastos" ordem={ordem} onOrdenar={alternar} className={TH} />
                <ThOrdenavel coluna="area" rotulo="Área (ha)" ordem={ordem} onOrdenar={alternar} className={TH} alinhaDireita />
                <ThOrdenavel coluna="situacao" rotulo="Situação" ordem={ordem} onOrdenar={alternar} className={TH} />
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((l, i) => {
                const nomes = l.pastos.map((p) => p.nome).join(', ');
                /* o `title` é o texto INTEIRO da célula (com a contagem): o gate confere a reticência contra ele */
                const inteiro = l.pastos.length > 0 ? `${nomes} (${l.pastos.length})` : undefined;
                return (
                  <tr key={l.grupo.id} data-testid="grupo-linha"
                    className={`border-b last:border-b-0 ${i % 2 ? 'bg-muted/30' : ''} ${podeEditar ? 'cursor-pointer hover:bg-muted/50' : ''} ${l.grupo.ativo ? '' : 'text-muted-foreground'}`}
                    onClick={podeEditar ? () => setEditando(l.grupo) : undefined}>
                    <td className="truncate px-2 py-0.5 font-medium" title={l.grupo.nome}>{l.grupo.nome}</td>
                    <td className="truncate px-2 py-0.5" title={inteiro}>
                      {nomes || <span className="text-muted-foreground">sem pastos</span>}
                      {l.pastos.length > 0 && <span className="text-muted-foreground"> ({l.pastos.length})</span>}
                    </td>
                    <td className="px-2 py-0.5 text-right tabular-nums">{formatarAreaBR(l.area) || '—'}</td>
                    <td className="px-2 py-0.5">{l.grupo.ativo ? 'Ativo' : 'Inativo'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editando && (
        <GrupoDialog
          fazendaId={fazendaId} fazendaCodigo={fazendaCodigo} grupo={editando === 'novo' ? null : editando}
          membrosAtuais={editando === 'novo' ? [] : membros.get(editando.id) ?? []}
          pastos={pastos} api={api}
          aoFechar={() => setEditando(null)}
          aoGravar={() => { setEditando(null); aoGravar(); }} />
      )}
    </div>
  );
}

/* ── o modal ────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

type EstadoPrevia =
  | { tipo: 'incompleto' }
  | { tipo: 'lendo' }
  | { tipo: 'pronta'; chave: string; previa: PreviaDoGrupo }
  | { tipo: 'recusa'; frase: string };

const ADICIONAR = '__adicionar__';
const chaveDe = (nome: string, ids: readonly string[]) => `${nome.trim()}|${[...ids].sort().join(',')}`;

function GrupoDialog({ fazendaId, fazendaCodigo, grupo, membrosAtuais, pastos, api, aoFechar, aoGravar }: {
  fazendaId: string; fazendaCodigo: string | null; grupo: GrupoDePastejo | null; membrosAtuais: readonly PastoDoGrupo[];
  pastos: readonly PastoDoGrupo[]; api: ApiGruposDePastejo; aoFechar: () => void; aoGravar: () => void;
}) {
  const [nome, setNome] = useState(grupo?.nome ?? '');
  const [ids, setIds] = useState<string[]>(() => membrosAtuais.map((p) => p.id));
  const [previa, setPrevia] = useState<EstadoPrevia>({ tipo: 'incompleto' });
  const [desativar, setDesativar] = useState<EstadoPrevia | null>(null);
  const [gravando, setGravando] = useState(false);
  const pedido = useRef(0);

  const porId = useMemo(() => new Map(pastos.map((p) => [p.id, p])), [pastos]);
  const escolhidos = useMemo(() => ids.flatMap((id) => { const p = porId.get(id); return p ? [p] : []; })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [ids, porId]);
  const opcoes = useMemo(() => pastosQuePodemEntrar(pastos, grupo?.id ?? null, ids)
    .map((p) => ({ value: p.id, label: p.nome, hint: formatarAreaBR(p.area_produtiva_ha) ? `${formatarAreaBR(p.area_produtiva_ha)} ha` : undefined })),
  [pastos, grupo, ids]);
  const area = areaDoGrupo(escolhidos);
  const chave = chaveDe(nome, ids);

  /* a prévia do banco a cada mudança (300 ms depois da última); resposta velha não pinta por cima da nova */
  useEffect(() => {
    if (desativar) return;
    if (!nome.trim() || ids.length < 2) { setPrevia({ tipo: 'incompleto' }); return; }
    const n = ++pedido.current;
    setPrevia({ tipo: 'lendo' });
    const t = setTimeout(async () => {
      const r = await api.salvar({ grupoId: grupo?.id ?? null, fazendaId, nome, pastoIds: ids, simular: true });
      if (n !== pedido.current) return;
      setPrevia(r.ok ? { tipo: 'pronta', chave, previa: r.dados } : { tipo: 'recusa', frase: r.erro });
    }, 300);
    return () => clearTimeout(t);
  }, [nome, ids, chave, grupo, fazendaId, api, desativar]);

  const podeSalvar = !gravando && previa.tipo === 'pronta' && previa.chave === chave && !previa.previa.semMudanca;

  const salvar = async () => {
    if (!podeSalvar) return;
    setGravando(true);
    const r = await api.salvar({ grupoId: grupo?.id ?? null, fazendaId, nome, pastoIds: ids, simular: false });
    setGravando(false);
    if (!r.ok) { setPrevia({ tipo: 'recusa', frase: r.erro }); return; }
    toast.success(r.dados.frase);
    aoGravar();
  };

  const pedirDesativar = async () => {
    if (!grupo) return;
    setDesativar({ tipo: 'lendo' });
    const r = await api.desativar(grupo.id, true);
    setDesativar(r.ok ? { tipo: 'pronta', chave: grupo.id, previa: r.dados } : { tipo: 'recusa', frase: r.erro });
  };
  const confirmarDesativar = async () => {
    if (!grupo || desativar?.tipo !== 'pronta') return;
    setGravando(true);
    const r = await api.desativar(grupo.id, false);
    setGravando(false);
    if (!r.ok) { setDesativar({ tipo: 'recusa', frase: r.erro }); return; }
    toast.success(r.dados.frase);
    aoGravar();
  };

  const titulo = !grupo ? 'Novo grupo de pastejo' : grupo.ativo ? 'Editar grupo de pastejo' : 'Reativar grupo de pastejo';
  const quadro = desativar ?? previa;

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !gravando) aoFechar(); }}>
      <DialogContent className="max-w-xl h-[470px] max-h-[92vh] p-0 flex flex-col gap-0" data-testid="grupo-dialog">
        <DialogHeader className="px-4 py-2.5 border-b shrink-0">
          <DialogTitle className="text-sm font-semibold">
            {titulo}{fazendaCodigo ? <span className="font-normal text-muted-foreground"> · {fazendaCodigo}</span> : null}
          </DialogTitle>
        </DialogHeader>
        <CorpoFormulario className="flex-1 min-h-0">
          <BlocoFormulario titulo="Grupo" className="shrink-0">
            <Rotulo texto="Nome" obrig />
            <Input value={nome} onChange={(e) => setNome(e.target.value)} className={REGUA_CAMPO} maxLength={60}
              placeholder="Ex.: P10" disabled={!!desativar} data-testid="grupo-nome" />
          </BlocoFormulario>
          <BlocoFormulario titulo="Pastos" dica="a área do grupo é a soma das áreas; o nome de cada pasto não muda" className="flex-1 min-h-0" testId="grupo-bloco-pastos">
            {/* o gatilho mostra o `allLabel` (o campo nunca guarda escolha: escolher = pôr na lista abaixo); `placeholder` é a busca */}
            <SearchableSelect value={ADICIONAR} allValue={ADICIONAR} semTodos placeholder="Buscar pasto"
              allLabel={opcoes.length ? 'Adicionar pasto' : 'Nenhum pasto livre para adicionar'}
              onValueChange={(v) => { if (v && v !== ADICIONAR) setIds((a) => (a.includes(v) ? a : [...a, v])); }}
              options={opcoes}
              disabled={!!desativar || opcoes.length === 0} triggerClassName={REGUA_CAMPO} />
            <div className="mt-1 min-h-0 flex-1 overflow-auto rounded border">
              <table className="w-full table-fixed text-[10px]" data-testid="grupo-pastos">
                <colgroup><col /><col style={{ width: 96 }} /><col style={{ width: 28 }} /></colgroup>
                <thead><tr className="bg-muted text-muted-foreground">
                  <th className="sticky top-0 bg-muted px-2 py-0.5 text-left font-semibold">Pasto</th>
                  <th className="sticky top-0 bg-muted px-2 py-0.5 text-right font-semibold">Área (ha)</th>
                  <th className="sticky top-0 bg-muted" aria-label="Tirar" />
                </tr></thead>
                <tbody>
                  {escolhidos.length === 0 && (
                    <tr><td colSpan={3} className="px-2 py-2 text-center text-muted-foreground">Escolha pelo menos 2 pastos.</td></tr>
                  )}
                  {escolhidos.map((p) => (
                    <tr key={p.id} className="border-t" data-testid="grupo-pasto">
                      <td className="truncate px-2 py-0.5" title={p.nome}>{p.nome}</td>
                      <td className="px-2 py-0.5 text-right tabular-nums">{formatarAreaBR(p.area_produtiva_ha) || '—'}</td>
                      <td className="px-1 text-center">
                        <button type="button" className="text-muted-foreground hover:text-destructive disabled:opacity-40" title={`Tirar ${p.nome} do grupo`}
                          disabled={!!desativar} onClick={() => setIds((a) => a.filter((x) => x !== p.id))} data-testid="grupo-tirar">
                          <X className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {escolhidos.length > 0 && (
                  <tfoot><tr className="border-t bg-muted/40 font-semibold">
                    <td className="px-2 py-0.5">Área do grupo · {escolhidos.length} pasto{escolhidos.length === 1 ? '' : 's'}</td>
                    <td className="px-2 py-0.5 text-right tabular-nums" data-testid="grupo-area">{formatarAreaBR(area) || '—'}</td>
                    <td />
                  </tr></tfoot>
                )}
              </table>
            </div>
          </BlocoFormulario>
          {/* altura FIXA (3 linhas): a frase que quebra não empurra o título nem o rodapé (UI-SEM-DESLOCAR-01) */}
          <BlocoFormulario titulo="Prévia" className="h-[84px] shrink-0 overflow-hidden" testId="grupo-previa">
            <QuadroDaPrevia estado={quadro} />
          </BlocoFormulario>
        </CorpoFormulario>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-2">
          <div>
            {grupo?.ativo && !desativar && (
              <Button variant="outline" size="sm" className="h-7 text-xs text-destructive" onClick={pedirDesativar} disabled={gravando} data-testid="grupo-desativar">
                Desativar grupo
              </Button>
            )}
            {desativar && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDesativar(null)} disabled={gravando}>Voltar</Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={aoFechar} disabled={gravando}>Cancelar</Button>
            {desativar ? (
              <Button size="sm" variant="destructive" className="h-7 w-[150px] text-xs" onClick={confirmarDesativar}
                disabled={gravando || desativar.tipo !== 'pronta' || desativar.previa.semMudanca} data-testid="grupo-confirmar-desativar">
                {gravando ? 'Gravando' : 'Confirmar desativação'}
              </Button>
            ) : (
              /* a mesma largura do "Confirmar desativação": trocar de um para o outro não empurra o Cancelar */
              <Button size="sm" className="h-7 w-[150px] text-xs" onClick={salvar} disabled={!podeSalvar} data-testid="grupo-salvar">
                {gravando ? 'Gravando' : grupo && !grupo.ativo ? 'Reativar' : 'Salvar'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QuadroDaPrevia({ estado }: { estado: EstadoPrevia }) {
  if (estado.tipo === 'incompleto') return <p className="text-[11px] text-muted-foreground" data-testid="previa-frase">Dê um nome e escolha pelo menos 2 pastos.</p>;
  if (estado.tipo === 'lendo') return <p className="text-[11px] text-muted-foreground" data-testid="previa-frase">Conferindo no banco</p>;
  if (estado.tipo === 'recusa') return <p className="text-[11px] leading-snug text-destructive" data-testid="previa-recusa">{estado.frase}</p>;
  const p = estado.previa;
  const nomes = (l: { nome: string }[]) => l.map((x) => x.nome).join(', ');
  return (
    <div className="space-y-0.5 text-[11px]">
      {/* a frase do banco QUEBRA a linha (é para ler inteira); o quadro dos pastos, acima, é quem cede a altura */}
      <p className="font-medium leading-snug" data-testid="previa-frase">{p.frase}</p>
      {(p.entram.length > 0 || p.saem.length > 0) && !p.semMudanca && (
        <p className="leading-snug text-muted-foreground" data-testid="previa-mudancas">
          {p.entram.length > 0 && <>Entram: {nomes(p.entram)}</>}
          {p.entram.length > 0 && p.saem.length > 0 && ' · '}
          {p.saem.length > 0 && <>Saem: {nomes(p.saem)}</>}
        </p>
      )}
    </div>
  );
}
