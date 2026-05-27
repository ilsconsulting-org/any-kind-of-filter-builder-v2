import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function createFilter(data: any) {
  validateFilter(data);
  return prisma.filter.create({ data });
}

export async function getFilters() {
  return prisma.filter.findMany({ include: { rules: true } });
}

export async function updateFilter(id: string, data: any) {
  validateFilter(data);
  return prisma.filter.update({
    where: { id },
    data,
  });
}

export async function deleteFilter(id: string) {
  return prisma.filter.delete({
    where: { id },
  });
}

function validateFilter(data: any) {
  if (!data.width || !data.height || !data.depth) {
    throw new Error("Filter dimensions are required.");
  }

  if (data.width <= 0 || data.height <= 0 || data.depth <= 0) {
    throw new Error("Dimensions must be positive.");
  }

  if (!data.systemType) {
    throw new Error("System type is required.");
  }
}