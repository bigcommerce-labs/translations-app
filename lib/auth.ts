import { z } from "zod";
import { dbClient as db } from "@/lib/db";
import { getSession } from "./session";
import {
  AppSessionPayload,
  appSessionPayloadSchema,
  createAuthClient,
  signedPayloadJwtSchema,
} from "./auth-client/src";

const { DB_TYPE, HARDCODED_ACCESS_TOKEN, HARDCODED_STORE_HASH } = process.env;

// Initialize auth client
export const authClient = createAuthClient({
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callback: process.env.AUTH_CALLBACK,
  jwtKey: process.env.JWT_KEY,
});

// Core authorization function
export async function authorize(): Promise<AppSessionPayload | null> {
  if (DB_TYPE === "explicit_store_token") {
    return {
      channelId: null,
      storeHash: HARDCODED_STORE_HASH as string,
      userId: 0,
      userEmail: "mock@example.com",
      userLocale: process.env.HARDCODED_LOCALE,
    };
  }

  const token = await getSession();

  if (!token) {
    console.log("No session token found");
    return null;
  }

  try {
    const payload = await authClient.verifyAppJWT(token);
    const parsed = appSessionPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      console.log("JWT schema validation failed:", parsed.error);
      return null;
    }

    return parsed.data;
  } catch (err) {
    console.log("JWT verification failed:", err);
    return null;
  }
}

// Session context management
export async function getSessionFromContext(context: string = "") {
  if (typeof context !== "string") return;

  if (DB_TYPE === "explicit_store_token") {
    return {
      accessToken: HARDCODED_ACCESS_TOKEN,
      storeHash: HARDCODED_STORE_HASH,
      user: null,
    } as any;
  }

  const { storeHash, userId, userEmail, userLocale } =
    (await authClient.decodeSessionPayload(context)) as z.infer<
      typeof appSessionPayloadSchema
    > & {
      context: string;
      user: any;
    };
  const hasUser = await db.hasStoreUser(storeHash, userId);

  if (!hasUser) {
    throw new Error(
      "User is not available. Please login or ensure you have access permissions."
    );
  }

  const accessToken = await db.getStoreToken(storeHash);

  return { accessToken, storeHash, userId, userEmail, userLocale } as any;
}

// Data cleanup functions
export async function removeStoreData(
  session: z.infer<typeof signedPayloadJwtSchema>
) {
  const storeHash = session.sub.split("/")[1];
  if (!storeHash) return;

  await db.deleteStore(storeHash);
  if (session.user) {
    await db.deleteUser(storeHash, {
      id: session.user.id,
      email: session.user.email,
    });
  }
}

export async function removeUserData(
  session: z.infer<typeof signedPayloadJwtSchema>
) {
  const storeHash = session.sub.split("/")[1];
  if (!storeHash) return;

  await db.deleteUser(storeHash, {
    id: session.user.id,
    email: session.user.email,
  });
}
