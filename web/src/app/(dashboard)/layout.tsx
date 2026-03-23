"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { Sidebar } from "@/components/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isHostPage = /^\/sessions\/[^/]+\/host/.test(pathname);

  if (isHostPage) {
    return (
      <AuthGuard>
        <div className="min-h-screen">
          <div className="px-4 py-3">
            <Link href="/" className="text-lg font-bold">
              Quiz Platform
            </Link>
          </div>
          <main className="container mx-auto px-4 py-4">{children}</main>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen">
        <Sidebar />
        <div className="md:pl-60">
          <main className="container mx-auto px-4 py-8">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
