import type { RecentPrinter } from "@/contexts/printer-context";
import { usePrinter } from "@/contexts/printer-context";
import { useStore } from "@/contexts/store-context";
import { useColors } from "@/hooks/use-colors";
import {
  Bluetooth,
  Check,
  Clock,
  Printer,
  RefreshCw,
  TestTube2,
  Trash2,
  Unlink,
} from "@tamagui/lucide-icons";
import React, { useCallback } from "react";
import type { Device } from "react-native-ble-plx";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { settingStyles as shared } from "./shared";

// ── helpers ─────────────────────────────────────────────────────────────────

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Hace un momento";
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} día${days > 1 ? "s" : ""}`;
}

// ── sub-components ───────────────────────────────────────────────────────────

function ScanButton({
  scanning,
  hasDevices,
  onPress,
}: {
  scanning: boolean;
  hasDevices: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <TouchableOpacity
      style={[styles.primaryBtn, { backgroundColor: c.blue, opacity: scanning ? 0.7 : 1 }]}
      onPress={onPress}
      disabled={scanning}
      activeOpacity={0.85}
    >
      {scanning ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <>
          <Bluetooth size={15} color="#fff" />
          <Text style={styles.primaryBtnText}>
            {hasDevices ? "Buscar de nuevo" : "Buscar impresoras"}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

function DeviceRow({
  device,
  isSelected,
  onConnect,
}: {
  device: Device;
  isSelected: boolean;
  onConnect: (d: Device) => void;
}) {
  const c = useColors();
  return (
    <TouchableOpacity
      style={[
        styles.deviceRow,
        { backgroundColor: isSelected ? c.blueLight : c.input, borderColor: isSelected ? c.blue : c.border },
      ]}
      onPress={() => onConnect(device)}
      activeOpacity={0.85}
    >
      <Bluetooth size={14} color={(isSelected ? c.blue : c.muted) as any} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.deviceName, { color: c.text }]} numberOfLines={1}>
          {device.name ?? "Sin nombre"}
        </Text>
        <Text style={[styles.deviceId, { color: c.muted }]}>{device.id}</Text>
      </View>
      {isSelected && <Check size={16} color={c.blue as any} />}
    </TouchableOpacity>
  );
}

function RecentRow({
  recent,
  isActive,
  onConnect,
  onForget,
}: {
  recent: RecentPrinter;
  isActive: boolean;
  onConnect: (r: RecentPrinter) => void;
  onForget: (id: string) => void;
}) {
  const c = useColors();
  return (
    <View
      style={[
        styles.recentRow,
        { backgroundColor: isActive ? c.blueLight : c.input, borderColor: isActive ? c.blue : c.border },
      ]}
    >
      <TouchableOpacity
        style={styles.recentMain}
        onPress={() => onConnect(recent)}
        activeOpacity={0.85}
      >
        <Bluetooth size={14} color={(isActive ? c.blue : c.muted) as any} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.deviceName, { color: c.text }]} numberOfLines={1}>
            {recent.name}
          </Text>
          <View style={styles.recentMeta}>
            <Clock size={10} color={c.muted as any} />
            <Text style={[styles.deviceId, { color: c.muted }]}>
              {fmtRelative(recent.lastConnectedAt)}
            </Text>
            <Text style={[styles.deviceId, { color: c.muted }]}>
              · {recent.id.length > 20 ? `${recent.id.slice(0, 10)}…${recent.id.slice(-6)}` : recent.id}
            </Text>
          </View>
        </View>
        {isActive && <Check size={16} color={c.blue as any} />}
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.recentDelete, { borderLeftColor: c.border }]}
        onPress={() => onForget(recent.id)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Trash2 size={13} color={c.muted as any} />
      </TouchableOpacity>
    </View>
  );
}

// ── main component ───────────────────────────────────────────────────────────

export function PrinterSettingsCard() {
  const c = useColors();
  const { currentStore } = useStore();
  const {
    printerName,
    printerAddress,
    autoPrint,
    connected,
    scanning,
    printing,
    error,
    devices,
    recentPrinters,
    scan,
    connect,
    connectRecent,
    forget,
    forgetRecent,
    setAutoPrint,
    printTest,
  } = usePrinter();

  const isConfigured = !!printerAddress;

  const handleTest = useCallback(() => {
    printTest(currentStore?.name ?? null).catch(() => {});
  }, [printTest, currentStore]);

  const handleConnect = useCallback(
    (device: Device) => { connect(device).catch(() => {}); },
    [connect],
  );

  const handleConnectRecent = useCallback(
    (recent: RecentPrinter) => { connectRecent(recent).catch(() => {}); },
    [connectRecent],
  );

  const handleForgetRecent = useCallback(
    (id: string) => { forgetRecent(id).catch(() => {}); },
    [forgetRecent],
  );

  const recentNotInScan = recentPrinters.filter(
    (r) => !devices.some((d) => d.id === r.id),
  );

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Status card ─────────────────────────────────────────── */}
      <View style={[shared.profileCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={shared.cardTitleRow}>
          <Printer size={14} color={c.blue as any} />
          <Text style={[shared.cardTitle, { color: c.text }]}>Estado de la impresora</Text>
        </View>

        <View style={[styles.statusBox, { backgroundColor: c.input }]}>
          <View style={styles.statusHeader}>
            <Text style={[styles.statusLabel, { color: c.muted }]}>CONEXIÓN</Text>
            <View style={[styles.dot, { backgroundColor: connected ? c.green : isConfigured ? "#f59e0b" : c.muted }]} />
          </View>
          <Text style={[styles.statusValue, { color: c.text }]} numberOfLines={1}>
            {isConfigured ? (printerName ?? "Impresora guardada") : "Sin impresora configurada"}
          </Text>
          {isConfigured && (
            <Text style={[styles.statusMeta, { color: c.muted }]}>
              {printerAddress}
              {"  ·  "}
              {connected ? "Conectada ahora" : "Se conecta al imprimir"}
            </Text>
          )}
          {!isConfigured && (
            <Text style={[styles.statusMeta, { color: c.muted }]}>
              Buscá una impresora y conectala para empezar a imprimir tickets.
            </Text>
          )}
        </View>

        {!!error && (
          <View style={[shared.feedbackRow, { backgroundColor: c.dangerBg }]}>
            <Text style={[shared.feedbackText, { color: c.danger }]}>{error}</Text>
          </View>
        )}

        {/* Action row */}
        <View style={styles.btnRow}>
          <ScanButton
            scanning={scanning}
            hasDevices={devices.length > 0}
            onPress={scan}
          />
          {isConfigured && (
            <TouchableOpacity
              style={[styles.outlineBtn, { borderColor: c.border }]}
              onPress={() => forget()}
              activeOpacity={0.85}
            >
              <Unlink size={14} color={c.muted as any} />
              <Text style={[styles.outlineBtnText, { color: c.muted }]}>Quitar</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Test print */}
        <TouchableOpacity
          style={[
            styles.outlineBtn,
            { borderColor: c.border, opacity: printing || !isConfigured ? 0.45 : 1 },
          ]}
          onPress={handleTest}
          disabled={printing || !isConfigured}
          activeOpacity={0.85}
        >
          {printing ? (
            <ActivityIndicator color={c.text} size="small" />
          ) : (
            <>
              <TestTube2 size={14} color={c.text as any} />
              <Text style={[styles.outlineBtnText, { color: c.text }]}>Probar impresión</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Scan results ─────────────────────────────────────────── */}
      {devices.length > 0 && (
        <View style={[shared.profileCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={shared.cardTitleRow}>
            <Bluetooth size={14} color={c.blue as any} />
            <Text style={[shared.cardTitle, { color: c.text }]}>Encontradas</Text>
            <View style={[styles.badge, { backgroundColor: c.blueLight }]}>
              <Text style={[styles.badgeText, { color: c.blue }]}>{devices.length}</Text>
            </View>
            <TouchableOpacity
              style={[styles.rescanBtn, { borderColor: c.border }]}
              onPress={scan}
              disabled={scanning}
              activeOpacity={0.8}
            >
              {scanning ? (
                <ActivityIndicator size="small" color={c.muted} />
              ) : (
                <RefreshCw size={12} color={c.muted as any} />
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.deviceList}>
            {devices.map((d) => (
              <DeviceRow
                key={d.id}
                device={d}
                isSelected={d.id === printerAddress}
                onConnect={handleConnect}
              />
            ))}
          </View>
        </View>
      )}

      {/* ── Recent connections ───────────────────────────────────── */}
      {recentNotInScan.length > 0 && (
        <View style={[shared.profileCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={shared.cardTitleRow}>
            <Clock size={14} color={c.blue as any} />
            <Text style={[shared.cardTitle, { color: c.text }]}>Conexiones recientes</Text>
          </View>
          <Text style={[styles.sectionHint, { color: c.muted }]}>
            Toca para reconectar directamente sin escanear.
          </Text>
          <View style={styles.deviceList}>
            {recentNotInScan.map((r) => (
              <RecentRow
                key={r.id}
                recent={r}
                isActive={r.id === printerAddress}
                onConnect={handleConnectRecent}
                onForget={handleForgetRecent}
              />
            ))}
          </View>
        </View>
      )}

      {/* ── Preferences ─────────────────────────────────────────── */}
      <View style={[shared.profileCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={shared.cardTitleRow}>
          <Printer size={14} color={c.blue as any} />
          <Text style={[shared.cardTitle, { color: c.text }]}>Preferencias</Text>
        </View>

        <View style={shared.prefRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[shared.workerName, { color: c.text }]}>
              Imprimir automáticamente
            </Text>
            <Text style={[shared.workerMeta, { color: c.muted }]}>
              Imprime el ticket apenas se confirma la venta. Podés desactivarlo
              por venta en el momento del cobro.
            </Text>
          </View>
          <Switch
            value={autoPrint}
            onValueChange={setAutoPrint}
            trackColor={{ false: c.border, true: c.blue }}
            accessibilityLabel="Imprimir automáticamente al confirmar venta"
          />
        </View>
      </View>

      {/* ── Tips ────────────────────────────────────────────────── */}
      <View style={[shared.profileCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={shared.cardTitleRow}>
          <Text style={[shared.cardTitle, { color: c.muted }]}>Consejos</Text>
        </View>
        <Text style={[styles.tip, { color: c.muted }]}>
          • Encendé la impresora antes de buscar.
        </Text>
        <Text style={[styles.tip, { color: c.muted }]}>
          • La app usa Bluetooth Low Energy (BLE). Si tu impresora solo soporta
          Classic, usá el emparejamiento del sistema.
        </Text>
        <Text style={[styles.tip, { color: c.muted }]}>
          • Al imprimir por primera vez la app se conecta sola — no hace falta
          mantenerla emparejada todo el tiempo.
        </Text>
        <Text style={[styles.tip, { color: c.muted }]}>
          • Si la impresora no aparece al buscar, apagala, volvé a encenderla y
          buscá de nuevo.
        </Text>
      </View>
    </ScrollView>
  );
}

// ── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  statusBox: {
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  statusValue: {
    fontSize: 15,
    fontWeight: "600",
  },
  statusMeta: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  btnRow: {
    flexDirection: "row",
    gap: 8,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  outlineBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  rescanBtn: {
    marginLeft: "auto",
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  deviceList: {
    gap: 6,
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: "600",
  },
  deviceId: {
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  recentMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  recentMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap",
  },
  recentDelete: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  sectionHint: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: -6,
  },
  tip: {
    fontSize: 12,
    lineHeight: 18,
  },
});
