import { z } from "zod";
export const PermissionSchema = z.enum(["P0", "P1", "P2", "P3", "P4", "P5"]);
export type Permission = z.infer<typeof PermissionSchema>;
