"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [joinCodeLength, setJoinCodeLength] = useState(4);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      router.replace("/quizzes");
      return;
    }
    api.settings.get().then((data) => {
      setJoinCodeLength(data.joinCodeLength);
      setLoading(false);
    }).catch(() => {
      toast.error("Failed to load settings");
      setLoading(false);
    });
  }, [isAdmin, router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.settings.update({ joinCodeLength });
      setJoinCodeLength(updated.joinCodeLength);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) return null;

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Platform Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Join Code</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="joinCodeLength">Code Length (digits)</Label>
              <Input
                id="joinCodeLength"
                type="number"
                min={3}
                max={8}
                value={joinCodeLength}
                onChange={(e) => setJoinCodeLength(parseInt(e.target.value) || 4)}
              />
              <p className="text-sm text-muted-foreground">
                Number of digits in the join code (3-8). New sessions will use this length. Example: {Array.from({ length: joinCodeLength }, () => Math.floor(Math.random() * 10)).join("")}
              </p>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
