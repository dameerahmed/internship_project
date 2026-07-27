import React from 'react';
import DLQPage from '@/pages/DLQPage';

export default function DLQTab({ project }) {
  return <DLQPage projectId={project?.id} embedded={true} />;
}
