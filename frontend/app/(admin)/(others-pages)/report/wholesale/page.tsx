'use client';

import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { DollarSign, TrendingUp, ShoppingCart, Users } from "lucide-react";

interface ReportItem {
  id: number;
  user: string;
  customer: string;
  date: string;
  discount: number;
  total: number;
  profit: number;
}

interface Staff {
  id: number;
  username: string;
}

export default function WholesaleReportPage() {
  const [data, setData] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>("");
  const printRef = useRef<HTMLDivElement>(null);

  // Set default dates to today
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    setStartDate(today);
    setEndDate(today);
  }, []);

  // Fetch staff list
  useEffect(() => {
    axios
      .get<Staff[]>(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/users/staff/`, { withCredentials: true })
      .then(res => setStaffList(res.data))
      .catch(() => setStaffList([]));
  }, []);

  // Fetch today's data on page load
  useEffect(() => {
    if (startDate && endDate) fetchReport();
  }, [startDate, endDate]);

  const fetchReport = async () => {
    if (!startDate || !endDate) return;

    setLoading(true);
    setError(null);
    try {
      const params = [`start=${startDate}`, `end=${endDate}`];
      if (selectedStaff) params.push(`user_id=${selectedStaff}`);
      const queryString = `?${params.join("&")}`;

      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/reports/wholesale/${queryString}`,
        { withCredentials: true }
      );

      const rows = res.data?.data ?? [];
      setData(Array.isArray(rows) ? rows : []);
    } catch (err: any) {
      const errMsg = err?.response?.data?.detail || err.message || "Failed to fetch report.";
      setError(errMsg);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!printRef.current) return;
    const content = printRef.current.innerHTML;
    const printWindow = window.open("", "", "width=900,height=650");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Wholesale Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f4f4f4; }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  // Summary totals
  const totalAmount = data.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalProfit = data.reduce((sum, o) => sum + (o.profit || 0), 0);
  const totalDiscount = data.reduce((sum, o) => sum + (o.discount || 0), 0);
  const totalOrders = data.length;

  const isValidRange = startDate && endDate && endDate >= startDate;

  return (
    <div className="p-6 space-y-6 bg-white dark:bg-[#000000] min-h-screen">
      <div className="flex justify-between items-start flex-wrap gap-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Wholesale Orders Report</h1>

        {/* Filters & Buttons in Top-Right */}
        <div className="flex flex-wrap gap-3 items-end justify-end">
          <div>
            <label className="block text-sm font-medium">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="border rounded px-3 py-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="border rounded px-3 py-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Filter by Staff</label>
            <select
              value={selectedStaff}
              onChange={e => setSelectedStaff(e.target.value)}
              className="border rounded px-3 py-1"
            >
              <option value="">All Staff</option>
              {staffList.map(staff => (
                <option key={staff.id} value={staff.id}>{staff.username}</option>
              ))}
            </select>
          </div>
          <button
            onClick={fetchReport}
            disabled={!isValidRange || loading}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Apply
          </button>
          <button
            onClick={handleDownload}
            disabled={loading || data.length === 0}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            ⬇️ Download Report
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
        <SummaryCard label="Total Orders" value={totalOrders} icon={ShoppingCart} color="bg-indigo-100 dark:bg-indigo-900" />
        <SummaryCard label="Total Sales" value={totalAmount} icon={DollarSign} color="bg-green-100 dark:bg-green-900" />
        <SummaryCard label="Total Profit" value={totalProfit} icon={TrendingUp} color="bg-yellow-100 dark:bg-yellow-900" />
        <SummaryCard label="Total Discount" value={totalDiscount} icon={Users} color="bg-pink-100 dark:bg-pink-900" />
      </div>

      {/* Data Table */}
      <div ref={printRef} className="mt-6 overflow-x-auto bg-white dark:bg-[#111] rounded-xl p-4 border dark:border-[#222]">
        {loading ? (
          <p>Loading...</p>
        ) : error ? (
          <p className="text-red-500">{error}</p>
        ) : data.length === 0 ? (
          <p>No data available</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
              <tr>
                <th className="px-4 py-2">Order ID</th>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Staff</th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Discount</th>
                <th className="px-4 py-2">Total</th>
                <th className="px-4 py-2">Profit</th>
              </tr>
            </thead>
            <tbody>
              {data.map(o => (
                <tr key={o.id} className="border-b dark:border-gray-700">
                  <td className="px-4 py-2">{o.id}</td>
                  <td className="px-4 py-2">{o.customer}</td>
                  <td className="px-4 py-2">{o.user}</td>
                  <td className="px-4 py-2">{o.date}</td>
                  <td className="px-4 py-2">{o.discount.toFixed(2)}</td>
                  <td className="px-4 py-2">{o.total.toFixed(2)}</td>
                  <td className="px-4 py-2">{o.profit.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <div className={`rounded-2xl p-4 flex items-center gap-4 ${color}`}>
      <Icon className="w-8 h-8 text-gray-700 dark:text-gray-300" />
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-xl font-bold">{Number(value).toLocaleString()}</p>
      </div>
    </div>
  );
}
