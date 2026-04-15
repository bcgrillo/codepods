import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type SelectDropdownProps = {
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  items: { label: string; value: string }[]
  disabled?: boolean
  className?: string
}

export function SelectDropdown({
  value,
  onValueChange,
  placeholder,
  items,
  disabled,
  className,
}: SelectDropdownProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger disabled={disabled} className={className}>
        <SelectValue placeholder={placeholder ?? 'Select'} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}