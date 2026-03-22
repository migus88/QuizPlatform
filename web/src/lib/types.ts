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

// Quizzes
export interface QuizListResponse {
  id: string;
  title: string;
  description: string | null;
  isPublished: boolean;
  questionCount: number;
  createdAt: string;
}

export interface QuizDetailResponse {
  id: string;
  title: string;
  description: string | null;
  isPublished: boolean;
  questions: QuestionResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface QuestionResponse {
  id: string;
  text: string;
  timeLimitSeconds: number;
  points: number;
  order: number;
  answerOptions: AnswerOptionResponse[];
}

export interface AnswerOptionResponse {
  id: string;
  text: string;
  isCorrect: boolean;
  order: number;
}

export interface CreateQuizRequest {
  title: string;
  description?: string;
}

export interface UpdateQuizRequest {
  title?: string;
  description?: string;
  isPublished?: boolean;
}

export interface CreateQuestionRequest {
  text: string;
  timeLimitSeconds: number;
  points: number;
  answerOptions: CreateAnswerOptionRequest[];
}

export interface UpdateQuestionRequest {
  text: string;
  timeLimitSeconds: number;
  points: number;
  answerOptions: CreateAnswerOptionRequest[];
}

export interface CreateAnswerOptionRequest {
  text: string;
  isCorrect: boolean;
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
}

export interface LeaderboardEntry {
  rank: number;
  nickname: string;
  score: number;
}

export interface SubmitAnswerRequest {
  answerOptionId: string;
}
