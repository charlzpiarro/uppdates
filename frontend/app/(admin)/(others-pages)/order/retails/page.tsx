'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';

import ComponentCard from '@/components/common/ComponentCard';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Button from '@/components/ui/button/Button';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import Select from '@/components/form/Select';
import { ChevronDownIcon } from '@/icons';

interface Batch {
  id: number;
  batch_code: string;
  expiry_date: string;
  selling_price: number;
  quantity: number;
  product_details: {
    id: number;
    name: string;
  };
}

interface CartItem {
  batch_id: number;
  product_id: number;
  name: string;
  selling_price: number;
  quantity: number;
  quantity_in_stock: number;
}

interface Customer {
  id: number;
  name: string;
  phone?: string;
}

export default function POSPage() {
  const [products, setProducts] = useState<Batch[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [isLoan, setIsLoan] = useState(false);
  const [discountPercent, setDiscountPercent] = useState<number>(0);

  useEffect(() => {
    async function fetchAllData() {
      try {
        const [prodRes, custRes] = await Promise.all([
          axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/products/?in_stock_only=true`, { withCredentials: true }),
          axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/customers/`, { withCredentials: true }),
        ]);
        const batches: Batch[] = [];
        prodRes.data.forEach((prod: any) => {
          prod.batches.forEach((batch: any) => {
            batches.push({
              ...batch,
              product_details: { id: prod.id, name: prod.name },
            });
          });
        });
        setProducts(batches);
        setCustomers(custRes.data);
      } catch {
        setError('Failed to load products or customers.');
      }
    }
    fetchAllData();
  }, []);

  const today = new Date();

const filteredBatches = products
  .filter((batch) => {
    // Only batches NOT expired and match search query
    const expiryDate = new Date(batch.expiry_date);
    const isNotExpired = expiryDate >= today;

    const matchesSearch = `${batch.product_details.name} ${batch.batch_code}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase());

    return isNotExpired && matchesSearch;
  })
  .sort((a, b) => {
    // Sort by expiry date ascending (soonest first)
    return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
  });


  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(customerSearchQuery.toLowerCase())
  );

  const addToCart = (batch: Batch) => {
    if (batch.quantity === 0) {
      setError(`"${batch.product_details.name} - Batch ${batch.batch_code}" is out of stock!`);
      return;
    }
    setError(null);
    setCart((curr) => {
      const found = curr.find((item) => item.batch_id === batch.id);
      if (found) {
        if (found.quantity >= batch.quantity) {
          setError(`Cannot add more than available stock for "${batch.product_details.name} - Batch ${batch.batch_code}".`);
          return curr;
        }
        return curr.map((item) =>
          item.batch_id === batch.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...curr,
        {
          batch_id: batch.id,
          product_id: batch.product_details.id,
          name: `${batch.product_details.name} - Batch ${batch.batch_code}`,
          selling_price: batch.selling_price,
          quantity: 1,
          quantity_in_stock: batch.quantity,
        },
      ];
    });
  };

  const updateQuantity = (batchId: number, qty: number) => {
    if (isNaN(qty) || qty < 1) return;
    setCart((curr) =>
      curr.map((item) =>
        item.batch_id === batchId
          ? {
              ...item,
              quantity: qty > item.quantity_in_stock ? item.quantity_in_stock : qty,
            }
          : item
      )
    );
  };

  const removeFromCart = (batchId: number) => {
    setCart((curr) => curr.filter((item) => item.batch_id !== batchId));
  };

  const totalPrice = cart.reduce((acc, item) => acc + item.selling_price * item.quantity, 0);
  const discountAmount = totalPrice * (discountPercent / 100);
  const discountedTotal = totalPrice - discountAmount;

  const handleCreateOrder = async () => {
    if (cart.length === 0) return setError('Cart is empty!');
    if (isLoan && !selectedCustomerId) return setError('Please select a customer for loan orders.');

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const payload: any = {
        status: 'pending',
        notes: notes.trim(),
        payment_method: paymentMethod,
        items: cart.map((item) => ({
          product_id: item.product_id,
          batch_id: item.batch_id,
          quantity: item.quantity,
        })),
        is_loan: isLoan,
        discount_percent: discountPercent,
        paid_amount: discountedTotal,
      };

      if (isLoan) payload.customer_id = selectedCustomerId;

      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/orders/`,
        payload,
        { withCredentials: true }
      );

      setSuccessMsg(`Order created! Order ID: ${res.data.id}`);
      alert(`Order created! ID: ${res.data.id}`);
      setCart([]);
      setNotes('');
      setDiscountPercent(0);
      setSelectedCustomerId('');
      setIsLoan(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.response?.data?.error || 'Order creation failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageBreadcrumb pageTitle="Create Retail Sale" />
      <ComponentCard title="Retail Point of Sale">
        <div className="space-y-8">
          {/* Loan Toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="loanCheck"
              checked={isLoan}
              onChange={(e) => {
                setIsLoan(e.target.checked);
                setError(null);
              }}
              className="h-4 w-4"
            />
            <Label htmlFor="loanCheck">This is a loan sale</Label>
          </div>

          {/* Customer Search */}
          {isLoan && (
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <Label>Search Customer</Label>
                <Input
                  placeholder="Type customer name..."
                  value={customerSearchQuery}
                  onChange={(e) => setCustomerSearchQuery(e.target.value)}
                  disabled={loading}
                  className="mb-2"
                />
                <select
                  className="w-full border rounded p-2 dark:bg-dark-900 dark:text-white"
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value ? Number(e.target.value) : '')}
                  disabled={loading}
                >
                  <option value="">-- Select customer --</option>
                  {filteredCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Product Search */}
          <div>
            <Label>Search & Select Products</Label>
            <Input
              placeholder="Search products by name or batch..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={loading}
              className="mb-4"
            />
            <div className="grid grid-cols-3 gap-4 max-h-72 overflow-y-auto border border-gray-200 rounded-md p-3 dark:border-gray-700">
              {filteredBatches.map((batch) => (
                <div
                  key={batch.id}
                  className="p-3 border rounded cursor-pointer flex flex-col justify-between hover:shadow-lg dark:border-gray-700"
                  onClick={() => addToCart(batch)}
                  title={`Expiry: ${batch.expiry_date}`}
                >
                  <span className="font-medium text-gray-800 dark:text-white">
                    {batch.product_details.name} - Batch {batch.batch_code}
                  </span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {batch.selling_price.toLocaleString()} TZS
                  </span>
                  <span className={`text-xs mt-1 ${batch.quantity <= 5 ? 'text-red-600' : 'text-green-600'} dark:text-${batch.quantity <= 5 ? 'red-400' : 'green-400'}`}>
                    Stock: {batch.quantity}
                  </span>
                  <Button className="mt-3 w-full text-sm" onClick={(e) => {
                    e.stopPropagation();
                    addToCart(batch);
                  }} disabled={batch.quantity === 0 || loading}>
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
                        {item.selling_price.toLocaleString()} TZS
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
                        {(item.selling_price * item.quantity).toLocaleString()} TZS
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
                      Subtotal:
                    </td>
                    <td className="border p-2 text-right text-gray-800 dark:text-gray-200">
                      {totalPrice.toLocaleString()} TZS
                    </td>
                    <td className="border p-2"></td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="border p-2 font-semibold text-right text-gray-800 dark:text-gray-200">
                      Discount ({discountPercent}%):
                    </td>
                    <td className="border p-2 text-right text-gray-800 dark:text-gray-200">
                      -{discountAmount.toLocaleString()} TZS
                    </td>
                    <td className="border p-2"></td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="border p-2 font-bold text-right text-gray-800 dark:text-gray-200">
                      Grand Total:
                    </td>
                    <td className="border p-2 text-right font-bold text-gray-800 dark:text-gray-200">
                      {discountedTotal.toLocaleString()} TZS
                    </td>
                    <td className="border p-2"></td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          {/* Discount Field */}
          <div>
            <Label htmlFor="discount">Discount (%)</Label>
            <Input
              id="discount"
              type="number"
              placeholder="Enter discount percentage"
              value={discountPercent}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (isNaN(val)) setDiscountPercent(0);
                else if (val < 0) setDiscountPercent(0);
                else if (val > 30) setDiscountPercent(30);
                else setDiscountPercent(val);
              }}
              disabled={loading}
              min={0}
              max={30}
            />
            <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">Max discount allowed is 30%</p>
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
                onChange={(option) => setPaymentMethod(option?.valueOf)}
                className="dark:bg-dark-900"
              />
              <span className="absolute text-gray-500 -translate-y-1/2 pointer-events-none right-3 top-1/2 dark:text-gray-400">
                <ChevronDownIcon />
              </span>
            </div>
            <Button onClick={handleCreateOrder} disabled={loading || cart.length === 0}>
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
