import { useNavigate } from 'react-router-dom';
import { CreateWorkspaceModal } from './CreateWorkspaceModal';

/** Content-area page version of the workspace create flow. */
export function CreateWorkspacePage() {
  const navigate = useNavigate();
  return (
    <CreateWorkspaceModal
      open
      variant="page"
      onClose={() => navigate('/workspaces')}
      onCreated={() => {}}
    />
  );
}
