import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react';

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from './InputGroup';

export const PasswordInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode }
>(function PasswordInput({ icon, onKeyDown, onKeyUp, ...props }, ref) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const updateCapsLock = (event: KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(event.getModifierState('CapsLock'));
  };

  return (
    <div>
      <InputGroup>
        {icon ? <InputGroupAddon aria-hidden="true">{icon}</InputGroupAddon> : null}
        <InputGroupInput
          ref={ref}
          type={visible ? 'text' : 'password'}
          onKeyDown={(event) => {
            updateCapsLock(event);
            onKeyDown?.(event);
          }}
          onKeyUp={(event) => {
            updateCapsLock(event);
            onKeyUp?.(event);
          }}
          {...props}
        />
        <InputGroupButton
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </InputGroupButton>
      </InputGroup>
      {capsLock ? (
        <p className="mt-1.5 text-xs font-medium text-amber-700" role="status">
          Caps Lock is on
        </p>
      ) : null}
    </div>
  );
});
