from rest_framework.routers import DefaultRouter
from django.urls import include, path

from .views import (
    CategoryViewSet, DashboardMetricsView, LoanViewSet, LogoutView, MeView, MonthlySalesAPIView, ProductBatchViewSet, ProfitReportView,
    RecentLoginsAPIView, RecentSalesAPIView, ReportSummaryAPIView,
    SalesSummaryAPIView, ShortReportView, StockEntryViewSet, StockReportAPIView, UserViewSet,
    ProductViewSet, SaleViewSet, ExpenseViewSet,
    PaymentViewSet, RefundViewSet, CustomerViewSet,
    LoginView, WholesaleReportAPIView, customer_purchases, get_csrf_token, OrderViewSet  # <-- Added OrderViewSet here
)

router = DefaultRouter()

router.register(r'users', UserViewSet, basename='user')            # uniform basename singular
router.register(r'products', ProductViewSet, basename='product')
router.register(r'sales', SaleViewSet, basename='sale')
router.register(r'loans', LoanViewSet, basename='loans')
router.register(r'expenses', ExpenseViewSet, basename='expense')
router.register(r'categories', CategoryViewSet, basename='category')
router.register(r'stock-entries', StockEntryViewSet, basename='stockentry')

router.register(r'customers', CustomerViewSet, basename='customer')
router.register(r'payments', PaymentViewSet, basename='payment')
router.register(r'refunds', RefundViewSet, basename='refund')

router.register(r'orders', OrderViewSet, basename='order')  # <-- Add orders router
router.register(r'customers', CustomerViewSet, basename='customers')
router.register(r'batches', ProductBatchViewSet, basename='batch') 

# Main API URLs
urlpatterns = router.urls

# Additional API paths
urlpatterns += [
    path('auth/login/', LoginView.as_view(), name='auth-login'),
    path('api/csrf-token/', get_csrf_token, name='csrf-token'),
    path('me/', MeView.as_view(), name='me'),

    # Reports & dashboard
    path('reports/summary/', ReportSummaryAPIView.as_view(), name='report-summary'),
    path('reports/summary/stock/', StockReportAPIView.as_view(), name='report-summary-stock'),
    path('reports/profit/', ProfitReportView.as_view(), name='report-profit'),
    path('reports/wholesale/', WholesaleReportAPIView.as_view(), name='report-wholesale'),
    path('report/short/', ShortReportView.as_view(), name='short-report'),
    path('dashboard/metrics/', DashboardMetricsView.as_view(), name='dashboard-metrics'),
    path('dashboard/monthly-sales/', MonthlySalesAPIView.as_view(), name='monthly-sales'),
    path('dashboard/sales-summary/', SalesSummaryAPIView.as_view(), name='sales-summary'),
    path('dashboard/recent-logins/', RecentLoginsAPIView.as_view(), name='recent-logins'),
    path('dashboard/recent-orders/', RecentSalesAPIView.as_view(), name='recent-sales'),
    path('customers/<int:customer_id>/purchases/', customer_purchases, name='customer-purchases'),
    path('auth/logout/', LogoutView.as_view(), name='auth-logout'),
]


# path("api/wholesale-report/", get_wholesale_report),
# 