export const normalizeEventConfig = (config = {}) => {
  const normalizedConfig = { ...config };

  const urls = Array.isArray(normalizedConfig.target_urls) && normalizedConfig.target_urls.length
    ? normalizedConfig.target_urls
    : (Array.isArray(normalizedConfig.metadata_json?.urls) && normalizedConfig.metadata_json.urls.length
      ? normalizedConfig.metadata_json.urls
      : (normalizedConfig.target_url ? [normalizedConfig.target_url] : []));

  const payloadKeys = Array.isArray(normalizedConfig.payload_keys)
    ? normalizedConfig.payload_keys
    : (Array.isArray(normalizedConfig.metadata_json?.payload_keys)
      ? normalizedConfig.metadata_json.payload_keys
      : (Array.isArray(normalizedConfig.payload_key)
        ? normalizedConfig.payload_key
        : (normalizedConfig.payload_key ? [normalizedConfig.payload_key] : [])));

  const payloadTypes = Array.isArray(normalizedConfig.payload_types)
    ? normalizedConfig.payload_types
    : (Array.isArray(normalizedConfig.metadata_json?.payload_types)
      ? normalizedConfig.metadata_json.payload_types
      : (Array.isArray(normalizedConfig.payload_type)
        ? normalizedConfig.payload_type
        : (normalizedConfig.payload_type ? [normalizedConfig.payload_type] : [])));

  normalizedConfig.target_urls = urls;
  normalizedConfig.payload_keys = payloadKeys;
  normalizedConfig.payload_types = payloadTypes;

  return normalizedConfig;
};

export const normalizeEventConfigs = (configs = []) => {
  if (!Array.isArray(configs)) return [];
  return configs.map(normalizeEventConfig).filter(Boolean);
};
