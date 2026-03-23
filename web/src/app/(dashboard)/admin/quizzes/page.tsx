"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import type { AdminQuizListResponse } from "@/lib/types";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { ArrowLeft, ChevronLeft, ChevronRight, Search, ArrowUpDown } from "lucide-react";

const PAGE_SIZE = 20;

export default function AdminQuizzesPage() {
  const [quizzes, setQuizzes] = useState<AdminQuizListResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [sortDir, setSortDir] = useState<string | undefined>();

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const loadQuizzes = useCallback(async (p: number, s?: string, sb?: string, sd?: string) => {
    setLoading(true);
    try {
      const data = await api.quizzes.adminList(p, PAGE_SIZE, s, sb, sd);
      setQuizzes(data.items);
      setTotalCount(data.totalCount);
      setPage(data.page);
    } catch {
      toast.error("Failed to load quizzes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQuizzes(1);
  }, [loadQuizzes]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    loadQuizzes(1, searchInput, sortBy, sortDir);
  };

  const handleSort = (column: string) => {
    const newDir = sortBy === column && sortDir === "asc" ? "desc" : "asc";
    setSortBy(column);
    setSortDir(newDir);
    loadQuizzes(1, search, column, newDir);
  };

  const handlePageChange = (p: number) => {
    loadQuizzes(p, search, sortBy, sortDir);
  };

  return (
    <AuthGuard requiredRole="Admin">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">All Quizzes</h1>
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by title or owner..."
              className="w-64"
            />
            <Button type="submit" variant="outline" size="icon">
              <Search className="h-4 w-4" />
            </Button>
          </form>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : quizzes.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {search ? "No quizzes match your search." : "No quizzes on the platform yet."}
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button onClick={() => handleSort("title")} className="flex items-center gap-1 hover:text-foreground">
                      Title <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button onClick={() => handleSort("owner")} className="flex items-center gap-1 hover:text-foreground">
                      Owner <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button onClick={() => handleSort("questions")} className="flex items-center gap-1 hover:text-foreground">
                      Questions <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quizzes.map((quiz) => (
                  <TableRow key={quiz.id}>
                    <TableCell className="font-medium">{quiz.title}</TableCell>
                    <TableCell>
                      <div>
                        <span className="text-sm">{quiz.ownerName}</span>
                        <span className="block text-xs text-muted-foreground">{quiz.ownerEmail}</span>
                      </div>
                    </TableCell>
                    <TableCell>{quiz.questionCount}</TableCell>
                    <TableCell>{new Date(quiz.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/quizzes/${quiz.id}`}>
                        <Button variant="outline" size="sm">View</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  {totalCount} quiz{totalCount !== 1 ? "zes" : ""} total
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handlePageChange(page - 1)} disabled={page <= 1}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">Page {page} of {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AuthGuard>
  );
}
