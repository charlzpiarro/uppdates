from email.utils import parsedate
from django.shortcuts import get_object_or_404
import django_filters
from rest_framework import viewsets, permissions, filters, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from django.views.decorators.csrf import ensure_csrf_cookie
from django.http import JsonResponse
from django.db import transaction
from django.db.models import Sum, Count, F
from django.db.models.functions import TruncDay, TruncWeek, TruncMonth, TruncYear, ExtractMonth, Coalesce
from datetime import timedelta
from django.utils.timezone import now
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal, InvalidOperation
from django_filters.rest_framework import DjangoFilterBackend
from .pagination import OrderPagination, ProductPagination
from .rounding import round_two
from django_filters.rest_framework import FilterSet



from .models import (
    Category, Order, Product, StockEntry, Sale, SaleItem,
    Expense, Customer, Payment, Refund,ProductBatch 
)
from .serializers import (
    CategorySerializer, ConfirmOrderSerializer, LoanSerializer, OrderSerializer, ProductBatchSerializer, ProductSerializer, RejectOrderSerializer, SaleItemSerializer, StockEntrySerializer,
    SaleSerializer, ExpenseSerializer, CustomerSerializer,
    PaymentSerializer, RefundSerializer, UserCreateUpdateSerializer,
    MeSerializer, LoginSerializer,OrderUpdateSerializer
)
from .permissions import (
    All, IsAdminOnly, IsAdminOrReadOnly, IsCashierOnly,
    IsCashierOrAdmin, IsStaffOnly, IsStaffOrAdmin, 
)

User = get_user_model()


@ensure_csrf_cookie
def get_csrf_token(request):
    return JsonResponse({"detail": "CSRF cookie set"})


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        access = serializer.validated_data["access"]
        refresh = serializer.validated_data["refresh"]

        access_max_age = 6 * 60 * 60               # 5 minutes
        refresh_max_age = 365 * 24 * 60 * 60       # 7 days

        response = Response({
            "detail": "Login successful",
            "user": serializer.validated_data.get("user"),
        }, status=status.HTTP_200_OK)

        # Set cookies on path '/' so they're sent on all requests
        response.set_cookie(
            'access_token',
            access,
            httponly=True,
            secure=False,  # Set True in prod with HTTPS
            samesite='Lax',
            max_age=access_max_age,
            path='/'
        )
        response.set_cookie(
            'refresh_token',
            refresh,
            httponly=True,
            secure=False,
            samesite='Lax',
            max_age=refresh_max_age,
            path='/'
        )

        return response

class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        response = Response({"detail": "Logged out"}, status=status.HTTP_200_OK)

        # Clear cookies by setting empty value and max_age=0
        response.set_cookie(
            'access_token',
            '',
            httponly=True,
            secure=False,
            samesite='Lax',
            max_age=0,
            path='/'
        )
        response.set_cookie(
            'refresh_token',
            '',
            httponly=True,
            secure=False,
            samesite='Lax',
            max_age=0,
            path='/'
        )

        return response

class MeView(APIView):
    
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = MeSerializer(request.user)
        return Response(serializer.data)


# class UserViewSet(viewsets.ModelViewSet):
#     queryset = User.objects.all()
#     serializer_class = UserCreateUpdateSerializer
#     permission_classes = [IsAdminOnly]

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserCreateUpdateSerializer
    permission_classes = [IsAdminOnly]

    @action(detail=False, methods=['get'])
    def staff(self, request):
        # Example: filter users who have created orders (staff users)
        staff_users = User.objects.filter(order__isnull=False).distinct()

        serializer = self.get_serializer(staff_users, many=True)
        return Response(serializer.data)



class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAdminOrReadOnly]


class ProductFilter(FilterSet):
    out_of_stock = django_filters.BooleanFilter(method='filter_out_of_stock')

    class Meta:
        model = Product
        fields = ['category', 'out_of_stock']

    def filter_out_of_stock(self, queryset, name, value):
        if value:
            # Only products with at least one batch quantity <= 0
            return queryset.filter(batches__quantity__lte=0).distinct()
        elif value is False:
            # Only products where all batches have quantity > 0
            # Exclude products with any batch <= 0
            return queryset.exclude(batches__quantity__lte=0).distinct()
        return queryset  # value is None → return all

# Then in your ViewSet
class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [IsAdminOrReadOnly]
    filter_backends = [
        django_filters.rest_framework.DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = ProductFilter
    search_fields = ['name']
    ordering_fields = ['created_at']

    def perform_create(self, serializer):
        # Save product and rely on nested batch serializer to handle batches
        serializer.save()

    @action(detail=True, methods=['post'], url_path='add-batch', permission_classes=[IsAdminOrReadOnly])
    @transaction.atomic
    def add_batch(self, request, pk=None):
        product = self.get_object()
        data = request.data

        try:
            batch_code = data.get('batch_code')
            expiry_date = data.get('expiry_date')
            quantity = int(data.get('quantity'))
            buying_price = data.get('buying_price')
            selling_price = data.get('selling_price')
            wholesale_price = data.get('wholesale_price', 0)
        except (TypeError, ValueError):
            return Response({"detail": "Invalid data format."}, status=status.HTTP_400_BAD_REQUEST)

        if quantity <= 0:
            return Response({"detail": "Quantity must be positive."}, status=status.HTTP_400_BAD_REQUEST)

        # Ensure batch_code is unique for the product
        if ProductBatch.objects.filter(product=product, batch_code=batch_code).exists():
            return Response({"detail": f"Batch code '{batch_code}' already exists for this product."}, status=400)

        # ✅ Create new batch
        new_batch = ProductBatch.objects.create(
            product=product,
            batch_code=batch_code,
            expiry_date=expiry_date,
            buying_price=buying_price,
            selling_price=selling_price,
            wholesale_price=wholesale_price,
            recorded_by=request.user,
            quantity=0
        )

        # ✅ Update quantity
        new_batch.quantity += quantity
        new_batch.save()

        # ✅ Now log stock entry MANUALLY
        StockEntry.objects.create(
            product=product,
            batch=new_batch,  # 👈 ensures correct batch
            entry_type='added',
            quantity=quantity,
            recorded_by=request.user
        )

        return Response({
            "detail": "New batch added and stock logged.",
            "batch_id": new_batch.id,
            "batch_code": new_batch.batch_code,
            "new_quantity": new_batch.quantity,
            "expiry_date": new_batch.expiry_date,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='delete-batch', permission_classes=[IsAdminOrReadOnly])
    @transaction.atomic
    def delete_batch(self, request, pk=None):
        product = self.get_object()
        batch_id = request.data.get('batch_id')

        if not batch_id:
            return Response({"detail": "Batch ID required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            batch = product.batches.get(id=batch_id)
        except ProductBatch.DoesNotExist:
            return Response({"detail": "Batch not found for this product."}, status=status.HTTP_404_NOT_FOUND)

        # Optional: Log deletion
        if batch.quantity > 0:
            StockEntry.objects.create(
                product=product,
                batch=batch,
                entry_type='deleted',
                quantity=batch.quantity,
                recorded_by=request.user
            )

        batch.delete()

        return Response({"detail": "Batch deleted successfully."}, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['patch'], url_path='edit-batch', permission_classes=[IsAdminOrReadOnly])
    @transaction.atomic
    def edit_batch(self, request, pk=None):
        product = self.get_object()
        batch_id = request.data.get('batch_id')
        if not batch_id:
            return Response({"detail": "Batch ID required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            batch = product.batches.get(id=batch_id)
        except ProductBatch.DoesNotExist:
            return Response({"detail": "Batch not found for this product."}, status=status.HTTP_404_NOT_FOUND)

        serializer = ProductBatchSerializer(batch, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(serializer.data, status=status.HTTP_200_OK)

    
    def perform_update(self, serializer):
        # We no longer track stock on the Product level directly
        serializer.save()

    def perform_destroy(self, instance):
        # Log deletion (note: quantity is now per batch)
        for batch in instance.batches.all():
            if batch.quantity > 0:
                StockEntry.objects.create(
                    product=instance,
                    batch=batch,
                    entry_type='deleted',
                    quantity=batch.quantity,
                    recorded_by=self.request.user
                )
        instance.delete()


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [IsStaffOrAdmin]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'phone', 'email']
    ordering_fields = ['created_at', 'name']


from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import api_view, permission_classes
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def customer_purchases(request, customer_id):
    customer = get_object_or_404(Customer, id=customer_id)
    # Fetch all sale items for this customer
    # Assuming SaleItem has a foreign key to Sale, and Sale has a foreign key to Customer
    sale_items = SaleItem.objects.filter(sale__customer=customer)

    serializer = SaleItemSerializer(sale_items, many=True)
    return Response(serializer.data)


class ProductBatchViewSet(viewsets.ModelViewSet):
    queryset = ProductBatch.objects.all()
    serializer_class = ProductBatchSerializer
    permission_classes = [IsAdminOnly]  # or your custom permission

    def partial_update(self, request, *args, **kwargs):
        # This handles PATCH /api/batches/{id}/
        return super().partial_update(request, *args, **kwargs)

class PaymentViewSet(viewsets.ModelViewSet):
    queryset = Payment.objects.all()
    serializer_class = PaymentSerializer
    permission_classes = [IsCashierOrAdmin]
    filter_backends = [filters.OrderingFilter, filters.SearchFilter]
    search_fields = ['sale__id', 'cashier__username']
    ordering_fields = ['payment_date', 'amount_paid']

    def perform_create(self, serializer):
        serializer.save(cashier=self.request.user)

    def perform_update(self, serializer):
        serializer.save()


class RefundViewSet(viewsets.ModelViewSet):
    queryset = Refund.objects.all()
    serializer_class = RefundSerializer
    permission_classes = [IsCashierOrAdmin]
    filter_backends = [filters.OrderingFilter, filters.SearchFilter]
    search_fields = ['sale__id', 'refunded_by__username']
    ordering_fields = ['refund_date', 'refund_amount']

    @transaction.atomic
    def perform_create(self, serializer):
        refund = serializer.save(refunded_by=self.request.user)
        product = refund.product

        if refund.batch:
            batch = refund.batch
            batch.quantity += refund.quantity
            batch.save()
        else:
            product.quantity_in_stock += refund.quantity
            product.save()

        StockEntry.objects.create(
            product=product,
            batch=refund.batch if refund.batch else None,
            entry_type='added',
            quantity=refund.quantity,
            recorded_by=self.request.user
        )
        sale = refund.sale
        sale.refund_total = (sale.refund_total or 0) + refund.refund_amount
        sale.save()

    @transaction.atomic
    def perform_update(self, serializer):
        serializer.save()

    @transaction.atomic
    def perform_destroy(self, instance):
        product = instance.product

        if instance.batch:
            batch = instance.batch
            batch.quantity -= instance.quantity
            batch.save()
        else:
            product.quantity_in_stock -= instance.quantity
            product.save()

        sale = instance.sale
        sale.refund_total = (sale.refund_total or 0) - instance.refund_amount
        sale.save()

        instance.delete()



class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.all()
    serializer_class = OrderSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['customer__name', 'notes']
    ordering_fields = ['created_at', 'status']
    pagination_class = OrderPagination

    def get_queryset(self):
        user = self.request.user
        status = self.request.query_params.get("status", None)
        date = self.request.query_params.get("date", None)  # <-- new date param

        base_qs = Order.objects.all()

        if status:
            base_qs = base_qs.filter(status=status)

        if date:
            # Filter orders by date only (ignoring time)
            base_qs = base_qs.filter(created_at__date=date)

        if user.role in ['cashier', 'admin']:
            return base_qs.order_by("-created_at")

        return base_qs.filter(user=user).order_by("-created_at", "-id")

    def update(self, request, *args, **kwargs):
        user = request.user
        if user.role != 'admin':
            return Response({"error": "Only admin can update orders via this endpoint."}, status=403)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        user = request.user
        if user.role != 'admin':
            return Response({"error": "Only admin can delete orders via this endpoint."}, status=403)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'], permission_classes=[IsCashierOrAdmin])
    @transaction.atomic
    def confirm(self, request, pk=None):
        serializer = ConfirmOrderSerializer(
            data=request.data,
            context={'request': request, 'view': self}
        )
        serializer.is_valid(raise_exception=True)
        sale = serializer.save()
        return Response(SaleSerializer(sale).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['patch'], permission_classes=[IsStaffOrAdmin])
    def update_rejected(self, request, pk=None):
        order = self.get_object()
        serializer = OrderUpdateSerializer(order, data=request.data, partial=True)
        try:
            serializer.is_valid(raise_exception=True)
            serializer.save()
        except ValidationError as e:
            return Response({'errors': e.detail}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'errors': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], permission_classes=[IsCashierOrAdmin])
    def reject(self, request, pk=None):
        user = request.user
        order = self.get_object()

        if order.status not in ["pending", "updated"]:
            return Response({"error": "Only pending orders can be rejected."}, status=400)

        serializer = RejectOrderSerializer(
            data=request.data,
            context={'request': request, 'view': self}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response({'message': 'Order rejected successfully'}, status=200)

    @action(detail=True, methods=["post"], permission_classes=[IsStaffOrAdmin])
    def resend(self, request, pk=None):
        user = request.user
        order = self.get_object()

        if order.status != "rejected":
            return Response({"error": "Only rejected orders can be resent."}, status=400)

        order.status = "updated"
        order.save()

        return Response({"message": "Order moved back to cashier."})

    @action(detail=True, methods=["delete"], permission_classes=[IsCashierOrAdmin])
    def delete_rejected(self, request, pk=None):
        user = self.request.user
        order = self.get_object()

        if order.status != "rejected":
            return Response({"error": "Only rejected orders can be deleted."}, status=400)

        if user.role not in ['staff', 'admin']:
            return Response({"error": "Only staff can delete rejected orders."}, status=403)

        order.delete()
        return Response({"message": "Rejected order permanently deleted."}, status=204)

    

class SaleViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Sale.objects.all()
    serializer_class = SaleSerializer
    permission_classes = [IsCashierOrAdmin]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['customer__name', 'payment_method']
    ordering_fields = ['date', 'total_amount', 'status']

    def get_queryset(self):
        user = self.request.user
        qs = Sale.objects.all()

        # 🔐 Role restriction
        if user.role == 'cashier':
            qs = qs.filter(user=user)

        # 🗓 Date filtering (single date)
        date_param = self.request.query_params.get('date')
        if date_param:
            qs = qs.filter(date__date=date_param)
        else:
            qs = qs.filter(date__date=now().date())  # default: today

        return qs

    @action(detail=True, methods=['post'], permission_classes=[IsCashierOrAdmin])
    @transaction.atomic
    def refund(self, request, pk=None):
        sale = self.get_object()

        refund_window_days = 50
        refund_deadline = sale.date + timedelta(days=refund_window_days)

        if now() > refund_deadline:
            return Response({"detail": "Refund window expired. Cannot refund this sale."}, status=400)

        if sale.status == 'refunded':
            return Response({"detail": "Sale already refunded."}, status=400)

        if sale.paid_amount <= 0:
            return Response({"detail": "This sale was not paid. Cannot process refund."}, status=400)

        # 🔁 Create Refunds (stock logic handled in model)
        for item in sale.items.all():
            Refund.objects.create(
                sale=sale,
                product=item.product,
                batch=item.batch,
                quantity=item.quantity,
                refunded_by=request.user,
            )

        # 💸 Update sale status
        sale.status = 'refunded'
        sale.payment_status = 'refunded'
        sale.refund_total = sale.paid_amount
        sale.save()

        # 💳 Reverse payment record
        Payment.objects.create(
            sale=sale,
            amount_paid=-sale.paid_amount,
            cashier=request.user,
            payment_method="refund"
        )

        return Response({"detail": f"Sale refunded. Refunded amount: {sale.paid_amount} TZS"}, status=200)





class LoanViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = LoanSerializer
    permission_classes = [IsCashierOrAdmin]

    def get_queryset(self):
        queryset = Sale.objects.filter(is_loan=True).exclude(status='refunded').exclude(payment_status='paid')

        start = self.request.query_params.get('start')
        end = self.request.query_params.get('end')
        search = self.request.query_params.get('search')

        if start:
            start_date = parse_date(start)
            if start_date:
                queryset = queryset.filter(date__date__gte=start_date)
        if end:
            end_date = parse_date(end)
            if end_date:
                queryset = queryset.filter(date__date__lte=end_date)
        if search:
            queryset = queryset.filter(
                Q(customer__name__icontains=search) |
                Q(user__username__icontains=search)
            )

        return queryset

    @action(detail=True, methods=['post'], url_path='pay')
    def pay_loan(self, request, pk=None):
        sale = self.get_object()
        raw_amount = request.data.get("amount")

        if raw_amount is None:
            return Response({"error": "Amount is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            amount = Decimal(str(raw_amount).strip())
        except (InvalidOperation, ValueError, TypeError):
            return Response({"error": "Invalid amount format"}, status=status.HTTP_400_BAD_REQUEST)

        if amount <= 0:
            return Response({"error": "Amount must be greater than 0"}, status=status.HTTP_400_BAD_REQUEST)

        remaining = sale.final_amount - sale.paid_amount
        if amount > remaining:
            return Response({"error": "Payment exceeds remaining balance"}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            sale.paid_amount += amount
            sale.payment_status = "paid" if sale.paid_amount >= sale.final_amount else "partial"
            sale.save()

        return Response({"message": "Payment recorded successfully"}, status=status.HTTP_200_OK)





#Update ExpenseViewSet` to filter expenses by date range
from django.utils.dateparse import parse_date
class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [IsCashierOrAdmin]

    def get_queryset(self):
        queryset = Expense.objects.all()
        request = self.request

        # Parse start_date and end_date from query params
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')

        # Default to today if no date range provided
        today = now().date()
        start_date = parse_date(start_date_str) if start_date_str else today
        end_date = parse_date(end_date_str) if end_date_str else today

        # Normalize to datetime range
        start_datetime = make_aware(datetime.combine(start_date, datetime.min.time()))
        end_datetime = make_aware(datetime.combine(end_date, datetime.max.time()))

        return queryset.filter(date__range=(start_datetime, end_datetime)).order_by('-date')




class StockEntryFilter(django_filters.FilterSet):
    start_date = django_filters.DateFilter(field_name="date", lookup_expr='gte')
    end_date = django_filters.DateFilter(field_name="date", lookup_expr='lte')
    product = django_filters.NumberFilter(field_name="product__id")

    class Meta:
        model = StockEntry
        fields = ['start_date', 'end_date', 'product']


class StockEntryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = StockEntry.objects.all().select_related('product', 'recorded_by', 'batch').order_by('-date')
    serializer_class = StockEntrySerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter, filters.SearchFilter]
    filterset_class = StockEntryFilter
    search_fields = ['product__name', 'recorded_by__username', 'batch__batch_code']
    ordering_fields = ['date', 'quantity']

    def get_queryset(self):
        qs = super().get_queryset()
        # 🗓 Date filtering
        date_param = self.request.query_params.get('date')
        if date_param:
            qs = qs.filter(date__date=date_param)
        else:
            qs = qs.filter(date__date=now().date())  # default: today
        return qs
# REPORTS AND DASHBOARD



from django.db.models import Q, Sum, Count, F, ExpressionWrapper, DecimalField

from django.db.models.functions import TruncDay, TruncWeek, TruncMonth, TruncYear
from django.db.models import Sum, F, ExpressionWrapper, DecimalField, Q, Count
from django.utils.timezone import now
from datetime import timedelta
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import permissions


class ReportSummaryAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        period = request.query_params.get('period', 'daily').lower()
        today = now().date()

        if period == 'daily':
            start_date = today
            trunc_func = TruncDay
        elif period == 'weekly':
            start_date = today - timedelta(days=today.weekday())
            trunc_func = TruncWeek
        elif period == 'monthly':
            start_date = today.replace(day=1)
            trunc_func = TruncMonth
        elif period == 'yearly':
            start_date = today.replace(month=1, day=1)
            trunc_func = TruncYear
        else:
            return Response({"error": "Invalid period. Choose from daily, weekly, monthly, yearly."}, status=400)

        # Base queries
        base_sales_qs = Sale.objects.filter(date__date__gte=start_date)
        sales_qs = base_sales_qs.exclude(status='refunded')
        expenses_qs = Expense.objects.filter(date__gte=start_date)
        refunded_sales_qs = base_sales_qs.filter(status='refunded')
        loan_sales = sales_qs.filter(is_loan=True)

        remaining_expr = ExpressionWrapper(
            F('total_amount') - F('paid_amount'),
            output_field=DecimalField(max_digits=12, decimal_places=2)
        )

        # Totals
        total_sales = sales_qs.aggregate(total=Sum('paid_amount'))['total'] or 0
        wholesaler_sales = sales_qs.filter(sale_type='wholesale').aggregate(total=Sum('paid_amount'))['total'] or 0
        retailer_sales = sales_qs.filter(sale_type='retail').aggregate(total=Sum('paid_amount'))['total'] or 0
        total_expenses = expenses_qs.aggregate(total=Sum('amount'))['total'] or 0
        orders_count = sales_qs.aggregate(count=Count('id'))['count'] or 0

        # Stock value
        stock_buying = ProductBatch.objects.aggregate(
            total=Sum(F('quantity') * F('buying_price'))
        )['total'] or 0

        stock_selling = ProductBatch.objects.aggregate(
            total=Sum(F('quantity') * F('selling_price'))
        )['total'] or 0

        # Loan breakdown
        loan_paid = loan_sales.filter(paid_amount__gt=0)
        loan_paid_amount = loan_paid.aggregate(total=Sum('paid_amount'))['total'] or 0
        loan_paid_count = loan_paid.count()

        loan_unpaid = loan_sales.annotate(remaining=remaining_expr).filter(remaining__gt=0)
        loan_unpaid_amount = loan_unpaid.aggregate(total=Sum('remaining'))['total'] or 0
        loan_unpaid_count = loan_unpaid.count()

        # Refunds
        refund_amount = refunded_sales_qs.aggregate(total=Sum('total_amount'))['total'] or 0
        refund_count = refunded_sales_qs.count()

        # Profit calculation (confirmed + paid sales only)
        profit_expr = ExpressionWrapper(
            F('quantity') * (F('price_per_unit') - F('batch__buying_price')),
            output_field=DecimalField(max_digits=12, decimal_places=2)
        )

        wholesale_profit = SaleItem.objects.filter(
            sale__date__date__gte=start_date,
            sale__status='confirmed',
            sale__payment_status='paid',
            sale__sale_type='wholesale'
        ).annotate(profit=profit_expr).aggregate(total=Sum('profit'))['total'] or 0

        retail_profit = SaleItem.objects.filter(
            sale__date__date__gte=start_date,
            sale__status='confirmed',
            sale__payment_status='paid',
            sale__sale_type='retail'
        ).annotate(profit=profit_expr).aggregate(total=Sum('profit'))['total'] or 0

        net_profit = SaleItem.objects.filter(
            sale__date__date__gte=start_date,
            sale__status='confirmed',
            sale__payment_status='paid'
        ).annotate(profit=profit_expr).aggregate(total=Sum('profit'))['total'] or 0

        # Time series
        def group_series(queryset, value_field, label='total'):
            return queryset.annotate(period=trunc_func('date')).values('period').annotate(
                total=Sum(value_field)
            ).order_by('period')

        sales_time_series = group_series(sales_qs, 'paid_amount')
        expenses_time_series = group_series(expenses_qs, 'amount')
        loan_paid_time_series = group_series(loan_paid, 'paid_amount')
        loan_unpaid_time_series = loan_unpaid.annotate(
            period=trunc_func('date')
        ).values('period').annotate(
            remaining=Sum(remaining_expr)
        ).order_by('period')
        refund_time_series = group_series(refunded_sales_qs, 'total_amount')

        def fill_series(series_qs):
            result = {}
            for item in series_qs:
                date_key = item['period'].date().isoformat() if hasattr(item['period'], 'date') else str(item['period'])
                result[date_key] = float(item.get('total') or item.get('remaining') or 0)
            return result

        sales_data = fill_series(sales_time_series)
        expenses_data = fill_series(expenses_time_series)
        loan_paid_data = fill_series(loan_paid_time_series)
        loan_unpaid_data = fill_series(loan_unpaid_time_series)
        refund_data = fill_series(refund_time_series)

        all_dates = sorted(set(
            list(sales_data.keys()) +
            list(expenses_data.keys()) +
            list(loan_paid_data.keys()) +
            list(loan_unpaid_data.keys()) +
            list(refund_data.keys())
        ))

        def complete_data(data_dict):
            return [data_dict.get(date, 0) for date in all_dates]

        return Response({
            "period": period,
            "sales": total_sales,
            "wholesalerSales": wholesaler_sales,
            "retailerSales": retailer_sales,
            "expenses": total_expenses,
            "stockBuying": stock_buying,
            "stockSelling": stock_selling,
            "orders": orders_count,
            "profit": total_sales - total_expenses,  # gross diff, not accurate profit
            "wholesalerProfit": wholesale_profit,
            "retailerProfit": retail_profit,
            "netProfit": net_profit,
            "loss": max(0, total_expenses - total_sales),
            "loansPaid": loan_paid_amount,
            "loansPaidCount": loan_paid_count,
            "loansUnpaid": loan_unpaid_amount,
            "loansUnpaidCount": loan_unpaid_count,
            "refundAmount": refund_amount,
            "refundCount": refund_count,
            "chart": {
                "dates": all_dates,
                "sales": complete_data(sales_data),
                "expenses": complete_data(expenses_data),
                "loanPaid": complete_data(loan_paid_data),
                "loanUnpaid": complete_data(loan_unpaid_data),
                "refunds": complete_data(refund_data),
            }
        })




class RefundViewSet(viewsets.ModelViewSet):
    queryset = Refund.objects.all()
    serializer_class = RefundSerializer
    permission_classes = [IsCashierOrAdmin]
    filter_backends = [filters.OrderingFilter, filters.SearchFilter]
    search_fields = ['sale__id', 'refunded_by__username']
    ordering_fields = ['refund_date', 'refund_amount']

    @transaction.atomic
    def perform_create(self, serializer):
        # Just save, model will handle stock and refund_total updates
        serializer.save(refunded_by=self.request.user)

    @transaction.atomic
    def perform_update(self, serializer):
        # Keep it simple, no special handling for update now
        serializer.save()

    @transaction.atomic
    def perform_destroy(self, instance):
        # If you want, handle rollback of stock and refund_total here
        product = instance.product
        product.quantity_in_stock -= instance.quantity
        product.save()

        sale = instance.sale
        sale.refund_total = (sale.refund_total or 0) - instance.refund_amount
        sale.save()

        instance.delete()





class DashboardMetricsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        valid_sales = Sale.objects.exclude(status='refunded')  # 👈 Only real ones

        total_sales = valid_sales.count()
        total_revenue = valid_sales.aggregate(total=Sum('paid_amount'))['total'] or 0

        return Response({
            'total_sales': total_sales,
            'total_revenue': float(total_revenue),
        })



class MonthlySalesAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        current_year = now().year

        monthly_sales = (
            Sale.objects
            .filter(date__year=current_year)
            .exclude(status='refunded')  # 👈 kill the refunds
            .annotate(month=ExtractMonth('date'))
            .values('month')
            .annotate(total_amount=Sum('paid_amount'))
            .order_by('month')
        )

        sales_data = [0] * 12
        for entry in monthly_sales:
            sales_data[entry['month'] - 1] = float(entry['total_amount'] or 0)

        return Response({"sales": sales_data})


from datetime import datetime
from django.utils.timezone import now
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions
from django.db.models import Sum, Q
from django.db.models.functions import TruncDate
from .models import Sale  # Adjust import to your app

class SalesSummaryAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        today = now().date()
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")

        # --- Determine queryset based on date range ---
        if start_date and end_date:
            try:
                start = datetime.strptime(start_date.strip(), "%Y-%m-%d")
                end = datetime.strptime(end_date.strip(), "%Y-%m-%d")
            except ValueError:
                return Response({"error": "Invalid date format. Use YYYY-MM-DD"}, status=400)

            sales_qs = Sale.objects.filter(date__range=[start, end])
        else:
            # Default: current month
            start = today.replace(day=1)
            end = today
            sales_qs = Sale.objects.filter(date__year=today.year, date__month=today.month)

        # Exclude refunded from main sales
        sales_qs_no_refund = sales_qs.exclude(status="refunded")

        # --- Aggregated values ---
        sales = sales_qs_no_refund.aggregate(total=Sum("paid_amount"))["total"] or 0
        orders_count = sales_qs_no_refund.count()

        wholesaler_sales = sales_qs_no_refund.filter(order_type="wholesale").aggregate(total=Sum("paid_amount"))["total"] or 0
        retailer_sales = sales_qs_no_refund.filter(order_type="retail").aggregate(total=Sum("paid_amount"))["total"] or 0

        stock_buying = sales_qs_no_refund.aggregate(total=Sum("stock_buying_amount"))["total"] or 0
        stock_selling = sales_qs_no_refund.aggregate(total=Sum("total_amount"))["total"] or 0

        profit = sales_qs_no_refund.aggregate(total=Sum("profit"))["total"] or 0
        loss = sales_qs_no_refund.aggregate(total=Sum("loss"))["total"] or 0

        loans_paid = sales_qs_no_refund.filter(payment_status="paid").aggregate(total=Sum("paid_amount"))["total"] or 0
        loans_paid_count = sales_qs_no_refund.filter(payment_status="paid").count()
        loans_unpaid = sales_qs_no_refund.filter(payment_status__in=["loan", "partial"]).aggregate(total=Sum("paid_amount"))["total"] or 0
        loans_unpaid_count = sales_qs_no_refund.filter(payment_status__in=["loan", "partial"]).count()

        refund_amount = sales_qs.filter(status="refunded").aggregate(total=Sum("paid_amount"))["total"] or 0
        refund_count = sales_qs.filter(status="refunded").count()

        # --- Prepare chart data using TruncDate ---
        chart_qs = sales_qs.annotate(day=TruncDate('date')).values('day').annotate(
            total_sales=Sum('paid_amount'),
            total_expenses=Sum('expenses'),
            loan_paid=Sum('paid_amount', filter=Q(payment_status='paid')),
            loan_unpaid=Sum('paid_amount', filter=Q(payment_status__in=['loan', 'partial'])),
            refunds=Sum('paid_amount', filter=Q(status='refunded'))
        ).order_by('day')

        chart_dates = [item['day'].strftime('%Y-%m-%d') for item in chart_qs]
        chart_sales = [item['total_sales'] or 0 for item in chart_qs]
        chart_expenses = [item['total_expenses'] or 0 for item in chart_qs]
        chart_loan_paid = [item['loan_paid'] or 0 for item in chart_qs]
        chart_loan_unpaid = [item['loan_unpaid'] or 0 for item in chart_qs]
        chart_refunds = [item['refunds'] or 0 for item in chart_qs]

        return Response({
            "period": "custom" if start_date and end_date else "monthly",
            "sales": float(sales),
            "wholesalerSales": float(wholesaler_sales),
            "retailerSales": float(retailer_sales),
            "expenses": float(sum(chart_expenses)),
            "stockBuying": float(stock_buying),
            "stockSelling": float(stock_selling),
            "orders": orders_count,
            "profit": float(profit),
            "wholesalerProfit": float(wholesaler_sales),
            "retailerProfit": float(retailer_sales),
            "netProfit": float(profit - loss),
            "loss": float(loss),
            "loansPaid": float(loans_paid),
            "loansPaidCount": loans_paid_count,
            "loansUnpaid": float(loans_unpaid),
            "loansUnpaidCount": loans_unpaid_count,
            "refundAmount": float(refund_amount),
            "refundCount": refund_count,
            "chart": {
                "dates": chart_dates,
                "sales": chart_sales,
                "expenses": chart_expenses,
                "loanPaid": chart_loan_paid,
                "loanUnpaid": chart_loan_unpaid,
                "refunds": chart_refunds,
            }
        })




class RecentLoginsAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        recent_users = User.objects.filter(last_login__isnull=False).order_by('-last_login')[:5]
        data = [
            {"username": u.username, "last_login": u.last_login, "role": u.role}
            for u in recent_users
        ]
        return Response(data)


class RecentSalesAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        recent_sales = Sale.objects.exclude(status='refunded').order_by('-date')[:5]
        serializer = SaleSerializer(recent_sales, many=True)
        return Response(serializer.data)



# StockReportAPIView
class StockReportAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        period = request.query_params.get('period', 'daily').lower()
        today = now().date()
        soon_expiry_days = 180
        soon_expiry_date = today + timedelta(days=soon_expiry_days)

        # Period trunc function & start_date for time series
        if period == 'daily':
            trunc_func = TruncDay
            start_date = today - timedelta(days=30)
        elif period == 'weekly':
            trunc_func = TruncWeek
            start_date = today - timedelta(weeks=12)
        elif period == 'monthly':
            trunc_func = TruncMonth
            start_date = (today.replace(day=1) - timedelta(days=365))  # 1 year back
        elif period == 'yearly':
            trunc_func = TruncYear
            start_date = (today.replace(month=1, day=1) - timedelta(days=365*5))  # 5 years back
        else:
            return Response({"error": "Invalid period. Choose from daily, weekly, monthly, yearly."}, status=400)

        # Total stock quantity
        total_stock_qty = ProductBatch.objects.aggregate(
            total_qty=Coalesce(Sum('quantity'), 0)
        )['total_qty']

        # --- EXPIRED and SOON EXPIRING batches (full details) ---
        expired_batches = ProductBatch.objects.filter(
            expiry_date__lt=today,
            quantity__gt=0
        ).select_related('product').values(
            'id', 'batch_code', 'expiry_date', 'quantity', 'buying_price', 'product__id', 'product__name'
        )

        soon_expiring_batches = ProductBatch.objects.filter(
            expiry_date__gte=today,
            expiry_date__lt=soon_expiry_date,
            quantity__gt=0
        ).select_related('product').values(
            'id', 'batch_code', 'expiry_date', 'quantity', 'product__id', 'product__name'
        )

        # Calculate total loss from expired stock
        total_expired_loss = 0
        for batch in expired_batches:
            total_expired_loss += float(batch['buying_price']) * batch['quantity']

        # --- LOW STOCK PRODUCTS (full details) ---
        low_stock_products = Product.objects.annotate(
            total_stock=Coalesce(Sum('batches__quantity'), 0)
        ).filter(total_stock__lte=F('threshold')).values(
            'id', 'name', 'threshold', 'total_stock'
        )

        # --- MOST SOLD ITEMS ---
        most_sold_qs = SaleItem.objects.filter(
            sale__status='confirmed',
            sale__date__date__gte=start_date
        ).values('product__id', 'product__name').annotate(
            total_sold=Coalesce(Sum('quantity'), 0)
        ).order_by('-total_sold')[:10]

        # --- STOCK MOVEMENT TIME SERIES ---
        restock_qs = StockEntry.objects.filter(
            date__date__gte=start_date,
            entry_type__in=['added', 'returned']
        ).annotate(period=trunc_func('date')).values('period').annotate(
            total=Coalesce(Sum('quantity'), 0)
        ).order_by('period')

        sales_qs = SaleItem.objects.filter(
            sale__status='confirmed',
            sale__date__date__gte=start_date
        ).annotate(period=trunc_func('sale__date')).values('period').annotate(
            total=Coalesce(Sum('quantity'), 0)
        ).order_by('period')

        def qs_to_dict(qs):
            d = {}
            for e in qs:
                dt = e['period']
                key = dt.date().isoformat() if hasattr(dt, 'date') else str(dt)
                d[key] = e['total']
            return d

        restocks_data = qs_to_dict(restock_qs)
        sales_data = qs_to_dict(sales_qs)

        all_dates = sorted(set(list(restocks_data.keys()) + list(sales_data.keys())))

        response = {
            "period": period,
            "totalStockQty": total_stock_qty,
            "expiredBatches": list(expired_batches),
            "soonExpiringBatches": list(soon_expiring_batches),
            "lowStockProducts": list(low_stock_products),
            "mostSoldItems": list(most_sold_qs),
            "stockMovement": [
                {
                    "date": date,
                    "Restocked": restocks_data.get(date, 0),
                    "Sold": sales_data.get(date, 0),
                } for date in all_dates
            ],
            "totalExpiredLoss": round(total_expired_loss, 2),
        }

        return Response(response)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def edit_batch(request, product_id, batch_id):
    try:
        batch = ProductBatch.objects.get(id=batch_id, product_id=product_id)
    except ProductBatch.DoesNotExist:
        return Response({'error': 'Batch not found.'}, status=status.HTTP_404_NOT_FOUND)

    data = request.data

    # Update fields if they exist in the request
    batch.expiry_date = data.get('expiry_date', batch.expiry_date)
    batch.quantity = data.get('quantity', batch.quantity)
    batch.buying_price = data.get('buying_price', batch.buying_price)
    batch.selling_price = data.get('selling_price', batch.selling_price)
    batch.wholesale_price = data.get('wholesale_price', batch.wholesale_price)

    batch.save()

    return Response({'message': 'Batch updated successfully.'})







## Profit Report View
from main.models import SaleItem, Sale
class ProfitReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Get query params
        start_str = request.query_params.get("start")
        end_str = request.query_params.get("end")
        user_id = request.query_params.get("user_id")

        # Parse start & end dates or default to today
        try:
            if start_str:
                start_date = datetime.strptime(start_str, "%Y-%m-%d")
            else:
                start_date = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)

            if end_str:
                end_date = datetime.strptime(end_str, "%Y-%m-%d") + timedelta(days=1)
            else:
                end_date = timezone.now() + timedelta(days=1)
        except Exception:
            return Response({"detail": "Invalid date format. Use YYYY-MM-DD."}, status=400)

        # Filter sale items
        sale_items = SaleItem.objects.select_related("sale", "batch", "product").filter(
            sale__status="confirmed",
            sale__date__gte=start_date,
            sale__date__lt=end_date
        )

        # Filter by user if provided
        if user_id:
            sale_items = sale_items.filter(sale__user_id=user_id)

        # Calculate total selling price per sale (without discount)
        sale_totals = SaleItem.objects.filter(
            id__in=[item.id for item in sale_items]
        ).values("sale").annotate(
            sale_total=Sum(F("quantity") * F("batch__selling_price"), output_field=DecimalField(max_digits=12, decimal_places=2))
        )
        sale_totals_map = {item["sale"]: item["sale_total"] for item in sale_totals}

        total_selling = Decimal(0)
        total_buying = Decimal(0)
        total_profit = Decimal(0)
        product_summary = {}

        for item in sale_items:
            sale_id = item.sale_id
            sale = item.sale
            batch = item.batch
            product_name = item.product.name

            sale_total = sale_totals_map.get(sale_id) or 0
            if sale_total == 0:
                discounted_selling = 0
            else:
                item_selling_price = item.quantity * batch.selling_price
                proportion = item_selling_price / sale_total
                discounted_selling = proportion * sale.final_amount

            buying = item.quantity * batch.buying_price
            profit = discounted_selling - buying

            total_selling += discounted_selling
            total_buying += buying
            total_profit += profit

            if product_name not in product_summary:
                product_summary[product_name] = {
                    "selling_total": Decimal(0),
                    "buying_total": Decimal(0),
                    "profit": Decimal(0),
                }

            product_summary[product_name]["selling_total"] += discounted_selling
            product_summary[product_name]["buying_total"] += buying
            product_summary[product_name]["profit"] += profit

        products_list = [
            {
                "name": name,
                "selling_total": values["selling_total"],
                "buying_total": values["buying_total"],
                "profit": values["profit"],
            }
            for name, values in product_summary.items()
        ]

        return Response({
            "stockSelling": total_selling,
            "stockBuying": total_buying,
            "profit": total_profit,
            "products": products_list,
        })


# Wholesale Report View
import pytz
EAT = pytz.timezone("Africa/Nairobi")

def parsedate(date_str):
    from datetime import datetime
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except Exception:
        return None

class WholesaleReportAPIView(APIView):
    def get(self, request):
        now_utc = timezone.now()
        now_eat = now_utc.astimezone(EAT)

        # Get query params
        start = request.GET.get("start")
        end = request.GET.get("end")
        user_id = request.GET.get("user_id")

        # If no filter is passed → default to today
        start_date = parsedate(start) or now_eat.date()
        end_date = parsedate(end) or now_eat.date()

        orders = Order.objects.filter(
            order_type='wholesale',
            status='confirmed',
            created_at__date__gte=start_date,
            created_at__date__lte=end_date
        )

        if user_id:
            orders = orders.filter(user_id=user_id)

        def serialize(qs):
            result = []
            for o in qs:
                created_at_eat = o.created_at.astimezone(EAT)
                total = float(o.sale.paid_amount) if hasattr(o, 'sale') else 0
                profit = total * 0.15  # Replace with real logic
                result.append({
                    "id": o.id,
                    "user": o.user.username if o.user else "Unknown",
                    "customer": o.customer.name if o.customer else "",
                    "date": created_at_eat.strftime("%Y-%m-%d %H:%M"),
                    "discount": float(o.discount_amount),
                    "total": total,
                    "profit": profit,
                })
            return result

        return Response({"data": serialize(orders)})





from django.utils.timezone import now
from django.utils.timezone import make_aware
from datetime import timedelta, datetime
from django.db.models.functions import TruncDate

class ShortReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        start_date_str = request.GET.get('start')
        end_date_str = request.GET.get('end')

        def parse_date(date_str):
            try:
                return make_aware(datetime.strptime(date_str, '%Y-%m-%d'))
            except Exception:
                return None

        today = now().date()
        start_of_week = today - timedelta(days=today.weekday())  # Monday
        end_of_week = start_of_week + timedelta(days=6)          # Sunday

        start_date = parse_date(start_date_str) or make_aware(datetime.combine(start_of_week, datetime.min.time()))
        end_date = parse_date(end_date_str) or make_aware(datetime.combine(end_of_week, datetime.max.time()))

        # Restrict sales by role
        if user.role == 'cashier':
            sales_qs = Sale.objects.filter(user=user, date__range=(start_date, end_date))
        elif user.role == 'admin':
            sales_qs = Sale.objects.filter(date__range=(start_date, end_date))
        else:
            return Response({"detail": "Unauthorized."}, status=status.HTTP_403_FORBIDDEN)

        # Group sales by day and calculate totals
        sales_summary = (
            sales_qs
            .annotate(day=TruncDate('date'))
            .values('day')
            .annotate(
                total_sales=Sum('total_amount'),
                sales_count=Count('id'),
                retail_sales=Sum('total_amount', filter=Q(sale_type='retail')),
                wholesale_sales=Sum('total_amount', filter=Q(sale_type='wholesale')),
            )
            .order_by('day')
        )

        report = []
        grand_totals = {
            "total_sales": 0,
            "sales_count": 0,
            "retail_sales": 0,
            "wholesale_sales": 0,
        }

        for item in sales_summary:
            daily = {
                "date": item['day'].strftime('%Y-%m-%d'),
                "total_sales": item['total_sales'] or 0,
                "sales_count": item['sales_count'] or 0,
                "retail_sales": item['retail_sales'] or 0,
                "wholesale_sales": item['wholesale_sales'] or 0,
            }
            report.append(daily)

            # accumulate grand totals
            grand_totals["total_sales"] += daily["total_sales"]
            grand_totals["sales_count"] += daily["sales_count"]
            grand_totals["retail_sales"] += daily["retail_sales"]
            grand_totals["wholesale_sales"] += daily["wholesale_sales"]

        return Response({
            "start_date": start_date.strftime('%Y-%m-%d'),
            "end_date": end_date.strftime('%Y-%m-%d'),
            "report": report,
            "totals": grand_totals,
        }, status=status.HTTP_200_OK)