import type {
  CreateStoryRequest,
  CreateStoryResponse,
  DecodeJdResponse,
  PracticeDefenseRequest,
  PracticeDefenseResponse,
  PracticeResponse,
  RecordProgressResponse,
  StoriesListResponse,
  StoryDTO,
  StudyDeckResponse,
  StudyRating,
} from '@assessiq/types';
import { api } from './client';

export const studyApi = {
  deck: () => api.get<StudyDeckResponse>('/study/deck'),
  recordProgress: (question_id: string, rating: StudyRating) =>
    api.post<RecordProgressResponse>('/study/progress', { question_id, rating }),
  practice: (question_id: string, answer_text: string, with_probe = false) =>
    api.post<PracticeResponse>('/study/practice', { question_id, answer_text, with_probe }),
  /** Score the follow-up and, when it went badly, bring the question forward. */
  practiceDefense: (body: PracticeDefenseRequest) =>
    api.post<PracticeDefenseResponse>('/study/practice/defense', body),
  decodeJd: (jd_text: string) => api.post<DecodeJdResponse>('/study/decode-jd', { jd_text }),
  listStories: () => api.get<StoriesListResponse>('/study/stories'),
  createStory: (body: CreateStoryRequest) => api.post<CreateStoryResponse>('/study/stories', body),
  updateStory: (id: string, patch: Partial<CreateStoryRequest> & { tags?: string[] }) =>
    api.put<StoryDTO>(`/study/stories/${id}`, patch),
  deleteStory: (id: string) => api.del(`/study/stories/${id}`),
};
