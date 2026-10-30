import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { m } from "@/i18n";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: m.app.name, template: `%s | ${m.app.name}` },
  description: m.app.description,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // proxy.ts が生成した CSP の nonce（next-themes がテーマのちらつき防止に使うインラインスクリプトに付ける）
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    // next-themes が html の class を書き換えるため、ハイドレーション警告を抑制する
    <html lang="ja" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce}>
          <TooltipProvider>{children}</TooltipProvider>
          {/* richColors は配色のコントラストが不足するため使わない（種類はアイコンで区別） */}
          <Toaster closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
