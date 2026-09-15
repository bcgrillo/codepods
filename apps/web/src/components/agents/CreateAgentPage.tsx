import { useNavigate } from 'react-router-dom';
import { CreateAgentModal } from './CreateAgentModal';

/** Content-area page version of the agent create wizard. */
export function CreateAgentPage() {
  const navigate = useNavigate();
  return (
    <CreateAgentModal
      open
      variant="page"
      onClose={() => navigate('/agents')}
      onCreated={() => {}}
    />
  );
}
