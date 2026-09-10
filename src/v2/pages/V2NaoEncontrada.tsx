/**
 * 404 do /v2 — PR-BARRA-UNICA-01a.
 *
 * ⚠ ANTES NÃO HAVIA 404 ALCANÇÁVEL. `AppRouter` mandava `"*"` para `pages/Index.tsx` (o
 * shell v1), então uma URL errada abria o sistema inteiro na tela antiga em vez de dizer
 * que o endereço não existe — e o `NotFound.tsx` montado em `App.tsx` nunca era atingido,
 * porque a rota `/*` casava antes.
 * ⚠ COM UM CAMINHO DE VOLTA, e um só: "Visão Geral" é o começo do /v2. Um 404 sem saída
 * obriga o operador a editar a barra de endereço.
 */
import { Link } from 'react-router-dom';

export default function V2NaoEncontrada() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <span className="text-4xl" aria-hidden>🐂</span>
      <h1 className="text-[15px] font-medium text-foreground">Página não encontrada</h1>
      <p className="max-w-sm text-[12px] leading-relaxed text-muted-foreground">
        O endereço que você abriu não existe no sistema. Ele pode ter mudado de lugar, ou o
        link pode estar incompleto.
      </p>
      <Link to="/v2"
        className="mt-1 rounded bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90">
        Ir para a Visão Geral
      </Link>
    </div>
  );
}
