import { useState, useCallback, useEffect } from 'react';

/** Format integer with Brazilian thousand separator (1.000, 12.500) */
function formatIntBR(value: string): string {
  const num = parseInt(value.replace(/\D/g, ''), 10);
  if (isNaN(num) || num === 0) return '';
  return num.toLocaleString('pt-BR');
}

/** Format decimal with Brazilian format and fixed decimals (275,50 / 1.250,75) */
function formatDecBR(value: string, decimals: number): string {
  const num = parseDecimalInput(value);
  if (num === undefined) return '';
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function parseDecimalInput(value: string | number | null | undefined): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (!value) return undefined;

  const sanitized = value.trim().replace(/\s+/g, '');
  if (!sanitized) return undefined;

  const normalized = sanitized.includes(',')
    ? sanitized.replace(/\./g, '').replace(',', '.')
    : sanitized;

  const num = Number(normalized);
  return Number.isFinite(num) ? num : undefined;
}

/**
 * Hook for integer inputs (Qtd. Cabeças).
 * Keeps display value synchronized when raw state is reset externally.
 */
export function useIntegerInput(rawValue: string, setRawValue: (v: string) => void) {
  const [displayValue, setDisplayValue] = useState(rawValue);

  useEffect(() => {
    setDisplayValue(rawValue);
  }, [rawValue]);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, '');
    setRawValue(v);
    setDisplayValue(v);
  }, [setRawValue]);

  const onBlur = useCallback(() => {
    if (rawValue) {
      setDisplayValue(formatIntBR(rawValue));
    } else {
      setDisplayValue('');
    }
  }, [rawValue]);

  const onFocus = useCallback(() => {
    setDisplayValue(rawValue);
  }, [rawValue]);

  return { displayValue, onChange, onBlur, onFocus };
}

/**
 * Hook for decimal inputs (Peso kg).
 * Keeps display value synchronized when raw state is reset externally.
 */
export function useDecimalInput(rawValue: string, setRawValue: (v: string) => void, decimals = 2) {
  const [displayValue, setDisplayValue] = useState(rawValue);

  useEffect(() => {
    setDisplayValue(rawValue);
  }, [rawValue]);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setRawValue(v);
    setDisplayValue(v);
  }, [setRawValue]);

  const onBlur = useCallback(() => {
    if (rawValue) {
      const num = parseDecimalInput(rawValue);
      if (num !== undefined) {
        setDisplayValue(formatDecBR(rawValue, decimals));
      } else {
        setDisplayValue('');
      }
    } else {
      setDisplayValue('');
    }
  }, [rawValue, decimals]);

  const onFocus = useCallback(() => {
    setDisplayValue(rawValue);
  }, [rawValue]);

  return { displayValue, onChange, onBlur, onFocus };
}
