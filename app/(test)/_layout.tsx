import { Stack } from "expo-router";
import React from "react";

export default function TestLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: true,
          title: "Panel Test",
        }}
      />
    </Stack>
  );
}
