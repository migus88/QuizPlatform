"use client";

import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">
        Welcome, {user?.firstName}!
      </h1>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quizzes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">Create and manage quizzes</p>
            <Link href="/quizzes">
              <Button>View Quizzes</Button>
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Join Session</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">Join a live quiz session</p>
            <Link href="/join">
              <Button variant="outline">Join with Code</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
