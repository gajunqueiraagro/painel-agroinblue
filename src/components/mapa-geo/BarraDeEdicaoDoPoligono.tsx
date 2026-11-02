/**
 * MAPA-EDITAR-POLIGONO-01/02 — a barra de edição do polígono, sobre o mapa da Validação (Gabriel 01/11/2026).
 * -02: COMPACTA, no máximo 2 linhas no topo do mapa, fonte no piso (9,5 px), sem cobrir o polígono (o enquadramento deixa 64 px):
 *   1ª linha — a instrução curta (ou o gesto, quando as escolhas ocupam a linha), as escolhas do gesto, Encaixe · Divisa junto ·
 *              Recortar, Desfazer passo, Cancelar, Prévia e gravar;
 *   2ª linha — "65,9 ha · 3.323 m · mapa 65,9 · cadastro 65,9", a sobreposição numa linha ("+N"), "ver lados" (recolhido; os lados
 *              também vão no próprio mapa) e o aviso que trava a prévia (cruzamento, recorte impossível, falta de motivo).
 * A PRÉVIA é a própria função do banco com simular, com cada polígono afetado e a área antes × depois. Cancelar não grava nada.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { DicaDoMapa } from '@/components/mapa-geo/DicaDoMapa';
import { Segmentado } from '@/components/ui/segmentado';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, ChevronDown, Info, Undo2 } from 'lucide-react';
import { arranjarZona, type ArranjoDaZona } from '@/lib/mapa/barraQueCabe';
import { chaveDoNomeDoPoligono, fraseCompactaDasMedidas, fraseDasSobreposicoes, textoHa, textoM } from '@/lib/mapa/edicaoDoPoligono';
import { areaEmHectares as areaDe } from '@/lib/mapa/areaDoPoligono';
import type { ModoDaEdicao, PoligonoDaFazenda, useEdicaoDoPoligono } from '@/hooks/useEdicaoDoPoligono';

/* a instrução curta de cada gesto (o Alt/Option solto do encaixe vale enquanto arrasta: o Geoman testa o `altKey`) */
const INSTRUCAO: Record<ModoDaEdicao, string> = {
  vertices: 'Arraste · clique na linha cria ponto · Alt: sem encaixe',
  redesenhar: 'Clique ponto a ponto · ⌫ desfaz · Esc cancela',
  dividir: 'Risque de lado a lado · ⌫ desfaz · duplo clique termina',
  unir: 'Unir · clique no mapa para pôr ou tirar',
  apagar: 'Apagar',
  desenhar: 'Clique ponto a ponto · ⌫ desfaz · Esc cancela',
};
/* o texto inteiro de cada instrução, no `title` (a barra tem 2 linhas: a instrução fica curta) */
const INSTRUCAO_INTEIRA: Record<ModoDaEdicao, string> = {
  vertices: 'Arraste os pontos. Um clique em QUALQUER lugar da linha cria um ponto ali (num lado longo com o meio fora da tela, aparece um ponto do meio no trecho visível). Botão direito num ponto o tira. Segurar Alt/Option solta o encaixe enquanto arrasta. Ctrl/Cmd+Z desfaz um passo.',
  redesenhar: 'Clique ponto a ponto; clique no primeiro para fechar. Backspace (ou Ctrl/Cmd+Z, ou "Desfazer ponto") tira o último ponto; para mover um ponto já posto, "Fechar e ajustar" e arraste no rascunho. Esc pergunta se cancela. Segurar Alt/Option solta o encaixe.',
  dividir: 'Risque a linha de um lado ao outro do polígono; o duplo clique termina.',
  unir: 'Escolha o vizinho que encosta.',
  apagar: 'Diga o motivo; o polígono fica na trilha e dá para desfazer.',
  desenhar: 'Clique ponto a ponto; clique no primeiro para fechar. Backspace (ou Ctrl/Cmd+Z, ou "Desfazer ponto") tira o último ponto; para mover um ponto já posto, "Fechar e ajustar" e arraste no rascunho. Esc pergunta se cancela. Segurar Alt/Option solta o encaixe.',
};

const NOME_DO_GESTO: Record<ModoDaEdicao, string> = {
  vertices: 'editar vértices', redesenhar: 'redesenhar', dividir: 'dividir', unir: 'unir', apagar: 'apagar', desenhar: 'desenhar polígono novo',
};

const TXT = 'text-[9.5px]';

type Edicao = ReturnType<typeof useEdicaoDoPoligono>;

/* UI-ESPACO-RESERVADO (-09): um botão de ação da 1ª linha — inline quando cabe, item do "Mais ▾" quando não */
interface AcaoDaBarra {
  id: string; rotulo: string; testid: string; title: string; disabled: boolean; onClick: () => void;
  desfazer?: boolean; contorno?: boolean;
}

/* MAPA-DICAS-01: o atalho de cada botão de ação (o que o Geoman/teclado já faz) */
const ATALHO_DA_ACAO: Record<string, string> = { 'desfazer-passo': 'Ctrl/Cmd+Z', 'desfazer-ponto': 'Backspace ou Ctrl/Cmd+Z', fechar: 'duplo clique' };

const GAP = 8; // gap-2 da zona

export function BarraDeEdicaoDoPoligono({ edicao, geometrias, nomeDoPasto, areaCadastroHa }: {
  edicao: Edicao;
  geometrias: readonly PoligonoDaFazenda[];
  nomeDoPasto: (id: string | null) => string | null;
  areaCadastroHa: number | null;
}) {
  const [verLados, setVerLados] = useState(false);
  const e = edicao;

  /* os botões de ação (os que não couberem vão para o "Mais ▾") */
  const acoes: AcaoDaBarra[] = [];
  if (e.modo === 'vertices' || (e.temRascunho && e.modo !== 'dividir')) {
    // -08: clicar num ponto o escolhe (anel azul); "Tirar ponto" o tira — o botão direito também tira
    acoes.push({ id: 'tirar', rotulo: 'Tirar ponto', testid: 'edicao-tirar-ponto', disabled: !e.verticeEscolhido, onClick: e.tirarPonto,
      title: e.verticeEscolhido ? 'Tira o ponto escolhido (dá para desfazer)' : 'Clique num ponto para escolher; o botão direito tira direto' });
    acoes.push({ id: 'desfazer-passo', rotulo: 'Desfazer', testid: 'edicao-desfazer-passo', disabled: !e.podeDesfazerPasso, onClick: e.desfazerPasso,
      title: 'Desfaz o último gesto: mover, criar ou tirar ponto (Ctrl/Cmd+Z)', desfazer: true });
  }
  // -08: durante o desenho — desfazer o último ponto e "Fechar e ajustar" (o Geoman não arrasta ponto no meio do desenho)
  if (e.desenhandoAgora && !e.confirmarCancelar && !(e.modo === 'desenhar' && e.pontosNoDesenho === 0 && e.guardado)) {
    acoes.push({ id: 'desfazer-ponto', rotulo: 'Desfazer ponto', testid: 'edicao-desfazer-ponto', disabled: e.pontosNoDesenho === 0, onClick: e.desfazerPonto,
      title: 'Tira o último ponto (Backspace ou Ctrl/Cmd+Z)', desfazer: true });
    acoes.push({ id: 'fechar', rotulo: 'Fechar e ajustar', testid: 'edicao-fechar-ajustar', disabled: e.pontosNoDesenho < (e.modo === 'dividir' ? 2 : 3),
      onClick: e.fecharEAjustar, title: 'Fecha o desenho agora e abre o rascunho, onde os pontos se arrastam', contorno: true });
  }
  const temEscolhas = (e.modo === 'dividir' && !!e.divisao) || e.modo === 'apagar' || e.modo === 'unir';

  /* UI-ESPACO-RESERVADO: mede a zona que se acomoda e decide (arranjarZona) — a instrução inteira ou ⓘ, e quantos botões ficam na linha.
     Enquanto mede (itens novos), tudo vai inteiro; a medição roda antes da pintura (useLayoutEffect), então nada pisca. */
  const zonaRef = useRef<HTMLDivElement>(null);
  const escolhasRef = useRef<HTMLDivElement>(null);
  const larguras = useRef(new Map<string, number>());
  const chave = `${e.modo ?? ''}|${acoes.map(a => a.id).join(',')}|${temEscolhas}|${e.alvo?.id ?? ''}|${e.temRascunho}|${e.desenhandoAgora}`;
  const [arranjo, setArranjo] = useState<(ArranjoDaZona & { chave: string }) | null>(null);
  const medindo = !arranjo || arranjo.chave !== chave;
  const calcular = useRef<() => void>(() => {});
  calcular.current = () => {
    const z = zonaRef.current; if (!z) return;
    const W = larguras.current;
    z.querySelectorAll<HTMLElement>('[data-medir]').forEach(el => { const id = el.dataset.medir; if (id) W.set(id, el.offsetWidth); });
    const nome = W.get('nome') ?? 0;
    const comNome = nome ? nome + 4 : 0;
    const escolhas = escolhasRef.current ? escolhasRef.current.offsetWidth + GAP : 0;
    /* o espaçador flexível entre as escolhas e os botões é mais um item da zona: mais um GAP (faltavam 8 px — o "Mais" saía 5 px a 1126) */
    const r = arranjarZona({ disponivel: z.clientWidth - escolhas - GAP, instrucaoInteira: (W.get('texto') ?? 0) + comNome, instrucaoCurta: 14 + comNome,
      acoes: acoes.map(a => W.get(a.id) ?? 0), mais: W.get('mais') ?? 48, gap: GAP });
    setArranjo(a => (a && a.chave === chave && a.instrucaoInteira === r.instrucaoInteira && a.acoesVisiveis === r.acoesVisiveis ? a : { ...r, chave }));
  };
  useLayoutEffect(() => { if (medindo) calcular.current(); }, [medindo, chave]);
  useLayoutEffect(() => {
    const z = zonaRef.current; if (!z || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => calcular.current());
    ro.observe(z); if (escolhasRef.current) ro.observe(escolhasRef.current);
    return () => ro.disconnect();
  }, [chave]);

  /* 2ª linha: a direita (aviso + botão, ou a pergunta da vez) nunca cede; à esquerda, se faltar lugar, nível 1 = sobreposição e correção
     viram ícone (o texto no `title`), nível 2 = sai o "ver lados" (os metros estão no próprio mapa). Volta ao nível de baixo quando a folga
     cobre o que ele ocupa. */
  const linha2Ref = useRef<HTMLDivElement>(null);
  const folgaRef = useRef<HTMLSpanElement>(null);
  const ganhos = useRef<number[]>([0, 0]);
  const [nivel2, setNivel2] = useState(0);
  const [, setTique] = useState(0);
  useLayoutEffect(() => {
    const l = linha2Ref.current, f = folgaRef.current; if (!l || !f) return;
    const excesso = l.scrollWidth - l.clientWidth;
    if (excesso > 0.5 && nivel2 < 2) {
      const sob = l.querySelector<HTMLElement>('[data-testid="edicao-sobreposicao"]')?.offsetWidth ?? 0;
      const cor = l.querySelector<HTMLElement>('[data-testid="edicao-correcao"]')?.offsetWidth ?? 0;
      const lados = l.querySelector<HTMLElement>('[data-testid="edicao-ver-lados"]')?.offsetWidth ?? 0;
      if (nivel2 === 0) ganhos.current[0] = Math.max(0, sob - 32) + Math.max(0, cor - 70);
      else ganhos.current[1] = lados ? lados + 12 : 0;
      setNivel2(nivel2 + 1);
    } else if (excesso <= 0.5 && nivel2 > 0 && f.offsetWidth > ganhos.current[nivel2 - 1] + 4) {
      setNivel2(nivel2 - 1);
    }
  });
  useLayoutEffect(() => {
    const l = linha2Ref.current; if (!l || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setTique(t => t + 1));
    ro.observe(l);
    return () => ro.disconnect();
  }, [e.modo]);

  if (!e.modo) return null;
  const instrucaoInteira = medindo || arranjo.instrucaoInteira;
  const nVisiveis = medindo ? acoes.length : arranjo.acoesVisiveis;
  const m = e.medidas;
  const pastoDoAlvo = nomeDoPasto(e.alvo?.pasto_id ?? null);
  const podePrever = !!e.gesto && !e.gravando
    && !(e.modo === 'apagar' && (!e.motivo.trim() || (!!e.alvo?.pasto_id && !e.destinoDoPasto)))
    && !((e.modo === 'dividir' || e.modo === 'desenhar') && !e.nomeNovo.trim());
  const motivoDoBloqueio = e.fraseDoCruzamento ?? e.erroDoRecorte
    ?? (e.modo === 'apagar' && !e.motivo.trim() ? 'Diga o motivo para apagar.'
      : e.modo === 'apagar' && e.alvo?.pasto_id && !e.destinoDoPasto ? 'Escolha o polígono que fica com o pasto (ou desligue o vínculo antes).'
      : e.modo === 'unir' && e.membrosDaUniao.length < 2 ? 'Escolha os vizinhos: clique no mapa ou "+ vizinho".'
      : !e.gesto ? 'Faça a mudança no mapa primeiro.' : null);
  const aviso = e.erro ?? (podePrever ? (e.podeCorrigir ? 'Há pontos amontoados no polígono (até 0,5 m): "Corrigir automaticamente" junta.' : null) : motivoDoBloqueio);
  /* com o "Corrigir automaticamente" ao lado (2ª linha), a frase fica curta e termina nele */
  const avisoNaTela = !e.erro && e.podeCorrigir && !!e.fraseDoCruzamento && aviso === e.fraseDoCruzamento
    ? 'A linha cruza ela mesma: mova ou tire o ponto laranja, ou'
    : !e.erro && e.podeCorrigir && !e.fraseDoCruzamento && !e.erroDoRecorte ? 'Pontos amontoados (até 0,5 m):' : aviso;
  const avisoVermelho = !!e.erro || !!e.fraseDoCruzamento || !!e.erroDoRecorte;
  const areaGravada = e.alvo ? areaDe(e.alvo.geojson) : null;
  /* com o polígono cruzando ele mesmo, primeiro se corrige: "Divisa junto" e "Recortar" saem das opções */
  const corrigirPrimeiro = e.podeCorrigir && !!e.fraseDoCruzamento;
  /* -08: o desenho guardado no navegador — ao abrir o desenho novo, oferece continuar (na 2ª linha, -09) */
  const perguntaContinuar = e.modo === 'desenhar' && e.desenhandoAgora && e.pontosNoDesenho === 0 && !!e.guardado && !e.confirmarCancelar;
  const temOpcoes = e.modo !== 'apagar' && e.modo !== 'unir';
  const podeRecortar = (e.modo === 'vertices' || e.modo === 'redesenhar' || e.modo === 'desenhar') && !corrigirPrimeiro;
  const opcoesLigadas = [e.encaixe && 'Encaixe', e.modo === 'vertices' && !corrigirPrimeiro && e.divisaJunto && 'Divisa junto', podeRecortar && e.recortar && 'Recortar vizinhos']
    .filter(Boolean).join(' · ');
  const tituloDaInstrucao = e.temRascunho && e.modo !== 'dividir' ? 'Rascunho: arraste os pontos; um clique na linha cria ponto; clique num ponto e "Tirar ponto" o tira (ou botão direito); Ctrl/Cmd+Z desfaz o último gesto; "Corrigir automaticamente" tira o cruzamento; Esc ou Cancelar perguntam antes de descartar. O rascunho fica guardado no navegador.' : INSTRUCAO_INTEIRA[e.modo];
  const textoDaInstrucao = (e.modo === 'dividir' && !!e.divisao) || e.modo === 'apagar' ? `${NOME_DO_GESTO[e.modo][0].toUpperCase()}${NOME_DO_GESTO[e.modo].slice(1)}`
    : e.temRascunho ? (e.modo === 'dividir' ? 'Ajuste a linha do corte · arraste os pontos' : 'Ajuste os pontos · Esc cancela')
    : INSTRUCAO[e.modo];
  const naLinha = acoes.slice(0, nVisiveis);
  const noMais = acoes.slice(nVisiveis);
  const tituloDaPrevia = e.desenhandoAgora ? 'Feche o desenho primeiro (clique no 1º ponto ou "Fechar e ajustar")'
    : e.confirmarCancelar ? 'Responda primeiro: descartar ou continuar' : podePrever ? undefined : motivoDoBloqueio ?? undefined;

  return (
    <>
      <div className="absolute left-3 right-3 top-2 z-20 rounded-md border border-border bg-card/95 px-2 py-1 shadow-md backdrop-blur-sm"
        data-testid="barra-edicao-poligono" data-cromo="cima">
        {/* 1ª linha (UI-ESPACO-RESERVADO): [zona que se acomoda: instrução · escolhas · botões · Mais ▾] [Opções ▾] [FIXO: Cancelar · Prévia e gravar] */}
        <div className="flex h-[22px] items-center gap-2">
          <div ref={zonaRef} className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden" data-testid="edicao-zona">
            <p className={`flex flex-none items-center gap-1 whitespace-nowrap font-semibold text-foreground ${TXT}`} data-testid="edicao-instrucao"
              title={tituloDaInstrucao}>
              {instrucaoInteira
                ? <span data-medir="texto">{textoDaInstrucao}</span>
                : <Info className="h-3.5 w-3.5 flex-none text-[#2B6CB0]" aria-label={textoDaInstrucao} data-testid="edicao-instrucao-icone" />}
              {e.alvo && <span data-medir="nome" className="font-normal text-muted-foreground">{e.alvo.nome}{pastoDoAlvo ? ` → ${pastoDoAlvo}` : ''}</span>}
            </p>

            {temEscolhas && (
              <div ref={escolhasRef} className="flex flex-none items-center gap-2" data-testid="edicao-escolhas">
                {e.modo === 'dividir' && e.divisao && (
                  <>
                    <Segmentado altura={20} fonte={9.5} valor={e.originalFicaCom} onEscolher={e.setOriginalFicaCom}
                      opcoes={[{ valor: 'a', rotulo: `verde ${textoHa(areaDe(e.divisao.a))}` }, { valor: 'b', rotulo: `laranja ${textoHa(areaDe(e.divisao.b))}` }]} />
                    {e.alvo?.pasto_id && (
                      <Segmentado altura={20} fonte={9.5} valor={e.pastoVaiParaNova ? 'nova' : 'original'} onEscolher={(v) => e.setPastoVaiParaNova(v === 'nova')}
                        opcoes={[{ valor: 'original', rotulo: 'pasto: original' }, { valor: 'nova', rotulo: 'pasto: nova' }]} />
                    )}
                  </>
                )}
                {e.modo === 'unir' && (
                  <>
                    {/* -04: vários de uma vez — o resumo dos escolhidos (os nomes no title), acrescentar pela busca (tolerante: 6b = 6B = P6B) ou
                        clicando no mapa, e de quem o resultado herda o pasto */}
                    <span className={`flex-none whitespace-nowrap text-foreground ${TXT}`} title={e.membrosDaUniao.map(mm => mm.nome).join(' + ')} data-testid="unir-membros">
                      {e.membrosDaUniao.length} {e.membrosDaUniao.length === 1 ? 'polígono' : 'polígonos'}
                    </span>
                    <div className="w-[130px] flex-none" data-testid="unir-acrescentar">
                      <SearchableSelect dense semTodos triggerClassName="h-5 text-[9.5px]" value="__acrescentar__" allValue="__acrescentar__" onValueChange={(v) => { if (v && v !== '__acrescentar__') e.alternarNaUniao(v); }}
                        allLabel={e.candidatosAUnir.length ? '+ vizinho' : 'sem mais vizinhos'} placeholder="Buscar (6b = 6B = P6B)"
                        options={e.candidatosAUnir.map(g => {
                          const k = chaveDoNomeDoPoligono(g.nome_original);
                          return { value: g.id, label: g.nome_original, sub: nomeDoPasto(g.pasto_id) ?? 'sem vínculo', busca: `${k} p${k} p ${k} p_${k}` };
                        })} />
                    </div>
                    <span className={`flex-none text-muted-foreground ${TXT}`}>fica</span>
                    <div className="w-[130px] flex-none" title="De quem o polígono unido herda o pasto" data-testid="unir-fica-com">
                      <SearchableSelect dense semTodos nomeInteiro triggerClassName="h-5 text-[9.5px]" value={e.ficaComDe || '__sem__'} onValueChange={(v) => e.setFicaComDe(v === '__sem__' ? '' : v)}
                        options={[...e.membrosDaUniao.map(mm => ({ value: mm.id, label: mm.nome, sub: nomeDoPasto(mm.pasto_id) ? `pasto ${nomeDoPasto(mm.pasto_id)}` : 'sem pasto' })),
                          { value: '__sem__', label: 'sem classificação' }]} />
                    </div>
                  </>
                )}
                {e.modo === 'apagar' && (
                  <>
                    <Input value={e.motivo} onChange={ev => e.setMotivo(ev.target.value)} placeholder="Motivo (ex.: divisa errada no KMZ)"
                      className={`h-5 w-[200px] flex-none px-1.5 ${TXT}`} data-testid="edicao-motivo" />
                    {e.alvo?.pasto_id && (
                      <div className="w-[170px] flex-none" title={`O pasto ${pastoDoAlvo} fica com`}>
                        <SearchableSelect dense semTodos value={e.destinoDoPasto ?? ''} onValueChange={(v) => e.setDestinoDoPasto(v || null)}
                          placeholder={`${pastoDoAlvo} fica com…`}
                          options={geometrias.filter(g => g.id !== e.alvo?.id && !g.pasto_id).map(g => ({ value: g.id, label: g.nome_original }))} />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="min-w-0 flex-1" />
            {naLinha.map(a => (
              <DicaDoMapa key={a.id} nome={a.rotulo} frase={a.title} atalho={ATALHO_DA_ACAO[a.id]} desabilitado={a.disabled}>
                <Button data-medir={a.id} variant={a.contorno ? 'outline' : 'ghost'} size="sm" className={`h-5 flex-none gap-1 px-1.5 ${TXT}`}
                  disabled={a.disabled} onClick={a.onClick} data-testid={a.testid}>
                  {a.desfazer && <Undo2 className="h-3 w-3" />}{a.rotulo}
                </Button>
              </DicaDoMapa>
            ))}
            {noMais.length > 0 && (
              <DropdownMenu>
                <DicaDoMapa nome="Mais" frase={`Mais ações que não couberam na barra: ${noMais.map(a => a.rotulo).join(' · ')}.`}>
                  <DropdownMenuTrigger asChild>
                    <Button data-medir="mais" variant="ghost" size="sm" className={`h-5 flex-none gap-0.5 px-1.5 ${TXT}`} data-testid="edicao-mais">
                      Mais<ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                </DicaDoMapa>
                <DropdownMenuContent align="end">
                  {noMais.map(a => (
                    <DropdownMenuItem key={a.id} disabled={a.disabled} onSelect={a.onClick} title={a.title} data-testid={a.testid}>
                      {a.desfazer && <Undo2 className="mr-1 h-3 w-3" />}{a.rotulo}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {temOpcoes && (
            <DropdownMenu>
              <DicaDoMapa nome="Opções" frase={opcoesLigadas ? `Encaixe e recorte da edição. Ligado agora: ${opcoesLigadas}.` : 'Encaixe e recorte da edição. Está tudo desligado agora.'}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className={`h-5 flex-none gap-0.5 px-1.5 ${TXT}`} data-testid="edicao-opcoes">
                    Opções<ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
              </DicaDoMapa>
              <DropdownMenuContent align="end">
                <DropdownMenuCheckboxItem checked={e.encaixe} onCheckedChange={(v) => e.setEncaixe(v === true)} onSelect={(ev) => ev.preventDefault()}
                  title="Encaixe nos pontos e lados vizinhos (7 px; nunca no contorno da fazenda). Segurar Alt/Option solta o encaixe enquanto arrasta." data-testid="edicao-encaixe">
                  Encaixe
                </DropdownMenuCheckboxItem>
                {e.modo === 'vertices' && !corrigirPrimeiro && (
                  <DropdownMenuCheckboxItem checked={e.divisaJunto} onCheckedChange={(v) => e.setDivisaJunto(v === true)} onSelect={(ev) => ev.preventDefault()}
                    title="Mover a divisa junto: o ponto comum a outro polígono (até 0,5 m) muda nos dois, na mesma gravação" data-testid="edicao-divisa-junto">
                    Divisa junto
                  </DropdownMenuCheckboxItem>
                )}
                {podeRecortar && (
                  <DropdownMenuCheckboxItem checked={e.recortar} onCheckedChange={(v) => e.setRecortar(v === true)} onSelect={(ev) => ev.preventDefault()}
                    title="A forma nova sai dos polígonos que ela cobre (nunca do contorno da fazenda), na mesma gravação" data-testid="edicao-recortar">
                    Recortar vizinhos
                  </DropdownMenuCheckboxItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* FIXO (UI-ESPACO-RESERVADO): sempre na tela, largura reservada — nada o empurra */}
          <div className="flex flex-none items-center gap-1.5" data-testid="edicao-fixos">
            <DicaDoMapa nome="Cancelar" frase="Sair da edição sem gravar nada; se houver rascunho, pergunta antes de descartar." atalho="Esc">
              <Button variant="outline" size="sm" className={`h-5 flex-none px-2 ${TXT}`} onClick={e.pedirCancelar} data-testid="edicao-cancelar">Cancelar</Button>
            </DicaDoMapa>
            <DicaDoMapa nome="Prévia e gravar" frase={tituloDaPrevia ?? 'Ver o que muda (cada polígono, área antes × depois) antes de gravar; nada é gravado até você confirmar.'}
              desabilitado={!podePrever || e.desenhandoAgora || e.confirmarCancelar}>
              <Button size="sm" className={`h-5 w-[86px] flex-none px-0 ${TXT}`} disabled={!podePrever || e.desenhandoAgora || e.confirmarCancelar}
                onClick={() => void e.prever()} data-testid="edicao-previa">
                {e.gravando ? 'Conferindo…' : 'Prévia e gravar'}
              </Button>
            </DicaDoMapa>
          </div>
        </div>

        {/* 2ª linha: medidas · sobreposição · ver lados · aviso (+ o botão contextual) — ou a pergunta da vez (descartar? continuar?) */}
        <div ref={linha2Ref} className={`flex h-[18px] items-center gap-3 tabular-nums ${TXT}`} data-testid="edicao-linha-2">
          {m && e.modo !== 'apagar' && (
            <span className="flex-none whitespace-nowrap font-semibold text-foreground" data-testid="edicao-medidas">
              {/* -06: desenhando, "X ha · Y m" ao vivo desde o 1º lado (a área só a partir do 3º ponto: antes, "— ha") */}
              {e.desenhando ? `${m.areaHa > 0 ? textoHa(m.areaHa) : '— ha'} · ${textoM(m.perimetroM)}` : fraseCompactaDasMedidas(m, areaGravada, areaCadastroHa)}
            </span>
          )}
          {/* com um aviso vermelho (cruzamento, recorte impossível, recusa) a linha fica só com as medidas e ele: nada corta */}
          {e.avisos.length > 0 && !avisoVermelho && (
            <span className="flex flex-none items-center gap-1 whitespace-nowrap font-medium text-amber-700" data-testid="edicao-sobreposicao"
              title={`${fraseDasSobreposicoes(e.avisos)}: ${e.avisos.map(s => `${s.nome} (${textoHa(s.areaHa)})`).join(', ')}`}>
              <AlertTriangle className="h-3 w-3 flex-none" />{nivel2 >= 1 ? e.avisos.length : fraseDasSobreposicoes(e.avisos)}
            </span>
          )}
          {e.correcao && !avisoVermelho && (
            <span className="flex-none whitespace-nowrap text-emerald-700" data-testid="edicao-correcao"
              title={`corrigido: ${e.correcao.pontosJuntados} juntado(s) · ${e.correcao.partesDescartadas} laço(s) fora · ${textoHa(e.correcao.areaAntesHa)} → ${textoHa(e.correcao.areaDepoisHa)}`}>
              {nivel2 >= 1 ? 'corrigido ✓' : <>corrigido: {e.correcao.pontosJuntados} {e.correcao.pontosJuntados === 1 ? 'ponto juntado' : 'pontos juntados'}
              {e.correcao.partesDescartadas > 0 ? ` · ${e.correcao.partesDescartadas} ${e.correcao.partesDescartadas === 1 ? 'laço fora' : 'laços fora'}` : ''}
              {` · ${textoHa(e.correcao.areaAntesHa)} → ${textoHa(e.correcao.areaDepoisHa)}`}</>}
            </span>
          )}
          {e.modo === 'unir' && e.membrosDaUniao.length >= 2 && (
            <span className="flex-none whitespace-nowrap text-muted-foreground" data-testid="unir-soma">
              soma das partes {textoHa(e.somaDaUniaoHa)}
            </span>
          )}
          {e.afetados.length > 0 && !avisoVermelho && (
            <span className="flex-none whitespace-nowrap text-[#c2410c]" data-testid="edicao-afetados"
              title={e.afetados.map(a => a.nome).join(', ')}>
              muda junto: {e.afetados.length} {e.afetados.length === 1 ? 'polígono' : 'polígonos'}
            </span>
          )}
          {m && m.ladosM.length > 0 && e.modo !== 'apagar' && !avisoVermelho && nivel2 < 2 && (
            <button type="button" className="flex-none text-[#2B6CB0]" onClick={() => setVerLados(v => !v)} data-testid="edicao-ver-lados">
              {verLados ? 'esconder lados' : 'ver lados'}
            </button>
          )}
          <span ref={folgaRef} className="min-w-0 flex-1" />
          {e.confirmarCancelar ? (
            <span className="flex flex-none items-center gap-1.5" data-testid="edicao-confirmar-cancelar">
              <span className="font-semibold text-red-700">Descartar o que foi feito?</span>
              <Button variant="outline" size="sm" className={`h-4 px-2 ${TXT}`} onClick={e.descartar} data-testid="edicao-cancelar-sim">Sim, descartar</Button>
              <Button size="sm" className={`h-4 px-2 ${TXT}`} onClick={() => e.setConfirmarCancelar(false)} data-testid="edicao-cancelar-nao">Não, continuar</Button>
            </span>
          ) : perguntaContinuar && e.guardado ? (
            <span className="flex flex-none items-center gap-1.5" data-testid="edicao-continuar-guardado">
              <span className="font-semibold text-foreground">Continuar o desenho de {e.guardado.em}?</span>
              <Button size="sm" className={`h-4 px-2 ${TXT}`} onClick={e.retomarRascunho} data-testid="edicao-continuar-sim">Continuar</Button>
              <Button variant="outline" size="sm" className={`h-4 px-2 ${TXT}`} onClick={e.esquecerGuardado} data-testid="edicao-continuar-nao">Começar de novo</Button>
            </span>
          ) : (
            <>
              {/* -09: o nome do polígono novo fica na 2ª linha, ao lado do aviso (na 1ª, com a lista aberta, as escolhas do Dividir não cabiam) */}
              {(e.modo === 'dividir' || e.modo === 'desenhar') && (
                <Input value={e.nomeNovo} onChange={ev => e.setNomeNovo(ev.target.value)} className={`h-4 w-[140px] flex-none px-1.5 ${TXT}`}
                  placeholder="Nome do polígono novo" title="Nome do polígono novo" data-testid="edicao-nome-novo" />
              )}
              {avisoNaTela && (
                <span className={`flex-none whitespace-nowrap font-medium ${avisoVermelho ? 'text-red-600' : 'text-muted-foreground'}`} data-testid="edicao-erro">
                  {avisoNaTela}
                </span>
              )}
              {e.podeCorrigir && (
                <Button variant="outline" size="sm" className={`h-4 flex-none border-red-300 px-1.5 text-red-700 ${TXT}`} onClick={e.corrigir}
                  title="Junta os pontos amontoados (até 0,5 m) e tira o laço da linha que cruza ela mesma; dá para desfazer o passo" data-testid="edicao-corrigir">
                  Corrigir automaticamente
                </Button>
              )}
            </>
          )}
        </div>

        {verLados && m && (
          <div className={`absolute left-2 top-full mt-1 max-w-[520px] rounded border border-border bg-card px-2 py-1 shadow ${TXT} tabular-nums`}
            data-testid="edicao-lados">
            {m.ladosM.map((l, i) => <span key={i} className="mr-2 inline-block">{i + 1}: {textoM(l)}</span>)}
          </div>
        )}
      </div>

      <Dialog open={!!e.previa} onOpenChange={(o) => { if (!o) e.setPrevia(null); }}>
        <DialogContent className="max-w-md" data-testid="edicao-dialogo-previa">
          <DialogHeader>
            <DialogTitle className="text-sm">Prévia — {NOME_DO_GESTO[e.modo]}</DialogTitle>
            <DialogDescription className="text-[11px]">Nada foi gravado ainda. Confira e grave.</DialogDescription>
          </DialogHeader>
          {e.previa && (
            <div className="space-y-2 text-[11px]">
              <p className="tabular-nums" data-testid="previa-areas">
                Área do mapa: antes <b>{textoHa(e.previa.areaAntesHa)}</b> · depois <b>{textoHa(e.previa.areaDepoisHa)}</b>
              </p>
              <table className="w-full table-fixed text-[11px] tabular-nums" data-testid="previa-poligonos">
                <colgroup><col /><col className="w-[64px]" /><col className="w-[60px]" /><col className="w-[60px]" /></colgroup>
                <thead><tr className="text-left text-muted-foreground"><th className="font-medium">Polígono</th><th className="font-medium">Mudança</th>
                  <th className="text-right font-medium">Antes</th><th className="text-right font-medium">Depois</th></tr></thead>
                <tbody>
                  {e.previa.poligonos.map(p => (
                    <tr key={`${p.id}-${p.mudanca}`}>
                      <td className="truncate" title={p.pasto_antes !== p.pasto_depois
                        ? `${p.nome} · pasto ${nomeDoPasto(p.pasto_antes) ?? '—'} → ${nomeDoPasto(p.pasto_depois) ?? '—'}` : p.nome}>
                        <b>{p.nome}</b>
                        {p.pasto_antes !== p.pasto_depois && ` · pasto ${nomeDoPasto(p.pasto_antes) ?? '—'} → ${nomeDoPasto(p.pasto_depois) ?? '—'}`}
                      </td>
                      <td>{p.mudanca}</td>
                      <td className="text-right">{p.areaAntesHa != null ? textoHa(p.areaAntesHa) : '—'}</td>
                      <td className="text-right">{p.areaDepoisHa != null ? textoHa(p.areaDepoisHa) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {e.previa.pastosSemPoligono.length > 0 && (
                <p className="font-medium text-amber-700" data-testid="previa-sem-poligono">
                  Fica sem polígono: {e.previa.pastosSemPoligono.map(p => p.nome).join(', ')}
                </p>
              )}
              {e.previa.sobreposicoes.length > 0 && (
                <p className="font-medium text-amber-700">{fraseDasSobreposicoes(e.previa.sobreposicoes)}</p>
              )}
              <p className="text-muted-foreground">A área do cadastro não muda (adotar a área do mapa é outro gesto, na tela de pastos).</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => e.setPrevia(null)}>Voltar</Button>
            <Button size="sm" disabled={e.gravando} onClick={() => void e.gravar()} data-testid="previa-gravar">{e.gravando ? 'Gravando…' : 'Gravar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** O botão de desfazer o último gesto gravado (fica até o próximo gesto ou até desfazer). */
export function DesfazerUltimaEdicao({ edicao }: { edicao: Edicao }) {
  if (!edicao.ultimoGesto || edicao.modo) return null;
  const id = edicao.ultimoGesto;
  return (
    <Button variant="outline" size="sm" className="absolute bottom-3 left-3 z-20 h-6 gap-1 bg-card px-2 text-[11px]"
      disabled={edicao.gravando} onClick={() => void edicao.desfazer(id)} data-testid="edicao-desfazer" data-cromo="base">
      <Undo2 className="h-3 w-3" />Desfazer a última edição
    </Button>
  );
}
