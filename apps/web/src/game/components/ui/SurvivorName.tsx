import { useEffect, useState } from 'react';
import { useSignTypedData } from '@starknetfoundation/starknet-start-react';
import { Button, fieldStyles } from '../../../ui';
import { api } from '../../services/api';
import { survivorGuestId } from '../../survivors/guest';
import { shortAddress } from '../../utils/format';

export function SurvivorName({ address }: { address: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button
        variant="link"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Set leaderboard name
      </Button>
      {open && <NameForm address={address} />}
    </div>
  );
}

function NameForm({ address }: { address: string | null }) {
  const { signTypedDataAsync } = useSignTypedData({});
  const [value, setValue] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    const profile = address
      ? api.getWalletProfile(address)
      : api.guestProfile(survivorGuestId());
    profile
      .then(
        ({ name }) => {
          if (active) setValue(name);
        },
        () => {
          if (active) setMessage('Could not load the current name.');
        }
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [address]);

  async function save() {
    setSaving(true);
    setMessage('');
    try {
      const { name } = address
        ? await api.walletProfile(address, signTypedDataAsync, value.trim())
        : await api.guestProfile(survivorGuestId(), value.trim());
      setValue(name);
      setMessage('Name saved.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Could not save your name.'
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label>
        <span className="text-label text-fg-muted">
          {address ? `Wallet name · ${shortAddress(address)}` : 'Guest name'}
        </span>
        <input
          className={fieldStyles({ size: 'sm', className: 'mt-1' })}
          disabled={loading || saving}
          placeholder="Anonymous"
          required
          maxLength={64}
          value={value}
          onChange={(e) =>
            setValue(Array.from(e.target.value).slice(0, 32).join(''))
          }
        />
      </label>
      <Button
        type="submit"
        variant="outline"
        busy={saving}
        disabled={loading || !value.trim()}
      >
        {address ? 'Sign and save' : 'Save name'}
      </Button>
      {message && (
        <p role="status" className="w-full text-caption">
          {message}
        </p>
      )}
    </form>
  );
}
