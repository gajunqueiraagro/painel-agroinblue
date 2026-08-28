import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';

/* CAMPO MONETARIO DO SISTEMA (padrao A19 de docs/PADROES-UI.md).
   ⚠ NAO NASCEU AQUI: veio INTEIRO de src/components/compra/AbaCompromissosOC.tsx, onde
   era funcao LOCAL e nao exportada — por isso o formulario de documentos exibia
   `106425` cru: nao dava para reusar o que estava trancado dentro de outro componente.
   Movido byte a byte, sem uma virgula de mudanca de comportamento; AbaCompromissosOC
   passou a importar daqui e nao guarda mais copia.
   ⚠ NAO ESCREVER UM SEGUNDO. Qualquer entrada de dinheiro no sistema usa este campo. */

export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// FIX-01b — parser monetário NATURAL: não força centavos durante a digitação. Retorna null p/ vazio/inválido
//   (nunca NaN). Regra de separadores: último separador = decimal quando há '.' e ','; só ',' = decimal;
//   só '.' = decimal se 1-2 dígitos após, senão milhar (ex.: 10.000). Arredonda só na normalização final.
export function parseMoeda(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = raw.replace(/[^\d.,]/g, '');           // remove R$, espaços, letras — mantém dígitos . ,
  if (s === '') return null;
  const hasDot = s.includes('.'), hasComma = s.includes(',');
  let intRaw = '', decRaw = '';
  if (hasDot && hasComma) {
    const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    intRaw = s.slice(0, last).replace(/[.,]/g, '');
    decRaw = s.slice(last + 1).replace(/[.,]/g, '');
  } else if (hasComma) {
    const i = s.lastIndexOf(',');
    intRaw = s.slice(0, i).replace(/,/g, '');
    decRaw = s.slice(i + 1).replace(/,/g, '');
  } else if (hasDot) {
    const i = s.lastIndexOf('.');
    const dec = s.slice(i + 1);
    if (dec.length === 1 || dec.length === 2) { intRaw = s.slice(0, i).replace(/\./g, ''); decRaw = dec; }
    else { intRaw = s.replace(/\./g, ''); decRaw = ''; }
  } else {
    intRaw = s;
  }
  if (intRaw === '' && decRaw === '') return null;
  const n = Number(`${intRaw === '' ? '0' : intRaw}.${decRaw === '' ? '0' : decRaw}`);
  return Number.isFinite(n) ? n : null;
}

// Campo monetário: texto de edição livre enquanto foca; normaliza p/ BRL (2 casas) no blur; emite o número.
/* ⚠ `disabled` e' a UNICA linha ACRESCENTADA depois do move — o campo original nao a
   tinha porque nenhum chamador dele precisava. E' opcional e, quando omitida, chega ao
   <Input> como `undefined`: AbaCompromissosOC nao muda em nada. */
export function CampoMoeda({ valor, onChange, placeholder, className, disabled }: {
  valor: number | null; onChange: (n: number | null) => void; placeholder?: string; className?: string; disabled?: boolean;
}) {
  const [texto, setTexto] = useState(valor != null ? brl(valor) : '');
  const [editando, setEditando] = useState(false);
  useEffect(() => { if (!editando) setTexto(valor != null ? brl(valor) : ''); }, [valor, editando]);
  return (
    <Input
      inputMode="decimal" value={texto} placeholder={placeholder} className={className} disabled={disabled}
      onFocus={() => setEditando(true)}
      onChange={(e) => { setTexto(e.target.value); onChange(parseMoeda(e.target.value)); }}
      onBlur={() => {
        setEditando(false);
        const n = parseMoeda(texto);
        const r = n != null ? round2(n) : null;
        onChange(r);
        setTexto(r != null ? brl(r) : '');
      }}
    />
  );
}
