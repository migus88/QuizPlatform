# PRD - Realtime Quiz Platform

## Overview

Build a lightweight realtime quiz platform inspired by Kahoot for classroom use.

The system should support:
- quiz authoring and management
- live hosted quiz sessions
- participant joining via code from mobile devices
- realtime answer submission, scoring, and leaderboard updates
- user management with admin and non-admin roles

The product should be simple, fast, mobile-friendly, and suitable for 25+ concurrent participants.

---

## Goals

- Allow admins to create and manage quizzes
- Allow a host to launch a live session and present questions on a big screen
- Allow participants to join from phones using a session code
- Support realtime gameplay with leaderboard updates between questions
- Provide secure email/password authentication
- Provide user management with role-based permissions
- Be easy to run locally and easy to deploy to AWS Lightsail via Docker

---

## Tech Stack

### Backend
- .NET 10
- ASP.NET Core Minimal APIs
- Entity Framework Core
- PostgreSQL
- ASP.NET Core Identity for authentication and authorization
- JWT Bearer authentication
- SignalR for realtime communication
- Swagger / OpenAPI

### Frontend
- Latest Next.js
- TypeScript
- shadcn/ui
- Tailwind CSS
- React Query or built-in fetch strategy for API access
- SignalR client for realtime updates

### Dev / Infra
- Docker
- Docker Compose
- Makefile
- AWS Lightsail VPS deployment target

---

## Roles

### Admin
Can:
- log in
- manage quizzes
- manage sessions
- manage all users
- perform full CRUD on users
- assign or change roles
- view all data needed for administration

### Non-admin user
Can:
- log in
- view and update only their own user profile
- participate in quizzes
- host a quiz session if allowed by business rules
- never view, edit, or delete other users

---

## Authentication and Authorization

### Authentication
Use email/password authentication.

Seed a default admin user on startup:
- Email: `admin@admin.com`
- Password: `Admin1!`

Use ASP.NET Core Identity with JWT authentication.

### Authorization Rules
- Admin has full access to all user management endpoints
- Non-admin users may only read/update their own profile
- Non-admin users must not be able to list all users
- All protected endpoints must enforce role and ownership checks server-side

---

## Main Product Areas

## 1. Admin Panel

Admins need a management interface for users and quizzes.

### User Management
Admins can:
- list users
- view user details
- create users
- update users
- delete users
- assign roles

Non-admin users can:
- view self
- update self
- not create/delete users
- not list all users
- not change own role unless explicitly allowed

### Quiz Management
Admins can:
- create quiz
- edit quiz
- delete quiz
- publish/unpublish quiz
- add/edit/delete/reorder questions

Each quiz contains:
- title
- description (optional)
- status
- created by
- created at / updated at

Each question contains:
- question text
- 4 answer options
- exactly 1 correct answer
- time limit in seconds
- optional points value
- display order

---

## 2. Host Experience

The host screen is used on a projector or shared screen.

Host can:
- choose a quiz
- create a live session
- generate/display join code
- see connected participants in lobby
- start session
- move through questions manually
- see timer countdown
- reveal correct answer
- show per-question results
- show leaderboard between rounds
- end session and show final rankings

The host view should prioritize:
- big readable text
- clear answer presentation
- minimal clutter
- realtime state updates

---

## 3. Participant Experience

Participants use phones or laptops.

Participants can:
- join session using code
- enter nickname
- wait in lobby
- answer questions in realtime
- receive round result feedback
- see current score / ranking between rounds
- see final ranking

Participant UI should be:
- mobile-first
- very low friction
- large tap targets
- fast to reconnect if connection drops

---

## Core Gameplay Flow

1. Admin creates a quiz
2. Host opens host screen and creates a session from a quiz
3. System generates a unique join code
4. Participants join using code and nickname
5. Host starts session
6. Question is shown on host screen
7. Participants submit answers on their own screen
8. Backend validates answers and assigns points
9. Host reveals correct answer
10. Leaderboard is shown
11. Repeat until all questions are complete
12. Final leaderboard is shown

---

## Realtime Requirements

Use SignalR for all live session communication.

Realtime events should include:
- participant joined
- participant disconnected/reconnected
- session started
- question started
- timer updates
- answer submitted
- question ended
- answer reveal
- leaderboard updated
- session ended

Server should be source of truth for:
- current session state
- current question
- timer
- scores
- participant status

---

## Functional Requirements

## Users
- seed default admin on first startup
- support login via email and password
- support JWT token issuance
- support profile retrieval
- support self-update for non-admin users
- support full CRUD for admins

## Quizzes
- create quiz
- edit quiz metadata
- delete quiz
- list quizzes
- fetch quiz details
- manage questions and answer options
- enforce exactly 4 options per question
- enforce exactly 1 correct answer

## Sessions
- create session from quiz
- generate unique join code
- allow participants to join active session
- manage lobby state
- start session
- advance through questions
- collect answers
- compute scores
- expose leaderboard
- end session

## Participation
- join by code
- submit one answer per question
- prevent duplicate scoring for repeated submissions
- support reconnect by participant identity within same session

---

## Non-Functional Requirements

- support at least 25 simultaneous participants comfortably
- mobile-friendly participant UI
- clean desktop UI for admin and host
- low latency realtime updates
- simple deployment on a single VPS
- production-ready Docker setup
- basic logging and health checks
- backend validation for all write operations

---

## Suggested Domain Model

### User
- id
- email
- password hash
- first name
- last name
- role
- created at
- updated at

### Quiz
- id
- title
- description
- is published
- created by user id
- created at
- updated at

### Question
- id
- quiz id
- text
- time limit seconds
- points
- order

### AnswerOption
- id
- question id
- text
- is correct
- order

### Session
- id
- quiz id
- join code
- status
- current question index
- started at
- ended at
- created by user id

### Participant
- id
- session id
- nickname
- user id nullable
- connection id nullable
- score
- joined at
- is connected

### ParticipantAnswer
- id
- participant id
- question id
- selected answer option id
- answered at
- is correct
- awarded points

---

## API Requirements

Use ASP.NET Core Minimal APIs.

Group endpoints clearly, for example:
- `/api/auth/*`
- `/api/users/*`
- `/api/quizzes/*`
- `/api/sessions/*`
- `/api/profile/*`

### Minimum endpoint areas

#### Auth
- login
- refresh or re-login flow
- current user

#### Users
- admin list users
- admin get user by id
- admin create user
- admin update user
- admin delete user
- self get profile
- self update profile

#### Quizzes
- list
- get by id
- create
- update
- delete
- manage questions

#### Sessions
- create session
- get session by code/id
- join session
- start session
- next question
- reveal answer
- leaderboard
- finish session

#### Health
- `/health`

Swagger should be enabled in development.

---

## Frontend Requirements

Use latest Next.js with TypeScript and shadcn/ui.

### Frontend App Areas
- login page
- admin dashboard
- user management pages
- quiz management pages
- host session page
- participant join page
- participant play page
- leaderboard/results page
- self-profile page

### UI Notes
- use shadcn/ui components
- keep visual style modern and clean
- optimize participant flow for phones
- optimize host view for large screen visibility
- avoid overengineering visuals for MVP

---

## Security Requirements

- all protected routes require auth
- JWT tokens validated server-side
- role-based authorization enforced server-side
- ownership checks enforced server-side
- passwords stored securely via Identity
- seed admin only if not already present
- no privilege escalation via client payloads

---

## Deployment Requirements

Deployment target is AWS Lightsail VPS using Docker.

### Requirements
- `make deploy` should produce a deployment-ready Docker setup
- Docker image(s) must include all dependencies
- should be runnable on a Lightsail Ubuntu VPS
- should support environment variables for secrets and connection strings
- should include production build for Next.js
- should expose API and web app cleanly

### Recommended deployment shape
- one container for API
- one container for web
- one container for PostgreSQL, or external managed DB
- use Docker Compose for VPS deployment

---

## Make Scripts

Provide a `Makefile` with these commands:

### `make api`
Runs the ASP.NET Core API app locally.

### `make web`
Runs the Next.js app locally.

### `make deploy`
Builds production-ready Docker artifacts and/or starts the Dockerized stack suitable for AWS Lightsail deployment.

Recommended additional commands:
- `make dev`
- `make test`
- `make docker-up`
- `make docker-down`

---

## Acceptance Criteria

- default admin user is seeded successfully with `admin@admin.com / Admin1!`
- admin can log in and manage all users
- non-admin cannot access admin user management routes
- non-admin can view and update only self
- admin can create and manage quizzes
- host can create a session and receive a join code
- participants can join from phones
- questions and answers update in realtime
- scoring works correctly
- leaderboard updates between rounds
- app runs locally with `make api` and `make web`
- app is deployable to AWS Lightsail with `make deploy`
- Docker setup includes all dependencies

---

## Out of Scope for MVP

- social login
- email verification
- password reset emails
- advanced analytics
- media upload for questions
- team mode
- multi-tenant organizations
- localization
- payment support

---

## Suggested Repo Structure

```text
root/
  api/
  web/
  docker/
  Makefile
  docker-compose.yml
  README.md