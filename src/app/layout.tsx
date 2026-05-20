import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Hermes Skill Marketplace",
  description: "Browse, install, and share skills for Hermes Agent",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <body className="bg-[#0a0a0f] text-gray-200 min-h-screen">
        <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center text-white font-bold text-sm">
                H
              </div>
              <span className="text-lg font-semibold text-white group-hover:text-indigo-400 transition-colors">
                Hermes Skills
              </span>
            </Link>
            <div className="flex items-center gap-6">
              <Link href="/my-skills" className="text-sm text-gray-400 hover:text-white transition-colors">
                My Skills
              </Link>
              <Link href="/categories" className="text-sm text-gray-400 hover:text-white transition-colors">
                Categories
              </Link>
              <a
                href="https://github.com/HSIANG-LIN/skill-marketplace"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </nav>
        {children}
        <footer className="border-t border-white/5 py-8 mt-20">
          <div className="max-w-7xl mx-auto px-6 text-center text-sm text-gray-500">
            Hermes Skill Marketplace — Powered by{" "}
            <a href="https://hermes-agent.nousresearch.com" className="text-indigo-400 hover:underline" target="_blank" rel="noopener noreferrer">
              Hermes Agent
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
