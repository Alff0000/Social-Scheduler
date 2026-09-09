import type { Metadata } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { getSessionUser } from "@/lib/auth";

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
  return (
    <html
      lang="pt-BR"
      data-theme="instavips"
      data-mode="light"
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} h-full`}
    >
      {/* Browser extensions (Grammarly and friends) inject attributes and classes onto
          <body> before React hydrates, which React then reports as a hydration mismatch.
          It's the extension, not our markup — suppress it here the same way <html> already
          does. This only covers attributes on this element; a genuine content mismatch
          deeper in the tree is still reported. */}
      <body className="min-h-full" suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('ss-theme'),m=localStorage.getItem('ss-mode');var v={instavips:1,claude:1,apt:1,fyzical:1,default:1,solarized:1,vela:1};var d=document.documentElement;if(t&&v[t])d.setAttribute('data-theme',t);if(m==='light'||m==='dark')d.setAttribute('data-mode',m);}catch(e){}})();",
          }}
        />
        <div className="flex min-h-screen">
          {user ? <Sidebar isAdmin={user.is_admin} /> : null}
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
