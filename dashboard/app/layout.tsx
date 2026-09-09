import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { getSessionUser } from "@/lib/auth";
import {
  DEFAULT_MODE, DEFAULT_THEME, isMode, isThemeId, MODE_STORAGE_KEY, THEME_STORAGE_KEY,
} from "@/lib/themes";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "InstaVips",
  description: "Central de publicação social auto-hospedada",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // A sessão só é nula em /login (o middleware já bloqueia todo o resto sem
  // login) — então isso também decide se a barra lateral aparece ou não.
  const user = await getSessionUser();

  // Lido do COOKIE, não de localStorage, para o tema já nascer certo no HTML que o
  // servidor manda — sem depender de um script rodar no cliente antes da pintura, que é
  // exatamente o passo que falha silenciosamente em certas navegações (voltar/avançar,
  // uma aba que reabre, um proxy/CDN na frente do Railway) e faz a página nascer no tema
  // padrão até o usuário trocar manualmente no seletor de novo. O script inline abaixo
  // continua existindo só para migrar localStorage → cookie em quem já tinha o tema
  // salvo do jeito antigo (visitante de uma versão anterior deste app).
  const cookieStore = await cookies();
  const savedTheme = cookieStore.get(THEME_STORAGE_KEY)?.value ?? null;
  const savedMode = cookieStore.get(MODE_STORAGE_KEY)?.value ?? null;
  const theme = isThemeId(savedTheme) ? savedTheme : DEFAULT_THEME;
  const mode = isMode(savedMode) ? savedMode : DEFAULT_MODE;

  return (
    <html
      lang="pt-BR"
      data-theme={theme}
      data-mode={mode}
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} h-full`}
    >
      {/* Browser extensions (Grammarly and friends) inject attributes and classes onto
          <body> before React hydrates, which React then reports as a hydration mismatch.
          It's the extension, not our markup — suppress it here the same way <html> already
          does. This only covers attributes on this element; a genuine content mismatch
          deeper in the tree is still reported. */}
      <body className="min-h-full" suppressHydrationWarning>
        {/* One-time migration for a visitor whose theme is still only in localStorage
            (saved before this cookie mechanism existed): promote it to a cookie so the
            NEXT server render already gets it right, and apply it to this DOM right now
            so this load isn't stuck one step behind. No-op once the cookie exists. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var v={instavips:1,claude:1,apt:1,fyzical:1,default:1,solarized:1,vela:1};var d=document.documentElement;function hasCookie(n){return document.cookie.split('; ').some(function(c){return c.indexOf(n+'=')===0;});}function setCookie(n,val){document.cookie=n+'='+val+'; path=/; max-age=31536000; samesite=lax';}var t=localStorage.getItem('ss-theme'),m=localStorage.getItem('ss-mode');if(t&&v[t]&&!hasCookie('ss-theme')){setCookie('ss-theme',t);d.setAttribute('data-theme',t);}if((m==='light'||m==='dark')&&!hasCookie('ss-mode')){setCookie('ss-mode',m);d.setAttribute('data-mode',m);}}catch(e){}})();",
          }}
        />
        {/* flex-col below md so the sidebar's mobile top bar stacks above <main> instead
            of squeezing beside it; md:flex-row restores the original side-by-side shell. */}
        <div className="flex min-h-screen flex-col md:flex-row">
          {user ? <Sidebar isAdmin={user.is_admin} /> : null}
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
