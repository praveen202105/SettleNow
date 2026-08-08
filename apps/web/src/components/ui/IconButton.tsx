import { forwardRef } from 'react';

import { Button, type ButtonProps } from './Button';

export const IconButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, 'size'>>(
  function IconButton({ children, ...props }, ref) {
    return (
      <Button ref={ref} size="icon" {...props}>
        {children}
      </Button>
    );
  },
);
