import { Switch } from './switch';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  labelOn?: string;
  labelOff?: string;
}

export function ToggleSwitch({ checked, onChange, disabled, labelOn, labelOff }: ToggleSwitchProps) {
  return (
    <Switch
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      title={checked ? labelOn : labelOff}
    />
  );
}