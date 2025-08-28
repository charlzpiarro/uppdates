'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash } from 'lucide-react';
import axios from 'axios';
import { Modal } from '@/components/ui/modal';
import { useAuth } from '@/context/auth-context';
import { getCookie } from 'cookies-next';
import ProductForm1 from '@/components/ProductInventory/ProductForm';
import AddBatchForm from '@/components/AddBatchForm/AddBatchForm'; // adjust path as needed

interface RecordedBy {
  id: number;
  username: string;
}

interface Batch {
  id: number;
  batch_code: string;
  expiry_date: string;
  buying_price: string;
  selling_price: string;
  wholesale_price: string;
  quantity: number;
  recorded_by: RecordedBy;
}

interface Product {
  expired_batches: any;
  soon_expiring_batches: any;
  id: number;
  name: string;
  total_stock: number;
  threshold: number;
  buying_price?: string;
  selling_price?: string;
  wholesale_price?: string;
  created_at: string;
  category: number | null;
  category_name?: string;
  batches: Batch[];
}

interface Category {
  id: number;
  name: string;
}

export default function ProductsPage() {
  const { user, loading: authLoading } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);

  const [editBatchModalOpen, setEditBatchModalOpen] = useState(false);
  const [currentBatch, setCurrentBatch] = useState<Batch | null>(null);
  const [editBatchValues, setEditBatchValues] = useState({
    expiry_date: '',
    quantity: 0,
    buying_price: '',
    selling_price: '',
    wholesale_price: '',
  });


  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/products/`, { withCredentials: true });
      setProducts(res.data);
    } catch (err) {
      console.error('Error fetching products', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/categories/`, { withCredentials: true });
      setCategories(res.data);
    } catch (err) {
      console.error('Error fetching categories', err);
    }
  };

  const filteredProducts = products
    .filter(product =>
      product.name.toLowerCase().includes(search.toLowerCase()) &&
      (selectedCategory ? product.category === selectedCategory : true)
    )
    .sort((a, b) => a.total_stock - b.total_stock);

  const isAdmin = user?.role === 'admin';

  const openAddModal = () => {
    setCurrentProduct(null);
    setAddModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setCurrentProduct(product);
    setEditModalOpen(true);
  };

  const openDeleteModal = (product: Product) => {
    setCurrentProduct(product);
    setDeleteModalOpen(true);
  };

  const openBatchModal = (product: Product) => {
    setCurrentProduct(product);
    setBatchModalOpen(true);
  };


  const handleEditBatch = async () => {
    console.log("🚀 Payload being sent:", {
  ...editBatchValues,
  batch_id: currentBatch?.id,
});

  if (!currentBatch || !currentProduct) return;

  try {
    let csrf = await getCookie('csrftoken');
    if (typeof csrf === 'object' && csrf !== null && typeof (csrf as any).then === 'function') csrf = await csrf;
    csrf = csrf || '';

    await axios.patch(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/batches/${currentBatch.id}/`,
      {
        ...editBatchValues,
        batch_id: currentBatch.id,
        batch_code: currentBatch.batch_code,
      },
      {
        withCredentials: true,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrf,
        },
      }
    );

    alert('Batch updated successfully.');
    setEditBatchModalOpen(false);
    fetchProducts(); // Refresh product list
  } catch (err: any) {
    console.error('Failed to update batch:', err?.response?.data || err);
    alert('Error updating batch. Check console for more.');
  }
};

  const handleAddProduct = async (data: Partial<Product>) => {
    try {
      let csrfToken = getCookie("csrftoken");
      if (csrfToken instanceof Promise) csrfToken = await csrfToken;
      csrfToken = csrfToken || "";

      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/products/`,
        data,
        {
          withCredentials: true,
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrfToken as string,
          },
        }
      );
      setAddModalOpen(false);
      fetchProducts();
    } catch (err) {
      console.error('Failed to add product:', err);
    }
  };

  const handleEditProduct = async (data: Partial<Product>) => {
    if (!currentProduct) return;
    try {
      await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/products/${currentProduct.id}/`,
        data,
        { withCredentials: true }
      );
      setEditModalOpen(false);
      fetchProducts();
    } catch (err) {
      console.error('Failed to edit product:', err);
    }
  };

  const handleDeleteProduct = async () => {
    if (!currentProduct) return;
    try {
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/products/${currentProduct.id}/`,
        { withCredentials: true }
      );
      setDeleteModalOpen(false);
      fetchProducts();
    } catch (err) {
      console.error('Failed to delete product:', err);
    }
  };

  const handleUpdateStock = async (product: Product) => {
    const quantity = prompt(`Enter quantity to add to "${product.name}" stock:`);

    if (!quantity) return;
    const amount = parseInt(quantity);
    if (isNaN(amount) || amount <= 0) {
      alert("Please enter a valid positive number.");
      return;
    }

    try {
      let csrfToken = getCookie("csrftoken");
      if (csrfToken instanceof Promise) csrfToken = await csrfToken;
      csrfToken = csrfToken || "";

      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/products/${product.id}/update_stock/`,
        { quantity: amount },
        {
          withCredentials: true,
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrfToken,
          },
        }
      );
      fetchProducts();
    } catch (err) {
      console.error("Failed to update stock:", err);
      alert("Error updating stock. Check logs.");
    }
  };

  return (
    <div className="space-y-6 text-sm p-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-xl font-bold text-gray-800 dark:text-white">Product Inventory</h1>
        {isAdmin && (
          <button onClick={openAddModal} className="inline-flex items-center gap-2 rounded-md bg-brand-400 px-4 py-2 text-white hover:bg-green-400 focus:outline-none focus:ring-2 focus:ring-green-400 dark:focus:ring-green-600">
            <Plus size={16} strokeWidth={2} /> Add Product
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product name..."
          className="w-full sm:w-64 rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-white/40"
        />

        <select
          value={selectedCategory || ''}
          onChange={(e) => setSelectedCategory(e.target.value ? parseInt(e.target.value) : null)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/5">
        <div className="max-w-full overflow-x-auto">
          <div className="min-w-[950px]">
            <table className="w-full text-left">
              <thead className="bg-gray-50 dark:bg-white/10">
                <tr>
                  <th className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300">Product</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300">Category</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300">Total Stock</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300">Buying Price</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300">Retail Price</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300">Wholesale Price</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300">Created At</th>
                  {isAdmin && <th className="px-5 py-3 text-xs font-medium text-gray-600 dark:text-gray-300">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                {loading ? (
                  <tr><td colSpan={isAdmin ? 8 : 7} className="px-5 py-4 text-center text-gray-500 dark:text-gray-400">Loading...</td></tr>
                ) : filteredProducts.length === 0 ? (
                  <tr><td colSpan={isAdmin ? 8 : 7} className="px-5 py-4 text-center text-gray-500 dark:text-gray-400">No matching products found.</td></tr>
                ) : (
                  filteredProducts.map((product) => (
                    <React.Fragment key={product.id}>
                      <tr className="hover:bg-gray-50 dark:hover:bg-white/10">
                        <td className="px-5 py-4 text-gray-700 dark:text-white">{product.name}</td>
                        <td className="px-5 py-4 text-gray-700 dark:text-white">{product.category_name || 'Uncategorized'}</td>
                        <td className="px-5 py-4 space-y-1">
                          <div>
                            <span className={`inline-block px-2 py-1 rounded-md text-xs font-semibold ${
                              product.total_stock === 0
                                ? 'bg-red-100 text-red-700 dark:bg-red-800/20 dark:text-red-400'
                                : product.total_stock <= product.threshold
                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800/20 dark:text-yellow-400'
                                : 'bg-green-100 text-green-700 dark:bg-green-800/20 dark:text-green-400'
                            }`}>
                              {product.total_stock}{' '}
                              {product.total_stock === 0
                                ? '(Out of stock)'
                                : product.total_stock <= product.threshold
                                ? '(Low stock)'
                                : '(In stock)'}
                            </span>
                          </div>

                          {/* ✅ Soon Expiry Badge */}
                          {product.soon_expiring_batches.length > 0 && (
                            <div>
                              <span className="inline-block rounded-md bg-yellow-200 text-yellow-900 texxs px-2 py-0.5 dark:bg-yellow-800 dark:text-yellow-100">
                                {product.soon_expiring_batches.length} batch{product.soon_expiring_batches.length > 1 ? 'es' : ''} expiring soon
                              </span>
                            </div>
                          )}

                          {/* ✅ Expired Batch Badge */}
                          {product.expired_batches.length > 0 && (
                            <div>
                              <span className="inline-block rounded-md bg-red-200 text-red-900 text-xs px-2 py-0.5 dark:bg-red-800 dark:text-red-100">
                                {product.expired_batches.length} expired batch{product.expired_batches.length > 1 ? 'es' : ''}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4 text-gray-700 dark:text-white">TZS{product.batches[0]?.buying_price || '-'}</td>
                        <td className="px-5 py-4 text-gray-700 dark:text-white">TZS{product.batches[0]?.selling_price || '-'}</td>
                        <td className="px-5 py-4 text-gray-700 dark:text-white">TZS{product.batches[0]?.wholesale_price || '-'}</td>
                        <td className="px-5 py-4 text-gray-700 dark:text-white">
                          {new Intl.DateTimeFormat('en-GB', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          }).format(new Date(product.created_at))}
                        </td>
                        {isAdmin && (
                          <td className="px-5 py-4 space-x-2">
                            <button
                              onClick={() => openEditModal(product)}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-white/10"
                            >
                              <Pencil size={14} /> Edit
                            </button>
                            <button
                              onClick={() => openBatchModal(product)}
                              className="inline-flex items-center gap-1 rounded-md border border-blue-400 px-2 py-1 text-sm text-blue-600 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-800/20"
                            >
                              <Plus size={14} /> Add Batch
                            </button>
                            <button
                              onClick={() => openDeleteModal(product)}
                              className="inline-flex items-center gap-1 rounded-md border border-red-400 px-2 py-1 text-sm text-red-600 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-800/20"
                            >
                              <Trash size={14} /> Delete
                            </button>
                          </td>
                        )}
                      </tr>

                      {/* Batch rows */}
                      {product.batches.map((batch) => {
              const expiry = new Date(batch.expiry_date);
              const now = new Date();
              const diffInDays = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

              let badgeClass = 'bg-green-100 text-green-700 dark:bg-green-800/20 dark:text-green-400';
              let badgeText = 'Valid';

              if (diffInDays < 0) {
                badgeClass = 'bg-red-100 text-red-700 dark:bg-red-800/30 dark:text-red-400';
                badgeText = 'Expired';
              } else if (diffInDays <= 180) {
                badgeClass = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-700/30 dark:text-yellow-300';
                badgeText = `Expiring Soon in ${diffInDays} days`;
              }

              const handleDeleteBatch = async () => {
                if (!confirm(`Delete batch "${batch.batch_code}"? This cannot be undone.`)) return;

                try {
                  const csrf = await getCookie('csrftoken');
                  await axios.post(
                    `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/products/${product.id}/delete-batch/`,
                    { batch_id: batch.id },
                    {
                      withCredentials: true,
                      headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': csrf || '',
                      },
                    }
                  );

                  alert("Batch deleted successfully.");
                  fetchProducts(); // ⚠️ Make sure you have this or similar to reload product data
                } catch (err: any) {
                  console.error("Failed to delete batch:", err?.response?.data || err);
                  alert("Error deleting batch. Check console for more.");
                }
              };




              return (
                <tr key={batch.id} className="bg-gray-50 dark:bg-white/5">
                  <td colSpan={isAdmin ? 8 : 7} className="px-6 py-4 relative">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm text-gray-800 dark:text-gray-100">

                      {/* Batch Code */}
                      <div>
                        <span className="font-medium text-gray-600 dark:text-gray-400">Batch Code:</span>
                        <span className="ml-1 font-semibold">{batch.batch_code}</span>
                      </div>

                      {/* Expiry */}
                      <div>
                        <span className="font-medium text-gray-600 dark:text-gray-400">Expiry Date:</span>
                        <span className="ml-1 font-semibold">{expiry.toLocaleDateString()}</span>
                      </div>

                      {/* Quantity */}
                      <div>
                        <span className="font-medium text-gray-600 dark:text-gray-400">Quantity:</span>
                        <span className="ml-1 font-semibold">{batch.quantity}</span>
                      </div>

                      {/* Prices */}
                      <div>
                        <span className="font-medium text-gray-600 dark:text-gray-400">Buying Price:</span>
                        <span className="ml-1 font-semibold">TZS {batch.buying_price}</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600 dark:text-gray-400">Selling Price:</span>
                        <span className="ml-1 font-semibold">TZS {batch.selling_price}</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600 dark:text-gray-400">Wholesale Price:</span>
                        <span className="ml-1 font-semibold">TZS {batch.wholesale_price}</span>
                      </div>

                      {/* Recorded By */}
                      <div>
                        <span className="font-medium text-gray-600 dark:text-gray-400">Recorded By:</span>
                        <span className="ml-1 font-semibold">{batch.recorded_by.username}</span>
                      </div>

                      {/* Expiry Status Badge */}
                      <div className="sm:col-span-2 lg:col-span-1 flex items-center justify-between">
                        <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}>
                          {badgeText}
                        </span>

                        {/* Delete & Edit Batch Buttons (Only for admin) */}
                        {isAdmin && (
                          <React.Fragment>
                            <button
                              onClick={handleDeleteBatch}
                              className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 ml-4"
                              title="Delete Batch"
                            >
                              🗑️
                            </button>
                            <button
                              onClick={() => {
                                setCurrentProduct(product);  // <-- add this line
                                setCurrentBatch(batch);
                                setEditBatchValues({
                                  expiry_date: batch.expiry_date,
                                  quantity: batch.quantity,
                                  buying_price: batch.buying_price,
                                  selling_price: batch.selling_price,
                                  wholesale_price: batch.wholesale_price,
                                });
                                setTimeout(() => setEditBatchModalOpen(true), 10);
                              }}
                              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 ml-4"
                              title="Edit Batch"
                            >
                              ✏️
                            </button>



                          </React.Fragment>
                        )}

                        


                      
                      </div>
                    </div>
                  </td>
                </tr>
              );
                      })}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      

    {/* Edit Batch Modal */}
    <div>
      <Modal isOpen={editBatchModalOpen} onClose={() => setEditBatchModalOpen(false)} className="max-w-md p-6">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Edit Batch</h2>

          <div>
            <label className="block text-sm font-medium">Expiry Date</label>
            <input
              type="date"
              value={editBatchValues.expiry_date}
              onChange={(e) => setEditBatchValues({ ...editBatchValues, expiry_date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Quantity</label>
            <input
              type="number"
              value={editBatchValues.quantity}
              onChange={(e) => setEditBatchValues({ ...editBatchValues, quantity: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Buying Price</label>
            <input
              type="text"
              value={editBatchValues.buying_price}
              onChange={(e) => setEditBatchValues({ ...editBatchValues, buying_price: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Selling Price</label>
            <input
              type="text"
              value={editBatchValues.selling_price}
              onChange={(e) => setEditBatchValues({ ...editBatchValues, selling_price: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Wholesale Price</label>
            <input
              type="text"
              value={editBatchValues.wholesale_price}
              onChange={(e) => setEditBatchValues({ ...editBatchValues, wholesale_price: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button
              className="bg-gray-300 text-gray-800 px-4 py-2 rounded-md"
              onClick={() => setEditBatchModalOpen(false)}
            >
              Cancel
            </button>
            <button
              className="bg-green-600 text-white px-4 py-2 rounded-md"
              onClick={handleEditBatch}
            >
              Save Changes
            </button>
          </div>
        </div>
      </Modal>
      </div>



      {/* Add / Edit / Delete Modals */}
      <Modal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} className="max-w-md p-6">
        <ProductForm
          categories={categories}
          onSubmit={handleAddProduct}
          onCancel={() => setAddModalOpen(false)}
        />
      </Modal>
      <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} className="max-w-md p-6">
        {currentProduct && (
          <ProductForm
            categories={categories}
            product={currentProduct}
            onSubmit={handleEditProduct}
            onCancel={() => setEditModalOpen(false)}
          />
        )}
      </Modal>
      <Modal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} className="max-w-sm p-6">
        <div className="text-center">
          <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white">Confirm Delete</h3>
          <p className="mb-6 text-gray-600 dark:text-gray-300">
            Are you sure you want to delete <strong>{currentProduct?.name}</strong>?
          </p>
          <div className="flex justify-center gap-4">
            <button onClick={() => setDeleteModalOpen(false)} className="rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-white/10">Cancel</button>
            <button onClick={handleDeleteProduct} className="rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700 dark:hover:bg-red-800">Delete</button>
          </div>
        </div>
      </Modal>

      {/* Batch Modal */}
      <Modal isOpen={batchModalOpen} onClose={() => setBatchModalOpen(false)} className="max-w-md p-6">
        {currentProduct && (
          <AddBatchForm
            productId={currentProduct.id}
            onClose={() => {
              setBatchModalOpen(false);
              fetchProducts();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

// Include your ProductForm component unchanged
// ...


function ProductForm({
  categories,
  product,
  onSubmit,
  onCancel,
}: {
  categories: Category[];
  product?: Product | null;
  onSubmit: (data: Partial<Product>) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    name: product?.name || '',
    threshold: product?.threshold || 0,
    category: product?.category || null,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        name === 'total_stock' || name === 'threshold'
          ? Number(value)
          : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
        {product ? 'Edit Product' : 'Add Product'}
      </h2>
      <div>
        <label className="block mb-1 font-medium text-gray-700 dark:text-gray-300">Name</label>
        <input
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
        />
      </div>
      <div>
        <label className="block mb-1 font-medium text-gray-700 dark:text-gray-300">Threshold</label>
        <input
          name="threshold"
          type="number"
          value={formData.threshold}
          onChange={handleChange}
          required
          min={0}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
        />
      </div>
      <div>
        <label className="block mb-1 font-medium text-gray-700 dark:text-gray-300">Category</label>
        <select
          name="category"
          value={formData.category || ''}
          onChange={handleChange}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
        >
          <option value="">Uncategorized</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex justify-end gap-4 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-white/10"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700 dark:hover:bg-green-800"
        >
          {product ? 'Save Changes' : 'Add Product'}
        </button>
      </div>
    </form>
  );
}
