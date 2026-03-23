import Link from "next/link";

export default function SessionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <div className="px-4 py-3">
        <Link href="/" className="text-lg font-bold">
          Quiz Platform
        </Link>
      </div>
      <div className="flex items-center justify-center p-4" style={{ minHeight: "calc(100vh - 52px)" }}>
        {children}
      </div>
    </div>
  );
}
