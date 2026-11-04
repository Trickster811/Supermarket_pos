import { api } from "./api";

export interface InventoryProduct {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  pluCode: string | null;
  sellingMode: "UNIT" | "WEIGHT";
  unitOfMeasure:
    | "PIECE"
    | "PACKET"
    | "BOTTLE"
    | "BOX"
    | "KG"
    | "GRAM"
    | "LITRE";
  isActive: boolean;
  trackInventory: boolean;
}

export interface InventoryItem {
  id: string;
  productId: string;
  quantity: string | number;
  updatedAt: string;
  product: InventoryProduct;
}

export interface InventoryPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface InventoryResponse {
  data: InventoryItem[];
  pagination: InventoryPagination;
}

export interface LowStockItem {
  id: string;
  productId: string;
  quantity: string | number;
  product: {
    id: string;
    sku: string;
    name: string;
    unitOfMeasure: InventoryProduct["unitOfMeasure"];
    price: string | number;
  };
}

export interface LowStockResponse {
  threshold: string;
  data: LowStockItem[];
  count: number;
}

export interface InventoryQuery {
  search?: string;
  page?: number;
  limit?: number;
}

export async function getInventory(
  params: InventoryQuery = {},
): Promise<InventoryResponse> {
  const response = await api.get<InventoryResponse>("/inventory", {
    params,
  });

  return response.data;
}

export async function getLowStock(
  threshold: string,
): Promise<LowStockResponse> {
  const response = await api.get<LowStockResponse>("/inventory/low-stock", {
    params: { threshold },
  });

  return response.data;
}

export interface ProductStockResponse {
  product: {
    id: string;
    sku: string;
    name: string;
    unitOfMeasure: string;
    sellingMode: "UNIT" | "WEIGHT";
    trackInventory: boolean;
  };
  inventoryTracked: boolean;
  quantity: string | null;
  updatedAt: string | null;
}

export type StockMovementType = "OPENING_STOCK" | "ADJUSTMENT" | "SPOILAGE";

export interface StockAdjustmentPayload {
  productId: string;
  movementType: StockMovementType;
  quantityChange: string;
  reason: string;
}

export async function getProductStock(
  productId: string,
): Promise<ProductStockResponse> {
  const response = await api.get<ProductStockResponse>(
    `/inventory/${productId}`,
  );

  return response.data;
}

export async function createStockAdjustment(payload: StockAdjustmentPayload) {
  const response = await api.post("/inventory/adjustments", payload);
  return response.data;
}

export interface InventoryMovement {
  id: string;
  movementType: "OPENING_STOCK" | "ADJUSTMENT" | "SPOILAGE" | string;
  quantityChange: string;
  reason: string;
  createdAt: string;

  performedBy?: {
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null;

  user?: {
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null;

  terminal?: {
    name?: string | null;
    id?: string;
  } | null;
}

export interface InventoryMovementResponse {
  movements: InventoryMovement[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function getInventoryMovements(
  productId: string,
  page = 1,
  limit = 10,
): Promise<InventoryMovementResponse> {
  const response = await api.get<InventoryMovementResponse>(
    `/inventory/${productId}/movements`,
    {
      params: { page, limit },
    },
  );

  return response.data;
}

export async function getAllInventory(
  params: Omit<InventoryQuery, "page" | "limit"> = {},
): Promise<InventoryItem[]> {
  const limit = 100;
  let page = 1;
  let allItems: InventoryItem[] = [];
  let totalPages = 1;

  do {
    const response = await getInventory({
      ...params,
      page,
      limit,
    });

    allItems = [...allItems, ...response.data];
    totalPages = response.pagination.totalPages;
    page += 1;
  } while (page <= totalPages);

  return allItems;
}

export async function getAllInventoryMovements(
  productId: string,
): Promise<InventoryMovement[]> {
  const limit = 100;
  let page = 1;
  let allMovements: InventoryMovement[] = [];
  let totalPages = 1;

  do {
    const response = await getInventoryMovements(productId, page, limit);

    // Handle the different response structures.
    const rawResponse = response as unknown as {
      movements?: InventoryMovement[];
      data?:
        | InventoryMovement[]
        | {
            movements?: InventoryMovement[];
            pagination?: {
              totalPages?: number;
            };
          };
      pagination?: {
        totalPages?: number;
      };
    };

    let pageMovements: InventoryMovement[] = [];

    if (Array.isArray(rawResponse.movements)) {
      pageMovements = rawResponse.movements;
    } else if (Array.isArray(rawResponse.data)) {
      pageMovements = rawResponse.data;
    } else if (
      rawResponse.data &&
      !Array.isArray(rawResponse.data) &&
      Array.isArray(rawResponse.data.movements)
    ) {
      pageMovements = rawResponse.data.movements;
    }

    const pagination =
      rawResponse.pagination ??
      (rawResponse.data && !Array.isArray(rawResponse.data)
        ? rawResponse.data.pagination
        : undefined);

    allMovements = [...allMovements, ...pageMovements];

    totalPages =
      pagination?.totalPages ??
      (pageMovements.length === limit ? page + 1 : page);

    page += 1;
  } while (page <= totalPages);

  return allMovements;
}
