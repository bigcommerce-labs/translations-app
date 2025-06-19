"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import styled from "styled-components";
import Papa, { ParseError } from "papaparse";
import {
  Box,
  Button,
  Checkbox,
  Flex,
  FlexItem,
  Modal,
  Panel,
  Select,
  Table,
  Text,
  Toggle,
  Tooltip,
  ProgressCircle,
  FormGroup,
  OffsetPaginationProps,
  Dropdown,
  FileUploader,
  InlineMessage,
} from "@bigcommerce/big-design";
import {
  ArrowDropDownIcon,
  ArrowUpwardIcon,
  FileDownloadIcon,
  MoreHorizIcon,
} from "@bigcommerce/big-design-icons";
import { Header, Page } from "@bigcommerce/big-design-patterns";
import { theme as defaultTheme } from "@bigcommerce/big-design-theme";
import { useChannels } from "@/hooks/useChannels";
import ErrorMessage from "@/components/error-message";
import { LoadingScreen } from "@/components/loading-indicator";
import { Suspense } from "react";

type TranslationJob = {
  id: number;
  status: "pending" | "processing" | "completed" | "failed";
  jobType: "import" | "export";
  resourceType: "products" | "categories";
  fileUrl?: string;
  channelId: number;
  locale: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

type CSVPreview = {
  headers: string[];
  firstRow: string[];
};

type CSVPreviewRow = {
  [key: string]: string;
};

type ErrorRawData = {
  record: Record<string, any>;
  response: any[];
};

const StyledPanelContents = styled.div`
  display: block;
  box-sizing: border-box;
  margin-inline: -${defaultTheme.spacing.medium};
  max-width: calc(
    100% + ${defaultTheme.spacing.medium}px + ${defaultTheme.spacing.medium}px
  );
  overflow-x: auto;
  @media (min-width: ${defaultTheme.breakpointValues.tablet}) {
    margin-inline: -${defaultTheme.spacing.xLarge};
    max-width: calc(
      100% + ${defaultTheme.spacing.xLarge}px + ${defaultTheme.spacing.xLarge}px
    );
  }
`;

function TranslationsJobsContent() {
  const t = useTranslations("translations.jobs");
  const searchParams = useSearchParams();
  const context = searchParams?.get("context");
  const [jobs, setJobs] = useState<TranslationJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedChannel, setSelectedChannel] = useState<number | null>(null);
  const [selectedLocale, setSelectedLocale] = useState<string>("");
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [isRunningCron, setIsRunningCron] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<CSVPreview | null>(null);
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [selectedResourceType, setSelectedResourceType] = useState<"products" | "categories">("products");
  const [includeDraftTranslations, setIncludeDraftTranslations] = useState(false);

  const {
    channels,
    isLoading: isChannelsLoading,
    error: channelsError,
  } = useChannels(context ?? null);

  // Get available locales for selected channel, excluding the default locale
  const availableLocales = selectedChannel
    ? channels
        ?.find((c) => c.channel_id === selectedChannel)
        ?.locales.filter((locale) => !locale.is_default) || []
    : [];

  const fetchJobs = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/translations/jobs?context=${context}`);
      if (!response.ok) throw new Error(t("errors.fetchJobs"));
      const data = await response.json();
      setJobs(data);
    } catch (error) {
      console.error(t("errors.fetchJobs"), error);
    } finally {
      setIsLoading(false);
    }
  }, [context, t]);

  const handleCreateJob = async (jobType: "import" | "export") => {
    if (!selectedChannel || !selectedLocale) return;

    if (jobType === "import") {
      setShowUploadModal(true);
      return;
    }

    setIsCreatingJob(true);
    try {
      const response = await fetch(
        `/api/translations/jobs?context=${context}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobType,
            resourceType: selectedResourceType,
            channelId: selectedChannel,
            locale: selectedLocale,
            includeDraftTranslations: jobType === "export" ? includeDraftTranslations : false,
          }),
        }
      );

      if (!response.ok) throw new Error(t("errors.createJob"));
      fetchJobs();
      if (jobType === "export") {
        setShowExportModal(false);
      }
      handleRunCron();
    } catch (error) {
      console.error(t("errors.createJob"), error);
    } finally {
      setIsCreatingJob(false);
    }
  };

  const handleFileSelect = (
    filesOrEvent: File[] | React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.isArray(filesOrEvent)
      ? filesOrEvent
      : filesOrEvent.target.files;
    const file = files?.[0];

    if (!file) {
      setSelectedFile(null);
      setCsvPreview(null);
      setCsvError(null);
      return;
    }

    setSelectedFile(file);
    setCsvError(null);
    Papa.parse<string[]>(file, {
      header: false,
      preview: 2,
      skipEmptyLines: "greedy",
      delimiter: ",",
      quoteChar: '"',
      escapeChar: '"',
      transformHeader: (header) => header.trim(),
      transform: (value) => value.trim(),
      complete: (results) => {
        if (results.data.length >= 2 && !results.errors.length) {
          const [headers, firstRow] = results.data;
          if (headers && firstRow) {
            setCsvPreview({
              headers: headers.map((header) => header.trim()),
              firstRow: firstRow.map((cell) => cell.trim()),
            });
            setShowPreviewModal(true);
          } else {
            console.error("Invalid CSV structure: Missing headers or first row");
            setCsvError(t("importModal.errors.csvParse"));
            setCsvPreview(null);
            setSelectedFile(null);
          }
        } else {
          console.error("CSV parsing failed or insufficient data", results.errors);
          setCsvError(t("importModal.errors.csvParse"));
          setCsvPreview(null);
          setSelectedFile(null);
        }
      },
      error: (error: Error) => {
        console.error("Error parsing CSV:", error);
        setCsvError(t("importModal.errors.csvParse"));
        setCsvPreview(null);
        setSelectedFile(null);
      },
    });
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsCreatingJob(true);
    try {
      // Create form data
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("channelId", selectedChannel!.toString());
      formData.append("locale", selectedLocale);
      formData.append("resourceType", selectedResourceType);

      // Upload file and create job
      const response = await fetch(
        `/api/translations/jobs?context=${context}`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(t("errors.uploadFile"));
      }

      setShowUploadModal(false);
      setShowPreviewModal(false);
      setSelectedFile(null);
      setCsvPreview(null);
      fetchJobs();
      handleRunCron();
    } catch (error) {
      console.error(t("errors.uploadFile"), error);
    } finally {
      setIsCreatingJob(false);
    }
  };

  const handleRunCron = async () => {
    setIsRunningCron(true);
    try {
      const response = await fetch(
        `/api/translations/cron?context=${context}`,
        {
          method: "GET",
        }
      );
      if (!response.ok) throw new Error(t("errors.runCron"));
      await fetchJobs();
    } catch (error) {
      console.error(t("errors.runCron"), error);
    } finally {
      setIsRunningCron(false);
    }
  };

  const handleBackClick = () => {
    router.push(context ? `/?context=${context}` : "/");
  };

  const handleChannelChange = (selectedChannelId: string) => {
    const channelId = Number(selectedChannelId);
    const selectedChannel = channels?.find(
      (channel) => channel.channel_id === channelId
    );

    if (selectedChannel) {
      setSelectedChannel(channelId);
      // Get first non-default locale
      const nonDefaultLocales = selectedChannel.locales.filter(
        (locale) => !locale.is_default
      );
      const newLocale = nonDefaultLocales[0]?.code || "";
      setSelectedLocale(newLocale);

      // Save selections to localStorage
      localStorage.setItem(
        "translations_selected_channel",
        channelId.toString()
      );
      localStorage.setItem("translations_selected_locale", newLocale);
    }
  };

  // Update locale selection and save to localStorage
  const handleLocaleChange = (value: string) => {
    setSelectedLocale(value || "");
    localStorage.setItem("translations_selected_locale", value);
  };

  // Load saved preferences or set defaults when channels load
  useEffect(() => {
    if (channels?.length && !selectedChannel) {
      const savedChannelId = localStorage.getItem(
        "translations_selected_channel"
      );
      const savedLocale = localStorage.getItem("translations_selected_locale");

      // Find the saved channel if it exists in current channels
      const savedChannel = savedChannelId
        ? channels.find((c) => c.channel_id === Number(savedChannelId))
        : null;

      if (
        savedChannel &&
        savedLocale &&
        savedChannel.locales.some(
          (l) => l.code === savedLocale && !l.is_default
        )
      ) {
        // Use saved preferences if valid and not default locale
        setSelectedChannel(savedChannel.channel_id);
        setSelectedLocale(savedLocale);
      } else {
        // Fall back to defaults
        const firstChannel = channels[0];
        const nonDefaultLocales = firstChannel.locales.filter(
          (locale) => !locale.is_default
        );
        const newLocale = nonDefaultLocales[0]?.code || "";

        setSelectedChannel(firstChannel.channel_id);
        setSelectedLocale(newLocale);

        // Save defaults
        localStorage.setItem(
          "translations_selected_channel",
          firstChannel.channel_id.toString()
        );
        localStorage.setItem("translations_selected_locale", newLocale);
      }
    }
  }, [channels, selectedChannel]);

  useEffect(() => {
    if (context) {
      fetchJobs();
    }
  }, [context, fetchJobs]);

  const handleViewErrors = (jobId: number) => {
    router.push(`/translations/jobs/${jobId}/errors${context ? `?context=${context}` : ''}`);
  };

  const openImportModal = () => {
    setShowImportModal(true);
    
    // Use a short timeout to wait for the modal to render then blur any focused element
    setTimeout(() => {
      // Query the toggle button that gets auto-focused
      const toggleButtons = document.querySelectorAll('#import-resource-type-toggle button');
      if (toggleButtons.length > 0) {
        // Remove focus from all toggle buttons
        toggleButtons.forEach(button => {
          if (button instanceof HTMLElement) {
            button.blur();
          }
        });
      }
      
      // Also try to blur any active element
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }, 50);
  };

  const openExportModal = () => {
    setShowExportModal(true);
    
    // Use a short timeout to wait for the modal to render then blur any focused element
    setTimeout(() => {
      // Query the toggle button that gets auto-focused
      const toggleButtons = document.querySelectorAll('#export-resource-type-toggle button');
      if (toggleButtons.length > 0) {
        // Remove focus from all toggle buttons
        toggleButtons.forEach(button => {
          if (button instanceof HTMLElement) {
            button.blur();
          }
        });
      }
      
      // Also try to blur any active element
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }, 50);
  };

  if (channelsError) return <ErrorMessage />;
  if (isChannelsLoading) return <LoadingScreen />;

  const channelOptions =
    channels?.map((c) => ({
      value: c.channel_id.toString(),
      content: c.channel_name,
    })) || [];

  const localeOptions = availableLocales.map((l) => ({
    value: l.code,
    content: l.title || l.code,
  }));

  const columns = [
    {
      header: t("columnHeaders.id"),
      hash: "id",
      render: (item: TranslationJob) => item.id,
    },
    {
      header: t("columnHeaders.type"),
      hash: "type",
      render: (item: TranslationJob) =>
        item.jobType === "import"
          ? t("columnHeaders.import")
          : t("columnHeaders.export"),
    },
    {
      header: t("columnHeaders.status"),
      hash: "status",
      render: (item: TranslationJob) => (
        <Flex alignItems="center" marginBottom="none">
          {item.status === "processing" && (
            <Box marginRight="xSmall">
              <ProgressCircle size="xSmall" />
            </Box>
          )}
          <Text>{t(`status_${item.status}`)}</Text>
          {item.error && (
            <Tooltip
              trigger={
                <Box display="inline-block">
                  <Text color="danger">(!)</Text>
                </Box>
              }
              placement="right-end"
            >
              {item.error}
            </Tooltip>
          )}
        </Flex>
      ),
    },
    {
      header: t("columnHeaders.channel"),
      hash: "channel",
      render: (item: TranslationJob) =>
        channels?.find((c) => c.channel_id === item.channelId)?.channel_name ||
        item.channelId,
    },
    {
      header: t("columnHeaders.locale"),
      hash: "locale",
      render: (item: TranslationJob) => {
        return item.locale;
      },
    },
    {
      header: t("columnHeaders.resourceType"),
      hash: "resourceType",
      render: (item: TranslationJob) => t(`resourceTypes.${item.resourceType || 'products'}`),
    },
    {
      header: t("columnHeaders.created"),
      hash: "created",
      render: (item: TranslationJob) =>
        new Date(item.createdAt).toLocaleString(),
    },
    {
      header: t("columnHeaders.actions"),
      hash: "actions",
      render: (item: TranslationJob) => (
        <Dropdown
          items={[
            {
              content: item.jobType === "export" ? t("actions.download") : t("actions.viewFile"),
              onItemClick: () => window.open(item.fileUrl, "_blank"),
              disabled: item.status !== "completed" || !item.fileUrl,
            },
            {
              content: t("actions.viewErrors"),
              onItemClick: () => handleViewErrors(item.id),
              disabled: !item.error,
            },
          ]}
          maxHeight={250}
          placement="bottom-end"
          toggle={<Button variant="utility" iconOnly={<MoreHorizIcon />} />}
        />
      ),
    },
  ];

  const paginationProps: OffsetPaginationProps = {
    currentPage,
    totalItems: jobs.length,
    itemsPerPage,
    onPageChange: setCurrentPage,
    itemsPerPageOptions: [10, 20, 50, 100],
    onItemsPerPageChange: (newItemsPerPage) => {
      setCurrentPage(1);
      setItemsPerPage(newItemsPerPage);
    },
  };

  const paginatedJobs = jobs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const closeImportModal = () => {
    setShowImportModal(false);
  };

  const closeExportModal = () => {
    setShowExportModal(false);
    setIncludeDraftTranslations(false);
  };

  return (
    <Page
      header={
        <Header
          actions={[
            {
              items: [
                {
                  content: t("importModal.title"),
                  onItemClick: openImportModal,
                  icon: <ArrowUpwardIcon />,
                },
                {
                  content: t("exportModal.title"),
                  onItemClick: openExportModal,
                  icon: <FileDownloadIcon />,
                },
              ],
              toggle: {
                text: t("actions.button"),
                variant: "primary",
                iconRight: <ArrowDropDownIcon />,
              },
            },
          ]}
          title={t("pageTitle")}
          description={t("pageDescription")}
          backLink={{
            text: t("navigation.back"),
            onClick: handleBackClick,
            href: "#",
          }}
        />
      }
    >
      <Flex flexDirection="column" flexGap={defaultTheme.spacing.xLarge}>
        <FlexItem>
          <Panel header={t("tableTitle")}>
            <StyledPanelContents>
              <Table
                columns={columns}
                items={paginatedJobs}
                stickyHeader
                itemName={t("pageTitle")}
                pagination={paginationProps}
                emptyComponent={
                  isLoading ? (
                    <Flex
                      alignItems="center"
                      justifyContent="center"
                      paddingVertical="xxLarge"
                      paddingHorizontal="medium"
                    >
                      <ProgressCircle size="medium" />
                    </Flex>
                  ) : (
                    <Flex
                      alignItems="center"
                      justifyContent="center"
                      flexDirection="column"
                      paddingVertical="xxLarge"
                      paddingHorizontal="medium"
                    >
                      <Text marginBottom="small">{t("emptyState.title")}</Text>
                      <Text>{t("emptyState.description")}</Text>
                    </Flex>
                  )
                }
              />
            </StyledPanelContents>
          </Panel>
        </FlexItem>
      </Flex>

      {/* Import Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={closeImportModal}
        closeOnClickOutside={false}
        closeOnEscKey={false}
        header={t("importModal.title")}
        actions={[
          {
            text: t("importModal.cancel"),
            variant: "subtle",
            onClick: closeImportModal,
          },
          {
            text: t("importModal.next"),
            variant: "primary",
            onClick: () => {
              if (selectedChannel && selectedLocale) {
                closeImportModal();
                setShowUploadModal(true);
              }
            },
            disabled: !selectedChannel || !selectedLocale || !selectedResourceType,
          },
        ]}
      >
        <Box padding="medium">
          <FormGroup>
            <Flex flexDirection="column">
              <FlexItem marginBottom="medium">
                <Toggle
                  id="import-resource-type-toggle"
                  label={t("modals.resourceType")}
                  items={[
                    { value: "products", label: t("resourceTypes.products") },
                    { value: "categories", label: t("resourceTypes.categories") }
                  ]}
                  onChange={(value) => setSelectedResourceType(value as "products" | "categories")}
                  value={selectedResourceType}
                />
              </FlexItem>
              
              <Flex>
                <FlexItem flexGrow={1} marginRight="medium">
                  <Select
                    label={t("importModal.selectChannel")}
                    options={channelOptions}
                    onOptionChange={handleChannelChange}
                    value={selectedChannel?.toString() || ""}
                    required
                  />
                </FlexItem>

                <FlexItem flexGrow={1}>
                  <Select
                    label={t("importModal.selectLocale")}
                    options={localeOptions}
                    onOptionChange={handleLocaleChange}
                    value={selectedLocale}
                    disabled={!selectedChannel}
                    required
                  />
                </FlexItem>
              </Flex>
            </Flex>
          </FormGroup>
        </Box>
      </Modal>

      {/* Export Modal */}
      <Modal
        isOpen={showExportModal}
        onClose={closeExportModal}
        closeOnClickOutside={false}
        closeOnEscKey={false}
        header={t("exportModal.title")}
        actions={[
          {
            text: t("exportModal.cancel"),
            variant: "subtle",
            onClick: closeExportModal,
          },
          {
            text: t("exportModal.export"),
            variant: "primary",
            onClick: () => handleCreateJob("export"),
            disabled: !selectedChannel || !selectedLocale || isCreatingJob || !selectedResourceType,
            isLoading: isCreatingJob,
          },
        ]}
      >
        <Box padding="medium">
          <FormGroup>
            <Flex flexDirection="column">
              <FlexItem marginBottom="medium">
                <Toggle
                  id="export-resource-type-toggle"
                  label={t("modals.resourceType")}
                  items={[
                    { value: "products", label: t("resourceTypes.products") },
                    { value: "categories", label: t("resourceTypes.categories") }
                  ]}
                  onChange={(value) => setSelectedResourceType(value as "products" | "categories")}
                  value={selectedResourceType}
                />
              </FlexItem>

              <FlexItem marginBottom="medium">
                <Checkbox
                  label={t("exportModal.draftTranslations.label")}
                  description={t("exportModal.draftTranslations.description")}
                  checked={includeDraftTranslations}
                  onChange={(event) => setIncludeDraftTranslations(event.target.checked)}
                />
              </FlexItem>
              
              <Flex>
                <FlexItem flexGrow={1} marginRight="medium">
                  <Select
                    label={t("exportModal.selectChannel")}
                    options={channelOptions}
                    onOptionChange={handleChannelChange}
                    value={selectedChannel?.toString() || ""}
                    required
                  />
                </FlexItem>

                <FlexItem flexGrow={1}>
                  <Select
                    label={t("exportModal.selectLocale")}
                    options={localeOptions}
                    onOptionChange={handleLocaleChange}
                    value={selectedLocale}
                    disabled={!selectedChannel}
                    required
                  />
                </FlexItem>
              </Flex>
            </Flex>
          </FormGroup>
        </Box>
      </Modal>

      {/* Upload Modal */}
      <Modal
        isOpen={showUploadModal && !showPreviewModal}
        onClose={() => {
          setShowUploadModal(false);
          setShowImportModal(true);
          setSelectedFile(null);
          setCsvPreview(null);
          setCsvError(null);
        }}
        closeOnClickOutside={false}
        closeOnEscKey={false}
        header={t("importModal.upload.title")}
        actions={[
          {
            text: t("navigation.back"),
            variant: "subtle",
            onClick: () => {
              setShowUploadModal(false);
              setShowImportModal(true);
              setSelectedFile(null);
              setCsvPreview(null);
              setCsvError(null);
            },
            disabled: isCreatingJob,
          },
        ]}
      >
        <Box padding="medium">
          {csvError && (
            <InlineMessage
              type="error"
              marginBottom="medium"
              messages={[
                {
                  text: csvError,
                  link: {
                    text: t("importModal.errors.bestPracticesLink"),
                    href: t("importModal.errors.bestPracticesUrl"),
                    target: "_blank",
                  },
                },
              ]}
            />
          )}
          <FileUploader
            accept=".csv"
            dropzoneConfig={{
              label: t("importModal.upload.dragAndDrop"),
            }}
            required={true}
            files={selectedFile ? [selectedFile] : []}
            onFilesChange={handleFileSelect}
          />
        </Box>
      </Modal>

      {/* Preview Modal */}
      <Modal
        isOpen={showPreviewModal}
        onClose={() => {
          setShowPreviewModal(false);
          setShowUploadModal(true);
          setSelectedFile(null);
          setCsvPreview(null);
        }}
        closeOnClickOutside={false}
        closeOnEscKey={false}
        header={t("importModal.preview.title")}
        actions={[
          {
            text: t("navigation.back"),
            variant: "subtle",
            onClick: () => {
              setShowPreviewModal(false);
              setShowUploadModal(true);
              setSelectedFile(null);
              setCsvPreview(null);
            },
            disabled: isCreatingJob,
          },
          {
            text: t("importModal.upload.uploadButton"),
            variant: "primary",
            onClick: handleUpload,
            isLoading: isCreatingJob,
          },
        ]}
      >
        {csvPreview && (
          <Box padding="medium">
            <InlineMessage
              type="info"
              marginBottom="medium"
              messages={[
                {
                  text: t("importModal.preview.description", { locale: selectedLocale }),
                  link: {
                    text: t("importModal.preview.learnMore"),
                    href: t("importModal.preview.learnMoreUrl"),
                    target: "_blank",
                  }
                },
              ]}
            />

            <Box
              backgroundColor="secondary10"
              borderRadius="normal"
              padding="medium"
              marginBottom="medium"
            >
              <Text color="secondary70" marginBottom="small">
                {t("importModal.preview.fileInfo", {
                  filename: selectedFile?.name,
                })}
              </Text>
              <Flex flexDirection="column">
                {csvPreview.headers.map((header, index) => (
                  <Flex
                    key={index}
                    marginBottom={
                      index < csvPreview.headers.length - 1 ? "small" : "none"
                    }
                    alignItems="flex-start"
                  >
                    <FlexItem flexBasis="50%">
                      <Text bold>{header}</Text>
                    </FlexItem>
                    <FlexItem flexBasis="50%">
                      <Text>{csvPreview.firstRow[index]}</Text>
                    </FlexItem>
                  </Flex>
                ))}
              </Flex>
            </Box>
          </Box>
        )}
      </Modal>
    </Page>
  );
}

export default function TranslationsJobs() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <TranslationsJobsContent />
    </Suspense>
  );
}
