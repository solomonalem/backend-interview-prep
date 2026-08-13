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
import ReportPage from './pages/interviewer/ReportPage';
import IntegrationsPage from './pages/interviewer/IntegrationsPage';
import ScanPage from './pages/interviewer/ScanPage';

import StudyDashboardPage from './pages/study/StudyDashboardPage';
import StudyModePage from './pages/study/StudyModePage';
import PracticePage from './pages/study/PracticePage';
import StoryBankPage from './pages/study/StoryBankPage';
import OnboardingPage from './pages/study/OnboardingPage';

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
            <Route path="/reports/:id" element={<ReportPage />} />
            <Route path="/settings/integrations" element={<IntegrationsPage />} />
            <Route path="/scans/:id" element={<ScanPage />} />

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
