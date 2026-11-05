/**
 * MAPA-IMPRESSAO-01 — o diálogo "Imprimir mapa" do Gestor: tamanho da folha (A3/A1/A0, paisagem), o mês (o do Gestor, só mostrado) e a
 * imagem de fundo (Satélite Esri / Sem satélite) → "Baixar PDF". Quem monta a folha e baixa o arquivo é o `aoGerar` (a página injeta
 * `gerarPdfDoMapa`); aqui só a escolha e a frase do resultado. A recusa aparece no diálogo (nunca toast) e as áreas de mensagem têm ALTURA
 * FIXA: nada se desloca quando a frase chega. Sem a chave da conta Esri a opção do satélite não aparece (o motivo numa linha); com ela, o padrão é "Sem satélite" até a resposta da Esri.
 */
import { useEffect, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Segmentado } from '@/components/ui/segmentado';
import { MESES_COLS } from '@/lib/calculos/labels';
import { TAMANHOS, type TamanhoDaFolha } from '@/lib/mapa/impressao/folhaDoMapa';
import { chaveEsri } from '@/lib/mapa/impressao/imagemDoFundo';
import type { ResultadoDoPdf } from '@/lib/mapa/impressao/gerarPdfDoMapa';

export interface OpcoesDoPdf { tamanho: TamanhoDaFolha; querImagem: boolean }

export const MOTIVO_SEM_CHAVE_NO_DIALOGO = 'Satélite indisponível: a chave da conta Esri não está configurada.';
const FRASE_FALHA = 'Não consegui gerar o PDF. Tente de novo.';

type Imagem = 'esri' | 'sem';

/** "2026-10" → "out/2026" */
export function mesPorExtenso(anoMes: string): string {
  const m = MESES_COLS.find(x => x.key === anoMes.slice(5, 7));
  return m ? `${m.label.toLowerCase()}/${anoMes.slice(0, 4)}` : anoMes;
}

function Corpo({ anoMes, temChave, aoGerar, aoFechar }: {
  anoMes: string; temChave: boolean; aoGerar: (o: OpcoesDoPdf) => Promise<ResultadoDoPdf>; aoFechar: () => void;
}) {
  const [tamanho, setTamanho] = useState<TamanhoDaFolha>('A3');
  /* até a resposta da Esri sobre a licença (Gabriel 03/11), o padrão é SEMPRE "Sem satélite"; o Esri é opção, só com a chave */
  const [imagem, setImagem] = useState<Imagem>('sem');
  const [gerando, setGerando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDoPdf | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  const limpar = () => { setResultado(null); setErro(null); };
  const baixar = async () => {
    limpar();
    setGerando(true);
    try {
      const r = await aoGerar({ tamanho, querImagem: imagem === 'esri' });
      if (vivo.current) setResultado(r);
    } catch (e) {
      if (vivo.current) setErro(e instanceof Error && e.message ? e.message : FRASE_FALHA);
    } finally {
      if (vivo.current) setGerando(false);
    }
  };

  return (
    <>
      <div className="flex h-10 flex-none items-center gap-2.5 bg-[#1B2A44] px-3.5 text-white">
        <DialogTitle className="text-[13px] font-semibold leading-none">Imprimir mapa</DialogTitle>
        <button type="button" onClick={aoFechar} className="ml-auto text-[#AEB9CC] hover:text-white" aria-label="Fechar">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-2 px-4 pb-3 pt-3">
        <div className="flex h-[24px] items-center gap-3">
          <span className="w-[56px] flex-none text-[11px] font-semibold text-foreground">Tamanho</span>
          <div data-testid="imprimir-tamanho">
            <Segmentado valor={tamanho} onEscolher={v => { limpar(); setTamanho(v); }} altura={24}
              opcoes={TAMANHOS.map(t => ({ valor: t, rotulo: t }))} />
          </div>
          <span className="text-[10px] text-muted-foreground">paisagem</span>
        </div>
        <div className="flex h-[24px] items-center gap-3">
          <span className="w-[56px] flex-none text-[11px] font-semibold text-foreground">Dados de</span>
          <span className="text-[11px] tabular-nums text-foreground" data-testid="imprimir-mes">{mesPorExtenso(anoMes)}</span>
          <span className="text-[10px] text-muted-foreground">o mês do Gestor</span>
        </div>
        <div className="flex h-[24px] items-center gap-3">
          <span className="w-[56px] flex-none text-[11px] font-semibold text-foreground">Imagem</span>
          <div data-testid="imprimir-imagem">
            {/* sem a chave da conta Esri a opção do satélite NÃO aparece (só "Sem satélite") */}
            <Segmentado valor={imagem} onEscolher={v => { limpar(); setImagem(v); }} altura={24}
              opcoes={temChave ? [{ valor: 'sem', rotulo: 'Sem satélite' }, { valor: 'esri', rotulo: 'Satélite Esri' }] : [{ valor: 'sem', rotulo: 'Sem satélite' }]} />
          </div>
        </div>
        <div className="h-[14px] pl-[68px] text-[10px] leading-[14px] text-muted-foreground" data-testid="imprimir-motivo-chave">
          {temChave ? (imagem === 'esri' ? 'Imagem Esri World Imagery, com a atribuição no canto do mapa.' : '') : MOTIVO_SEM_CHAVE_NO_DIALOGO}
        </div>
        <p className="h-[28px] text-[10px] leading-[14px] text-muted-foreground">
          Polígonos com nome e área, legenda, escala, norte, grade UTM e resumo de áreas; o satélite, se escolhido.
        </p>
        <div className="h-[44px] overflow-y-auto text-[11px] leading-[14px]" role="status" aria-live="polite" data-testid="imprimir-mensagem">
          {erro && <p className="text-red-600">{erro}</p>}
          {resultado && (
            <>
              <p className="break-all text-foreground">PDF baixado: {resultado.arquivo}</p>
              {resultado.motivoSemImagem && <p className="text-amber-600">{resultado.motivoSemImagem}</p>}
            </>
          )}
        </div>
        <div className="flex h-[28px] items-center justify-end">
          <Button type="button" size="sm" className="h-[28px] w-[120px] gap-1.5 px-2 text-[11px]" disabled={gerando} onClick={baixar} data-testid="imprimir-baixar">
            <Download className="h-3.5 w-3.5" /> {gerando ? 'Gerando…' : 'Baixar PDF'}
          </Button>
        </div>
      </div>
    </>
  );
}

export function ImprimirMapaDialog({ open, onOpenChange, anoMes, aoGerar, temChave = chaveEsri() !== null }: {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  anoMes: string;
  aoGerar: (o: OpcoesDoPdf) => Promise<ResultadoDoPdf>;
  /** a chave da conta Esri (sem ela o satélite fica desabilitado); o padrão lê a variável do build */
  temChave?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[1000] flex w-[420px] max-w-[95vw] flex-col gap-0 overflow-hidden rounded-lg border-0 bg-[#EEF0F3] p-0 [&>button:last-child]:hidden"
        aria-describedby={undefined} data-testid="imprimir-mapa-dialogo"
      >
        <Corpo anoMes={anoMes} temChave={temChave} aoGerar={aoGerar} aoFechar={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
