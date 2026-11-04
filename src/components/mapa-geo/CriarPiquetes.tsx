/**
 * MAPA-CRIAR-PIQUETES-01 (fatia 1) — a tela do "Criar piquetes" sobre o mapa da Validação (mock aprovado mock-criar-piquetes-v1):
 *   - a BARRA (2 linhas de altura FIXA, UI-ESPACO-RESERVADO): o gesto e as escolhas dele; Cancelar e "Prévia e gravar" FIXOS à direita; na 2ª
 *     linha a área, quantas divisões, a frase da cerca selecionada e o aviso que trava a prévia (ou a pergunta da vez);
 *   - a LISTA das divisões (régua da casa): o nome de cada uma (caso novo) ou "é a divisão…" do cadastro (o pai que já é grupo, o P6),
 *     a área pela fórmula do banco; clicar na área (ou na divisão no mapa) abre "Área desejada";
 *   - a PRÉVIA é a própria `fn_piquetes_criar` com simular (o mês, no caso novo; a frase do banco) — Gravar grava o gesto inteiro.
 * MAPA-CRIAR-PIQUETES-01 fatia 2a (mock-praca-central-v1): "Praça central" é o modo de abertura; os botões que dependem de seleção só
 * aparecem com seleção; o que não couber na linha vai para "Mais ▾" pelo `arranjarZona` (a mesma conta da barra de edição).
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CampoNumeroComConta } from '@/components/ui/campo-numero-com-conta';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Segmentado } from '@/components/ui/segmentado';
import { TD_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA } from '@/components/ui/regua-tabela';
import { ChevronDown, Info, Lock, RotateCw, Undo2, Unlock } from 'lucide-react';
import { DicaDoMapa } from '@/components/mapa-geo/DicaDoMapa';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { arranjarZona, type ArranjoDaZona } from '@/lib/mapa/barraQueCabe';
import { haDoBanco, membrosPorParecenca } from '@/lib/mapa/criarPiquetes';
import { ehDivisaoPequena } from '@/lib/mapa/linhasDosPiquetes';
import { mesesDeInicio } from '@/lib/mapa/piquetesEmEspera';
import { rotuloCurtoDaDivisao, type CriarPiquetes } from '@/hooks/useCriarPiquetes';
import type { FormatoDaPraca } from '@/lib/mapa/pracaCentral';
import { cn } from '@/lib/utils';

const TXT = 'text-[9.5px]';
/* MAPA-PRACA-ESTAVEL-01: a dica de um botão da barra nunca abre por cima da lista das divisões */
const LISTA = '[data-testid="piquetes-lista"]';
/* MAPA-DICAS-01: o atalho de cada botão de ação */
const ATALHO_DA_ACAO: Record<string, string> = { desfazer: 'Ctrl/Cmd+Z', terminar: 'duplo clique' };

const GAP = 8; // gap-2 da zona
const haBr = (ha: number) => haDoBanco(ha).toFixed(2).replace('.', ',');
const inteiroEntre = (n: number | null, min: number, max: number, atual: number) => (n == null ? atual : Math.min(max, Math.max(min, Math.round(n))));
const NOME_DO_REGULAR: Record<number, string> = { 4: 'Losango', 6: 'Hexágono', 8: 'Octógono' };
/* homologação 02/11 (1124 px): a linha 1 não cabia (modo + forma + medida + divisões + cocho) e o foco no "Mais" rolava o cartão do mapa
   para a esquerda — o modo vira MENU e a praça vira um botão-resumo com popover; a zona é `overflow-clip` (não rola com o foco) */
const ROTULO_DO_MODO: Record<string, string> = { praca: 'Praça central', linhas: 'Linhas que eu traço', grade: 'Grade', iguais: 'N iguais' };
const MODOS: Parameters<CriarPiquetes['setModo']>[0][] = ['praca', 'linhas', 'grade', 'iguais'];

/** Um botão de ação da 1ª linha: inline quando cabe, item do "Mais ▾" quando não. */
interface AcaoDaBarra { id: string; rotulo: string; testid: string; title: string; disabled?: boolean; ativo?: boolean; onClick: () => void; icone?: 'desfazer' | 'trancada' | 'solta' }

/** `aoUsarPiqueteDe` (PIQUETES-PRACA-CONCAVO-01, item 3): os polígonos soltos dentro do pasto vão para a espera do "É piquete de" (nada grava). */
export function CriarPiquetesNoMapa({ piq, aoUsarPiqueteDe }: { piq: CriarPiquetes; aoUsarPiqueteDe?: (soltos: CriarPiquetes['soltos']) => void }) {
  const zonaRef = useRef<HTMLDivElement>(null);
  const escolhasRef = useRef<HTMLDivElement>(null);
  /* a 2ª linha: a dica é a primeira a sair quando não cabe (o resto é dado ou pergunta) */
  const linha2Ref = useRef<HTMLDivElement>(null);
  const [semDica, setSemDica] = useState(false);
  useLayoutEffect(() => { setSemDica(false); }, [piq.ferramenta, piq.modo]);
  useLayoutEffect(() => {
    const l = linha2Ref.current; if (!l) return;
    if (!semDica && l.scrollWidth > l.clientWidth + 1) setSemDica(true);
  });
  const larguras = useRef(new Map<string, number>());
  const [arranjo, setArranjo] = useState<(ArranjoDaZona & { chave: string }) | null>(null);

  const n = piq.divisoes.length;
  const media = n ? piq.divisoes.reduce((s, d) => s + d.areaHa, 0) / n : 0;
  const praca = piq.desenho.praca;
  const modoPraca = piq.modo === 'praca';
  const sel = piq.selecionada;
  const pedirNome = !piq.existente;

  // --- os botões de ação (os que dependem de seleção só aparecem com seleção) ---------------------------------------------------
  const acoes: AcaoDaBarra[] = [];
  const poligonos = piq.modo === 'poligonos';
  if (praca) acoes.push({ id: 'igualar', rotulo: 'Igualar áreas', testid: 'piquetes-igualar', onClick: piq.igualar,
    title: 'Gira as cercas NÃO fixas até as divisões ficarem iguais (a cerca ajustada à mão fica fixa)' });
  if (praca && praca.formato !== 'livre') acoes.push({ id: 'alinhar', rotulo: 'Alinhar praça', testid: 'piquetes-alinhar', onClick: piq.alinhar,
    title: 'Reorienta o polígono regular da praça pelas cercas' });
  /* MAPA-PRACA-ESTAVEL-01: trocar o lado de referência é um gesto ANUNCIADO (antes, todo clique perto da borda girava a praça) */
  if (praca && praca.formato !== 'livre' && modoPraca) acoes.push({ id: 'referencia', rotulo: 'Lado de referência', testid: 'piquetes-referencia', ativo: piq.ferramenta === 'referencia',
    onClick: () => piq.setFerramenta(piq.ferramenta === 'referencia' ? null : 'referencia'), title: 'Ligue e clique num lado do pasto: a cruz fica paralela a ele (um clique e desliga)' });
  acoes.push({ id: 'tracar', rotulo: 'Traçar linha nova', testid: 'piquetes-tracar', ativo: piq.ferramenta === 'tracar',
    onClick: () => piq.setFerramenta(piq.ferramenta === 'tracar' ? null : 'tracar'), title: 'Clique ponto a ponto no satélite; duplo clique termina (Alt solta o encaixe)' });
  acoes.push({ id: 'corredor', rotulo: 'Corredor', testid: 'piquetes-corredor', ativo: piq.ferramenta === 'corredor',
    onClick: () => piq.setFerramenta(piq.ferramenta === 'corredor' ? null : 'corredor'), title: 'Risque o eixo; a faixa (largura em metros) sai das divisões e grava como estrada' });
  if (piq.desenho.corredor) acoes.push({ id: 'tirar-corredor', rotulo: 'Tirar corredor', testid: 'piquetes-tirar-corredor', onClick: piq.tirarCorredor, title: 'Tira o corredor do desenho' });
  acoes.push({ id: 'regua', rotulo: 'Régua', testid: 'piquetes-regua', ativo: piq.ferramenta === 'regua',
    onClick: () => piq.setFerramenta(piq.ferramenta === 'regua' ? null : 'regua'), title: 'Meça clicando ponto a ponto (gruda em cantos e linhas); nada se grava; Esc sai' });
  if (pedirNome) acoes.push({ id: 'nomear', rotulo: 'Nomear clicando', testid: 'piquetes-nomear', ativo: piq.ferramenta === 'nomear',
    onClick: () => piq.setFerramenta(piq.ferramenta === 'nomear' ? null : 'nomear'), title: 'Cada clique numa divisão dá a próxima letra, na ordem dos cliques' });
  if (piq.ferramenta === 'nomear') acoes.push({ id: 'recomecar', rotulo: 'Recomeçar', testid: 'piquetes-recomecar', onClick: piq.recomecarNomes, title: 'Zera os nomes: o próximo clique volta à letra A' });
  if (sel) {
    if (piq.cercaSel) acoes.push({ id: 'cadeado', rotulo: piq.cercaSel.fixa ? 'Fixa' : 'Solta', testid: 'piquetes-cadeado', icone: piq.cercaSel.fixa ? 'trancada' : 'solta', onClick: piq.alternarCadeado,
      title: piq.cercaSel.fixa ? 'Cerca fixa (ajustada à mão): o "Igualar áreas" não mexe. Clique para destravar.' : 'Cerca solta: o "Igualar áreas" pode girar. Clique para fixar.' });
    /* PIQUETES-PRACA-CONCAVO-01: a linha riscada que sai do pasto e volta — o padrão corta no 1º encontro; aqui se escolhe seguir */
    const saida = piq.cercaSel ? null : piq.saidas.find(x => x.id === piq.selecionada);
    if (saida) acoes.push({ id: 'seguir', rotulo: saida.seguida ? 'Cortar no 1º encontro' : 'Seguir além da borda', testid: 'piquetes-seguir', onClick: piq.alternarSeguirSelecionada,
      title: saida.seguida ? 'A linha corta todos os pedaços do pasto que atravessa. Clique para cortar só até o 1º encontro com a borda.'
        : `A linha sai do pasto e volta (cruza a borda ${saida.cruzamentos}×): ela foi cortada no 1º encontro. Clique para seguir além da borda e cortar também o que vem depois.` });
    acoes.push({ id: 'tirar', rotulo: 'Tirar ponto', testid: 'piquetes-tirar-ponto', disabled: piq.pontoSel == null, onClick: () => piq.tirarPonto(),
      title: piq.pontoSel == null ? 'Clique num ponto da linha para escolher (o botão direito tira direto)' : 'Tira o ponto escolhido' });
    acoes.push({ id: 'apagar', rotulo: 'Apagar linha', testid: 'piquetes-apagar-linha', onClick: piq.apagarSelecionada, title: 'Apaga a linha selecionada' });
  }
  if ((piq.ferramenta === 'tracar' || piq.ferramenta === 'corredor' || piq.ferramenta === 'desenharPraca') && piq.emTraco.length > 0) {
    acoes.push({ id: 'terminar', rotulo: 'Terminar', testid: 'piquetes-terminar', onClick: piq.terminarTraco,
      disabled: piq.emTraco.length < (piq.ferramenta === 'desenharPraca' ? 3 : 2), title: 'Fecha o que você está riscando (o duplo clique no mapa faz o mesmo)' });
  }
  acoes.push({ id: 'desfazer', rotulo: 'Desfazer', testid: 'piquetes-desfazer', icone: 'desfazer', disabled: !piq.podeDesfazer, onClick: piq.desfazer, title: 'Desfaz o último passo (Ctrl/Cmd+Z)' });
  /* PIQUETE-POLIGONO-01 (Gabriel 03/11 21:37, "só isto"): no "+ Piquete" a barra tem só o "+ Piquete" (um piquete por clique) e o Desfazer */
  if (poligonos) acoes.splice(0, acoes.length,
    { id: 'piquete', rotulo: '+ Piquete', testid: 'piquetes-mais-piquete', ativo: piq.ferramenta === 'piquete',
      onClick: () => piq.setFerramenta(piq.ferramenta === 'piquete' ? null : 'piquete'),
      title: 'Desenhe o piquete dentro do pasto: clique os pontos e feche no 1º ponto. Um piquete por clique no botão' },
    { id: 'desfazer', rotulo: 'Desfazer', testid: 'piquetes-desfazer', icone: 'desfazer', disabled: !piq.podeDesfazer, onClick: piq.desfazer, title: 'Desfaz o último piquete (Ctrl/Cmd+Z)' });

  const temEscolhas = true;
  const chave = `${piq.modo}|${acoes.map(a => a.id).join(',')}|${piq.config.formato}|${piq.config.n}|${!!piq.desenho.corredor}|${piq.ferramenta ?? ''}`;
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
      acoes: acoes.map(a => W.get(a.id) ?? 0), mais: W.get('mais') ?? 60, gap: GAP });
    setArranjo(a => (a && a.chave === chave && a.instrucaoInteira === r.instrucaoInteira && a.acoesVisiveis === r.acoesVisiveis ? a : { ...r, chave }));
  };
  useLayoutEffect(() => { if (medindo) calcular.current(); }, [medindo, chave]);
  useLayoutEffect(() => {
    const z = zonaRef.current; if (!z || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => calcular.current());
    ro.observe(z); if (escolhasRef.current) ro.observe(escolhasRef.current);
    return () => ro.disconnect();
  }, [chave]);

  if (!piq.aberto || !piq.pai) return null;
  const instrucaoInteira = medindo || arranjo.instrucaoInteira;
  const nVisiveis = medindo ? acoes.length : arranjo.acoesVisiveis;
  const naLinha = acoes.slice(0, nVisiveis);
  const noMais = acoes.slice(nVisiveis);
  const escolhida = piq.escolhida != null ? piq.divisoes[piq.escolhida] : null;
  /* "+ Piquete": desenhando, a 2ª linha diz como (a dica); fora disso o que falta para gravar vem em cinza ("Desenhe pelo menos 2 piquetes") */
  const motivoNaLinha = poligonos && piq.ferramenta ? null : piq.motivo;
  const aviso = piq.erro ?? piq.aviso ?? motivoNaLinha;
  const avisoVermelho = !!piq.erro || !!piq.aviso || (!!motivoNaLinha && !poligonos && piq.grupo.estado !== 'lendo');
  const mp = piq.medidasPraca;
  const cfg = piq.config;
  const dica = piq.ferramenta === 'nomear' ? <>clique nas divisões na ordem desejada: a próxima é <b>{piq.proximaLetra}</b></>
    : piq.ferramenta === 'piquete' ? 'clique os pontos do piquete · fecha no 1º ponto · Backspace tira o último ponto · Esc desiste'
    : poligonos ? 'cada "+ Piquete" desenha um piquete dentro do pasto · o pasto continua'
    : piq.ferramenta === 'tracar' ? 'clique no mapa para riscar · duplo clique termina a linha · Alt solta o encaixe'
    : piq.ferramenta === 'corredor' ? 'risque o eixo do corredor · duplo clique termina'
    : piq.ferramenta === 'desenharPraca' ? 'clique os cantos da praça (3 ou mais) · duplo clique fecha'
    : piq.ferramenta === 'referencia' ? 'clique num lado do pasto: a cruz fica paralela a ele · Esc sai'
    : modoPraca ? 'arraste o centro (a praça anda) · aproxime para os cantos · gire a cerca pela ponta na borda · clique na cerca para editar'
    : 'clique numa linha para editar · arraste as pontas, o ◇ do meio ou crie ponto clicando nela';

  return (
    <div className="contents" data-testid="piquetes-tela">
      <div className="absolute left-3 right-3 top-2 z-20 rounded-md border border-border bg-card/95 px-2 py-1 shadow-md backdrop-blur-sm" data-testid="barra-piquetes" data-cromo="cima">
        {/* 1ª linha: [zona que se acomoda: gesto · escolhas · botões · Mais ▾] [FIXO: Cancelar · Prévia e gravar] */}
        <div className="flex h-[22px] items-center gap-2">
          <div ref={zonaRef} className="flex min-w-0 flex-1 items-center gap-2 overflow-clip" data-testid="piquetes-zona">
            <p className={`flex flex-none items-center gap-1 whitespace-nowrap font-semibold text-foreground ${TXT}`}
              title="Praça central: a cruz/radial dos módulos. Linhas que eu traço, Grade e N iguais geram ou desenham as cercas; toda linha se edita; a área é a do banco.">
              {instrucaoInteira
                ? <span data-medir="texto">Criar piquetes</span>
                : <Info className="h-3.5 w-3.5 flex-none text-[#2B6CB0]" aria-label="Criar piquetes" />}
              <span data-medir="nome" className="font-normal text-muted-foreground">{piq.pai.nome}</span>
            </p>
            {temEscolhas && !poligonos && (
              <div ref={escolhasRef} className="flex flex-none items-center gap-2" data-testid="piquetes-escolhas">
                <DropdownMenu>
                  <DicaDoMapa evitar={LISTA} nome="Modo" frase="Como começar as divisões: linhas que eu traço, grade ou N partes iguais.">
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className={`h-5 flex-none gap-0.5 px-1.5 ${TXT}`} data-testid="piquetes-modo">
                        {ROTULO_DO_MODO[piq.modo] ?? piq.modo}<ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                  </DicaDoMapa>
                  <DropdownMenuContent align="start">
                    {MODOS.map(m => (
                      <DropdownMenuItem key={m} onSelect={() => piq.setModo(m)} data-testid={`piquetes-modo-${m}`}>{ROTULO_DO_MODO[m]}</DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {modoPraca && (
                  <Popover>
                    <DicaDoMapa evitar={LISTA} nome="Praça" frase="A praça de alimentação no centro: formato, tamanho, divisões e o cocho.">
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className={`h-5 flex-none gap-0.5 px-1.5 ${TXT}`} data-testid="piquetes-praca-botao">
                          {cfg.formato === 'regular' ? (NOME_DO_REGULAR[cfg.n] ?? 'Regular') : cfg.formato === 'circulo' ? 'Círculo' : 'Desenhada'}
                          {cfg.formato !== 'livre' ? ` ${String(Math.round(cfg.medida.metros * 10) / 10).replace('.', ',')} m · ${cfg.n}` : ''}{cfg.cocho ? ' · cocho' : ''}
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </PopoverTrigger>
                    </DicaDoMapa>
                    <PopoverContent align="start" className="w-auto p-2">
                  <span className={`flex flex-none items-center gap-1.5 whitespace-nowrap ${TXT}`} data-testid="piquetes-praca">
                    <Segmentado altura={20} fonte={9.5} valor={cfg.formato} onEscolher={(f: FormatoDaPraca) => piq.mudarFormato(f)}
                      opcoes={[{ valor: 'regular', rotulo: NOME_DO_REGULAR[cfg.n] ?? 'Regular' }, { valor: 'circulo', rotulo: 'Círculo' }, { valor: 'livre', rotulo: 'Desenhar' }]} />
                    {cfg.formato === 'regular' && (
                      <Segmentado altura={20} fonte={9.5} valor={cfg.medida.tipo === 'lado' ? 'lado' : 'diagonal'}
                        onEscolher={t => piq.mudarMedida(piq.medidasPraca ? (t === 'lado' ? piq.medidasPraca.ladoM : piq.medidasPraca.diagonalM) : cfg.medida.metros, t)}
                        opcoes={[{ valor: 'diagonal', rotulo: 'Diagonal' }, { valor: 'lado', rotulo: 'Lado' }]} />
                    )}
                    {cfg.formato === 'circulo' && <span className="text-muted-foreground">raio</span>}
                    {cfg.formato !== 'livre' && (
                      <>
                        <CampoNumeroComConta valor={Math.round(cfg.medida.metros * 10) / 10} casas={1} className="h-5 w-[46px] px-1 text-center text-[9.5px]"
                          title={cfg.medida.tipo === 'lado' ? 'Lado da praça em metros' : cfg.medida.tipo === 'raio' ? 'Raio do círculo em metros' : 'Diagonal da praça em metros (de vértice a vértice)'}
                          onChange={v => piq.mudarMedida(v)} />
                        m
                      </>
                    )}
                    {cfg.formato !== 'livre' && (
                      <Segmentado altura={20} fonte={9.5} valor={String(cfg.n)} onEscolher={v => piq.mudarConfig({ n: Number(v) })}
                        opcoes={[{ valor: '4', rotulo: '4' }, { valor: '6', rotulo: '6' }, { valor: '8', rotulo: '8' }]} />
                    )}
                    <label className="flex cursor-pointer items-center gap-1" title="Põe um cocho/bebedouro (um ponto) no centro da praça; vai na gravação como infraestrutura">
                      <Checkbox checked={cfg.cocho} onCheckedChange={v => piq.mudarConfig({ cocho: v === true })} className="h-3 w-3" data-testid="piquetes-cocho" />
                      Cocho
                    </label>
                  </span>
                    </PopoverContent>
                  </Popover>
                )}
                {piq.modo === 'grade' && (
                  <span className={`flex flex-none items-center gap-1 whitespace-nowrap ${TXT}`} data-testid="piquetes-grade">
                    <CampoNumeroComConta valor={cfg.linhasGrade} casas={0} className="h-5 w-[34px] px-1 text-center text-[9.5px]" title="Faixas (no comprido)"
                      onChange={v => piq.mudarConfig({ linhasGrade: inteiroEntre(v, 1, 7, cfg.linhasGrade) })} />
                    ×
                    <CampoNumeroComConta valor={cfg.colunas} casas={0} className="h-5 w-[34px] px-1 text-center text-[9.5px]" title="Divisões em cada faixa (no atravessado)"
                      onChange={v => piq.mudarConfig({ colunas: inteiroEntre(v, 1, 7, cfg.colunas) })} />
                    = {n}
                  </span>
                )}
                {piq.modo === 'iguais' && (
                  <span className={`flex flex-none items-center gap-1 whitespace-nowrap ${TXT}`} data-testid="piquetes-iguais">
                    <CampoNumeroComConta valor={cfg.colunas} casas={0} className="h-5 w-[38px] px-1 text-center text-[9.5px]" title="Quantas partes iguais"
                      onChange={v => piq.mudarConfig({ colunas: inteiroEntre(v, 2, 49, cfg.colunas) })} />
                    partes
                  </span>
                )}
                {(piq.modo === 'grade' || piq.modo === 'iguais') && (
                  <DicaDoMapa evitar={LISTA} nome="Girar" frase="Girar as linhas 90° (paralelas ao outro lado).">
                    <Button variant="ghost" size="sm" className={`h-5 flex-none gap-1 px-1.5 ${TXT}`} onClick={() => piq.mudarConfig({ girado: !cfg.girado })}
                      data-testid="piquetes-girar">
                      <RotateCw className="h-3 w-3" />Girar
                    </Button>
                  </DicaDoMapa>
                )}
                {(piq.desenho.corredor || piq.ferramenta === 'corredor') && (
                  <span className={`flex flex-none items-center gap-1 whitespace-nowrap ${TXT}`} data-testid="piquetes-largura-corredor">
                    largura
                    <CampoNumeroComConta valor={cfg.larguraCorredor} casas={1} className="h-5 w-[40px] px-1 text-center text-[9.5px]" title="Largura do corredor em metros"
                      onChange={piq.larguraDoCorredor} />
                    m
                  </span>
                )}
                {piq.ferramenta === 'nomear' && (
                  <span className={`flex flex-none items-center gap-1 whitespace-nowrap ${TXT}`} data-testid="piquetes-prefixo-caixa">
                    prefixo
                    <Input value={cfg.prefixo} onChange={ev => piq.mudarConfig({ prefixo: ev.target.value })} className={`h-5 w-[92px] px-1 ${TXT}`}
                      title="O nome de cada divisão é o prefixo + a letra" data-testid="piquetes-prefixo" />
                  </span>
                )}
              </div>
            )}

            <div className="min-w-0 flex-1" />
            {naLinha.map(a => (
              <DicaDoMapa evitar={LISTA} key={a.id} nome={a.rotulo} frase={a.title} atalho={ATALHO_DA_ACAO[a.id]} desabilitado={!!a.disabled}>
                <Button data-medir={a.id} variant={a.ativo ? 'default' : 'ghost'} size="sm" className={`h-5 flex-none gap-1 px-1.5 ${TXT}`}
                  disabled={a.disabled} onClick={a.onClick} data-testid={a.testid}>
                  {a.icone === 'desfazer' && <Undo2 className="h-3 w-3" />}{a.icone === 'trancada' && <Lock className="h-3 w-3" />}{a.icone === 'solta' && <Unlock className="h-3 w-3" />}{a.rotulo}
                </Button>
              </DicaDoMapa>
            ))}
            {noMais.length > 0 && (
              <DropdownMenu>
                <DicaDoMapa evitar={LISTA} nome="Mais" frase={`Mais ações que não couberam na barra: ${noMais.map(a => a.rotulo).join(' · ')}.`}>
                  <DropdownMenuTrigger asChild>
                    <Button data-medir="mais" variant="ghost" size="sm" className={`h-5 flex-none gap-0.5 px-1.5 ${TXT}`} data-testid="piquetes-mais">
                      Mais<ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                </DicaDoMapa>
                <DropdownMenuContent align="end">
                  {noMais.map(a => (
                    <DropdownMenuItem key={a.id} disabled={a.disabled} onSelect={a.onClick} title={a.title} data-testid={a.testid}>
                      {a.icone === 'desfazer' && <Undo2 className="mr-1 h-3 w-3" />}{a.rotulo}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div className="flex flex-none items-center gap-1.5" data-testid="piquetes-fixos">
            <DicaDoMapa evitar={LISTA} nome="Cancelar" frase="Sair de Criar piquetes sem gravar nada; se houver divisões feitas, pergunta antes de descartar." atalho="Esc">
              <Button variant="outline" size="sm" className={`h-5 flex-none px-2 ${TXT}`} onClick={piq.pedirCancelar} data-testid="piquetes-cancelar">Cancelar</Button>
            </DicaDoMapa>
            <DicaDoMapa evitar={LISTA} nome="Prévia e gravar" frase={piq.motivo ?? 'Ver as divisões e as áreas antes de gravar; nada é gravado até você confirmar.'}
              desabilitado={!!piq.motivo || piq.conferindo || piq.confirmarCancelar}>
              <Button size="sm" className={`h-5 w-[86px] flex-none px-0 ${TXT}`} disabled={!!piq.motivo || piq.conferindo || piq.confirmarCancelar}
                onClick={() => void piq.prever()} data-testid="piquetes-previa">
                {piq.conferindo ? 'Conferindo…' : 'Prévia e gravar'}
              </Button>
            </DicaDoMapa>
          </div>
        </div>
        {/* 2ª linha: a área, quantas divisões, a cerca selecionada · a pergunta da vez, o rascunho ou o aviso (ou a dica) */}
        <div ref={linha2Ref} className={`flex h-[18px] items-center gap-3 overflow-clip tabular-nums ${TXT}`} data-testid="piquetes-linha-2">
          <span className="flex-none whitespace-nowrap font-semibold text-foreground" data-testid="piquetes-medidas">
            {piq.totalHa != null ? `${haBr(piq.totalHa)} ha` : '— ha'} · {n} {poligonos ? (n === 1 ? 'piquete' : 'piquetes') : n === 1 ? 'divisão' : 'divisões'}{n ? ` de ${haBr(media)} ha em média` : ''}
            {mp ? ` · praça ${haBr(mp.areaHa)} ha` : ''}
          </span>
          {piq.fraseDaSelecionada && !piq.confirmarCancelar && (
            <span className="flex-none whitespace-nowrap font-bold text-fuchsia-700" data-testid="piquetes-frase-cerca">{piq.fraseDaSelecionada}</span>
          )}
          {piq.reguaLivreFrase && !piq.confirmarCancelar && (
            <span className="flex-none whitespace-nowrap font-semibold text-teal-700" data-testid="piquetes-frase-regua">{piq.reguaLivreFrase}</span>
          )}
          <span className="min-w-0 flex-1" />
          {piq.confirmarCancelar ? (
            <span className="flex flex-none items-center gap-1.5 whitespace-nowrap" data-testid="piquetes-confirmar-cancelar">
              <span className="font-semibold text-red-600">Descartar o que foi feito?</span>
              <Button variant="outline" size="sm" className={`h-4 flex-none px-1.5 ${TXT}`} onClick={piq.descartar} data-testid="piquetes-descartar">Descartar</Button>
              <Button variant="outline" size="sm" className={`h-4 flex-none px-1.5 ${TXT}`} onClick={piq.continuarSemDescartar} data-testid="piquetes-continuar-editando">Continuar</Button>
            </span>
          ) : piq.soltos.length > 0 && !piq.temTrabalho && !poligonos ? (
            <span className="flex flex-none items-center gap-1.5 whitespace-nowrap" data-testid="piquetes-soltos">
              <span className="font-semibold text-[#a15c00]" data-testid="piquetes-soltos-frase">
                Há {piq.soltos.length} {piq.soltos.length === 1 ? 'polígono' : 'polígonos'} sem classificação dentro deste pasto: usar "É piquete de"?
              </span>
              {aoUsarPiqueteDe && (
                <Button variant="outline" size="sm" className={`h-4 flex-none px-1.5 ${TXT}`} onClick={() => aoUsarPiqueteDe(piq.soltos)} data-testid="piquetes-usar-piquete-de">
                  Usar "É piquete de"
                </Button>
              )}
              <Button variant="outline" size="sm" className={`h-4 flex-none px-1.5 ${TXT}`} onClick={piq.dispensarSoltos} data-testid="piquetes-desenhar-assim">Desenhar mesmo assim</Button>
            </span>
          ) : piq.guardado ? (
            <span className="flex flex-none items-center gap-1.5 whitespace-nowrap" data-testid="piquetes-rascunho">
              <span className="font-semibold text-foreground" data-testid="piquetes-rascunho-frase">
                Rascunho de {piq.guardado.em || 'antes'}: {resumoDoRascunho(piq.guardado.estado.config)}. Continuar?
              </span>
              <Button variant="outline" size="sm" className={`h-4 flex-none px-1.5 ${TXT}`} onClick={piq.continuarRascunho} data-testid="piquetes-continuar-rascunho">Continuar</Button>
              <Button variant="outline" size="sm" className={`h-4 flex-none px-1.5 ${TXT}`} onClick={piq.comecarDoZero} data-testid="piquetes-descartar-rascunho">Começar do zero</Button>
            </span>
          ) : aviso ? (
            <span className={`flex-none whitespace-nowrap font-medium ${avisoVermelho ? 'text-red-600' : 'text-muted-foreground'}`} data-testid="piquetes-aviso">{aviso}</span>
          ) : semDica ? null : (
            <span className="flex-none whitespace-nowrap text-muted-foreground" data-testid="piquetes-dica">{dica}</span>
          )}
          {piq.grupo.estado === 'erro' && (
            <Button variant="outline" size="sm" className={`h-4 flex-none px-1.5 ${TXT}`} onClick={piq.tentarGrupoDeNovo} data-testid="piquetes-tentar">Tentar de novo</Button>
          )}
        </div>
      </div>

      {/* a lista das divisões (à direita, abaixo da barra), ordenada pelo nome */}
      <div className="absolute right-3 top-[64px] z-20 w-[250px] overflow-hidden rounded-md border border-border bg-card shadow-md" data-testid="piquetes-lista" data-sobre-o-mapa>
        <table className="w-full table-fixed border-collapse">
          <colgroup><col className="w-[26px]" /><col /><col className="w-[64px]" /></colgroup>
          <thead className="bg-primary">
            <tr>
              <th className={cn(TH_REGUA, 'text-left')}>Div.</th>
              <th className={cn(TH_REGUA, 'text-left')}>{piq.existente ? 'É a divisão do cadastro' : 'Nome'}</th>
              <th className={cn(TH_REGUA, 'text-right')}>Área (ha)</th>
            </tr>
          </thead>
        </table>
        <div className="h-[160px] overflow-y-auto" data-testid="piquetes-lista-corpo">
          <table className="w-full table-fixed border-collapse">
            <colgroup><col className="w-[26px]" /><col /><col className="w-[64px]" /></colgroup>
            <tbody>
              {piq.ordemDaLista.map(i => {
                const d = piq.divisoes[i];
                if (!d) return null;
                const pequena = !!d.geojson && ehDivisaoPequena(d.areaHa);
                return (
                  <tr key={`${piq.presos[i]?.ponto.join(',') ?? i}`} className={cn('border-b border-border', piq.escolhida === i ? 'bg-violet-50' : pequena && 'bg-amber-50')}
                    data-testid="piquetes-linha" data-pequena={pequena ? '1' : undefined}>
                    <td className={cn(TD_REGUA, 'font-semibold text-violet-700')} title={piq.nomes[i] ?? ''}>{rotuloCurtoDaDivisao(piq.nomes[i] ?? '', piq.pai?.nome ?? '', i)}</td>
                    <td className={cn(TD_REGUA_TEXTO, 'py-[1px]')}>
                      {piq.existente ? (
                        <SearchableSelect dense semTodos triggerClassName="h-[17px] text-[10px]" value={piq.ligas[i] ?? ''} placeholder="escolha a divisão…"
                          onValueChange={v => piq.setLiga(i, v || null)}
                          options={membrosPorParecenca(piq.nomes[i] ?? '', piq.membrosSemDesenho).map(m => ({ value: m.id, label: m.nome }))} />
                      ) : (
                        <Input value={piq.nomes[i] ?? ''} onChange={ev => piq.setNome(i, ev.target.value)} className="h-[17px] px-1 text-[10px]"
                          title="Nome do pasto novo (a divisão)" data-testid="piquetes-nome" />
                      )}
                    </td>
                    <td className={TD_REGUA_NUM}>
                      <button type="button" className={cn('tabular-nums', pequena ? 'font-semibold text-[#a15c00]' : 'text-[#2B6CB0]')} onClick={() => piq.setEscolhida(i)}
                        title={pequena ? 'Menos de 1 ha: confira se não é um pedaço que a linha cortou a mais. Clique para pedir a área desta divisão' : 'Pedir a área desta divisão'}>
                        {d.geojson ? haBr(d.areaHa) : '—'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {mp && (
                <tr className="border-b border-border bg-amber-50" data-testid="piquetes-linha-praca">
                  <td className={cn(TD_REGUA, 'text-amber-600')}>●</td>
                  <td className={cn(TD_REGUA_TEXTO, 'py-[1px]')} title="Praça de alimentação (grava como área da fazenda, benfeitoria)">Praça de alimentação{cfg.cocho ? ' · cocho' : ''}</td>
                  <td className={TD_REGUA_NUM}>{haBr(mp.areaHa)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <table className="w-full table-fixed border-collapse">
          <colgroup><col className="w-[26px]" /><col /><col className="w-[64px]" /></colgroup>
          <tfoot className="bg-primary text-primary-foreground">
            <tr className="h-[23px] text-[10px]">
              <td className="px-1" />
              <td className="px-1">Soma</td>
              <td className="px-1 text-right font-semibold tabular-nums" data-testid="piquetes-soma">{haBr(piq.divisoes.reduce((s, d) => s + d.areaHa, 0))}</td>
            </tr>
          </tfoot>
        </table>
        {/* a área desejada da divisão escolhida (a cerca livre que a limita gira; nas linhas, a linha desliza) */}
        {/* PIQUETE-POLIGONO-01: no "+ Piquete" a área é a que ele desenhou (sem "Área desejada"); o lugar fica reservado (nada se desloca) */}
        <div className={cn(`flex h-[26px] items-center gap-1.5 border-t border-border px-1.5 ${TXT}`, poligonos && 'invisible')} data-testid="piquetes-area-desejada">
          {escolhida && piq.escolhida != null ? (
            <>
              <span className="flex-none whitespace-nowrap font-semibold">Área de {rotuloCurtoDaDivisao(piq.nomes[piq.escolhida] ?? '', piq.pai.nome, piq.escolhida)}:</span>
              <CampoNumeroComConta key={`${piq.escolhida}-${haBr(escolhida.areaHa)}`} valor={haDoBanco(escolhida.areaHa)} soAoSair sufixoDentro="ha"
                className="h-5 w-[84px] text-[10px]" onChange={v => piq.pedirArea(piq.escolhida ?? 0, v)} invalido={!!piq.avisoDaArea}
                title="A área que esta divisão deve ter; a cerca (ou a linha) livre que a limita se ajusta" />
            </>
          ) : (
            <span className="text-muted-foreground">Clique numa divisão para pedir a área dela.</span>
          )}
        </div>
        {piq.avisoDaArea && <p className={`px-1.5 pb-1 text-red-600 ${TXT}`} data-testid="piquetes-aviso-area">{piq.avisoDaArea}</p>}
      </div>

      <PreviaDoCriarPiquetes piq={piq} />
    </div>
  );
}

/** O que o rascunho guardado traz, na pergunta de continuar ("Círculo 25 m · 8 · cocho"): continuar é escolha do operador NA SESSÃO. */
export function resumoDoRascunho(c: CriarPiquetes['config']): string {
  if (c.modo !== 'praca') return ROTULO_DO_MODO[c.modo] ?? c.modo;
  const forma = c.formato === 'regular' ? (NOME_DO_REGULAR[c.n] ?? 'Regular') : c.formato === 'circulo' ? 'Círculo' : 'Desenhada';
  return `${forma}${c.formato !== 'livre' ? ` ${String(Math.round(c.medida.metros * 10) / 10).replace('.', ',')} m · ${c.n}` : ''}${c.cocho ? ' · cocho' : ''}`;
}

function PreviaDoCriarPiquetes({ piq }: { piq: CriarPiquetes }) {
  const p = piq.previa;
  const meses = mesesDeInicio(new Date());
  return (
    <Dialog open={!!p} onOpenChange={o => { if (!o) piq.setPrevia(null); }}>
      <DialogContent className="max-w-md" data-testid="piquetes-dialogo-previa">
        <DialogHeader>
          <DialogTitle className="text-sm">Prévia — criar piquetes de {piq.pai?.nome}</DialogTitle>
          <DialogDescription className="text-[11px]">Nada foi gravado ainda. Confira e grave.</DialogDescription>
        </DialogHeader>
        {p && (
          <div className="space-y-2 text-[11px]">
            {p.caso === 'novo' && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Os piquetes começam em</span>
                <Segmentado valor={piq.mes ?? meses[meses.length - 1].valor} altura={22} opcoes={meses.map(m => ({ valor: m.valor, rotulo: m.rotulo }))}
                  onEscolher={m => { piq.setMes(m); void piq.prever(m); }} />
              </div>
            )}
            <table className="w-full table-fixed border-collapse tabular-nums" data-testid="piquetes-previa-tabela">
              <colgroup><col /><col className="w-[110px]" /><col className="w-[70px]" /></colgroup>
              <thead className="bg-primary">
                <tr><th className={cn(TH_REGUA, 'text-left')}>Divisão</th><th className={cn(TH_REGUA, 'text-left')}>No cadastro</th><th className={cn(TH_REGUA, 'text-right')}>Área (ha)</th></tr>
              </thead>
              <tbody>
                {p.piquetes.map(x => (
                  <tr key={x.nome} className="border-b border-border">
                    <td className={TD_REGUA_TEXTO} title={x.nome}>{x.nome}</td>
                    <td className={TD_REGUA_TEXTO}>{x.liga === 'novo' ? 'pasto novo' : 'liga à existente'}</td>
                    <td className={TD_REGUA_NUM}>{haBr(x.areaHa)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-primary text-primary-foreground">
                <tr className="h-[23px] text-[10px]">
                  <td className="px-1">Soma · contorno {p.contornoHa != null ? haBr(p.contornoHa) : '—'}</td>
                  <td className="px-1" />
                  <td className="px-1 text-right font-semibold">{haBr(p.somaHa)}</td>
                </tr>
              </tfoot>
            </table>
            {p.secao.length > 0 && (
              <table className="w-full table-fixed border-collapse tabular-nums" data-testid="piquetes-previa-secao">
                <colgroup><col /><col className="w-[150px]" /><col className="w-[70px]" /></colgroup>
                <thead className="bg-primary">
                  <tr><th className={cn(TH_REGUA, 'text-left')}>Grava junto</th><th className={cn(TH_REGUA, 'text-left')}>Tipo</th><th className={cn(TH_REGUA, 'text-right')}>Área (ha)</th></tr>
                </thead>
                <tbody>
                  {p.secao.map(x => (
                    <tr key={x.nome} className="border-b border-border bg-amber-50">
                      <td className={TD_REGUA_TEXTO} title={x.nome}>{x.nome}</td>
                      <td className={TD_REGUA_TEXTO} title={x.tipo}>{x.tipo}</td>
                      <td className={TD_REGUA_NUM}>{x.areaHa != null ? haBr(x.areaHa) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p data-testid="piquetes-previa-frase-local">{p.fraseLocal}</p>
            {p.frase && <p data-testid="piquetes-previa-frase">{p.frase}</p>}
            {p.semDesenho && <p className="font-medium text-amber-700">Continuam sem desenho: {p.semDesenho}</p>}
            {piq.erro && <p className="font-medium text-red-600">{piq.erro}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => piq.setPrevia(null)}>Voltar</Button>
          <Button size="sm" disabled={piq.gravando || piq.conferindo} onClick={() => void piq.gravar()} data-testid="piquetes-gravar">
            {piq.gravando ? 'Gravando…' : 'Gravar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
