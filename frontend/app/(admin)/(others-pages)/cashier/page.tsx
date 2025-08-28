'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';

interface Order {
  id: number;
  user?: { username: string } | null;
  customer?: { name: string } | null;
  created_at: string;
  status: string;
}

const statusColors = {
  pending: 'bg-yellow-500 text-white',
  confirmed: 'bg-blue-600 text-white',
  cancelled: 'bg-rose-500 text-white',
  completed: 'bg-emerald-500 text-white',
  refunded: 'bg-gray-400 text-white',
  updated: 'bg-purple-500 text-white', // added just in case
};

const ORDERS_PER_PAGE = 15;

export default function CashierOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState<string>(new Date().toISOString().split('T')[0]); // <-- default today
  const observer = useRef<IntersectionObserver | null>(null);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const page = useRef(1);
  const initiated = useRef(false);

  const fetchMoreOrders = useCallback(async () => {
    if (loading || !hasMore) return;

    setLoading(true);
    setError(null);

    try {
      const dateQuery = filterDate ? `&date=${filterDate}` : '';
      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/orders/?page=${page.current}&page_size=${ORDERS_PER_PAGE}${dateQuery}`,
        { withCredentials: true }
      );

      const newOrders = res.data.results || res.data;
      const existingIds = new Set(orders.map((o) => o.id));
      const filteredNew = newOrders.filter((o: Order) => !existingIds.has(o.id));

      if (filteredNew.length > 0) {
        setOrders((prev) => [...prev, ...filteredNew]);
        page.current += 1;
      }

      if (!res.data.next || filteredNew.length < ORDERS_PER_PAGE) {
        setHasMore(false);
      }
    } catch {
      setError('Failed to load more orders.');
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, orders, filterDate]);

  function handleRowClick(orderId: number) {
    router.push(`/cashier/${orderId}`);
  }

  const handleReject = async (orderId: number) => {
    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/orders/${orderId}/reject/`,
        {},
        { withCredentials: true }
      );
      // refresh after rejecting
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, status: 'rejected' } : o
        )
      );
    } catch {
      alert('Failed to reject order.');
    }
  };

  useEffect(() => {
    if (!loaderRef.current) return;

    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !initiated.current) {
          initiated.current = true;
          fetchMoreOrders();
        } else if (entries[0].isIntersecting && initiated.current) {
          fetchMoreOrders();
        }
      },
      { rootMargin: '100px' }
    );

    observer.current.observe(loaderRef.current);

    return () => observer.current?.disconnect();
  }, [fetchMoreOrders]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterDate(e.target.value);
    page.current = 1;
    setOrders([]);
    setHasMore(true);
    initiated.current = false;
  };

  return (
    <div>
      <PageBreadcrumb pageTitle="Cashier - Orders" />

      <div className="space-y-6 text-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-800 dark:text-white">Orders</h1>

          <div className="flex gap-2">
            <input
              type="date"
              value={filterDate}
              onChange={handleDateChange}
              className="rounded-md border border-gray-300 px-3 py-2 text-gray-900 dark:border-white/10 dark:bg-white/5 dark:text-white"
              aria-label="Filter by date"
            />
            <button
              onClick={() => {
                page.current = 1;
                setOrders([]);
                setHasMore(true);
                initiated.current = false;
              }}
              disabled={loading}
              className="rounded bg-green-600 px-3 py-1 text-white hover:bg-blue-700 disabled:opacity-50"
              aria-label="Refresh orders"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && <p className="text-red-600 font-semibold">{error}</p>}

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="max-w-full overflow-x-auto">
            <div className="min-w-[1000px]">
              <table className="w-full text-left">
                <thead className="bg-gray-50 dark:bg-white/10">
                  <tr>
                    {['ID', 'Customer', 'Staff', 'Date', 'Status', 'Actions'].map((head) => (
                      <th
                        key={head}
                        className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300"
                      >
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                  {orders.length === 0 && !loading ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-4 text-center text-gray-500 dark:text-gray-400"
                      >
                        No orders found.
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => (
                      <tr
                        key={order.id}
                        className="hover:bg-gray-50 dark:hover:bg-white/10"
                        tabIndex={0}
                      >
                        <td
                          className="px-5 py-4 text-gray-700 dark:text-white cursor-pointer"
                          onClick={() => handleRowClick(order.id)}
                        >
                          {order.id}
                        </td>
                        <td
                          className="px-5 py-4 text-gray-700 dark:text-white cursor-pointer"
                          onClick={() => handleRowClick(order.id)}
                        >
                          {order.customer?.name || 'N/A'}
                        </td>
                        <td
                          className="px-5 py-4 text-gray-700 dark:text-white cursor-pointer"
                          onClick={() => handleRowClick(order.id)}
                        >
                          {order.user?.username || 'Unknown'}
                        </td>
                        <td
                          className="px-5 py-4 text-gray-700 dark:text-white cursor-pointer"
                          onClick={() => handleRowClick(order.id)}
                        >
                          {new Date(order.created_at).toLocaleString()}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                              statusColors[
                                order.status.toLowerCase() as keyof typeof statusColors
                              ] || 'bg-gray-200 text-gray-800'
                            }`}
                          >
                            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          {order.status.toLowerCase() === 'updated' && (
                            <button
                              onClick={() => handleReject(order.id)}
                              className="rounded bg-red-600 px-3 py-1 text-white hover:bg-red-700"
                            >
                              Reject
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div ref={loaderRef} className="text-center py-6">
          {loading ? (
            <p className="text-gray-600 dark:text-gray-300 animate-pulse">Loading more orders...</p>
          ) : !hasMore ? (
            <p className="text-gray-500 dark:text-gray-400">No more orders.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
