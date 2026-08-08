import * as PopoverPrimitive from '@radix-ui/react-popover';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Plus, Search, UserRound, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
  customerInputSchema,
  normalizeE164Phone,
  type CustomerInput,
  type CustomerResponse,
} from '@settleflow/shared';

import { Button } from '../../components/ui/Button';
import { DialogContent, DialogRoot } from '../../components/ui/Dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '../../components/ui/InputGroup';
import { Spinner } from '../../components/ui/Spinner';
import { ApiClientError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { queryClient } from '../../lib/query';
import { customerKeys, customersApi } from './api';

const customerFormSchema = z.object({
  mobile: z.string().refine((value) => normalizeE164Phone(value) !== null, {
    message: 'Use international format, for example +919876543210.',
  }),
  name: z.string().trim().min(1, 'Customer name is required.').max(160),
});

type CustomerFormValues = z.infer<typeof customerFormSchema>;

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);
  return debounced;
}

export function CustomerCombobox({
  invalid,
  onValueChange,
  value,
}: {
  invalid?: boolean;
  onValueChange: (customer: CustomerResponse) => void;
  value: CustomerResponse | null;
}) {
  const listboxId = useId();
  const listboxRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 250);
  const query = useMemo(
    () => ({ page: 1, pageSize: 20, ...(debouncedSearch ? { search: debouncedSearch } : {}) }),
    [debouncedSearch],
  );
  const customers = useQuery({
    queryKey: customerKeys.list(query),
    queryFn: () => customersApi.list(query),
    enabled: open,
    staleTime: 30_000,
  });

  const select = (customer: CustomerResponse) => {
    onValueChange(customer);
    setOpen(false);
    setSearch('');
  };

  const focusOption = (index: number) => {
    const options = listboxRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    if (!options || options.length === 0) return;
    options[Math.max(0, Math.min(index, options.length - 1))]?.focus();
  };

  const moveOptionFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusOption(index + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusOption(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusOption(Number.MAX_SAFE_INTEGER);
    }
  };

  return (
    <>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-label="Customer"
            aria-controls={listboxId}
            aria-describedby={invalid ? 'customer-error' : undefined}
            aria-expanded={open}
            aria-invalid={invalid}
            className={cn(
              'h-auto min-h-11 w-full justify-between px-3 py-2 text-left font-normal',
              !value && 'text-slate-400',
              invalid && 'border-red-400 focus-visible:ring-red-500/15',
            )}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium text-slate-800">
                {value?.name ?? 'Select a customer'}
              </span>
              {value ? (
                <span className="block truncate text-xs text-slate-500">{value.mobile}</span>
              ) : null}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
          </Button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={6}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              searchInputRef.current?.focus();
            }}
            className="z-[100] w-[var(--radix-popover-trigger-width)] min-w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="border-b border-slate-100 p-2">
              <InputGroup>
                <InputGroupAddon aria-hidden="true">
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  ref={searchInputRef}
                  aria-label="Search customers"
                  placeholder="Search name or mobile…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      focusOption(0);
                    }
                  }}
                />
                {search ? (
                  <InputGroupAddon className="ml-auto px-1.5">
                    <button
                      type="button"
                      aria-label="Clear customer search"
                      className="rounded p-1 text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      onClick={() => setSearch('')}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </InputGroupAddon>
                ) : null}
              </InputGroup>
            </div>
            <div
              ref={listboxRef}
              id={listboxId}
              role="listbox"
              aria-label="Customers"
              className="max-h-64 overflow-y-auto p-1"
            >
              {customers.isPending ? (
                <div className="flex justify-center p-5">
                  <Spinner label="Loading customers…" />
                </div>
              ) : customers.error ? (
                <p className="p-4 text-sm text-red-600">Customers could not be loaded.</p>
              ) : customers.data.data.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">No matching customers.</p>
              ) : (
                customers.data.data.map((customer, index) => (
                  <button
                    key={customer.id}
                    type="button"
                    role="option"
                    aria-selected={value?.id === customer.id}
                    onKeyDown={(event) => moveOptionFocus(event, index)}
                    className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left outline-none hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                    onClick={() => select(customer)}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                      <UserRound className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">
                        {customer.name}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {customer.mobile}
                      </span>
                    </span>
                    {value?.id === customer.id ? (
                      <Check className="size-4 text-blue-600" aria-hidden="true" />
                    ) : null}
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-slate-100 p-2">
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  setOpen(false);
                  setCreateOpen(true);
                }}
              >
                <Plus aria-hidden="true" /> Add new customer
              </Button>
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
      <CreateCustomerDialog
        open={createOpen}
        setOpen={setCreateOpen}
        initialMobile={normalizeE164Phone(search) ? search : ''}
        onCreated={select}
      />
    </>
  );
}

function CreateCustomerDialog({
  initialMobile,
  onCreated,
  open,
  setOpen,
}: {
  initialMobile: string;
  onCreated: (customer: CustomerResponse) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: { mobile: initialMobile, name: '' },
  });
  useEffect(() => {
    if (open) reset({ mobile: initialMobile, name: '' });
  }, [initialMobile, open, reset]);

  const mutation = useMutation({
    mutationFn: (input: CustomerInput) => customersApi.create(input),
  });
  const submit = async (values: CustomerFormValues) => {
    try {
      const customer = await mutation.mutateAsync(customerInputSchema.parse(values));
      await queryClient.invalidateQueries({ queryKey: customerKeys.all });
      toast.success('Customer added.');
      setOpen(false);
      onCreated(customer);
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'CUSTOMER_MOBILE_IN_USE') {
        setError('mobile', { message: error.message });
        return;
      }
      toast.error(error instanceof ApiClientError ? error.message : 'Customer could not be added.');
    }
  };

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogContent
        title="Add customer"
        description="Save the customer once, then reuse them on future orders."
      >
        <form
          className="space-y-5 p-5 sm:p-6"
          onSubmit={(event) => void handleSubmit(submit)(event)}
          noValidate
        >
          <Field>
            <FieldLabel htmlFor="new-customer-name">Customer name</FieldLabel>
            <Input
              id="new-customer-name"
              autoComplete="organization"
              placeholder="Acme Corporation"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'new-customer-name-error' : undefined}
              {...register('name')}
            />
            <FieldError id="new-customer-name-error">{errors.name?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="new-customer-mobile">Mobile number</FieldLabel>
            <Input
              id="new-customer-mobile"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+919876543210"
              aria-invalid={Boolean(errors.mobile)}
              aria-describedby={
                errors.mobile ? 'new-customer-mobile-error' : 'new-customer-mobile-help'
              }
              {...register('mobile')}
            />
            <FieldDescription id="new-customer-mobile-help">
              Include the country code. Spaces and hyphens are accepted.
            </FieldDescription>
            <FieldError id="new-customer-mobile-error">{errors.mobile?.message}</FieldError>
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {isSubmitting || mutation.isPending ? (
                <Spinner label="Adding customer…" />
              ) : (
                'Add customer'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
