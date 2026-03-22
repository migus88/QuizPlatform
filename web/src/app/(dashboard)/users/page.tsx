"use client";
import { AuthGuard } from "@/components/auth-guard";

export default function UsersPage() {
  return (
    <AuthGuard requiredRole="Admin">
      <div>
        <h1 className="text-3xl font-bold">User Management</h1>
        <p className="text-muted-foreground mt-2">Coming soon...</p>
      </div>
    </AuthGuard>
  );
}
