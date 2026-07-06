# AWS Shop — E-commerce Platform on AWS

Web bán hàng full-stack triển khai theo kiến trúc serverless trên AWS.

## Chức năng chính

### Khách hàng

- Xem danh sách và chi tiết sản phẩm.
- Tìm kiếm, lọc và sắp xếp sản phẩm.
- Giỏ hàng và checkout.
- Đăng ký, đăng nhập bằng Amazon Cognito.
- Xem lịch sử đơn hàng và chi tiết đơn.
- Theo dõi đơn hàng.
- Thanh toán ZaloPay Sandbox.
- Hủy đơn hàng khi đủ điều kiện.
- Nhận email thông báo đơn hàng, thanh toán, giao hàng, hoàn tiền và hết hạn thanh toán.

### Quản trị viên

- Đăng nhập khu vực Admin bằng Cognito riêng.
- Quản lý sản phẩm.
- Upload ảnh sản phẩm bằng S3 Presigned URL.
- Quản lý đơn hàng và trạng thái đơn.
- Cập nhật hãng vận chuyển và mã tracking.
- Dashboard doanh thu.
- Quản lý hoàn tiền ZaloPay.

### Hệ thống AWS

- Next.js static frontend trên S3 private + CloudFront.
- Backend Node.js/Express chạy trên AWS Lambda.
- API Gateway HTTP API.
- DynamoDB cho sản phẩm và đơn hàng.
- Cognito riêng cho Admin và Customer.
- SES gửi email giao dịch.
- SNS + CloudWatch Alarm cảnh báo vận hành.
- EventBridge Scheduler đối soát hoàn tiền và tự hủy đơn ZaloPay quá hạn.
- DynamoDB Point-in-Time Recovery.
- S3 Versioning.
- GitHub Actions CI kiểm tra backend, frontend và SAM template.

---

## Kiến trúc

```text
Browser
   |
   v
CloudFront
   |
   v
S3 Private Bucket
   |
   +----------------------+
                          |
                          v
                    API Gateway
                          |
                          v
                     AWS Lambda
                          |
      +-------------------+-------------------+
      |                   |                   |
      v                   v                   v
  DynamoDB           Amazon SES        Secrets Manager
      |
      v
Products / Orders

Cognito
  |- Admin User Pool
  |- Customer User Pool

EventBridge Scheduler
  |- Refund reconciliation
  |- ZaloPay payment expiry reconciliation

CloudWatch + SNS
  |- Lambda errors
  |- API 5xx errors
  |- Scheduler errors
```

Công nghệ sử dụng

| Thành phần     | Công nghệ                          |
| -------------- | ---------------------------------- |
| Frontend       | Next.js 16, React 19, TypeScript   |
| Backend        | Node.js, Express, TypeScript       |
| Deploy backend | AWS Lambda + API Gateway + AWS SAM |
| Database       | Amazon DynamoDB                    |
| Authentication | Amazon Cognito                     |
| Storage        | Amazon S3                          |
| CDN            | Amazon CloudFront                  |
| Email          | Amazon SES                         |
| Monitoring     | Amazon CloudWatch + Amazon SNS     |
| Payment        | ZaloPay Sandbox                    |
| CI             | GitHub Actions                     |

```
Cấu trúc thư mục

ecommerce-aws/
├── frontend/                 # Next.js frontend
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── next.config.ts
│
├── backend/                  # Express + Lambda backend
│   ├── src/
│   │   ├── repositories/
│   │   ├── services/
│   │   ├── jobs/
│   │   ├── types/
│   │   ├── lambda.ts
│   │   ├── server.ts
│   │   ├── refund-scheduler.ts
│   │   └── payment-expiry-scheduler.ts
│   └── package.json
│
├── infrastructure/
│   └── template.yaml         # AWS SAM / CloudFormation
│
├── docs/                     # Tài liệu kiến trúc và deploy
│
└── .github/
    └── workflows/
        └── ci.yml            # GitHub Actions CI
```

Trạng thái đơn hàng

| Trạng thái   | Ý nghĩa                 |
| ------------ | ----------------------- |
| `PROCESSING` | Đơn mới tạo, đang xử lý |
| `SHIPPING`   | Đang giao hàng          |
| `COMPLETED`  | Đã giao thành công      |
| `CANCELLED`  | Đơn đã hủy              |

```
Luồng hợp lệ

PROCESSING → SHIPPING → COMPLETED
PROCESSING → CANCELLED
SHIPPING → CANCELLED

Đơn ZaloPay chưa thanh toán không thể chuyển sang SHIPPING hoặc COMPLETED.
```

Chạy frontend local

cd frontend
npm install
npm run dev

Mở:

http://localhost:3000

Build production:

npm run build

```
Chạy backend local

cd backend
npm install
npm run dev

Build TypeScript:

npm run build
```

Biến môi trường frontend

Tạo file:

frontend/.env.local

Ví dụ:

NEXT_PUBLIC_API_URL=https://YOUR_API_ID.execute-api.ap-southeast-1.amazonaws.com/prod

NEXT_PUBLIC_COGNITO_REGION=ap-southeast-1
NEXT_PUBLIC_COGNITO_CLIENT_ID=YOUR_ADMIN_COGNITO_CLIENT_ID

NEXT_PUBLIC_CUSTOMER_COGNITO_REGION=ap-southeast-1
NEXT_PUBLIC_CUSTOMER_COGNITO_CLIENT_ID=YOUR_CUSTOMER_COGNITO_CLIENT_ID

Không commit file .env.local.

```
Build và deploy backend bằng AWS SAM

Di chuyển vào thư mục infrastructure:

cd infrastructure

Validate template:

sam validate

Build:

sam build

Deploy:

sam deploy \
  --stack-name ecommerce-aws-backend \
  --region ap-southeast-1 \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    ProductsTableName=EcommerceProducts \
    OrdersTableName=EcommerceOrders \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset
```

Deploy frontend lên S3 và CloudFront

Build frontend:

cd frontend
npm run build

Upload output static:

aws s3 sync ./out/ s3://YOUR_FRONTEND_BUCKET --delete

Tạo CloudFront invalidation:

aws cloudfront create-invalidation \
 --distribution-id YOUR_CLOUDFRONT_DISTRIBUTION_ID \
 --paths "/\*"

```
GitHub Actions CI

Workflow:

.github/workflows/ci.yml

Mỗi lần push vào branch master, CI tự chạy:

Backend TypeScript build
Frontend Next.js build
SAM validate and build

Repository Variables cần có:

NEXT_PUBLIC_API_URL
NEXT_PUBLIC_COGNITO_REGION
NEXT_PUBLIC_COGNITO_CLIENT_ID
NEXT_PUBLIC_CUSTOMER_COGNITO_REGION
NEXT_PUBLIC_CUSTOMER_COGNITO_CLIENT_ID

```

Bảo mật đã áp dụng

S3 bucket private, CloudFront dùng Origin Access Control.
S3 Versioning bật.
DynamoDB Point-in-Time Recovery bật.
Cognito tách Admin và Customer User Pool.
Admin MFA TOTP ở chế độ Optional.
API CORS giới hạn origin.
Security headers cho API và CloudFront.
Rate limit các endpoint nhạy cảm.
ZaloPay secret lưu trong AWS Secrets Manager.
DynamoDB transaction khi tạo đơn và hoàn tồn kho.
Callback ZaloPay có kiểm tra trạng thái và điều kiện tránh xử lý trùng.
CloudWatch Alarm gửi cảnh báo qua SNS.

```
Milestones

 Product catalog và product detail.
 Cart và checkout.
 DynamoDB product/order management.
 Cognito Admin và Customer authentication.
 ZaloPay Sandbox payment.
 Order shipping và tracking.
 Refund management và refund reconciliation.
 SES email notifications.
 ZaloPay payment expiry reconciliation.
 Dynamic catalog trên CloudFront.
 Monitoring, alerting, backup và security hardening.
 GitHub Actions CI.
 Hoàn thiện Infrastructure as Code cho DynamoDB tables và GSIs.
 AWS WAF rate-based rules.
 SES production access sau khi có domain.
 Automated deployment pipeline.
```

Lưu ý

Không commit .env, AWS credentials, ZaloPay secret hoặc private key.
SES hiện có thể đang ở Sandbox; chỉ gửi mail được tới email đã verify.
ZaloPay đang dùng môi trường Sandbox.
Frontend dùng static export và được phục vụ qua CloudFront.

Sau đó chạy:

```powershell
cd C:\Users\namda\ecommerce-aws
git add README.md
git commit -m "Add project architecture and deployment documentation"
git push
```
