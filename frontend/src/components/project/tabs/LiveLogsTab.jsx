import React from 'react';
import LogsPage from '@/pages/LogsPage';

export default function LiveLogsTab({ project }) {
  return <LogsPage projectId={project?.id} embedded={true} />;
}
