import { type NextRequest } from "next/server";
import { BigCommerceRestClient } from "@/lib/rest-client/src";
import { unstable_cache } from "next/cache";
import { dbClient as db } from "@/lib/db";
import { authorize } from "@/lib/auth";

async function getStoreData(
  accessToken: string | null,
  storeHash: string
) {
  if (!accessToken) {
    throw new Error("BigCommerce API token is required");
  }

  const bigcommerce = new BigCommerceRestClient({
    accessToken: accessToken,
    storeHash: storeHash,
  });

  const storeSettings = await bigcommerce.getStoreInformation();

  return {
    multi_language_enabled:
      storeSettings?.features?.multi_language_enabled ?? false,
    multi_storefront_enabled:
      storeSettings?.features?.multi_storefront_enabled ?? false,
    language: storeSettings?.language ?? "en",
  };
}

export async function GET(request: NextRequest) {
  if (!process.env.COOKIE_NAME) {
    throw new Error("COOKIE_NAME env var is not set");
  }

  try {
    const authData = await authorize();
    
    if (!authData) {
      throw Error("Authorization failed");
    }

    const { storeHash } = authData;
    let accessToken: string | null = null;
    
    if (process.env.DB_TYPE === "explicit_store_token") {
      if (!process.env.HARDCODED_ACCESS_TOKEN) {
        throw new Error("HARDCODED_ACCESS_TOKEN env var is not set");
      }
      accessToken = process.env.HARDCODED_ACCESS_TOKEN;
    } else {
      accessToken = await db.getStoreToken(storeHash);
    }

    // Cache per storeHash
    const cachedData = await unstable_cache(
      async () => getStoreData(accessToken, storeHash),
      [`store-information-${storeHash}`], // cache key
      {
        revalidate: 3600, // Cache for 1 hour
        tags: [`store-${storeHash}`], // Tag for cache invalidation
      }
    )();

    return Response.json(cachedData);
  } catch (error: any) {
    const { message, response } = error;

    return new Response(message || "Authentication failed, please re-install", {
      status: response?.status || 500,
    });
  }
}
