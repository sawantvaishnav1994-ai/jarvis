import {
    pgSchema,
    uuid,
    text,
    timestamp,
    integer,
    jsonb,
} from "drizzle-orm/pg-core";
export const memoryDomain = pgSchema("memory");
export const memories = memoryDomain.table("records", {
    id: uuid("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    projectId: text("project_id").notNull(),
    version: integer("version").notNull(),
    payload: text("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
export const eventDomain = pgSchema("events");
export const eventRecords = eventDomain.table("envelopes", {
    id: uuid("id").primaryKey(),
    type: text("type").notNull(),
    environment: text("environment").notNull(),
    actorId: text("actor_id").notNull(),
    correlationId: text("correlation_id").notNull(),
    payload: text("payload").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
});
export const auditDomain = pgSchema("audit");
export const auditRecords = auditDomain.table("entries", {
    id: uuid("id").primaryKey(),
    record: jsonb("record").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
export const policyAuditRecords = auditDomain.table("policy_entries", {
    id: uuid("id").primaryKey(),
    record: jsonb("record").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
