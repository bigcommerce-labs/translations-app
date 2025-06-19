'use server';

import { callTranslationsAPI } from '@/lib/utils/translations-api';

interface TranslateProductRequest {
  productData: {
    name: string;
    description: string;
    pageTitle: string;
    metaDescription: string;
    options?: {
      edges: Array<{
        node: {
          id: string;
          displayName: string;
          values: Array<{
            id: string;
            label: string;
          }>;
        };
      }>;
    };
    modifiers?: {
      edges: Array<{
        node: {
          id: string;
          displayName: string;
          values?: Array<{
            id: string;
            label: string;
          }>;
          fieldValue?: string;
          defaultValue?: string;
          defaultValueFloat?: string;
        };
      }>;
    };
    customFields?: {
      edges: Array<{
        node: {
          id: string;
          name: string;
          value: string;
        };
      }>;
    };
  };
  currentLocaleData: any;
  targetLanguage: string;
  sourceLanguage?: string;
}

interface TranslateProductResponse {
  success: boolean;
  translatedData?: any;
  error?: string;
}

/**
 * Server action to translate product data using the translations API
 */
export async function translateProduct(
  request: TranslateProductRequest
): Promise<TranslateProductResponse> {
  try {
    const { productData, currentLocaleData, targetLanguage, sourceLanguage } = request;

    // Build comprehensive payload with all translatable content
    const payload = buildTranslationPayload(productData, currentLocaleData);
    
    // Extract all translatable keys from the payload
    const translateKeys = extractAllTranslatableKeys(payload);

    // If no fields need translation, return current data
    if (translateKeys.length === 0) {
      return {
        success: true,
        translatedData: currentLocaleData,
      };
    }

    // Call the translations API
    const translationResponse = await callTranslationsAPI({
      target_language: targetLanguage,
      source_language: sourceLanguage,
      payload,
      translate_keys: translateKeys,
    });

    // Transform translated response back to form data structure
    const translatedData = transformTranslatedResponse(
      translationResponse.translated_payload,
      currentLocaleData
    );

    return {
      success: true,
      translatedData,
    };
  } catch (error) {
    console.error('Translation error:', error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown translation error',
    };
  }
}

/**
 * Builds a comprehensive payload with all translatable content
 */
/**
 * Checks if a value has meaningful content for translation
 */
function hasTranslatableContent(value: any): boolean {
  return value != null && 
         typeof value === 'string' && 
         value.trim().length > 0;
}

function buildTranslationPayload(productData: any, currentLocaleData: any): any {
  const payload: any = {};

  // Basic translatable fields - use default locale data from productData
  const basicFields = ['name', 'description', 'pageTitle', 'metaDescription'];
  basicFields.forEach(field => {
    const sourceValue = productData[field];
    const currentValue = currentLocaleData[field];
    
    // Only include if source has content and current is empty/same as source
    if (hasTranslatableContent(sourceValue) && 
        (!hasTranslatableContent(currentValue) || currentValue === sourceValue)) {
      payload[field] = sourceValue;
    }
  });

  // Options - use default locale data and compare with current form state
  if (productData.options?.edges && productData.options.edges.length > 0) {
    const optionsToTranslate = [];
    
    for (const edge of productData.options.edges) {
      const option = edge.node;
      const currentOption = currentLocaleData.options?.[option.id];
      
      // Check if option needs translation
      const needsOptionTranslation = !currentOption?.displayName || 
        currentOption.displayName === option.displayName || 
        !currentOption.displayName.trim();
      
      // Check if any values need translation
      const valuesToTranslate = option.values.filter((value: any) => {
        const currentValue = currentOption?.values?.[value.id];
        return !currentValue || currentValue === value.label || !currentValue.trim();
      });

      if (needsOptionTranslation || valuesToTranslate.length > 0) {
        const optionData: any = {
          id: option.id,
        };
        
        // Only include displayName if it has content
        if (hasTranslatableContent(option.displayName)) {
          optionData.displayName = option.displayName;
        }
        
        // Only include values that have translatable content
        const validValues = option.values
          .filter((value: any) => hasTranslatableContent(value.label))
          .map((value: any) => ({
            id: value.id,
            label: value.label
          }));
          
        if (validValues.length > 0) {
          optionData.values = validValues;
        }
        
        // Only add if there's something to translate
        if (optionData.displayName || optionData.values) {
          optionsToTranslate.push(optionData);
        }
      }
    }
    
    if (optionsToTranslate.length > 0) {
      payload.options = optionsToTranslate;
    }
  }

  // Modifiers - use default locale data and compare with current form state
  if (productData.modifiers?.edges && productData.modifiers.edges.length > 0) {
    const modifiersToTranslate = [];
    
    for (const edge of productData.modifiers.edges) {
      const modifier = edge.node;
      const currentModifier = currentLocaleData.modifiers?.[modifier.id];
      
      // Check if modifier needs translation
      const needsModifierTranslation = !currentModifier?.displayName || 
        currentModifier.displayName === modifier.displayName || 
        !currentModifier.displayName.trim();
      
      // Check type-specific fields
      const needsFieldValueTranslation = modifier.fieldValue && 
        (!currentModifier?.fieldValue || currentModifier.fieldValue === modifier.fieldValue);
      const needsDefaultValueTranslation = modifier.defaultValue && 
        (!currentModifier?.defaultValue || currentModifier.defaultValue === modifier.defaultValue);
      
      // Check if any values need translation
      const valuesToTranslate = modifier.values?.filter((value: any) => {
        const currentValue = currentModifier?.values?.[value.id];
        return !currentValue || currentValue === value.label || !currentValue.trim();
      }) || [];

      if (needsModifierTranslation || needsFieldValueTranslation || needsDefaultValueTranslation || valuesToTranslate.length > 0) {
        const modifierData: any = {
          id: modifier.id,
          type: modifier.__typename
        };

        // Only include fields that have translatable content
        if (hasTranslatableContent(modifier.displayName)) {
          modifierData.displayName = modifier.displayName;
        }
        if (hasTranslatableContent(modifier.fieldValue)) {
          modifierData.fieldValue = modifier.fieldValue;
        }
        if (hasTranslatableContent(modifier.defaultValue)) {
          modifierData.defaultValue = modifier.defaultValue;
        }
        if (hasTranslatableContent(modifier.defaultValueFloat)) {
          modifierData.defaultValueFloat = modifier.defaultValueFloat;
        }
        
        // Only include values that have translatable content
        if (modifier.values && modifier.values.length > 0) {
          const validValues = modifier.values
            .filter((value: any) => hasTranslatableContent(value.label))
            .map((value: any) => ({
              id: value.id,
              label: value.label
            }));
            
          if (validValues.length > 0) {
            modifierData.values = validValues;
          }
        }

        // Only add if there's something to translate
        if (modifierData.displayName || modifierData.fieldValue || 
            modifierData.defaultValue || modifierData.defaultValueFloat || 
            modifierData.values) {
          modifiersToTranslate.push(modifierData);
        }
      }
    }
    
    if (modifiersToTranslate.length > 0) {
      payload.modifiers = modifiersToTranslate;
    }
  }

  // Custom Fields - use default locale data and compare with current form state
  if (productData.customFields?.edges && productData.customFields.edges.length > 0) {
    const fieldsToTranslate = [];
    
    for (const edge of productData.customFields.edges) {
      const field = edge.node;
      const currentField = currentLocaleData.customFields?.[field.id];
      
      // Check if field needs translation
      const needsNameTranslation = !currentField?.name || 
        currentField.name === field.name || 
        !currentField.name.trim();
      const needsValueTranslation = !currentField?.value || 
        currentField.value === field.value || 
        !currentField.value.trim();
      
      if (needsNameTranslation || needsValueTranslation) {
        const fieldData: any = {
          id: field.id,
        };
        
        // Only include fields that have translatable content
        if (hasTranslatableContent(field.name)) {
          fieldData.name = field.name;
        }
        if (hasTranslatableContent(field.value)) {
          fieldData.value = field.value;
        }
        
        // Only add if there's something to translate
        if (fieldData.name || fieldData.value) {
          fieldsToTranslate.push(fieldData);
        }
      }
    }
    
    if (fieldsToTranslate.length > 0) {
      payload.customFields = fieldsToTranslate;
    }
  }

  return payload;
}

/**
 * Extracts all translatable keys from the payload
 */
function extractAllTranslatableKeys(payload: any): string[] {
  const keys: string[] = [];

  // Basic fields
  ['name', 'description', 'pageTitle', 'metaDescription'].forEach(field => {
    if (payload[field]) {
      keys.push(field);
    }
  });

  // Options
  if (payload.options) {
    keys.push('displayName', 'label');
  }

  // Modifiers
  if (payload.modifiers) {
    keys.push('displayName', 'fieldValue', 'defaultValue', 'defaultValueFloat', 'label');
  }

  // Custom Fields
  if (payload.customFields) {
    keys.push('name', 'value');
  }

  return Array.from(new Set(keys)); // Remove duplicates
}

/**
 * Safely deep clones an object to ensure RSC serialization compatibility
 */
function safeDeepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Copies basic fields from source to target, with optional translations override
 */
function copyBasicFields(
  target: any, 
  source: any, 
  translations: any, 
  fields: string[]
): void {
  fields.forEach(field => {
    target[field] = translations[field] !== undefined 
      ? translations[field] 
      : (source[field] || '');
  });
}

/**
 * Transforms a collection of items using a mapper function, with fallback to existing data
 */
function transformCollection<T>(
  translatedItems: T[] | undefined,
  existingData: any,
  collectionKey: string,
  mapper: (item: T) => { id: string; data: any }
): any {
  if (translatedItems) {
    const result: any = {};
    translatedItems.forEach(item => {
      const { id, data } = mapper(item);
      result[id] = data;
    });
    return result;
  }
  
  return existingData?.[collectionKey] ? safeDeepClone(existingData[collectionKey]) : undefined;
}

/**
 * Transforms translated response back to form data structure
 */
function transformTranslatedResponse(translatedPayload: any, currentLocaleData: any): any {
  const result: any = {};
  
  // Handle basic translatable fields
  const basicFields = ['name', 'description', 'pageTitle', 'metaDescription'];
  copyBasicFields(result, currentLocaleData, translatedPayload, basicFields);
  
  // Copy over any additional non-nested fields
  Object.keys(currentLocaleData).forEach(key => {
    if (!['options', 'modifiers', 'customFields'].includes(key) && !(key in result)) {
      result[key] = currentLocaleData[key];
    }
  });

  // Transform options
  result.options = transformCollection(
    translatedPayload.options,
    currentLocaleData,
    'options',
    (option: any) => ({
      id: option.id,
      data: {
        displayName: option.displayName || '',
        values: option.values?.reduce((acc: any, value: any) => {
          acc[value.id] = value.label || '';
          return acc;
        }, {}) || {}
      }
    })
  );

  // Transform modifiers
  result.modifiers = transformCollection(
    translatedPayload.modifiers,
    currentLocaleData,
    'modifiers',
    (modifier: any) => ({
      id: modifier.id,
      data: {
        displayName: modifier.displayName || '',
        ...(modifier.type && { __typename: modifier.type }),
        ...(modifier.fieldValue !== undefined && { fieldValue: modifier.fieldValue }),
        ...(modifier.defaultValue !== undefined && { defaultValue: modifier.defaultValue }),
        ...(modifier.defaultValueFloat !== undefined && { defaultValueFloat: modifier.defaultValueFloat }),
        ...(modifier.values && {
          values: modifier.values.reduce((acc: any, value: any) => {
            acc[value.id] = value.label || '';
            return acc;
          }, {})
        })
      }
    })
  );

  // Transform custom fields
  result.customFields = transformCollection(
    translatedPayload.customFields,
    currentLocaleData,
    'customFields',
    (field: any) => ({
      id: field.id,
      data: {
        name: field.name || '',
        value: field.value || ''
      }
    })
  );

  return result;
}

 