/**
 * "Parcelas" do Novo lançamento parcelado — tela A do mock `docs/mocks/fin_nfe_parcelas_pr2_mock_v2.html`
 * (FIN-NFE-PARCELAS-01 PR 2b).
 *
 * Uma linha por parcela com a NF da compra (a mesma nas N) e o boleto DAQUELA parcela, "+ Boleto" na
 * linha ou "Anexar vários boletos". Tudo em memória até o salvar.
 *
 * ⚠ VENCIMENTO E VALOR SÃO A PRÉVIA QUE O DIÁLOGO JÁ MOSTRAVA (`preverParcelas`, o espelho da
 *   `fn_parcelamento_cadastrar`), recebidos prontos. Esta tela não calcula parcela nenhuma.
 * ⚠ BOLETO É OPCIONAL: parcela sem boleto não é pendência.
 * ⚠ A31: larguras fixas (nada muda de largura quando o dado muda), cabeçalho e rodapé fixos.
 * ⚠ PARC-DOCS-TABELA-01 — `preencher` (a aba Documentos do contrato): a tabela vai até o fim do quadro; o cabeçalho fica preso em
 *   cima, o Total numa barra presa no PÉ do quadro (nunca corta nem sobe), só o corpo rola. Dentro do modal a fonte diminui em vez de
 *   rolar: na régua (linha 19px, 10px) quando todas as parcelas cabem; senão a compacta (linha 14px, 8,5px — a exceção declarada ao
 *   piso, como a tabela dos Itens da nota). A data, sempre dd/mm/aaaa, vai numa fonte menor que o resto da linha.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { formatNFNumber } from '@/lib/financeiro/documentoHelper';
import type { DocumentoPendente } from '@/lib/financeiro/documentosPendentes';
import { REGRA_ARQUIVO_DO_BOLETO } from '@/hooks/useLancamentoDocumentos';
import { aceitarArquivo } from '@/lib/arquivo/aceitarArquivo';
import { useSoltarArquivo } from '@/lib/arquivo/useSoltarArquivo';
import { NomeDoArquivo } from '@/components/financeiro-v2/NomeDoArquivo';

export interface ParcelaPrevistaLinha { numero: number; dataVencimento: string; valor: number }

/** A régua da tabela em cada densidade. `normal` é a de sempre (fora do `preencher`, a única). */
export type DensidadeDasParcelas = 'normal' | 'compacta';
const REGUA = {
  normal: {
    th: 'h-[17px] whitespace-nowrap bg-primary px-[4px] text-center text-[9.5px] font-semibold text-white',
    /* `leading-none`: o botão "+ Boleto" e o X não podem esticar a linha além dos 18px (medido: 21 sem isto). */
    td: 'h-[18px] border-b border-[#eceae4] px-[4px] py-0 text-[10px] leading-none align-middle',
    tf: 'h-[19px] border-t-2 border-[#9aa7b6] bg-[#E8E6DF] px-[4px] text-[10px] font-bold',
    data: 'text-[9px]', icone: 'h-3 w-3', linha: 19, cabecalho: 17, rodape: 21,
  },
  compacta: {
    th: 'h-[16px] whitespace-nowrap bg-primary px-[4px] text-center text-[8px] font-semibold text-white',
    td: 'h-[14px] border-b border-[#eceae4] px-[4px] py-0 text-[8.5px] leading-none align-middle',
    tf: 'h-[16px] border-t-2 border-[#9aa7b6] bg-[#E8E6DF] px-[4px] text-[8.5px] font-bold',
    data: 'text-[7.5px]', icone: 'h-2.5 w-2.5', linha: 15, cabecalho: 16, rodape: 18,
  },
} as const;
const DV = 'border-l-2 border-l-[#9aa7b6]';
/** Vencimento sempre dd/mm/aaaa (PARC-DOCS-TABELA-01). */
export const dataDaParcela = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
};
const cabeEm = (d: DensidadeDasParcelas, alturaDoQuadro: number, n: number) =>
  REGUA[d].cabecalho + n * REGUA[d].linha + REGUA[d].rodape <= alturaDoQuadro;
/** A densidade que cabe: a régua quando cabeçalho, as N linhas e o Total cabem no quadro; senão a compacta. Sem medida (0), a régua. */
export const densidadeQueCabe = (alturaDoQuadro: number, n: number): DensidadeDasParcelas =>
  alturaDoQuadro <= 0 || cabeEm('normal', alturaDoQuadro, n) ? 'normal' : 'compacta';
const valorBR = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * UMA LINHA DE PARCELA, que é também ALVO DE SOLTAR — UI-ARRASTAR-ARQUIVO-01b.
 *
 * ⚠ O ARRASTAR NÃO É DAQUI: os handlers vêm do `useSoltarArquivo` (o dono do gesto) e são espalhados no `<tr>`. A regra é a
 *   do BOLETO (PDF, JPG ou PNG); a recusa aparece na célula Boleto, como a do "+ Boleto" sempre apareceu.
 * ⚠ SOLTAR SOBRE PARCELA QUE JÁ TEM BOLETO PERGUNTA NA LINHA ("Substituir o boleto? Sim / Não"), sem modal: Sim tira o que
 *   estava e guarda o novo; Não ou Esc desfaz. Parcela sem boleto não pergunta. Nada é gravado aqui — tudo fica em memória
 *   até o Salvar do lançamento, como sempre.
 * ⚠ A LINHA TEM 18px EM TODO ESTADO: realce, recusa e pergunta cabem na célula (uma linha por registro).
 */
function LinhaDaParcela({ parcela: p, impar, total, nf, boleto: b, recusaDoClique, travado, onEscolher, onLimparRecusa, onBoleto, onTirarBoleto, onVerBoleto, densidade }: {
  onVerBoleto?: (chave: string) => void; densidade: DensidadeDasParcelas;
  parcela: ParcelaPrevistaLinha; impar: boolean; total: number; nf: string | null;
  boleto: DocumentoPendente | undefined; recusaDoClique: string | null; travado: boolean;
  onEscolher: () => void; onLimparRecusa: () => void;
  onBoleto: (parcela: number, arquivo: File) => void; onTirarBoleto: (chave: string) => void;
}) {
  const [substituir, setSubstituir] = useState<File | null>(null);
  const { sobre, recusa: recusaDoSoltar, limparRecusa, alvo } = useSoltarArquivo({
    regra: REGRA_ARQUIVO_DO_BOLETO,
    desabilitado: travado,
    onArquivos: ([f]) => {
      if (!f) return;
      onLimparRecusa();
      if (b) setSubstituir(f); else onBoleto(p.numero, f);
    },
  });
  /* Esc desfaz a pergunta SEM fechar o modal: o diálogo escuta o teclado no documento, então a tecla é tomada antes, na
     janela, e só enquanto a pergunta está na tela. */
  useEffect(() => {
    if (!substituir) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault(); e.stopPropagation();
      setSubstituir(null);
    };
    window.addEventListener('keydown', aoTeclar, true);
    return () => window.removeEventListener('keydown', aoTeclar, true);
  }, [substituir]);

  const rec = recusaDoSoltar ?? recusaDoClique;
  const { td: TD, data, icone } = REGUA[densidade];
  return (
    <tr {...alvo} data-testid="linha-parcela" data-sobre={sobre ? 'sim' : undefined}
      className={sobre ? 'bg-success/20 outline outline-1 -outline-offset-1 outline-success' : impar ? 'bg-[#FAFAF8]' : 'bg-white'}>
      <td className={`${TD} whitespace-nowrap text-center`}>{p.numero}/{total}</td>
      {/* a fonte menor da data num span: duas classes de fonte na mesma célula dependeriam da ordem do CSS */}
      <td className={`${TD} whitespace-nowrap text-center`}><span className={data} data-testid="vencimento-da-parcela">{dataDaParcela(p.dataVencimento)}</span></td>
      <td className={`${TD} whitespace-nowrap text-right`}>{valorBR(p.valor)}</td>
      <td className={`${TD} ${DV} whitespace-nowrap text-center`}>{nf ?? '—'}</td>
      {/* PR 2b-fix2 — uma linha só: a célula de nome de arquivo do fix1 (fim fixo, começo encolhe), inteiro no `title`. */}
      <td className={`${TD} overflow-hidden whitespace-nowrap`} data-testid="boleto-da-parcela"
        title={substituir ? `Substituir "${b?.arquivo?.name ?? 'o boleto'}" por "${substituir.name}"?` : rec ?? b?.arquivo?.name}>
        {substituir ? (
          <span className="flex items-center gap-2" data-testid="substituir-boleto">
            <span className="min-w-0 truncate font-medium text-amber-700">Substituir o boleto?</span>
            <button type="button" className="shrink-0 font-semibold text-primary underline underline-offset-2" data-testid="substituir-sim"
              onClick={() => { if (b) onTirarBoleto(b.chave); onBoleto(p.numero, substituir); setSubstituir(null); }}>
              Sim
            </button>
            <button type="button" className="shrink-0 text-muted-foreground underline underline-offset-2" data-testid="substituir-nao"
              onClick={() => setSubstituir(null)}>
              Não
            </button>
          </span>
        ) : rec ? <span className="text-destructive">{rec}</span>
          : b?.arquivo ? (onVerBoleto
            ? <button type="button" className="max-w-full text-left text-primary hover:underline" data-testid={`ver-boleto-${p.numero}`}
                title={`Abrir ${b.arquivo.name}`} onClick={() => onVerBoleto(b.chave)}><NomeDoArquivo nome={b.arquivo.name} /></button>
            : <NomeDoArquivo nome={b.arquivo.name} />)
            : <span className="text-muted-foreground">sem boleto</span>}
      </td>
      <td className={`${TD} text-center whitespace-nowrap`}>
        {travado ? null : b ? (
          <button type="button" aria-label={`Tirar boleto da parcela ${p.numero}`} title="Tirar boleto"
            onClick={() => onTirarBoleto(b.chave)} className="text-muted-foreground hover:text-destructive">
            <X className={icone} />
          </button>
        ) : (
          <button type="button" onClick={() => { limparRecusa(); onEscolher(); }} data-testid={`mais-boleto-${p.numero}`}
            className="inline-flex items-center gap-0.5 text-primary hover:underline">
            <Plus className={icone} /> Boleto
          </button>
        )}
      </td>
    </tr>
  );
}

/** Por que a grade de boletos está vazia: as parcelas saem do valor e do vencimento do lançamento (ou da lista de parcelas livres). */
export const MOTIVO_SEM_PARCELAS = 'Informe o valor e o vencimento do lançamento para listar as parcelas e anexar os boletos.';

export function ParcelasDaCompra({ parcelas, notaFiscal, qtdNotas, boletos, onBoleto, onTirarBoleto, onAnexarVarios, travado, foraDoPlano, onVerBoleto, preencher, aviso }: {
  parcelas: readonly ParcelaPrevistaLinha[];
  /** Número da NF da compra pendente (a primeira), ou null. */
  notaFiscal: string | null;
  qtdNotas: number;
  /** Boletos pendentes, um por parcela. */
  boletos: readonly DocumentoPendente[];
  onBoleto: (parcela: number, arquivo: File) => void;
  onTirarBoleto: (chave: string) => void;
  onAnexarVarios: () => void;
  travado?: boolean;
  /** Boletos de parcela que não existe mais no plano (o operador baixou o número de parcelas). */
  foraDoPlano: readonly DocumentoPendente[];
  /** Só no CONTRATO (PARC-LIVRES-01 passo 6), onde o boleto já está gravado: o nome do arquivo abre o boleto. */
  onVerBoleto?: (chave: string) => void;
  /** A tabela ocupa a altura do pai: Total preso no pé do quadro, só o corpo rola, e a fonte diminui antes de rolar. */
  preencher?: boolean;
  /** O recado de quem hospeda (gravou, falhou, "tirar o boleto?") no LUGAR FIXO da dica da linha do título — sem linha própria. */
  aviso?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [alvo, setAlvo] = useState<number | null>(null);
  const [recusa, setRecusa] = useState<{ parcela: number; msg: string } | null>(null);

  const porParcela = new Map(boletos.map(b => [b.parcela, b]));
  const total = parcelas.reduce((acc, p) => acc + p.valor, 0);
  const comBoleto = parcelas.filter(p => porParcela.has(p.numero)).length;
  const nf = notaFiscal ? (formatNFNumber(notaFiscal) || notaFiscal) : null;
  const n = parcelas.length;

  const escolher = (parcela: number) => { setAlvo(parcela); setRecusa(null); inputRef.current?.click(); };

  /* a altura do quadro decide a densidade (só no `preencher`): medida antes de pintar e a cada mudança de tamanho da janela */
  const quadroRef = useRef<HTMLDivElement>(null);
  const [alturaDoQuadro, setAlturaDoQuadro] = useState(0);
  useLayoutEffect(() => {
    const el = quadroRef.current;
    if (!preencher || !el) return;
    const medir = () => setAlturaDoQuadro(el.clientHeight);
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [preencher]);
  const densidade: DensidadeDasParcelas = preencher ? densidadeQueCabe(alturaDoQuadro, n) : 'normal';
  const { th: TH_DA_REGUA, td: TD, tf: TF } = REGUA[densidade];
  /* o cabeçalho só prende quando o corpo rola (no `preencher`, quando nem a compacta cabe; fora dele, sempre, como era) */
  const rola = !preencher || alturaDoQuadro <= 0 || !cabeEm(densidade, alturaDoQuadro, n);
  const TH = rola ? `sticky top-0 z-10 ${TH_DA_REGUA}` : TH_DA_REGUA;
  /* fora do `preencher`, o Total segue preso no fim da tabela que rola (como sempre) */
  const TF_DA_TABELA = preencher ? TF : `sticky bottom-0 z-10 ${TF}`;
  const colunas = (
    <colgroup>
      <col style={{ width: 64 }} /><col style={{ width: 82 }} /><col style={{ width: 100 }} />
      <col style={{ width: 96 }} /><col /><col style={{ width: 78 }} />
    </colgroup>
  );
  const corpo = (
    <tbody>
      {n === 0 && (
        <tr>
          <td colSpan={6} className={`${TD} text-center text-muted-foreground`} data-testid="sem-parcelas-para-boleto">{MOTIVO_SEM_PARCELAS}</td>
        </tr>
      )}
      {parcelas.map((p, k) => (
        <LinhaDaParcela key={p.numero} parcela={p} impar={k % 2 === 1} total={n} nf={nf} boleto={porParcela.get(p.numero)}
          recusaDoClique={recusa?.parcela === p.numero ? recusa.msg : null} travado={!!travado} densidade={densidade}
          onEscolher={() => escolher(p.numero)} onLimparRecusa={() => setRecusa(null)}
          onBoleto={onBoleto} onTirarBoleto={onTirarBoleto} onVerBoleto={onVerBoleto} />
      ))}
    </tbody>
  );
  const cabecalho = (
    <thead>
      <tr>
        <th className={TH}>Parcela</th>
        <th className={TH}>Vencimento</th>
        <th className={TH}>Valor R$</th>
        <th className={`${TH} ${DV}`}>Nota fiscal</th>
        <th className={TH}>Boleto</th>
        <th className={TH}>Ação</th>
      </tr>
    </thead>
  );
  const rodape = (
    <tfoot>
      <tr>
        <td className={`${TF_DA_TABELA} text-center`}>Total</td>
        <td className={`${TF_DA_TABELA} text-center whitespace-nowrap`}>{n} parcelas</td>
        <td className={`${TF_DA_TABELA} text-right whitespace-nowrap`} data-testid="total-das-parcelas-da-compra">{valorBR(total)}</td>
        <td className={`${TF_DA_TABELA} ${DV} text-center whitespace-nowrap`}>{qtdNotas === 0 ? 'sem nota' : `${qtdNotas} ${qtdNotas === 1 ? 'nota' : 'notas'}`}</td>
        <td className={`${TF_DA_TABELA} whitespace-nowrap`} data-testid="com-boleto">{comBoleto} de {n} com boleto</td>
        <td className={TF_DA_TABELA} />
      </tr>
    </tfoot>
  );
  const TABELA = 'w-full table-fixed border-separate border-spacing-0 tabular-nums';

  return (
    <div className={preencher ? 'flex h-full min-h-0 flex-col gap-1.5' : 'space-y-1.5'} data-testid="parcelas-da-compra">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 text-[11px] font-semibold text-foreground">
          <span className="shrink-0">Parcelas</span>
          {aviso ?? <span className="min-w-0 truncate font-normal text-muted-foreground">· 1 boleto por parcela · agora ou depois</span>}
        </span>
        {/* opção que não vale fica APAGADA com o motivo (fechamento D): sem parcela listada não há onde pôr boleto */}
        <Button type="button" variant="outline" className="h-[22px] shrink-0 px-[9px] text-[10px]" disabled={travado || n === 0} onClick={onAnexarVarios}
          title={n === 0 ? MOTIVO_SEM_PARCELAS : undefined} data-testid="abrir-anexar-varios">
          Anexar vários boletos
        </Button>
      </div>
      <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" data-testid="input-boleto-linha"
        onChange={e => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = '';
          if (!f || alvo == null) return;
          /* A regra é a do BOLETO (PDF, JPG ou PNG), julgada pelo dono do aceite — a mesma do soltar na linha. */
          const aceite = aceitarArquivo([f], REGRA_ARQUIVO_DO_BOLETO);
          if (aceite.ok === false) { setRecusa({ parcela: alvo, msg: aceite.motivo }); return; }
          onBoleto(alvo, aceite.arquivos[0]);
        }} />
      {preencher ? (
        /* o quadro: o corpo rola (o cabeçalho preso nele) e o Total é uma tabela à parte no pé, com as MESMAS colunas; os dois reservam
           a calha da barra de rolagem (`scrollbar-gutter`), para as colunas do Total ficarem debaixo das do corpo */
        <div ref={quadroRef} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-[#E0E2E6]" data-testid="quadro-das-parcelas"
          data-densidade={densidade}>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]" data-testid="corpo-das-parcelas">
            <table className={TABELA}>{colunas}{cabecalho}{corpo}</table>
          </div>
          <div className="shrink-0 overflow-hidden [scrollbar-gutter:stable]">
            <table className={TABELA}>{colunas}{rodape}</table>
          </div>
        </div>
      ) : (
      <div className="max-h-[260px] overflow-auto rounded border border-[#E0E2E6]">
        <table className={TABELA}>{colunas}{cabecalho}{corpo}{rodape}</table>
      </div>
      )}
      {foraDoPlano.length > 0 && (
        <p className="shrink-0 text-[10px] text-destructive" data-testid="boleto-fora-do-plano">
          Boleto de parcela que não existe mais no plano de {n}: {foraDoPlano.map(b => `parcela ${b.parcela}`).join(', ')} — tire-o
          {!travado && foraDoPlano.map(b => (
            <button key={b.chave} type="button" className="ml-1 underline" onClick={() => onTirarBoleto(b.chave)}>tirar {b.parcela}</button>
          ))}
          {' '}ou volte o número de parcelas.
        </p>
      )}
    </div>
  );
}
