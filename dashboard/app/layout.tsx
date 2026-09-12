import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { getSessionUser } from "@/lib/auth";
import { DEFAULT_THEME, isThemeId, THEME_STORAGE_KEY } from "@/lib/themes";
import { ToastProvider } from "@/components/toast";

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
  title: "xxxxx",
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
  // padrão até o usuário trocar manualmente no seletor de novo.
  const cookieStore = await cookies();
  const savedTheme = cookieStore.get(THEME_STORAGE_KEY)?.value ?? null;
  const theme = isThemeId(savedTheme) ? savedTheme : DEFAULT_THEME;

  return (
    <html
      lang="pt-BR"
      data-theme={theme}
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} h-full`}
    >
      {/* Browser extensions (Grammarly and friends) inject attributes and classes onto
          <body> before React hydrates, which React then reports as a hydration mismatch.
          It's the extension, not our markup — suppress it here the same way <html> already
          does. This only covers attributes on this element; a genuine content mismatch
          deeper in the tree is still reported. */}
      <body className="min-h-full" suppressHydrationWarning>
        {/* flex-col below md so the sidebar's mobile top bar stacks above <main> instead
            of squeezing beside it; md:flex-row restores the original side-by-side shell. */}
        <ToastProvider>
          <div className="flex min-h-screen flex-col md:flex-row">
            {user ? <Sidebar isAdmin={user.is_admin} email={user.email} /> : null}
            <main className="flex-1 min-w-0">{children}</main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
