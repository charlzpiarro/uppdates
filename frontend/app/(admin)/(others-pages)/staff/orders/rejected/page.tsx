"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";

interface Order {
  id: number;
  user?: { username: string } | null;
  customer?: { name: string } | null;
  created_at: string;
  status: string;
}

const statusColors = {
  pending: "bg-yellow-500 text-white",
  confirmed: "bg-blue-600 text-white",
  cancelled: "bg-rose-500 text-white",
  completed: "bg-emerald-500 text-white",
  refunded: "bg-gray-400 text-white",
  rejected: "bg-red-600 text-white",
};

const ORDERS_PER_PAGE = 15;

export default function StaffRejectedOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const ordersRef = useRef<Order[]>([]); // <--- keep ref updated!
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const page = useRef(1);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const observer = useRef<IntersectionObserver | null>(null);

  // keep the ref synced with state
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  const fetchMoreOrders = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);

    try {
      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/orders/?status=rejected&page=${page.current}&page_size=${ORDERS_PER_PAGE}`,
        { withCredentials: true }
      );

      const newOrders: Order[] = res.data.results || res.data;

      // filter out duplicates by checking current ref (always latest)
      const existingIds = new Set(ordersRef.current.map((o) => o.id));
      const filteredNew = newOrders.filter((o) => !existingIds.has(o.id));

      if (filteredNew.length > 0) {
        setOrders((prev) => [...prev, ...filteredNew]);
        page.current += 1;
      }

      if (!res.data.next || filteredNew.length < ORDERS_PER_PAGE) {
        setHasMore(false);
      }
    } catch {
      setError("Failed to load rejected orders.");
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore]);

  useEffect(() => {
    fetchMoreOrders();
  }, [fetchMoreOrders]);

  useEffect(() => {
    if (!loaderRef.current) return;

    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchMoreOrders();
        }
      },
      { rootMargin: "100px" }
    );

    observer.current.observe(loaderRef.current);

    return () => observer.current?.disconnect();
  }, [fetchMoreOrders]);

  function handleRowClick(orderId: number) {
    router.push(`/staff/orders/rejected/${orderId}`);
  }

  async function handleResend(orderId: number) {
    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/orders/${orderId}/resend/`,
        {},
        { withCredentials: true }
      );
      setOrders([]);
      page.current = 1;
      setHasMore(true);
      fetchMoreOrders();
    } catch {
      alert("Failed to resend order.");
    }
  }

  async function handleDelete(orderId: number) {
    if (!confirm("Delete this rejected order?")) return;
    try {
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/api/orders/${orderId}/delete_rejected/`,
        { withCredentials: true }
      );
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch {
      alert("Failed to delete order.");
    }
  }

  function handleEdit(orderId: number) {
    router.push(`/staff/orders/rejected/${orderId}`);
  }

  return (
    <div>
      <PageBreadcrumb pageTitle="Staff - Rejected Orders" />
      <div className="space-y-6 text-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800 dark:text-white">Rejected Orders</h1>
          <button
            onClick={() => {
              setOrders([]);
              page.current = 1;
              setHasMore(true);
              fetchMoreOrders();
            }}
            disabled={loading}
            className="rounded bg-green-600 px-3 py-1 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {error && <p className="text-red-600 font-semibold">{error}</p>}

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="max-w-full overflow-x-auto">
            <div className="min-w-[1000px]">
              <table className="w-full text-left">
                <thead className="bg-gray-50 dark:bg-white/10">
                  <tr>
                    {["ID", "Customer", "Staff", "Date", "Status", "Actions"].map((head) => (
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
                      <td colSpan={6} className="px-5 py-4 text-center text-gray-500 dark:text-gray-400">
                        No rejected orders found.
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => (
                      <tr
                        key={order.id}
                        className="hover:bg-gray-50 dark:hover:bg-white/10 cursor-pointer"
                        onClick={() => handleRowClick(order.id)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleRowClick(order.id);
                          }
                        }}
                      >
                        <td className="px-5 py-4 text-gray-700 dark:text-white">{order.id}</td>
                        <td className="px-5 py-4 text-gray-700 dark:text-white">
                          {order.customer?.name || "N/A"}
                        </td>
                        <td className="px-5 py-4 text-gray-700 dark:text-white">
                          {order.user?.username || "Unknown"}
                        </td>
                        <td className="px-5 py-4 text-gray-700 dark:text-white">
                          {new Date(order.created_at).toLocaleString()}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                              statusColors[order.status.toLowerCase() as keyof typeof statusColors] ||
                              "bg-gray-200 text-gray-800"
                            }`}
                          >
                            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-5 py-4 space-x-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleEdit(order.id)}
                            className="rounded bg-blue-600 px-2 py-1 text-white hover:bg-blue-700"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleResend(order.id)}
                            className="rounded bg-yellow-500 px-2 py-1 text-white hover:bg-yellow-600"
                          >
                            Resend
                          </button>
                          <button
                            onClick={() => handleDelete(order.id)}
                            className="rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700"
                          >
                            Delete
                          </button>
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
            <p className="text-gray-500 dark:text-gray-400">No more rejected orders.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
