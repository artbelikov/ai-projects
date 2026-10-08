import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Portfolio",
  description: "Showcase of LLM integrations, RAG systems, and AI agents",
};

const navLinks = [
  { href: "/llm", label: "LLM Playground" },
  { href: "/rag", label: "RAG Demo" },
  { href: "/agents/react", label: "ReAct Agent" },
  { href: "/agents/supervisor", label: "Supervisor" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <nav className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
            <Link href="/" className="text-lg font-bold text-primary">
              AI Portfolio
            </Link>
            <div className="flex flex-wrap gap-4 text-sm text-text-muted">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href} className="hover:text-text">
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
