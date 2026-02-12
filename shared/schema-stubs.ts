// STUB definitions for tables referenced in storage.ts but don't exist in actual schema
// These are minimal stubs to allow compilation - they should NOT be used in production
import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

// API Webhooks stub
export const apiWebhooks = pgTable("api_webhooks_stub", {
    id: serial("id").primaryKey(),
    companyId: integer("company_id"),
    url: text("url"),
    events: jsonb("events"),
    createdAt: timestamp("created_at").defaultNow(),
});

export type ApiWebhook = typeof apiWebhooks.$inferSelect;
export type InsertApiWebhook = typeof apiWebhooks.$inferInsert;

// Calendar Bookings stub
export const calendarBookings = pgTable("calendar_bookings_stub", {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    companyId: integer("company_id"),
    calendarType: text("calendar_type"),
    eventId: text("event_id"),
    createdAt: timestamp("created_at").defaultNow(),
});

export type CalendarBooking = typeof calendarBookings.$inferSelect;
export type InsertCalendarBooking = typeof calendarBookings.$inferInsert;

// Pipelines stub
export const pipelines = pgTable("pipelines_stub", {
    id: serial("id").primaryKey(),
    companyId: integer("company_id"),
    name: text("name"),
    createdAt: timestamp("created_at").defaultNow(),
});

export type Pipeline = typeof pipelines.$inferSelect;
export type InsertPipeline = typeof pipelines.$inferInsert;

// Pipeline Stage Reverts stub
export const pipelineStageReverts = pgTable("pipeline_stage_reverts_stub", {
    id: serial("id").primaryKey(),
    dealId: integer("deal_id"),
    scheduleId: text("schedule_id"),
    createdAt: timestamp("created_at").defaultNow(),
});

export type PipelineStageRevert = typeof pipelineStageReverts.$inferSelect;
export type InsertPipelineStageRevert = typeof pipelineStageReverts.$inferInsert;

// Pipeline Stage Revert Logs stub
export const pipelineStageRevertLogs = pgTable("pipeline_stage_revert_logs_stub", {
    id: serial("id").primaryKey(),
    scheduleId: text("schedule_id"),
    status: text("status"),
    createdAt: timestamp("created_at").defaultNow(),
});

export type PipelineStageRevertLog = typeof pipelineStageRevertLogs.$inferSelect;
export type InsertPipelineStageRevertLog = typeof pipelineStageRevertLogs.$inferInsert;

// Company Custom Fields stub
export const companyCustomFields = pgTable("company_custom_fields_stub", {
    id: serial("id").primaryKey(),
    companyId: integer("company_id"),
    fieldName: text("field_name"),
    createdAt: timestamp("created_at").defaultNow(),
});
