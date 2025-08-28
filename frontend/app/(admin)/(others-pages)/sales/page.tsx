'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';

interface Customer {
  name: string;
}

interface User {
  username: string;
}

interface Batch {
  id: number;
  batch_code: string;
}

interface Product {
  id: number;
  name: string;
  category_name: string;
  batches?: Batch[];
}

interface SaleItem {
  id: number;
  product: Product;
  quantity: number;
  price_per_unit: string;
  total_price: string;
}

interface SaleRecord {
  id: number;
  date: string;
  status: string;
  payment_status: string;
  sale_type: 'retail' | 'wholesale';
  is_loan: boolean;
  refund_total?: string;
  final_amount?: string;
  total_amount?: string;
  paid_amount?: string;  // <-- added here
  payment_method?: string;
  customer?: Customer | null;
  user?: User | null;
  items?: SaleItem[];
}

const statusColors = {
  completed: 'bg-emerald-500 text-white',pending: 'bg-yellow-500 text-white',cancelled: 'bg-rose-500 text-white',refunded: 'bg-gray-400 text-white',confirmed: 'bg-blue-600 text-white',
};

const paymentStatusColors = {paid: 'bg-green-600 text-white',partial: 'bg-yellow-500 text-white',pending: 'bg-gray-400 text-white',refunded: 'bg-red-500 text-white',not_paid: 'bg-amber-800 text-white',
};

export default function SalesPage() {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refundLoadingIds, setRefundLoadingIds] = useState<number[]>([]);
  const [expandedSales, setExpandedSales] = useState<number[]>([]);

  const [statusFilter, setStatusFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [loanFilter, setLoanFilter] = useState('');

  // 🆕 date filter state
  const [dateFilter, setDateFilter] = useState<string>(() => {
    // default: today in YYYY-MM-DD
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  useEffect(() => {
    fetchSales();
  }, [dateFilter]); // re-fetch whenever date changes

  async function fetchSales() {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/sales/`,
        {
          withCredentials: true,
          params: { date: dateFilter }, // 🆕 send date param
        }
      );
      const sortedSales = res.data.sort(
        (a: SaleRecord, b: SaleRecord) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setSales(sortedSales);
    } catch {
      setError('Failed to load sales. Try refreshing.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRefund(saleId: number) {
    if (!confirm('Are you sure you want to refund this entire sale? This cannot be undone.')) return;
    try {
      setRefundLoadingIds((ids) => [...ids, saleId]);
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/sales/${saleId}/refund/`,
        {},
        { withCredentials: true }
      );
      alert('Sale refunded successfully!');
      fetchSales();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to refund sale.');
    } finally {
      setRefundLoadingIds((ids) => ids.filter((id) => id !== saleId));
    }
  }

  const filteredSales = sales.filter((sale) => {
    const matchesSearch =
      sale.customer?.name?.toLowerCase().includes(search.toLowerCase()) ||
      sale.status.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter ? sale.status === statusFilter : true;
    const matchesPayment = paymentStatusFilter ? sale.payment_status === paymentStatusFilter : true;
    const matchesType = typeFilter ? sale.sale_type === typeFilter : true;
    const matchesMethod = methodFilter ? sale.payment_method === methodFilter : true;
    const matchesLoan = loanFilter ? String(sale.is_loan) === loanFilter : true;
    return matchesSearch && matchesStatus && matchesPayment && matchesType && matchesMethod && matchesLoan;
  });

  const canRefund = (sale: SaleRecord) => sale.status !== 'refunded' && sale.status !== 'cancelled';

  const selectStyles =
    'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:border-white/10 dark:bg-white/5 dark:text-white';

  const safeTZS = (val?: string | number) =>
    `TZS ${Number(val || 0).toLocaleString('en-TZ', { minimumFractionDigits: 0 })}`;

  const toggleExpand = (id: number) => {
    setExpandedSales((prev) =>
      prev.includes(id) ? prev.filter((saleId) => saleId !== id) : [...prev, id]
    );
  };

  return (
    <div>
      <PageBreadcrumb pageTitle="Sales Records" />
      <div className="space-y-6 text-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h1 className="text-xl font-bold text-gray-800 dark:text-white">Sales List</h1>
          <div className="flex flex-wrap gap-2">
            {/* 🔍 Search */}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer or status..."
              className="w-full max-w-xs rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-white/40"
            />

            {/* 🆕 Date Filter */}
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
            />

            {/* Existing filters */}
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectStyles}>
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="refunded">Refunded</option>
            </select>
            <select
              value={paymentStatusFilter}
              onChange={(e) => setPaymentStatusFilter(e.target.value)}
              className={selectStyles}
            >
              <option value="">All Payments</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="pending">Pending</option>
              <option value="refunded">Refunded</option>
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={selectStyles}>
              <option value="">All Types</option>
              <option value="retail">Retail</option>
              <option value="wholesale">Wholesale</option>
            </select>
            <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} className={selectStyles}>
              <option value="">All Methods</option>
              <option value="cash">Cash</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="bank">Bank Transfer</option>
              <option value="card">Card</option>
            </select>
            <select value={loanFilter} onChange={(e) => setLoanFilter(e.target.value)} className={selectStyles}>
              <option value="">All</option>
              <option value="true">Loans Only</option>
              <option value="false">Non-Loans</option>
            </select>
          </div>
        </div>

        {loading && <p className="text-gray-600 dark:text-gray-300">Loading sales...</p>}
        {error && <p className="text-red-600 font-semibold">{error}</p>}

        {!loading && !error && (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5">
            <div className="max-w-full overflow-x-auto">
              <div className="min-w-[1200px]">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 dark:bg-white/10">
                    <tr>
                      {[
                        'ID',
                        'Customer',
                        'Amount',
                        'Paid',          // <-- New column added here
                        'Final',
                        'Refunded',
                        'Status',
                        'Payment Status',
                        'Type',
                        'Method',
                        'Loan',
                        'Date',
                        'Actions',
                      ].map((head) => (
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
                    {filteredSales.length > 0 ? (
                      filteredSales.map((sale) => (
                        <React.Fragment key={sale.id}>
                          <tr
                            className="hover:bg-gray-50 dark:hover:bg-white/10 cursor-pointer"
                            onClick={() => toggleExpand(sale.id)}
                          >
                            <td className="px-5 py-4 dark:text-gray-300">{sale.id}</td>
                            <td className="px-5 py-4 dark:text-gray-300">{sale.customer?.name || 'N/A'}</td>
                            <td className="px-5 py-4 dark:text-gray-300">{safeTZS(sale.total_amount)}</td>
                            <td className="px-5 py-4 dark:text-gray-300 font-semibold">{safeTZS(sale.paid_amount)}</td>
                            <td className="px-5 py-4 font-semibold text-green-600 dark:text-green-400">
                              {safeTZS(sale.final_amount)}
                            </td>
                            <td className="px-5 py-4 text-red-600 dark:text-red-400">
                              {safeTZS(sale.refund_total)}
                            </td>
                            <td className="px-5 py-4">
                              <span
                                className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                                  statusColors[sale.status.toLowerCase() as keyof typeof statusColors] ||
                                  'bg-gray-300 text-black'
                                }`}
                              >
                                {sale.status}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <span
                                className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                                  paymentStatusColors[
                                    sale.payment_status.toLowerCase() as keyof typeof paymentStatusColors
                                  ] || 'bg-gray-300 text-black'
                                }`}
                              >
                                {sale.payment_status}
                              </span>
                            </td>
                            <td className="px-5 py-4 capitalize dark:text-gray-300">{sale.sale_type}</td>
                            <td className="px-5 py-4 uppercase dark:text-gray-300">{sale.payment_method || 'N/A'}</td>
                            <td className="px-5 py-4 dark:text-gray-300">{sale.is_loan ? 'Loan' : '-'}</td>
                            <td className="px-5 py-4 dark:text-gray-300">{new Date(sale.date).toLocaleString()}</td>
                            <td className="px-5 py-4">
                              {canRefund(sale) ? (
                                <button
                                  disabled={refundLoadingIds.includes(sale.id)}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRefund(sale.id);
                                  }}
                                  className={`rounded px-3 py-1 text-xs font-semibold ${
                                    refundLoadingIds.includes(sale.id)
                                      ? 'bg-gray-400 cursor-not-allowed'
                                      : 'bg-red-600 hover:bg-red-700 text-white'
                                  }`}
                                >
                                  {refundLoadingIds.includes(sale.id) ? 'Refunding...' : 'Refund'}
                                </button>
                              ) : (
                                <span className="text-gray-400 text-xs italic">No refund</span>
                              )}
                            </td>
                          </tr>

                          {/* Expanded details */}
                          {expandedSales.includes(sale.id) && (
                            <tr className="bg-gray-100 dark:bg-white/10">
                              <td colSpan={13} className="px-5 py-3">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr>
                                      <th className="text-left text-gray-700 dark:text-gray-300">Product</th>
                                      <th className="text-left text-gray-700 dark:text-gray-300">Category</th>
                                      <th className="text-left text-gray-700 dark:text-gray-300">Batch Codes</th>
                                      <th className="text-right text-gray-700 dark:text-gray-300">Quantity</th>
                                      <th className="text-right text-gray-700 dark:text-gray-300">Price/Unit</th>
                                      <th className="text-right text-gray-700 dark:text-gray-300">Total Price</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {sale.items?.map((item) => (
                                      <tr
                                        key={item.id}
                                        className="border-t border-gray-300 dark:border-white/20"
                                      >
                                        <td className="dark:text-gray-300">{item.product.name}</td>
                                        <td className="dark:text-gray-300">{item.product.category_name || 'N/A'}</td>
                                        <td className="dark:text-gray-300">
                                          {item.product.batches?.map((batch) => batch.batch_code).join(', ') || 'N/A'}
                                        </td>
                                        <td className="text-right dark:text-gray-300">{item.quantity}</td>
                                        <td className="text-right dark:text-gray-300">{safeTZS(item.price_per_unit)}</td>
                                        <td className="text-right dark:text-gray-300">{safeTZS(item.total_price)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={13} className="px-5 py-4 text-center text-gray-500 dark:text-gray-400">
                          No matching sales found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
