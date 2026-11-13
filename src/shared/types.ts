export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'decision';
export type Priority = 'low' | 'medium' | 'high';
export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assignee: string;
  summary: string | null;
  nextStep: string | null;
  sessionRef: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export type TaskEventType = 'created' | 'updated' | 'checkpoint' | 'decision_requested' | 'decision_resolved' | 'completed' | 'artifact';
export interface TaskEvent {
  id: string;
  taskId: string;
  type: TaskEventType;
  actor: string | null;
  content: string;
  data: Record<string, unknown>;
  createdAt: string;
}
export interface DecisionOption { id: string; label: string; description?: string }
export interface Decision {
  id: string;
  taskId: string;
  question: string;
  options: DecisionOption[];
  recommendation: string | null;
  status: 'pending' | 'resolved';
  answer: string | null;
  createdAt: string;
  resolvedAt: string | null;
}
export interface ApiError { error: { code: string; message: string } }
