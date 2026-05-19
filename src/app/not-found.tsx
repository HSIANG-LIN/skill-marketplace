import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="text-6xl mb-6">🔮</div>
      <h1 className="text-4xl font-bold text-white mb-4">Skill Not Found</h1>
      <p className="text-gray-400 text-lg mb-8 max-w-md">
        The skill you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-medium hover:from-indigo-600 hover:to-cyan-600 transition-all"
      >
        Browse All Skills
      </Link>
    </main>
  );
}
