// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const exports = sqliteTable('document_exports', {
 id: text('id').primaryKey(),
 owner: text('owner').notNull(),
 state: text('state').notNull(),
 docId: text('doc_id'),
 updated: integer('updated').notNull(),
});
export const drafts = sqliteTable('consultation_drafts', {
 id: text('id').primaryKey(),
 owner: text('owner').notNull(),
 recordKey: text('record_key').notNull(),
 content: text('content').notNull(),
 updated: integer('updated').notNull(),
});
