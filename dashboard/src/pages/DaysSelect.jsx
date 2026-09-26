import { useApp } from '../context.js';
import { Select } from '../components/Select.jsx';

export const DAY_OPTIONS = ['7', '28', '90'];

export function DaysSelect({ value, onChange }) {
  const { t } = useApp();
  return (
    <Select
      id="days"
      label={t('common.window')}
      value={value}
      options={DAY_OPTIONS.map((d) => ({ value: d, label: t('common.lastDays', { days: d }) }))}
      onChange={onChange}
    />
  );
}
