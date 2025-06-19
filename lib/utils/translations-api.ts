interface TranslationRequest {
  target_language: string;
  source_language?: string;
  payload: Record<string, any>;
  translate_keys?: string[];
}

interface TranslationResponse {
  translated_payload: Record<string, any>;
  source_language: string;
  target_language: string;
}

interface TranslationError {
  error: string;
  details?: string;
}

const TRANSLATIONS_API_URL = process.env.TRANSLATIONS_API_URL || 'https://translations-api-py-451041921684.us-central1.run.app';

/**
 * Calls the translations API to translate strings within a JSON object
 * @param request - The translation request parameters
 * @returns Promise with the translated payload
 * @throws Error if the API call fails
 */
export async function callTranslationsAPI(
  request: TranslationRequest
): Promise<TranslationResponse> {
  try {
    const response = await fetch(TRANSLATIONS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData: TranslationError = await response.json().catch(() => ({
        error: `HTTP ${response.status}: ${response.statusText}`,
      }));
      
      throw new Error(
        `Translation API error: ${errorData.error}${
          errorData.details ? ` - ${errorData.details}` : ''
        }`
      );
    }

    const data: TranslationResponse = await response.json();
    return data;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Unknown error occurred while calling translations API');
  }
}

/**
 * Extracts translatable keys from a complex object structure
 * @param obj - The object to extract keys from
 * @param keyPrefixes - Array of key prefixes to include (e.g., ['name', 'description'])
 * @returns Array of flattened keys that should be translated
 */
export function extractTranslatableKeys(
  obj: Record<string, any>,
  keyPrefixes: string[] = []
): string[] {
  const keys: string[] = [];
  
  function traverse(current: any, path: string = '') {
    if (typeof current === 'object' && current !== null) {
      if (Array.isArray(current)) {
        current.forEach((item, index) => {
          traverse(item, path ? `${path}[${index}]` : `[${index}]`);
        });
      } else {
        Object.keys(current).forEach(key => {
          const currentPath = path ? `${path}.${key}` : key;
          
          if (typeof current[key] === 'string' && current[key].trim()) {
            // If no key prefixes specified, include all string keys
            // Otherwise, only include keys that match the prefixes
            if (keyPrefixes.length === 0 || 
                keyPrefixes.some(prefix => key.includes(prefix))) {
              keys.push(currentPath);
            }
          } else if (typeof current[key] === 'object') {
            traverse(current[key], currentPath);
          }
        });
      }
    }
  }
  
  traverse(obj);
  return keys;
}

/**
 * Determines which fields need translation by comparing current locale data with default locale data
 * @param defaultData - Data from the default locale
 * @param currentData - Data from the current locale
 * @param translatableFields - Array of field keys that are translatable
 * @returns Object containing only fields that need translation
 */
export function getFieldsNeedingTranslation(
  defaultData: Record<string, any>,
  currentData: Record<string, any>,
  translatableFields: string[] = []
): {
  payload: Record<string, any>;
  translateKeys: string[];
} {
  const payload: Record<string, any> = {};
  const translateKeys: string[] = [];

  function shouldTranslateField(key: string, defaultValue: any, currentValue: any): boolean {
    // Field needs translation if:
    // 1. It's in the translatable fields list (or no list provided)
    // 2. Default value exists and is a non-empty string
    // 3. Current value is empty/null/undefined or same as default (untranslated)
    
    const isTranslatable = translatableFields.length === 0 || 
      translatableFields.some(field => key.includes(field));
    
    const hasDefaultValue = typeof defaultValue === 'string' && !!defaultValue.trim();
    const needsTranslation = !currentValue || 
      currentValue === defaultValue || 
      (typeof currentValue === 'string' && !currentValue.trim());
    
    return isTranslatable && hasDefaultValue && needsTranslation;
  }

  function processLevel(defaultObj: any, currentObj: any, keyPath: string = '') {
    if (typeof defaultObj === 'object' && defaultObj !== null && !Array.isArray(defaultObj)) {
      Object.keys(defaultObj).forEach(key => {
        const currentPath = keyPath ? `${keyPath}.${key}` : key;
        const defaultValue = defaultObj[key];
        const currentValue = currentObj?.[key];

        if (typeof defaultValue === 'string') {
          if (shouldTranslateField(key, defaultValue, currentValue)) {
            if (!payload[key]) payload[key] = defaultValue;
            translateKeys.push(key);
          }
        } else if (typeof defaultValue === 'object' && defaultValue !== null) {
          if (Array.isArray(defaultValue)) {
            // Handle arrays (like options, modifiers)
            payload[key] = defaultValue;
            defaultValue.forEach((item: any, index: number) => {
              if (typeof item === 'object' && item !== null) {
                Object.keys(item).forEach(subKey => {
                  if (typeof item[subKey] === 'string' && 
                      shouldTranslateField(subKey, item[subKey], currentObj?.[key]?.[index]?.[subKey])) {
                    translateKeys.push(subKey);
                  }
                });
              }
            });
          } else {
            // Handle nested objects
            if (!payload[key]) payload[key] = {};
            processLevel(defaultValue, currentValue, currentPath);
          }
        }
      });
    }
  }

  processLevel(defaultData, currentData);
  
  return {
    payload: Object.keys(payload).length > 0 ? payload : defaultData,
    translateKeys: Array.from(new Set(translateKeys)), // Remove duplicates
  };
} 