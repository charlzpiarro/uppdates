'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  PackageCheck,
  PackageX,
  ArrowUpDown,
  Trash2,
  Pencil,
} from 'lucide-react';

interface StockEntry {
  id: number;
  product: {
    name: string;
    total_stock?: number;
    category_name?: string;
  };
  batch?: {
    batch_code: string;
    expiry_date?: string;
  } | null;
  entry_type: 'added' | 'updated' | 'deleted' | 'quantity_updated' | 'sold' | 'returned';
  quantity: number;
  date: string;
  recorded_by: {
    username: string;
    first_name: string;
    last_name: string;
  } | null;
}

const entryIcons: Record<string, React.ReactNode> = {
  added: <PackageCheck className="text-green-500" size={16} />,
  updated: <Pencil className="text-blue-500" size={16} />,
  deleted: <Trash2 className="text-red-500" size={16} />,
  quantity_updated: <ArrowUpDown className="text-yellow-500" size={16} />,
  sold: <PackageX className="text-purple-500" size={16} />,
  returned: <ArrowUpDown className="text-green-600" size={16} />,
};

export default function StockAuditPage() {
  const [entries, setEntries] = useState<StockEntry[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // YYYY-MM-DD
  });

  const fetchStockEntries = async (date?: string) => {
    setLoading(true);
    try {
      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/stock-entries/`,
        {
          withCredentials: true,
          params: { date: date || dateFilter },
        }
      );
      setEntries(res.data);
    } catch (err) {
      console.error('Error fetching stock audits', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStockEntries(dateFilter);
  }, [dateFilter]);

  const filteredEntries = entries.filter((entry) =>
    entry.product.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 text-sm p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-gray-800 dark:text-white">
          Stock Audit Trail
        </h1>
        <div className="flex flex-wrap gap-2">
          {/* Date Picker */}
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />

          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product name..."
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-white/40"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5">
        <div className="max-w-full overflow-x-auto">
          <div className="min-w-[900px]">
            <table className="w-full text-left">
              <thead className="bg-gray-50 dark:bg-white/10">
                <tr>
                  <th className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300">Type</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300">Product</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300">Category</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300">Batch</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300">Quantity</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300">Total Stock</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300">Recorded By</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-4 text-center text-gray-500 dark:text-gray-400">
                      Loading...
                    </td>
                  </tr>
                ) : filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-4 text-center text-gray-500 dark:text-gray-400">
                      No matching entries found.
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((entry) => {
                    const fullName = entry.recorded_by
                      ? `${entry.recorded_by.first_name} ${entry.recorded_by.last_name}`.trim() ||
                        entry.recorded_by.username
                      : 'N/A';
                    const batchCode = entry.batch?.batch_code ?? '—';
                    return (
                      <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-white/10">
                        <td className="px-5 py-4 flex items-center gap-2 capitalize text-gray-700 dark:text-white">
                          {entryIcons[entry.entry_type]}
                          <span className="inline-block rounded-full px-2 py-0.5 text-xs bg-gray-200 dark:bg-white/10">
                            {entry.entry_type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-gray-700 dark:text-white">{entry.product.name}</td>
                        <td className="px-5 py-4 text-gray-700 dark:text-white">{entry.product.category_name || '—'}</td>
                        <td className="px-5 py-4 text-gray-700 dark:text-white">{batchCode}</td>
                        <td className="px-5 py-4 text-gray-700 dark:text-white">{entry.quantity}</td>
                        <td className="px-5 py-4 text-gray-700 dark:text-white">{entry.product.total_stock ?? '—'}</td>
                        <td className="px-5 py-4 text-gray-700 dark:text-white">{fullName}</td>
                        <td className="px-5 py-4 text-gray-700 dark:text-white">
                          <span title={entry.date}>
                            {new Date(entry.date).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
