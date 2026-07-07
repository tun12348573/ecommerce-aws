import { randomUUID } from "node:crypto";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
region: process.env.AWS_REGION,
});

const allowedImageTypes: Record<string, string> = {
"image/jpeg": "jpg",
"image/png": "png",
"image/webp": "webp",
};

export class ProductImageUploadError extends Error {
constructor(message: string) {
super(message);
this.name = "ProductImageUploadError";
}
}

type CreateProductImageUploadInput = {
fileName: string;
contentType: string;
};

type ProductImageUploadResult = {
uploadUrl: string;
imageUrl: string;
objectKey: string;
expiresIn: number;
};

function getRequiredEnv(name: string): string {
const value = process.env[name];

if (!value) {
throw new ProductImageUploadError(`${name} is missing.`);
}

return value;
}

export async function createProductImageUploadUrl(
input: CreateProductImageUploadInput
): Promise<ProductImageUploadResult> {
const fileName = input.fileName.trim();
const contentType = input.contentType.trim().toLowerCase();

if (!fileName) {
throw new ProductImageUploadError("Tên file ảnh không hợp lệ.");
}

const extension = allowedImageTypes[contentType];

if (!extension) {
throw new ProductImageUploadError(
"Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP."
);
}

const bucketName = getRequiredEnv("PRODUCT_IMAGES_BUCKET");

const rawImageBaseUrl = getRequiredEnv("PRODUCT_IMAGES_BASE_URL");

const imageBaseUrl = rawImageBaseUrl.endsWith("/")
? rawImageBaseUrl.slice(0, -1)
: rawImageBaseUrl;

const objectKey = `uploads/products/${randomUUID()}.${extension}`;

const uploadCommand = new PutObjectCommand({
Bucket: bucketName,
Key: objectKey,
});

const expiresIn = 300;

const uploadUrl = await getSignedUrl(s3Client, uploadCommand, {
expiresIn,
});

return {
uploadUrl,
imageUrl: `${imageBaseUrl}/${objectKey}`,
objectKey,
expiresIn,
};
}
