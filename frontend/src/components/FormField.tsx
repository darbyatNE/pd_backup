interface BaseFormFieldProps {
  label: string;
  id: string;
  required?: boolean;
  helperText?: string;
  error?: string;
  disabled?: boolean;
}

interface TextInputProps extends BaseFormFieldProps {
  type: 'text' | 'email' | 'number' | 'date' | 'tel';
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}

interface SelectProps extends BaseFormFieldProps {
  type: 'select';
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}

interface TextAreaProps extends BaseFormFieldProps {
  type: 'textarea';
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}

interface CheckboxProps extends BaseFormFieldProps {
  type: 'checkbox';
  checked: boolean;
  onChange: (checked: boolean) => void;
  helperText?: string;
}

type FormFieldProps = TextInputProps | SelectProps | TextAreaProps | CheckboxProps;

export default function FormField(props: FormFieldProps) {
  const { label, id, required, helperText, error, disabled } = props;

  const labelElement = (
    <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1">
      {label}
      {required && <span className="text-rose-500 ml-1">*</span>}
    </label>
  );

  const helperElement = helperText && !error && (
    <p className="mt-1 text-xs text-slate-500">{helperText}</p>
  );

  const errorElement = error && (
    <p className="mt-1 text-sm text-rose-600" role="alert">
      {error}
    </p>
  );

  const baseInputClasses = `w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 ${
    error
      ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
      : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
  } ${disabled ? 'cursor-not-allowed bg-slate-100 text-slate-500' : 'bg-white text-slate-900'}`;

  if (props.type === 'checkbox') {
    return (
      <div className="flex items-start">
        <div className="flex h-5 items-center">
          <input
            type="checkbox"
            id={id}
            checked={props.checked}
            onChange={(e) => props.onChange(e.target.checked)}
            disabled={disabled}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-200 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <div className="ml-3 text-sm">
          <label htmlFor={id} className="font-medium text-slate-700">
            {label}
          </label>
          {helperText && <p className="text-slate-500">{helperText}</p>}
          {errorElement}
        </div>
      </div>
    );
  }

  if (props.type === 'select') {
    return (
      <div>
        {labelElement}
        <select
          id={id}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          disabled={disabled}
          required={required}
          className={baseInputClasses}
        >
          {props.placeholder && (
            <option value="" disabled>
              {props.placeholder}
            </option>
          )}
          {props.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {helperElement}
        {errorElement}
      </div>
    );
  }

  if (props.type === 'textarea') {
    return (
      <div>
        {labelElement}
        <textarea
          id={id}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          rows={props.rows || 3}
          disabled={disabled}
          required={required}
          className={baseInputClasses}
        />
        {helperElement}
        {errorElement}
      </div>
    );
  }

  // Text, email, number, date, tel inputs
  return (
    <div>
      {labelElement}
      <input
        type={props.type}
        id={id}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        min={props.min}
        max={props.max}
        step={props.step}
        disabled={disabled}
        required={required}
        className={baseInputClasses}
      />
      {helperElement}
      {errorElement}
    </div>
  );
}
