import type { Metadata } from "next";
import "./globals.css";
import { NavBar } from "@/components/NavBar";

export const metadata: Metadata = {
  title: "Sepadan — Stablecoin Depeg Insurance",
  description:
    "Parametric depeg insurance settled by GenLayer validator consensus reading live market prices — no oracle middleman, no trust required.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <div className="min-h-screen bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(34,197,94,0.10),rgba(10,14,19,0))]">
          <NavBar />
          <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
