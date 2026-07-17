import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const PROTO_REF = "binbcdfbisgscrifztia";
const PROD_REF = "duttifnbxqtyyybjmouv";

/**
 * Guard de alvo para servidor LOCAL.
 *
 * Roda somente com command === "serve" (dev e preview). `vite build` usa
 * command === "build" e NAO passa por aqui — o deploy da Vercel, que roda
 * `vite build` em modo production, fica imune por construcao.
 *
 * Existe porque `npx vite` executa o binario direto e contorna os scripts npm:
 * o wrapper run-vite-safe.mjs protege `npm run dev`, este guard protege o resto.
 *
 * Valida o project ref REAL da URL resolvida, nunca o nome do modo.
 */
function guardAlvoLocal(mode: string): void {
  const url = loadEnv(mode, process.cwd(), "VITE_").VITE_SUPABASE_URL;
  const fim = (msg: string): never => {
    throw new Error(`[vite-guard] ${msg}`);
  };

  if (!url) {
    fim(`VITE_SUPABASE_URL indefinido no modo "${mode}". Configure .env.proto.local.`);
  }

  let ref: string;
  try {
    ref = new URL(url).hostname.split(".")[0];
  } catch {
    return fim(`VITE_SUPABASE_URL invalida no modo "${mode}".`);
  }

  if (ref === PROD_REF) {
    fim(
      `alvo=${ref} e PRODUCAO em servidor local (mode="${mode}"). ` +
        `Use "npm run dev" (Proto). Nao existe bypass local para producao.`,
    );
  }

  if (ref !== PROTO_REF) {
    fim(`alvo desconhecido: ${ref} (mode="${mode}"). Esperado Proto (${PROTO_REF}).`);
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === "serve") guardAlvoLocal(mode);

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
