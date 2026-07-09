export type NotificationEvent =
  | { type: 'study_published'; studyId: number; projectId: number }
  | { type: 'voting_open'; studyId: number; projectId: number }
  | { type: 'voting_reminder'; studyId: number }
  | { type: 'study_approved'; studyId: number; projectId: number }
  | { type: 'study_rejected'; studyId: number; adminId: number; reason: string }
  | { type: 'study_changes_requested'; studyId: number; projectId: number }
  | { type: 'donation_online_confirmed'; donationId: number }
  | { type: 'donation_cash_approved'; donationId: number };
