import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from '../drizzle-schema-mysql';
import { eq, and, desc } from 'drizzle-orm';
import type { DatabaseOperations, TranslationJob, TranslationError } from './types';
import type { BaseUser, AuthSession } from '@/types';
import type { TranslationJob as MySQLTranslationJob } from '../drizzle-schema-mysql';

const { DATABASE_URL } = process.env;

export class MySQLClient implements DatabaseOperations {
  protected db = drizzle(mysql.createPool(DATABASE_URL!), { schema, mode: 'default' });
  protected schema = schema;

  async hasStoreUser(storeHash: string, userId: number) {
    const result = await this.db
      .select()
      .from(this.schema.storeUsers)
      .where(and(
        eq(this.schema.storeUsers.storeHash, storeHash),
        eq(this.schema.storeUsers.userId, userId)
      ))
      .limit(1);
    return result.length > 0;
  }

  async setUser(user: BaseUser) {
    if (!user) return;
    try {
      await this.db
        .insert(this.schema.users)
        .values({
          userId: user.id,
          email: user.email,
          username: user.username
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
    if (!session.store_hash || !session.access_token || !session.account_uuid) return;
    try {
      await this.db
        .insert(this.schema.stores)
        .values({
          storeHash: session.store_hash,
          accessToken: session.access_token,
          scope: session.scope,
          ownerId: session.owner.id,
          accountUuid: session.account_uuid
        });
    } catch (error) {
      // If insert fails, try update
      await this.db
        .update(this.schema.stores)
        .set({ 
          accessToken: session.access_token,
          scope: session.scope,
          ownerId: session.owner.id,
          accountUuid: session.account_uuid
        })
        .where(eq(this.schema.stores.storeHash, session.store_hash));
    }
  }

  async setStoreUser(session: AuthSession | { store_hash: string; user: BaseUser }) {
    if (!session.store_hash || !session.user?.id) return;
    try {
      await this.db
        .insert(this.schema.storeUsers)
        .values({
          storeHash: session.store_hash,
          userId: session.user.id
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
      .limit(1);
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
      .where(and(
        eq(this.schema.storeUsers.storeHash, storeHash),
        eq(this.schema.storeUsers.userId, user.id)
      ));
  }

  async getTranslationJobs(storeHash: string): Promise<TranslationJob[]> {
    return this.db
      .select()
      .from(this.schema.translationJobs)
      .where(eq(this.schema.translationJobs.storeHash, storeHash))
      .orderBy(desc(this.schema.translationJobs.createdAt));
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
    const result = await this.db
      .insert(this.schema.translationJobs)
      .values({
        ...data,
        status: 'pending',
      });
    
    // MySQL returns insertId, so we need to fetch the record
    const inserted = await this.db
      .select()
      .from(this.schema.translationJobs)
      .where(eq(this.schema.translationJobs.id, Number(result[0].insertId)))
      .limit(1);
    
    return inserted[0];
  }

  async updateTranslationJob(id: number, data: Partial<MySQLTranslationJob>): Promise<TranslationJob> {
    await this.db
      .update(this.schema.translationJobs)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(this.schema.translationJobs.id, id));

    // MySQL doesn't return updated record, so we need to fetch it
    const updated = await this.db
      .select()
      .from(this.schema.translationJobs)
      .where(eq(this.schema.translationJobs.id, id))
      .limit(1);
    
    return updated[0];
  }

  async getPendingTranslationJobs(): Promise<TranslationJob[]> {
    return this.db
      .select()
      .from(this.schema.translationJobs)
      .where(eq(this.schema.translationJobs.status, 'pending'))
      .orderBy(this.schema.translationJobs.createdAt);
  }

  async getPendingTranslationJobsByStore(storeHash: string): Promise<TranslationJob[]> {
    return this.db
      .select()
      .from(this.schema.translationJobs)
      .where(and(
        eq(this.schema.translationJobs.status, 'pending'),
        eq(this.schema.translationJobs.storeHash, storeHash)
      ))
      .orderBy(this.schema.translationJobs.createdAt);
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
      .execute();
    
    return errors.map(row => ({
      ...row.translation_errors,
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
    const result = await this.db
      .insert(this.schema.translationErrors)
      .values(data);
    
    // MySQL returns insertId, so we need to fetch the record
    const inserted = await this.db
      .select()
      .from(this.schema.translationErrors)
      .where(eq(this.schema.translationErrors.id, Number(result[0].insertId)))
      .limit(1);
    
    return inserted[0];
  }
} 