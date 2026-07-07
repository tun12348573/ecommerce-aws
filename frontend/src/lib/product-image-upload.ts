"use client";

import { adminPost } from "@/lib/admin-api";

type CreateProductImageUploadResponse = {
data: {
uploadUrl: string;
imageUrl: string;
objectKey: string;
expiresIn: number;
};
};

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const supportedImageTypes = new Set([
"image/jpeg",
"image/png",
"image/webp",
]);

export async function uploadProductImage(file: File): Promise<string> {
  const contentType = file.type.trim().toLowerCase();

  if (!supportedImageTypes.has(contentType)) {
    throw new Error("Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP.");
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error("Ảnh phải nhỏ hơn hoặc bằng 5 MB.");
  }

  const response = await adminPost<
    CreateProductImageUploadResponse,
    {
      fileName: string;
      contentType: string;
    }
  >("/admin/uploads/product-image", {
    fileName: file.name,
    contentType,
  });

  const uploadResponse = await fetch(response.data.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    const responseText = await uploadResponse.text();

    const s3ErrorCode =
      responseText.match(/<Code>([^<]+)<\/Code>/)?.[1] ?? "";

    throw new Error(
      `Upload ảnh thất bại. Mã phản hồi: ${uploadResponse.status}${
        s3ErrorCode ? ` (${s3ErrorCode})` : ""
      }`
    );
  }

  return response.data.imageUrl;
}
