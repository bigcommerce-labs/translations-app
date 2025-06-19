import { type NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth";
import { dbClient as db } from "@/lib/db";
import {
  oauthResponseSchema,
  authCallbackQuerySchema,
} from "@/lib/auth-client/src";
import { GraphQLClient } from "@/lib/graphql-client/src";
import { setSession } from "@/lib/session";
import { appExtensions } from "@/lib/constants";

export async function GET(req: NextRequest) {
  const parsedParams = authCallbackQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams)
  );

  if (!parsedParams.success) {
    return new NextResponse("Invalid query parameters", { status: 400 });
  }

  let body;
  try {
    body = await authClient.performOauthHandshake(parsedParams.data);
  } catch (error: any) {
    return new NextResponse(error.message || "OAuth handshake failed", {
      status: 500,
    });
  }

  const parsedOAuthResponse = oauthResponseSchema.safeParse(body);

  if (!parsedOAuthResponse.success) {
    return new NextResponse("Invalid access token response", { status: 500 });
  }

  const {
    access_token: accessToken,
    context,
    scope,
    user: oauthUser,
    owner: authOwner,
    account_uuid: accountUuid,
  } = parsedOAuthResponse.data;

  const storeHash = context.split("/")[1];

  if (!storeHash) {
    return new NextResponse("Invalid store hash", { status: 400 });
  }

  await db.setStore({
    access_token: accessToken,
    context,
    store_hash: storeHash,
    scope,
    user: oauthUser,
    owner: authOwner,
    account_uuid: accountUuid,
  });
  await db.setUser(oauthUser);
  await db.setStoreUser({
    access_token: accessToken,
    context,
    store_hash: storeHash,
    scope,
    user: oauthUser,
    owner: authOwner,
    account_uuid: accountUuid,
  });

  /**
   * For stores that do not have the app installed yet, create App Extensions when app is
   * installed.
   */
  const isAppExtensionsScopeEnabled = scope.includes(
    "store_app_extensions_manage"
  );
  if (isAppExtensionsScopeEnabled && storeHash) {
    const graphqlClient = new GraphQLClient({
      accessToken,
      storeHash,
    });

    // Register all configured app extensions
    for (const extension of appExtensions) {
      await graphqlClient.upsertAppExtension(extension, {
        cleanupDuplicates: true,
      });
    }
  } else {
    console.warn(
      "WARNING: App extensions scope is not enabled yet. To register app extensions update the scope in Developer Portal: https://devtools.bigcommerce.com"
    );
  }

  // Since the auth callback *doesn't* return a user.locale, we need to use the browser locale.
  // (When the user loads the app after it's auth'd, the load callback *does* return a user.locale
  const userBrowserLocale =
    req.headers.get("Accept-Language")?.split(",")[0] || "en-US";

  const clientToken = await authClient.encodeSessionPayload({
    userId: oauthUser.id,
    userEmail: oauthUser.email,
    channelId: null,
    storeHash,
    userLocale: userBrowserLocale,
  }, "6h");

  await setSession(clientToken);

  const response = NextResponse.redirect(
    `${process.env.APP_ORIGIN}/?context=${clientToken}`,
    {
      status: 302,
      statusText: "Found",
    }
  );

  return response;
}
