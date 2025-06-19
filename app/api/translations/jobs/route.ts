import { NextRequest } from 'next/server';
import { getSessionFromContext } from '@/lib/auth';
import { dbClient as db } from '@/lib/db';
import { put } from '@vercel/blob';
import crypto from 'crypto';
import type { TranslationJobMetadata } from '@/lib/db/clients/types';

// Helper to generate a unique filename
function generateUniqueFilename(originalName: string, storeHash: string): string {
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(8).toString('hex');
  // Sanitize the original filename to remove any potentially unsafe characters
  const sanitizedOriginalName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `imports/${storeHash}/${timestamp}-${randomBytes}-${sanitizedOriginalName}`;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const context = searchParams.get('context');
    
    if (!context) {
      return new Response('Context is required', { status: 400 });
    }

    const { storeHash } = await getSessionFromContext(context);
    const jobs = await db.getTranslationJobs(storeHash);

    return Response.json(jobs);
  } catch (error: any) {
    console.error('Error fetching translation jobs:', error);
    return new Response(error.message || 'Internal Server Error', { 
      status: error.status || 500 
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const context = searchParams.get('context');
    
    if (!context) {
      return new Response('Context is required', { status: 400 });
    }

    const { storeHash } = await getSessionFromContext(context);
    
    // Handle file upload
    if (request.headers.get('content-type')?.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file') as File;
      const channelId = form.get('channelId') as string;
      const locale = form.get('locale') as string;
      const resourceType = form.get('resourceType') as 'products' | 'categories' || 'products';

      if (!file || !channelId || !locale) {
        return new Response('Missing required fields', { status: 400 });
      }

      // Generate unique filename
      const uniqueFilename = generateUniqueFilename(file.name, storeHash);

      // Upload file to blob storage with unique name
      const blob = await put(uniqueFilename, file, { 
        access: 'public',
        contentType: 'text/csv',
        addRandomSuffix: false // We handle uniqueness ourselves
      });

      // Create job with file URL
      const job = await db.createTranslationJob({
        storeHash,
        jobType: 'import',
        resourceType,
        channelId: parseInt(channelId, 10),
        locale,
        fileUrl: blob.url,
      });

      return Response.json({ job });
    }

    // Handle export job creation
    const body = await request.json();
    const { jobType, channelId, locale, resourceType = 'products', includeDraftTranslations = false } = body;

    if (!jobType || !channelId || !locale) {
      return new Response('Missing required fields', { status: 400 });
    }

    const job = await db.createTranslationJob({
      storeHash,
      jobType,
      resourceType,
      channelId,
      locale,
      fileUrl: undefined,
      metadata: {
        includeDraftTranslations: jobType === 'export' ? includeDraftTranslations : false,
      },
    });

    return Response.json({ job });
  } catch (error: any) {
    console.error('Error creating translation job:', error);
    return new Response(error.message || 'Internal Server Error', { 
      status: error.status || 500 
    });
  }
} 