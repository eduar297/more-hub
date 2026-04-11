import { useDevice } from "@/contexts/device-context";
import { useStore } from "@/contexts/store-context";
import { useColors } from "@/hooks/use-colors";
import { DEFAULT_WEB_CONFIG, type WebConfig } from "@/models/web-config";
import { getWebConfig, updateWebConfig } from "@/services/supabase/web-config";
import {
    Check,
    Copy,
    ExternalLink,
    Eye,
    Globe,
    Moon,
    Palette,
    Phone,
    Save,
    Share2,
    Store as StoreIcon,
    Sun,
} from "@tamagui/lucide-icons";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    ScrollView,
    Share,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { runOnJS } from "react-native-reanimated";
import ColorPicker, {
    HueSlider,
    Panel1,
    Preview,
} from "reanimated-color-picker";
import { settingStyles as styles } from "./shared";

export function WebSection({ visible }: { visible?: boolean }) {
  const c = useColors();
  const { businessId, deviceId } = useDevice();
  const { stores } = useStore();
  const [copiedStoreId, setCopiedStoreId] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [webEnabled, setWebEnabled] = useState(false);
  const [webUrl, setWebUrl] = useState<string | null>(null);
  const [config, setConfig] = useState<WebConfig>({ ...DEFAULT_WEB_CONFIG });
  const prevVisible = useRef(false);
  const savedWebEnabled = useRef(false);
  const savedConfig = useRef<WebConfig>({ ...DEFAULT_WEB_CONFIG });

  const load = useCallback(async () => {
    if (!businessId || !deviceId) return;
    setLoading(true);
    setError("");
    try {
      const result = await getWebConfig(businessId, deviceId);
      setWebEnabled(result.webEnabled);
      setWebUrl(result.webUrl);
      setConfig(result.config);
      savedWebEnabled.current = result.webEnabled;
      savedConfig.current = result.config;
    } catch (e) {
      setError((e as Error).message ?? "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [businessId, deviceId]);

  // Reload every time the tab becomes visible
  useEffect(() => {
    if (visible && !prevVisible.current) {
      load();
    }
    prevVisible.current = !!visible;
  }, [visible, load]);

  const patch = useCallback(
    (partial: Partial<WebConfig>) =>
      setConfig((prev) => ({ ...prev, ...partial })),
    [],
  );

  const handleSave = useCallback(async () => {
    if (!businessId || !deviceId) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await updateWebConfig(businessId, deviceId, webEnabled, config);
      savedWebEnabled.current = webEnabled;
      savedConfig.current = config;
      setSuccess("Configuración guardada");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError((e as Error).message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [businessId, deviceId, webEnabled, config]);

  const handleToggleEnabled = useCallback(
    (val: boolean) => {
      const doToggle = async (newVal: boolean) => {
        if (!businessId || !deviceId) return;
        const prev = savedWebEnabled.current;
        setWebEnabled(newVal);
        savedWebEnabled.current = newVal;
        try {
          await updateWebConfig(businessId, deviceId, newVal, config);
        } catch (e) {
          // revert on failure
          setWebEnabled(prev);
          savedWebEnabled.current = prev;
          setError((e as Error).message ?? "Error al actualizar");
        }
      };

      if (val) {
        doToggle(true);
      } else {
        Alert.alert(
          "Desactivar página web",
          "Tu página web dejará de ser accesible. ¿Continuar?",
          [
            { text: "Cancelar", style: "cancel" },
            {
              text: "Desactivar",
              style: "destructive",
              onPress: () => doToggle(false),
            },
          ],
        );
      }
    },
    [businessId, deviceId, config],
  );

  if (loading) {
    return (
      <View style={[styles.centerBox, { backgroundColor: c.bg }]}>
        <ActivityIndicator color={c.blue} size="large" />
        <Text style={[styles.emptyTitle, { color: c.text }]}>Cargando…</Text>
      </View>
    );
  }

  const hasChanges =
    webEnabled !== savedWebEnabled.current ||
    JSON.stringify(config) !== JSON.stringify(savedConfig.current);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={styles.profileContent}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {/* ── Enable / Disable ─────────────────────────────────── */}
        <View
          style={[
            styles.profileCard,
            { backgroundColor: c.card, borderColor: c.border },
          ]}
        >
          <View style={styles.cardTitleRow}>
            <Globe size={14} color={c.blue as any} />
            <Text style={[styles.cardTitle, { color: c.text }]}>
              Página web
            </Text>
          </View>

          <View style={styles.prefRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.workerName, { color: c.text }]}>
                Activar página web
              </Text>
              <Text style={[styles.workerMeta, { color: c.muted }]}>
                Tu negocio tendrá una página pública con tu catálogo
              </Text>
            </View>
            <Switch
              value={webEnabled}
              onValueChange={handleToggleEnabled}
              trackColor={{ false: c.border, true: c.blue }}
            />
          </View>

          {webEnabled && webUrl && (
            <View style={{ gap: 12 }}>
              <View style={{ gap: 4 }}>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <StoreIcon size={14} color={c.muted as any} />
                  <Text style={[styles.fieldLabel, { color: c.muted }]}>
                    Cada tienda tiene su propia página web
                  </Text>
                </View>
                <Text style={[styles.workerMeta, { color: c.muted }]}>
                  Comparte el enlace de cada tienda para que tus clientes vean
                  su catálogo
                </Text>
              </View>

              {stores.map((store) => {
                const baseUrl = /^https?:\/\//i.test(webUrl)
                  ? webUrl
                  : `https://${webUrl}`;
                const storeUrl = `${baseUrl}/${store.id}`;
                const isCopied = copiedStoreId === store.id;

                return (
                  <View
                    key={store.id}
                    style={{
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: c.border,
                      backgroundColor: c.bg,
                      overflow: "hidden",
                    }}
                  >
                    {/* Store header */}
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        padding: 12,
                        borderBottomWidth: 1,
                        borderBottomColor: c.border,
                      }}
                    >
                      {store.logoUri ? (
                        <Image
                          source={{ uri: store.logoUri }}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                          }}
                        />
                      ) : (
                        <View
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            backgroundColor: store.color,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text
                            style={{
                              color: "#fff",
                              fontSize: 16,
                              fontWeight: "700",
                            }}
                          >
                            {store.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: "600",
                            color: c.text,
                          }}
                        >
                          {store.name}
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            color: c.muted,
                            marginTop: 1,
                          }}
                          numberOfLines={1}
                        >
                          {storeUrl}
                        </Text>
                      </View>
                    </View>

                    {/* Action buttons */}
                    <View
                      style={{
                        flexDirection: "row",
                        padding: 8,
                        gap: 8,
                      }}
                    >
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          paddingVertical: 10,
                          borderRadius: 10,
                          backgroundColor: c.blueLight,
                        }}
                        activeOpacity={0.7}
                        onPress={() => WebBrowser.openBrowserAsync(storeUrl)}
                      >
                        <Eye size={15} color={c.blue as any} />
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: c.blue,
                          }}
                        >
                          Preview
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{
                          flex: 1,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          paddingVertical: 10,
                          borderRadius: 10,
                          backgroundColor: isCopied ? c.greenLight : c.card,
                          borderWidth: isCopied ? 0 : 1,
                          borderColor: c.border,
                        }}
                        activeOpacity={0.7}
                        onPress={async () => {
                          try {
                            await Clipboard.setStringAsync(storeUrl);
                            setCopiedStoreId(store.id);
                            setTimeout(() => setCopiedStoreId(null), 2000);
                          } catch {
                            // Clipboard may not be available
                          }
                        }}
                      >
                        {isCopied ? (
                          <Check size={15} color={c.green as any} />
                        ) : (
                          <Copy size={15} color={c.text as any} />
                        )}
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: isCopied ? c.green : c.text,
                          }}
                        >
                          {isCopied ? "Copiado" : "Copiar"}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{
                          flex: 1,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          paddingVertical: 10,
                          borderRadius: 10,
                          backgroundColor: c.purpleLight,
                        }}
                        activeOpacity={0.7}
                        onPress={() => {
                          Share.share({
                            message: `Mira el catálogo de ${store.name}: ${storeUrl}`,
                            url: storeUrl,
                          });
                        }}
                      >
                        <Share2 size={15} color={c.purple as any} />
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: c.purple,
                          }}
                        >
                          Compartir
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

              {stores.length === 0 && (
                <View
                  style={{
                    paddingVertical: 20,
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <StoreIcon size={24} color={c.muted as any} />
                  <Text
                    style={[
                      styles.workerMeta,
                      { color: c.muted, textAlign: "center" },
                    ]}
                  >
                    No tienes tiendas creadas.{"\n"}Crea una en la sección de
                    Tiendas.
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* ── Branding ─────────────────────────────────────────── */}
        <View
          style={[
            styles.profileCard,
            { backgroundColor: c.card, borderColor: c.border },
          ]}
        >
          <View style={styles.cardTitleRow}>
            <Palette size={14} color={c.purple as any} />
            <Text style={[styles.cardTitle, { color: c.text }]}>Marca</Text>
          </View>

          <Field label="Eslogan" c={c}>
            <TextInput
              style={[styles.input, { color: c.text, borderColor: c.border }]}
              placeholderTextColor={c.muted}
              placeholder="La mejor tienda del barrio"
              value={config.tagline ?? ""}
              onChangeText={(t) => patch({ tagline: t })}
              returnKeyType="next"
              maxLength={80}
            />
          </Field>

          <Field label="Descripción" c={c}>
            <TextInput
              style={[
                styles.input,
                { color: c.text, borderColor: c.border, minHeight: 80 },
              ]}
              placeholderTextColor={c.muted}
              placeholder="Cuéntale a tus clientes de qué trata tu negocio…"
              value={config.description ?? ""}
              onChangeText={(t) => patch({ description: t })}
              multiline
              maxLength={300}
            />
          </Field>

          <Field label="Color principal" c={c}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setColorPickerOpen(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: c.border,
                paddingHorizontal: 14,
                paddingVertical: 12,
              }}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: config.primaryColor,
                }}
              />
              <Text style={{ fontSize: 15, color: c.text, fontWeight: "500" }}>
                {config.primaryColor}
              </Text>
            </TouchableOpacity>

            <Modal
              visible={colorPickerOpen}
              animationType="slide"
              transparent
              onRequestClose={() => setColorPickerOpen(false)}
            >
              <View
                style={{
                  flex: 1,
                  justifyContent: "flex-end",
                  backgroundColor: "rgba(0,0,0,0.4)",
                }}
              >
                <View
                  style={{
                    backgroundColor: c.card,
                    borderTopLeftRadius: 20,
                    borderTopRightRadius: 20,
                    padding: 20,
                    gap: 16,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "700",
                      color: c.text,
                      textAlign: "center",
                    }}
                  >
                    Elige un color
                  </Text>

                  <ColorPicker
                    value={config.primaryColor}
                    onComplete={({ hex }) => {
                      "worklet";
                      runOnJS(patch)({ primaryColor: hex });
                    }}
                    style={{ gap: 16 }}
                  >
                    <Preview hideInitialColor />
                    <Panel1 />
                    <HueSlider />
                  </ColorPicker>

                  <TouchableOpacity
                    onPress={() => setColorPickerOpen(false)}
                    activeOpacity={0.8}
                    style={{
                      backgroundColor: c.blue,
                      borderRadius: 14,
                      paddingVertical: 14,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}
                    >
                      Listo
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          </Field>
        </View>

        {/* ── Contact ─────────────────────────────────────────── */}
        <View
          style={[
            styles.profileCard,
            { backgroundColor: c.card, borderColor: c.border },
          ]}
        >
          <View style={styles.cardTitleRow}>
            <Phone size={14} color={c.green as any} />
            <Text style={[styles.cardTitle, { color: c.text }]}>Contacto</Text>
          </View>

          <Field label="Teléfono" c={c}>
            <TextInput
              style={[styles.input, { color: c.text, borderColor: c.border }]}
              placeholderTextColor={c.muted}
              placeholder="+58 412 1234567"
              value={config.phone ?? ""}
              onChangeText={(t) => patch({ phone: t })}
              keyboardType="phone-pad"
              returnKeyType="next"
            />
          </Field>

          <Field label="WhatsApp" c={c}>
            <TextInput
              style={[styles.input, { color: c.text, borderColor: c.border }]}
              placeholderTextColor={c.muted}
              placeholder="+58 412 1234567"
              value={config.whatsapp ?? ""}
              onChangeText={(t) => patch({ whatsapp: t })}
              keyboardType="phone-pad"
              returnKeyType="done"
            />
          </Field>
        </View>

        {/* ── Social ──────────────────────────────────────────── */}
        <View
          style={[
            styles.profileCard,
            { backgroundColor: c.card, borderColor: c.border },
          ]}
        >
          <View style={styles.cardTitleRow}>
            <ExternalLink size={14} color={c.orange as any} />
            <Text style={[styles.cardTitle, { color: c.text }]}>
              Redes sociales
            </Text>
          </View>

          <Field label="Instagram" c={c}>
            <TextInput
              style={[styles.input, { color: c.text, borderColor: c.border }]}
              placeholderTextColor={c.muted}
              placeholder="@mitienda"
              value={config.instagram ?? ""}
              onChangeText={(t) => patch({ instagram: t })}
              autoCapitalize="none"
              returnKeyType="next"
            />
          </Field>

          <Field label="Facebook" c={c}>
            <TextInput
              style={[styles.input, { color: c.text, borderColor: c.border }]}
              placeholderTextColor={c.muted}
              placeholder="facebook.com/mitienda"
              value={config.facebook ?? ""}
              onChangeText={(t) => patch({ facebook: t })}
              autoCapitalize="none"
              returnKeyType="next"
            />
          </Field>

          <Field label="TikTok" c={c}>
            <TextInput
              style={[styles.input, { color: c.text, borderColor: c.border }]}
              placeholderTextColor={c.muted}
              placeholder="@mitienda"
              value={config.tiktok ?? ""}
              onChangeText={(t) => patch({ tiktok: t })}
              autoCapitalize="none"
              returnKeyType="done"
            />
          </Field>
        </View>

        {/* ── Display options ──────────────────────────────────── */}
        <View
          style={[
            styles.profileCard,
            { backgroundColor: c.card, borderColor: c.border },
          ]}
        >
          <View style={styles.cardTitleRow}>
            <Globe size={14} color={c.blue as any} />
            <Text style={[styles.cardTitle, { color: c.text }]}>
              Opciones de visualización
            </Text>
          </View>

          <View style={styles.prefRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.workerName, { color: c.text }]}>
                Tema de la página
              </Text>
              <Text style={[styles.workerMeta, { color: c.muted }]}>
                Elige si tu página se muestra en modo claro u oscuro
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <TouchableOpacity
                onPress={() => patch({ theme: "light" })}
                activeOpacity={0.7}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  backgroundColor: config.theme === "light" ? c.blue : c.border,
                }}
              >
                <Sun
                  size={14}
                  color={config.theme === "light" ? "#fff" : (c.muted as any)}
                />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: config.theme === "light" ? "#fff" : c.muted,
                  }}
                >
                  Light
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => patch({ theme: "dark" })}
                activeOpacity={0.7}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  backgroundColor: config.theme === "dark" ? c.blue : c.border,
                }}
              >
                <Moon
                  size={14}
                  color={config.theme === "dark" ? "#fff" : (c.muted as any)}
                />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: config.theme === "dark" ? "#fff" : c.muted,
                  }}
                >
                  Dark
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.prefRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.workerName, { color: c.text }]}>
                Mostrar precios
              </Text>
              <Text style={[styles.workerMeta, { color: c.muted }]}>
                Los visitantes verán los precios de tus productos
              </Text>
            </View>
            <Switch
              value={config.showPrices}
              onValueChange={(v) => patch({ showPrices: v })}
              trackColor={{ false: c.border, true: c.blue }}
            />
          </View>

          <View style={styles.prefRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.workerName, { color: c.text }]}>
                Mostrar stock
              </Text>
              <Text style={[styles.workerMeta, { color: c.muted }]}>
                Los visitantes verán la disponibilidad de cada producto
              </Text>
            </View>
            <Switch
              value={config.showStock}
              onValueChange={(v) => patch({ showStock: v })}
              trackColor={{ false: c.border, true: c.blue }}
            />
          </View>
        </View>
      </ScrollView>

      {/* ── Floating Save ──────────────────────────────────── */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: c.border,
          backgroundColor: c.bg,
        }}
      >
        {!!error && (
          <View
            style={[
              styles.feedbackRow,
              { backgroundColor: c.dangerBg, marginBottom: 8 },
            ]}
          >
            <Text style={[styles.feedbackText, { color: c.danger }]}>
              {error}
            </Text>
          </View>
        )}
        {!!success && (
          <View
            style={[
              styles.feedbackRow,
              { backgroundColor: c.blueLight, marginBottom: 8 },
            ]}
          >
            <Text style={[styles.feedbackText, { color: c.blue }]}>
              {success}
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={[
            styles.btnSolidFull,
            {
              backgroundColor: c.blue,
              opacity: !hasChanges || saving ? 0.5 : 1,
            },
          ]}
          onPress={handleSave}
          disabled={!hasChanges || saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Save size={16} color="#fff" />
              <Text style={styles.btnSolidText}>Guardar cambios</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function Field({
  label,
  c,
  icon,
  children,
}: {
  label: string;
  c: ReturnType<typeof useColors>;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.formField}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {icon}
        <Text style={[styles.fieldLabel, { color: c.muted }]}>{label}</Text>
      </View>
      {children}
    </View>
  );
}
