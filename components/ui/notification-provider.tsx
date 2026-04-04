import {
    cancelReminder,
    configureForegroundBehaviour,
    scheduleReminder,
    sendLocalNotification,
    setupNotifications,
} from "@/services/notifications/notification-service";
import type {
    NotificationCategory,
    NotificationPrefKey,
    NotificationPrefs,
    NotificationSeverity,
    ScheduledReminder,
} from "@/services/notifications/types";
import {
    DEFAULT_NOTIFICATION_PREFS,
    DEFAULT_SYNC_REMINDERS,
} from "@/services/notifications/types";
import { useSQLiteContext } from "expo-sqlite";
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

// ── History entry ───────────────────────────────────────────────────────────

export interface NotificationHistoryEntry {
  id: number;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body: string;
  dedupeKey: string | null;
  seen: number;
  createdAt: string;
}

// ── Context ─────────────────────────────────────────────────────────────────

interface NotificationContextValue {
  /** Fire a system notification (records to history, checks dedup) */
  notify: (opts: {
    category: NotificationCategory;
    severity: NotificationSeverity;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    /** If set, prevents sending the same dedupeKey within the dedup window */
    dedupeKey?: string;
  }) => void;
  /** Check stock levels and send alerts for low/out-of-stock products */
  checkStockAlerts: () => Promise<void>;
  /** Get current notification preferences */
  prefs: NotificationPrefs;
  /** Toggle a notification preference on/off */
  togglePref: (key: NotificationPrefKey, value: boolean) => Promise<void>;
  /** Get all reminders */
  reminders: ScheduledReminder[];
  /** Update a reminder (time, enabled, etc.) */
  updateReminder: (reminder: ScheduledReminder) => Promise<void>;
  /** Add a new custom reminder */
  addReminder: (reminder: ScheduledReminder) => Promise<void>;
  /** Delete a custom reminder (only if deletable) */
  deleteReminder: (id: string) => Promise<void>;
  /** Notification history entries (newest first) */
  history: NotificationHistoryEntry[];
  /** Reload history from DB */
  refreshHistory: () => Promise<void>;
  /** Clear all history */
  clearHistory: () => Promise<void>;
  /** Number of unseen notifications */
  unseenCount: number;
  /** Mark all history entries as seen */
  markAllSeen: () => Promise<void>;
  /** Whether system notification permission was granted */
  hasPermission: boolean;
}

const NotificationContext = createContext<NotificationContextValue>({
  notify: () => {},
  checkStockAlerts: async () => {},
  prefs: DEFAULT_NOTIFICATION_PREFS,
  togglePref: async () => {},
  reminders: [],
  updateReminder: async () => {},
  addReminder: async () => {},
  deleteReminder: async () => {},
  history: [],
  refreshHistory: async () => {},
  clearHistory: async () => {},
  unseenCount: 0,
  markAllSeen: async () => {},
  hasPermission: false,
});

export const useNotifications = () => useContext(NotificationContext);

// ── Pref key → category mapping ─────────────────────────────────────────────

const CATEGORY_TO_PREF: Record<NotificationCategory, NotificationPrefKey> = {
  sync_reminder: "notif_sync_reminder",
  sync_result: "notif_sync_result",
  stock_alert: "notif_stock_alert",
  general: "notif_general",
};

// ── Provider ────────────────────────────────────────────────────────────────

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const db = useSQLiteContext();
  const [hasPermission, setHasPermission] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>(
    DEFAULT_NOTIFICATION_PREFS,
  );
  const [reminders, setReminders] = useState<ScheduledReminder[]>([]);
  const [history, setHistory] = useState<NotificationHistoryEntry[]>([]);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  // ── Init: permissions + load saved prefs ──────────────────────────────
  useEffect(() => {
    (async () => {
      configureForegroundBehaviour();
      const granted = await setupNotifications();
      setHasPermission(granted);
    })();
  }, []);

  // Load prefs from DB
  useEffect(() => {
    (async () => {
      const rows = await db.getAllAsync<{ key: string; value: string }>(
        "SELECT key, value FROM app_settings WHERE key LIKE 'notif_%'",
      );
      if (rows.length > 0) {
        const loaded = { ...DEFAULT_NOTIFICATION_PREFS };
        for (const row of rows) {
          if (row.key in loaded) {
            loaded[row.key as NotificationPrefKey] = row.value === "1";
          }
        }
        setPrefs(loaded);
      }
    })();
  }, [db]);

  // Load reminders from DB
  useEffect(() => {
    (async () => {
      const row = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM app_settings WHERE key = ?",
        ["sync_reminders"],
      );
      if (row) {
        try {
          setReminders(JSON.parse(row.value));
        } catch {
          setReminders(DEFAULT_SYNC_REMINDERS);
        }
      } else {
        // First run — seed defaults
        setReminders(DEFAULT_SYNC_REMINDERS);
        await db.runAsync(
          "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)",
          "sync_reminders",
          JSON.stringify(DEFAULT_SYNC_REMINDERS),
        );
        // Schedule the defaults
        for (const r of DEFAULT_SYNC_REMINDERS) {
          await scheduleReminder(r);
        }
      }
    })();
  }, [db]);

  // ── Load history from DB ──────────────────────────────────────────────
  const refreshHistory = useCallback(async () => {
    try {
      const rows = await db.getAllAsync<NotificationHistoryEntry>(
        "SELECT * FROM notification_history ORDER BY createdAt DESC LIMIT 100",
      );
      setHistory(rows);
    } catch {
      // table may not exist yet on first run
    }
  }, [db]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const clearHistory = useCallback(async () => {
    await db.runAsync("DELETE FROM notification_history");
    setHistory([]);
  }, [db]);

  const unseenCount = useMemo(
    () => history.filter((h) => !h.seen).length,
    [history],
  );

  const markAllSeen = useCallback(async () => {
    try {
      await db.runAsync(
        "UPDATE notification_history SET seen = 1 WHERE seen = 0",
      );
      setHistory((prev) => prev.map((h) => ({ ...h, seen: 1 })));
    } catch {
      // ignore
    }
  }, [db]);

  // ── Record to history ─────────────────────────────────────────────────
  const recordToHistory = useCallback(
    async (
      category: NotificationCategory,
      severity: NotificationSeverity,
      title: string,
      body: string,
      dedupeKey?: string,
    ) => {
      try {
        await db.runAsync(
          "INSERT INTO notification_history (category, severity, title, body, dedupeKey) VALUES (?, ?, ?, ?, ?)",
          category,
          severity,
          title,
          body,
          dedupeKey ?? null,
        );
        refreshHistory();
      } catch {
        // ignore if table doesn't exist yet
      }
    },
    [db, refreshHistory],
  );

  // ── Check dedup (was this dedupeKey sent in the last 12 hours?) ───────
  const isDuplicate = useCallback(
    async (dedupeKey: string): Promise<boolean> => {
      try {
        const row = await db.getFirstAsync<{ cnt: number }>(
          "SELECT COUNT(*) as cnt FROM notification_history WHERE dedupeKey = ? AND createdAt > datetime('now', 'localtime', '-12 hours')",
          [dedupeKey],
        );
        return (row?.cnt ?? 0) > 0;
      } catch {
        return false;
      }
    },
    [db],
  );

  // ── Toggle pref ───────────────────────────────────────────────────────
  const togglePref = useCallback(
    async (key: NotificationPrefKey, value: boolean) => {
      setPrefs((prev) => ({ ...prev, [key]: value }));
      await db.runAsync(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)",
        key,
        value ? "1" : "0",
      );
    },
    [db],
  );

  // ── Update reminder ───────────────────────────────────────────────────
  const updateReminder = useCallback(
    async (updated: ScheduledReminder) => {
      const next = reminders.map((r) => (r.id === updated.id ? updated : r));
      setReminders(next);
      await db.runAsync(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)",
        "sync_reminders",
        JSON.stringify(next),
      );
      // Reschedule or cancel
      if (updated.enabled) {
        await scheduleReminder(updated);
      } else {
        await cancelReminder(updated.id);
      }
    },
    [db, reminders],
  );

  // ── Add custom reminder ───────────────────────────────────────────────
  const addReminder = useCallback(
    async (reminder: ScheduledReminder) => {
      const next = [...reminders, reminder];
      setReminders(next);
      await db.runAsync(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)",
        "sync_reminders",
        JSON.stringify(next),
      );
      if (reminder.enabled) {
        await scheduleReminder(reminder);
      }
    },
    [db, reminders],
  );

  // ── Delete custom reminder ────────────────────────────────────────────
  const deleteReminder = useCallback(
    async (id: string) => {
      const target = reminders.find((r) => r.id === id);
      if (!target || target.deletable === false) return;
      const next = reminders.filter((r) => r.id !== id);
      setReminders(next);
      await db.runAsync(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)",
        "sync_reminders",
        JSON.stringify(next),
      );
      await cancelReminder(id);
    },
    [db, reminders],
  );

  // ── Notify ────────────────────────────────────────────────────────────
  const notify = useCallback(
    (opts: {
      category: NotificationCategory;
      severity: NotificationSeverity;
      title: string;
      body: string;
      data?: Record<string, unknown>;
      dedupeKey?: string;
    }) => {
      const prefKey = CATEGORY_TO_PREF[opts.category];
      // Check if this category is enabled
      if (!prefsRef.current[prefKey]) return;

      const doSend = async () => {
        // Dedup check
        if (opts.dedupeKey) {
          const dup = await isDuplicate(opts.dedupeKey);
          if (dup) return;
        }

        // Record to history
        await recordToHistory(
          opts.category,
          opts.severity,
          opts.title,
          opts.body,
          opts.dedupeKey,
        );

        // System notification
        if (hasPermission) {
          sendLocalNotification({
            category: opts.category,
            severity: opts.severity,
            title: opts.title,
            body: opts.body,
            data: opts.data,
          });
        }
      };

      doSend();
    },
    [hasPermission, isDuplicate, recordToHistory],
  );

  // ── Stock alert check ─────────────────────────────────────────────────
  const checkStockAlerts = useCallback(async () => {
    if (!prefsRef.current.notif_stock_alert) return;

    try {
      const outOfStock = await db.getAllAsync<{
        name: string;
      }>("SELECT name FROM products WHERE stockBaseQty <= 0 AND visible = 1");

      const lowStock = await db.getAllAsync<{
        name: string;
        stockBaseQty: number;
      }>(
        "SELECT name, stockBaseQty FROM products WHERE stockBaseQty > 0 AND stockBaseQty <= 5 AND visible = 1",
      );

      // Build a fingerprint so we don't resend the same alert
      const oosKey = `stock_oos_${outOfStock.length}_${outOfStock
        .slice(0, 5)
        .map((p) => p.name)
        .join(",")}`;
      const lowKey = `stock_low_${lowStock.length}_${lowStock
        .slice(0, 5)
        .map((p) => `${p.name}:${p.stockBaseQty}`)
        .join(",")}`;

      if (outOfStock.length > 0) {
        const names =
          outOfStock.length <= 3
            ? outOfStock.map((p) => p.name).join(", ")
            : `${outOfStock
                .slice(0, 3)
                .map((p) => p.name)
                .join(", ")} y ${outOfStock.length - 3} más`;
        notify({
          category: "stock_alert",
          severity: "error",
          title: `${outOfStock.length} producto${
            outOfStock.length > 1 ? "s" : ""
          } agotado${outOfStock.length > 1 ? "s" : ""}`,
          body: names,
          dedupeKey: oosKey,
        });
      }

      if (lowStock.length > 0) {
        const names =
          lowStock.length <= 3
            ? lowStock.map((p) => `${p.name} (${p.stockBaseQty})`).join(", ")
            : `${lowStock
                .slice(0, 3)
                .map((p) => `${p.name} (${p.stockBaseQty})`)
                .join(", ")} y ${lowStock.length - 3} más`;
        notify({
          category: "stock_alert",
          severity: "warning",
          title: `${lowStock.length} producto${
            lowStock.length > 1 ? "s" : ""
          } con stock bajo`,
          body: names,
          dedupeKey: lowKey,
        });
      }
    } catch {
      // silently ignore DB errors during stock check
    }
  }, [db, notify]);

  // Run stock check once on mount (with a short delay to let DB init)
  useEffect(() => {
    const timer = setTimeout(() => {
      checkStockAlerts();
    }, 5000);
    return () => clearTimeout(timer);
  }, [checkStockAlerts]);

  const value = useMemo(
    () => ({
      notify,
      checkStockAlerts,
      prefs,
      togglePref,
      reminders,
      updateReminder,
      addReminder,
      deleteReminder,
      history,
      refreshHistory,
      clearHistory,
      unseenCount,
      markAllSeen,
      hasPermission,
    }),
    [
      notify,
      checkStockAlerts,
      prefs,
      togglePref,
      reminders,
      updateReminder,
      addReminder,
      deleteReminder,
      history,
      refreshHistory,
      clearHistory,
      unseenCount,
      markAllSeen,
      hasPermission,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}
