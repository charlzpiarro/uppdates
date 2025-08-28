'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, useRouter } from 'next/navigation';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import ComponentCard from '@/components/common/ComponentCard';
import Button from '@/components/ui/button/Button';
import Input from '@/components/form/input/InputField';

interface Batch {
  id: number;
  batch_code: string;
  expiry_date: string;
  buying_price: string;
  selling_price: string;
  wholesale_price: string;
  quantity: number;
}

interface Product {
  id: number;
  name: string;
}

interface OrderItem {
  id: number;
  product: Product | null;
  batch: Batch | null;
  quantity: number;
}

interface Order {
  id: number;
  user?: { username: string } | null;
  customer?: { name: string; phone?: string } | null;
  status: string;
  created_at: string;
  payment_method?: string;
  notes?: string;
  order_type: 'retail' | 'wholesale';
  discount_amount?: number; // raw discount from API
  items: OrderItem[];
}

export default function OrderDetailPage() {
  const { saleId } = useParams();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [amountPaid, setAmountPaid] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

  const fetchOrder = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/orders/${saleId}/`,
        { withCredentials: true }
      );
      setOrder(res.data);
    } catch {
      setError('Failed to fetch order details.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!order) return;

    const totalQty = order.items.reduce((acc, i) => acc + i.quantity, 0);
    const rawTotal = order.items.reduce((acc, i) => {
      const batch = i.batch;
      if (!batch) return acc;
      const price =
        order.order_type === 'wholesale'
          ? parseFloat(batch.wholesale_price)
          : parseFloat(batch.selling_price);
      return acc + price * i.quantity;
    }, 0);

    const discountAmount = order.discount_amount || 0; // raw discount
    const finalTotal = rawTotal - discountAmount;

    const itemsHtml = order.items
      .map(item => {
        if (!item.product || !item.batch) return '';
        const price =
          order.order_type === 'wholesale'
            ? parseFloat(item.batch.wholesale_price)
            : parseFloat(item.batch.selling_price);
        const subtotal = price * item.quantity;
        return `
          <tr>
            <td>${item.product.name} - ${item.batch.batch_code}</td>
            <td style="text-align:center;">${item.quantity}</td>
            <td style="text-align:right;">${price.toLocaleString()}</td>
            <td style="text-align:right;">${subtotal.toLocaleString()}</td>
          </tr>
        `;
      })
      .join('');

    const printWindow = window.open('', 'PrintReceipt', 'width=400,height=600');
    if (!printWindow) {
      alert('Popup blocked! Please allow popups for this site.');
      return;
    }

    printWindow.document.write(`
<html>
<head>
  <title>Receipt #${order.id}</title>
  <style>
    @page { size: A5; margin: 1cm; }
    body { font-family: 'Courier New', monospace; font-size: 14px; color: #000; margin:0; padding:0; }
    .receipt-container { width: 100%; max-width: 560px; margin:0 auto; padding:20px; }
    h1,h2,h3 { margin:0; text-align:center; }
    .company-info { text-align:center; margin-bottom:10px; }
    .company-info small { display:block; font-size:12px; }
    table { width:100%; border-collapse:collapse; margin-top:15px; }
    th, td { padding:6px 4px; border-bottom:1px dashed #000; font-size:13px; }
    th { border-bottom:2px solid #000; text-align:left; }
    td:nth-child(2),td:nth-child(3),td:nth-child(4) { text-align:right; }
    .totals { margin-top:15px; font-size:14px; }
    .totals div { display:flex; justify-content:space-between; padding:3px 0; }
    .underline { border-top:2px solid #000; margin-top:8px; padding-top:5px; font-weight:bold; }
    .footer { text-align:center; margin-top:30px; font-size:13px; }
  </style>
</head>
<body>
  <div class="receipt-container">
    <div class="company-info">
      <h2>WEBI PHARMACY</h2>
      <small>P.O. Box 21, Morogoro</small>
      <small>Phone: +255 757 547 163 | +2550719 482 086 </small>
      <small>Email: info@webipharmacy.co.tz</small>
    </div>

    <h3>Receipt #${order.id}</h3>

    <p>
      Date: ${new Date(order.created_at).toLocaleString()}<br/>
      Staff: ${order.user?.username || 'Unknown'}<br/>
      Customer: ${order.customer?.name || 'N/A'}<br/>
      ${order.customer?.phone ? `Phone: ${order.customer.phone}<br/>` : ''}
      Order Type: ${order.order_type.toUpperCase()}<br/>
      Payment Method: ${order.payment_method || 'N/A'}
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
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div class="totals">
      <div><span>Total Qty:</span> <span>${totalQty}</span></div>
      <div><span>Subtotal:</span> <span>${rawTotal.toLocaleString()} TZS</span></div>
      <div><span>Discount:</span> <span>- ${discountAmount.toLocaleString()} TZS</span></div>
      <div class="underline"><span>Total to Pay:</span> <span>${finalTotal.toLocaleString()} TZS</span></div>
      <div><span>Amount Paid:</span> <span>${Number(amountPaid).toLocaleString()} TZS</span></div>
      <div><span>Change:</span> <span>${(Number(amountPaid) - finalTotal).toLocaleString()} TZS</span></div>
    </div>

    <div class="footer">
      <p>Thank you for your purchase!<br/>Please come again.</p>
    </div>
  </div>
</body>
</html>
`);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  const handleReject = async () => {
    if (!order) return;
    setRejecting(true);
    setError(null);
    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/orders/${order.id}/reject/`,
        {},
        { withCredentials: true }
      );
      await fetchOrder();
      router.push('/cashier');
    } catch {
      setError('Failed to reject order.');
    } finally {
      setRejecting(false);
    }
  };

  const handleConfirm = async () => {
    if (!order || amountPaid === '') {
      setError('Please enter the amount paid.');
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/orders/${order.id}/confirm/`,
        { payment_method: 'cash', amount_paid: amountPaid },
        { withCredentials: true }
      );

      await fetchOrder();
      handlePrint();
      router.push('/cashier');
    } catch {
      setError('Failed to confirm order.');
    } finally {
      setConfirming(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [saleId]);

  if (loading) return <p className="text-gray-600 dark:text-gray-300">Loading order details...</p>;
  if (error) return <p className="text-red-600 font-semibold">{error}</p>;
  if (!order) return <p className="text-red-600 font-semibold">Order not found.</p>;

  // Totals using raw discount
  const totalQty = order.items.reduce((acc, i) => acc + i.quantity, 0);
  const rawTotal = order.items.reduce((acc, i) => {
    const batch = i.batch;
    if (!batch) return acc;
    const price =
      order.order_type === 'wholesale'
        ? parseFloat(batch.wholesale_price)
        : parseFloat(batch.selling_price);
    return acc + price * i.quantity;
  }, 0);
  const discountAmount = order.discount_amount || 0;
  const finalTotal = rawTotal - discountAmount;

  return (
    <div>
      <PageBreadcrumb pageTitle={`Order #${order.id} Details`} />

      <ComponentCard title="Order Information">
        <div className="space-y-5 text-gray-900 dark:text-gray-200">
          {/* Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-medium">
            <div><span className="text-gray-600 dark:text-gray-400">Order ID:</span> {order.id}</div>
            <div><span className="text-gray-600 dark:text-gray-400">Staff:</span> {order.user?.username || 'Unknown'}</div>
            <div><span className="text-gray-600 dark:text-gray-400">Customer:</span> {order.customer?.name || 'N/A'}</div>
            {order.customer?.phone && (
              <div><span className="text-gray-600 dark:text-gray-400">Phone:</span> {order.customer.phone}</div>
            )}
            <div><span className="text-gray-600 dark:text-gray-400">Status:</span> <span className="capitalize font-semibold">{order.status}</span></div>
            <div><span className="text-gray-600 dark:text-gray-400">Date:</span> {new Date(order.created_at).toLocaleString()}</div>
            <div><span className="text-gray-600 dark:text-gray-400">Order Type:</span> <span className="uppercase">{order.order_type}</span></div>
            <div><span className="text-gray-600 dark:text-gray-400">Payment Method:</span> {order.payment_method || 'N/A'}</div>
            {order.notes && (
              <div className="sm:col-span-2 whitespace-pre-wrap"><span className="text-gray-600 dark:text-gray-400">Notes:</span> {order.notes}</div>
            )}
          </div>

          {/* Items */}
          <div>
            <strong className="block mb-2 text-lg">Items</strong>
            <table className="w-full border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden text-sm">
              <thead className="bg-gray-100 dark:bg-gray-700">
                <tr>
                  <th className="border p-2 text-left">Product</th>
                  <th className="border p-2 text-center">Qty</th>
                  <th className="border p-2 text-right">Unit Price (TZS)</th>
                  <th className="border p-2 text-right">Subtotal (TZS)</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => {
                  if (!item.product || !item.batch) {
                    return (
                      <tr key={item.id}>
                        <td colSpan={4} className="text-center text-red-600">Missing product/batch info</td>
                      </tr>
                    );
                  }

                  const price = order.order_type === 'wholesale'
                    ? parseFloat(item.batch.wholesale_price)
                    : parseFloat(item.batch.selling_price);
                  const subtotal = price * item.quantity;

                  return (
                    <tr key={item.id}>
                      <td className="border p-2">{item.product.name} - {item.batch.batch_code}</td>
                      <td className="border p-2 text-center">{item.quantity}</td>
                      <td className="border p-2 text-right">{price.toLocaleString()}</td>
                      <td className="border p-2 text-right">{subtotal.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex flex-col sm:flex-row justify-end gap-6 mt-6 font-semibold text-lg text-gray-800 dark:text-gray-200">
            <div>Total Qty: <span className="font-normal">{totalQty}</span></div>
            <div>Subtotal: <span className="font-normal">{rawTotal.toLocaleString()} TZS</span></div>
            <div>Discount: <span className="font-normal">-{discountAmount.toLocaleString()} TZS</span></div>
            <div className="underline">Total to Pay: <span className="font-normal">{finalTotal.toLocaleString()} TZS</span></div>
          </div>

          {/* Payment Input & Debt Display */}
          <div className="mt-4 max-w-sm flex items-center space-x-4">
            {/* Debt Display on left */}
            <div className="min-w-[140px] font-semibold text-sm">
              {amountPaid.trim() !== '' && !isNaN(Number(amountPaid)) ? (
                Number(amountPaid) < finalTotal ? (
                  <span className="text-rose-600 dark:text-rose-400">
                    Debt: {(finalTotal - Number(amountPaid)).toLocaleString()} TZS
                  </span>
                ) : (
                  <span className="text-green-600 dark:text-green-400">No Debt</span>
                )
              ) : (
                <span className="text-gray-500 dark:text-gray-400">Enter amount</span>
              )}
            </div>

            {/* Amount Paid Input */}
            <div className="flex-grow">
              <label
                className="block font-medium mb-1 text-gray-700 dark:text-gray-300"
                htmlFor="amountPaid"
              >
                Amount Paid (TZS)
              </label>
              <Input
              id="amountPaid"
              type="number"
              min="0"
              step={0.01}
              placeholder="Enter amount paid (free allowed)"
              value={amountPaid}
              onChange={(e) => {
                let val = e.target.value;
                if (val === '') {
                  setAmountPaid('');
                  return;
                }
                let numVal = Number(val);
                if (isNaN(numVal)) return;
                if (numVal < 0) numVal = 0;  // no negatives
                setAmountPaid(numVal.toString());
              }}
              disabled={order.status !== 'pending' && order.status !== 'updated'}
            />

            {(order.status === 'pending' || order.status === 'updated') && (
                <Button
                  variant="primary"
                  onClick={handleReject}
                  disabled={rejecting || confirming}
                >
                  {rejecting ? 'Rejecting...' : '❌ Reject Order'}
                </Button>
              )}


            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-4 mt-6">
            <Button onClick={handleConfirm} disabled={confirming || order.status !== 'pending'&& order.status !== 'updated'}>
              {confirming ? 'Confirming...' : '✅ Confirm and Generate Sale'}
            </Button>
            <Button variant="outline" onClick={handlePrint} disabled={order.status === 'pending'}>
              🖨️ Print Receipt
            </Button>
          </div>

          {error && <p className="text-red-600 mt-3 font-semibold">{error}</p>}
        </div>
      </ComponentCard>
    </div>
  );
}
