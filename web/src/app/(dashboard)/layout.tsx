"use client";

import { AuthGuard } from "@/components/auth-guard";
import { Navbar } from "@/components/navbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen">
        <Navbar />
        <main className="container mx-auto px-4 py-8">{children}</main>
      </div>
    </AuthGuard>
  );
}
