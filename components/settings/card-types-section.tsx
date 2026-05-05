import { useNotifications } from "@/components/ui/notification-provider";
import { ICON_BTN_BG } from "@/constants/colors";
import { useCardTypeRepository } from "@/hooks/use-card-type-repository";
import { useColors } from "@/hooks/use-colors";
import { CUBA_CARD_TYPES, type CardType } from "@/models/card-type";
import { CreditCard, Edit3, Plus, Trash2, X } from "@tamagui/lucide-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Text as RNText,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Input, Text, XStack, YStack } from "tamagui";
import { settingStyles as styles } from "./shared";

interface EditCardTypeSheetProps {
  visible: boolean;
  cardType: CardType | null;
  onClose: () => void;
  onSave: (cardType: CardType) => void;
}

function EditCardTypeSheet({
  visible,
  cardType,
  onClose,
  onSave,
}: EditCardTypeSheetProps) {
  const c = useColors();
  const [name, setName] = useState(cardType?.name ?? "");
  const [description, setDescription] = useState(cardType?.description ?? "");
  const [cardNumber, setCardNumber] = useState(cardType?.cardNumber ?? "");
  const [isActive, setIsActive] = useState(cardType?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const cardTypeRepo = useCardTypeRepository();

  // Función para formatear el número de tarjeta con espacios cada 4 dígitos
  const formatCardNumber = useCallback((value: string) => {
    // Eliminar espacios y caracteres no numéricos excepto *
    const cleaned = value.replace(/[^\d*]/g, "");

    // Dividir en grupos de 4 caracteres
    const groups = cleaned.match(/.{1,4}/g) || [];

    // Unir con espacios, limitado a 19 caracteres (16 dígitos + 3 espacios)
    return groups.join(" ").substr(0, 19);
  }, []);

  const handleCardNumberChange = useCallback(
    (value: string) => {
      const formatted = formatCardNumber(value);
      setCardNumber(formatted);
    },
    [formatCardNumber],
  );

  useEffect(() => {
    if (cardType) {
      setName(cardType.name);
      setDescription(cardType.description ?? "");
      setCardNumber(formatCardNumber(cardType.cardNumber ?? ""));
      setIsActive(cardType.isActive);
    }
  }, [cardType, formatCardNumber]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert("Error", "El nombre es requerido");
      return;
    }

    // Validar número de tarjeta eliminando espacios
    const cleanCardNumber = cardNumber.replace(/\s/g, "");
    if (!cleanCardNumber.trim()) {
      Alert.alert("Error", "El número de tarjeta es requerido");
      return;
    }

    setSaving(true);
    try {
      let result: CardType;
      if (cardType) {
        result = await cardTypeRepo.update(cardType.id, {
          name: name.trim(),
          description: description.trim() || null,
          cardNumber: cleanCardNumber.trim(),
          isActive,
        });
      } else {
        result = await cardTypeRepo.create({
          name: name.trim(),
          description: description.trim() || null,
          cardNumber: cleanCardNumber.trim(),
          isActive,
        });
      }
      onSave(result);
    } catch {
      Alert.alert("Error", "No se pudo guardar el tipo de tarjeta");
    } finally {
      setSaving(false);
    }
  }, [name, description, cardNumber, isActive, cardType, cardTypeRepo, onSave]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        edges={["top", "bottom"]}
        style={[cardModalStyles.modalRoot, { backgroundColor: c.modalBg }]}
      >
        {/* Header */}
        <XStack
          px="$4"
          py="$3"
          style={{ alignItems: "center", justifyContent: "space-between" }}
          borderBottomWidth={1}
          borderBottomColor="$borderColor"
        >
          <XStack style={{ alignItems: "center" }} gap="$2">
            <CreditCard size={18} color="$blue10" />
            <Text fontSize="$5" fontWeight="bold" color="$color">
              {cardType ? "Editar tarjeta" : "Nueva tarjeta"}
            </Text>
          </XStack>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={8}
            style={cardModalStyles.closeBtn}
          >
            <X size={18} color="$color" />
          </TouchableOpacity>
        </XStack>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: 16,
            gap: 16,
          }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {/* Name */}
          <YStack gap="$1">
            <Text
              fontSize="$2"
              fontWeight="600"
              color="$color10"
              textTransform="uppercase"
              letterSpacing={0.5}
            >
              Nombre *
            </Text>
            <Input
              size="$4"
              value={name}
              onChangeText={setName}
              placeholder="Ej: Transfermóvil"
              maxLength={50}
              returnKeyType="next"
              autoCapitalize="words"
            />
          </YStack>

          {/* Card Number */}
          <YStack gap="$1">
            <Text
              fontSize="$2"
              fontWeight="600"
              color="$color10"
              textTransform="uppercase"
              letterSpacing={0.5}
            >
              Número de tarjeta *
            </Text>
            <Input
              size="$4"
              value={cardNumber}
              onChangeText={handleCardNumberChange}
              placeholder="Ej: 9528 1234 5678 9012"
              maxLength={19}
              returnKeyType="done"
              autoCapitalize="none"
              keyboardType="numeric"
            />
          </YStack>

          {/* Description */}
          <YStack gap="$1" mb={16}>
            <Text
              fontSize="$2"
              fontWeight="600"
              color="$color10"
              textTransform="uppercase"
              letterSpacing={0.5}
            >
              Descripción (opcional)
            </Text>
            <Input
              size="$4"
              value={description}
              onChangeText={setDescription}
              placeholder="Ej: Transferencias móviles"
              maxLength={100}
              multiline
              numberOfLines={3}
              style={{ minHeight: 80 }}
            />
          </YStack>

          {/* Active switch */}
          <View
            style={[
              styles.prefRow,
              {
                backgroundColor: c.rowBg,
                borderColor: c.border,
                borderWidth: 1,
                borderRadius: 12,
                padding: 12,
              },
            ]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <RNText style={[styles.workerName, { color: c.text }]}>
                Activa
              </RNText>
              <RNText style={[styles.workerMeta, { color: c.muted }]}>
                Las tarjetas activas aparecen en el checkout del vendedor
              </RNText>
            </View>
            <Switch
              value={isActive}
              onValueChange={setIsActive}
              trackColor={{ false: c.border, true: c.blue }}
              thumbColor={isActive ? "#fff" : c.muted}
            />
          </View>
        </ScrollView>

        {/* Save button */}
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: c.border,
            backgroundColor: c.modalBg,
          }}
        >
          <Button
            size="$4"
            theme="blue"
            disabled={
              saving || !name.trim() || !cardNumber.replace(/\s/g, "").trim()
            }
            onPress={handleSave}
            iconAfter={
              saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : undefined
            }
          >
            {saving
              ? "Guardando..."
              : cardType
              ? "Guardar cambios"
              : "Crear tarjeta"}
          </Button>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export function CardTypesSection() {
  const c = useColors();
  const { notify } = useNotifications();
  const cardTypeRepo = useCardTypeRepository();
  const [cardTypes, setCardTypes] = useState<CardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCardType, setEditingCardType] = useState<CardType | null>(null);
  const [showSheet, setShowSheet] = useState(false);

  const loadCardTypes = useCallback(async () => {
    try {
      const data = await cardTypeRepo.findAll();
      setCardTypes(data);
    } catch (error) {
      console.error("Error loading card types:", error);
    } finally {
      setLoading(false);
    }
  }, [cardTypeRepo]);

  useFocusEffect(
    useCallback(() => {
      loadCardTypes();
    }, [loadCardTypes]),
  );

  const handleEdit = useCallback((cardType: CardType) => {
    setEditingCardType(cardType);
    setShowSheet(true);
  }, []);

  const handleAdd = useCallback(() => {
    setEditingCardType(null);
    setShowSheet(true);
  }, []);

  const handleDelete = useCallback(
    (cardType: CardType) => {
      Alert.alert("Confirmar", `¿Eliminar "${cardType.name}"?`, [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              await cardTypeRepo.delete(cardType.id);
              setCardTypes((prev) =>
                prev.filter((ct) => ct.id !== cardType.id),
              );
              notify({
                category: "general",
                severity: "success",
                title: "Tarjeta eliminada",
                body: `${cardType.name} ha sido eliminada`,
              });
            } catch {
              Alert.alert("Error", "No se pudo eliminar la tarjeta");
            }
          },
        },
      ]);
    },
    [cardTypeRepo, notify],
  );

  const handleSave = useCallback(
    (savedCardType: CardType) => {
      setCardTypes((prev) => {
        const index = prev.findIndex((ct) => ct.id === savedCardType.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = savedCardType;
          return updated;
        }
        return [...prev, savedCardType];
      });

      setShowSheet(false);
      setEditingCardType(null);

      notify({
        category: "general",
        severity: "success",
        title: editingCardType ? "Tarjeta actualizada" : "Tarjeta creada",
        body: `${savedCardType.name} guardada exitosamente`,
      });
    },
    [editingCardType, notify],
  );

  const initializeCubanCards = useCallback(async () => {
    Alert.alert(
      "Añadir tarjetas",
      "¿Quieres añadir las tarjetas más comunes usadas en Cuba?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Añadir",
          onPress: async () => {
            try {
              const existingNames = new Set(cardTypes.map((ct) => ct.name));
              const newCards: CardType[] = [];

              for (const cubanCard of CUBA_CARD_TYPES) {
                if (!existingNames.has(cubanCard.name)) {
                  const created = await cardTypeRepo.create({
                    name: cubanCard.name,
                    description: cubanCard.description,
                    cardNumber: cubanCard.cardNumber,
                    isActive: true,
                  });
                  newCards.push(created);
                }
              }

              if (newCards.length > 0) {
                setCardTypes((prev) => [...prev, ...newCards]);
                notify({
                  category: "general",
                  severity: "success",
                  title: "Tarjetas añadidas",
                  body: `Se añadieron ${newCards.length} tarjetas`,
                });
              } else {
                notify({
                  category: "general",
                  severity: "info",
                  title: "Sin cambios",
                  body: "Las tarjetas ya existen en tu lista",
                });
              }
            } catch {
              Alert.alert("Error", "No se pudieron añadir las tarjetas");
            }
          },
        },
      ],
    );
  }, [cardTypes, cardTypeRepo, notify]);

  return (
    <View style={styles.sectionRoot}>
      {/* Action bar */}
      <View style={[styles.actionBar, { borderBottomColor: c.border }]}>
        <RNText style={[styles.statsText, { color: c.muted }]}>
          {cardTypes.length} tipo{cardTypes.length !== 1 ? "s" : ""} de tarjeta
          {cardTypes.length !== 1 ? "s" : ""}
        </RNText>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: c.blue }]}
          onPress={handleAdd}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Agregar tipo de tarjeta"
        >
          <Plus size={16} color="#fff" />
          <RNText style={styles.addBtnText}>Nuevo</RNText>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.listContent}>
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={c.blue} size="large" />
          </View>
        ) : cardTypes.length === 0 ? (
          <View style={styles.centerBox}>
            <View style={[styles.emptyIcon, { backgroundColor: c.blueLight }]}>
              <CreditCard size={34} color={c.blue as any} />
            </View>
            <RNText style={[styles.emptyTitle, { color: c.text }]}>
              Sin tipos de tarjetas
            </RNText>
            <RNText style={[styles.emptyDesc, { color: c.muted }]}>
              Añade tipos de tarjetas para que tus vendedores puedan especificar
              el método de pago exacto.
            </RNText>
            <TouchableOpacity
              style={[
                styles.addBtn,
                {
                  backgroundColor: c.green,
                  marginTop: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                },
              ]}
              onPress={initializeCubanCards}
              activeOpacity={0.8}
            >
              <CreditCard size={16} color="#fff" />
              <RNText style={styles.addBtnText}>Añadir tarjetas</RNText>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View
              style={[
                styles.listCard,
                { backgroundColor: c.rowBg, borderColor: c.border },
              ]}
            >
              {cardTypes.map((cardType, idx) => (
                <View key={cardType.id}>
                  {idx > 0 && (
                    <View
                      style={[styles.divider, { backgroundColor: c.divider }]}
                    />
                  )}
                  <View style={styles.workerRow}>
                    <View
                      style={[styles.avatar, { backgroundColor: c.blueLight }]}
                    >
                      <CreditCard size={18} color={c.blue as any} />
                    </View>
                    <View style={styles.workerInfo}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <RNText style={[styles.workerName, { color: c.text }]}>
                          {cardType.name}
                        </RNText>
                        {!cardType.isActive && (
                          <View
                            style={{
                              paddingHorizontal: 8,
                              paddingVertical: 2,
                              backgroundColor: c.muted + "20",
                              borderRadius: 6,
                            }}
                          >
                            <RNText
                              style={{
                                fontSize: 10,
                                color: c.muted,
                                fontWeight: "600",
                              }}
                            >
                              Inactiva
                            </RNText>
                          </View>
                        )}
                      </View>
                      {(cardType.description || cardType.cardNumber) && (
                        <RNText style={[styles.workerMeta, { color: c.muted }]}>
                          {[cardType.description, cardType.cardNumber]
                            .filter(Boolean)
                            .join(" • ")}
                        </RNText>
                      )}
                    </View>
                    <View style={styles.rowActions}>
                      <TouchableOpacity
                        style={[styles.iconBtn, { backgroundColor: c.editBg }]}
                        onPress={() => handleEdit(cardType)}
                        activeOpacity={0.7}
                        hitSlop={4}
                        accessibilityRole="button"
                        accessibilityLabel={`Editar ${cardType.name}`}
                      >
                        <Edit3 size={17} color={c.muted as any} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.iconBtn,
                          { backgroundColor: c.dangerBg },
                        ]}
                        onPress={() => handleDelete(cardType)}
                        activeOpacity={0.7}
                        hitSlop={4}
                        accessibilityRole="button"
                        accessibilityLabel={`Eliminar ${cardType.name}`}
                      >
                        <Trash2 size={17} color={c.danger as any} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[
                styles.addBtn,
                {
                  backgroundColor: c.green,
                  alignSelf: "center",
                  marginTop: 16,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                },
              ]}
              onPress={initializeCubanCards}
              activeOpacity={0.8}
            >
              <CreditCard size={16} color="#fff" />
              <RNText style={styles.addBtnText}>Añadir tarjetas</RNText>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <EditCardTypeSheet
        visible={showSheet}
        cardType={editingCardType}
        onClose={() => {
          setShowSheet(false);
          setEditingCardType(null);
        }}
        onSave={handleSave}
      />
    </View>
  );
}

const cardModalStyles = StyleSheet.create({
  modalRoot: { flex: 1 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ICON_BTN_BG,
    alignItems: "center",
    justifyContent: "center",
  },
});
