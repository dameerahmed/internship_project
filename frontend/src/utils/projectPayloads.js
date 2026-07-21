const normalizeUrls = (rawUrls = []) => {
  return (rawUrls || [])
    .map((url) => (url || '').trim())
    .filter(Boolean);
};

export const buildProjectEventConfigs = (eventConfigs = []) => {
  return (eventConfigs || [])
    .filter((config) => (config?.event_type || '').trim())
    .map((config) => {
      const rawMetadata = config?.metadata_json && typeof config.metadata_json === 'object'
        ? { ...config.metadata_json }
        : {};
      const initialUrls = normalizeUrls(config?.target_urls || rawMetadata?.urls || []);
      const safeUrls = initialUrls.length ? initialUrls : ['https://example.com/webhook'];
      const metadata_json = {
        ...rawMetadata,
        source: rawMetadata.source || 'ui',
        urls: safeUrls,
      };

      if (config?.payload_key !== undefined) metadata_json.payload_key = config.payload_key;
      if (config?.payload_type !== undefined) metadata_json.payload_type = config.payload_type;
      if (config?.retention_value !== undefined) metadata_json.retention_value = config.retention_value;
      if (config?.retention_unit !== undefined) metadata_json.retention_unit = config.retention_unit;

      return {
        event_type: (config?.event_type || '').trim() || 'webhook.received',
        target_url: safeUrls[0],
        target_urls: safeUrls,
        payload_key: config?.payload_key || metadata_json.payload_key || 'event.id',
        payload_type: config?.payload_type || metadata_json.payload_type || 'string',
        is_active: config?.is_active ?? true,
        metadata_json,
      };
    });
};

export const createProjectPayload = ({ name, description = '', eventConfigs = [], isActive = true, retentionDays = 30, deleteTime = '' }) => {
  const normalizedRetention = Number.isFinite(Number(retentionDays)) ? Number(retentionDays) : 30;
  const normalizedDeleteTime = typeof deleteTime === 'string' ? deleteTime.trim() : '';

  return {
    name: name?.trim() || '',
    description: description?.trim() || '',
    is_active: isActive,
    retention_days: normalizedRetention,
    delete_time: normalizedDeleteTime || null,
    event_configs: buildProjectEventConfigs(eventConfigs),
  };
};
