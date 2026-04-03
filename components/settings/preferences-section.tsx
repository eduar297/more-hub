import { PinPromptDialog } from "@/components/ui/pin-prompt-dialog";
import { useAuth } from "@/contexts/auth-context";
import { useDevice } from "@/contexts/device-context";
import { usePreferences } from "@/contexts/preferences-context";
import { useStore } from "@/contexts/store-context";
import { resetDatabase, seedSimulation } from "@/database/seed-simulation";
import { useColors } from "@/hooks/use-colors";
import { useUserRepository } from "@/hooks/use-user-repository";
import { hashPin } from "@/utils/auth";
import {
    Database,
    Play,
    RefreshCw,
    Store,
    Trash2,
    TriangleAlert,
} from "@tamagui/lucide-icons";
import { useSQLiteContext } from "expo-sqlite";
import React, { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { settingStyles as styles } from "./shared";

export function PreferencesSection() {
  const c = useColors();
  const db = useSQLiteContext();
  const { showStoreBubble, setShowStoreBubble } = usePreferences();
  const { resetDevice } = useDevice();
  const { user } = useAuth();
  const userRepo = useUserRepository();
  const { refreshStores, setCurrentStore, currentStore } = useStore();

  const [resettingDb, setResettingDb] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedProgress, setSeedProgress] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinDialogMode, setPinDialogMode] = useState<
    "reset" | "seed" | "changeRole" | null
  >(null);

  const handleChangeRole = useCallback(() => {
    setPinDialogMode("changeRole");
    setPinDialogOpen(true);
  }, []);

  const verifyAdminPin = useCallback(
    async (pin: string): Promise<boolean> => {
      if (!user) return false;
      return userRepo.verifyPin(user.id, await hashPin(pin));
    },
    [user, userRepo],
  );

  const handleResetDb = useCallback(() => {
    setPinDialogMode("reset");
    setPinDialogOpen(true);
  }, []);

  const handleSeed = useCallback(() => {
    setPinDialogMode("seed");
    setPinDialogOpen(true);
  }, []);

  const handlePinConfirm = useCallback(
    async (pin: string) => {
      setPinDialogOpen(false);
      const valid = await verifyAdminPin(pin);
      if (!valid) {
        setError("PIN incorrecto");
        return;
      }
      if (pinDialogMode === "reset") {
        Alert.alert(
          "⚠️ Borrar base de datos",
          "Se eliminarán TODOS los datos: productos, tickets, compras, gastos, proveedores, trabajadores y fotos. Solo se conservará tu cuenta de administrador y las unidades del sistema.\n\n¿Estás completamente seguro?",
          [
            { text: "Cancelar", style: "cancel" },
            {
              text: "Sí, borrar todo",
              style: "destructive",
              onPress: async () => {
                setResettingDb(true);
                setError("");
                setSuccess("");
                try {
                  await resetDatabase(db);
                  setCurrentStore(null);
                  await refreshStores();
                  setSuccess("Base de datos limpiada correctamente");
                } catch (e) {
                  setError((e as Error).message ?? "Error al limpiar");
                } finally {
                  setResettingDb(false);
                }
              },
            },
          ],
        );
      } else if (pinDialogMode === "seed") {
        Alert.alert(
          "Sembrar datos de prueba",
          "Se creará un año completo de datos simulados: trabajadores, productos, compras, tickets y gastos.\n\nEs recomendable limpiar la base de datos primero.\n\n¿Continuar?",
          [
            { text: "Cancelar", style: "cancel" },
            {
              text: "Sí, sembrar datos",
              onPress: async () => {
                setSeeding(true);
                setError("");
                setSuccess("");
                setSeedProgress("Iniciando...");
                try {
                  await seedSimulation(db, currentStore!.id, (msg) =>
                    setSeedProgress(msg),
                  );
                  setSuccess("Simulación completada exitosamente");
                  setSeedProgress("");
                } catch (e) {
                  setError((e as Error).message ?? "Error al sembrar datos");
                  setSeedProgress("");
                } finally {
                  setSeeding(false);
                }
              },
            },
          ],
        );
      } else if (pinDialogMode === "changeRole") {
        Alert.alert(
          "Cambiar rol del dispositivo",
          "Esto borrará el rol de este dispositivo y volverás a la pantalla de selección. ¿Estás seguro?",
          [
            { text: "Cancelar", style: "cancel" },
            {
              text: "Sí, cambiar rol",
              style: "destructive",
              onPress: () => resetDevice(),
            },
          ],
        );
      }
    },
    [
      verifyAdminPin,
      pinDialogMode,
      db,
      refreshStores,
      setCurrentStore,
      currentStore,
    ],
  );

  return (
    <>
      <ScrollView contentContainerStyle={styles.profileContent}>
        {/* ── Preferences ────────────────────────────────────────────── */}
        <View
          style={[
            styles.profileCard,
            { backgroundColor: c.card, borderColor: c.border },
          ]}
        >
          <View style={styles.cardTitleRow}>
            <Store size={14} color={c.blue as any} />
            <Text style={[styles.cardTitle, { color: c.text }]}>Tienda</Text>
          </View>

          <View style={styles.prefRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.workerName, { color: c.text }]}>
                Burbuja de tienda activa
              </Text>
              <Text style={[styles.workerMeta, { color: c.muted }]}>
                Muestra un indicador flotante con la tienda actual en toda la
                app
              </Text>
            </View>
            <Switch
              value={showStoreBubble}
              onValueChange={setShowStoreBubble}
              trackColor={{ false: c.border, true: c.blue }}
              accessibilityLabel="Activar burbuja de tienda"
            />
          </View>
        </View>

        {/* ── Danger zone ────────────────────────────────────────────── */}
        <View
          style={[
            styles.profileCard,
            {
              backgroundColor: c.card,
              borderColor: c.danger,
              borderWidth: 1.5,
            },
          ]}
        >
          <View style={styles.cardTitleRow}>
            <TriangleAlert size={15} color={c.danger as any} />
            <Text style={[styles.cardTitle, { color: c.danger }]}>
              Zona peligrosa
            </Text>
          </View>

          {!!error && (
            <View style={[styles.feedbackRow, { backgroundColor: c.dangerBg }]}>
              <Text style={[styles.feedbackText, { color: c.danger }]}>
                {error}
              </Text>
            </View>
          )}
          {!!success && (
            <View
              style={[styles.feedbackRow, { backgroundColor: c.blueLight }]}
            >
              <Text style={[styles.feedbackText, { color: c.blue }]}>
                {success}
              </Text>
            </View>
          )}

          {/* Reset DB */}
          <View style={styles.dangerBlock}>
            <View style={styles.dangerInfo}>
              <View style={styles.cardTitleRow}>
                <Database size={14} color={c.danger as any} />
                <Text style={[styles.dangerLabel, { color: c.text }]}>
                  Limpiar base de datos
                </Text>
              </View>
              <Text style={[styles.dangerDesc, { color: c.muted }]}>
                Elimina todos los datos excepto tu cuenta y unidades del
                sistema.
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.dangerBtn,
                { borderColor: c.danger, opacity: resettingDb ? 0.7 : 1 },
              ]}
              onPress={handleResetDb}
              disabled={resettingDb || seeding}
              activeOpacity={0.8}
            >
              {resettingDb ? (
                <ActivityIndicator color={c.danger} size="small" />
              ) : (
                <>
                  <Trash2 size={14} color={c.danger as any} />
                  <Text style={[styles.dangerBtnText, { color: c.danger }]}>
                    Limpiar todo
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={[styles.dangerDivider, { backgroundColor: c.border }]} />

          {/* Seed simulation */}
          <View style={styles.dangerBlock}>
            <View style={styles.dangerInfo}>
              <View style={styles.cardTitleRow}>
                <Play size={14} color={c.blue as any} />
                <Text style={[styles.dangerLabel, { color: c.text }]}>
                  Sembrar datos de prueba
                </Text>
              </View>
              <Text style={[styles.dangerDesc, { color: c.muted }]}>
                Genera un año de datos simulados: 4 trabajadores, 44 productos,
                5 proveedores, compras, tickets diarios y gastos.
              </Text>
            </View>
            {!!seedProgress && (
              <View
                style={[styles.feedbackRow, { backgroundColor: c.blueLight }]}
              >
                <ActivityIndicator color={c.blue} size="small" />
                <Text style={[styles.feedbackText, { color: c.blue }]}>
                  {seedProgress}
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={[
                styles.seedBtn,
                { backgroundColor: c.blue, opacity: seeding ? 0.7 : 1 },
              ]}
              onPress={handleSeed}
              disabled={seeding || resettingDb}
              activeOpacity={0.8}
            >
              {seeding ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Play size={14} color="#fff" />
                  <Text style={styles.btnSolidText}>Iniciar simulación</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={[styles.dangerDivider, { backgroundColor: c.border }]} />

          {/* Change device role */}
          <View style={styles.dangerBlock}>
            <View style={styles.dangerInfo}>
              <View style={styles.cardTitleRow}>
                <RefreshCw size={14} color={c.danger as any} />
                <Text style={[styles.dangerLabel, { color: c.text }]}>
                  Cambiar rol del dispositivo
                </Text>
              </View>
              <Text style={[styles.dangerDesc, { color: c.muted }]}>
                Borra el rol asignado y vuelve a la pantalla de selección.
                Requiere reactivación para administrador.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.dangerBtn, { borderColor: c.danger }]}
              onPress={handleChangeRole}
              activeOpacity={0.8}
            >
              <RefreshCw size={14} color={c.danger as any} />
              <Text style={[styles.dangerBtnText, { color: c.danger }]}>
                Cambiar rol
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      <PinPromptDialog
        open={pinDialogOpen}
        title="🔐 Confirmar identidad"
        description={
          pinDialogMode === "reset"
            ? "Ingresa tu PIN de administrador para limpiar la base de datos"
            : pinDialogMode === "seed"
            ? "Ingresa tu PIN de administrador para sembrar datos de prueba"
            : "Ingresa tu PIN de administrador para cambiar el rol del dispositivo"
        }
        onConfirm={handlePinConfirm}
        onCancel={() => setPinDialogOpen(false)}
      />
    </>
  );
}
