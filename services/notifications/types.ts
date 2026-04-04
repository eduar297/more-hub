/** Notification categories — each has its own default behaviour */
export type NotificationCategory =
  | "sync_reminder" // scheduled reminders to sync with workers
  | "sync_result" // outcome of a completed sync
  | "stock_alert" // low-stock / out-of-stock warnings
  | "general"; // catch-all for anything else

/** Severity drives the toast colour / icon */
export type NotificationSeverity = "info" | "success" | "warning" | "error";

/** Payload that flows through the entire system */
export interface AppNotification {
  id: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body: string;
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Extra data for handlers */
  data?: Record<string, unknown>;
}

/** A recurring reminder definition persisted in app_settings */
export interface ScheduledReminder {
  id: string;
  /** Label shown in settings */
  label: string;
  /** Cron-like hour (0-23) */
  hour: number;
  /** Cron-like minute (0-59) */
  minute: number;
  /** Whether the reminder is active */
  enabled: boolean;
  /** Notification category */
  category: NotificationCategory;
  /** Body text shown in the notification */
  body: string;
  /** Whether the user can delete this reminder (false for built-in sync reminders) */
  deletable?: boolean;
}

/** Keys for notification preferences stored in app_settings */
export type NotificationPrefKey =
  | "notif_sync_reminder"
  | "notif_sync_result"
  | "notif_stock_alert"
  | "notif_general";

/** Map of pref keys → enabled */
export type NotificationPrefs = Record<NotificationPrefKey, boolean>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  notif_sync_reminder: true,
  notif_sync_result: true,
  notif_stock_alert: true,
  notif_general: true,
};

/** Default sync reminders that ship with a fresh install */
export const DEFAULT_SYNC_REMINDERS: ScheduledReminder[] = [
  {
    id: "sync_open",
    label: "Sincronizar al abrir",
    hour: 8,
    minute: 0,
    enabled: true,
    category: "sync_reminder",
    body: "Es hora de sincronizar con los vendedores antes de iniciar la jornada.",
    deletable: false,
  },
  {
    id: "sync_close",
    label: "Sincronizar al cerrar",
    hour: 18,
    minute: 0,
    enabled: true,
    category: "sync_reminder",
    body: "Recuerda sincronizar para recoger los tickets del día.",
    deletable: false,
  },
];
