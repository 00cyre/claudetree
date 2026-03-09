import { useState } from 'react';

interface LinearSetupModalProps {
  onClose: () => void;
  onSetup: (apiKey: string) => Promise<void>;
}

export function LinearSetupModal({ onClose, onSetup }: LinearSetupModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!apiKey.trim()) return;
    setLoading(true);
    setError('');
    try {
      await onSetup(apiKey.trim());
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Connect Linear</h3>
        <div className="modal-section">
          <label>Personal API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="lin_api_..."
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          <p className="modal-hint">
            Generate at Linear → Settings → Account → API
          </p>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={loading || !apiKey.trim()}
          >
            {loading ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  );
}
