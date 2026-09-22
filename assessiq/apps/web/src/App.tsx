import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { Spinner } from './components/ui';
import AppShell from './components/layout/AppShell';
import CandidateLayout from './components/layout/CandidateLayout';

import LoginPage from './pages/auth/LoginPage';

import DashboardPage from './pages/interviewer/DashboardPage';
import QuestionBankPage from './pages/interviewer/QuestionBankPage';
import AssessmentBuilderPage from './pages/interviewer/AssessmentBuilderPage';
import AssessmentDetailPage from './pages/interviewer/AssessmentDetailPage';
import CandidatesPage from './pages/interviewer/CandidatesPage';
import CandidateDetailPage from './pages/interviewer/CandidateDetailPage';
import ReportPage from './pages/interviewer/ReportPage';
import IntegrationsPage from './pages/interviewer/IntegrationsPage';
import ScanPage from './pages/interviewer/ScanPage';
import DocumentGroundingPage from './pages/interviewer/DocumentGroundingPage';

import StudyDashboardPage from './pages/study/StudyDashboardPage';
import StudyModePage from './pages/study/StudyModePage';
import PracticePage from './pages/study/PracticePage';
import StoryBankPage from './pages/study/StoryBankPage';
import OnboardingPage from './pages/study/OnboardingPage';

import SharedReportPage from './pages/SharedReportPage';

import LinkLandingPage from './pages/candidate/LinkLandingPage';
import CandidateAssessmentPage from './pages/candidate/CandidateAssessmentPage';
import SubmittedPage from './pages/candidate/SubmittedPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* A shared report — public, read-only, and deliberately outside the
              app shell: no nav, no sidebar, no way into the account behind it. */}
          <Route path="/r/:token" element={<SharedReportPage />} />

          {/* Preview as candidate — the SAME components the candidate flow
              uses, behind the manager's login. Reusing them is the point: a
              preview made of lookalike screens stops being evidence of what
              the candidate will see the moment the two drift. */}
          <Route
            path="/preview/:assessmentId"
            element={
              <ProtectedRoute>
                <CandidateLayout><LinkLandingPage preview /></CandidateLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/preview/:assessmentId/session"
            element={
              <ProtectedRoute>
                <CandidateLayout><CandidateAssessmentPage preview /></CandidateLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/preview/:assessmentId/done"
            element={
              <ProtectedRoute>
                <CandidateLayout><SubmittedPage preview /></CandidateLayout>
              </ProtectedRoute>
            }
          />

          {/* Candidate flow (public, minimal chrome) */}
          <Route path="/a/:token" element={<CandidateLayout><LinkLandingPage /></CandidateLayout>} />
          <Route path="/a/:token/session" element={<CandidateLayout><CandidateAssessmentPage /></CandidateLayout>} />
          <Route path="/a/:token/done" element={<CandidateLayout><SubmittedPage /></CandidateLayout>} />

          {/* Authenticated app (interviewer + job seeker) */}
          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/bank" element={<QuestionBankPage />} />
            <Route path="/build" element={<AssessmentBuilderPage />} />
            <Route path="/assessments/:id" element={<AssessmentDetailPage />} />
            <Route path="/candidates" element={<CandidatesPage />} />
            <Route path="/candidates/:id" element={<CandidateDetailPage />} />
            <Route path="/reports/:id" element={<ReportPage />} />
            <Route path="/settings/integrations" element={<IntegrationsPage />} />
            <Route path="/scans/:id" element={<ScanPage />} />
            <Route path="/ground/document" element={<DocumentGroundingPage />} />

            <Route path="/study" element={<StudyDashboardPage />} />
            <Route path="/study/session" element={<StudyModePage />} />
            <Route path="/practice" element={<PracticePage />} />
            <Route path="/stories" element={<StoryBankPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
