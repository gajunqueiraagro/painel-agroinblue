/**
 * TRILHA DE AUDITORIA — a variante de linha única do A18, em um lugar só.
 *
 * Nasceu dentro de `AbaAuditoriaOC` (PR-OC-AUDITORIA-01) e saiu de lá quando o modal de
 * lançamento passou a precisar da mesma trilha (PR-FIN-AUDIT-01). É a lição do A19 aplicada
 * a outra superfície: a segunda cópia de um desenho aprovado é onde as duas começam a
 * divergir — uma ganha o `py-0.5`, a outra não, e ninguém percebe até verem lado a lado.
 *
 * ⚠ ESTE ARQUIVO NÃO SABE O QUE É UM EVENTO. Ele recebe frases prontas e blocos prontos; a
 * tradução de evento em português mora no módulo de cada domínio (`frasearEvento` para a OC,
 * `auditoriaLancamento` para o financeiro). Misturar as duas coisas aqui traria o vocabulário
 * da compra para dentro de um componente de `ui/`.
 *
 * ⚠ AUDITORIA SEM RASTREABILIDADE É HISTÓRIA BONITA, NÃO PROVA. O detalhe expandido carrega
 * os identificadores e os payloads inteiros, copiáveis — é o único lugar da tela onde um
 * UUID pode aparecer.
 */
import { useState } from 'react';
import { Copy, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

/** ⚠ PRIMEIRO NOME, decisão do Gabriel: a coluna é estreita e "Gabriel" identifica tão
    bem quanto "Gabriel Junqueira" numa lista de cinco pessoas. Sem cor por pessoa — com
    cinco usuários viraria arco-íris, e a coluna alinhada já resolve a leitura. */
export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0];

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const chaveDia = (iso: string) => new Date(iso).toLocaleDateString('sv-SE');   // YYYY-MM-DD local

function rotuloDia(chave: string): string {
  const hoje = new Date().toLocaleDateString('sv-SE');
  if (chave === hoje) return 'Hoje';
  const ontem = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE');
  if (chave === ontem) return 'Ontem';
  const [a, m, d] = chave.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

const copiar = (texto: string, oque: string) => {
  void navigator.clipboard.writeText(texto)
    .then(() => toast.success(`${oque} copiado.`))
    .catch(() => toast.error('Não foi possível copiar.'));
};

/** Bloco tecnico do clique: rotulo + json, com o botao de copiar do lado. */
function BlocoTecnico({ rotulo, valor }: { rotulo: string; valor: unknown }) {
  if (valor == null || (typeof valor === 'object' && Object.keys(valor as object).length === 0)) return null;
  const json = JSON.stringify(valor, null, 2);
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{rotulo}</span>
        <Button type="button" variant="ghost" size="icon" className="h-4 w-4"
          title={`Copiar ${rotulo}`} aria-label={`Copiar ${rotulo}`}
          onClick={() => copiar(json, rotulo)}><Copy className="h-2.5 w-2.5" /></Button>
      </div>
      <pre className="mt-0.5 max-h-48 overflow-auto rounded border bg-background px-2 py-1 text-[10px] leading-tight">{json}</pre>
    </div>
  );
}

/** Um evento já traduzido: a trilha desenha, não interpreta. */
export interface EventoTrilha {
  id: string;
  /** ISO. Decide a hora da linha e a faixa do dia. */
  quando: string;
  /** Primeiro nome, ou `null` quando não há como saber quem foi. */
  autor: string | null;
  /** Identificador do autor — separa uma pessoa da outra e vai no detalhe, copiável. */
  autorId?: string | null;
  frase: string;
  detalhe?: string | null;
  /** Pares curtos do detalhe (ação, origem, quando). O valor pode ser copiável. */
  chips?: { rotulo: string; valor: string; copiavel?: boolean }[];
  /** Payloads do detalhe, um `<pre>` cada. */
  blocos?: { rotulo: string; valor: unknown }[];
}

interface Props {
  eventos: readonly EventoTrilha[];
  /** O que dizer quando não há nada — cada tela tem a sua frase. */
  vazio: string;
}

export function TrilhaAuditoria({ eventos, vazio }: Props) {
  const [abertoId, setAbertoId] = useState<string | null>(null);

  /* Agrupa por DIA preservando a ordem que veio do banco (mais recente primeiro). */
  const dias: [string, EventoTrilha[]][] = [];
  const indice = new Map<string, EventoTrilha[]>();
  for (const e of eventos) {
    const k = chaveDia(e.quando);
    const lista = indice.get(k);
    if (lista) lista.push(e);
    else { const nova = [e]; indice.set(k, nova); dias.push([k, nova]); }
  }

  /* ⚠ COLUNA DO AUTOR SÓ EXISTE QUANDO DISTINGUE. Com um autor só, ela repetiria o mesmo
     nome em todas as linhas. O cabeçalho da tela já diz quem é, uma vez. Dois ou mais
     autores e a coluna volta, porque aí ela separa uma linha da outra. */
  const mostrarAutor = new Set(eventos.map((e) => e.autorId).filter(Boolean)).size > 1;

  return (
    <div className="rounded-md border overflow-hidden">
      {eventos.length === 0 && (
        <div className="px-3.5 py-4 text-center text-[10px] text-muted-foreground">{vazio}</div>
      )}
      {dias.map(([dia, doDia]) => (
        <div key={dia}>
          <div className="bg-muted/40 px-3.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {rotuloDia(dia)}
          </div>
          {doDia.map((e) => {
            const aberto = abertoId === e.id;
            return (
              <div key={e.id} className="border-t first:border-t-0">
                {/* ⚠ A LINHA INTEIRA E' O BOTAO. Alvo de 22px ja e' pequeno; exigir
                    mira num icone tornaria o detalhe tecnico inalcancavel na pratica. */}
                <button type="button" onClick={() => setAbertoId(aberto ? null : e.id)}
                  /* ⚠ MAIS COMPRIMIDA QUE AS IRMAS, e por um motivo: esta linha nao
                     tem valor a direita nem pilula de estado — so hora e frase —, entao
                     aguenta o que uma linha de documento nao aguentaria. `py-0.5` com
                     `leading-[1.4]` da ~19px por evento contra ~26px antes: cabem cerca
                     de sete linhas a mais por tela, que e' o ponto de uma trilha. */
                  className={`flex w-full items-baseline gap-2 px-3.5 py-0.5 text-left leading-[1.4] hover:bg-muted/30 ${aberto ? 'bg-muted/30' : ''}`}>
                  <span className="w-[34px] shrink-0 text-[10px] tabular-nums text-muted-foreground">{hora(e.quando)}</span>
                  {mostrarAutor && (
                    <span className="w-[62px] shrink-0 truncate text-[10px] text-muted-foreground"
                      title={e.autor ?? 'Autor não identificado nesta sessão'}>{e.autor ?? '—'}</span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
                    {e.frase}
                    {e.detalhe && <span className="ml-1.5 text-muted-foreground">{e.detalhe}</span>}
                  </span>
                  <ChevronDown className={`h-3 w-3 shrink-0 text-muted-foreground/50 transition-transform ${aberto ? 'rotate-180' : ''}`} />
                </button>

                {aberto && (
                  <div className="space-y-1.5 border-t bg-muted/10 px-3.5 py-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="font-semibold uppercase tracking-wide">evento</span>
                        <code className="rounded bg-background px-1 py-0.5">{e.id}</code>
                        <Button type="button" variant="ghost" size="icon" className="h-4 w-4"
                          title="Copiar id do evento" aria-label="Copiar id do evento"
                          onClick={() => copiar(e.id, 'Id do evento')}><Copy className="h-2.5 w-2.5" /></Button>
                      </span>
                      {(e.chips ?? []).map((c) => (
                        <span key={c.rotulo} className="flex items-center gap-1">
                          <span className="font-semibold uppercase tracking-wide">{c.rotulo}</span>
                          {c.copiavel
                            ? <><code className="rounded bg-background px-1 py-0.5">{c.valor}</code>
                                <Button type="button" variant="ghost" size="icon" className="h-4 w-4"
                                  title={`Copiar ${c.rotulo}`} aria-label={`Copiar ${c.rotulo}`}
                                  onClick={() => copiar(c.valor, c.rotulo)}><Copy className="h-2.5 w-2.5" /></Button></>
                            : <span>{c.valor}</span>}
                        </span>
                      ))}
                    </div>
                    {(e.blocos ?? []).length > 0 && (
                      <div className="grid gap-1.5 lg:grid-cols-3">
                        {(e.blocos ?? []).map((b) => <BlocoTecnico key={b.rotulo} rotulo={b.rotulo} valor={b.valor} />)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
