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

      const safePayloadKeys = Array.isArray(config?.payload_keys)
        ? config.payload_keys.filter(Boolean)
        : (typeof config?.payload_keys === 'string'
          ? config.payload_keys.split(',').map((s) => s.trim()).filter(Boolean)
          : (config?.payload_key ? [config.payload_key] : []));

      const safePayloadTypes = Array.isArray(config?.payload_types)
        ? config.payload_types.filter(Boolean)
        : (typeof config?.payload_types === 'string'
          ? config.payload_types.split(',').map((s) => s.trim()).filter(Boolean)
          : (config?.payload_type ? [config.payload_type] : []));

      return {
        event_type: (config?.event_type || '').trim() || 'webhook.received',
        target_url: safeUrls[0],
        target_urls: safeUrls,
        payload_key: safePayloadKeys[0] || 'event.id',
        payload_keys: safePayloadKeys,
        payload_type: safePayloadTypes[0] || 'string',
        payload_types: safePayloadTypes,
        is_active: config?.is_active ?? true,
        metadata_json: {
          ...metadata_json,
          payload_keys: safePayloadKeys,
          payload_types: safePayloadTypes,
        },
      };
    });
};

export const createProjectPayload = ({ 
  name, 
  description = '', 
  eventConfigs = [], 
  isActive = true, 
  retentionMode = 'rolling_days', 
  retentionDays = 30, 
  deleteDate = '', 
  deleteTime = '02:00' 
}) => {
  const normalizedRetention = Number.isFinite(Number(retentionDays)) ? Number(retentionDays) : 30;

  return {
    name: name?.trim() || '',
    description: description?.trim() || '',
    is_active: isActive,
    retention_mode: retentionMode || 'rolling_days',
    retention_days: normalizedRetention,
    delete_date: typeof deleteDate === 'string' ? deleteDate.trim() : null,
    delete_time: typeof deleteTime === 'string' ? deleteTime.trim() : '02:00',
    event_configs: buildProjectEventConfigs(eventConfigs),
  };
};
