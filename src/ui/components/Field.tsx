import type { InputHTMLAttributes, ReactNode, Ref, TextareaHTMLAttributes } from 'react';
import { useT } from '../hooks/useT';
import { Icon } from './Icon';

interface CommonProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  counter?: string;
  required?: boolean;
  suffix?: string;
}

function describedBy(id: string, hint?: string, error?: string): string | undefined {
  const ids = [error ? `${id}-err` : null, hint ? `${id}-hint` : null].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

function LabelRow({ id, label, counter, required }: Pick<CommonProps, 'id' | 'label' | 'counter' | 'required'>) {
  const { t } = useT();
  const lab = (
    <label htmlFor={id}>
      {label}
      {required ? (
        <>
          {' '}
          <span aria-hidden="true">*</span>
          <span className="sr-only"> {t('a11y.required')}</span>
        </>
      ) : null}
    </label>
  );
  if (!counter) return lab;
  return (
    <div className="label-row">
      {lab}
      <span className="muted small num" aria-hidden="true">
        {counter}
      </span>
    </div>
  );
}

function Messages({ id, hint, error }: Pick<CommonProps, 'id' | 'hint' | 'error'>) {
  return (
    <>
      {error ? (
        <p id={`${id}-err`} className="err">
          <Icon name="alert" />
          <span>{error}</span>
        </p>
      ) : null}
      {hint ? (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      ) : null}
    </>
  );
}

export type TextFieldProps = CommonProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & { inputRef?: Ref<HTMLInputElement>; children?: ReactNode };

export function TextField({ id, label, hint, error, counter, required, suffix, inputRef, className = '', ...rest }: TextFieldProps) {
  const input = (
    <input
      id={id}
      ref={inputRef}
      className={`input ${className}`.trim()}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(id, hint, error)}
      aria-required={required || undefined}
      {...rest}
    />
  );
  return (
    <div className="field">
      <LabelRow id={id} label={label} counter={counter} required={required} />
      {suffix ? (
        <div className="with-suffix">
          {input}
          <span aria-hidden="true">{suffix}</span>
        </div>
      ) : (
        input
      )}
      <Messages id={id} hint={hint} error={error} />
    </div>
  );
}

export type TextAreaProps = CommonProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & { inputRef?: Ref<HTMLTextAreaElement> };

export function TextArea({ id, label, hint, error, counter, required, inputRef, className = '', ...rest }: TextAreaProps) {
  return (
    <div className="field">
      <LabelRow id={id} label={label} counter={counter} required={required} />
      <textarea
        id={id}
        ref={inputRef}
        className={`input ${className}`.trim()}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...rest}
      />
      <Messages id={id} hint={hint} error={error} />
    </div>
  );
}
