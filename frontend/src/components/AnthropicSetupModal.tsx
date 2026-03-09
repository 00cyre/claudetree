import { useState } from 'react';

interface AnthropicSetupModalProps {
  onClose: () => void;
  onSetup: (apiKey: string) => Promise<void>;
}

export function AnthropicSetupModal({ onClose, onSetup }: AnthropicSetupModalProps) {
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
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.replace(/^Error:\s*/, ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Connect Claude AI</h3>
        <div className="modal-section">
          <label>Anthropic API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-api03-... or sk-ant-oat01-..."
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          <p className="modal-hint">
            API key (sk-ant-api03-...) or Claude Code OAuth token (sk-ant-oat01-...)
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
