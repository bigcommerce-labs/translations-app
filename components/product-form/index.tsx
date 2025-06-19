"use client";

import React, {
  useCallback,
  useReducer,
  useEffect,
  FormEvent,
  MouseEvent,
  useMemo,
  useRef,
} from "react";
import { useTranslations } from "next-intl";
import {
  Box,
  Flex,
  HR,
  Form as StyledForm,
  Button,
} from "@bigcommerce/big-design";
import { theme } from "@bigcommerce/big-design-theme";
import { translatableProductFields } from "@/lib/constants";
import { ActionBar } from "@bigcommerce/big-design-patterns";
import ErrorMessage from "../error-message";
import Loading, { LoadingScreen } from "../loading-indicator";
import { addAlert } from "@/components/alerts-manager";
import { useStoreInfo } from "@/components/store-info-provider";
import { TranslationsGetStarted } from "@/components/translations-get-started";
import ChannelLocaleSelector from "./locale-selector";
import TranslatableField from "./translatable-field";
import ProductOptions from "./product-options";
import ProductModifiers from "./product-modifiers";
import CustomFields from "./custom-fields";
import { translateProduct } from "@/app/actions/translate-product";

interface Channel {
  channel_id: number;
  channel_name: string;
  locales: {
    code: string;
    status: string;
    is_default: boolean;
    title: string;
  }[];
}

interface CustomField {
  id: string;
  name: string;
  value: string;
}

interface ProductFormProps {
  channels: Channel[];
  productId: number;
  context: string;
}

interface ProductFields {
  name: string;
  description: string;
  pageTitle: string;
  metaDescription: string;
}

interface ProductOptionValue {
  id: string;
  label: string;
}

interface ProductOption {
  id: string;
  displayName: string;
  values: ProductOptionValue[];
}

interface ProductModifierValue {
  id: string;
  label: string;
}

interface ProductModifier {
  __typename: string;
  id: string;
  displayName: string;
  values?: ProductModifierValue[];
  isRequired?: boolean;
  checkedByDefault?: boolean;
  fieldValue?: string;
  defaultValue?: string;
  defaultValueFloat?: string;
}

interface ProductData {
  name: string;
  description: string;
  pageTitle: string;
  metaDescription: string;
  localeData: {
    [key: string]: FormFields;
  };
  options?: {
    edges: Array<{
      node: ProductOption;
    }>;
  };
  modifiers?: {
    edges: Array<{
      node: ProductModifier;
    }>;
  };
  customFields?: {
    edges: Array<{
      node: CustomField;
    }>;
  };
}

interface FormOptionValue {
  [valueId: string]: string;
}

interface FormOption {
  displayName: string;
  values: FormOptionValue;
}

interface FormModifierValue {
  [valueId: string]: string;
}

interface FormModifier {
  displayName: string;
  values?: FormModifierValue;
  fieldValue?: string;
  defaultValue?: string;
  defaultValueFloat?: string;
}

interface FormFields extends ProductFields {
  options?: {
    [optionId: string]: FormOption;
  };
  modifiers?: {
    [modifierId: string]: FormModifier;
  };
  customFields?: {
    [fieldId: string]: {
      name: string;
      value: string;
    };
  };
}

interface State {
  currentChannel: number;
  currentLocale: string;
  productData: ProductData;
  form: FormFields;
  isProductInfoLoading: boolean;
  hasProductInfoLoadingError: boolean;
  isProductSaving: boolean;
  isTranslating: boolean;
  errors: Record<string, string>;
  forceRenderKey: number;
}

type Action =
  | { type: "SET_CHANNEL"; payload: number }
  | { type: "SET_LOCALE"; payload: string }
  | { type: "SET_INITIAL_STATE"; payload: { 
      channel: number; 
      locale: string; 
      isInitialLoad: boolean;
    } }
  | { type: "SET_PRODUCT_DATA"; payload: ProductData }
  | { type: "SET_FORM"; payload: FormFields }
  | { type: "SET_PRODUCT_INFO_LOADING"; payload: boolean }
  | { type: "SET_PRODUCT_INFO_LOADING_ERROR"; payload: boolean }
  | { type: "SET_PRODUCT_SAVING"; payload: boolean }
  | { type: "SET_TRANSLATING"; payload: boolean }
  | { type: "SET_ERRORS"; payload: Record<string, string> }
  | { type: "FORCE_RENDER"; payload?: never };

const initialState: State = {
  currentChannel: 1,
  currentLocale: "en-US",
  productData: {
    name: "",
    description: "",
    pageTitle: "",
    metaDescription: "",
    localeData: {},
  },
  form: { name: "", description: "", pageTitle: "", metaDescription: "" },
  isProductInfoLoading: true,
  hasProductInfoLoadingError: false,
  isProductSaving: false,
  isTranslating: false,
  errors: {},
  forceRenderKey: 0,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_INITIAL_STATE":
      return {
        ...state,
        currentChannel: action.payload.channel,
        currentLocale: action.payload.locale,
        isProductInfoLoading: !action.payload.isInitialLoad,
      };
    case "SET_CHANNEL":
      return { ...state, currentChannel: action.payload };
    case "SET_LOCALE":
      return { ...state, currentLocale: action.payload };
    case "SET_PRODUCT_DATA":
      return {
        ...state,
        productData: action.payload,
        isProductInfoLoading: false,
        isProductSaving: false,
        form: getFormObjectForLocale(action.payload, state.currentLocale),
      };
    case "SET_FORM":
      return { ...state, form: action.payload };
    case "SET_PRODUCT_INFO_LOADING":
      return { ...state, isProductInfoLoading: action.payload };
    case "SET_PRODUCT_INFO_LOADING_ERROR":
      return {
        ...state,
        hasProductInfoLoadingError: action.payload,
        isProductInfoLoading: false,
      };
    case "SET_PRODUCT_SAVING":
      return { ...state, isProductSaving: action.payload };
    case "SET_TRANSLATING":
      return { ...state, isTranslating: action.payload };
    case "FORCE_RENDER":
      return { ...state, forceRenderKey: state.forceRenderKey + 1 };
    default:
      return state;
  }
}

const getFormObjectForLocale = (
  productData: ProductData,
  locale: string
): FormFields => {
  const localeData = productData.localeData[locale] || {
    name: "",
    description: "",
    pageTitle: "",
    metaDescription: "",
    options: {},
    modifiers: {},
  };

  return {
    ...localeData,
    options: localeData.options || {},
    modifiers: localeData.modifiers || {},
  };
};

function ProductForm({ channels, productId, context }: ProductFormProps) {
  const t = useTranslations("app");
  const { storeInformation, isLoading: isStoreInfoLoading } = useStoreInfo();
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    currentChannel: channels[0].channel_id,
    currentLocale: channels[0].locales[0].code,
  });
  const {
    currentChannel,
    currentLocale,
    productData,
    form,
    isProductInfoLoading,
    hasProductInfoLoadingError,
    isProductSaving,
    isTranslating,
    errors,
    forceRenderKey,
  } = state;

  const defaultLocale = useMemo(() => {
    const currentChannelData = channels.find(
      (c) => c.channel_id === currentChannel
    );
    return (
      currentChannelData?.locales.find((l) => l.is_default)?.code ||
      currentChannelData?.locales[0].code ||
      storeInformation.language
    );
  }, [channels, currentChannel, storeInformation.language]);

      const hasInitialized = useRef(false);

  const fetchProductData = useCallback(async (channelId: number, locale?: string) => {
    dispatch({ type: "SET_PRODUCT_INFO_LOADING", payload: true });
    try {
      const url = new URL(`/api/product/${productId}`, window.location.origin);
      url.searchParams.append('context', context);
      url.searchParams.append('channel_id', channelId.toString());
      if (locale) {
        url.searchParams.append('locale', locale);
      }
      
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(t("products.form.loadingError"));
      const data = await res.json();
      dispatch({ type: "SET_PRODUCT_DATA", payload: data });
    } catch (error) {
      console.error("Error fetching product data:", error);
      dispatch({ type: "SET_PRODUCT_INFO_LOADING_ERROR", payload: true });
      addAlert({
        type: "error",
        header: t("common.error"),
        messages: [{ text: t("products.form.loadingError") }],
      });
    }
  }, [productId, context, t]);

  useEffect(() => {
    if (hasInitialized.current || !channels?.length || !productId) {
      return;
    }

    hasInitialized.current = true;
    
    const savedChannelId = localStorage.getItem('translations_selected_channel');
    const savedLocale = localStorage.getItem('translations_selected_locale');
    
    const savedChannel = savedChannelId ? 
      channels.find(c => c.channel_id === Number(savedChannelId)) : 
      null;
    
    let channelToUse: number;
    let localeToUse: string;
    
    if (savedChannel && savedLocale && 
        savedChannel.locales.some(l => l.code === savedLocale)) {
      channelToUse = savedChannel.channel_id;
      localeToUse = savedLocale;
    } else {
      const firstChannel = channels[0];
      channelToUse = firstChannel.channel_id;
      localeToUse = firstChannel.locales?.[1]?.code || 
        firstChannel.locales[0].code;
      
      localStorage.setItem('translations_selected_channel', channelToUse.toString());
      localStorage.setItem('translations_selected_locale', localeToUse);
    }

    dispatch({ 
      type: "SET_INITIAL_STATE", 
      payload: { 
        channel: channelToUse, 
        locale: localeToUse,
        isInitialLoad: true
      } 
    });
    
    fetchProductData(channelToUse, localeToUse);
  }, [channels, productId, fetchProductData]);

  const handleSubmit = useCallback(
    async (
      event: FormEvent<HTMLFormElement> | MouseEvent<HTMLButtonElement>
    ) => {
      event.preventDefault();

      if (Object.keys(errors).length > 0) return;

      try {
        dispatch({ type: "SET_PRODUCT_SAVING", payload: true });
        const res = await fetch(
          `/api/product/${productId}?context=${context}&channel_id=${currentChannel}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...form, locale: currentLocale }),
          }
        );
        const updatedProductLocaleData: FormFields = await res.json();

        dispatch({
          type: "SET_PRODUCT_DATA",
          payload: {
            ...productData,
            localeData: {
              ...productData.localeData,
              [currentLocale]: updatedProductLocaleData,
            },
          },
        });
        addAlert({
          type: "success",
          header: t("common.success"),
          autoDismiss: true,
          messages: [{ text: t("products.form.saveSuccess") }],
        });
      } catch (error) {
        console.error("Error updating the product: ", error);
        addAlert({
          type: "error",
          header: t("common.error"),
          autoDismiss: true,
          messages: [{ text: t("products.form.savingError") }],
        });
        dispatch({ type: "SET_PRODUCT_SAVING", payload: false });
      }
    },
    [
      currentChannel,
      currentLocale,
      form,
      errors,
      productId,
      productData,
      context,
      t,
    ]
  );

  const handleLocaleChange = useCallback(
    async (selectedLocale: string) => {
      localStorage.setItem('translations_selected_locale', selectedLocale);

      if (productData.localeData[selectedLocale] || selectedLocale === defaultLocale) {
        let newFormObject = getFormObjectForLocale(productData, selectedLocale);
        dispatch({ type: "SET_FORM", payload: newFormObject });
        dispatch({ type: "SET_LOCALE", payload: selectedLocale });
        return;
      }

      try {
        dispatch({ type: "SET_PRODUCT_INFO_LOADING", payload: true });
        const res = await fetch(
          `/api/product/${productId}?context=${context}&channel_id=${currentChannel}&locale=${selectedLocale}`
        );
        
        if (!res.ok) throw new Error('Failed to fetch locale data');
        
        const localeData: any = await res.json();

        dispatch({
          type: "SET_PRODUCT_DATA",
          payload: {
            ...productData,
            localeData: {
              ...productData.localeData,
              [selectedLocale]: localeData.localeData?.[selectedLocale],
            },
          },
        });
        dispatch({ type: "SET_LOCALE", payload: selectedLocale });
        dispatch({ type: "SET_FORM", payload: localeData.localeData?.[selectedLocale] });
        dispatch({ type: "SET_PRODUCT_INFO_LOADING", payload: false });
      } catch (error) {
        console.error("Error fetching locale data:", error);
        addAlert({
          type: "error",
          header: t("common.error"),
          messages: [{ text: t("products.form.localeLoadingError") }],
        });
        dispatch({ type: "SET_PRODUCT_INFO_LOADING", payload: false });
      }
    },
    [productData, productId, currentChannel, context, t, defaultLocale]
  );

  const handleChannelChange = useCallback(
    (selectedChannelId: number) => {
      const selectedChannel = channels.find(
        (channel) => channel.channel_id === selectedChannelId
      );
      if (selectedChannel) {
        const newLocale = selectedChannel.locales?.[1]?.code || 
          selectedChannel.locales[0].code;

        localStorage.setItem('translations_selected_channel', selectedChannelId.toString());
        localStorage.setItem('translations_selected_locale', newLocale);

        dispatch({ type: "SET_CHANNEL", payload: selectedChannelId });
        dispatch({ type: "SET_LOCALE", payload: newLocale });
        
        fetchProductData(selectedChannelId, newLocale);
      }
    },
    [channels, fetchProductData]
  );

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = event.target;

      if (
        name.startsWith("customField_") ||
        name.startsWith("customFieldName_") ||
        name.startsWith("option_") ||
        name.startsWith("optionValue_") ||
        name.startsWith("modifier_") ||
        name.startsWith("modifierValue_") ||
        name.startsWith("modifierField_") ||
        name.startsWith("modifierDefaultValue_") ||
        name.startsWith("modifierDefaultValueFloat_")
      ) {
        const newForm = { ...form };

        if (
          name.startsWith("customField_") ||
          name.startsWith("customFieldName_")
        ) {
          const [_, fieldId] = name.split("_");
          if (!newForm.customFields) {
            newForm.customFields = {};
          }
          if (!newForm.customFields[fieldId]) {
            newForm.customFields[fieldId] = { name: "", value: "" };
          }
          if (name.startsWith("customFieldName_")) {
            newForm.customFields[fieldId].name = value;
          } else {
            newForm.customFields[fieldId].value = value;
          }
        } else if (
          name.startsWith("option_") ||
          name.startsWith("optionValue_")
        ) {
          const [type, id] = name.split("_");
          if (!newForm.options) {
            newForm.options = {};
          }
          if (type === "option") {
            if (!newForm.options[id]) {
              newForm.options[id] = { displayName: "", values: {} };
            }
            newForm.options[id].displayName = value;
          } else if (type === "optionValue") {
            const [optionId, valueId] = id.split(":");
            if (!newForm.options[optionId]) {
              newForm.options[optionId] = { displayName: "", values: {} };
            }
            newForm.options[optionId].values[valueId] = value;
          }
        } else {
          const [type, id] = name.split("_");
          if (!newForm.modifiers) {
            newForm.modifiers = {};
          }
          if (type === "modifier") {
            if (!newForm.modifiers[id]) {
              newForm.modifiers[id] = { displayName: "", values: {} };
            }
            newForm.modifiers[id].displayName = value;
          } else if (type === "modifierValue") {
            const [modifierId, valueId] = id.split(":");
            if (!newForm.modifiers[modifierId]) {
              newForm.modifiers[modifierId] = { displayName: "", values: {} };
            }
            if (!newForm.modifiers[modifierId].values) {
              newForm.modifiers[modifierId].values = {};
            }
            newForm.modifiers[modifierId].values[valueId] = value;
          } else if (type === "modifierField") {
            if (!newForm.modifiers[id]) {
              newForm.modifiers[id] = { displayName: "", fieldValue: "" };
            }
            newForm.modifiers[id].fieldValue = value;
          } else if (type === "modifierDefaultValue") {
            if (!newForm.modifiers[id]) {
              newForm.modifiers[id] = { displayName: "", defaultValue: "" };
            }
            newForm.modifiers[id].defaultValue = value;
          } else if (type === "modifierDefaultValueFloat") {
            if (!newForm.modifiers[id]) {
              newForm.modifiers[id] = {
                displayName: "",
                defaultValueFloat: "",
              };
            }
            newForm.modifiers[id].defaultValueFloat = value;
          }
        }

        dispatch({ type: "SET_FORM", payload: newForm });
      } else {
        dispatch({ type: "SET_FORM", payload: { ...form, [name]: value } });
      }
    },
    [form]
  );

  const handleEditorChange = useCallback(
    (content: string, fieldName: keyof FormFields) => {
      dispatch({
        type: "SET_FORM",
        payload: { ...form, [fieldName]: content },
      });
    },
    [form]
  );

  const handleTranslate = useCallback(async () => {
    if (currentLocale === defaultLocale) {
      addAlert({
        type: "warning",
        header: t("common.warning"),
        messages: [{ text: t("products.form.cannotTranslateDefaultLocale") }],
      });
      return;
    }

    try {
      dispatch({ type: "SET_TRANSLATING", payload: true });

      // Convert locale code to ISO 639-1 format for the API
      const targetLanguage = currentLocale.split('-')[0];
      const sourceLanguage = defaultLocale.split('-')[0];

      const result = await translateProduct({
        productData,
        currentLocaleData: form,
        targetLanguage,
        sourceLanguage,
      });

      if (result.success && result.translatedData) {
        // Force a deep clone to ensure React detects the state change
        const translatedData = JSON.parse(JSON.stringify(result.translatedData));
        
        dispatch({ type: "SET_FORM", payload: translatedData });
        dispatch({ type: "FORCE_RENDER" });
        addAlert({
          type: "success",
          header: t("products.form.translationPrepared"),
          autoDismiss: false,
          messages: [{ text: t("products.form.reviewAndSave") }],
        });
      } else {
        throw new Error(result.error || "Translation failed");
      }
    } catch (error) {
      console.error("Translation error:", error);
      addAlert({
        type: "error",
        header: t("common.error"),
        messages: [{ 
          text: error instanceof Error ? error.message : t("products.form.translateError")
        }],
      });
    } finally {
      dispatch({ type: "SET_TRANSLATING", payload: false });
    }
  }, [currentLocale, defaultLocale, productData, form, t]);


  if (isStoreInfoLoading) return <LoadingScreen />;

  if (!storeInformation.multi_language_enabled) {
    return <TranslationsGetStarted isActive={false} isLoading={false} />;
  }

  if (hasProductInfoLoadingError) return <ErrorMessage />;

  if (isProductInfoLoading) return <LoadingScreen />;

  return (
    <Loading isLoading={isProductInfoLoading}>
      <Box>
        {/* Mobile Layout */}
        <Box display={{ mobile: "block", tablet: "none" }}>
          <ChannelLocaleSelector
            channels={channels}
            currentChannel={currentChannel}
            currentLocale={currentLocale}
            onChannelChange={handleChannelChange}
            onLocaleChange={handleLocaleChange}
          />
          
          {currentLocale !== defaultLocale && (
            <Box marginTop="medium">
              <Button
                variant="secondary"
                onClick={handleTranslate}
                disabled={isTranslating || isProductSaving}
                isLoading={isTranslating}
                style={{ width: "100%" }}
              >
                ✨ {t("products.form.translateWithAI")} ✨
              </Button>
            </Box>
          )}
        </Box>

        {/* Desktop Layout */}
        <Flex 
          display={{ mobile: "none", tablet: "flex" }}
          flexDirection="row"
          alignItems="flex-end"
          justifyContent="space-between"
          flexGap={theme.spacing.xLarge}
        >
          <Box style={{ flex: 1 }}>
            <ChannelLocaleSelector
              channels={channels}
              currentChannel={currentChannel}
              currentLocale={currentLocale}
              onChannelChange={handleChannelChange}
              onLocaleChange={handleLocaleChange}
            />
          </Box>
          
          {currentLocale !== defaultLocale && (
            <Box>
              <Button
                variant="secondary"
                onClick={handleTranslate}
                disabled={isTranslating || isProductSaving}
                isLoading={isTranslating}
              >
                ✨ {t("products.form.translateWithAI")} ✨
              </Button>
            </Box>
          )}
        </Flex>

        <HR color="secondary30" />
      </Box>

      <StyledForm fullWidth={true} onSubmit={handleSubmit}>
        {translatableProductFields.map((field) => {
          if (field.type === "input" || field.type === "textarea") {
            return (
              <TranslatableField
                key={`${field.key}_${currentLocale}`}
                type={field.type}
                label={t(field.labelKey)}
                name={field.key}
                defaultValue={String(
                  productData[field.key as keyof FormFields] || ""
                )}
                currentValue={String(form[field.key as keyof FormFields] || "")}
                defaultLocale={defaultLocale}
                currentLocale={currentLocale}
                onChange={handleChange}
                onEditorChange={(content) =>
                  handleEditorChange(content, field.key as keyof FormFields)
                }
                required={field.required}
                minLength={4}
              />
            );
          }

          if (field.type === "optionsList" && productData?.options?.edges) {
            return (
              <ProductOptions
                key={`options_${currentLocale}_${forceRenderKey}`}
                options={productData.options.edges}
                formOptions={form.options || {}}
                defaultLocale={defaultLocale}
                currentLocale={currentLocale}
                onChange={handleChange}
              />
            );
          }

          if (field.type === "modifiersList" && productData?.modifiers?.edges) {
            return (
              <ProductModifiers
                key={`modifiers_${currentLocale}_${forceRenderKey}`}
                modifiers={productData.modifiers.edges}
                formModifiers={form.modifiers || {}}
                defaultLocale={defaultLocale}
                currentLocale={currentLocale}
                onChange={handleChange}
              />
            );
          }

          if (
            field.type === "customFieldsList" &&
            productData?.customFields?.edges
          ) {
            return (
              <CustomFields
                key={`customFields_${currentLocale}_${forceRenderKey}`}
                customFields={productData.customFields.edges}
                formCustomFields={form.customFields || {}}
                defaultLocale={defaultLocale}
                currentLocale={currentLocale}
                onChange={handleChange}
              />
            );
          }

          return null;
        })}

        {currentLocale !== defaultLocale && (
          <ActionBar
            actions={[
              {
                text: t("common.actions.save"),
                variant: "primary",
                onClick: handleSubmit,
                disabled: isProductSaving || isTranslating,
                isLoading: isProductSaving,
              },
            ]}
          />
        )}
      </StyledForm>
    </Loading>
  );
}

export default React.memo(ProductForm);
