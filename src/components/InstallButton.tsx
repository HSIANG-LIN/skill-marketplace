"use client";

import { useState } from "react";

interface Props {
  slug: string;
  category: string;
}

export default function InstallButton({ slug, category }: Props) {
  const [copied, setCopied] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

  const rawUrl = `https://raw.githubusercontent.com/HSIANG-LIN/skill-marketplace/main/public/skills/${category}/${slug}/SKILL.md`;

  const handleCopy = async () => {
    const cmd = `curl -sSL "${rawUrl}" -o ~/.hermes/skills/${category}/${slug}/SKILL.md`;
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = cmd;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleInstall = async () => {
    setInstalling(true);
    // Simulate install delay
    await new Promise((r) => setTimeout(r, 1500));
    setInstalling(false);
    setInstalled(true);
    setTimeout(() => setInstalled(false), 3000);
  };

  return (
    <div className="space-y-3">
      <button
        onClick={handleInstall}
        disabled={installing}
        className="w-full py-3 px-4 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2
          bg-gradient-to-r from-indigo-500 to-cyan-500 text-white hover:from-indigo-600 hover:to-cyan-600
          disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {installing ? (
          <>
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Installing...
          </>
        ) : installed ? (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Installed!
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            One-Click Install
          </>
        )}
      </button>

      <button
        onClick={handleCopy}
        className="w-full py-2.5 px-4 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2
          border border-white/10 text-gray-300 hover:bg-white/5 hover:border-white/20"
      >
        {copied ? (
          <>
            <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-green-400">Copied!</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy Install Command
          </>
        )}
      </button>
    </div>
  );
}
