"use client";

import { HubConnectionBuilder, HubConnection, HubConnectionState } from "@microsoft/signalr";
import { useEffect, useRef, useState, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5063";

// Event names
export const HubEvents = {
  // Server -> Client
  PARTICIPANT_JOINED: "ParticipantJoined",
  PARTICIPANT_DISCONNECTED: "ParticipantDisconnected",
  JOINED_SESSION: "JoinedSession",
  SESSION_STARTED: "SessionStarted",
  QUESTION_STARTED: "QuestionStarted",
  TIMER_TICK: "TimerTick",
  ANSWER_SUBMITTED: "AnswerSubmitted",
  ANSWER_RESULT: "AnswerResult",
  QUESTION_ENDED: "QuestionEnded",
  ANSWER_REVEALED: "AnswerRevealed",
  LEADERBOARD_UPDATED: "LeaderboardUpdated",
  TIMER_STARTED: "TimerStarted",
  SESSION_ENDED: "SessionEnded",
  ALREADY_ANSWERED: "AlreadyAnswered",
  PARTICIPANT_UPDATED: "ParticipantUpdated",
  AVAILABLE_EMOJIS: "AvailableEmojis",
} as const;

async function getAccessToken(): Promise<string> {
  const token = localStorage.getItem("token");
  if (!token) return "";

  // Check if token expires within 2 minutes
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const exp = payload.exp * 1000;
    if (Date.now() > exp - 120000) {
      const refreshToken = localStorage.getItem("refreshToken");
      if (refreshToken) {
        const response = await fetch(`${API_URL}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (response.ok) {
          const data = await response.json();
          localStorage.setItem("token", data.token);
          localStorage.setItem("refreshToken", data.refreshToken);
          return data.token;
        }
      }
    }
  } catch {
    // If token parsing fails, return whatever we have
  }
  return token;
}

export function createQuizConnection(): HubConnection {
  return new HubConnectionBuilder()
    .withUrl(`${API_URL}/hubs/quiz`, {
      accessTokenFactory: getAccessToken,
    })
    .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
    .build();
}

export function useQuizHub() {
  const connectionRef = useRef<HubConnection | null>(null);
  const startingRef = useRef<Promise<HubConnection> | null>(null);
  const [connectionState, setConnectionState] = useState<HubConnectionState>(
    HubConnectionState.Disconnected
  );

  const startConnection = useCallback(async () => {
    // If already connected, return existing connection
    if (connectionRef.current?.state === HubConnectionState.Connected) {
      return connectionRef.current;
    }

    // If a connection start is already in progress, wait for it
    if (startingRef.current) {
      return startingRef.current;
    }

    const connection = createQuizConnection();
    connectionRef.current = connection;

    connection.onclose(() => setConnectionState(HubConnectionState.Disconnected));
    connection.onreconnecting(() => setConnectionState(HubConnectionState.Reconnecting));
    connection.onreconnected(() => setConnectionState(HubConnectionState.Connected));

    const startPromise = connection.start().then(() => {
      setConnectionState(HubConnectionState.Connected);
      startingRef.current = null;
      return connection;
    }).catch((err) => {
      startingRef.current = null;
      throw err;
    });

    startingRef.current = startPromise;
    return startPromise;
  }, []);

  useEffect(() => {
    return () => {
      startingRef.current = null;
      connectionRef.current?.stop();
    };
  }, []);

  return {
    connection: connectionRef.current,
    connectionState,
    startConnection,
  };
}
