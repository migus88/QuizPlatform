"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import type {
  QuizDetailResponse,
  QuestionResponse,
  CreateQuestionRequest,
  CreateAnswerOptionRequest,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { FormattedText } from "@/components/formatted-text";
import { Plus, Pencil, Trash2, Check, Clock, Trophy, X, Upload, Download } from "lucide-react";

interface OptionFormState {
  text: string;
  isCorrect: boolean;
  pointsOverride?: number | null;
}

interface QuestionFormState {
  text: string;
  timeLimitSeconds: number;
  points: number;
  disableTimeScoring: boolean;
  answerOptions: OptionFormState[];
}

const emptyQuestionForm: QuestionFormState = {
  text: "",
  timeLimitSeconds: 30,
  points: 100,
  disableTimeScoring: false,
  answerOptions: [
    { text: "", isCorrect: true },
    { text: "", isCorrect: false },
  ],
};

export default function QuizEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [quiz, setQuiz] = useState<QuizDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Metadata form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);

  // Question dialogs
  const [questionDialogOpen, setQuestionDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuestionResponse | null>(null);
  const [questionForm, setQuestionForm] = useState<QuestionFormState>(emptyQuestionForm);
  const [deleteQuestionId, setDeleteQuestionId] = useState<string | null>(null);

  const loadQuiz = useCallback(async () => {
    try {
      const data = await api.quizzes.getById(params.id);
      setQuiz(data);
      setTitle(data.title);
      setDescription(data.description || "");
    } catch {
      toast.error("Failed to load quiz");
      router.push("/quizzes");
    } finally {
      setLoading(false);
    }
  }, [params.id, router]);

  useEffect(() => {
    loadQuiz();
  }, [loadQuiz]);

  const handleSaveMeta = async () => {
    if (!quiz) return;
    setSavingMeta(true);
    try {
      await api.quizzes.update(quiz.id, {
        title: title.trim(),
        description: description.trim() || undefined,
      });
      toast.success("Quiz updated");
      loadQuiz();
    } catch {
      toast.error("Failed to update quiz");
    } finally {
      setSavingMeta(false);
    }
  };

  const openAddQuestion = () => {
    setEditingQuestion(null);
    setQuestionForm({
      ...emptyQuestionForm,
      answerOptions: emptyQuestionForm.answerOptions.map((o) => ({ ...o })),
    });
    setQuestionDialogOpen(true);
  };

  const openEditQuestion = (question: QuestionResponse) => {
    setEditingQuestion(question);
    setQuestionForm({
      text: question.text,
      timeLimitSeconds: question.timeLimitSeconds,
      points: question.points,
      disableTimeScoring: question.disableTimeScoring,
      answerOptions: question.answerOptions
        .sort((a, b) => a.order - b.order)
        .map((o) => ({
          text: o.text,
          isCorrect: o.isCorrect,
          pointsOverride: o.pointsOverride,
        })),
    });
    setQuestionDialogOpen(true);
  };

  const toggleCorrectAnswer = (index: number) => {
    setQuestionForm((prev) => ({
      ...prev,
      answerOptions: prev.answerOptions.map((o, i) =>
        i === index
          ? { ...o, isCorrect: !o.isCorrect, pointsOverride: !o.isCorrect ? o.pointsOverride : null }
          : o
      ),
    }));
  };

  const updateOptionText = (index: number, text: string) => {
    setQuestionForm((prev) => ({
      ...prev,
      answerOptions: prev.answerOptions.map((o, i) =>
        i === index ? { ...o, text } : o
      ),
    }));
  };

  const updateOptionPoints = (index: number, value: string) => {
    const pts = value === "" ? null : parseInt(value);
    setQuestionForm((prev) => ({
      ...prev,
      answerOptions: prev.answerOptions.map((o, i) =>
        i === index ? { ...o, pointsOverride: pts } : o
      ),
    }));
  };

  const addOption = () => {
    if (questionForm.answerOptions.length >= 6) return;
    setQuestionForm((prev) => ({
      ...prev,
      answerOptions: [...prev.answerOptions, { text: "", isCorrect: false }],
    }));
  };

  const removeOption = (index: number) => {
    if (questionForm.answerOptions.length <= 2) return;
    setQuestionForm((prev) => ({
      ...prev,
      answerOptions: prev.answerOptions.filter((_, i) => i !== index),
    }));
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quiz) return;

    if (!questionForm.text.trim()) {
      toast.error("Question text is required");
      return;
    }
    if (questionForm.answerOptions.some((o) => !o.text.trim())) {
      toast.error("All answer options must have text");
      return;
    }
    if (!questionForm.answerOptions.some((o) => o.isCorrect)) {
      toast.error("At least one correct answer is required");
      return;
    }

    const payload: CreateQuestionRequest = {
      text: questionForm.text.trim(),
      timeLimitSeconds: questionForm.timeLimitSeconds,
      points: questionForm.points,
      disableTimeScoring: questionForm.disableTimeScoring,
      answerOptions: questionForm.answerOptions.map((o) => ({
        text: o.text.trim(),
        isCorrect: o.isCorrect,
        pointsOverride: o.isCorrect ? (o.pointsOverride ?? undefined) : undefined,
      })),
    };

    try {
      if (editingQuestion) {
        await api.quizzes.updateQuestion(quiz.id, editingQuestion.id, payload);
        toast.success("Question updated");
      } else {
        await api.quizzes.addQuestion(quiz.id, payload);
        toast.success("Question added");
      }
      setQuestionDialogOpen(false);
      loadQuiz();
    } catch {
      toast.error("Failed to save question");
    }
  };

  const handleDeleteQuestion = async () => {
    if (!quiz || !deleteQuestionId) return;
    try {
      await api.quizzes.deleteQuestion(quiz.id, deleteQuestionId);
      toast.success("Question deleted");
      setDeleteQuestionId(null);
      loadQuiz();
    } catch {
      toast.error("Failed to delete question");
    }
  };

  const handleDownloadTemplate = () => {
    const template = [
      {
        text: "What is 2+2?",
        timeLimitSeconds: 30,
        points: 100,
        disableTimeScoring: false,
        answerOptions: [
          { text: "4", isCorrect: true },
          { text: "3", isCorrect: false },
          { text: "5", isCorrect: false },
          { text: "2", isCorrect: false },
        ],
      },
      {
        text: "Which of these are **prime** numbers?",
        timeLimitSeconds: 20,
        points: 200,
        disableTimeScoring: true,
        answerOptions: [
          { text: "7", isCorrect: true, pointsOverride: 100 },
          { text: "11", isCorrect: true, pointsOverride: 200 },
          { text: "9", isCorrect: false },
        ],
      },
    ];
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "questions_template.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!quiz || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    const text = await file.text();

    let questions: Array<{
      text: string;
      timeLimitSeconds?: number;
      points?: number;
      disableTimeScoring?: boolean;
      answerOptions: Array<{ text: string; isCorrect: boolean; pointsOverride?: number }>;
    }>;

    try {
      questions = JSON.parse(text);
      if (!Array.isArray(questions)) throw new Error();
    } catch {
      toast.error("Invalid JSON file. Must be an array of questions.");
      e.target.value = "";
      return;
    }

    let imported = 0;
    let failed = 0;

    for (const q of questions) {
      try {
        if (!q.text?.trim() || !Array.isArray(q.answerOptions) || q.answerOptions.length < 2) {
          failed++;
          continue;
        }
        if (!q.answerOptions.some((a) => a.isCorrect)) {
          failed++;
          continue;
        }

        await api.quizzes.addQuestion(quiz.id, {
          text: q.text.trim(),
          timeLimitSeconds: q.timeLimitSeconds ?? 30,
          points: q.points ?? 100,
          disableTimeScoring: q.disableTimeScoring ?? false,
          answerOptions: q.answerOptions.map((a) => ({
            text: a.text.trim(),
            isCorrect: a.isCorrect,
            pointsOverride: a.isCorrect && a.pointsOverride ? a.pointsOverride : undefined,
          })),
        });
        imported++;
      } catch {
        failed++;
      }
    }

    e.target.value = "";
    if (imported > 0) {
      toast.success(`Imported ${imported} question${imported > 1 ? "s" : ""}`);
      loadQuiz();
    }
    if (failed > 0) {
      toast.error(`${failed} row${failed > 1 ? "s" : ""} failed to import`);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  }

  if (!quiz) return null;

  const sortedQuestions = [...quiz.questions].sort((a, b) => a.order - b.order);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Quiz Metadata */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Quiz Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quiz-title">Title</Label>
            <Input
              id="quiz-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quiz-description">Description</Label>
            <Input
              id="quiz-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveMeta} disabled={savingMeta}>
              {savingMeta ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator className="my-6" />

      {/* Questions Section */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Questions</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
            <Download className="h-4 w-4 mr-1" />
            Template
          </Button>
          <Button variant="outline" size="sm" asChild>
            <label className="cursor-pointer">
              <Upload className="h-4 w-4 mr-1" />
              Import JSON
              <input
                type="file"
                accept=".json"
                onChange={handleImportJson}
                className="hidden"
              />
            </label>
          </Button>
          <Button onClick={openAddQuestion}>
            <Plus className="h-4 w-4 mr-2" />
            Add Question
          </Button>
        </div>
      </div>

      {sortedQuestions.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No questions yet. Add your first question!
        </div>
      ) : (
        <div className="space-y-4">
          {sortedQuestions.map((question, index) => {
            const sortedOptions = [...question.answerOptions].sort(
              (a, b) => a.order - b.order
            );
            const correctCount = sortedOptions.filter((o) => o.isCorrect).length;
            return (
              <Card key={question.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base">
                        Q{index + 1}: <FormattedText text={question.text} />
                      </CardTitle>
                      <div className="flex gap-3 mt-2 text-sm text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {question.timeLimitSeconds}s
                        </span>
                        <span className="flex items-center gap-1">
                          <Trophy className="h-3 w-3" />
                          {question.points} pts
                        </span>
                        {correctCount > 1 && (
                          <Badge variant="outline" className="text-xs">{correctCount} correct</Badge>
                        )}
                        {question.disableTimeScoring && (
                          <Badge variant="outline" className="text-xs">Fixed score</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditQuestion(question)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteQuestionId(question.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {sortedOptions.map((option, optIndex) => (
                      <div
                        key={option.id}
                        className={`flex items-center gap-2 rounded-md p-2 text-sm ${
                          option.isCorrect
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                            : "bg-muted"
                        }`}
                      >
                        {option.isCorrect && <Check className="h-3 w-3 shrink-0" />}
                        <span className="flex-1">{String.fromCharCode(65 + optIndex)}. <FormattedText text={option.text} /></span>
                        {option.isCorrect && option.pointsOverride != null && (
                          <span className="text-xs font-mono opacity-70">{option.pointsOverride}pts</span>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Question Dialog */}
      <Dialog open={questionDialogOpen} onOpenChange={setQuestionDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingQuestion ? "Edit Question" : "Add Question"}</DialogTitle>
            <DialogDescription>
              {editingQuestion ? "Update the question details." : "Fill in the question details and answer options."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveQuestion} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="question-text">Question Text</Label>
              <Input
                id="question-text"
                value={questionForm.text}
                onChange={(e) => setQuestionForm({ ...questionForm, text: e.target.value })}
                placeholder="Enter your question"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="time-limit">Time Limit (seconds)</Label>
                <Input
                  id="time-limit"
                  type="number"
                  min={5}
                  max={120}
                  value={questionForm.timeLimitSeconds}
                  onChange={(e) =>
                    setQuestionForm({ ...questionForm, timeLimitSeconds: parseInt(e.target.value) || 30 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="points">Default Points</Label>
                <Input
                  id="points"
                  type="number"
                  min={1}
                  max={1000}
                  value={questionForm.points}
                  onChange={(e) =>
                    setQuestionForm({ ...questionForm, points: parseInt(e.target.value) || 100 })
                  }
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={questionForm.disableTimeScoring}
                onChange={(e) =>
                  setQuestionForm({ ...questionForm, disableTimeScoring: e.target.checked })
                }
                className="rounded"
              />
              <span className="text-sm">Fixed score (no time-based reduction)</span>
            </label>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Answer Options (check correct answers)</Label>
                {questionForm.answerOptions.length < 6 && (
                  <Button type="button" variant="outline" size="sm" onClick={addOption}>
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                )}
              </div>
              {questionForm.answerOptions.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={option.isCorrect}
                    onChange={() => toggleCorrectAnswer(index)}
                    className="shrink-0"
                  />
                  <span className="text-sm font-medium shrink-0 w-6">
                    {String.fromCharCode(65 + index)}.
                  </span>
                  <Input
                    value={option.text}
                    onChange={(e) => updateOptionText(index, e.target.value)}
                    placeholder={`Option ${String.fromCharCode(65 + index)}`}
                    required
                    className="flex-1"
                  />
                  {option.isCorrect && (
                    <Input
                      type="number"
                      min={1}
                      max={1000}
                      value={option.pointsOverride ?? ""}
                      onChange={(e) => updateOptionPoints(index, e.target.value)}
                      placeholder="pts"
                      className="w-20"
                    />
                  )}
                  {questionForm.answerOptions.length > 2 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeOption(index)}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setQuestionDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingQuestion ? "Update Question" : "Add Question"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Question Confirmation */}
      <Dialog open={deleteQuestionId !== null} onOpenChange={(open) => { if (!open) setDeleteQuestionId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Question</DialogTitle>
            <DialogDescription>Are you sure you want to delete this question?</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteQuestionId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteQuestion}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
