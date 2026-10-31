/**
 * MAPA-IMPORT-01b — "Importar mapa da fazenda" (mock aprovado `docs/mocks/mock-importar-mapa-v2.html`, 30/10/2026).
 * Cada polígono do arquivo ganha um DESTINO (pasto da fazenda, pasto novo, área da fazenda ou "Não importar"); a regra é a de
 * `src/lib/mapa/destinoDoPoligono.ts` (sugestão inicial, o que barra o Salvar, o que vai gravar). Gravar troca o mapa inteiro da fazenda
 * numa transação (`fn_mapa_fazenda_substituir`), criando os pastos novos no mesmo passo.
 * Layout fixo: 900px de largura, 640px de altura (até 95% da janela), cabeçalho e rodapé de 40px; só o corpo da tabela rola; a barra de
 * seleção tem lugar reservado; o "Remover mapa atual" tem lugar reservado (nada se desloca).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect, type OpcaoSearchable } from '@/components/ui/searchable-select';
import { Loader2, X } from 'lucide-react';
import { lerArquivoDeMapa } from '@/lib/kmlParser';
import { useSoltarArquivo } from '@/lib/arquivo/useSoltarArquivo';
import type { RegraDeAceite } from '@/lib/arquivo/aceitarArquivo';
import { areaEmHectares, areaNaTabela } from '@/lib/mapa/areaDoPoligono';
import {
  AREAS_DA_FAZENDA, ROTULO_DA_AREA, aplicarEmLote, contarLinhas, destinoDoValor, itensParaGravar, montarLinhas, problemasDasLinhas,
  situacaoDaLinha, trocarDestino, valorDoDestino, type CorDaSituacao, type LinhaDoMapa,
} from '@/lib/mapa/destinoDoPoligono';
import type { PoligonoParaGravar } from '@/hooks/usePastoGeometrias';
import type { Pasto } from '@/hooks/usePastos';
import { PreviaDoMapa } from './PreviaDoMapa';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Grava o mapa; `aoRecusar` recebe a frase da recusa (escrita no rodapé). Devolve se gravou. */
  onUpload: (itens: PoligonoParaGravar[], aoRecusar: (frase: string) => void) => Promise<boolean>;
  /** O gesto contrário: tira o mapa atual da fazenda. */
  onRemove?: () => Promise<boolean>;
  /** Os pastos da fazenda (ativos e inativos: os inativos só entram na regra do nome repetido). */
  pastos: Pasto[];
  hasExistingMap?: boolean;
  fazendaId?: string | null;
  fazendaCodigo?: string | null;
  fazendaNome?: string | null;
}

const REGRA_DO_MAPA: RegraDeAceite = { tipos: ['kml', 'kmz', 'geojson'] };
/* ⚠ A LISTA DO SELETOR ACIMA DO MODAL (MAPA-IMPORT-01b-fix1, medido): este modal fica em z-[1000] (acima dos controles do Leaflet da
   página do mapa) e o painel do `SearchableSelect` nasce em z-50 — abria ATRÁS do modal e parecia não abrir. */
const LISTA_ACIMA_DO_MODAL = 'z-[1100]';
const LARGURAS = [22, 132, 62, 176, 92];
const LARGURA_DA_TABELA = LARGURAS.reduce((s, w) => s + w, 0);

const SELO: Record<CorDaSituacao, string> = {
  vermelho: 'bg-[#FBE3E0] text-[#B03A2E]',
  azul: 'bg-[#E3ECF8] text-[#1F5FA8]',
  verde: 'bg-[#E3F2E8] text-[#2F6E45]',
  cinza: 'bg-[#ECEEF1] text-[#5A6472]',
};

function dataDoCadastro(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : null;
}

function opcoesDosPastos(ativos: readonly Pasto[], primeiro: ReadonlySet<string>): OpcaoSearchable[] {
  const porNome = [...ativos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  return [
    ...porNome.filter(p => primeiro.has(p.id)).map(p => ({ value: `pasto:${p.id}`, label: p.nome, hint: 'candidato' })),
    ...porNome.filter(p => !primeiro.has(p.id)).map(p => ({ value: `pasto:${p.id}`, label: p.nome, hint: 'pasto' })),
  ];
}

/* MAPA-IMPORT-01c: a área só pelo nome; o grupo vai no hint à direita ("área"), como o "pasto" dos pastos. */
const OPCOES_DE_AREA: OpcaoSearchable[] = AREAS_DA_FAZENDA.map(a => ({ value: `area:${a}`, label: ROTULO_DA_AREA[a], hint: 'área' }));
const OPCAO_NAO: OpcaoSearchable = { value: 'nao', label: 'Não importar' };

function Card({ titulo, valor, cor, destaque }: { titulo: string; valor: string; cor: string; destaque?: boolean }) {
  return (
    <div className="h-10 w-[104px] flex-none rounded-md bg-white px-2 py-[5px]" style={{ borderLeft: `3px solid ${cor}` }}>
      <div className="text-[9px] leading-[11px] text-[#4A5361]">{titulo}</div>
      <div className="text-[15px] font-semibold leading-[18px] tabular-nums" style={destaque ? { color: cor } : undefined}>{valor}</div>
    </div>
  );
}

export function KmlUploadDialog({
  open, onOpenChange, onUpload, onRemove, pastos, hasExistingMap, fazendaId, fazendaCodigo, fazendaNome,
}: Props) {
  const [arquivo, setArquivo] = useState<{ nome: string; pontos: number } | null>(null);
  const [linhas, setLinhas] = useState<LinhaDoMapa[]>([]);
  const [erroDoArquivo, setErroDoArquivo] = useState('');
  const [lendo, setLendo] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [destinoDoLote, setDestinoDoLote] = useState('');
  const [acesa, setAcesa] = useState<number | null>(null);
  const [erroDoBanco, setErroDoBanco] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const linhaRefs = useRef(new Map<number, HTMLTableRowElement>());

  const ativos = useMemo(
    () => pastos.filter(p => p.ativo && (!fazendaId || p.fazenda_id === fazendaId)),
    [pastos, fazendaId],
  );
  const daFazenda = useMemo(() => pastos.filter(p => !fazendaId || p.fazenda_id === fazendaId), [pastos, fazendaId]);
  const problemas = useMemo(() => problemasDasLinhas(linhas, daFazenda), [linhas, daFazenda]);
  const contagem = useMemo(() => contarLinhas(linhas, ativos), [linhas, ativos]);
  const opcoesDoLote = useMemo<OpcaoSearchable[]>(() => [
    ...opcoesDosPastos(ativos, new Set()),
    { value: 'novo', label: '+ Novo pasto (cada um com o seu nome)' },
    ...OPCOES_DE_AREA,
    OPCAO_NAO,
  ], [ativos]);

  const lerArquivo = useCallback(async (file: File) => {
    setErroDoArquivo('');
    setErroDoBanco('');
    setMarcadas(new Set());
    setLendo(true);
    try {
      const lido = await lerArquivoDeMapa(file);
      setArquivo({ nome: file.name, pontos: lido.pontosIgnorados });
      if (lido.poligonos.length === 0) {
        setLinhas([]);
        setErroDoArquivo('Nenhum polígono encontrado no arquivo.');
        return;
      }
      const poligonos = lido.poligonos.map(p => ({ nome: p.name, geojson: p.geojson, areaHa: areaEmHectares(p.geojson) }));
      setLinhas(montarLinhas(poligonos, ativos, fazendaId));
    } catch (err) {
      console.error(err);
      setArquivo({ nome: file.name, pontos: 0 });
      setLinhas([]);
      setErroDoArquivo('Não foi possível ler o mapa. Confira se o arquivo é KML, KMZ ou GeoJSON.');
    } finally {
      setLendo(false);
    }
  }, [ativos, fazendaId]);

  /* ⚠ A LISTA DO SELETOR ROLA (MAPA-IMPORT-01b-fix1, medido): o painel do `SearchableSelect` vai num portal direto no <body>, FORA do
     modal, e o bloqueio de rolagem do Dialog (ouvinte de `wheel` acima dele) cancelava a roda — os 26 destinos existiam, mas "+ Novo
     pasto", as áreas e "Não importar" ficavam abaixo dos 18 pastos sem como chegar. Enquanto este modal está aberto, a roda e o toque
     sobre o painel não sobem até o bloqueio. (O conserto de todos os modais é no componente da casa; frente própria.) */
  useEffect(() => {
    if (!open) return;
    const naoSobe = (e: Event) => {
      if (e.target instanceof Element && e.target.closest('[data-testid="searchable-select-painel"]')) e.stopPropagation();
    };
    document.body.addEventListener('wheel', naoSobe);
    document.body.addEventListener('touchmove', naoSobe);
    return () => {
      document.body.removeEventListener('wheel', naoSobe);
      document.body.removeEventListener('touchmove', naoSobe);
    };
  }, [open]);

  /* UI-ARRASTAR-ARQUIVO-01b: o arquivo arrastado e o escolhido no seletor passam pelo MESMO dono (`useSoltarArquivo`). */
  const soltar = useSoltarArquivo({ regra: REGRA_DO_MAPA, desabilitado: salvando, onArquivos: arquivos => { if (arquivos[0]) void lerArquivo(arquivos[0]); } });

  const limpar = () => {
    setArquivo(null);
    setLinhas([]);
    setErroDoArquivo('');
    setMarcadas(new Set());
    setDestinoDoLote('');
    setAcesa(null);
    setErroDoBanco('');
    soltar.limparRecusa();
    if (inputRef.current) inputRef.current.value = '';
  };

  const fechar = () => {
    if (salvando || removendo) return;
    limpar();
    onOpenChange(false);
  };

  const mudarDestino = (i: number, valor: string) => {
    setErroDoBanco('');
    setLinhas(ls => trocarDestino(ls, i, destinoDoValor(valor)));
  };

  const aplicarLote = () => {
    if (marcadas.size === 0 || !destinoDoLote) return;
    setErroDoBanco('');
    setLinhas(ls => aplicarEmLote(ls, marcadas, destinoDoValor(destinoDoLote)));
    setMarcadas(new Set());
    setDestinoDoLote('');
  };

  const marcar = (i: number, sim: boolean) => setMarcadas(m => {
    const n = new Set(m);
    if (sim) n.add(i); else n.delete(i);
    return n;
  });
  const todasMarcadas = linhas.length > 0 && marcadas.size === linhas.length;

  /* UX-OBRIGATORIOS-01: com linha sem destino ou repetida, nada grava; as linhas já estão em vermelho e a primeira vem para a vista. */
  const salvar = async () => {
    setErroDoBanco('');
    if (linhas.length === 0) return;
    if (problemas.size > 0) {
      const primeira = linhas.find(l => problemas.has(l.i));
      if (primeira) linhaRefs.current.get(primeira.i)?.scrollIntoView({ block: 'center' });
      return;
    }
    setSalvando(true);
    try {
      const ok = await onUpload(itensParaGravar(linhas), frase => setErroDoBanco(frase));
      if (ok) limpar();
    } finally {
      setSalvando(false);
    }
  };

  const remover = async () => {
    if (!onRemove) return;
    setRemovendo(true);
    try {
      const ok = await onRemove();
      if (ok) { limpar(); onOpenChange(false); }
    } finally {
      setRemovendo(false);
    }
  };

  const mensagem = erroDoBanco
    || (contagem.escolher === 1 ? 'Falta 1 polígono sem destino — escolha um destino ou "Não importar"' : '')
    || (contagem.escolher > 1 ? `Faltam ${contagem.escolher} polígonos sem destino — escolha um destino ou "Não importar"` : '')
    || (problemas.size > 0 ? `${problemas.size} polígonos com destino repetido — troque o destino de um deles` : '');
  const temArquivo = linhas.length > 0;
  const titulo = [fazendaCodigo, fazendaNome].filter(Boolean).join(' · ');
  const semMapaNomes = contagem.semMapa.map(p => {
    const fim = dataDoCadastro(p.data_fim);
    return fim ? `${p.nome} (encerrado ${fim})` : p.nome;
  });
  const semMapaVisiveis = semMapaNomes.slice(0, 3);
  const semMapaResto = semMapaNomes.length - semMapaVisiveis.length;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) fechar(); }}>
      <DialogContent
        className="z-[1000] flex h-[min(640px,95vh)] w-[900px] max-w-[900px] flex-col gap-0 overflow-hidden rounded-lg border-0 bg-[#EEF0F3] p-0 [&>button:last-child]:hidden"
        aria-describedby={undefined}
        {...soltar.alvo}
        data-testid="importar-mapa"
      >
        {/* Cabeçalho 40px — UM só ✕ (o do primitivo fica escondido) */}
        <div className="flex h-10 flex-none items-center gap-2.5 bg-[#1B2A44] px-3.5 text-white">
          <DialogTitle className="text-[13px] font-semibold leading-none">Importar mapa da fazenda</DialogTitle>
          <span className="text-[10px] text-[#AEB9CC]">{titulo}</span>
          <button type="button" onClick={fechar} className="ml-auto text-[#AEB9CC] hover:text-white" aria-label="Fechar">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Arquivo + contadores (40px) */}
        <div className="flex flex-none gap-2 px-3 pb-1.5 pt-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            title={arquivo ? `${arquivo.nome} — clique para trocar o arquivo` : 'Selecionar arquivo KML, KMZ ou GeoJSON'}
            data-reticencias-com-title
            className={`flex h-10 w-[226px] flex-none flex-col justify-center rounded-md px-2 py-[5px] text-left ${soltar.sobre ? 'bg-[#E6EEF8] ring-1 ring-[#1F5FA8]' : 'bg-white'}`}
          >
            <span className="truncate text-[11px] font-semibold leading-[13px]">{arquivo ? arquivo.nome : 'Selecionar arquivo'}</span>
            <span className="truncate text-[9px] leading-[11px] text-[#5A6472]">
              {lendo ? 'Lendo o arquivo…'
                : arquivo && temArquivo ? `${linhas.length} polígonos · ${arquivo.pontos} pontos de rótulo ignorados`
                : 'KML, KMZ ou GeoJSON · ou arraste para cá'}
            </span>
          </button>
          <input ref={inputRef} type="file" accept=".kml,.kmz,.geojson,.json" className="hidden"
            onChange={e => soltar.receber(e.target.files)} />
          <Card titulo="Pastos ligados" valor={temArquivo ? String(contagem.ligados) : '—'} cor="#3E8E5A" />
          <Card titulo="Pastos novos" valor={temArquivo ? String(contagem.novos) : '—'} cor="#1F5FA8" />
          <Card titulo="Áreas da fazenda" valor={temArquivo ? String(contagem.areas) : '—'} cor="#8A93A0" />
          <Card titulo="A escolher" valor={temArquivo ? String(contagem.escolher) : '—'} cor="#C0392B" destaque />
          <Card titulo="Sem mapa" valor={temArquivo ? String(contagem.semMapa.length) : '—'} cor="#1B2A44" />
        </div>

        {/* Pastos ativos do cadastro sem polígono (18px) */}
        <div className="h-[18px] flex-none px-3 pt-1 text-[9.5px] leading-[14px] text-[#4A5361]" title={semMapaNomes.join(' · ')}>
          {soltar.recusa || erroDoArquivo ? <span className="text-[#B03A2E]">{soltar.recusa || erroDoArquivo}</span>
            : !temArquivo ? null
            : semMapaNomes.length === 0 ? 'Todos os pastos ativos do cadastro têm polígono no arquivo.'
            : (
              <>
                Cadastro sem polígono no arquivo:{' '}
                {semMapaVisiveis.map((n, k) => <span key={n}>{k > 0 ? ' · ' : ''}<b className="text-[#1d232b]">{n}</b></span>)}
                {semMapaResto > 0 ? ` e mais ${semMapaResto}` : ''} — ficam sem mapa, dá para desenhar depois.
              </>
            )}
        </div>

        {/* Corpo: tabela 496px | prévia */}
        <div className="flex min-h-0 flex-1 gap-2 px-3">
          <div className="relative flex min-h-0 w-[496px] flex-none flex-col rounded-md bg-white">
            {/* Barra de seleção — lugar SEMPRE reservado (28px): a tabela não muda de altura nem de posição */}
            <div className={`flex h-7 flex-none items-center gap-2 rounded-t-md px-2 text-[10.5px] ${marcadas.size > 0 ? 'bg-[#1F5FA8] text-white' : 'bg-[#F3F5F8] text-[#6B7480]'}`}>
              {marcadas.size > 0 ? (
                <>
                  <b className="w-[86px] flex-none tabular-nums">{marcadas.size} selecionados</b>
                  <span className="flex-none">Destino:</span>
                  <div className="w-[168px] flex-none text-[#1d232b]">
                    <SearchableSelect value={destinoDoLote} onValueChange={setDestinoDoLote} options={opcoesDoLote}
                      allLabel="Escolher…" allValue="" semTodos dense contentClassName={LISTA_ACIMA_DO_MODAL}
                      triggerClassName="h-[18px] px-1.5 text-[10px]" />
                  </div>
                  <button type="button" onClick={aplicarLote} disabled={!destinoDoLote}
                    className="flex h-[18px] flex-none items-center rounded-[3px] bg-white px-2.5 font-semibold text-[#1F5FA8] disabled:opacity-60">
                    Aplicar
                  </button>
                  <button type="button" onClick={() => setMarcadas(new Set())} className="ml-auto flex-none text-[#CFE0F5] hover:text-white">
                    Limpar seleção
                  </button>
                </>
              ) : (
                <span>{temArquivo ? 'Marque polígonos para dar o mesmo destino a vários de uma vez.' : ''}</span>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarGutter: 'stable' }} data-testid="importar-mapa-corpo">
              <table className="border-collapse" style={{ tableLayout: 'fixed', width: LARGURA_DA_TABELA }}>
                <colgroup>{LARGURAS.map((w, k) => <col key={k} style={{ width: w }} />)}</colgroup>
                <thead>
                  <tr>
                    {['', 'Nome no arquivo', 'Área ha', 'Destino', 'Situação'].map((t, k) => (
                      <th key={k} className={`sticky top-0 z-[1] h-[22px] whitespace-nowrap bg-[#2B3A55] text-[10px] font-semibold text-white ${k === 0 ? 'pl-1.5' : 'px-1.5'} ${k === 2 ? 'text-right' : 'text-left'}`}>
                        {k === 0 ? (
                          <Checkbox checked={todasMarcadas} disabled={!temArquivo} aria-label="Marcar todos"
                            onCheckedChange={v => setMarcadas(v === true ? new Set(linhas.map(l => l.i)) : new Set())}
                            className="h-[11px] w-[11px] rounded-[2px] border-[#8FA0BD] [&_svg]:h-[9px] [&_svg]:w-[9px]" />
                        ) : t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, k) => {
                    const motivo = problemas.get(l.i);
                    const situacao = situacaoDaLinha(l, motivo);
                    const marcada = marcadas.has(l.i);
                    const fundo = marcada ? 'bg-[#EAF1FB]' : motivo ? 'bg-[#FFF6F4]' : k % 2 === 1 ? 'bg-[#F7F8FA]' : 'bg-white';
                    const opcoes: OpcaoSearchable[] = [
                      ...opcoesDosPastos(ativos, new Set(l.candidatos.map(c => c.id))),
                      { value: 'novo', label: `+ Novo pasto: ${l.nome}` },
                      ...OPCOES_DE_AREA,
                      OPCAO_NAO,
                    ];
                    const rotulo = opcoes.find(o => o.value === valorDoDestino(l.destino))?.label ?? 'Escolher…';
                    return (
                      <tr
                        key={l.i}
                        ref={el => { if (el) linhaRefs.current.set(l.i, el); else linhaRefs.current.delete(l.i); }}
                        onMouseEnter={() => setAcesa(l.i)}
                        onMouseLeave={() => setAcesa(a => (a === l.i ? null : a))}
                        className={`${fundo} ${acesa === l.i ? 'outline outline-2 -outline-offset-2 outline-[#1B2A44]' : ''}`}
                        title={motivo}
                        data-pendente={motivo ? 'sim' : undefined}
                      >
                        <td className="h-5 border-b border-[#EEF0F2] pl-1.5">
                          <Checkbox checked={marcada} onCheckedChange={v => marcar(l.i, v === true)} aria-label={`Marcar ${l.nome}`}
                            className="h-[11px] w-[11px] rounded-[2px] border-[#9AA3AE] [&_svg]:h-[9px] [&_svg]:w-[9px]" />
                        </td>
                        <td className="h-5 truncate border-b border-[#EEF0F2] px-1.5 text-[10.5px]" title={l.nome}>{l.nome}</td>
                        <td className="h-5 border-b border-[#EEF0F2] px-1.5 text-right text-[10.5px] tabular-nums">{areaNaTabela(l.areaHa)}</td>
                        <td className="h-5 border-b border-[#EEF0F2] px-1.5" title={motivo ? `${rotulo} — ${motivo}` : rotulo}>
                          <SearchableSelect
                            value={valorDoDestino(l.destino)}
                            onValueChange={v => mudarDestino(l.i, v)}
                            options={opcoes}
                            allLabel="Escolher…"
                            allValue=""
                            semTodos
                            dense
                            contentClassName={LISTA_ACIMA_DO_MODAL}
                            triggerClassName={`h-4 px-1.5 text-[10px] rounded-[3px] ${motivo ? 'border-[#C0392B] text-[#C0392B]' : 'border-[#CBD2DB]'}`}
                          />
                        </td>
                        <td className="h-5 border-b border-[#EEF0F2] px-1.5">
                          <span className={`whitespace-nowrap rounded-lg px-[5px] py-px text-[9px] font-semibold ${SELO[situacao.cor]}`}>{situacao.texto}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {!temArquivo && (
                    <tr>
                      <td colSpan={5} className="px-3 pt-6 text-center text-[10.5px] text-[#6B7480]">
                        {lendo ? 'Lendo o arquivo…' : 'Selecione o arquivo do mapa (KML, KMZ ou GeoJSON) no quadro acima, ou arraste para cá.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="min-w-0 flex-1 rounded-md bg-white p-1.5">
            {temArquivo ? (
              <PreviaDoMapa linhas={linhas} acesa={acesa} aoPassar={setAcesa} />
            ) : (
              <div className="flex h-full items-center justify-center rounded bg-[#DCE3D3] text-[10.5px] text-[#4A5361]">
                Nenhum mapa carregado
              </div>
            )}
          </div>
        </div>

        <div className="h-2 flex-none" />

        {/* Rodapé 40px — o lugar do "Remover mapa atual" fica reservado mesmo sem mapa */}
        <div className="flex h-10 flex-none items-center gap-2 border-t border-[#D9DEE5] bg-white px-3">
          <div className="w-[132px] flex-none">
            {hasExistingMap && onRemove ? (
              <button type="button" onClick={remover} disabled={removendo || salvando}
                className="flex h-6 items-center gap-1 rounded border border-[#E3B4AE] bg-white px-2.5 text-[11px] text-[#B03A2E] hover:bg-[#FBE3E0] disabled:opacity-60">
                {removendo ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Remover mapa atual
              </button>
            ) : null}
          </div>
          <span className="min-w-0 flex-1 truncate text-[10px] text-[#B03A2E]" title={mensagem} data-reticencias-com-title data-testid="mensagem-do-rodape">{mensagem}</span>
          <button type="button" onClick={fechar} disabled={salvando}
            className="flex h-6 flex-none items-center rounded border border-[#CBD2DB] bg-white px-3 text-[11px] disabled:opacity-60">
            Cancelar
          </button>
          <button type="button" onClick={salvar} disabled={!temArquivo || salvando}
            className="flex h-6 w-[118px] flex-none items-center justify-center gap-1 rounded bg-[#E8B93A] px-3 text-[11px] font-semibold text-[#1d232b] disabled:opacity-60">
            {salvando ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {hasExistingMap ? 'Substituir mapa' : 'Salvar mapa'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
