"use client";

import { AuthGuard } from "@/components/auth-guard";
import { Sidebar } from "@/components/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
