import type { Order } from "../types/order";

export type AdminDashboardData = {
  summary: {
    totalOrders: number;
    paidRevenue: number;
    paidOrders: number;
    pendingPaymentOrders: number;
    processingOrders: number;
    shippingOrders: number;
    completedOrders: number;
    cancelledOrders: number;
  };
  dailyRevenue: Array<{
    date: string;
    revenue: number;
    paidOrders: number;
  }>;
};

const VIETNAM_TIMEZONE = "Asia/Ho_Chi_Minh";

function getVietnamDateKey(value: string | Date): string | null {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: VIETNAM_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const partMap = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  const year = partMap.year;
  const month = partMap.month;
  const day = partMap.day;

  if (!year || !month || !day) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

function createDateKeys(days: number): string[] {
  const todayKey = getVietnamDateKey(new Date());

  if (!todayKey) {
    return [];
  }

  const today = new Date(`${todayKey}T12:00:00.000Z`);
  const dates: string[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const currentDate = new Date(today);

    currentDate.setUTCDate(today.getUTCDate() - offset);

    dates.push(currentDate.toISOString().slice(0, 10));
  }

  return dates;
}

export function buildAdminDashboard(
  orders: Order[],
  days: number
): AdminDashboardData {
  const dateKeys = createDateKeys(days);

  const dailyRevenueMap = new Map(
    dateKeys.map((date) => [
      date,
      {
        date,
        revenue: 0,
        paidOrders: 0,
      },
    ])
  );

  const summary = {
    totalOrders: orders.length,
    paidRevenue: 0,
    paidOrders: 0,
    pendingPaymentOrders: 0,
    processingOrders: 0,
    shippingOrders: 0,
    completedOrders: 0,
    cancelledOrders: 0,
  };

  for (const order of orders) {
    const isCancelled = order.orderStatus === "CANCELLED";
    const isPaid = order.paymentStatus === "PAID";

    if (order.orderStatus === "PROCESSING") {
      summary.processingOrders += 1;
    }

    if (order.orderStatus === "SHIPPING") {
      summary.shippingOrders += 1;
    }

    if (order.orderStatus === "COMPLETED") {
      summary.completedOrders += 1;
    }

    if (isCancelled) {
      summary.cancelledOrders += 1;
    }

    if (order.paymentStatus === "PENDING" && !isCancelled) {
      summary.pendingPaymentOrders += 1;
    }

    if (!isPaid || isCancelled) {
      continue;
    }

    summary.paidOrders += 1;
    summary.paidRevenue += order.total;

    const revenueDate = getVietnamDateKey(
      order.paidAt ?? order.updatedAt ?? order.createdAt
    );

    if (!revenueDate) {
      continue;
    }

    const dailyRevenue = dailyRevenueMap.get(revenueDate);

    if (!dailyRevenue) {
      continue;
    }

    dailyRevenue.revenue += order.total;
    dailyRevenue.paidOrders += 1;
  }

  return {
    summary,
    dailyRevenue: dateKeys.map((date) => {
      return (
        dailyRevenueMap.get(date) ?? {
          date,
          revenue: 0,
          paidOrders: 0,
        }
      );
    }),
  };
}