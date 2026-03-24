import { Camera, Image as ImageIcon, Trash2 } from "@tamagui/lucide-icons";
import * as FileSystem from "expo-file-system";
import {
  launchCameraAsync,
  launchImageLibraryAsync,
  MediaType,
  useCameraPermissions,
  useMediaLibraryPermissions,
} from "expo-image-picker";
import { Image, StyleSheet } from "react-native";
import { Button, Text, XStack, YStack } from "tamagui";

// Persistent directory for product photos
const PHOTOS_DIR = FileSystem.documentDirectory + "product-photos/";

/** Copy a picked image to the persistent documents directory. */
async function persistImage(cacheUri: string): Promise<string> {
  const dirInfo = await FileSystem.getInfoAsync(PHOTOS_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true });
  }
  const filename = `photo_${Date.now()}.jpg`;
  const destUri = PHOTOS_DIR + filename;
  await FileSystem.copyAsync({ from: cacheUri, to: destUri });
  return destUri;
}

/** Delete a previously persisted photo. */
async function deletePersistedImage(uri: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri);
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
 * Reusable photo picker component.
 * Shows the current photo (or a placeholder) and gives the user two buttons:
 * "Cámara" and "Galería". When a photo is already set a third "Eliminar foto"
 * button is shown.
 *
 * Uses expo-image-picker. Requests permissions lazily before each launch.
 */
export function PhotoPicker({ uri, onChange }: PhotoPickerProps) {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [libraryPermission, requestLibraryPermission] =
    useMediaLibraryPermissions();

  const pickFromCamera = async () => {
    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) return;
    }

    const result = await launchCameraAsync({
      mediaTypes: "images" as MediaType,
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled && result.assets.length > 0) {
      const persisted = await persistImage(result.assets[0].uri);
      if (uri) await deletePersistedImage(uri);
      onChange(persisted);
    }
  };

  const pickFromLibrary = async () => {
    if (!libraryPermission?.granted) {
      const { granted } = await requestLibraryPermission();
      if (!granted) return;
    }

    const result = await launchImageLibraryAsync({
      mediaTypes: "images" as MediaType,
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled && result.assets.length > 0) {
      const persisted = await persistImage(result.assets[0].uri);
      if (uri) await deletePersistedImage(uri);
      onChange(persisted);
    }
  };

  return (
    <YStack gap="$2">
      {/* Preview / placeholder */}
      <YStack bg="$color2" style={styles.preview} overflow="hidden">
        {uri ? (
          <Image source={{ uri }} style={styles.image} resizeMode="cover" />
        ) : (
          <YStack style={styles.placeholder} gap="$2">
            <ImageIcon size={40} color="$color8" />
            <Text fontSize="$2" color="$color8">
              Sin foto
            </Text>
          </YStack>
        )}
      </YStack>

      {/* Action buttons */}
      <XStack gap="$2">
        <Button
          flex={1}
          size="$3"
          theme="gray"
          icon={Camera}
          onPress={pickFromCamera}
        >
          Cámara
        </Button>
        <Button
          flex={1}
          size="$3"
          theme="gray"
          icon={ImageIcon}
          onPress={pickFromLibrary}
        >
          Galería
        </Button>
        {uri && (
          <Button
            size="$3"
            theme="red"
            icon={Trash2}
            onPress={() => {
              if (uri) deletePersistedImage(uri);
              onChange(null);
            }}
          />
        )}
      </XStack>
    </YStack>
  );
}

const styles = StyleSheet.create({
  preview: {
    width: "100%",
    height: 180,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    alignItems: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
});
