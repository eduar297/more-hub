import {
    Camera,
    Image as ImageIcon,
    Trash2,
    Upload,
} from "@tamagui/lucide-icons";
import { Directory, File, Paths } from "expo-file-system";
import {
    launchCameraAsync,
    launchImageLibraryAsync,
    MediaType,
    useCameraPermissions,
} from "expo-image-picker";
import { useState } from "react";
import { Image, StyleSheet, TouchableOpacity } from "react-native";
import { Button, Spinner, Text, XStack, YStack } from "tamagui";

// Persistent directory for product photos
const PHOTOS_DIR = new Directory(Paths.document, "product-photos");

/** Copy a picked image to the persistent documents directory. */
function persistImage(cacheUri: string): string {
  if (!PHOTOS_DIR.exists) {
    PHOTOS_DIR.create();
  }
  const filename = `photo_${Date.now()}.jpg`;
  const source = new File(cacheUri);
  const dest = new File(PHOTOS_DIR, filename);
  source.copy(dest);
  return dest.uri;
}

/** Delete a previously persisted photo. */
function deletePersistedImage(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // ignore — file may already be gone
  }
}

// ── PhotoPicker ───────────────────────────────────────────────────────────────

export interface PhotoPickerProps {
  /** Current photo URI, or null if no photo is set. */
  uri: string | null;

  /** Called with the new URI after picking, or null when the photo is removed. */
  onChange: (uri: string | null) => void;
}

/**
 * Reusable photo picker component with improved UI/UX.
 * Features:
 * - Large clickable area for better accessibility
 * - Loading states for better feedback
 * - Modern design with rounded corners and shadows
 * - Intuitive button layout
 */
export function PhotoPicker({ uri, onChange }: PhotoPickerProps) {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isLoading, setIsLoading] = useState(false);

  const pickFromCamera = async () => {
    if (isLoading) return;

    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) return;
    }

    setIsLoading(true);
    try {
      const result = await launchCameraAsync({
        mediaTypes: "images" as MediaType,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        const persisted = persistImage(result.assets[0].uri);
        if (uri) deletePersistedImage(uri);
        onChange(persisted);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const pickFromLibrary = async () => {
    if (isLoading) return;

    setIsLoading(true);
    try {
      const result = await launchImageLibraryAsync({
        mediaTypes: "images" as MediaType,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        const persisted = persistImage(result.assets[0].uri);
        if (uri) deletePersistedImage(uri);
        onChange(persisted);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const removePhoto = () => {
    if (uri) deletePersistedImage(uri);
    onChange(null);
  };

  return (
    <YStack gap="$3">
      {/* Main preview area - clickable */}
      <TouchableOpacity
        onPress={pickFromLibrary}
        activeOpacity={0.8}
        disabled={isLoading}
        style={[styles.previewContainer, { opacity: isLoading ? 0.7 : 1 }]}
      >
        <YStack
          bg="$color2"
          borderColor="$borderColor"
          borderWidth={2}
          borderStyle={uri ? "solid" : "dashed"}
          style={styles.preview}
          overflow="hidden"
        >
          {isLoading ? (
            <YStack style={styles.loadingContainer} gap="$2">
              <Spinner size="large" color="$blue10" />
              <Text fontSize="$3" color="$color10">
                Procesando imagen...
              </Text>
            </YStack>
          ) : uri ? (
            <Image source={{ uri }} style={styles.image} resizeMode="cover" />
          ) : (
            <YStack style={styles.placeholder} gap="$3">
              <YStack
                bg="$blue3"
                style={styles.iconContainer}
                borderRadius={30}
              >
                <Upload size={32} color="$blue10" />
              </YStack>
              <YStack gap="$1" style={{ alignItems: "center" }}>
                <Text fontSize="$4" fontWeight="600" color="$color">
                  Agregar imagen
                </Text>
                <Text fontSize="$2" color="$color8" textAlign="center">
                  Toca para seleccionar desde galería
                </Text>
              </YStack>
            </YStack>
          )}
        </YStack>
      </TouchableOpacity>

      {/* Action buttons - only show if no image or show all options when there is an image */}
      {!uri ? (
        <XStack gap="$2">
          <Button
            flex={1}
            size="$4"
            theme="blue"
            variant="outlined"
            icon={Camera}
            onPress={pickFromCamera}
            disabled={isLoading}
          >
            Tomar foto
          </Button>
          <Button
            flex={1}
            size="$4"
            theme="blue"
            icon={ImageIcon}
            onPress={pickFromLibrary}
            disabled={isLoading}
          >
            Galería
          </Button>
        </XStack>
      ) : (
        <XStack gap="$2">
          <Button
            flex={1}
            size="$3.5"
            theme="gray"
            variant="outlined"
            icon={Camera}
            onPress={pickFromCamera}
            disabled={isLoading}
          >
            Cambiar
          </Button>
          <Button
            size="$3.5"
            theme="red"
            variant="outlined"
            icon={Trash2}
            onPress={removePhoto}
            disabled={isLoading}
          />
        </XStack>
      )}
    </YStack>
  );
}

const styles = StyleSheet.create({
  previewContainer: {
    width: "100%",
  },
  preview: {
    width: "100%",
    height: 200,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  iconContainer: {
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  image: {
    width: "100%",
    height: "100%",
  },
});
