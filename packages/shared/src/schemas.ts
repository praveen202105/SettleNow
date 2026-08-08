import { z } from 'zod';

import {
  DEFAULT_PAGE_SIZE,
  AUDIT_ACTIONS,
  MAX_LINE_ITEMS,
  MAX_MONEY_CENTS,
  MAX_PAGE_SIZE,
  ORDER_SORT_FIELDS,
  ORDER_STATUSES,
  SORT_DIRECTIONS,
} from './constants.js';
import { isIsoDate } from './date.js';

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format.')
  .refine(isIsoDate, 'Enter a valid calendar date.');

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(8).max(128);

export const signupSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const lineItemInputSchema = z
  .object({
    description: z.string().trim().min(1, 'Description is required.').max(200),
    quantity: z.number().int().min(1).max(100_000),
    unitPriceCents: z.number().int().min(0).max(MAX_MONEY_CENTS),
  })
  .superRefine((item, context) => {
    if (BigInt(item.quantity) * BigInt(item.unitPriceCents) > BigInt(MAX_MONEY_CENTS)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Line total exceeds the supported amount.',
        path: ['unitPriceCents'],
      });
    }
  });

export const orderInputSchema = z
  .object({
    customer: z.string().trim().min(1, 'Customer name is required.').max(160),
    dueDate: isoDateSchema,
    lineItems: z.array(lineItemInputSchema).min(1).max(MAX_LINE_ITEMS),
  })
  .superRefine((order, context) => {
    const total = order.lineItems.reduce(
      (sum, item) => sum + BigInt(item.quantity) * BigInt(item.unitPriceCents),
      0n,
    );
    if (total > BigInt(MAX_MONEY_CENTS)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Order total exceeds the supported amount.',
        path: ['lineItems'],
      });
    }
  });

export const paymentInputSchema = z.object({
  amountCents: z.number().int().min(1).max(MAX_MONEY_CENTS),
  date: isoDateSchema,
  note: z.string().trim().max(500).optional().default(''),
});

export const orderListQuerySchema = z.object({
  direction: z.enum(SORT_DIRECTIONS).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(ORDER_SORT_FIELDS).default('orderNumber'),
  status: z.enum(ORDER_STATUSES).optional(),
});

export const orderExportInputSchema = z.object({
  direction: z.enum(SORT_DIRECTIONS).default('desc'),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(ORDER_SORT_FIELDS).default('orderNumber'),
  status: z.enum(ORDER_STATUSES).optional(),
});

export const activityQuerySchema = z.object({
  action: z.enum(AUDIT_ACTIONS).optional(),
  orderId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const exportListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type LineItemInput = z.infer<typeof lineItemInputSchema>;
export type OrderInput = z.infer<typeof orderInputSchema>;
export type PaymentInput = z.infer<typeof paymentInputSchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
export type OrderExportInput = z.infer<typeof orderExportInputSchema>;
export type ActivityQuery = z.infer<typeof activityQuerySchema>;
export type ExportListQuery = z.infer<typeof exportListQuerySchema>;
