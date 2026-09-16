import { useNavigate } from 'react-router-dom';
import { CreateAiProviderModal } from './CreateAiProviderModal';

/** Content-area page version of the provider create flow. */
export function CreateAiProviderPage() {
  const navigate = useNavigate();
  return (
    <CreateAiProviderModal
      open
      variant="page"
      onClose={() => navigate('/ai-providers')}
      onCreated={() => {}}
    />
  );
}
