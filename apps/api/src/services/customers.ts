import { Prisma } from '@prisma/client';

import type {
  CustomerInput,
  CustomerListQuery,
  CustomerResponse,
  PaginationMeta,
} from '@settleflow/shared';

import { AppError } from '../http/errors.js';
import { prisma } from '../lib/prisma.js';
import { writeAuditEvent } from './audit.js';

function presentCustomer(customer: {
  createdAt: Date;
  id: string;
  mobile: string;
  name: string;
  updatedAt: Date;
}): CustomerResponse {
  return {
    createdAt: customer.createdAt.toISOString(),
    id: customer.id,
    mobile: customer.mobile,
    name: customer.name,
    updatedAt: customer.updatedAt.toISOString(),
  };
}

function duplicateMobile(existingCustomerId: string): AppError {
  return new AppError(
    409,
    'CUSTOMER_MOBILE_IN_USE',
    'A customer with this mobile number already exists. Select the existing customer.',
    { existingCustomerId },
  );
}

export async function listCustomers(
  userId: string,
  query: CustomerListQuery,
): Promise<{ data: CustomerResponse[]; meta: PaginationMeta }> {
  const where: Prisma.CustomerWhereInput = {
    userId,
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { mobile: { contains: query.search } },
          ],
        }
      : {}),
  };
  const [total, customers] = await prisma.$transaction([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    data: customers.map(presentCustomer),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

export async function createCustomer(
  userId: string,
  input: CustomerInput,
  requestId?: string,
): Promise<CustomerResponse> {
  const existing = await prisma.customer.findUnique({
    where: { userId_mobile: { userId, mobile: input.mobile } },
  });
  if (existing) throw duplicateMobile(existing.id);

  try {
    const customer = await prisma.$transaction(async (transaction) => {
      const created = await transaction.customer.create({
        data: { mobile: input.mobile, name: input.name, userId },
      });
      await writeAuditEvent(transaction, {
        action: 'customer.created',
        entityId: created.id,
        entityType: 'customer',
        metadata: { name: created.name },
        requestId,
        userId,
      });
      return created;
    });
    return presentCustomer(customer);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const raced = await prisma.customer.findUnique({
        where: { userId_mobile: { userId, mobile: input.mobile } },
        select: { id: true },
      });
      if (raced) throw duplicateMobile(raced.id);
    }
    throw error;
  }
}
