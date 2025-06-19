import type { BaseUser, AuthSession } from '@/types';
import type { TranslationJob as PgTranslationJob } from '../drizzle-schema-pg';
import type { TranslationJob as MySQLTranslationJob } from '../drizzle-schema-mysql';
import type { TranslationJob as SQLiteTranslationJob } from '../drizzle-schema-sqlite';

// Define metadata types for translation jobs
export interface TranslationJobMetadata {
  includeDraftTranslations?: boolean;
  sourceLanguage?: string;
}

// Extend the inferred TranslationJob type to override createdAt
interface ExtendedTranslationJob extends Omit<SQLiteTranslationJob, 'createdAt'> {
  createdAt: Date;
}

// Update the TranslationJob type to use the extended type
export type TranslationJob = ExtendedTranslationJob | PgTranslationJob | MySQLTranslationJob;

// Define TranslationError types for each database
import type { TranslationError as PgTranslationError } from '../drizzle-schema-pg';
import type { TranslationError as MySQLTranslationError } from '../drizzle-schema-mysql';
import type { TranslationError as SQLiteTranslationError } from '../drizzle-schema-sqlite';

// Extend the inferred TranslationError type to override createdAt
interface ExtendedTranslationError extends Omit<SQLiteTranslationError, 'createdAt'> {
  createdAt: Date;
}

// Update the TranslationError type to use the extended type
export type TranslationError = ExtendedTranslationError | PgTranslationError | MySQLTranslationError;

export interface DatabaseOperations {
  // Auth operations
  hasStoreUser(storeHash: string, userId: number): Promise<boolean>;
  setUser(user: BaseUser): Promise<void>;
  setStore(session: AuthSession): Promise<void>;
  setStoreUser(session: AuthSession | { store_hash: string; user: BaseUser }): Promise<void>;
  getStoreToken(storeHash: string | null): Promise<string | null>;
  deleteStore(storeHash: string): Promise<void>;
  deleteUser(storeHash: string, user: BaseUser): Promise<void>;

  // Translation job operations
  getTranslationJobs(storeHash: string): Promise<TranslationJob[]>;
  createTranslationJob(data: {
    storeHash: string;
    jobType: 'import' | 'export';
    resourceType?: 'products' | 'categories';
    channelId: number;
    locale: string;
    fileUrl?: string;
    metadata?: TranslationJobMetadata;
  }): Promise<TranslationJob>;
  updateTranslationJob(id: number, data: Partial<TranslationJob>): Promise<TranslationJob>;
  getPendingTranslationJobs(): Promise<TranslationJob[]>;
  getPendingTranslationJobsByStore(storeHash: string): Promise<TranslationJob[]>;

  // Translation error operations
  getTranslationErrors(jobId: number, storeHash: string): Promise<TranslationError[]>;
  createTranslationError(data: {
    jobId: number;
    entityId: number;
    lineNumber: number;
    errorType: string;
    errorMessage: string;
    rawData?: Record<string, any>;
  }): Promise<TranslationError>;
} 