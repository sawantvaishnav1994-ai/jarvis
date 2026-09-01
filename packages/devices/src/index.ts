import type { Actor, DeviceTrust } from "@jarvis/identity";
export interface DeviceRecord {
    version: 1;
    id: string;
    ownerId: string;
    publicKey: string;
    trust: DeviceTrust;
    revocationGeneration: number;
}
export interface DeviceRegistry {
    enroll(actor: Actor, record: DeviceRecord): Promise<void>;
    revoke(actor: Actor, deviceId: string): Promise<void>;
}
