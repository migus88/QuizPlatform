"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NewQuizPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    try {
      const quiz = await api.quizzes.create({
        title: title.trim(),
        description: description.trim() || undefined,
      });
      toast.success("Quiz created");
      router.push(`/quizzes/${quiz.id}`);
    } catch {
      toast.error("Failed to create quiz");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Link href="/quizzes" className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back to Quizzes
      </Link>
      <h1 className="text-3xl font-bold mb-6">Create New Quiz</h1>
      <Card>
        <CardHeader>
          <CardTitle>Quiz Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="Enter quiz title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                placeholder="Enter quiz description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => router.push("/quizzes")}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !title.trim()}>
                {submitting ? "Creating..." : "Create Quiz"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
