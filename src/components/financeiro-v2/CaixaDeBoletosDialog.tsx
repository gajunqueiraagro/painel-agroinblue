/**
 * BOLETO-DDA-API-01 · D1c (a) — a CAIXA DE BOLETOS (mock v3 aprovado 14/11, "tudo como recomendado").
 *
 * Soltar os PDFs → cada um é LIDO no navegador (linha digitável com DV, beneficiário/pagador pela posição — D1b) → PRÉVIA do banco
 * (`fn_boleto_entrar` com `p_simular`: o que já está no sistema, os candidatos, os avisos) → "Pôr N na caixa" grava os marcados e sobe
 * o PDF. As abas Na caixa · Sem par · Todos mostram o gravado com a SITUAÇÃO À VISTA lida de hoje.
 *
 * ⚠ NESTA FATIA NADA SE LIGA: ligar/desligar/substituir/marcar é a fatia (b). Daqui, nenhum lançamento muda.
 * ⚠ MODAL DE TAMANHO FIXO, UM SCROLLPORT (a tabela), a área de soltar e o rodapé no MESMO lugar em todas as abas (nada se desloca).
 * ⚠ SENHA: a linha pede a senha (sugestões = 5 primeiros dígitos dos titulares); ela não é guardada.
 * ⚠ RÉGUA DA CASA: cabeçalho 22/9,5 navy preso, linha 19/10, data dd/mm/aaaa, valor à direita; texto em tabela corta com "…" e o
 *   inteiro no `title`; número/valor/data nunca cortam.
 */
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import { TH_REGUA, TD_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TextoReservado } from '@/components/ui/regua-tabela';
import { TAMANHO_MAXIMO } from '@/hooks/useLancamentoDocumentos';
import { fraseDeFormatoNaoAceito, type RegraDeAceite } from '@/lib/arquivo/aceitarArquivo';
import { cn } from '@/lib/utils';
import { useCaixaDeBoletos, type ArquivoChegando, type LerArquivoDeBoleto } from '@/hooks/useCaixaDeBoletos';
import type { CaixaApi, ItemDaCaixa } from '@/lib/financeiro/boleto/caixaApi';
import {
  ABAS_DA_CAIXA, achadoDaPrevia, dataBR, fraseDoAviso, itensDaAba, rotuloDaSituacao, selosDosAvisos, situacaoAVista, valorBR,
  type AbaDaCaixa, type Selo, type Tom,
} from '@/lib/financeiro/boleto/caixaDeBoletos';

/** Só PDF: o leitor da D1b lê PDF (a foto do boleto é outra porta). Vários de uma vez. */
export const REGRA_DA_CAIXA: RegraDeAceite = {
  tipos: ['pdf'], varios: true, tamanhoMaxBytes: TAMANHO_MAXIMO, frases: { tipo: fraseDeFormatoNaoAceito(['pdf']) },
};

const TOM: Record<Tom, string> = {
  ok: 'bg-green-100 text-green-800', ambar: 'bg-amber-100 text-amber-800', vermelho: 'bg-red-100 text-red-800',
  cinza: 'bg-gray-200 text-gray-700', azul: 'bg-blue-100 text-blue-800',
};
function SeloDaCaixa({ s }: { s: Selo }) {
  return <span className={cn('mr-1 inline-block shrink-0 rounded-[3px] px-1 text-[9.5px] font-semibold leading-[15px]', TOM[s.tom])}>{s.texto}</span>;
}
const TH = cn(TH_REGUA, 'sticky top-0 z-10 bg-primary text-left');
const TH_NUM = cn(TH, 'text-right');
const LINHA = 'h-[19px] border-b border-border/40';

function CelulaDaSenha({ item, sugestoes, aoTentar }: { item: ArquivoChegando; sugestoes: string[]; aoTentar: (senha: string) => void }) {
  const [senha, setSenha] = useState('');
  return (
    <span className="flex items-center gap-1">
      <Input value={senha} onChange={(e) => setSenha(e.target.value)} type="password" autoComplete="off" placeholder="senha"
        onKeyDown={(e) => { if (e.key === 'Enter') aoTentar(senha); }}
        className="h-[17px] w-[64px] px-1 text-[10px]" aria-label={`senha de ${item.arquivo.name}`} data-testid="senha-do-boleto" />
      {sugestoes.slice(0, 2).map((s) => (
        <button key={s} type="button" className="rounded border px-1 text-[9.5px] leading-[15px] tabular-nums hover:bg-muted"
          title="sugestão: os 5 primeiros dígitos do CPF/CNPJ de um titular" onClick={() => { setSenha(s); aoTentar(s); }}
          data-testid="sugestao-de-senha">{s}</button>
      ))}
      <button type="button" className="text-[9.5px] text-primary hover:underline" onClick={() => aoTentar(senha)}>abrir</button>
    </span>
  );
}

function LinhaChegando({ item, sugestoes, aoAlternar, aoTirar, aoTentarSenha }: {
  item: ArquivoChegando; sugestoes: string[]; aoAlternar: () => void; aoTirar: () => void; aoTentarSenha: (s: string) => void;
}) {
  const r = item.resposta;
  const b = r?.ok === true ? r.boleto : null;
  const achado = r ? achadoDaPrevia(r) : null;
  const pedeSenha = item.estado === 'senha' || item.estado === 'senha_errada';
  const avisos = r?.ok === true ? [...r.avisos, ...r.situacao.avisos] : [];
  const frase = item.frase ?? (item.estado === 'entrou' ? 'na caixa' : item.estado === 'lendo' ? 'lendo…' : item.estado === 'gravando' ? 'gravando…' : null);
  const titulo = [achado?.texto, ...avisos.map(fraseDoAviso), item.frase].filter(Boolean).join(' · ');
  return (
    <tr className={cn(LINHA, item.estado === 'recusado' || item.estado === 'erro' ? 'bg-red-50' : item.marcado && 'bg-primary/5')} data-testid="boleto-chegando">
      <td className={cn(TD_REGUA, 'px-1')}>
        <Checkbox checked={item.marcado} disabled={!achado?.podeEntrar || item.repetidoNaLeva || item.estado !== 'previa'}
          onCheckedChange={aoAlternar} className="h-3 w-3" aria-label={`pôr ${item.arquivo.name} na caixa`} />
      </td>
      <td className={TD_REGUA_TEXTO} title={item.arquivo.name}>{item.arquivo.name}</td>
      <td className={TD_REGUA_TEXTO} title={b ? `${b.beneficiarioNome ?? '—'}${b.beneficiarioDocumento ? ` · ${b.beneficiarioDocumento}` : ' · documento: confira'}` : undefined}>
        {b?.beneficiarioNome ?? '—'}
      </td>
      <td className={cn(TD_REGUA_NUM, 'text-left')}>{dataBR(b?.vencimento)}</td>
      <td className={TD_REGUA_NUM}>{valorBR(b?.valor)}</td>
      <td className={TD_REGUA} title={titulo || undefined}>
        <span className="flex min-w-0 items-center">
          {item.repetidoNaLeva && <SeloDaCaixa s={{ texto: 'repetido nesta leva', tom: 'ambar' }} />}
          {pedeSenha && <SeloDaCaixa s={{ texto: item.estado === 'senha' ? 'protegido por senha' : 'senha não abriu', tom: 'vermelho' }} />}
          {achado && !pedeSenha && achado.selos.map((s) => <SeloDaCaixa key={s.texto} s={s} />)}
          <span className="min-w-0 truncate text-muted-foreground">{pedeSenha ? 'digite a senha para ler (ela não é guardada)' : frase ?? achado?.texto ?? ''}</span>
        </span>
      </td>
      <td className={TD_REGUA}>
        {pedeSenha
          ? <CelulaDaSenha item={item} sugestoes={sugestoes} aoTentar={aoTentarSenha} />
          : item.estado !== 'gravando' && item.estado !== 'entrou' && (
            <button type="button" className="text-[9.5px] text-muted-foreground hover:underline" onClick={aoTirar} data-testid="tirar-boleto">tirar</button>
          )}
      </td>
    </tr>
  );
}

function LinhaGravada({ i }: { i: ItemDaCaixa }) {
  const b = i.boleto;
  const l = i.situacao.lancamentos;
  const texto = l.length ? l.map((x) => `${x.descricao ?? '—'} · ${situacaoAVista(x)}`).join(' + ') : '—';
  const titulo = [texto, ...i.situacao.avisos.map(fraseDoAviso)].join(' · ');
  return (
    <tr className={LINHA} data-testid="boleto-gravado">
      <td className={TD_REGUA_TEXTO} title={rotuloDaSituacao(b.situacao)}>{rotuloDaSituacao(b.situacao)}</td>
      <td className={TD_REGUA_TEXTO} title={`${b.beneficiarioNome ?? '—'}${b.beneficiarioDocumento ? ` · ${b.beneficiarioDocumento}` : ''}`}>{b.beneficiarioNome ?? '—'}</td>
      <td className={cn(TD_REGUA_NUM, 'text-left')}>{dataBR(b.vencimento)}</td>
      <td className={TD_REGUA_NUM}>{valorBR(b.valor)}</td>
      <td className={TD_REGUA} title={titulo}>
        <span className="flex min-w-0 items-center">
          {selosDosAvisos(i.situacao.avisos).map((s) => <SeloDaCaixa key={s.texto} s={s} />)}
          <span className="min-w-0 truncate">{texto}</span>
        </span>
      </td>
      <td className={cn(TD_REGUA_NUM, 'text-left')}>{dataBR(b.criadoEm)}</td>
    </tr>
  );
}

export function CaixaDeBoletosDialog({ clienteId, clienteNome, aoFechar, api, ler }: {
  clienteId: string; clienteNome?: string | null; aoFechar: () => void;
  /** a bancada sintética injeta a API e o leitor; a tela de verdade usa os do banco e do pdfjs */
  api?: CaixaApi; ler?: LerArquivoDeBoleto;
}) {
  const caixa = useCaixaDeBoletos(clienteId, { api, ler });
  const [aba, setAba] = useState<AbaDaCaixa>('chegando');
  const c = caixa.lista?.contadores;
  const contagem: Record<AbaDaCaixa, number | null> = {
    chegando: caixa.chegando.length, na_caixa: c ? c.novo : null, sem_par: c ? c.sem_par : null,
    todos: c ? c.novo + c.sem_par + c.ligado + c.descartado + c.substituido : null,
  };
  const marcados = caixa.chegando.filter((x) => x.marcado).length;
  const lendo = caixa.chegando.some((x) => x.estado === 'lendo');
  const motivo = caixa.gravando ? 'gravando…' : lendo ? 'esperando a leitura terminar' : marcados === 0 ? 'nada marcado para pôr na caixa' : null;
  const gravados = itensDaAba(caixa.lista, aba);

  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[min(540px,calc(100vh-16px))] w-[min(1100px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button]:top-2.5 [&>button]:text-primary-foreground"
        data-testid="caixa-de-boletos">
        <div className="flex h-[34px] shrink-0 items-center justify-between bg-primary px-3 pr-10 text-primary-foreground">
          <DialogTitle className="min-w-0 truncate text-[11px] font-semibold" title={clienteNome ?? undefined}>Boletos{clienteNome ? ` · ${clienteNome}` : ''}</DialogTitle>
          <DialogDescription className="shrink-0 text-[10px] text-primary-foreground/85">
            <TextoReservado texto={`${caixa.chegando.length} lido(s) · nada gravado até "Pôr na caixa"`} reserva={'999 lido(s) · nada gravado até "Pôr na caixa"'} alinhar="direita" />
          </DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 bg-muted p-2">
          <div className="flex h-[26px] shrink-0 items-center gap-2">
            <Segmentado valor={aba} onEscolher={setAba} fonte={10}
              opcoes={ABAS_DA_CAIXA.map((a) => ({
                valor: a.valor,
                rotulo: <span>{a.rotulo} <TextoReservado texto={contagem[a.valor] == null ? '—' : String(contagem[a.valor])} reserva="999" /></span>,
              }))} />
            <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground" title="ligar o boleto ao lançamento vem na próxima fatia; daqui nenhum lançamento muda">
              {caixa.erroDaLista ?? 'a linha digitável dá valor e vencimento (dígito conferido); o texto dá beneficiário e pagador'}
            </span>
          </div>
          <AreaDeArquivo modo="lote" regra={REGRA_DA_CAIXA} className="h-8 shrink-0" testId="soltar-na-caixa" inputTestId="input-da-caixa"
            convite="Clique ou arraste vários boletos em PDF" rotuloDoBotao="Escolher arquivos"
            onArquivos={(_a, vereditos) => { caixa.receber(vereditos); setAba('chegando'); }} />
          <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-card" data-testid="quadro-da-caixa" data-desloca-livre>
            {aba === 'chegando' ? (
              <table className="w-full min-w-[980px] table-fixed border-collapse">
                <colgroup><col style={{ width: 24 }} /><col style={{ width: 150 }} /><col style={{ width: 170 }} /><col style={{ width: 76 }} /><col style={{ width: 82 }} /><col /><col style={{ width: 176 }} /></colgroup>
                <thead><tr className="h-[22px]">
                  <th className={TH} /><th className={TH}>Arquivo</th><th className={TH}>Beneficiário</th><th className={TH}>Venc.</th>
                  <th className={TH_NUM}>Valor</th><th className={TH}>Achado no sistema</th><th className={TH} />
                </tr></thead>
                <tbody>
                  {caixa.chegando.map((x) => (
                    <LinhaChegando key={x.chave} item={x} sugestoes={caixa.sugestoes} aoAlternar={() => caixa.alternar(x.chave)}
                      aoTirar={() => caixa.tirar(x.chave)} aoTentarSenha={(s) => caixa.tentarSenha(x.chave, s)} />
                  ))}
                  {caixa.chegando.length === 0 && (
                    <tr className={LINHA}><td colSpan={7} className={cn(TD_REGUA, 'py-4 text-center text-muted-foreground')}>Solte os PDFs dos boletos acima.</td></tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[980px] table-fixed border-collapse">
                <colgroup><col style={{ width: 86 }} /><col style={{ width: 190 }} /><col style={{ width: 76 }} /><col style={{ width: 82 }} /><col /><col style={{ width: 76 }} /></colgroup>
                <thead><tr className="h-[22px]">
                  <th className={TH}>Situação</th><th className={TH}>Beneficiário</th><th className={TH}>Venc.</th><th className={TH_NUM}>Valor</th>
                  <th className={TH}>Ligado a · situação à vista</th><th className={TH}>Entrou em</th>
                </tr></thead>
                <tbody>
                  {gravados.map((i) => <LinhaGravada key={i.boleto.id ?? i.boleto.codigoBarras} i={i} />)}
                  {gravados.length === 0 && (
                    <tr className={LINHA}><td colSpan={6} className={cn(TD_REGUA, 'py-4 text-center text-muted-foreground')}>
                      {caixa.lista ? 'Nenhum boleto aqui.' : 'Carregando…'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div className="flex h-[34px] shrink-0 items-center gap-2 border-t bg-card px-3">
          <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground" data-testid="motivo-da-caixa" title={motivo ?? undefined}>{motivo ?? ''}</span>
          <Button variant="outline" size="sm" className="h-[24px] text-[10px]" onClick={aoFechar}>Fechar</Button>
          <Button size="sm" className="h-[24px] bg-[#E7C873] text-[10px] text-foreground hover:bg-[#D9B95F]" disabled={!!motivo}
            title={motivo ?? undefined} onClick={() => void caixa.porNaCaixa()} data-testid="por-na-caixa">
            Pôr <TextoReservado texto={String(marcados)} reserva="99" /> na caixa
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
