import { type NextRequest } from "next/server";
import { getSessionFromContext } from "@/lib/auth";
import { BigCommerceRestClient } from "@/lib/rest-client/src";
import { fallbackLocale, hardcodedAvailableLocales } from "@/lib/constants";
import { unstable_cache } from "next/cache";

type Locale = {
  code: string;
  status: string;
  is_default: boolean;
  title?: string;
};

type Channel = {
  id: number;
  name: string;
  [key: string]: any;
};

type ChannelResponse = {
  channel_id: number;
  channel_name: string;
  default_locale: string;
  locales: Locale[];
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const context = searchParams.get("context") ?? "";

  try {
    const { accessToken, storeHash } = await getSessionFromContext(context);
    const bigcommerce = new BigCommerceRestClient({
      accessToken: accessToken,
      storeHash: storeHash,
    });

    const getChannelsData = async (): Promise<ChannelResponse[]> => {
      const { data: channelsData } = await bigcommerce.getAvailableChannels();

      const result = await Promise.all(
        channelsData.map(async (channel: Channel) => {
          try {
            const { data: localesData } = await bigcommerce.getChannelLocales(
              channel.id
            );
            const locales: Locale[] = localesData.map(
              (locale: {
                code: string;
                status: string;
                is_default: boolean;
              }) => ({
                ...locale,
                title: hardcodedAvailableLocales.find(
                  ({ id }) => id === locale.code
                )?.name,
              })
            );

            const defaultLocale =
              locales.find((locale) => locale.is_default)?.code ||
              fallbackLocale.code;

            return {
              channel_id: channel.id,
              channel_name: channel.name,
              default_locale: defaultLocale,
              locales,
            };
          } catch (innerError) {
            console.error(
              `Failed to fetch locales for channel ${channel.id}:`,
              innerError
            );
            return {
              channel_id: channel.id,
              channel_name: channel.name,
              default_locale: fallbackLocale.code,
              locales: [fallbackLocale],
            };
          }
        })
      );

      // Filter channels to only include those with more than one locale
      return result.filter((channel) => channel.locales.length > 1);
    };

    // Cache per storeHash
    const cachedData = await unstable_cache(
      getChannelsData,
      [`channels-${storeHash}`], // cache key
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
