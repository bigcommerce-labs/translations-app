import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "../drizzle-schema-sqlite";
import { eq, and, desc } from "drizzle-orm";
import type { DatabaseOperations, TranslationJob, TranslationError } from "./types";
import type { BaseUser, AuthSession } from "@/types";
import type { TranslationJob as SQLiteTranslationJob } from "../drizzle-schema-sqlite";

const { DATABASE_URL } = process.env;

// Helper to convert SQLite timestamps to Date objects
function convertTimestamps<T extends { createdAt: number }>(
  record: T,
): Omit<T, "createdAt"> & { createdAt: Date } {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
  };
}

export class SQLiteClient implements DatabaseOperations {
  protected db = drizzle(
    new Database(DATABASE_URL?.replace("sqlite:", "") || ":memory:"),
    { schema }
  );
  protected schema = schema;

  async hasStoreUser(storeHash: string, userId: number) {
    const result = await this.db
      .select()
      .from(this.schema.storeUsers)
      .where(
        and(
          eq(this.schema.storeUsers.storeHash, storeHash),
          eq(this.schema.storeUsers.userId, userId)
        )
      )
      .limit(1)
      .all();
    return result.length > 0;
  }

  async setUser(user: BaseUser) {
    if (!user) return;
    try {
      await this.db.insert(this.schema.users).values({
        userId: user.id,
        email: user.email,
        username: user.username,
      });
    } catch (error) {
      // If insert fails, try update
      await this.db
        .update(this.schema.users)
        .set({ email: user.email, username: user.username })
        .where(eq(this.schema.users.userId, user.id));
    }
  }

  async setStore(session: AuthSession) {
    if (!session.store_hash || !session.access_token || !session.account_uuid)
      return;
    try {
      await this.db.insert(this.schema.stores).values({
        storeHash: session.store_hash,
        accessToken: session.access_token,
        scope: session.scope,
        ownerId: session.owner.id,
        accountUuid: session.account_uuid,
      });
    } catch (error) {
      // If insert fails, try update
      await this.db
        .update(this.schema.stores)
        .set({
          accessToken: session.access_token,
          scope: session.scope,
          ownerId: session.owner.id,
          accountUuid: session.account_uuid,
        })
        .where(eq(this.schema.stores.storeHash, session.store_hash));
    }
  }

  async setStoreUser(session: AuthSession | { store_hash: string; user: BaseUser }) {
    if (!session.store_hash || !session.user?.id) return;
    try {
      await this.db.insert(this.schema.storeUsers).values({
        storeHash: session.store_hash,
        userId: session.user.id,
      });
    } catch (error) {
      // Ignore duplicate key errors
    }
  }

  async getStoreToken(storeHash: string | null) {
    if (!storeHash) return null;
    const result = await this.db
      .select({ accessToken: this.schema.stores.accessToken })
      .from(this.schema.stores)
      .where(eq(this.schema.stores.storeHash, storeHash))
      .limit(1)
      .all();
    return result[0]?.accessToken || null;
  }

  async deleteStore(storeHash: string) {
    if (!storeHash) return;
    await this.db
      .delete(this.schema.stores)
      .where(eq(this.schema.stores.storeHash, storeHash));
  }

  async deleteUser(storeHash: string, user: BaseUser) {
    if (!storeHash || !user) return;
    await this.db
      .delete(this.schema.storeUsers)
      .where(
        and(
          eq(this.schema.storeUsers.storeHash, storeHash),
          eq(this.schema.storeUsers.userId, user.id)
        )
      );
  }

  async getTranslationJobs(storeHash: string): Promise<TranslationJob[]> {
    const jobs = await this.db
      .select()
      .from(this.schema.translationJobs)
      .where(eq(this.schema.translationJobs.storeHash, storeHash))
      .orderBy(desc(this.schema.translationJobs.createdAt))
      .all();
    return jobs.map(convertTimestamps);
  }

  async createTranslationJob(data: {
    storeHash: string;
    jobType: 'import' | 'export';
    resourceType?: 'products' | 'categories';
    channelId: number;
    locale: string;
    fileUrl?: string;
    metadata?: any;
  }): Promise<TranslationJob> {
    const now = Date.now();
    const result = await this.db
      .insert(this.schema.translationJobs)
      .values({
        ...data,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      });
    
    const inserted = await this.db
      .select()
      .from(this.schema.translationJobs)
      .where(eq(this.schema.translationJobs.id, Number(result.lastInsertRowid)))
      .all();
    
    return convertTimestamps(inserted[0]);
  }

  async updateTranslationJob(id: number, data: Partial<TranslationJob>): Promise<TranslationJob> {
    // Convert createdAt and updatedAt from Date to number if they exist
    const dataToUpdate = {
      ...data,
      createdAt: data.createdAt instanceof Date ? data.createdAt.getTime() : data.createdAt,
      updatedAt: data.updatedAt instanceof Date ? data.updatedAt.getTime() : Date.now(),
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
    };

    await this.db
      .update(this.schema.translationJobs)
      .set(dataToUpdate)
      .where(eq(this.schema.translationJobs.id, id));

    const updated = await this.db
      .select()
      .from(this.schema.translationJobs)
      .where(eq(this.schema.translationJobs.id, id))
      .all();
    
    return convertTimestamps(updated[0]);
  }

  async getPendingTranslationJobs(): Promise<TranslationJob[]> {
    const jobs = await this.db
      .select()
      .from(this.schema.translationJobs)
      .where(eq(this.schema.translationJobs.status, 'pending'))
      .orderBy(this.schema.translationJobs.createdAt)
      .all();
    return jobs.map(convertTimestamps);
  }

  async getPendingTranslationJobsByStore(storeHash: string): Promise<TranslationJob[]> {
    const jobs = await this.db
      .select()
      .from(this.schema.translationJobs)
      .where(
        and(
          eq(this.schema.translationJobs.status, 'pending'),
          eq(this.schema.translationJobs.storeHash, storeHash)
        )
      )
      .orderBy(this.schema.translationJobs.createdAt)
      .all();
    return jobs.map(convertTimestamps);
  }

  async getTranslationErrors(jobId: number, storeHash: string): Promise<TranslationError[]> {
    const errors = await this.db
      .select({
        translation_errors: this.schema.translationErrors,
        resourceType: this.schema.translationJobs.resourceType
      })
      .from(this.schema.translationErrors)
      .innerJoin(
        this.schema.translationJobs,
        and(
          eq(this.schema.translationErrors.jobId, jobId),
          eq(this.schema.translationJobs.id, jobId),
          eq(this.schema.translationJobs.storeHash, storeHash)
        )
      )
      .orderBy(this.schema.translationErrors.lineNumber)
      .all();
    
    return errors.map(row => ({
      ...convertTimestamps(row.translation_errors),
      resourceType: row.resourceType
    }));
  }

  async createTranslationError(data: {
    jobId: number;
    entityId: number;
    lineNumber: number;
    errorType: "parse_error" | "validation_error" | "api_error" | "unknown";
    errorMessage: string;
    rawData?: Record<string, any>;
  }): Promise<TranslationError> {
    const now = Date.now();
    const result = await this.db
      .insert(this.schema.translationErrors)
      .values({
        ...data,
        rawData: data.rawData ? JSON.stringify(data.rawData) : undefined,
        createdAt: now,
      });
    
    const inserted = await this.db
      .select()
      .from(this.schema.translationErrors)
      .where(eq(this.schema.translationErrors.id, Number(result.lastInsertRowid)))
      .all();
    
    return convertTimestamps(inserted[0]);
  }
}
