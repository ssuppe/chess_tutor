import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function useHasHydrated(): boolean {
    return useSyncExternalStore(subscribe, () => true, () => false);
}
