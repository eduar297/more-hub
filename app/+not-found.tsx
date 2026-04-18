import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator } from "react-native";
import { Text, YStack } from "tamagui";

export default function NotFoundScreen() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to root after a brief delay so the router can stabilize
    const timer = setTimeout(() => router.replace("/"), 500);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <YStack flex={1} items="center" justify="center" bg="$background" gap="$3">
      <ActivityIndicator size="large" />
      <Text color="$color8" fontSize={14}>
        Redirigiendo...
      </Text>
    </YStack>
  );
}
