// Interviewer identity returned to the client. No password_hash, ever.
export interface InterviewerUser {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
}

export interface AuthResponse {
  user: InterviewerUser;
}

export interface MeResponse extends InterviewerUser {
  created_at: string;
}
