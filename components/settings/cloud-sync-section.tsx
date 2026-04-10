import { useDevice } from "@/contexts/device-context";
import { useStore } from "@/contexts/store-context";
import { useColors } from "@/hooks/use-colors";
import type { CloudSyncProgress } from "@/services/supabase/cloud-sync";
import {
    downloadFromCloud,
    isCloudSyncAvailable,
    uploadToCloud,
} from "@/services/supabase/cloud-sync";
import {
    AlertCircle,
    ArrowDownToLine,
    ArrowUpFromLine,
    CheckCircle,
    CloudOff,
} from "@tamagui/lucide-icons";
import { useSQLiteContext } from "expo-sqlite";
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

type SyncState =
  | "idle"
  | "checking"
  | "uploading"
  | "downloading"
  | "done"
  | "error";

export function CloudSyncSection() {
  const c = useColors();
  const db = useSQLiteContext();
  const { businessId, deviceId } = useDevice();
  const { refreshStores, setCurrentStore } = useStore();

  const [available, setAvailable] = useState<boolean | null>(null);
  const [state, setState] = useState<SyncState>("idle");
  const [progress, setProgress] = useState<CloudSyncProgress | null>(null);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string>("");

  // Check availability on mount
  useEffect(() => {
    isCloudSyncAvailable().then(setAvailable);
  }, []);

  const handleProgress = useCallback((p: CloudSyncProgress) => {
    setProgress(p);
    if (p.phase === "done") {
      setState("done");
    } else if (p.phase === "error") {
      setState("error");
    }
  }, []);

  const handleUpload = useCallback(() => {
    if (!businessId) {
      setError("No hay negocio activado");
      return;
    }

    Alert.alert(
      "Respaldo en la nube",
      "Se subirán todos los datos de este dispositivo a la nube. Los datos existentes en la nube para este negocio serán reemplazados.\n\n¿Continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí, respaldar",
          onPress: async () => {
            setState("uploading");
            setError("");
            setResult("");
            setProgress(null);

            const res = await uploadToCloud(
              db,
              businessId,
              deviceId,
              handleProgress,
            );

            if (res.success) {
              setState("done");
              const photoInfo =
                (res.photosUploaded ?? 0) > 0
                  ? `\n📷 ${res.photosUploaded} foto(s) subida(s)`
                  : "";
              const skippedInfo =
                (res.photosSkipped ?? 0) > 0
                  ? ` (${res.photosSkipped} sin cambios)`
                  : "";
              setResult(
                `Respaldo exitoso: ${res.rowsUploaded} registros en ${res.tablesUploaded} tablas${photoInfo}${skippedInfo}`,
              );
            } else {
              setState("error");
              setError(res.error ?? "Error desconocido");
            }
          },
        },
      ],
    );
  }, [db, businessId, deviceId, handleProgress]);

  const handleDownload = useCallback(() => {
    if (!businessId) {
      setError("No hay negocio activado");
      return;
    }

    Alert.alert(
      "⚠️ Restaurar desde la nube",
      "Se BORRARÁN todos los datos locales y se reemplazarán con los de la nube.\n\nEsta acción no se puede deshacer.\n\n¿Estás seguro?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí, restaurar",
          style: "destructive",
          onPress: async () => {
            setState("downloading");
            setError("");
            setResult("");
            setProgress(null);

            // Clear current store so stale reference doesn't interfere
            setCurrentStore(null);

            const res = await downloadFromCloud(
              db,
              businessId,
              deviceId,
              handleProgress,
            );

            if (res.success) {
              await refreshStores();
              setState("done");
              const photoInfo =
                (res.photosDownloaded ?? 0) > 0
                  ? `\n📷 ${res.photosDownloaded} foto(s) descargada(s)`
                  : "";
              const skippedInfo =
                (res.photosSkipped ?? 0) > 0
                  ? ` (${res.photosSkipped} sin cambios)`
                  : "";
              setResult(
                `Restauración exitosa: ${res.rowsDownloaded} registros de ${res.tablesDownloaded} tablas${photoInfo}${skippedInfo}`,
              );
            } else {
              setState("error");
              setError(res.error ?? "Error desconocido");
            }
          },
        },
      ],
    );
  }, [
    db,
    businessId,
    deviceId,
    handleProgress,
    refreshStores,
    setCurrentStore,
  ]);

  const isBusy =
    state === "uploading" || state === "downloading" || state === "checking";

  // Not configured
  if (available === false) {
    return (
      <ScrollView
        style={[styles.root, { backgroundColor: c.bg }]}
        contentContainerStyle={styles.content}
      >
        <View style={styles.emptyBox}>
          <CloudOff size={40} color={c.muted as any} />
          <Text style={[styles.emptyText, { color: c.muted }]}>
            La sincronización en la nube no está configurada para este negocio.
            {"\n"}Contacta al administrador del sistema.
          </Text>
        </View>
      </ScrollView>
    );
  }

  // Loading
  if (available === null) {
    return (
      <View style={[styles.root, styles.centerBox, { backgroundColor: c.bg }]}>
        <ActivityIndicator color={c.blue} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: c.bg }]}
      contentContainerStyle={styles.content}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <Text style={[styles.headerTitle, { color: c.text }]}>
          Sincronización en la nube
        </Text>
        <Text style={[styles.headerSub, { color: c.muted }]}>
          Respalda tus datos o restaura desde un respaldo anterior
        </Text>
      </View>

      {/* Upload button */}
      <TouchableOpacity
        style={[
          styles.actionBtn,
          { backgroundColor: isBusy ? "#6b7280" : c.blue },
        ]}
        onPress={handleUpload}
        disabled={isBusy}
        activeOpacity={0.8}
      >
        {state === "uploading" ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <ArrowUpFromLine size={18} color="#fff" />
        )}
        <Text style={styles.actionBtnText}>Respaldar en la nube</Text>
      </TouchableOpacity>

      {/* Download button */}
      <TouchableOpacity
        style={[
          styles.actionBtn,
          styles.actionBtnOutline,
          {
            borderColor: c.blue,
            opacity: isBusy ? 0.6 : 1,
          },
        ]}
        onPress={handleDownload}
        disabled={isBusy}
        activeOpacity={0.8}
      >
        {state === "downloading" ? (
          <ActivityIndicator color={c.blue} size="small" />
        ) : (
          <ArrowDownToLine size={18} color={c.blue as any} />
        )}
        <Text style={[styles.actionBtnText, { color: c.blue }]}>
          Restaurar desde la nube
        </Text>
      </TouchableOpacity>

      {/* Progress card */}
      {progress && isBusy && (
        <View
          style={[
            styles.card,
            { backgroundColor: c.card, borderColor: c.border },
          ]}
        >
          <View style={styles.cardContent}>
            <ActivityIndicator color={c.blue} size="small" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.progressText, { color: c.text }]}>
                {progress.message}
              </Text>
              <Text style={[styles.progressMeta, { color: c.muted }]}>
                {progress.current}/{progress.total} tablas
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Result card */}
      {!!result && state === "done" && (
        <View
          style={[
            styles.card,
            { backgroundColor: c.card, borderColor: c.border },
          ]}
        >
          <View style={styles.cardContent}>
            <CheckCircle size={16} color="#22c55e" />
            <Text style={[styles.resultText, { color: c.text }]}>{result}</Text>
          </View>
        </View>
      )}

      {/* Error card */}
      {!!error && (
        <View
          style={[
            styles.card,
            { backgroundColor: c.card, borderColor: c.border },
          ]}
        >
          <View style={styles.cardContent}>
            <AlertCircle size={16} color="#ef4444" />
            <Text style={[styles.resultText, { color: "#ef4444" }]}>
              {error}
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  centerBox: {
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    paddingBottom: 16,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  headerTitle: { fontSize: 17, fontWeight: "600" },
  headerSub: { fontSize: 13 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionBtnOutline: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
  },
  actionBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
  },
  progressText: {
    fontSize: 13,
    fontWeight: "600",
  },
  progressMeta: {
    fontSize: 12,
  },
  resultText: {
    fontSize: 13,
    flex: 1,
  },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
});
