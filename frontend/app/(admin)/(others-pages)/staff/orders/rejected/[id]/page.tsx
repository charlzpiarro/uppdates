'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams } from 'next/navigation';
import { Loader2, Trash, Plus } from 'lucide-react';
import Button from '@/components/ui/button/Button';
import { Card, CardContent } from '@/components/ui/card';

interface Batch {
  id: number;
  batch_code: string;
  expiry_date: string;
}

interface Product {
  id: number;
  name: string;
  batches: Batch[];
}

interface OrderItem {
  id: number;
  product: Product;
  product_name: string;
  quantity: number;
  unit_price: number | string;
  batch: Batch | null;
}

interface Order {
  id: number;
  customer_name: string;
  order_type: 'retail' | 'wholesale';
  discount_percent: number;
  notes: string;
  items: OrderItem[];
}

export default function RejectedOrderDetailPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [hasSetBatches, setHasSetBatches] = useState(false);

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [orderRes, prodRes] = await Promise.all([
          axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/orders/${id}/`, { withCredentials: true }),
          axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/products/`, { withCredentials: true }),
        ]);

        const mappedOrder: Order = {
          id: orderRes.data.id,
          customer_name: orderRes.data.customer?.name || '',
          order_type: orderRes.data.order_type,
          discount_percent: Number(orderRes.data.discount_percent),
          notes: orderRes.data.notes,
          items: orderRes.data.items.map((item: any) => ({
            id: item.id,
            product: {
              id: item.product.id,
              name: item.product.name,
              batches: item.product.batches || [],
            },
            product_name: item.product.name || 'Unknown',
            quantity: item.quantity,
            unit_price: item.unit_price,
            batch: item.batch || null,
          })),
        };

        setOrder(mappedOrder);
        setProducts(prodRes.data);
      } catch {
        setError('Failed to fetch order or product data.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  useEffect(() => {
    if (order && !hasSetBatches) {
      const updatedItems = order.items.map(item => {
        if (!item.batch && item.product.batches.length > 0) {
          return { ...item, batch: item.product.batches[0] };
        }
        return item;
      });

      const needUpdate = updatedItems.some(
        (item, i) => item.batch?.id !== order.items[i].batch?.id
      );

      if (needUpdate) {
        setOrder({ ...order, items: updatedItems });
      }
      setHasSetBatches(true);
    }
  }, [order, hasSetBatches]);

  const handleQuantityChange = (itemId: number, newQty: number) => {
    if (!order || newQty < 1) return;
    const updatedItems = order.items.map(item =>
      item.id === itemId ? { ...item, quantity: newQty } : item
    );
    setOrder({ ...order, items: updatedItems });
  };

  const handleBatchChange = (itemId: number, batchId: number) => {
    if (!order) return;
    const updatedItems = order.items.map(item => {
      if (item.id === itemId) {
        const selectedBatch = item.product.batches.find(b => b.id === batchId) || null;
        return { ...item, batch: selectedBatch };
      }
      return item;
    });
    setOrder({ ...order, items: updatedItems });
  };

  const handleProductChange = (itemId: number, productId: number) => {
    if (!order) return;
    const selectedProduct = products.find(p => p.id === productId);
    if (!selectedProduct) return;

    const updatedItems = order.items.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          product: selectedProduct,
          product_name: selectedProduct.name,
          batch: selectedProduct.batches.length > 0 ? selectedProduct.batches[0] : null,
          quantity: 1,
          unit_price: 0,
        };
      }
      return item;
    });
    setOrder({ ...order, items: updatedItems });
  };

  const handleAddItem = () => {
    if (!order) return;
    const newId = Date.now() + Math.floor(Math.random() * 1000);
    const firstProduct = products[0] || { id: 0, name: '', batches: [] };
    const newItem: OrderItem = {
      id: newId,
      product: firstProduct,
      product_name: firstProduct.name,
      quantity: 1,
      unit_price: 0,
      batch: firstProduct.batches.length > 0 ? firstProduct.batches[0] : null,
    };
    setOrder({ ...order, items: [...order.items, newItem] });
  };

  const handleRemoveItem = (itemId: number) => {
    if (!order) return;
    setOrder({ ...order, items: order.items.filter(item => item.id !== itemId) });
  };

  const handleSaveChanges = async () => {
    if (!order) return;
    setSaving(true);
    setError(null);

    const invalidBatches = order.items.filter(item => !item.batch?.id);
    if (invalidBatches.length > 0) {
      setError(`Batch missing on ${invalidBatches.length} item(s). Fix before saving.`);
      setSaving(false);
      return;
    }

    const payload = {
      status: 'pending',
      notes: order.notes,
      payment_method: 'cash',
      paid_amount: order.items.reduce((total, item) => {
        const unitPrice = Number(item.unit_price) || 0;
        return total + item.quantity * unitPrice;
      }, 0),
      discount_percent: order.discount_percent,
      is_loan: false,
      items: order.items.map(item => ({
        product_id: item.product.id,
        batch_id: item.batch!.id,
        quantity: item.quantity,
      })),
    };

    try {
      await axios.patch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/orders/${order.id}/update_rejected/`,
        payload,
        { withCredentials: true }
      );
      alert('Order updated and resubmitted successfully!');
    } catch (err: any) {
      setError(
        typeof err.response?.data === 'string'
          ? err.response.data
          : JSON.stringify(err.response?.data || 'Failed to save changes.')
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="animate-spin w-8 h-8 text-primary-600" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center text-red-600 font-semibold mt-10 text-lg">
        Order not found.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto mt-10 px-4 sm:px-6 lg:px-8 space-y-8">
      <h1 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100 mb-4">
        Rejected Order #{order.id}
      </h1>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-400 bg-red-50 text-red-700 p-4 font-medium"
        >
          {error}
        </div>
      )}

      <Card className="shadow-md">
        <CardContent className="space-y-6 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div>
              <label htmlFor="customerName" className="block mb-2 font-semibold text-gray-700 dark:text-gray-300">
                Customer Name
              </label>
              <input
                id="customerName"
                type="text"
                value={order.customer_name}
                disabled
                className="w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-gray-900 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label htmlFor="orderType" className="block mb-2 font-semibold text-gray-700 dark:text-gray-300">
                Order Type
              </label>
              <select
                id="orderType"
                value={order.order_type}
                onChange={e => setOrder({ ...order, order_type: e.target.value as 'retail' | 'wholesale' })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="retail">Retail</option>
                <option value="wholesale">Wholesale</option>
              </select>
            </div>

            <div>
              <label htmlFor="discountPercent" className="block mb-2 font-semibold text-gray-700 dark:text-gray-300">
                Discount (%)
              </label>
              <input
                id="discountPercent"
                type="number"
                value={order.discount_percent}
                onChange={e => setOrder({ ...order, discount_percent: +e.target.value })}
                min={0}
                max={30}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="notes" className="block mb-2 font-semibold text-gray-700 dark:text-gray-300">
              Notes
            </label>
            <textarea
              id="notes"
              rows={3}
              value={order.notes}
              onChange={e => setOrder({ ...order, notes: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Order Items</h2>
            <Button
              onClick={handleAddItem}
              size="sm"
              variant="outline"
              className="flex items-center gap-1"
              aria-label="Add product"
            >
              <Plus className="w-4 h-4" /> Add Product
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full table-auto border-collapse border border-gray-300 dark:border-gray-700 text-sm">
              <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0">
                <tr>
                  <th className="p-3 text-left font-semibold text-gray-700 dark:text-gray-300">Product</th>
                  <th className="p-3 text-center font-semibold text-gray-700 dark:text-gray-300">Batch</th>
                  <th className="p-3 text-center font-semibold text-gray-700 dark:text-gray-300">Quantity</th>
                  <th className="p-3 text-right font-semibold text-gray-700 dark:text-gray-300">Unit Price</th>
                  <th className="p-3 text-right font-semibold text-gray-700 dark:text-gray-300">Subtotal</th>
                  <th className="p-3 text-center font-semibold text-gray-700 dark:text-gray-300">Remove</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map(item => {
                  const unitPrice = Number(item.unit_price) || 0;
                  const subtotal = item.quantity * unitPrice;

                  return (
                    <tr key={item.id} className="border-t border-gray-300 dark:border-gray-700">
                      <td className="p-2">
                        <select
                          value={item.product.id}
                          onChange={e => handleProductChange(item.id, Number(e.target.value))}
                          className="w-full rounded-md border border-gray-300 px-2 py-1 text-gray-900 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                          {products.map(prod => (
                            <option key={prod.id} value={prod.id}>
                              {prod.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2 text-center">
                        <select
                          value={item.batch?.id || ''}
                          onChange={e => handleBatchChange(item.id, Number(e.target.value))}
                          className="rounded-md border border-gray-300 px-2 py-1 text-gray-900 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                          {item.product.batches.length === 0 && (
                            <option value="" disabled>
                              No batches available
                            </option>
                          )}
                          {item.product.batches.map(batch => (
                            <option key={batch.id} value={batch.id}>
                              {batch.batch_code} ({batch.expiry_date})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={e => handleQuantityChange(item.id, +e.target.value)}
                          className="w-16 rounded-md border border-gray-300 px-2 py-1 text-center text-gray-900 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                          min={1}
                        />
                      </td>
                      <td className="p-2 text-right">{unitPrice.toFixed(2)}</td>
                      <td className="p-2 text-right">{subtotal.toFixed(2)}</td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-red-600 hover:text-red-800 transition-colors"
                          aria-label="Remove product"
                        >
                          <Trash className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end mt-6">
        <Button onClick={handleSaveChanges} disabled={saving} className="flex items-center gap-2">
          {saving ? (
            <>
              <Loader2 className="animate-spin w-5 h-5" />
              Saving...
            </>
          ) : (
            'Save Changes'
          )}
        </Button>
      </div>
    </div>
  );
}
