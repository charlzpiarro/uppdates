'use client';

import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { DollarLineIcon } from '@/icons';

interface Product {
  name: string;
  buying_total: number;
  selling_total: number;
  profit: number;
}

interface ProfitReportData {
  stockBuying: number;
  stockSelling: number;
  profit: number;
  products: Product[];
}

interface Staff {
  id: number;
  username: string;
}

interface SummaryCardType {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
}

export default function ProfitReportPage() {
  const [data, setData] = useState<ProfitReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selectedStaff, setSelectedStaff] = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  // Set default dates to today
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(today);
  }, []);

  // Fetch staff list
  useEffect(() => {
    axios
      .get<Staff[]>(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/users/staff/`, { withCredentials: true })
      .then(res => setStaffList(res.data))
      .catch(() => setStaffList([]));
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = [`start=${startDate}`, `end=${endDate}`];
      if (selectedStaff) params.push(`user_id=${selectedStaff}`);
      const queryString = `?${params.join('&')}`;

      const res = await axios.get<ProfitReportData>(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/reports/profit/${queryString}`,
        { withCredentials: true }
      );
      setData(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch report.');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  // Fetch today's data on page load
  useEffect(() => {
    if (startDate && endDate) fetchReport();
  }, [startDate, endDate]);

  const handleDownload = () => {
    if (!printRef.current) return;
    const content = printRef.current.innerHTML;
    const printWindow = window.open('', '', 'width=900,height=650');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Profit Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f4f4f4; }
            .card { border: 1px solid #ddd; border-radius: 12px; padding: 20px; margin-bottom: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 180px; }
            .card h4 { margin-top: 10px; font-size: 2rem; }
          </style>
        </head>
        <body>
          ${content}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  const totals = {
    buying: data?.products?.reduce((acc, p) => acc + p.buying_total, 0) || 0,
    selling: data?.products?.reduce((acc, p) => acc + p.selling_total, 0) || 0,
    profit: data?.products?.reduce((acc, p) => acc + p.profit, 0) || 0,
  };

  const summaryCards: SummaryCardType[] = [
    { label: 'Stock Cost (Buying)', value: data?.stockBuying || 0, icon: DollarLineIcon, color: 'bg-indigo-100 dark:bg-indigo-900' },
    { label: 'Total Profit', value: data?.profit || 0, icon: DollarLineIcon, color: 'bg-green-100 dark:bg-green-900' },
  ];

  return (
    <div className="p-6 space-y-6 bg-white dark:bg-[#000000] min-h-screen">
      {/* Header & Filters */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Profit & Financial Report</h1>
        <div className="flex gap-2 flex-wrap items-center">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded px-3 py-1 border text-sm dark:bg-[#111] dark:text-white" />
          <span className="text-gray-600 dark:text-gray-300">to</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded px-3 py-1 border text-sm dark:bg-[#111] dark:text-white" />
          <select value={selectedStaff} onChange={(e) => setSelectedStaff(e.target.value)} className="rounded border px-3 py-1 text-gray-900 dark:bg-[#111] dark:text-white">
            <option value="">All Staff</option>
            {staffList.map(staff => <option key={staff.id} value={staff.id}>{staff.username}</option>)}
          </select>
          <button onClick={fetchReport} className="px-4 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition">Apply</button>
          <button onClick={handleDownload} disabled={loading || !data} className="px-4 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition">⬇️ Download Report</button>
        </div>
      </div>

      {/* Loading / Error */}
      {loading && <p className="text-center text-gray-500">Loading report...</p>}
      {error && <p className="text-center text-red-500">{error}</p>}

      {/* Report Content */}
      {!loading && data && (
        <div ref={printRef} className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-6 w-full max-w-full">
            {summaryCards.map(card => <SummaryCard key={card.label} card={card} />)}
          </div>

          {/* Products Table */}
          <div className="bg-white dark:bg-[#111] rounded-xl p-4 border dark:border-[#222]">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Product Report</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left">
                <thead className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                  <tr>
                    <th className="px-4 py-2">Product</th>
                    <th className="px-4 py-2">Buying (TZS)</th>
                    <th className="px-4 py-2">Selling (TZS)</th>
                    <th className="px-4 py-2">Profit (TZS)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.products.map((prod: Product) => (
                    <tr key={prod.name} className="border-b dark:border-gray-700">
                      <td className="px-4 py-2 text-gray-900 dark:text-white">{prod.name}</td>
                      <td className="px-4 py-2 text-red-600 dark:text-red-400">{Number(prod.buying_total).toLocaleString()}</td>
                      <td className="px-4 py-2 text-blue-600 dark:text-blue-400">{Number(prod.selling_total).toLocaleString()}</td>
                      <td className="px-4 py-2 text-green-600 dark:text-green-400">{Number(prod.profit).toLocaleString()}</td>
                    </tr>
                  ))}
                  {data.products.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-4 text-gray-500 dark:text-gray-400">No product data available.</td></tr>
                  )}
                </tbody>
                <tfoot className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-bold">
                  <tr>
                    <td className="px-4 py-2 text-left">Total</td>
                    <td className="px-4 py-2">{totals.buying.toLocaleString()}</td>
                    <td className="px-4 py-2">{totals.selling.toLocaleString()}</td>
                    <td className="px-4 py-2">{totals.profit.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ card }: { card: SummaryCardType }) {
  return (
    <div className={`w-full rounded-2xl p-8 border border-gray-200 dark:border-[#111] flex flex-col items-center justify-center ${card.color}`} style={{ minHeight: '180px' }}>
      <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-gray-100 dark:bg-black mb-4">
        <card.icon className="text-gray-800 dark:text-white" size={32} />
      </div>
      <span className="text-lg font-semibold text-gray-500 dark:text-gray-400">{card.label}</span>
      <h4 className="mt-2 font-extrabold text-3xl text-gray-800 dark:text-white">TZS {Number(card.value).toLocaleString()}</h4>
    </div>
  );
}
