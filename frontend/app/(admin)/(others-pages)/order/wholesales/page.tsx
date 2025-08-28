'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';

import ComponentCard from '@/components/common/ComponentCard';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import { ChevronDownIcon } from '@/icons';
import Button from '@/components/ui/button/Button';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';

interface ProductBatch {
  id: number;
  batch_code: string;
  expiry_date: string;
  wholesale_price: number;
  quantity: number;
  product: {
    id: number;
    name: string;
  };
}

interface CartItem {
  product_id: number;
  batch_id: number;
  name: string;
  wholesale_price: number;
  quantity_in_stock: number;
  quantity: number;
}

interface Customer {
  id: number;
  name: string;
  phone?: string;
}

export default function WholesalePOSPage() {
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const CART_KEY = 'wholesale_cart';

  const [cart, setCart] = useState<CartItem[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(CART_KEY);
      return stored ? JSON.parse(stored) : [];
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  const [selectedCustomerId, setSelectedCustomerId] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [discountAmount, setDiscountAmount] = useState<number>(0); // raw TZS now
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [productSearchQuery, setProductSearchQuery] = useState('');

  useEffect(() => {
    fetchAllData();
  }, []);

  async function fetchAllData() {
    try {
      const [prodRes, custRes] = await Promise.all([
        axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/products/?in_stock_only=true`, {
          withCredentials: true,
        }),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/customers/`, {
          withCredentials: true,
        }),
      ]);

      const allBatches: ProductBatch[] = [];
      prodRes.data.forEach((prod: any) => {
        prod.batches.forEach((batch: any) => {
          allBatches.push({
            id: batch.id,
            batch_code: batch.batch_code,
            expiry_date: batch.expiry_date,
            wholesale_price: Number(batch.wholesale_price),
            quantity: batch.quantity,
            product: {
              id: prod.id,
              name: prod.name,
            },
          });
        });
      });

      setBatches(allBatches);
      setCustomers(custRes.data);
    } catch {
      setError('Failed to load products or customers.');
    }
  }

  const today = new Date();

  const filteredBatches = batches
    .filter((batch) => {
      const expiryDate = new Date(batch.expiry_date);
      const notExpired = expiryDate >= today;

      const matchesSearch =
        batch.product.name.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
        batch.batch_code.toLowerCase().includes(productSearchQuery.toLowerCase());

      return notExpired && matchesSearch;
    })
    .sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());

  const addToCart = (batch: ProductBatch) => {
    if (batch.quantity === 0) {
      setError(`"${batch.product.name} - Batch ${batch.batch_code}" is out of stock!`);
      return;
    }
    setError(null);
    setCart((curr) => {
      const found = curr.find((item) => item.batch_id === batch.id);
      if (found) {
        if (found.quantity >= batch.quantity) {
          setError(`Cannot add more than available stock for "${batch.product.name} - Batch ${batch.batch_code}".`);
          return curr;
        }
        return curr.map((item) =>
          item.batch_id === batch.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...curr,
        {
          product_id: batch.product.id,
          batch_id: batch.id,
          name: `${batch.product.name} - Batch ${batch.batch_code}`,
          wholesale_price: batch.wholesale_price,
          quantity_in_stock: batch.quantity,
          quantity: 1,
        },
      ];
    });
  };

  const updateQuantity = (batchId: number, qty: number) => {
    if (isNaN(qty) || qty < 1) return;
    const batch = batches.find((b) => b.id === batchId);
    if (!batch) return;
    setCart((curr) =>
      curr.map((item) =>
        item.batch_id === batchId
          ? { ...item, quantity: qty > batch.quantity ? batch.quantity : qty }
          : item
      )
    );
  };

  const removeFromCart = (batchId: number) => {
    setCart((curr) => curr.filter((item) => item.batch_id !== batchId));
  };

  const totalPrice = cart.reduce((acc, item) => acc + item.wholesale_price * item.quantity, 0);

  const handleCreateOrder = async () => {
    if (cart.length === 0) {
      setError('Cart is empty!');
      return;
    }
    if (!selectedCustomerId) {
      setError('Please select a customer.');
      return;
    }

    // Ensure discount does not exceed total
    if (discountAmount < 0 || discountAmount > totalPrice) {
      setError('Discount must be between 0 and total cart value.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const payload = {
        status: 'pending',
        notes: notes.trim(),
        payment_method: paymentMethod,
        discount_amount: discountAmount, // raw TZS now
        customer_id: selectedCustomerId,
        order_type: 'wholesale',
        items: cart.map((item) => ({
          product_id: item.product_id,
          batch_id: item.batch_id,
          quantity: item.quantity,
        })),
      };

      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/orders/`,
        payload,
        { withCredentials: true }
      );

      setSuccessMsg(`Order created! Order ID: ${res.data.id}. Waiting for cashier confirmation.`);
      alert(`Order created! ID: ${res.data.id}. Ready for cashier confirmation.`);

      const customer = customers.find((c) => c.id === selectedCustomerId);
      printInvoice(res.data, cart, customer, discountAmount, paymentMethod);

      setCart([]);
      localStorage.removeItem(CART_KEY);
      setNotes('');
      setDiscountAmount(0); // reset raw discount
      setSelectedCustomerId('');
    } catch (err: any) {
      if (!err.response) {
        setError('Network error: Please check your connection.');
      } else {
        setError(err.response.data?.detail || err.response.data?.error || 'Order creation failed.');
      }
    } finally {
      setLoading(false);
    }
  };


  
  const printInvoice = (
  order: any,
  cartItems: CartItem[],
  customer: Customer | undefined,
  discountAmount: number, // now raw TZS
  paymentMethod: string
) => {
  const rawTotal = cartItems.reduce((acc, item) => acc + item.wholesale_price * item.quantity, 0);
  const finalTotal = rawTotal - discountAmount;

  const itemsHtml = cartItems.map(item => `
    <tr>
      <td>${item.name}</td>
      <td style="text-align:center;">${item.quantity}</td>
      <td style="text-align:right;">${item.wholesale_price.toLocaleString()} TZS</td>
      <td style="text-align:right;">${(item.wholesale_price * item.quantity).toLocaleString()} TZS</td>
    </tr>
  `).join('');

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(`
    <html>
  <head>
    <title>Invoice #${order.id}</title>
    <style>
      body {
        font-family: 'Segoe UI', Tahoma, sans-serif;
        font-size: 12px;
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        color: #333;
        background: #fff;
      }

      .header {
        text-align: center;
        padding-bottom: 10px;
        border-bottom: 2px solid #0f9d58;
      }

      .header h1 {
        font-size: 26px;
        font-weight: bold;
        margin: 0;
      }

      .header span.green {
        color: #0f9d58;
      }

      .header span.black {
        color: #000;
      }

      .company-info {
        text-align: center;
        margin-top: 5px;
        font-size: 12px;
      }

      h2 {
        text-align: center;
        margin-top: 30px;
        font-size: 20px;
      }

      .meta {
        margin: 20px 0;
        font-size: 14px;
      }

      .meta p {
        margin: 3px 0;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 15px;
      }

      table thead {
        background-color: #f0f0f0;
      }

      table th, table td {
        border: 1px solid #ccc;
        padding: 8px;
        text-align: left;
      }

      table th {
        background-color: #0f9d58;
        color: white;
        text-align: center;
      }

      table td:nth-child(2),
      table td:nth-child(3),
      table td:nth-child(4) {
        text-align: center;
      }

      .totals {
        margin-top: 20px;
        font-size: 12px;
        float: right;
        width: 300px;
      }

      .totals div {
        display: flex;
        justify-content: space-between;
        padding: 5px 0;
        border-bottom: 1px solid #ddd;
      }

      .totals .grand {
        font-weight: bold;
        font-size: 14px;
        border-top: 2px solid #0f9d58;
        border-bottom: 2px solid #0f9d58;
        padding: 8px 0;
      }

      .footer {
        clear: both;
        margin-top: 40px;
        text-align: center;
        font-size: 12px;
        color: #666;
      }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>
        <span class="green">WEBI</span> <span class="black">PHARMACY</span>
      </h1>
      <div class="company-info">
        Phone: +255 757 547 163 | +255 719 482 086 | Address: Dummila,Morogoro, TZ
      </div>
    </div>

    <h2>Invoice #${order.id}</h2>

    <div class="meta">
      <p>Date: ${new Date().toLocaleString()}</p>
      <p>Customer: ${customer?.name || 'N/A'}</p>
      ${customer?.phone ? `<p>Phone: ${customer.phone}</p>` : ''}
      <p>Payment Method: ${paymentMethod.toUpperCase()}</p>
    </div>

    <table>
      <thead>
        <tr>
          <th>Product</th>
          <th>Qty</th>
          <th>Unit Price</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div class="totals">
      <div><span>Subtotal:</span><span>${rawTotal.toLocaleString()} TZS</span></div>
      <div><span>Discount (${discountAmount} TZS):</span><span>- ${discountAmount.toLocaleString()} TZS</span></div>
      <div class="grand"><span>Total:</span><span>${finalTotal.toLocaleString()} TZS</span></div>
    </div>

    <div class="footer">
      Thank you for your purchase!<br/>
      Powered by Webi Systems
    </div>

    <script>
      window.onload = function() {
        setTimeout(() => {
          window.print();
          window.close();
        }, 500);
      }
    </script>
  </body>
</html>

  `);
  printWindow.document.close();
};


  const handleAddCustomer = async () => {
    const name = prompt('Enter customer name:');
    if (!name || !name.trim()) {
      alert('Customer name is required.');
      return;
    }
    const phone = prompt('Enter customer phone (optional):')?.trim();

    setLoading(true);
    setError(null);

    try {
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/customers/`,
        { name: name.trim(), phone },
        { withCredentials: true }
      );
      await fetchAllData();
      setSelectedCustomerId(res.data.id);
      setSuccessMsg(`Customer "${res.data.name}" added.`);
    } catch (err: any) {
      if (!err.response) {
        setError('Network error: Could not add customer.');
      } else {
        setError(err.response.data?.detail || 'Failed to add customer.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageBreadcrumb pageTitle="Create Wholesale Order" />
      <ComponentCard title="Wholesale Point of Sale">
        <div className="space-y-8">

          {/* Customer Search + Add Customer */}
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <Label>Search Customer</Label>
              <Input
                type="text"
                placeholder="Type customer name..."
                className="mb-2"
                value={customerSearchQuery}
                onChange={(e) => setCustomerSearchQuery(e.target.value)}
                disabled={loading}
              />
              <select
                className="w-full border rounded p-2 dark:bg-dark-900 dark:text-white"
                value={selectedCustomerId}
                onChange={(e) => {
                  setSelectedCustomerId(e.target.value ? Number(e.target.value) : '');
                  setError(null);
                }}
                disabled={loading}
              >
                <option value="">-- Select customer --</option>
                {customers
                  .filter((c) =>
                    c.name.toLowerCase().includes(customerSearchQuery.toLowerCase())
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Product Search & Display */}
          <div>
            <Label>Search & Select Products</Label>
            <Input
              type="text"
              placeholder="Search products or batch..."
              value={productSearchQuery}
              onChange={(e) => setProductSearchQuery(e.target.value)}
              disabled={loading}
              className="mb-4"
            />
            <div className="grid grid-cols-3 gap-4 max-h-72 overflow-y-auto border border-gray-200 rounded-md p-3 dark:border-gray-700">
              {filteredBatches.map((batch) => (
                <div
                  key={batch.id}
                  className="p-3 border rounded cursor-pointer flex flex-col justify-between hover:shadow-lg dark:border-gray-700"
                  onClick={() => addToCart(batch)}
                  title={`Price: ${batch.wholesale_price.toLocaleString()} TZS | Stock: ${batch.quantity}`}
                >
                  <span className="font-medium text-gray-800 dark:text-white">
                    {batch.product.name} - Batch {batch.batch_code}
                  </span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {batch.wholesale_price.toLocaleString()} TZS
                  </span>
                  <span
                    className={`text-xs mt-1 ${
                      batch.quantity <= 5
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-green-600 dark:text-green-400'
                    }`}
                  >
                    Stock: {batch.quantity}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Expiry: {batch.expiry_date}
                  </span>
                  <Button
                    className="mt-3 w-full text-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      addToCart(batch);
                    }}
                    disabled={batch.quantity === 0 || loading}
                  >
                    {batch.quantity === 0 ? 'Out of stock' : 'Add to Cart'}
                  </Button>
                </div>
              ))}
              {filteredBatches.length === 0 && (
                <p className="col-span-3 text-center text-gray-500 dark:text-gray-400">No products found.</p>
              )}
            </div>
          </div>

          {/* Cart Table */}
          <div>
            <Label>Cart</Label>
            {cart.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-300">Your cart is empty.</p>
            ) : (
              <table className="w-full border-collapse border border-gray-300 rounded-md dark:border-gray-700">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-800">
                    <th className="border p-2 text-left text-gray-700 dark:text-gray-200">Product</th>
                    <th className="border p-2 text-right text-gray-700 dark:text-gray-200">Unit Price</th>
                    <th className="border p-2 text-center text-gray-700 dark:text-gray-200">Quantity</th>
                    <th className="border p-2 text-right text-gray-700 dark:text-gray-200">Total</th>
                    <th className="border p-2 text-center text-gray-700 dark:text-gray-200">Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item) => (
                    <tr key={item.batch_id}>
                      <td className="border p-2 text-gray-800 dark:text-gray-200">{item.name}</td>
                      <td className="border p-2 text-right text-gray-800 dark:text-gray-200">
                        {item.wholesale_price.toLocaleString()} TZS
                      </td>
                      <td className="border p-2 text-center w-24">
                        <Input
                          type="number"
                          min="1"
                          max={item.quantity_in_stock.toString()}
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.batch_id, parseInt(e.target.value))}
                          disabled={loading}
                          className="text-center"
                        />
                      </td>
                      <td className="border p-2 text-right text-gray-800 dark:text-gray-200">
                        {(item.wholesale_price * item.quantity).toLocaleString()} TZS
                      </td>
                      <td className="border p-2 text-center">
                        <button
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-bold"
                          onClick={() => removeFromCart(item.batch_id)}
                          aria-label={`Remove ${item.name} from cart`}
                          disabled={loading}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3} className="border p-2 font-semibold text-right text-gray-800 dark:text-gray-200">
                      Grand Total:
                    </td>
                    <td className="border p-2 text-right font-semibold text-gray-800 dark:text-gray-200">
                      {totalPrice.toLocaleString()} TZS
                    </td>
                    <td className="border p-2"></td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          {/* Discount Field */}
          <div>
            <Label>Discount</Label>
            <Input
              type="number"
              min={0}
              max={totalPrice}
              value={discountAmount}
              onChange={(e) => setDiscountAmount(Number(e.target.value))}
              disabled={loading}
            />
          </div>

          {/* Notes Field */}
          <div>
            <Label htmlFor="notes">Order Notes (optional)</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={loading}
              className="w-full border rounded p-2 dark:bg-dark-900 dark:text-white"
              rows={3}
              placeholder="Add any notes or instructions for the order"
            />
          </div>

          {/* Payment + Submit */}
          <div className="flex items-center gap-4">
            <Label htmlFor="paymentMethod">Payment Method</Label>
            <div className="relative w-48">
              <Select
                id="paymentMethod"
                options={[
                  { value: 'cash', label: 'Cash' },
                  { value: 'mobile_money', label: 'Mobile Money' },
                  { value: 'card', label: 'Card' },
                ]}
                placeholder="Select payment"
                value={paymentMethod}
                onChange={(option: any) => setPaymentMethod(option.value)} // fixed this
                className="dark:bg-dark-900"
              />
              <span className="absolute text-gray-500 -translate-y-1/2 pointer-events-none right-3 top-1/2 dark:text-gray-400">
                <ChevronDownIcon />
              </span>
            </div>
            <Button onClick={handleCreateOrder} disabled={loading || cart.length === 0 || !selectedCustomerId}>
              {loading ? 'Processing...' : 'Create Order'}
            </Button>
          </div>

          {error && <p className="text-red-600 dark:text-red-400 mt-3 font-semibold">{error}</p>}
          {successMsg && <p className="text-green-600 dark:text-green-400 mt-3 font-semibold">{successMsg}</p>}
        </div>
      </ComponentCard>
    </div>
  
  );
  
  
}
