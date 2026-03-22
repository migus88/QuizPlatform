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
import { Plus, Pencil, Trash2, Check, Clock, Trophy } from "lucide-react";

interface QuestionFormState {
  text: string;
  timeLimitSeconds: number;
  points: number;
  answerOptions: CreateAnswerOptionRequest[];
}

const emptyQuestionForm: QuestionFormState = {
  text: "",
  timeLimitSeconds: 30,
  points: 100,
  answerOptions: [
    { text: "", isCorrect: true },
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
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
  const [isPublished, setIsPublished] = useState(false);
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
      setIsPublished(data.isPublished);
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
        isPublished,
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
    setQuestionForm({ ...emptyQuestionForm, answerOptions: emptyQuestionForm.answerOptions.map((o) => ({ ...o })) });
    setQuestionDialogOpen(true);
  };

  const openEditQuestion = (question: QuestionResponse) => {
    setEditingQuestion(question);
    setQuestionForm({
      text: question.text,
      timeLimitSeconds: question.timeLimitSeconds,
      points: question.points,
      answerOptions: question.answerOptions
        .sort((a, b) => a.order - b.order)
        .map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
    });
    setQuestionDialogOpen(true);
  };

  const setCorrectAnswer = (index: number) => {
    setQuestionForm((prev) => ({
      ...prev,
      answerOptions: prev.answerOptions.map((o, i) => ({
        ...o,
        isCorrect: i === index,
      })),
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

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quiz) return;

    // Validate
    if (!questionForm.text.trim()) {
      toast.error("Question text is required");
      return;
    }
    if (questionForm.answerOptions.some((o) => !o.text.trim())) {
      toast.error("All answer options must have text");
      return;
    }
    if (!questionForm.answerOptions.some((o) => o.isCorrect)) {
      toast.error("Please select a correct answer");
      return;
    }

    const payload: CreateQuestionRequest = {
      text: questionForm.text.trim(),
      timeLimitSeconds: questionForm.timeLimitSeconds,
      points: questionForm.points,
      answerOptions: questionForm.answerOptions.map((o) => ({
        text: o.text.trim(),
        isCorrect: o.isCorrect,
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
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm font-medium">Published</span>
            </label>
            <Badge variant={isPublished ? "default" : "secondary"}>
              {isPublished ? "Published" : "Draft"}
            </Badge>
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
        <Button onClick={openAddQuestion}>
          <Plus className="h-4 w-4 mr-2" />
          Add Question
        </Button>
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
            return (
              <Card key={question.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base">
                        Q{index + 1}: {question.text}
                      </CardTitle>
                      <div className="flex gap-3 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {question.timeLimitSeconds}s
                        </span>
                        <span className="flex items-center gap-1">
                          <Trophy className="h-3 w-3" />
                          {question.points} pts
                        </span>
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
                        <span>{String.fromCharCode(65 + optIndex)}. {option.text}</span>
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
        <DialogContent className="sm:max-w-lg">
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
                <Label htmlFor="points">Points</Label>
                <Input
                  id="points"
                  type="number"
                  min={10}
                  max={1000}
                  value={questionForm.points}
                  onChange={(e) =>
                    setQuestionForm({ ...questionForm, points: parseInt(e.target.value) || 100 })
                  }
                />
              </div>
            </div>
            <div className="space-y-3">
              <Label>Answer Options (select the correct one)</Label>
              {questionForm.answerOptions.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correctAnswer"
                    checked={option.isCorrect}
                    onChange={() => setCorrectAnswer(index)}
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
                  />
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
