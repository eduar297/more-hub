import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  type DeviceRole,
  clearActivation,
  clearDeviceRole,
  getActivationStatus,
  getDeviceId,
  getDeviceRole,
  saveActivation,
  setDeviceRole,
} from "@/utils/device";

interface DeviceContextValue {
  deviceId: string;
  deviceRole: DeviceRole | null;
  isActivated: boolean;
  businessId: string | null;
  isLoading: boolean;
  /** True after resetDevice() is called but before completeReset() finishes */
  isResetting: boolean;
  /** Select a role (Admin requires prior activation via activateAdmin) */
  selectRole: (role: DeviceRole) => Promise<void>;
  /** Activate as admin: saves businessId + sets role to ADMIN */
  activateAdmin: (businessId: string) => Promise<void>;
  /**
   * Phase 1 of reset: clears SecureStore but keeps deviceRole in React state.
   * This lets RoleShell keep providers alive while navigating away.
   */
  resetDevice: () => Promise<void>;
  /**
   * Phase 2 of reset: actually sets deviceRole to null in React state.
   * Call this AFTER navigating to "/" so providers can safely unmount.
   */
  completeReset: () => void;
}

const DeviceContext = createContext<DeviceContextValue>({
  deviceId: "",
  deviceRole: null,
  isActivated: false,
  businessId: null,
  isLoading: true,
  isResetting: false,
  selectRole: async () => {},
  activateAdmin: async () => {},
  resetDevice: async () => {},
  completeReset: () => {},
});

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [deviceId, setDeviceIdState] = useState("");
  const [deviceRole, setDeviceRoleState] = useState<DeviceRole | null>(null);
  const [isActivated, setIsActivated] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);

  // Load persisted state on mount
  useEffect(() => {
    (async () => {
      try {
        const [id, role, activation] = await Promise.all([
          getDeviceId(),
          getDeviceRole(),
          getActivationStatus(),
        ]);
        setDeviceIdState(id);
        setDeviceRoleState(role);
        setIsActivated(activation.activated);
        setBusinessId(activation.businessId);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const selectRole = useCallback(async (role: DeviceRole) => {
    await setDeviceRole(role);
    setDeviceRoleState(role);
  }, []);

  const activateAdmin = useCallback(async (bId: string) => {
    await saveActivation(bId);
    await setDeviceRole("ADMIN");
    setIsActivated(true);
    setBusinessId(bId);
    setDeviceRoleState("ADMIN");
  }, []);

  // Phase 1: clear SecureStore + flag, but keep deviceRole in React state
  const resetDevice = useCallback(async () => {
    await clearDeviceRole();
    await clearActivation();
    setIsResetting(true);
  }, []);

  // Phase 2: actually null-out React state (call AFTER navigating to "/")
  const completeReset = useCallback(() => {
    setDeviceRoleState(null);
    setIsActivated(false);
    setBusinessId(null);
    setIsResetting(false);
  }, []);

  const value = useMemo<DeviceContextValue>(
    () => ({
      deviceId,
      deviceRole,
      isActivated,
      businessId,
      isLoading,
      isResetting,
      selectRole,
      activateAdmin,
      resetDevice,
      completeReset,
    }),
    [
      deviceId,
      deviceRole,
      isActivated,
      businessId,
      isLoading,
      isResetting,
      selectRole,
      activateAdmin,
      resetDevice,
      completeReset,
    ],
  );

  return (
    <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>
  );
}

export function useDevice() {
  return useContext(DeviceContext);
}
