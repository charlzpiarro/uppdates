from datetime import timedelta
from django.utils import timezone
from rest_framework import serializers
from .models import (
    Category, Customer, ProductBatch, Refund, User, Product, StockEntry,
    Sale, SaleItem, Expense, Payment,
    Order, OrderItem
)
from django.contrib.auth import authenticate
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth.models import update_last_login
from django.db import transaction
from .rounding import round_two
from decimal import Decimal, ROUND_HALF_UP


# ------------------------------ AUTH ------------------------------

class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)
    access = serializers.CharField(read_only=True)
    refresh = serializers.CharField(read_only=True)

    def validate(self, data):
        user = authenticate(username=data.get("username"), password=data.get("password"))
        if user is None or not user.is_active:
            raise serializers.ValidationError("Invalid credentials or inactive account.")
        refresh = RefreshToken.for_user(user)
        update_last_login(None, user)
        return {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": {
                "id": user.id,
                "username": user.username,
            }
        }


# ------------------------------ USER ------------------------------

class MeSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role', 'last_login', 'date_joined']


class FullUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'role', 'is_active', 'is_staff', 'is_superuser',
            'date_joined', 'last_login',
        ]
        read_only_fields = ['id', 'date_joined', 'last_login', 'is_superuser']


class UserCreateUpdateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    confirm_password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'role', 'is_active', 'last_login',
            'password', 'confirm_password',
        ]

    def validate(self, data):
        if data['password'] != data['confirm_password']:
            raise serializers.ValidationError("Passwords do not match.")
        return data

    def create(self, validated_data):
        validated_data.pop('confirm_password')
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        validated_data.pop('confirm_password', None)
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


# ------------------------------ CATEGORY & PRODUCT ------------------------------
class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name']


class ProductBatchSerializer(serializers.ModelSerializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all(), write_only=True)
    recorded_by = MeSerializer(read_only=True)
    product_details = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ProductBatch
        fields = [
            'id', 'product', 'product_details', 'batch_code', 'expiry_date',
            'buying_price', 'selling_price', 'wholesale_price',
            'quantity', 'recorded_by', 'created_at'
        ]
        read_only_fields = ['id', 'recorded_by', 'created_at']

    def get_product_details(self, obj):
        return {"id": obj.product.id, "name": obj.product.name} if obj.product else None

    def validate(self, attrs):
        product = attrs.get('product') or getattr(self.instance, 'product', None)
        batch_code = self.initial_data.get('batch_code')

        if not batch_code:
            raise serializers.ValidationError({"batch_code": "Batch code is required."})

        existing = ProductBatch.objects.filter(product=product, batch_code=batch_code)
        if self.instance:
            existing = existing.exclude(id=self.instance.id)
        if existing.exists():
            raise serializers.ValidationError({"batch_code": "This batch code already exists for the selected product."})

        return attrs

    def create(self, validated_data):
        validated_data['recorded_by'] = self.context['request'].user
        return super().create(validated_data)


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    total_stock = serializers.SerializerMethodField()
    low_stock = serializers.SerializerMethodField()
    soon_expiring_batches = serializers.SerializerMethodField()
    expired_batches = serializers.SerializerMethodField()
    batches = serializers.SerializerMethodField()  # change this

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'category', 'category_name', 'threshold',
            'created_at', 'total_stock', 'low_stock',
            'soon_expiring_batches', 'expired_batches', 'batches'
        ]

    def get_batches(self, obj):
        request = self.context.get('request')
        show_in_stock_only = request.query_params.get('in_stock_only') == 'true' if request else False
        qs = obj.batches.all()
        if show_in_stock_only:
            qs = qs.filter(quantity__gt=0)
        return ProductBatchSerializer(qs, many=True).data

    def create(self, validated_data):
        batches_data = validated_data.pop('batches', [])
        request = self.context['request']
        product = Product.objects.create(**validated_data)

        for batch in batches_data:
            ProductBatch.objects.create(
                product=product,
                recorded_by=request.user,
                **batch
            )
        return product

    # leave update() as-is unless editing batches too

    def get_total_stock(self, obj):
        return obj.total_stock()

    def get_low_stock(self, obj):
        return obj.get_low_stock()

    def get_soon_expiring_batches(self, obj):
        days = 180  # hardcoded as requested
        today = timezone.now().date()
        cutoff_date = today + timedelta(days=days)
        soon_batches = obj.batches.filter(
            expiry_date__gte=today,
            expiry_date__lt=cutoff_date,
            quantity__gt=0
        )
        return ProductBatchSerializer(soon_batches, many=True).data
    def get_expired_batches(self, obj):
        expired_batches = obj.get_expired_batches()
        return ProductBatchSerializer(expired_batches, many=True).data


# ------------------------------ CUSTOMER ------------------------------

class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ['id', 'name', 'phone', 'email', 'address', 'created_at']
        read_only_fields = ['id', 'created_at']
        


# ------------------------------ STOCK ------------------------------


class BatchMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductBatch
        fields = ['id', 'batch_code', 'expiry_date']

class StockEntrySerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all(), source='product', write_only=True)
    batch = BatchMiniSerializer(read_only=True)  # <-- Add this line here
    recorded_by = MeSerializer(read_only=True)

    class Meta:
        model = StockEntry
        fields = ['id', 'product', 'product_id', 'batch', 'entry_type', 'quantity', 'date', 'recorded_by']



# ------------------------------ ORDERS ------------------------------

class OrderItemSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    batch = ProductBatchSerializer(read_only=True)

    product_id = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(), source='product', write_only=True
    )
    batch_id = serializers.PrimaryKeyRelatedField(
        queryset=ProductBatch.objects.all(), source='batch',
        write_only=True, required=True, allow_null=False,
    )

    unit_price = serializers.DecimalField(read_only=True, max_digits=10, decimal_places=2)  # 🔍 Return it
    def get_unit_price(self, obj):
        return str(round_two(obj.unit_price))
    
    class Meta:
        model = OrderItem
        fields = ['id', 'product', 'product_id', 'batch', 'batch_id', 'quantity', 'unit_price']

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be positive.")
        return value

    def validate(self, data):
        batch = data.get('batch')
        product = data.get('product')

        if batch and batch.product != product:
            raise serializers.ValidationError("Batch does not belong to the selected product.")
        return data



class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True)
    user = MeSerializer(read_only=True)
    customer = CustomerSerializer(read_only=True)

    customer_id = serializers.PrimaryKeyRelatedField(
        queryset=Customer.objects.all(),
        source='customer',
        write_only=True,
        required=False,
        allow_null=True
    )
    customer_name = serializers.CharField(write_only=True, required=False)
    customer_phone = serializers.CharField(write_only=True, required=False)

    notes = serializers.CharField(required=False, allow_blank=True)
    order_type = serializers.CharField(default='retail')
    discount_amount = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, min_value=0, default=0
    )

    class Meta:
        model = Order
        fields = [
            'id', 'user', 'customer', 'customer_id',
            'customer_name', 'customer_phone',
            'order_type', 'status', 'notes', 'discount_amount', 'created_at', 'items'
        ]
        read_only_fields = ['id', 'user', 'status', 'created_at']

    def validate(self, data):
        order_type = data.get('order_type', 'retail')
        customer = data.get('customer')
        customer_name = self.initial_data.get('customer_name')
        customer_phone = self.initial_data.get('customer_phone')

        # Wholesale orders require customer info if no existing customer
        if order_type == 'wholesale' and not customer:
            if not customer_name or not customer_phone:
                raise serializers.ValidationError("Wholesale orders require customer name and phone.")

        # Optional: sanity check on discount_amount vs subtotal
        # if 'items' in self.initial_data:
        #     subtotal = 0
        #     for item in self.initial_data['items']:
        #         price = float(item.get('unit_price', 0))
        #         qty = float(item.get('quantity', 0))
        #         subtotal += price * qty

        #     discount = float(data.get('discount_amount', 0))
        #     if discount > subtotal:
        #         raise serializers.ValidationError("Discount cannot exceed subtotal.")

        return data

    def create(self, validated_data):
        request = self.context['request']
        items_data = validated_data.pop('items')
        order_type = validated_data.get('order_type', 'retail')
        customer = validated_data.get('customer')

        # Auto-create customer if not provided
        if not customer:
            name = self.initial_data.get('customer_name')
            phone = self.initial_data.get('customer_phone')
            if name and phone:
                customer, _ = Customer.objects.get_or_create(phone=phone, defaults={'name': name})
                validated_data['customer'] = customer
            else:
                validated_data.pop('customer', None)

        with transaction.atomic():
            order = Order.objects.create(user=request.user, **validated_data)

            order_items = []
            for item_data in items_data:
                batch = item_data.get('batch')
                product = item_data['product']
                quantity = item_data['quantity']

                if not batch:
                    raise serializers.ValidationError("Batch is required for each item.")
                if batch.product_id != product.id:
                    raise serializers.ValidationError("Batch does not belong to the selected product.")

                unit_price = batch.wholesale_price if order_type == 'wholesale' else batch.selling_price

                order_items.append(OrderItem(
                    order=order,
                    product=product,
                    batch=batch,
                    quantity=quantity,
                    unit_price=unit_price
                ))

            OrderItem.objects.bulk_create(order_items)

        return order


class OrderUpdateSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True)
    customer_id = serializers.PrimaryKeyRelatedField(
        queryset=Customer.objects.all(),
        source='customer',
        write_only=True,
        required=False,
        allow_null=True
    )
    customer_name = serializers.CharField(write_only=True, required=False)
    customer_phone = serializers.CharField(write_only=True, required=False)

    discount_amount = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, min_value=0, default=0
    )
    notes = serializers.CharField(required=False, allow_blank=True)
    order_type = serializers.CharField(required=False)

    class Meta:
        model = Order
        fields = [
            'discount_amount', 'notes', 'order_type',
            'customer_id', 'customer_name', 'customer_phone',
            'items',
        ]

    def validate(self, data):
        order_type = data.get('order_type', self.instance.order_type if self.instance else 'retail')
        customer = data.get('customer') or (self.instance.customer if self.instance else None)
        customer_name = self.initial_data.get('customer_name')
        customer_phone = self.initial_data.get('customer_phone')

        # Wholesale orders require customer info if no existing customer
        if order_type == 'wholesale' and not customer:
            if not customer_name or not customer_phone:
                raise serializers.ValidationError("Wholesale orders require customer name and phone.")

        # Optional: sanity check on discount_amount vs subtotal
        # if 'items' in self.initial_data:
        #     subtotal = 0
        #     for item in self.initial_data['items']:
        #         price = float(item.get('unit_price', 0))
        #         qty = float(item.get('quantity', 0))
        #         subtotal += price * qty

        #     discount = float(data.get('discount_amount', 0))
        #     if discount > subtotal:
        #         raise serializers.ValidationError("Discount cannot exceed subtotal.")

        return data

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)

        # Update order fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        with transaction.atomic():
            instance.save()

            if items_data is not None:
                # Delete old items first
                instance.items.all().delete()

                order_type = validated_data.get('order_type', instance.order_type)
                order_items = []

                for item_data in items_data:
                    batch = item_data.get('batch')
                    product = item_data.get('product')
                    quantity = item_data.get('quantity')

                    if not batch:
                        raise serializers.ValidationError("Batch is required for each item.")
                    if batch.product_id != product.id:
                        raise serializers.ValidationError("Batch does not belong to the selected product.")

                    unit_price = batch.wholesale_price if order_type == 'wholesale' else batch.selling_price

                    order_items.append(OrderItem(
                        order=instance,
                        product=product,
                        batch=batch,
                        quantity=quantity,
                        unit_price=unit_price,
                    ))

                OrderItem.objects.bulk_create(order_items)

        return instance






class SaleItemSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(), source='product', write_only=True
    )
    batch_id = serializers.PrimaryKeyRelatedField(
        queryset=ProductBatch.objects.all(),
        source='batch',
        write_only=True,
        required=False,
        allow_null=True,
        help_text="Batch ID to track which batch this sale item belongs to"
    )

    price_per_unit = serializers.SerializerMethodField()
    total_price = serializers.SerializerMethodField()

    class Meta:
        model = SaleItem
        fields = ['id', 'product', 'product_id', 'batch_id', 'quantity', 'price_per_unit', 'total_price']

    def get_price_per_unit(self, obj):
        return str(round_two(obj.price_per_unit))

    def get_total_price(self, obj):
        return str(round_two(obj.total_price))

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be positive.")
        return value

    def validate(self, data):
        batch = data.get('batch', None)
        product = data.get('product')

        if batch and batch.product != product:
            raise serializers.ValidationError("Batch does not belong to the selected product.")

        return data


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, read_only=True)
    user = serializers.StringRelatedField(read_only=True)
    customer = CustomerSerializer(read_only=True)

    customer_id = serializers.PrimaryKeyRelatedField(
        queryset=Customer.objects.all(),
        source='customer',
        write_only=True,
        required=False
    )
    customer_name = serializers.CharField(write_only=True, required=False)
    customer_phone = serializers.CharField(write_only=True, required=False)

    discount_amount = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, min_value=0, default=0
    )

    items_input = SaleItemSerializer(many=True, write_only=True, source='items')

    class Meta:
        model = Sale
        fields = [
            'id', 'user', 'customer', 'customer_id', 'customer_name', 'customer_phone',
            'sale_type', 'payment_status', 'status', 'is_loan',
            'total_amount', 'discount_amount', 'final_amount',
            'refund_total', 'payment_method', 'date',
            'items', 'items_input', 'paid_amount',
        ]
        read_only_fields = ['id', 'user', 'final_amount', 'refund_total', 'date']

    def validate(self, data):
        sale_type = data.get('sale_type', 'retail')
        customer = data.get('customer')
        customer_name = self.initial_data.get('customer_name')
        customer_phone = self.initial_data.get('customer_phone')

        if sale_type == 'wholesale' and not customer:
            if not customer_name or not customer_phone:
                raise serializers.ValidationError("Wholesale sales require customer name and phone.")

        # Optional sanity check: discount cannot exceed subtotal
        if 'items' in self.initial_data:
            subtotal = 0
            for item in self.initial_data['items']:
                price = float(item.get('unit_price', 0))
                qty = float(item.get('quantity', 0))
                subtotal += price * qty

            discount = float(data.get('discount_amount', 0))
            if discount > subtotal:
                raise serializers.ValidationError("Discount cannot exceed subtotal.")

        return data

    def create(self, validated_data):
        request = self.context['request']
        items_data = validated_data.pop('items')
        sale_type = validated_data.get('sale_type', 'retail')
        user = request.user

        # Handle customer logic
        customer = validated_data.pop('customer', None)
        if sale_type == 'wholesale':
            name = validated_data.pop('customer_name', None)
            phone = validated_data.pop('customer_phone', None)

            if not customer and not (name and phone):
                raise serializers.ValidationError("Wholesale sales require customer name and phone.")

            if not customer:
                customer, _ = Customer.objects.get_or_create(phone=phone, defaults={'name': name})
            validated_data['customer'] = customer
        else:
            validated_data.pop('customer', None)

        # Get discount and paid amount safely
        discount_amount = validated_data.get('discount_amount') or 0
        paid_amount = validated_data.get('paid_amount') or 0

        # Create sale instance
        sale = Sale.objects.create(user=user, **validated_data)

        total = 0
        for item_data in items_data:
            product = item_data['product']
            batch = item_data.get('batch', None)
            quantity = item_data['quantity']
            price = product.wholesale_price if sale_type == 'wholesale' else product.selling_price
            price = round_two(price)
            total_price = round_two(price * quantity)

            SaleItem.objects.create(
                sale=sale,
                product=product,
                batch=batch,
                quantity=quantity,
                price_per_unit=price,
                total_price=total_price
            )

            # Deduct stock with batch-aware logic
            if batch:
                batch.remove_stock(quantity, user)
            else:
                product.remove_stock(quantity, user)

            total += total_price

        # Round total amount
        total = round_two(total)
        # Apply raw discount amount
        final_amount = round_two(max(total - float(discount_amount), 0))

        sale.total_amount = total
        sale.discount_amount = discount_amount
        sale.final_amount = final_amount
        sale.paid_amount = paid_amount

        # Payment status logic
        if paid_amount >= final_amount:
            sale.payment_status = 'paid'
        elif paid_amount > 0:
            sale.payment_status = 'partial'
        else:
            sale.payment_status = 'not_paid'

        sale.save()
        return sale



class ConfirmOrderSerializer(serializers.Serializer):
    payment_method = serializers.CharField()
    amount_paid = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=0)

    def validate(self, data):
        order_id = self.context['view'].kwargs.get('pk')
        try:
            data['order'] = Order.objects.get(id=order_id, status__in=['pending', 'updated'])
        except Order.DoesNotExist:
            raise serializers.ValidationError("Order not found or already processed.")
        return data

    def create(self, validated_data):
        order = validated_data['order']
        cashier = self.context['request'].user
        payment_method = validated_data.get('payment_method')
        amount_paid = validated_data.get('amount_paid', Decimal('0'))

        total_amount = Decimal('0')
        for item in order.items.all():
            batch = getattr(item, 'batch', None)
            if not batch:
                raise serializers.ValidationError(f"Order item {item.id} is missing a batch.")

            # Get price from batch depending on order type
            price = batch.wholesale_price if order.order_type == 'wholesale' else batch.selling_price
            total_amount += price * item.quantity

        total_amount = round_two(total_amount)
        discount_amount = order.discount_amount or Decimal('0')
        final_amount = round_two(max(total_amount - discount_amount, Decimal('0')))

        # Determine payment status and loan flag
        if amount_paid >= final_amount:
            payment_status = 'paid'
            is_loan = False
        elif amount_paid > 0:
            payment_status = 'partial'
            is_loan = True
        else:
            payment_status = 'not_paid'
            is_loan = True

        # Create Sale
        sale = Sale.objects.create(
            order=order,
            user=cashier,
            customer=order.customer,
            total_amount=total_amount,
            discount_amount=discount_amount,
            final_amount=final_amount,
            paid_amount=amount_paid,
            payment_status=payment_status,
            payment_method=payment_method,
            status='confirmed',
            sale_type=order.order_type,
            is_loan=is_loan,
        )

        # Create SaleItems and handle stock
        for item in order.items.all():
            batch = getattr(item, 'batch', None)
            price = batch.wholesale_price if order.order_type == 'wholesale' else batch.selling_price

            SaleItem.objects.create(
                sale=sale,
                product=item.product,
                batch=batch,
                quantity=item.quantity,
                price_per_unit=round_two(price),
                total_price=round_two(price * item.quantity),
            )

            # Update batch quantity
            batch.remove_stock(item.quantity, cashier)

        # Record Payment if any
        if amount_paid > 0:
            Payment.objects.create(
                sale=sale,
                amount_paid=amount_paid,
                cashier=cashier,
                payment_method=payment_method,
            )
            sale.update_paid_amount()

        # Finalize order
        order.status = 'confirmed'
        order.save()

        return sale


class RejectOrderSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)

    def validate(self, data):
        order_id = self.context['view'].kwargs.get('pk')
        try:
            data['order'] = Order.objects.get(id=order_id, status__in=['pending', 'updated'])
        except Order.DoesNotExist:
            raise serializers.ValidationError("Order not found or already processed.")
        return data

    def create(self, validated_data):
        order = validated_data['order']
        order.status = 'rejected'
        order.save()
        # optionally log a reason somewhere if needed
        return order


class LoanSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = [
            'id',
            'customer_name',
            'user_name',
            'date',
            'total_amount',
            'final_amount',
            'paid_amount',
            'payment_status',
            'is_loan',
        ]

    def get_customer_name(self, obj):
        return obj.customer.name if obj.customer else "retail customer"

    def get_user_name(self, obj):
        return obj.user.username if obj.user else "Unknown"


class PaymentSerializer(serializers.ModelSerializer):
    cashier = serializers.HiddenField(default=serializers.CurrentUserDefault())

    class Meta:
        model = Payment
        fields = ['id', 'sale', 'amount_paid', 'payment_date', 'cashier', 'payment_method']
        read_only_fields = ['payment_date']


class RefundSerializer(serializers.ModelSerializer):
    refunded_by = MeSerializer(read_only=True)
    product = ProductSerializer(read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all(), source='product', write_only=True)

    batch_id = serializers.PrimaryKeyRelatedField(
        queryset=ProductBatch.objects.all(),
        source='batch',
        write_only=True,
        required=False,
        allow_null=True,
        help_text="Batch to which the refund applies"
    )

    class Meta:
        model = Refund
        fields = [
            'id', 'sale', 'product', 'product_id', 'batch_id', 'quantity',
            'refund_amount', 'reason', 'refunded_by', 'refund_date'
        ]
        read_only_fields = ['id', 'refund_date', 'refunded_by']

    def validate(self, attrs):
        sale = attrs.get('sale')
        quantity = attrs.get('quantity')
        product = attrs.get('product')

        if sale.payment_status not in ['paid', 'partial']:
            raise serializers.ValidationError("Refund allowed only on sales with payment status 'paid' or 'partial'.")

        refund_deadline = sale.date + timedelta(days=10)
        if timezone.now() > refund_deadline:
            raise serializers.ValidationError("Refund period expired (more than 5 days since sale).")

        sale_item = sale.items.filter(product=product).first()
        if not sale_item:
            raise serializers.ValidationError("Product was not part of the sale.")

        if quantity != sale_item.quantity:
            raise serializers.ValidationError("Partial refunds are not allowed. Refund full quantity of the product.")

        return attrs

    def create(self, validated_data):
        validated_data['refunded_by'] = self.context['request'].user
        return super().create(validated_data)


class ExpenseSerializer(serializers.ModelSerializer):
    recorded_by = MeSerializer(read_only=True)

    class Meta:
        model = Expense
        fields = ['id', 'description', 'amount', 'category', 'date', 'recorded_by']




class PurchaseSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name')
    date = serializers.DateTimeField(source='sale.created_at', format='%Y-%m-%dT%H:%M:%S%z')

    class Meta:
        model = SaleItem
        fields = ['id', 'product_name', 'quantity', 'price_per_unit', 'total_price', 'date']
