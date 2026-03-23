import type {
  AuthResponse,
  ChangePasswordRequest,
  CreateQuestionRequest,
  CreateQuizRequest,
  CreateSessionRequest,
  CreateUserRequest,
  LeaderboardEntry,
  LoginRequest,
  PaginatedResponse,
  QuizDetailResponse,
  QuizListResponse,
  QuestionResponse,
  SessionAnalyticsResponse,
  SessionResponse,
  UpdateProfileRequest,
  UpdateQuestionRequest,
  UpdateQuizRequest,
  UpdateUserRequest,
  UserResponse,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5063";

class ApiClient {
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("token");
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }
    return headers;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Request failed with status ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // Auth
  auth = {
    login: (data: LoginRequest) => this.request<AuthResponse>("POST", "/api/auth/login", data),
    me: () => this.request<AuthResponse>("GET", "/api/auth/me"),
  };

  // Users (admin)
  users = {
    list: () => this.request<UserResponse[]>("GET", "/api/users"),
    getById: (id: string) => this.request<UserResponse>("GET", `/api/users/${id}`),
    create: (data: CreateUserRequest) => this.request<UserResponse>("POST", "/api/users", data),
    update: (id: string, data: UpdateUserRequest) => this.request<UserResponse>("PUT", `/api/users/${id}`, data),
    delete: (id: string) => this.request<void>("DELETE", `/api/users/${id}`),
  };

  // Quizzes
  quizzes = {
    list: (page = 1, pageSize = 20) =>
      this.request<PaginatedResponse<QuizListResponse>>("GET", `/api/quizzes?page=${page}&pageSize=${pageSize}`),
    getById: (id: string) => this.request<QuizDetailResponse>("GET", `/api/quizzes/${id}`),
    create: (data: CreateQuizRequest) => this.request<QuizDetailResponse>("POST", "/api/quizzes", data),
    update: (id: string, data: UpdateQuizRequest) => this.request<QuizDetailResponse>("PUT", `/api/quizzes/${id}`, data),
    delete: (id: string) => this.request<void>("DELETE", `/api/quizzes/${id}`),
    addQuestion: (quizId: string, data: CreateQuestionRequest) =>
      this.request<QuestionResponse>("POST", `/api/quizzes/${quizId}/questions`, data),
    updateQuestion: (quizId: string, questionId: string, data: UpdateQuestionRequest) =>
      this.request<QuestionResponse>("PUT", `/api/quizzes/${quizId}/questions/${questionId}`, data),
    deleteQuestion: (quizId: string, questionId: string) =>
      this.request<void>("DELETE", `/api/quizzes/${quizId}/questions/${questionId}`),
    bulkDeleteQuestions: (quizId: string, questionIds: string[]) =>
      this.request<void>("POST", `/api/quizzes/${quizId}/questions/bulk-delete`, questionIds),
    reorderQuestions: (quizId: string, questionIds: string[]) =>
      this.request<void>("PUT", `/api/quizzes/${quizId}/questions/reorder`, questionIds),
  };

  // Sessions
  sessions = {
    create: (data: CreateSessionRequest) => this.request<SessionResponse>("POST", "/api/sessions", data),
    getById: (id: string) => this.request<SessionResponse>("GET", `/api/sessions/${id}`),
    getByCode: (code: string) => this.request<SessionResponse>("GET", `/api/sessions/code/${code}`),
    getMyActive: () => this.request<SessionResponse[]>("GET", "/api/sessions/my-active"),
    getByQuiz: (quizId: string, page = 1, pageSize = 20) =>
      this.request<PaginatedResponse<SessionResponse>>("GET", `/api/sessions/by-quiz/${quizId}?page=${page}&pageSize=${pageSize}`),
    start: (id: string) => this.request<SessionResponse>("POST", `/api/sessions/${id}/start`),
    nextQuestion: (id: string) => this.request<SessionResponse>("POST", `/api/sessions/${id}/next-question`),
    finish: (id: string) => this.request<SessionResponse>("POST", `/api/sessions/${id}/finish`),
    leaderboard: (id: string) => this.request<LeaderboardEntry[]>("GET", `/api/sessions/${id}/leaderboard`),
    analytics: (id: string) => this.request<SessionAnalyticsResponse>("GET", `/api/sessions/${id}/analytics`),
    clearAnalytics: (id: string) => this.request<void>("DELETE", `/api/sessions/${id}/analytics`),
    bulkDelete: (sessionIds: string[]) => this.request<void>("POST", "/api/sessions/bulk-delete", sessionIds),
  };

  // Settings
  settings = {
    get: () => this.request<{ joinCodeLength: number }>("GET", "/api/settings"),
    update: (data: { joinCodeLength: number }) => this.request<{ joinCodeLength: number }>("PUT", "/api/settings", data),
  };

  // Profile
  profile = {
    get: () => this.request<UserResponse>("GET", "/api/profile"),
    update: (data: UpdateProfileRequest) => this.request<UserResponse>("PUT", "/api/profile", data),
    changePassword: (data: ChangePasswordRequest) => this.request<void>("PUT", "/api/profile/password", data),
  };
}

export const api = new ApiClient();
