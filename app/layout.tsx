import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HydroVigie — Risque eau par site (France)",
  description:
    "Suivi du risque hydrique (quantité) à l'adresse : restrictions sécheresse VigiEau en vigueur, zones d'alerte et usages concernés, partout en France.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
