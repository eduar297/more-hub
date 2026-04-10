import { useDevice } from "@/contexts/device-context";
import { useColors } from "@/hooks/use-colors";
import { DEFAULT_WEB_CONFIG, type WebConfig } from "@/models/web-config";
import { getWebConfig, updateWebConfig } from "@/services/supabase/web-config";
import {
  ExternalLink,
  Eye,
  Globe,
  Instagram,
  Link,
  MessageCircle,
  Moon,
  Palette,
  Phone,
  Save,
  Sun,
  Type,
} from "@tamagui/lucide-icons";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { settingStyles as styles } from "./shared";

const COLOR_OPTIONS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#6366f1",
  "#14b8a6",
  "#f97316",
  "#06b6d4",
];

export function WebSection({ visible }: { visible?: boolean }) {
  const c = useColors();
  const { businessId, deviceId } = useDevice();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [webEnabled, setWebEnabled] = useState(false);
  const [webUrl, setWebUrl] = useState<string | null>(null);
  const [config, setConfig] = useState<WebConfig>({ ...DEFAULT_WEB_CONFIG });
  const prevVisible = useRef(false);

  const load = useCallback(async () => {
    if (!businessId || !deviceId) return;
    setLoading(true);
    setError("");
    try {
      const result = await getWebConfig(businessId, deviceId);
      setWebEnabled(result.webEnabled);
      setWebUrl(result.webUrl);
      setConfig(result.config);
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
      setSuccess("Configuración guardada");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError((e as Error).message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [businessId, deviceId, webEnabled, config]);

  const handleToggleEnabled = useCallback((val: boolean) => {
    if (val) {
      setWebEnabled(true);
    } else {
      Alert.alert(
        "Desactivar página web",
        "Tu página web dejará de ser accesible. ¿Continuar?",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Desactivar",
            style: "destructive",
            onPress: () => setWebEnabled(false),
          },
        ],
      );
    }
  }, []);

  if (loading) {
    return (
      <View style={[styles.centerBox, { backgroundColor: c.bg }]}>
        <ActivityIndicator color={c.blue} size="large" />
        <Text style={[styles.emptyTitle, { color: c.text }]}>Cargando…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.profileContent}>
      {/* ── Enable / Disable ─────────────────────────────────── */}
      <View
        style={[
          styles.profileCard,
          { backgroundColor: c.card, borderColor: c.border },
        ]}
      >
        <View style={styles.cardTitleRow}>
          <Globe size={14} color={c.blue as any} />
          <Text style={[styles.cardTitle, { color: c.text }]}>Página web</Text>
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
          <View
            style={[
              styles.prefRow,
              { backgroundColor: c.blueLight, borderRadius: 10, padding: 10 },
            ]}
          >
            <Link size={14} color={c.blue as any} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.fieldLabel, { color: c.muted }]}>
                URL de tu página
              </Text>
              <Text
                style={{ fontSize: 13, color: c.blue, fontWeight: "500" }}
                selectable
              >
                {webUrl}
              </Text>
            </View>
            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                backgroundColor: c.blue,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 8,
              }}
              activeOpacity={0.7}
              onPress={() => {
                const url = /^https?:\/\//i.test(webUrl)
                  ? webUrl
                  : `https://${webUrl}`;
                WebBrowser.openBrowserAsync(url);
              }}
            >
              <Eye size={14} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>
                Preview
              </Text>
            </TouchableOpacity>
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
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            {COLOR_OPTIONS.map((color) => (
              <TouchableOpacity
                key={color}
                onPress={() => patch({ primaryColor: color })}
                activeOpacity={0.7}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: color,
                  borderWidth: config.primaryColor === color ? 3 : 0,
                  borderColor: "#fff",
                }}
              />
            ))}
          </View>
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
          />
        </Field>

        <Field label="Dirección" c={c}>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border }]}
            placeholderTextColor={c.muted}
            placeholder="Av. Principal, Centro Comercial…"
            value={config.address ?? ""}
            onChangeText={(t) => patch({ address: t })}
            maxLength={200}
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

        <Field
          label="Instagram"
          c={c}
          icon={<Instagram size={14} color={c.muted as any} />}
        >
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border }]}
            placeholderTextColor={c.muted}
            placeholder="@mitienda"
            value={config.instagram ?? ""}
            onChangeText={(t) => patch({ instagram: t })}
            autoCapitalize="none"
          />
        </Field>

        <Field
          label="Facebook"
          c={c}
          icon={<Type size={14} color={c.muted as any} />}
        >
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border }]}
            placeholderTextColor={c.muted}
            placeholder="facebook.com/mitienda"
            value={config.facebook ?? ""}
            onChangeText={(t) => patch({ facebook: t })}
            autoCapitalize="none"
          />
        </Field>

        <Field
          label="TikTok"
          c={c}
          icon={<MessageCircle size={14} color={c.muted as any} />}
        >
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border }]}
            placeholderTextColor={c.muted}
            placeholder="@mitienda"
            value={config.tiktok ?? ""}
            onChangeText={(t) => patch({ tiktok: t })}
            autoCapitalize="none"
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

      {/* ── Feedback + Save ──────────────────────────────────── */}
      {!!error && (
        <View style={[styles.feedbackRow, { backgroundColor: c.dangerBg }]}>
          <Text style={[styles.feedbackText, { color: c.danger }]}>
            {error}
          </Text>
        </View>
      )}
      {!!success && (
        <View style={[styles.feedbackRow, { backgroundColor: c.blueLight }]}>
          <Text style={[styles.feedbackText, { color: c.blue }]}>
            {success}
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[
          styles.btnSolidFull,
          { backgroundColor: c.blue, opacity: saving ? 0.7 : 1 },
        ]}
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.8}
      >
        {saving ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Save size={16} color="#fff" />
            <Text style={styles.btnSolidText}>Guardar cambios</Text>
          </View>
        )}
      </TouchableOpacity>
    </ScrollView>
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
