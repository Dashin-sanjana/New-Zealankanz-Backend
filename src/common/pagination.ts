export type PaginationQuery = {
  page?: number;
  limit?: number;
};

export function getPagination(query: PaginationQuery) {
  const page = Math.max(Number(query.page ?? 1), 1);
  const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  };
}

export function paginated<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
) {
  return {
    data,
    meta: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  };
}
