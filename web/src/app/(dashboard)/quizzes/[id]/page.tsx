"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
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
import { Plus, Pencil, Trash2, Check, Clock, Trophy, X, Upload, Download, ArrowLeft, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface OptionFormState {
  _id: string;
  text: string;
  isCorrect: boolean;
  pointsOverride?: number | null;
}

let _optionIdCounter = 0;
function nextOptionId() {
  return `opt-${++_optionIdCounter}`;
}

interface QuestionFormState {
  text: string;
  timeLimitSeconds: number;
  points: number;
  disableTimeScoring: boolean;
  answerOptions: OptionFormState[];
}

function makeEmptyQuestionForm(): QuestionFormState {
  return {
    text: "",
    timeLimitSeconds: 30,
    points: 100,
    disableTimeScoring: false,
    answerOptions: [
      { _id: nextOptionId(), text: "", isCorrect: true },
      { _id: nextOptionId(), text: "", isCorrect: false },
    ],
  };
}

function SortableItem({ id, children }: { id: string; children: (props: { dragHandleProps: Record<string, unknown> }) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ dragHandleProps: { ...attributes, ...listeners } })}
    </div>
  );
}

export default function QuizEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [quiz, setQuiz] = useState<QuizDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Metadata form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [randomizeAnswerOrder, setRandomizeAnswerOrder] = useState(true);
  const [savingMeta, setSavingMeta] = useState(false);

  // Question dialogs
  const [questionDialogOpen, setQuestionDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuestionResponse | null>(null);
  const [questionForm, setQuestionForm] = useState<QuestionFormState>(makeEmptyQuestionForm);
  const [deleteQuestionId, setDeleteQuestionId] = useState<string | null>(null);

  // Bulk delete mode
  const [editMode, setEditMode] = useState(false);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const loadQuiz = useCallback(async () => {
    try {
      const data = await api.quizzes.getById(params.id);
      setQuiz(data);
      setTitle(data.title);
      setDescription(data.description || "");
      setRandomizeAnswerOrder(data.randomizeAnswerOrder);
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
        randomizeAnswerOrder,
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
    setQuestionForm(makeEmptyQuestionForm());
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
          _id: nextOptionId(),
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
          ? { ...o, isCorrect: !o.isCorrect, pointsOverride: !o.isCorrect ? o.pointsOverride : (prev.disableTimeScoring ? o.pointsOverride : null) }
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
      answerOptions: [...prev.answerOptions, { _id: nextOptionId(), text: "", isCorrect: false }],
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
        pointsOverride: o.isCorrect ? (o.pointsOverride ?? undefined) : (o.pointsOverride != null && o.pointsOverride < 0 ? o.pointsOverride : undefined),
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

  const toggleSelectQuestion = (id: string) => {
    setSelectedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDeleteQuestions = async () => {
    if (!quiz) return;
    try {
      await api.quizzes.bulkDeleteQuestions(quiz.id, Array.from(selectedQuestions));
      toast.success(`Deleted ${selectedQuestions.size} question(s)`);
      setSelectedQuestions(new Set());
      setEditMode(false);
      setShowBulkDeleteDialog(false);
      loadQuiz();
    } catch {
      toast.error("Failed to delete questions");
    }
  };

  const exitEditMode = () => {
    setEditMode(false);
    setSelectedQuestions(new Set());
  };

  const handleQuestionDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !quiz || active.id === over.id) return;

    const oldIndex = sortedQuestions.findIndex((q) => q.id === active.id);
    const newIndex = sortedQuestions.findIndex((q) => q.id === over.id);
    const reordered = arrayMove(sortedQuestions, oldIndex, newIndex);

    // Optimistically update the quiz
    setQuiz({ ...quiz, questions: reordered.map((q, i) => ({ ...q, order: i + 1 })) });

    try {
      await api.quizzes.reorderQuestions(quiz.id, reordered.map((q) => q.id));
    } catch {
      toast.error("Failed to reorder questions");
      loadQuiz();
    }
  };

  const handleOptionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setQuestionForm((prev) => {
      const oldIndex = prev.answerOptions.findIndex((o) => o._id === active.id);
      const newIndex = prev.answerOptions.findIndex((o) => o._id === over.id);
      return {
        ...prev,
        answerOptions: arrayMove(prev.answerOptions, oldIndex, newIndex),
      };
    });
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
    <div>
      <Link href="/quizzes" className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back to Quizzes
      </Link>
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
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={randomizeAnswerOrder}
              onChange={(e) => setRandomizeAnswerOrder(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm font-medium">Randomize answer order</span>
          </label>
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
          {editMode ? (
            <>
              {selectedQuestions.size > 0 && (
                <Button variant="destructive" size="sm" onClick={() => setShowBulkDeleteDialog(true)}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete ({selectedQuestions.size})
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={exitEditMode}>
                Done
              </Button>
            </>
          ) : (
            <>
              {sortedQuestions.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
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
            </>
          )}
        </div>
      </div>

      {sortedQuestions.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No questions yet. Add your first question!
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleQuestionDragEnd}>
        <SortableContext items={sortedQuestions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-4">
          {sortedQuestions.map((question, index) => {
            const sortedOptions = [...question.answerOptions].sort(
              (a, b) => a.order - b.order
            );
            const correctCount = sortedOptions.filter((o) => o.isCorrect).length;
            return (
              <SortableItem key={question.id} id={question.id}>
              {({ dragHandleProps }) => (
              <Card className={editMode && selectedQuestions.has(question.id) ? "ring-2 ring-primary" : ""}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <button type="button" className="mt-1 cursor-grab text-muted-foreground hover:text-foreground" {...dragHandleProps}>
                        <GripVertical className="h-4 w-4" />
                      </button>
                      {editMode && (
                        <input
                          type="checkbox"
                          checked={selectedQuestions.has(question.id)}
                          onChange={() => toggleSelectQuestion(question.id)}
                          className="h-4 w-4 mt-1"
                        />
                      )}
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
                    </div>
                    {!editMode && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditQuestion(question)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteQuestionId(question.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
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
              )}
              </SortableItem>
            );
          })}
        </div>
        </SortableContext>
        </DndContext>
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
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleOptionDragEnd}>
              <SortableContext items={questionForm.answerOptions.map((o) => o._id)} strategy={verticalListSortingStrategy}>
              {questionForm.answerOptions.map((option, index) => (
                <SortableItem key={option._id} id={option._id}>
                {({ dragHandleProps }) => (
                <div className="flex items-center gap-2">
                  <button type="button" className="cursor-grab text-muted-foreground hover:text-foreground" {...dragHandleProps}>
                    <GripVertical className="h-4 w-4" />
                  </button>
                  <input
                    type="checkbox"
                    checked={option.isCorrect}
                    onChange={() => toggleCorrectAnswer(index)}
                    className="shrink-0"
                  />
                  <Input
                    value={option.text}
                    onChange={(e) => updateOptionText(index, e.target.value)}
                    placeholder={`Option ${String.fromCharCode(65 + index)}`}
                    required
                    className="flex-1"
                  />
                  {(option.isCorrect || questionForm.disableTimeScoring) && (
                    <Input
                      type="number"
                      min={questionForm.disableTimeScoring ? -1000 : 1}
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
                )}
                </SortableItem>
              ))}
              </SortableContext>
              </DndContext>
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

      {/* Bulk Delete Questions Confirmation */}
      <Dialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Questions</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedQuestions.size} question(s)? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowBulkDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDeleteQuestions}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
