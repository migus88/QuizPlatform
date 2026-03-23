// Pagination
export interface PaginatedResponse<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}

// Auth
export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

// Users
export interface UserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  createdAt: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
}

export interface UpdateProfileRequest {
  firstName: string;
  lastName: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// Quizzes
export interface QuizListResponse {
  id: string;
  title: string;
  description: string | null;
  questionCount: number;
  createdAt: string;
}

export interface QuizDetailResponse {
  id: string;
  title: string;
  description: string | null;
  questions: QuestionResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface QuestionResponse {
  id: string;
  text: string;
  timeLimitSeconds: number;
  points: number;
  disableTimeScoring: boolean;
  order: number;
  answerOptions: AnswerOptionResponse[];
}

export interface AnswerOptionResponse {
  id: string;
  text: string;
  isCorrect: boolean;
  pointsOverride: number | null;
  order: number;
}

export interface CreateQuizRequest {
  title: string;
  description?: string;
}

export interface UpdateQuizRequest {
  title?: string;
  description?: string;
}

export interface CreateQuestionRequest {
  text: string;
  timeLimitSeconds: number;
  points: number;
  disableTimeScoring: boolean;
  answerOptions: CreateAnswerOptionRequest[];
}

export interface UpdateQuestionRequest {
  text: string;
  timeLimitSeconds: number;
  points: number;
  disableTimeScoring: boolean;
  answerOptions: CreateAnswerOptionRequest[];
}

export interface CreateAnswerOptionRequest {
  text: string;
  isCorrect: boolean;
  pointsOverride?: number | null;
}

// Sessions
export interface SessionResponse {
  id: string;
  quizId: string;
  quizTitle: string;
  joinCode: string;
  status: SessionStatus;
  currentQuestionIndex: number;
  participantCount: number;
  startedAt: string | null;
  endedAt: string | null;
}

export type SessionStatus = "Lobby" | "Active" | "Finished";

export interface CreateSessionRequest {
  quizId: string;
}

export interface JoinSessionRequest {
  joinCode: string;
  nickname: string;
}

export interface ParticipantResponse {
  id: string;
  nickname: string;
  score: number;
  isConnected: boolean;
  emoji: string;
  color: string;
}

export interface LeaderboardEntry {
  rank: number;
  nickname: string;
  score: number;
  emoji: string;
  color: string;
}

export interface SubmitAnswerRequest {
  answerOptionId: string;
}

// Analytics
export interface SessionAnalyticsResponse {
  sessionId: string;
  quizTitle: string;
  status: string;
  totalParticipants: number;
  startedAt: string | null;
  endedAt: string | null;
  questions: QuestionAnalytics[];
}

export interface QuestionAnalytics {
  questionId: string;
  text: string;
  order: number;
  points: number;
  timeLimitSeconds: number;
  options: AnswerOptionAnalytics[];
  participantAnswers: ParticipantAnswerAnalytics[];
}

export interface AnswerOptionAnalytics {
  id: string;
  text: string;
  isCorrect: boolean;
  order: number;
}

export interface ParticipantAnswerAnalytics {
  participantId: string;
  nickname: string;
  emoji: string;
  selectedAnswerOptionId: string | null;
  answeredAt: string;
  isCorrect: boolean;
  awardedPoints: number;
}
