import 'dotenv/config';

import { Algorithm, hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function dateFromToday(offsetDays: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Development seed is disabled in production.');
  }

  const email = (process.env.SEED_DEMO_EMAIL ?? 'demo@settleflow.test').trim().toLowerCase();
  const password = process.env.SEED_DEMO_PASSWORD ?? 'DemoPass123!';
  const passwordHash = await hash(password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19_456,
    parallelism: 1,
    timeCost: 2,
  });

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      displayName: 'Demo User',
      email,
      passwordHash,
    },
    update: {
      displayName: 'Demo User',
      passwordHash,
    },
  });

  await prisma.order.deleteMany({ where: { userId: user.id } });
  await prisma.customer.deleteMany({ where: { userId: user.id } });

  const samples = [
    {
      customer: 'Acme Corporation',
      mobile: '+919000000001',
      dueDate: dateFromToday(7),
      items: [{ description: 'Widget Pro License', quantity: 2, unitPriceCents: 50_000 }],
      payments: [{ amountCents: 40_000, date: dateFromToday(-1), note: 'First installment' }],
    },
    {
      customer: 'Globex Industries',
      mobile: '+919000000002',
      dueDate: dateFromToday(-10),
      items: [
        { description: 'Annual Support Plan', quantity: 1, unitPriceCents: 120_000 },
        { description: 'Onboarding Package', quantity: 1, unitPriceCents: 30_000 },
      ],
      payments: [],
    },
    {
      customer: 'Initech LLC',
      mobile: '+919000000003',
      dueDate: dateFromToday(14),
      items: [{ description: 'Cloud Storage (TB)', quantity: 5, unitPriceCents: 8_000 }],
      payments: [{ amountCents: 40_000, date: dateFromToday(-3), note: null }],
    },
    {
      customer: 'Umbrella Corp',
      mobile: '+919000000004',
      dueDate: dateFromToday(-30),
      items: [{ description: 'Enterprise License', quantity: 3, unitPriceCents: 75_000 }],
      payments: [
        { amountCents: 100_000, date: dateFromToday(-35), note: 'Deposit' },
        { amountCents: 125_000, date: dateFromToday(-32), note: 'Final payment' },
      ],
    },
    {
      customer: 'Stark Enterprises',
      mobile: '+919000000005',
      dueDate: dateFromToday(30),
      items: [{ description: 'API Access Tier 3', quantity: 1, unitPriceCents: 59_900 }],
      payments: [],
    },
  ];

  for (const sample of samples) {
    const customer = await prisma.customer.create({
      data: { mobile: sample.mobile, name: sample.customer, userId: user.id },
    });
    await prisma.order.create({
      data: {
        customer: sample.customer,
        customerId: customer.id,
        customerMobile: customer.mobile,
        dueDate: sample.dueDate,
        userId: user.id,
        lineItems: {
          create: sample.items.map((item, position) => ({
            ...item,
            position,
            unitPriceCents: BigInt(item.unitPriceCents),
          })),
        },
        payments: {
          create: sample.payments.map((payment) => ({
            ...payment,
            amountCents: BigInt(payment.amountCents),
          })),
        },
      },
    });
  }

  process.stdout.write(`Seeded demo account ${email}\n`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
