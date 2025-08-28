'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';
import { getCookie } from 'cookies-next';

interface LoanSale {
  id: number;
  customer_name: string;
  user_name: string;
  total_amount: string;
  paid_amount: string;
  final_amount: string;
  payment_status: string;
  date: string;
}

interface SaleItem {
  id: number;
  product_name: string;
  quantity: number;
  price_per_unit: string;
  total_price: string;
}

export default function LoansPage() {
  const [loans, setLoans] = useState<LoanSale[]>([]);
  const [selectedLoan, setSelectedLoan] = useState<LoanSale | null>(null);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paying, setPaying] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Set default dates to today
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(today);
  }, []);

  // Fetch loans (with filtering)
  useEffect(() => {
    if (startDate && endDate) fetchLoans();
  }, [startDate, endDate]);

  const fetchLoans = async () => {
    setLoading(true);
    try {
      const params = [`start=${startDate}`, `end=${endDate}`];
      if (search) params.push(`search=${encodeURIComponent(search)}`);
      const queryString = `?${params.join('&')}`;

      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/loans/${queryString}`, {
        withCredentials: true,
      });
      setLoans(res.data);
    } catch (err) {
      console.error('Error fetching loans:', err);
    } finally {
      setLoading(false);
    }
  };

  const openLoanDetails = async (loan: LoanSale) => {
    setSelectedLoan(loan);
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/sales/${loan.id}/items/`, {
        withCredentials: true,
      });
      setSaleItems(res.data);
    } catch (err) {
      console.error('Failed to fetch sale items:', err);
    }
  };

  const printReceipt = (receiptData: any) => {
    const itemsHtml = receiptData.items
      .map(
        (item: any) => `
          <tr>
            <td>${item.product_name}</td>
            <td style="text-align:right;">${item.quantity}</td>
            <td style="text-align:right;">${Number(item.price_per_unit).toLocaleString()}</td>
            <td style="text-align:right;">${Number(item.total_price).toLocaleString()}</td>
          </tr>`
      )
      .join('');

    const totalQty = receiptData.items.reduce((acc: number, item: any) => acc + item.quantity, 0);
    const rawTotal = receiptData.items.reduce((acc: number, item: any) => acc + Number(item.total_price), 0);
    const discountPercent = 0;
    const discountAmount = 0;
    const finalTotal = Number(receiptData.final_amount);
    const amountPaid = Number(receiptData.paid_now);

    const receiptHTML = `
      <html>
        <head>
          <title>Receipt #${receiptData.id}</title>
          <style>
            body {
              font-family: 'Courier New', Courier, monospace;
              width: 280px;
              margin: 0 auto;
              padding: 10px;
              font-size: 12px;
              color: #000;
            }
            h1, h2, h3 { margin: 0; text-align: center; }
            .company-info { text-align: center; margin-bottom: 10px; }
            .company-info small { display: block; font-size: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { padding: 4px; border-bottom: 1px dashed #000; }
            th { border-bottom: 2px solid #000; text-align: left; }
            td:nth-child(2), td:nth-child(3), td:nth-child(4) { text-align: right; }
            .totals { margin-top: 10px; font-size: 12px; }
            .totals div { display: flex; justify-content: space-between; padding: 2px 0; }
            .underline { border-top: 1px solid #000; margin-top: 5px; padding-top: 5px; font-weight: bold; }
            .footer { text-align: center; margin-top: 20px; font-size: 11px; }
          </style>
        </head>
        <body>
          <div class="company-info">
            <h2>WEBI PHARMACY</h2>
            <small>P.O. Box 1234, Dar es Salaam</small>
            <small>Phone: +255 712 345 678</small>
            <small>Email: info@webipharmacy.co.tz</small>
          </div>

          <h3>Receipt #${receiptData.id}</h3>

          <p>
            Date: ${receiptData.date}<br/>
            Staff: ${receiptData.user_name || 'Unknown'}<br/>
            Customer: ${receiptData.customer_name || 'N/A'}<br/>
            Order Type: LOAN PAYMENT<br/>
            Payment Method: LOAN PAYMENT
          </p>

          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>

          <div class="totals">
            <div><span>Total Qty:</span> <span>${totalQty}</span></div>
            <div><span>Subtotal:</span> <span>${rawTotal.toLocaleString()} TZS</span></div>
            <div><span>Discount (${discountPercent}%):</span> <span>- ${discountAmount.toLocaleString()} TZS</span></div>
            <div class="underline"><span>Total to Pay:</span> <span>${finalTotal.toLocaleString()} TZS</span></div>
            <div><span>Amount Paid:</span> <span>${amountPaid.toLocaleString()} TZS</span></div>
            <div><span>Change:</span> <span>${(amountPaid - finalTotal).toLocaleString()} TZS</span></div>
          </div>

          <div class="footer">
            <p>Thank you for your payment!<br/>Please come again.</p>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', 'PRINT', 'width=400,height=600');
    if (!printWindow) {
      alert('Pop-up blocked. Please allow pop-ups for this site to print receipts.');
      return;
    }
    printWindow.document.write(receiptHTML);
    printWindow.document.close();
    printWindow.focus();
  };

  const handlePayment = async () => {
    if (!selectedLoan || !paymentAmount) return;

    try {
      setPaying(true);
      let csrfToken = await getCookie('csrftoken');
      csrfToken = csrfToken || '';

      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/loans/${selectedLoan.id}/pay/`,
        { amount: parseFloat(paymentAmount) },
        {
          withCredentials: true,
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken,
          },
        }
      );

      const updatedLoan = {
        ...selectedLoan,
        paid_amount: (parseFloat(selectedLoan.paid_amount) + parseFloat(paymentAmount)).toFixed(2),
      };

      const receiptData = {
        ...updatedLoan,
        items: saleItems,
        paid_now: paymentAmount,
        date: new Date().toLocaleString(),
      };

      printReceipt(receiptData);

      setSelectedLoan(null);
      setPaymentAmount('');
      fetchLoans();
    } catch (err) {
      console.error('Payment failed:', err);
      alert('Payment failed. Check logs.');
    } finally {
      setPaying(false);
    }
  };

  const filteredLoans = loans.filter((loan) =>
    loan.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    loan.user_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 p-6 text-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-gray-800 dark:text-white">Loaned Sales</h1>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border rounded px-3 py-2"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border rounded px-3 py-2"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer or cashier..."
            className="border rounded px-3 py-2"
          />
          <Button onClick={fetchLoans} disabled={loading}>Apply</Button>
        </div>
      </div>

      {/* Loan Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5">
        <div className="max-w-full overflow-x-auto">
          <div className="min-w-[950px]">
            <table className="w-full text-left">
              <thead className="bg-gray-50 dark:bg-white/10">
                <tr>
                  <th className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300">Sale ID</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300">Customer</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300">Cashier</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300">Total</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300">Paid</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300">Remaining</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300">Status</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                {loading ? (
                  <tr><td colSpan={8} className="px-5 py-4 text-center text-gray-500 dark:text-gray-400">Loading...</td></tr>
                ) : filteredLoans.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-4 text-center text-gray-500 dark:text-gray-400">No loan sales found.</td></tr>
                ) : (
                  filteredLoans.map((loan) => (
                    <tr
                      key={loan.id}
                      className="hover:bg-gray-50 dark:hover:bg-white/10 cursor-pointer"
                      onClick={() => openLoanDetails(loan)}
                    >
                      <td className="px-5 py-4 text-gray-700 dark:text-white">#{loan.id}</td>
                      <td className="px-5 py-4 text-gray-700 dark:text-white">{loan.customer_name || 'N/A'}</td>
                      <td className="px-5 py-4 text-gray-700 dark:text-white">{loan.user_name}</td>
                      <td className="px-5 py-4 text-gray-700 dark:text-white">TZS {loan.final_amount}</td>
                      <td className="px-5 py-4 text-gray-700 dark:text-white">TZS {loan.paid_amount}</td>
                      <td className="px-5 py-4 text-gray-700 dark:text-white">{(parseFloat(loan.final_amount) - parseFloat(loan.paid_amount)).toFixed(2)}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${
                          loan.payment_status === 'partial'
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800/20 dark:text-yellow-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-800/20 dark:text-red-400'
                        }`}>{loan.payment_status}</span>
                      </td>
                      <td className="px-5 py-4 text-gray-700 dark:text-white">
                        {new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(loan.date))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Loan Modal */}
      <Modal isOpen={!!selectedLoan} onClose={() => setSelectedLoan(null)} className="max-w-2xl p-6">
        {selectedLoan && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Loan Sale #{selectedLoan.id}</h2>
            <p className="text-gray-700 dark:text-white">Customer: {selectedLoan.customer_name || 'N/A'}</p>
            <p className="text-gray-700 dark:text-white">Cashier: {selectedLoan.user_name}</p>
            <p className="text-gray-700 dark:text-white">Total: TZS {selectedLoan.final_amount}</p>
            <p className="text-gray-700 dark:text-white">Paid: TZS {selectedLoan.paid_amount}</p>
            <p className="text-gray-700 dark:text-white">
              Remaining: TZS {(parseFloat(selectedLoan.final_amount) - parseFloat(selectedLoan.paid_amount)).toFixed(2)}
            </p>

            <h3 className="text-sm font-semibold text-gray-700 dark:text-white">Items</h3>
            <ul className="text-gray-600 dark:text-white list-disc list-inside space-y-1">
              {saleItems.map((item) => (
                <li key={item.id}>{item.product_name} x {item.quantity} - TZS {item.total_price}</li>
              ))}
            </ul>

            <div className="mt-4 space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-white">Enter Payment Amount (TZS)</label>
              <input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
              <Button onClick={handlePayment} disabled={paying || !paymentAmount}>
                {paying ? 'Processing...' : 'Pay Loan'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
